/**
 * Canonical tool-reference matcher for system-prompt assertions.
 *
 * The system prompt legitimately names two different things that can collide:
 * a registered TOOL (`git`, `read`, `present_artifact`) and a NATIVE EXECUTABLE
 * that simply exists on PATH. Under a pinned PowerShell shell the shell
 * guidance says "`rg`/`git`/`node` and other native exes run as-is", and the
 * naive matcher read that as the prompt advertising the `git` tool.
 *
 * The distinction is semantic, not purely syntactic: `git` in that enumeration
 * is a PATH executable, while `read` in the very same list is not an executable
 * at all (it is a registered tool), so it still counts as a reference. This
 * matcher therefore exempts a name from slash-joined executable enumerations
 * ONLY when that name is a genuine native executable — and only there, so a
 * real directive on the same line ("… use the `git` tool") is still detected.
 */

/** Names the prompt may reference as PATH executables rather than tools. */
const NATIVE_EXECUTABLES: ReadonlySet<string> = new Set([
  'awk',
  'bun',
  'cargo',
  'cmake',
  'curl',
  'deno',
  'dotnet',
  'find',
  'git',
  'go',
  'grep',
  'java',
  'make',
  'node',
  'npm',
  'npx',
  'php',
  'pwsh',
  'powershell',
  'python',
  'python3',
  'rg',
  'ruby',
  'sed',
]);

/**
 * A slash-joined enumeration of backticked executables: `rg`/`git`/`node`.
 * Requires at least two pairs joined by `/`, so a lone `` `git status` ``
 * command example is NOT an enumeration and stays scannable.
 */
const NATIVE_EXE_ENUMERATION = /`[^`\n]+?`(?:\s*\/\s*`[^`\n]+?`)+/g;

/**
 * The enumeration is only about PATH executables when the line actually says
 * so. Without this guard a tool directive that merely lists names the same way
 * — "Use the `git`/`read` tools." — had its list stripped and hid a genuine
 * `git` reference. Only strip when the line documents native executables.
 */
const DOCUMENTS_NATIVE_EXES = /native exes|native executables?/i;

/**
 * Whether `text` refers to the registered tool `name`.
 *
 * True when the name appears inside a backtick span or as a bold span, honouring
 * canonical-name boundaries (`` `git-extra` `` is not `git`) and skipping XML
 * tag openings/closings (`` `<git>` `` is markup, not a reference).
 */
export function mentionsCanonicalTool(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`);
  // Only a real native executable gets the enumeration exemption, and only on a
  // line that actually documents executables. A registered tool that merely
  // appears in that list (`read`) is still a reference.
  const isExecutable = NATIVE_EXECUTABLES.has(name);
  return text.split('\n').some((line) => {
    const scannable =
      isExecutable && DOCUMENTS_NATIVE_EXES.test(line)
        ? line.replace(NATIVE_EXE_ENUMERATION, ' ')
        : line;
    if (
      scannable.split('`').some((segment, index) => {
        if (index % 2 !== 1) return false;
        if (segment.includes(`<${name}`) || segment.includes(`</${name}`)) return false;
        return token.test(segment);
      })
    ) {
      return true;
    }
    return scannable
      .split('**')
      .some((segment, index) => index % 2 === 1 && segment.trim() === name);
  });
}
