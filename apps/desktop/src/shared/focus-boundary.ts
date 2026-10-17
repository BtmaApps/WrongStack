export type FocusDirection = 'forward' | 'backward';

export interface FocusBoundaryTransport {
  request(direction: FocusDirection): Promise<boolean>;
  onFocus(listener: (direction: FocusDirection) => void): () => void;
}

function visible(element: HTMLElement): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(parent);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    ) {
      return false;
    }
    if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) {
      const summary = parent.querySelector('summary');
      if (!summary?.contains(element)) return false;
    }
  }
  return element.getClientRects().length > 0;
}

function modal(document: Document): HTMLElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'dialog:modal, dialog[open][aria-modal="true"], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
    ),
  )
    .filter(visible)
    .at(-1);
}

function tabbables(document: Document, root: ParentNode = document): HTMLElement[] {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"], audio[controls], video[controls]',
    ),
  ).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && visible(element));
  return elements
    .filter((element) => {
      const Input = document.defaultView?.HTMLInputElement;
      if (!Input || !(element instanceof Input) || element.type !== 'radio' || !element.name)
        return true;
      const group = elements.filter(
        (other) =>
          other instanceof Input &&
          other.type === 'radio' &&
          other.name === element.name &&
          other.form === element.form,
      );
      return element === (group.find((other) => other.matches(':checked')) ?? group[0]);
    })
    .sort(
      (a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity),
    );
}

function focusEdge(document: Document, direction: FocusDirection): void {
  const dialog = modal(document);
  const elements = tabbables(document, dialog ?? document);
  const target = direction === 'forward' ? elements[0] : elements.at(-1);
  if (target) {
    target.focus();
  } else if (dialog) {
    dialog.focus();
  } else {
    // A document can temporarily contain no controls during a UI transition.
    const previous = document.body.getAttribute('tabindex');
    document.body.tabIndex = -1;
    document.body.focus();
    if (previous === null) document.body.removeAttribute('tabindex');
    else document.body.setAttribute('tabindex', previous);
  }
}

/** Runs in each isolated preload; no privileged API is exposed to page scripts. */
export function installFocusBoundary(document: Document, transport: FocusBoundaryTransport) {
  let available = false;
  let pending = false;
  let disposed = false;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      !available ||
      pending ||
      event.key !== 'Tab' ||
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      modal(document)
    )
      return;
    const current = document.activeElement;
    // Shadow roots and frames own their internal traversal; do not guess their boundary.
    if (
      !current ||
      current.shadowRoot ||
      current.tagName === 'IFRAME' ||
      current.tagName.includes('-')
    )
      return;
    const elements = tabbables(document);
    const edge = event.shiftKey ? elements[0] : elements.at(-1);
    if (!edge || current !== edge) return;
    event.preventDefault();
    pending = true;
    const direction = event.shiftKey ? 'backward' : 'forward';
    const fallback = (): void => {
      if (!disposed && document.hasFocus() && document.activeElement === current) {
        focusEdge(document, direction);
      }
    };
    void transport
      .request(direction)
      .then((routed) => {
        if (!routed) fallback();
      }, fallback)
      .finally(() => {
        pending = false;
      });
  };
  // Bubble on window, after document/React focus traps have had their say.
  document.defaultView?.addEventListener('keydown', onKeyDown);
  const stopFocus = transport.onFocus((direction) => focusEdge(document, direction));
  return {
    setAvailable(value: boolean): void {
      available = value;
    },
    dispose(): void {
      disposed = true;
      document.defaultView?.removeEventListener('keydown', onKeyDown);
      stopFocus();
    },
  };
}
