/** The editor accepts one task per line, optionally followed by :: description. */
export function parseSddSubtasks(input: string): Array<{ title: string; description: string }> {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawTitle, ...rest] = line.split('::');
      const title = (rawTitle ?? '').trim();
      return { title, description: rest.join('::').trim() || title };
    })
    .filter((task) => task.title.length > 0);
}
