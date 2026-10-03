import { argMatches, flagLetters, isPowerShellCmd } from './_danger-rule-utils.js';
import type { DangerRule } from './_danger-types.js';

export const FILESYSTEM_DANGER_RULES: readonly DangerRule[] = [
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

  // ----- rsync --delete*: recursive, prompt-less delete of the DESTINATION -----
  // Every destination file the source lacks is removed — the same operation
  // class as `rm -rf <dir>`, which is destructive for any path. A dry run
  // (`-n` / `--dry-run`, also inside a short cluster) only lists and is exempt.
  {
    id: 'rsync-delete',
    level: 'destructive',
    test: (cmd, args) =>
      /^rsync(?:\.exe)?$/i.test(cmd) &&
      args.some((a) => /^--del(?:ete(?:-[a-z]+)?)?$/.test(a)) &&
      !args.some((a) => a === '--dry-run' || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a)),
    reason: 'rsync --delete (removes destination files missing from the source)',
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
      // PowerShell also binds any unambiguous parameter-name PREFIX: `-rec`,
      // `-recu` … are -Recurse and `-fo`, `-forc` are -Force.
      const hasRecurse = argMatches(args, /^-(?:r|re(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)(?::\$true)?$/i);
      const hasForce = argMatches(args, /^-(?:f|fo(?:r(?:c(?:e)?)?)?)(?::\$true)?$/i);
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
];
