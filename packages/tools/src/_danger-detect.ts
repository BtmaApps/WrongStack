/**
 * Heuristic danger detection for `exec` tool commands.
 *
 * Layered on top of `BLOCKED_ARG_PATTERNS` (which is a hard-deny list for
 * clear sandbox escapes) and `bash-kill-guard.ts` (which protects WrongStack
 * itself from kill). This module assigns a danger level to a command/arg
 * pair so the caller can decide whether to:
 *
 *   - 'safe'        → execute normally
 *   - 'caution'     → execute and emit a warning line to the tool output
 *   - 'destructive' → route through the existing confirm flow
 *                     (`execTool.permission === 'confirm'`) instead of
 *                     hard-deny, so the user can still proceed if intentional
 *
 * Design constraints:
 *   - Deterministic: no randomness, no I/O, no time. Same input → same output.
 *   - No LLM calls. Patterns are regex / exact-match.
 *   - Per-rule `id` so config can override specific rules via
 *     `tools.exec.danger.bypass`.
 *   - Reasons are human-readable, joined with "; " for the confirm prompt.
 *
 * Caution rules are deliberately permissive — they execute and emit a
 * warning rather than blocking. The rationale: many of these patterns
 * (python -c, sudo) are part of legitimate dev workflows,
 * so a hard deny would block too much. A warning gives the user a
 * chance to notice "wait, I didn't mean to do that" without forcing
 * them to add a config override for every script.
 */

export type DangerLevel = 'safe' | 'caution' | 'destructive';

export interface DangerAssessment {
  level: DangerLevel;
  reasons: string[];
  /** Stable id of the matched rule, for tests and config-override. */
  matchedRule?: string;
}

export interface DangerRule {
  id: string;
  level: DangerLevel;
  /** Match a (cmd, args) pair. Return true if this rule fires. */
  test: (cmd: string, args: readonly string[]) => boolean;
  /** Human-readable explanation, joined with "; " in the output. */
  reason: string;
}

const argMatches = (args: readonly string[], re: RegExp): boolean => args.some((a) => re.test(a));

/**
 * Every flag letter visible in `args`: short clusters (`-rf` → r,f) plus the
 * letters implied by the GNU long forms we classify (`--recursive` → r,
 * `--force` → f). Cluster letters are lowercased so GNU `-R` (≡
 * `--recursive`) counts as recursive. Presence-only — cluster/split form,
 * flag order, and letter case are irrelevant, and a mixed invocation
 * (`rm -r --force x`) must classify the same as either pure form.
 */
