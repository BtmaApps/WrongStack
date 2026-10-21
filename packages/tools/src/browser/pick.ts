/** Fixed browser-side read program. Only validated numeric coordinates are inserted. */
export function browserPointExpression(x: number, y: number): string {
  if (![x, y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
    throw new Error('Browser coordinates must be finite fractions from 0 to 1');
  return `(${INSPECT_POINT})(${JSON.stringify({ x, y })})`;
}

const INSPECT_POINT = `({x,y}) => {
  const width = innerWidth, height = innerHeight;
  let element = document.elementFromPoint(Math.min(width-1, x*width), Math.min(height-1, y*height));
  if (!element) throw new Error('No visible element at this point');
  for (let depth=0; depth<16 && element.shadowRoot; depth++) {
    const next = element.shadowRoot.elementFromPoint(Math.min(width-1,x*width), Math.min(height-1,y*height));
    if (!next || next === element) break;
    element = next;
  }
  const selectorFor = (node) => {
    const parts = [];
    for (let depth=0; node && depth<32; depth++) {
      const root = node.getRootNode();
      if (node.id && root.querySelectorAll('#'+CSS.escape(node.id)).length === 1) {
        parts.unshift('#'+CSS.escape(node.id));
        if (root.host) { parts.unshift('>>'); node = root.host; continue; }
        break;
      }
      const tag = node.localName;
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter((child) => child.localName === tag) : [node];
      parts.unshift(tag+(siblings.length>1 ? ':nth-of-type('+(siblings.indexOf(node)+1)+')' : ''));
      if (node.parentElement) { parts.unshift('>'); node = node.parentElement; }
      else if (root.host) { parts.unshift('>>'); node = root.host; }
      else break;
    }
    if (parts[0] === '>' || parts[0] === '>>') parts.shift();
    return parts.join(' ');
  };
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const styles = {};
  for (const key of ['display','position','color','background-color','font-family','font-size','font-weight','padding','margin','border','border-radius','gap','align-items','justify-content'])
    styles[key] = style.getPropertyValue(key).slice(0,200);
  const privateField = element.closest('input,textarea,[contenteditable]');
  return { selector:selectorFor(element).slice(0,2048), tag:element.localName,
    role:(element.getAttribute('role')||'').slice(0,100),
    text:privateField ? '' : (element.innerText || '').slice(0,1000), styles,
    bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}, viewport:{width,height} };
}`;
