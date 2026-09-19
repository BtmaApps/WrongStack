export function quoteIsEscaped(command: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && command[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

export function isQuoteBoundary(
  command: string,
  index: number,
  activeQuote: "'" | '"' | null,
): boolean {
  const char = command[index];
  if (char !== "'" && char !== '"') return false;
  if (activeQuote === "'") return char === "'";
  if (activeQuote !== null && char !== activeQuote) return false;
  return !quoteIsEscaped(command, index);
}

export function executableCommandSubstitutions(command: string): string[] {
  const bodies: string[] = [];
  let outerQuote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (isQuoteBoundary(command, index, outerQuote)) {
      outerQuote = outerQuote === char ? null : char === "'" ? "'" : '"';
      continue;
    }
    if (outerQuote === "'" || quoteIsEscaped(command, index)) continue;

    if (char === '\x60') {
      let end = index + 1;
      while (end < command.length && (command[end] !== '\x60' || quoteIsEscaped(command, end))) {
        end += 1;
      }
      if (end < command.length) {
        bodies.push(command.slice(index + 1, end));
        index = end;
      }
      continue;
    }

    const commandSubstitution = char === '\x24' && command[index + 1] === '(';
    const processSubstitution = (char === '>' || char === '<') && command[index + 1] === '(';
    if (
      (!commandSubstitution && !processSubstitution) ||
      (commandSubstitution && command[index + 2] === '(')
    )
      continue;
    let depth = 1;
    let innerQuote: "'" | '"' | null = null;
    let end = index + 2;
    for (; end < command.length; end += 1) {
      const innerChar = command[end];
      if (isQuoteBoundary(command, end, innerQuote)) {
        innerQuote = innerQuote === innerChar ? null : innerChar === "'" ? "'" : '"';
        continue;
      }
      if (innerQuote !== null) continue;
      if ((innerChar === '(' || innerChar === ')') && quoteIsEscaped(command, end)) continue;
      if (innerChar === '(') depth += 1;
      else if (innerChar === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth === 0) {
      bodies.push(command.slice(index + 2, end));
      index = end;
    } else {
      break;
    }
  }
  return bodies;
}