const flagLetters = (args: readonly string[]): Set<string> => {
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

const isPowerShellCmd = (cmd: string): boolean => /^(?:powershell|pwsh)(?:\.exe)?$/i.test(cmd);

const RULES: readonly DangerRule[] = [
  // ----- rm / rmdir: recursive force delete (any path) -----
  // Note: BLOCKED_ARG_PATTERNS already hard-denies root/home/glob paths,
  // but `rm -rf ./build` is a normal dev workflow that the user might
  // want to do intentionally. We downgrade it to 'destructive' so the
  // confirm prompt can approve. Short clusters, GNU long forms
  // (`--recursive --force`), and mixed shapes all classify identically.
  // The Windows cmd.exe shape classifies identically too: `rmdir /s /q`
  // (and its `rd` alias) is the same operation — /s is the recursive half,
  // /q the quiet (no per-directory prompt, i.e. the "force") half. /s alone
  // still prompts in cmd, so it stays safe, mirroring the PowerShell rule's
  // requirement for both -Recurse and -Force. `del`/`erase` (erase is a cmd
  // alias of del) with /s is classified as well: `del /s` deletes matching
  // files in the whole subtree WITHOUT any per-file prompt, so there /s
  // alone is the recursive-force half (/f only overrides read-only, /q only
  // mutes the global-wildcard "are you sure"). Non-recursive del/erase
  // (single files, or a quiet single-directory wildcard) stays safe.
  {
    id: 'rm-recursive',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'rm' && cmd !== 'rmdir' && cmd !== 'rd' && cmd !== 'del' && cmd !== 'erase') {
        return false;
      }
      const letters = flagLetters(args);
      if (letters.has('r') && letters.has('f')) return true;
      const cmdFlags = new Set<string>();
      for (const a of args) {
        if (/^(?:\/[a-zA-Z])+$/.test(a)) {
          for (const ch of a.toLowerCase()) {
            if (ch >= 'a' && ch <= 'z') cmdFlags.add(ch);
          }
        } else if (/^\/[sqfpa]+$/i.test(a)) {
          for (const ch of a.toLowerCase().slice(1)) cmdFlags.add(ch);
        }
      }
      if (cmd === 'rmdir' || cmd === 'rd') return cmdFlags.has('s') && cmdFlags.has('q');
      if (cmd === 'del' || cmd === 'erase') return cmdFlags.has('s');
      return false;
    },
    reason: 'recursive force-delete',
  },
  // ----- Windows PowerShell Remove-Item: -Recurse -Force -----
  {
    id: 'powershell-remove-item-recursive-force',
    level: 'destructive',
    test: (cmd, args) => {
      const isPwsh = isPowerShellCmd(cmd);
      const isRemoveItemCmd = /^(?:remove-item|ri)(?:\.exe)?$/i.test(cmd);
      if (!isPwsh && !isRemoveItemCmd) return false;
      if (
        isPwsh &&
        !args.some((a) => /^(?:Remove-Item|ri|rm|del|erase|rd|rmdir)(?:\.exe)?$/i.test(a))
      ) {
        return false;
      }
      // PowerShell parameters are case-insensitive by language spec
      // (`-recurse` ≡ `-Recurse`), so match with the `/i` flag like the
      // sibling PowerShell rules below. Case-sensitive matching here let
      // `Remove-Item -recurse -force` classify as safe and bypass the
      // confirm gate its canonical spelling triggers.
      const hasRecurse = argMatches(args, /^-(?:r|recurse)(?::\$true)?$/i);
      const hasForce = argMatches(args, /^-(?:f|force)(?::\$true)?$/i);
      // Allow `-WhatIf` (dry-run, any casing) without confirmation. The
      // explicit `-WhatIf:$true` spelling is the same dry run; `-WhatIf:$false`
      // re-enables execution and must NOT be exempt.
      if (argMatches(args, /^-whatif(?::\$true)?$/i)) return false;
      return hasRecurse && hasForce;
    },
    reason: 'Remove-Item with -Recurse -Force',
  },
  // ----- Windows PowerShell Disk & Volume destruction -----
  {
    id: 'powershell-disk-volume-destroy',
    level: 'destructive',
    test: (cmd, args) => {
      if (!isPowerShellCmd(cmd)) return false;
      return args.some((a) =>
        /^(?:Format-Volume|Clear-Disk|Initialize-Disk|Remove-Partition|Clear-Volume)(?:\s|$)/i.test(
          a,
        ),
      );
    },
    reason: 'PowerShell disk/volume partition destruction',
  },
  // ----- Windows PowerShell System Restart / Shutdown -----
  {
    id: 'powershell-stop-restart-computer',
    level: 'destructive',
    test: (cmd, args) => {
      if (!isPowerShellCmd(cmd)) return false;
      return args.some((a) => /^(?:Stop-Computer|Restart-Computer)(?:\s|$)/i.test(a));
    },
    reason: 'PowerShell system shutdown or restart',
  },
  // ----- Windows PowerShell ExecutionPolicy / Payload evasion -----
  {
    id: 'powershell-execution-policy-bypass',
    level: 'caution',
    test: (cmd, args) => {
      if (!isPowerShellCmd(cmd)) return false;
      return args.some((a) =>
        /Set-ExecutionPolicy\s+(?:Bypass|Unrestricted)|-(?:EncodedCommand|enc)\b/i.test(a),
      );
    },
    reason: 'PowerShell execution policy bypass or encoded command',
  },
  // ----- find -exec / -ok / -execdir -----
  {
    id: 'find-exec',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'find') return false;
      return args.some(
        (a) =>
          a === '-exec' ||
          a === '-exec;' ||
          a === '-ok' ||
          a === '-ok;' ||
          a === '-execdir' ||
          a === '-execdir;' ||
          a.startsWith('-exec=') ||
          a.startsWith('-ok=') ||
          a.startsWith('-execdir='),
      );
    },
    reason: 'find with -exec/-ok (executes arbitrary command on matches)',
  },
  // ----- git --exec= / --upload-pack= / --receive-pack= -----
  // These run arbitrary commands via the git transport layer.
  {
    id: 'git-exec',
    level: 'destructive',
    test: (cmd, args) =>
      cmd === 'git' &&
      args.some(
        (a) =>
          a.startsWith('--exec=') ||
          a.startsWith('--upload-pack=') ||
          a.startsWith('--receive-pack=') ||
          a === '--exec' ||
          a === '--upload-pack' ||
          a === '--receive-pack',
      ),
    reason: 'git with --exec/--upload-pack/--receive-pack (runs arbitrary code)',
  },
  // ----- Windows: format / diskpart / bcdedit -----
  {
    id: 'win32-format',
    level: 'destructive',
    test: (cmd) => cmd === 'format' || cmd === 'format.exe',
    reason: 'format (Windows disk format)',
  },
  {
    id: 'win32-diskpart',
    level: 'destructive',
    test: (cmd) => cmd === 'diskpart' || cmd === 'diskpart.exe',
    reason: 'diskpart (Windows partition editor)',
  },
  {
    id: 'win32-bcdedit',
    level: 'destructive',
    test: (cmd) => cmd === 'bcdedit' || cmd === 'bcdedit.exe',
    reason: 'bcdedit (Windows boot config editor)',
  },
  // ----- mkfs family -----
  {
    id: 'mkfs',
    level: 'destructive',
    // Case-insensitive like every sibling rule: an argv reaching this module is
    // whatever the model wrote, and on a case-insensitive filesystem `MKFS.EXT4`
    // runs the same binary. Case-sensitive matching here made the one spelling
    // difference the whole classification (probe-verified 2026-09-22).
    test: (cmd) => /^mkfs(\.[a-z0-9]+)?$/i.test(cmd) || /^mkswap$/i.test(cmd),
    reason: 'mkfs (filesystem creation — destroys existing data)',
  },
  // ----- dd writing to a block device -----
  {
    id: 'dd-to-block-device',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'dd') return false;
      return args.some((a) => /of=\/dev\/(sd|hd|nvme|vd|mmcblk|xvd|loop|disk)/.test(a));
    },
    reason: 'dd writing to a block device',
  },
  // ----- Secure-erase tools -----
  {
    id: 'shred',
    level: 'destructive',
    test: (cmd) => cmd === 'shred' || cmd === 'shred.exe',
    reason: 'shred (secure file delete)',
  },
  {
    id: 'wipefs',
    level: 'destructive',
    test: (cmd) => cmd === 'wipefs' || cmd === 'wipefs.exe',
    reason: 'wipefs (signature wipe — destroys filesystem headers)',
  },
  {
    id: 'sdelete',
    level: 'destructive',
    test: (cmd) => cmd === 'sdelete' || cmd === 'sdelete.exe',
    reason: 'sdelete (Sysinternals secure delete)',
  },
  // ----- VCS history rewrite (destructive) -----
  // `git push --force` / `-f` rewrites remote history. `--force-with-lease`
  // is the safer variant (checks remote hasn't moved) but still rewrites.
  // A refspec prefixed with `+` (`git push origin +main`,
  // `+HEAD:refs/heads/main`) is per-refspec force — documented git shorthand
  // equivalent to `--force` for that ref — so it classifies identically. A
  // `+` anywhere else in a refspec (branch `feature+fix`) is just a
  // character, and a leading `^` EXCLUDES the ref (with --all/--mirror);
  // neither is force syntax. `--dry-run` / `-n` rewrites nothing and is
  // exempt, like the PowerShell -WhatIf carve-out above (combined short
  // clusters like `-nf` count as dry-run too — git push's short flags are
  // only -q -v -f -n -u -o, so an 'n' in a cluster means dry-run).
  {
    id: 'git-push-force',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'git') return false;
      const pushIdx = args.indexOf('push');
      if (pushIdx < 0) return false;
      if (
        args
          .slice(pushIdx + 1)
          .some((a) => a === '--dry-run' || a === '-n' || /^-[a-z]*n[a-z]*$/i.test(a))
      ) {
        return false;
      }
      for (let i = pushIdx + 1; i < args.length; i++) {
        const a = args[i]!;
        if (a === '--force' || a === '-f' || a === '--force-with-lease') return true;
        if (!a.startsWith('-') && !a.includes('=')) {
          if (a.startsWith('+')) return true;
          continue;
        }
        if (a.startsWith('--force') /* covers --force-with-lease already */) return true;
        // Combined short-flag cluster: git combines short flags, so
        // `-fv` ≡ `-f -v` and is a verbatim force-push that rewrites history.
        // Only single-dash all-letter clusters qualify; the dry-run exemption
        // above already returned early on any `n`, so an `f` reaching here is
        // a genuine (non-dry-run) force. This is the flag-cluster shape-variance
        // gap already fixed for rm-recursive / powershell rules but missed here.
        if (/^-[a-z]+$/i.test(a) && a.toLowerCase().includes('f')) return true;
      }
      return false;
    },
    reason: 'git push with --force / -f (rewrites remote history)',
  },
  // ----- git reset --hard (destructive) -----
  {
    id: 'git-reset-hard',
    level: 'destructive',
    test: (cmd, args) =>
      cmd === 'git' && args.some((a) => a === '--hard' || a.startsWith('--hard=')),
    reason: 'git reset --hard (discards working tree + index)',
  },
  // ----- git clean -f / -fd (destructive) -----
  {
    id: 'git-clean-force',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'git') return false;
      const cleanIdx = args.indexOf('clean');
      if (cleanIdx < 0) return false;
      // Must include -f / --force (without it, git clean errors out and does
      // nothing). Short flags combine, so the force flag is any single-dash
      // all-letter cluster containing `f` — `-fd`, `-df`, `-xdf` — not just
      // ones where `f` happens to be first.
      const after = args.slice(cleanIdx + 1);
      // A dry run rewrites nothing; exempt it before the force check, the same
      // shape the git-push-force rule uses (`-n`, `-nd`, `--dry-run`).
      if (after.some((a) => a === '--dry-run' || /^-[a-z]*n[a-z]*$/i.test(a))) return false;
      return after.some(
        (a) =>
          a === '--force' ||
          a.startsWith('--force=') ||
          (/^-[a-z]+$/i.test(a) && a.toLowerCase().includes('f')),
      );
    },
    reason: 'git clean -f (deletes untracked files)',
  },
  // ----- package publish (destructive — public, irreversible) -----
  {
    id: 'npm-publish',
    level: 'destructive',
    test: (cmd, args) => {
      if (!['npm', 'pnpm', 'yarn', 'bun', 'cargo'].includes(cmd)) return false;
      // For npm/pnpm/yarn/bun: subcommand is "publish".
      // For cargo: subcommand is "publish" OR "yank" (both touch the
      // public registry; yank is reversible, publish is not, but yank
      // is rare enough we treat it the same).
      // Find the first positional subcommand (skip option flags — and the VALUE
      // of a flag that takes one: npm accepts its global options before the
      // subcommand, so `npm --access public publish` put `public` in the
      // subcommand slot and the same publish classified as safe
      // (probe-verified 2026-09-22).
      const VALUE_FLAGS = new Set([
        '--access',
        '--tag',
        '--otp',
        '--registry',
        '--workspace',
        '-w',
        '--userconfig',
        '--prefix',
        '--cache',
        '--loglevel',
        '--index',
        '--token',
      ]);
      let firstPositional: string | undefined;
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i] ?? '';
        if (a.startsWith('-')) {
          if (VALUE_FLAGS.has(a) && !a.includes('=')) i += 1;
          continue;
        }
        firstPositional = a;
        break;
      }
      if (!firstPositional) return false;
      if (cmd === 'cargo') {
        return firstPositional === 'publish' || firstPositional === 'yank';
      }
      return firstPositional === 'publish';
    },
    reason: 'publishing to a public package registry (hard to reverse)',
  },
  // ----- k8s cluster-wide destructive ops (destructive) -----
  {
    id: 'kubectl-delete-namespace',
    level: 'destructive',
    test: (cmd, args) => {
      if (cmd !== 'kubectl') return false;
      const delIdx = args.indexOf('delete');
      if (delIdx < 0) return false;
      // Match `kubectl delete namespace <name>` or `kubectl delete ns <name>`.
      // Generic `kubectl delete pod foo` is left out — too common.
      //
      // The resource is the first POSITIONAL after `delete`, not literally the
      // next token: kubectl accepts its flags anywhere, so
      // `kubectl delete -n x namespace y` put `-n` in that slot and the rule
      // declined the same cluster-wide delete it flags in canonical order. It
      // also accepts the plural resource name (`namespaces`), which is the
      // spelling `kubectl api-resources` prints (probe-verified 2026-09-22).
      // A flag's VALUE is not a positional: without skipping it, `-n x` put `x`
      // in the resource slot. Only the value-taking flags are skipped, so a
      // boolean flag (`--force`) does not swallow the resource that follows it.
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
      const after = args.slice(delIdx + 1);
      let resource: string | undefined;
      for (let i = 0; i < after.length; i += 1) {
        const a = after[i] ?? '';
        if (a.startsWith('-')) {
          if (KUBECTL_VALUE_FLAGS.has(a) && !a.includes('=')) i += 1;
          continue;
        }
        resource = a;
        break;
      }
      return resource === 'namespace' || resource === 'namespaces' || resource === 'ns';
    },
    reason: 'kubectl delete namespace (deletes all resources in the namespace)',
  },
  {
    id: 'kubectl-drain',
    level: 'destructive',
    test: (cmd, args) => cmd === 'kubectl' && args.includes('drain'),
    reason: 'kubectl drain (evicts pods, marks node unschedulable)',
  },
  // ----- inline code evaluation (caution — high false-positive) -----
  // Common in scripts: `python -c "..."`, `node -e "..."`, `bash -c "..."`.
  // We tag 'caution' rather than 'destructive' because these are used in
  // many legitimate one-liners (e.g. `python -c "print(1)"`).
  {
    id: 'inline-eval',
    level: 'caution',
    test: (cmd, args) => {
      if (
        ![
          'python',
          'python3',
          'python2',
          'node',
          'bash',
          'sh',
          'zsh',
          'ruby',
          'perl',
          'lua',
        ].includes(cmd)
      ) {
        return false;
      }
      return args.some(
        (a) =>
          a === '-c' ||
          a === '-e' ||
          a === '--eval' ||
          a === '-eval' ||
          a === '-E' /* node --eval shorthand in some shells */,
      );
    },
    reason: 'inline script evaluation (-c / -e / --eval)',
  },
  // ----- pipe-to-shell (destructive — download-and-run pattern) -----
  // The classic `curl https://... | sh` download-and-run vector. Detected by
  // looking for a known fetcher piped into a shell or expression evaluator.
  // A shell command passed through `bash -c` / `pwsh -Command` arrives as one
  // argv string, so scan the reconstructed argv text rather than individual
  // tokens only.
  {
    id: 'pipe-to-shell',
    level: 'destructive',
    test: (cmd, args) =>
      /\b(?:curl|wget|fetch|httpie|http|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[\s\S]{0,300}\|\s*(?:sudo\s+)?(?:sh|bash|zsh|fish|pwsh|powershell|iex|Invoke-Expression)\b/i.test(
        [cmd, ...args].join(' '),
      ),
    reason: 'network fetch piped to a shell (download-and-run pattern)',
  },
  // ----- privilege escalation (caution) -----
  {
    id: 'sudo',
    level: 'caution',
    test: (cmd) => cmd === 'sudo' || cmd === 'doas',
    reason: 'privilege escalation (sudo / doas)',
  },
  {
    id: 'runas',
    level: 'caution',
    test: (cmd) => cmd === 'runas' || cmd === 'runas.exe',
    reason: 'Windows runas (run as different user)',
  },
  // ----- world-writable permissions (caution) -----
  // `chmod 777` is rarely correct. `chmod -R 777` is almost always wrong.
  // We only flag octal modes; symbolic modes like `chmod o+w` are
  // left to the operator's discretion.
  {
    id: 'chmod-world-writable',
    level: 'caution',
    test: (cmd, args) => {
      if (cmd !== 'chmod') return false;
      // Skip symbolic modes: anything starting with [ugoa]=\w or [ugoa]+\w.
      // The only thing we flag is a pure octal mode containing 7 anywhere
      // in the user/group/other triple (e.g. 777, 776, 747, 707).
      return args.some((a) => /^[0-7]{3,4}$/.test(a) && /7/.test(a));
    },
    reason: 'chmod with world-writable octal mode (e.g. 777)',
  },
  // ----- network recon / offensive scanners (caution) -----
  // These tools are purpose-built for network reconnaissance and offensive
  // security. They have legitimate uses in dev (security testing, infra
  // debugging) but their presence in an agent's command stream is worth a
  // caution banner so the user can notice an unexpected scan.
  {
    id: 'network-scanner',
    level: 'caution',
    test: (cmd) =>
      cmd === 'nmap' ||
      cmd === 'masscan' ||
      cmd === 'zmap' ||
      cmd === 'nuclei' ||
      cmd === 'hping3' ||
      cmd === 'naabu' ||
      cmd === 'katana' ||
      cmd === 'amass' ||
      cmd === 'subfinder' ||
      cmd === 'httpx' ||
      cmd === 'rustscan' ||
      cmd === 'zgrab',
    reason: 'network scanner / offensive reconnaissance tool',
  },
  // ----- process termination (caution) -----
  // kill/killall/pkill terminate processes. The exec kill guard
  // (exec-kill-guard.ts) hard-blocks attempts on protected WrongStack
  // processes; this rule adds a caution banner for generic process
  // termination so the user sees a warning even for non-protected targets.
  {
    id: 'process-kill',
    level: 'caution',
    test: (cmd) => cmd === 'kill' || cmd === 'killall' || cmd === 'pkill',
    reason: 'process termination command',
  },
  // ----- shell/interpreter launchers (caution) -----
  // `env bash -c '…'`, `timeout sh`, `nohup perl -e '…'` etc. wrap a child
  // binary that bypasses the allowlist name-gate entirely (the wrapper
  // resolves the child from PATH, not from the allowlist). We flag caution
  // when a known launcher has a shell/interpreter as its target program.
  {
    id: 'shell-launcher',
    level: 'caution',
    test: (cmd, args) => {
      const launchers = [
        'env',
        'timeout',
        'nohup',
        'nice',
        'script',
        'expect',
        'tmux',
        'screen',
        'byobu',
        'dtach',
      ];
      if (!launchers.includes(cmd)) return false;
      const shells = [
        'sh',
        'bash',
        'zsh',
        'fish',
        'python',
        'python3',
        'perl',
        'ruby',
        'node',
        'pwsh',
        'powershell',
        'cmd',
      ];
      // For `env`, the target program is the first arg that isn't VAR=value
      // or a flag. For other launchers, check all args for a shell name.
      if (cmd === 'env') {
        const prog = args.find((a) => !a.includes('=') && !a.startsWith('-'));
        return prog !== undefined && shells.includes(prog);
      }
      return args.some((a) => shells.includes(a));
    },
    reason: 'launcher wrapping a shell/interpreter (bypasses allowlist name-gate)',
  },
];

