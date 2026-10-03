import type { DangerRule } from './_danger-types.js';

export const EXECUTION_DANGER_RULES: readonly DangerRule[] = [
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

  // ----- download-and-run, the other canonical forms (destructive) -----
  // Mirrors core yolo-risk's download-and-run patterns, which `pipe-to-shell`
  // alone missed: the PowerShell cradle with `iex` FIRST
  // (`iex (New-Object Net.WebClient).DownloadString(…)`), a downloaded script
  // piped into an interpreter reading it from stdin (`curl … | python3 -`, but
  // not `| python3 -m json.tool`), and `deno run <url>`.
  {
    id: 'download-and-run',
    level: 'destructive',
    test: (cmd, args) => {
      const line = [cmd, ...args].join(' ');
      return (
        /\b(?:iex|Invoke-Expression)\b[^;&\n]{0,300}\b(?:DownloadString|DownloadFile|Net\.WebClient|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i.test(
          line,
        ) ||
        /\b(?:curl|wget|fetch|httpie|http|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[\s\S]{0,300}\|\s*(?:sudo\s+)?(?:python[0-9.]*|node|perl|ruby|php)(?:\.exe)?(?=\s*(?:$|[;&|)]|-(?:\s|$)))/i.test(
          line,
        ) ||
        /\bdeno(?:\.exe)?\s+run\b[^;&|\n]{0,300}\bhttps?:\/\//i.test(line)
      );
    },
    reason: 'network-fetched code executed (download-and-run pattern)',
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
