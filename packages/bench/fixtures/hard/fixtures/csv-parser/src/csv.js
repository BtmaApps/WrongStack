/**
 * Parse CSV text into records. See the task prompt for the full contract.
 *
 * @param {string} text
 * @param {{ delimiter?: string, header?: boolean }} [options]
 * @returns {string[][] | Record<string, string>[]}
 */
export function parseCsv(text, options = {}) {
  const delimiter = options.delimiter ?? ',';
  return text.split('\n').map((line) => line.split(delimiter));
}
