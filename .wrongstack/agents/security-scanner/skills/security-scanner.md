## Commands

- Compare moved guard constants mechanically: `git show <ref>:<old-path>` piped to `Compare-Object` against the new location; eyeballing misses drops.
- Scope extraction regexes to the named block, e.g. inside `WELL_KNOWN_...` to `]);` — an unscoped `'[A-Z_]+',$` swallows sibling uppercase constant lists and inflates "dropped entries."
- Run `git status` before reading a diff. A tracked importer depending on an untracked new module means the security control breaks on fresh clone unless both land together.

## Conventions

- Two-tier SSRF posture, do not invent a third:
  - `packages/mcp/src/transport-security.ts` → `validateTransportUrl` is **syntactic / hostname-based** for admin-configured URLs.
  - `assertNotPrivate` (fetch tool path) is **resolution-bound**.
  - Recommendation pattern: reuse the resolution-bound check at MCP transport connect time.
- Prompt-firewall scopes are asymmetric in `redact` mode:
  - `collectText()` in `packages/plugins/src/prompt-firewall/secret-detection.ts` scans only `request.system` + `request.messages`.
  - `wrapProviderRunner` in `packages/plugins/src/prompt-firewall/index.ts` redacts only when detection fired.
  - Credentials in non-message fields (e.g. `tools[].description`) bypass both — audit scope mismatch, not just regex quality.

## Pitfalls

- TUI sanitization: the central sanitizer is `sanitizeTerminalText` in `packages/tui/src/terminal-width.ts` (OSC/DCS/CSI/C1 strip). Coverage gaps cluster in:
  - `confirm-prompt.tsx` flat diff fallback
  - `shell-command-warning.tsx`
  - slash-command echo in `kill-slash.ts` / `ps-slash.ts`
  - Grep the **sink**, not the sanitizer, to find bypasses.
- React error boundaries in the TUI must not call `console.error` for diagnostics — use `silenceTerminal()` in `packages/tui/src/terminal-silence.*`; otherwise unsanitized error text reaches the terminal escape parser.
- When a constant list moves out of a security guard, the failure mode is *forgetting to move a specific entry*, not malformed regexes. Trust the diff comparison over human inspection.
