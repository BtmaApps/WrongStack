import assert from 'node:assert/strict';

/** Check rendered geometry, including pseudo-elements and portaled overlays. */
export async function assertSquareCorners(page) {
  const violations = await page.evaluate(() => {
    const corners = [
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomLeftRadius',
      'borderBottomRightRadius',
    ];
    const failures = [];
    for (const element of document.querySelectorAll('*')) {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden')
        continue;
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        if (pseudo && (style.content === 'none' || style.content === 'normal')) continue;
        if (corners.some((corner) => parseFloat(style[corner]) !== 0)) {
          failures.push({
            tag: element.tagName,
            className: element.getAttribute('class'),
            pseudo,
            radii: corners.map((corner) => style[corner]),
          });
        }
        if (failures.length >= 10) return failures;
      }
    }
    return failures;
  });
  assert.deepEqual(violations, [], 'Every rendered UI corner must be square');
}
