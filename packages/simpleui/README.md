# @wrongstack/simpleui

The intentionally small WrongStack browser surface: one project, one chat,
model selection, context pressure, a compact subagent roster, and persistent
dark/light themes. The composer remains anchored to the viewport bottom.
A compact header switcher creates a new session or resumes one of the 12 most
recent auto-saved sessions; management actions stay in the full WebUI.
Unsent composer text and file references are restored per session. Long chats
show a small `LATEST` return control only while the reader is away from the bottom.
The compact right-side workspace launcher exposes tool calls, live todos, structured
tasks, and the persistent plan. Worklists reuse the existing WebSocket, fetch only
when first opened, and render from a sidebar-local store so chat does not rerender
for every work-item broadcast.

Prompts are sent directly as `user_message` frames; SimpleUI never invokes the
optional WebUI prompt-refinement route. Canonical `<nextsteps>` metadata is
removed from assistant prose and rendered as compact, clickable suggestions.
Completed assistant replies expose a small hover-only copy action.
Typing `@` opens the project-scoped file picker; selected files stay visible as
removable chips and are sent using the same `@relative/path` convention as the
full WebUI.

Mailbox heartbeat and presence tracking continue in the background. Routine
status/BTW/note/broadcast traffic is kept out of model context; actionable
steer/ask/assign/result/review messages still reach the agent so autonomous
coordination does not silently lose work.

## Production

Build the frontend, then launch the backend (which serves both the built
frontend and the WebSocket chat protocol on the same port):

```sh
pnpm --filter @wrongstack/simpleui build
wstack --simpleui --open
```

The server binds to `127.0.0.1:3466` by default.

## Development (hot-reload)

During UI development, the Vite dev server serves the frontend on port 3466,
but it does **not** host the WrongStack chat-protocol WebSocket. You need
the backend running on a separate port.

### Workflow

```sh
# Terminal 1: start the backend on a custom port
wstack --simpleui --port 3467

# Terminal 2: start Vite dev server, pointing at the backend
WRONGSTACK_BACKEND_PORT=3467 pnpm dev
```

The Vite dev server injects a `<meta name="wrongstack-ws-url">` tag into
`index.html` so the frontend connects its WebSocket to the backend instead
of trying to open it against the Vite server. Port 3467 is just an example —
use any free port.

## Autonomous profile

For an explicit, runtime-only autonomous profile, launch with
`wstack simpleui --full-auto --open`. This enables YOLO, Director, autonomy,
and configured tools for that process without changing saved defaults. Absolute
deny rules and project-root containment remain enforced.

## Interface language

SimpleUI chrome is English-only by design. The full WebUI carries the
localized experience (7 locales); SimpleUI stays single-locale on purpose —
no i18n runtime, no locale catalog maintenance, no locale-parity gates for
a deliberately minimal surface. If that scope ever changes, adopt the WebUI
pattern (`src/i18n/locales/<locale>/*.json` plus the catalog-integrity and
t()-reference tests) instead of introducing a second mechanism here.