/**
 * Evaluate the danger level of a (cmd, args) pair.
 *
 * Returns 'safe' if no rule fires, otherwise the highest level among all
 * matching rules. The 'matchedRule' field is the *last* rule that fired
 * (stable, since rules are evaluated in declaration order).
 *
 * Optional `bypass` argument: a set of rule ids that should be SKIPPED
 * even if they would otherwise match. Wired from
 * `config.tools.exec.danger.bypass` (see `ExecDangerConfig` in
 * `@wrongstack/core/src/types/config.ts`). Unknown ids are silently
 * ignored — forward-compat: a rule added in a future version can be
 * referenced before the user upgrades their config schema.
 *
 * This function is the single source of truth for danger classification;
 * it is pure (no side effects) and unit-tested in `danger-detect.test.ts`.
 */
/**
 * Launchers that run another program, keyed by the options they consume.
 *
 * `exec` receives argv, so the launcher is the EXECUTABLE and the real command
 * is its first operand — and `env`, `nice`, `nohup` and `timeout` all ship in
 * the default exec allowlist. Every rule here keys on `cmd`, so
 * `exec nohup rm -rf /` read as the harmless `nohup` and assessed `safe`
 * (probe-verified 2026-09-22: 10 of 12 launcher-wrapped forms).
 *
 * `numericOperand` marks the launchers that also take a positional of their
 * own before the command (`timeout 5 rm …`).
 */
