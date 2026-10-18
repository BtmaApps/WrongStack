export const argMatches = (args: readonly string[], re: RegExp): boolean =>
  args.some((a) => re.test(a));

/**
 * Every flag letter visible in `args`: short clusters (`-rf` → r,f) plus the
 * letters implied by the GNU long forms we classify (`--recursive` → r,
 * `--force` → f). Cluster letters are lowercased so GNU `-R` (≡
 * `--recursive`) counts as recursive. Presence-only — cluster/split form,
 * flag order, and letter case are irrelevant, and a mixed invocation
 * (`rm -r --force x`) must classify the same as either pure form.
 */
export const flagLetters = (args: readonly string[]): Set<string> => {
  const seen = new Set<string>();
  for (const a of args) {
    if (/^-[a-zA-Z]+$/.test(a)) {
      for (const ch of a.slice(1)) seen.add(ch.toLowerCase());
    } else if (a === '--recursive') {
      seen.add('r');
    } else if (a === '--force') {
      seen.add('f');
    }
  }
  return seen;
};

/** git's global options that take the NEXT argv entry as their value. */
const GIT_GLOBAL_VALUE_OPTIONS: readonly string[] = [
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
];

/**
 * The git subcommand and its arguments, with git's global options (`-C dir`,
 * `-c k=v`, `--no-pager`, …) skipped. Keying a rule on `args.includes('x')`
 * would also fire on a branch or path NAMED `x`; the real subcommand is the
 * first positional once the leading options are consumed.
 */
export function gitSubcommand(args: readonly string[]): { sub?: string; rest: string[] } {
  let i = 0;
  while (i < args.length && args[i]!.startsWith('-')) {
    i += GIT_GLOBAL_VALUE_OPTIONS.includes(args[i]!) ? 2 : 1;
  }
  const sub = args[i];
  return sub === undefined ? { rest: [] } : { sub, rest: args.slice(i + 1) };
}

export const isPowerShellCmd = (cmd: string): boolean =>
  /^(?:powershell|pwsh)(?:\.exe)?$/i.test(cmd);

/**
 * First positional after `kubectl delete` (the resource), skipping the values
 * of value-taking flags — kubectl accepts its flags anywhere.
 */
export function kubectlDeleteResource(after: readonly string[]): string | undefined {
  const KUBECTL_VALUE_FLAGS = new Set([
    '-n',
    '--namespace',
    '-f',
    '--filename',
    '-l',
    '--selector',
    '-o',
    '--output',
    '--context',
    '--cluster',
    '--user',
    '--kubeconfig',
    '--grace-period',
    '--timeout',
    '-k',
    '--kustomize',
  ]);
  for (let i = 0; i < after.length; i += 1) {
    const a = after[i] ?? '';
    if (a.startsWith('-')) {
      if (KUBECTL_VALUE_FLAGS.has(a) && !a.includes('=')) i += 1;
      continue;
    }
    return a;
  }
  return undefined;
}
