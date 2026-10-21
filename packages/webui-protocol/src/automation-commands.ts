/** User-authored argv, never evaluated by a shell. Quotes group spaces only. */
export function parseAutomationCommands(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const argv: string[] = [];
      let word = '';
      let started = false;
      let quote = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i]!;
        if (char === '\\' && quote !== "'") {
          if (++i >= line.length) throw new Error('A command ends with an unfinished escape');
          word += line[i];
          started = true;
        } else if (quote) {
          if (char === quote) quote = '';
          else word += char;
        } else if (char === '"' || char === "'") {
          quote = char;
          started = true;
        } else if (/\s/.test(char)) {
          if (started) argv.push(word);
          word = '';
          started = false;
        } else {
          word += char;
          started = true;
        }
      }
      if (quote) throw new Error('A command contains an unclosed quote');
      if (started) argv.push(word);
      return argv;
    });
}

export function formatAutomationCommands(commands: readonly (readonly string[])[]): string {
  return commands
    .map((argv) =>
      argv.map((arg) => (/^[\w./:-]+$/.test(arg) ? arg : JSON.stringify(arg))).join(' '),
    )
    .join('\n');
}