/**
 * GNU coreutils `timeout` DURATION.
 *
 * The `timeout` manual defines it as "a floating point number in either the
 * current or the C locale (see Floating point numbers) followed by an optional
 * unit" ('s' seconds, 'm' minutes, 'h' hours, 'd' days) — and the manual's
 * `Floating point` node states those numbers are parsed with `strtod`/`strtold`
 * and "therefore can use scientific notation like 1.0e-34 and -10e100", plus
 * hexadecimal floating point such as `-0x.ep-3`. So `1e3`, `2E4` and `0x1p3`
 * are all valid durations, not exotic typos.
 *
 * Matching only the integer spelling mis-parsed every other form, and a
 * mis-parsed operand does not merely fail to unwrap — it is taken FOR the
 * command, so the wrapped command disappears from the cmd-keyed rules.
 */
const TIMEOUT_DURATION =
  /^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|0[xX][0-9a-fA-F]*(?:\.[0-9a-fA-F]*)?[pP][-+]?\d+)[smhd]?$/;

const ARGV_LAUNCHERS: ReadonlyMap<
  string,
  {
    valueFlags: ReadonlySet<string>;
    numericOperand: boolean;
    /**
     * Flags whose VALUE is itself a command line the launcher splits and runs
     * (`env -S "cmd args"`). Left out, those words stay invisible to every
     * `cmd`-keyed rule and the launcher itself is classified instead.
     */
    splitStringFlags?: ReadonlySet<string> | undefined;
  }
