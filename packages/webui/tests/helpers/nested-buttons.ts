/**
 * Nested-`<button>` detector for component tests.
 *
 * A `<button>` inside another `<button>` is invalid HTML: React reports it as a
 * hydration error ("In HTML, <button> cannot be a descendant of <button>"), and
 * the inner control's activation semantics are undefined in a real browser.
 *
 * The defect is easy to reintroduce because an inline action control (refresh,
 * expand, close) reads as part of a clickable header row — the two spellings
 * differ only in whether the header *is* a button or *contains* one. Assert on
 * this shape rather than on the header's classes, so the guard survives a
 * restyle.
 *
 * Returns the offending outer buttons' text (trimmed) instead of a boolean, so
 * a failure names the culprit rather than just saying "expected [] received [x]".
 */
export function nestedButtons(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('button'))
    .filter((button) => button.querySelector('button') !== null)
    .map((button) => button.textContent?.trim() ?? '(unnamed button)');
}
