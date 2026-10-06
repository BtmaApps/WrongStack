# Typed WebUI client API

`@wrongstack/client` connects to a running WebUI server and shares its wire
types with `@wrongstack/webui-protocol`. Use it for session prompts, streamed
events, confirmations and HTTP session inspection. It is separate from ACP
editor integration and from the in-process Core `Agent` API.

## Run a prompt

Start `wstack --webui` and use that server's URL and access token:

```ts
import { WrongStackClient } from '@wrongstack/client';

const client = await WrongStackClient.connect({
  url: 'http://127.0.0.1:3456',
  token: process.env.WEBUI_TOKEN,
});

try {
  const run = client.send('Summarize README.md');
  for await (const event of run) {
    if (event.type === 'provider.text_delta') {
      process.stdout.write(event.payload.text);
    }
  }
  const result = await run.result;
  console.log(result.status, result.error?.detail);
} finally {
  client.close();
}
```

`run.result` settles with the structured outcome. `run.text()` is a shortcut
that throws when the run did not finish. `run.abort()` requests interruption.
For approval requests, supply `onConfirm` or answer later with
`run.confirm(id, decision)`. Receiving a prompt/tool frame does not approve it.

## Session and connection lifecycle

`newSession()` and `resumeSession(id)` change the client's current session;
`send(text, { sessionId })` can explicitly target one. `listSessions(limit)`
reads saved sessions. A busy/unready session or failed agent run produces a
structured server error. The server's duplicate-prompt guard can report a
successful zero-iteration result for an accidental immediate repeat.

`client.on(type, listener)` observes other server frames, with unknown payload
types for extensions outside the conversation core. `client.post(frame)` sends
additional frames; use the current wire contract for their payloads. Structured
user-input forms and tool confirmations are distinct protocol operations.

Connection state is `open`, `reconnecting` or `closed`, observable through
`onStateChange`. Reconnect catches up through the server's bounded frame log.
While reconnecting, `send`/`post` fail with retryable `connection/reconnecting`.
Retry attempts/delays are configurable; `reconnect: false` makes a drop final.
A restarted server yields `server_restarted`; an unavailable finished-run
result yields `result_lost`. Neither is a successful completed response.

## HTTP and other languages

```ts
import { createHttpClient } from '@wrongstack/client';

const api = createHttpClient({
  url: 'http://127.0.0.1:3456',
  token: process.env.WEBUI_TOKEN,
});
const sessions = await api.listLiveSessions();
console.log(sessions);
```

HTTP errors use stable kinds/codes and retryability. For clients in another
language, the protocol package publishes `schema/ws-core.schema.json` and
`schema/openapi.json`. These generated contracts, rather than a copied message
shape, own API compatibility.

Sources: [`client exports`](../packages/client/src/index.ts),
[`client lifecycle`](../packages/client/src/client.ts),
[`HTTP client`](../packages/client/src/http.ts).
The [package reference](../packages/client/README.md) details options and error
kinds. See [WebUI](webui.md) and [ACP integration](acp-editor-integration.md).