> = new Map([
  ['nohup', { valueFlags: new Set<string>(), numericOperand: false }],
  ['setsid', { valueFlags: new Set<string>(), numericOperand: false }],
  ['unbuffer', { valueFlags: new Set<string>(), numericOperand: false }],
  ['command', { valueFlags: new Set<string>(), numericOperand: false }],
  ['exec', { valueFlags: new Set(['-a']), numericOperand: false }],
  [
    'env',
    {
      valueFlags: new Set(['-u', '-C', '--unset', '--chdir']),
      numericOperand: false,
      splitStringFlags: new Set(['-S', '--split-string']),
    },
  ],
  ['nice', { valueFlags: new Set(['-n', '--adjustment']), numericOperand: false }],
  ['ionice', { valueFlags: new Set(['-c', '-n', '-p']), numericOperand: false }],
  ['stdbuf', { valueFlags: new Set(['-i', '-o', '-e']), numericOperand: false }],
  [
    'timeout',
    { valueFlags: new Set(['-s', '-k', '--signal', '--kill-after']), numericOperand: true },
  ],
  [
    'sudo',
    {
      // sudo(8)'s value-taking options: user, group, close-from, prompt (the
      // -p prompt is the one a wrapper sets), host, role, type, chdir, chroot,
      // command-timeout, other-user. Every one is documented as taking a value,
      // so that value must never be mistaken for the command being run —
      // `sudo -p pw rm -rf x` read the prompt as the command and reported
      // 'caution' (the bare-`sudo` rule) instead of 'destructive'.
      //
      // Options with NO value are deliberately absent (-n, -b, -E, -H, -k, -A,
      // -S, -v): skipping a token for one of those would swallow the command
      // itself, which is strictly worse than leaving its name visible.
      valueFlags: new Set([
        '-u',
        '-g',
        '-C',
        '-p',
        '-h',
        '-r',
        '-t',
        '-D',
        '-R',
        '-T',
        '-U',
        '--user',
        '--group',
        '--close-from',
        '--prompt',
        '--host',
        '--role',
        '--type',
        '--chdir',
        '--chroot',
        '--command-timeout',
        '--other-user',
      ]),
      numericOperand: false,
    },
  ],
  [
    'doas',
    {
      // doas(1) (man.openbsd.org) is short-option-only. Its VALUE-taking options
      // are -a (authentication style), -C (config file) and -u (user); -n, -s and
      // -L take none, so they stay out of this list for the same reason sudo's
      // no-value options do — skipping a token for one would swallow the command
      // itself, which is strictly worse than leaving its name visible.
      valueFlags: new Set(['-u', '-C', '-a']),
      numericOperand: false,
    },
  ],
]);

