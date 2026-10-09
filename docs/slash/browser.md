# /browser — Browser setup

`/browser` shows Chromium readiness and this project's allowed private origins.
`/network` is an alias. Origin allowances also apply to `fetch` and
`read_url_content`, so one project allowance serves all three paths.
You can omit `http://` for loopback addresses with a port:
`/network allow localhost:3000`.

| Command | Effect |
|---|---|
| `/browser install` | Install this runtime's Chromium revision immediately |
| `/browser allow http://localhost:3000` | Save an exact project origin allowance and apply it to active browsers |
| `/browser remove http://localhost:3000` | Revoke that saved allowance immediately |

`browser_open` automatically downloads missing Chromium before launching it.
If Playwright itself is absent (including a standalone executable), it is installed
in a versioned user cache under `~/.wrongstack/runtime/playwright`; the project
dependency files are untouched. Standalone binaries use their embedded Bun
runtime; Node-based installations use npm from PATH for this fallback.
Concurrent first opens share the download. Failed downloads report their error;
a later call can retry. Installation does not require pnpm or npx. Linux system
libraries still need the system administrator's normal package installation.

Origin allowances live in `~/.wrongstack/projects/<project-slug>/browser-policy.json`
(honoring `WRONGSTACK_HOME`). Protocol, hostname and port must match; redirects and subresources
continue through the same network guard. Environment allowances from
`WRONGSTACK_BROWSER_PRIVATE_ORIGINS` remain supported and must be removed from
the environment to revoke them. Tool permission prompts remain governed by
the session's permission policy.

Access failures include the exact `/browser allow <origin>` command. The TUI
also shows it as a warning outside collapsed tool output; blocked redirect
errors and subresource network evidence retain the same guidance.
