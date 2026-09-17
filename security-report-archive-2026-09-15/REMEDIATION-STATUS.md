# Remediation Status: security-check 2026-09-15

Source: `SECURITY-REPORT.md`, HEAD `ed3689988`. Fixes are uncommitted in the working tree. Every guard below was **injection-validated** (SECURITY.md rule 3): the vulnerability was temporarily re-introduced, the named test went red, and the file was restored byte-for-byte (`cmp`).

| Finding | Status | Fix | Guard (red when re-introduced) |
|---|---|---|---|
| **NV1: Windows bare-exe cwd search** | **Confirmed High → FIXED** | `core/utils/win32-exe-search.ts` `hardenWin32ExecutableSearch()`: called at CLI (`cli-entry-point.ts`), desktop (`main.ts`) and standalone WebUI (`webui-server/src/server/entry.ts`) entry; `buildChildEnv` forces the variable into every child env after extras and in passthrough mode | `core/tests/utils/win32-exe-search.test.ts` (1 red); self-check cases prove the planted binary is detected on this machine |
| WS-2026-09-15-01: HQ `/ws/client` auth floor (Medium) | **FIXED** | `hqClientAuthRequired = clientTokens.size > 0 \|\| hqAuthRequired(mutableAuth)`; `hq token list --client` no longer reports OPEN MODE when a browser credential exists; SECURITY.md + `docs/subcommands/hq.md` updated | `cli/tests/hq-auth-floor.test.ts` (4 red: 3 predicate + 1 end-to-end tokenless upgrade) |
| WS-2026-09-15-02: in-process revocation leaves sockets open (Low) | **FIXED** | `hq-server.ts`: every HTTP request snapshots session ids; after the handler, sockets bound to removed sessions are closed with 1008. Covers session revoke, password change/removal, TOTP enable, logout. Idle sweep deliberately excluded | `cli/tests/hq-session-revoke-closes-browser-socket.test.ts` (1 red; negative control stays open) |
| TD-001 hardening: `diff` path-shaped refs | **FIXED** | `diff.ts`: refuses absolute/drive/`..`-segment refs (`refLooksLikeOutsidePath`), always passes `--`, `findGitDir` bounded at `projectRoot` | `tools/tests/diff-outside-ref.test.ts` (2 red) |
| NV2: `client.hello` clientId not bound to token | **OPEN: owner decision** | Needed: are client tokens issued to mutually less-trusted principals? If yes, refuse a supersede whose token differs from the registered one | none |
| DEP-NV-001: `pnpm audit` on updated lockfile | **OPEN** | CI `audit.yml` covers high+; a local run needs a registry call | none |

## NV1: why it moved from needs_validation to confirmed

Scratch-dir probes with harmless files: `whoami.exe` renamed, and a `.cmd` that echoes. Node 24.13 and Bun 1.4.2 behaved the same:

- **libuv:** a binary present only in the cwd ran, and a planted `rg.exe` ran **instead of** the real ripgrep on PATH. libuv honours `NoDefaultCurrentDirectoryInExePath` from the **spawning** process's environment.
- **cmd.exe `call "<bare>"`:** planted `npx.cmd` ran instead of the real npx. It honours the variable from its **own** environment, which `buildChildEnv` previously stripped.

**Probe pitfall:** this development session's environment already carries `NoDefaultCurrentDirectoryInExePath=1`, and it is not in the User or Machine registry. A naive probe from the session therefore shows no vulnerability. The variable has to be removed from the parent process, e.g. `env -u NoDefaultCurrentDirectoryInExePath node …`.

**Behaviour change:** inside WrongStack child processes, a program in the current directory must be invoked as `.\name`. There is no opt-out, deliberately.

## Verification run
- Targeted suites (18 files): 282 passed, 1 skipped.
- Typecheck: `tsc --noEmit` clean for core and tools. After a core build, `pnpm typecheck` passed (exit 0) for cli, webui-server and desktop.
- Broad regression (cli HQ, tools, core utils/hq/architecture, acp, mcp, security-scanner): 8,545 passed, 10 skipped, **1 failed**. The failure was `hq-browser-token-auth.test.ts` › "token mode: /ws/client connections are exempt from token validation", which asserted the WS-2026-09-15-01 vulnerability itself (tokenless `/ws/client` accepted while a browser token exists). It is inverted to "rejected when only browser tokens exist", and a positive case was added for a live client token. Now 9/9 pass, and restoring the old predicate turns the inverted test red.
- Injection runs: every fix reverted in turn, named test red, file restored and `cmp`-verified.