/**
 * Words a launcher's split-string flag expands to, or undefined when the
 * leading flag prefix carries none.
 *
 * `env -S "<command line>"` passes a WHOLE command line as one argv token and
 * env splits it before exec'ing the words, so the generic scan inside
 * `unwrapArgvLaunchers` would stop at the flag and keep reporting `env` itself —
 * everything the launcher actually runs stays invisible. Every documented
 * spelling is expanded: `-S <cmd>`, `-S<cmd>`, `--split-string <cmd>` and
 * `--split-string=<cmd>`. Only the LEADING flag prefix is searched: a `-S` that
 * appears after the command name belongs to that command, not to the launcher.
 */
function expandSplitStringWords(
  args: readonly string[],
  splitFlags: ReadonlySet<string>,
  valueFlags: ReadonlySet<string>,
): string[] | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] ?? '';
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue; // VAR=value
    if (token === '--') break;
    if (!token.startsWith('-') || token === '-') break; // the command itself
    const eq = token.indexOf('=');
    const name = eq === -1 ? token : token.slice(0, eq);
    // `-Svalue`: GNU getopt lets a short option's value ride the same token, so
    // `env -S'rm -rf x'` arrives as a single argv entry.
    const glued = [...splitFlags].find(
      (flag) => flag.length === 2 && token.length > flag.length && token.startsWith(flag),
    );
    if (splitFlags.has(name) || glued !== undefined) {
      let inline: string | undefined;
      if (glued !== undefined) inline = token.slice(glued.length);
      else if (eq !== -1) inline = token.slice(eq + 1);
      const value = inline ?? args[i + 1];
      if (value === undefined) return undefined;
      const words = value.split(/\s+/).filter((word) => word.length > 0);
      if (words.length === 0) return undefined;
      // The separated spellings consume the value token as well.
      return [...words, ...args.slice(i + (inline === undefined ? 2 : 1))];
    }
    if (valueFlags.has(name) && eq === -1) i += 1;
  }
  return undefined;
}

