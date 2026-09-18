# TUI interface follow-up — 2026-09-18

This pass extends the F1–F12 review to pickers, approvals, structured questions,
foreground ownership and sidebar dismissal.

## Confirmed repairs

| Surface | Reproduced problem | Result |
| --- | --- | --- |
| Tool approval | Ctrl+C could be interpreted as the plain `c` command-trust action; other modified letters also triggered decisions. | Only unmodified decision keys are accepted. Ctrl+C remains an interrupt. |
| Approval pointer/layout | Visible buttons did not respond to mouse clicks; long diffs displaced controls. | Each button uses measured hit geometry; the preview scrolls while controls remain visible. One decision is accepted per prompt. |
| Structured questions | A new request reused old answers; later requests displaced pending ones; repeated submit resolved twice. | FIFO pending requests, per-request form state, and one-shot submission. |
| Question controls | Ctrl+D delegated unintentionally; Ctrl+C had no route to the interrupt ladder; resize required another input event. | Modified-key isolation, cancellation/interrupt forwarding, resize subscription, whole-grapheme backspace, contextual hints. |
| Model/provider chooser | Provider lists were unbounded and model rows ignored the allocated height. | Both steps keep the selected item within the measured budget. |
| Theme/autonomy/resume | Minimum list sizes and wrapped rows exceeded short viewports. | Measured budgets take precedence; compact rows retain selection and exit controls. |
| File/command chooser | File lists were unbounded; category rows and descriptions overfilled command menus. | Windowed, height-budgeted lists with bounded rows. |
| Settings | Live PTY resize to 52×16 clipped the title; the displayed F5 close hint was wrong. | Uses the app's actual row/column allocation; compact rows keep title, current value and Esc visible. |
| Picker cancellation | Right-click directly closed reducer state, bypassing OAuth cancellation and inline confirmation handling. | Right-click follows the picker Escape lifecycle. |
| Foreground ownership | Suspended monitors disabled foreground picker scrolling; background surfaces consumed visible space beneath approvals. | Foreground pickers retain their own input; blocked surfaces keep state but leave the visible layout. |
| Operational monitors | A `y` meant for a foreground approval could also confirm a pending cron cancellation underneath; panel commands leaked into the composer. | Cron, connections, context and goal-kanban share keyboard ownership and suspend all local input behind foreground prompts. |
| Sidebar/phase monitor | Sidebar twins had no local Esc handler; the phase monitor was incorrectly classified as owning Esc. | Central dismissal closes these surfaces without interrupting work. |

## Evidence and validation boundaries

New tests reproduce failures before changes and cover request lifecycles,
modifier isolation, pointer targets, short viewports and picker/modal ownership.
The settings fix additionally follows a failure observed in the built CLI's
real Windows PTY test, rather than only a component test.

The PTY test covers F1–F12 at 110×40 and 52×16, preserved composer drafts,
statusline editing, and `/model`, `/theme`, `/settings`, `/resume` at 52×16.
It uses isolated temporary configuration with a local stub provider; it does
not exercise live LLM streaming, real OAuth login or external tool execution.
Linux/macOS live terminal behavior and the complete release gate remain
separate validation scopes. Existing history/sidebar/clipboard regression
suites run as part of the full TUI package, not as new live-backend tests.

Final local validation: 360 TUI test files / 5,979 tests passed, plus four
dedicated statusline color tests. Source/test typecheck, local build, scoped
Biome and `git diff --check` passed. The repository test-typecheck ratchet
reported zero new diagnostics. The expanded real Windows PTY test passed
in 68.49 seconds, including the previously failing short settings viewport.