/**
 * Peel transparent launchers off an argv pair so the rules see the real
 * command. Bounded at four hops; returns the input unchanged when the shape is
 * not understood, so an unrecognised launcher never silently drops arguments.
 */
export function unwrapArgvLaunchers(
  cmd: string,
  args: readonly string[],
): { cmd: string; args: readonly string[] } {
  let currentCmd = cmd;
  let currentArgs = args;
  for (let hops = 0; hops < 4; hops += 1) {
    const base = currentCmd
      .toLowerCase()
      .replace(/^.*[\\/]/, '')
      .replace(/\.(?:exe|cmd|bat|com)$/, '');
    const spec = ARGV_LAUNCHERS.get(base);
    if (!spec) break;
    // A flag whose VALUE is itself a command line (`env -S "rm -rf x"`): env
    // splits it and runs the words, so expand it before the generic scan.
    if (spec.splitStringFlags !== undefined) {
      const words = expandSplitStringWords(currentArgs, spec.splitStringFlags, spec.valueFlags);
      if (words !== undefined) {
        const command = words[0];
        if (command === undefined) break;
        currentCmd = command;
        currentArgs = words.slice(1);
        continue;
      }
    }
    let i = 0;
    while (i < currentArgs.length) {
      const token = currentArgs[i] ?? '';
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
        i += 1;
        continue;
      }
      if (token === '--') {
        i += 1;
        break;
      }
      if (!token.startsWith('-') || token === '-') break;
      const name = token.split('=', 1)[0] ?? token;
      i += 1;
      if (spec.valueFlags.has(name) && !token.includes('=')) i += 1;
    }
    // `timeout`'s own positional. Accepting only the integer spelling left the
    // decimal forms unparsed, and an unparsed operand is taken FOR the command:
    // `timeout 0.5s rm -rf ./build` unwrapped to cmd `0.5s`, so the wrapped
    // `rm -rf` never reached the cmd-keyed rules and the same delete that
    // `timeout 5 rm -rf ./build` reports as 'destructive' reported 'safe'.
    // Over-accepting a malformed number is harmless — this token position is
    // definitionally the duration, so a skipped token can only be the duration.
    if (spec.numericOperand && TIMEOUT_DURATION.test(currentArgs[i] ?? '')) i += 1;
    const next = currentArgs[i];
    if (next === undefined) break;
    currentCmd = next;
    currentArgs = currentArgs.slice(i + 1);
  }
  return { cmd: currentCmd, args: currentArgs };
}

/** Interpreters whose `-c` / `-e` / `-Command` operand is a command LINE. */
const INLINE_PAYLOAD_FLAGS = new Set([
  '-c',
  '-e',
  '-E',
  '--eval',
  '-eval',
  '-command',
  '--command',
  '-commandwithargs',
]);

const INLINE_PAYLOAD_HOSTS = new Set([
  'bash',
  'sh',
  'zsh',
  'ksh',
  'fish',
  'pwsh',
  'powershell',
  'node',
  'python',
  'python2',
  'python3',
  'perl',
  'ruby',
]);

/** Split a command line into argv, keeping a quoted run as one token. */
function splitPayload(payload: string): string[] {
  return (
    payload
      .match(/"[^"]*"|'[^']*'|\S+/g)
      ?.map((token) => token.replace(/^(['"])([\s\S]*)\1$/, '$2')) ?? []
  );
}

/**
 * The (cmd, args) pair hiding inside an inline interpreter payload.
 *
 * A real invocation ships the payload as ONE argv string —
 * `powershell -Command "Remove-Item -Recurse -Force C:\Users\x"` arrives as
 * `['-Command', 'Remove-Item -Recurse -Force C:\Users\x']`. Every rule here
 * matches its flags per-ARG and anchored, so nothing in that single string
 * matched and the assessment came back `safe` (probe-verified 2026-09-22) — while
 * the artificially pre-split spelling the tests used was flagged. The core-side
 * permission gate joins cmd+args into a line and classified these correctly, so
 * the confirmation still happened; the banner that explains WHY did not.
 *
 * Returned as an extra pair rather than by rewriting the input, reusing the same
 * mechanism the launcher unwrapping already uses — so a rule keyed on the
 * interpreter itself (`inline-eval`, `pipe-to-shell`) keeps firing too.
 */
function inlinePayloadPair(
  cmd: string,
  args: readonly string[],
): { cmd: string; args: readonly string[] } | undefined {
  const base = cmd
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(?:exe|cmd|bat|com)$/, '');
  if (!INLINE_PAYLOAD_HOSTS.has(base)) return undefined;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i]?.toLowerCase();
    if (flag === undefined || !INLINE_PAYLOAD_FLAGS.has(flag)) continue;
    const payload = args[i + 1];
    // Only a payload that actually looks like a command LINE is worth
    // re-reading: a single bare token is already visible to every rule.
    if (payload === undefined || !/\s/.test(payload.trim())) return undefined;
    const tokens = splitPayload(payload);
    const head = tokens[0];
    if (head === undefined) return undefined;
    return { cmd: head, args: tokens.slice(1) };
  }
  return undefined;
}

export function detectDanger(
  cmd: string,
  args: readonly string[],
  bypass?: ReadonlySet<string>,
): DangerAssessment {
  if (typeof cmd !== 'string') return { level: 'safe', reasons: [] };
  const safeArgs = Array.isArray(args) ? args : [];
  const reasons: string[] = [];
  let level: DangerLevel = 'safe';
  let matchedRule: string | undefined;

  // Rules run against the ORIGINAL pair and the unwrapped one: a rule keyed on
  // the launcher itself must keep firing, and the unwrapped pair is what
  // exposes the command it was hiding.
  const unwrapped = unwrapArgvLaunchers(cmd, safeArgs);
  const pairs: Array<{ cmd: string; args: readonly string[] }> =
    unwrapped.cmd === cmd ? [{ cmd, args: safeArgs }] : [{ cmd, args: safeArgs }, unwrapped];

  // …and against the command LINE an interpreter was handed inline. A real
  // `powershell -Command "Remove-Item -Recurse -Force x"` arrives with the whole
  // payload as ONE argv string, which no per-arg anchored flag test can see.
  for (const pair of [...pairs]) {
    const inline = inlinePayloadPair(pair.cmd, pair.args);
    if (inline) pairs.push(inline);
  }

  for (const rule of RULES) {
    if (bypass?.has(rule.id)) continue;
    if (!pairs.some((pair) => rule.test(pair.cmd, pair.args))) continue;
    reasons.push(rule.reason);
    if (matchedRule === undefined || levelRank(rule.level) >= levelRank(level)) {
      matchedRule = rule.id;
    }
    if (levelRank(rule.level) > levelRank(level)) {
      level = rule.level;
    }
  }

  if (level === 'safe') return { level: 'safe', reasons: [] };
  // matchedRule is set above (last winning rule). For exactOptionalPropertyTypes
  // we build the object conditionally so the property is omitted when undefined.
  const result: DangerAssessment = { level, reasons };
  if (matchedRule !== undefined) result.matchedRule = matchedRule;
  return result;
}

function levelRank(level: DangerLevel): number {
  switch (level) {
    case 'safe':
      return 0;
    case 'caution':
      return 1;
    case 'destructive':
      return 2;
  }
}
