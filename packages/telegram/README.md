# @wrongstack/telegram

Telegram bridge for WrongStack — connect your agent to Telegram.
Send messages, receive instructions, get notified when long tasks finish.

## Features

- **`telegram_read`** — Agent reads incoming Telegram messages (newest first, filtered by chat, with ack support)
- **`telegram_send`** — Agent sends messages via Telegram (HTML formatting, confirm permission)
- **Metadata-only inbox notice** — The system prompt reports only an unread count; message content stays behind the explicit `telegram_read` tool boundary
- **Slash commands** — `/telegram`, `/telegram-health`, `/telegram:send`, `/telegram:chatid` in the TUI
- **Event notifications** — Session end summaries and long tool completions forwarded to Telegram
- **Allowlist filtering** — Restrict which users/chats can interact with the bot
- **Zero dependencies** — Uses Node.js native `fetch`, no third-party Telegram libraries

## Quickstart

### 1. Create a bot

Message [@BotFather](https://t.me/BotFather) on Telegram:
```
/newbot
```

Copy the token (looks like `123456789:ABCdef...`).

### 2. Enable the official plugin

```bash
wstack plugin install telegram
```

`telegram` is the bundled official alias for `@wrongstack/telegram`, which
ships with WrongStack; this command only enables plugin loading in config and
does not install anything.

A custom host can use the plugin only from inside the WrongStack monorepo, as
`"@wrongstack/telegram": "workspace:*"`. It is not published to npm: npm
publishing was retired after 1.1.11, and the versions already on npm are
frozen.

### 3. Pair a private chat securely

Run `/telegram-setup` in WrongStack. Enter the bot token in the masked prompt,
message the bot once from the private Telegram account you want to pair, then
explicitly select that discovered identity. WrongStack does not print or ask
you to open a credential-bearing Bot API URL.

### 4. Configure manually (optional)

The setup command writes this configuration securely. For custom hosts, the
equivalent shape in the active `~/.wrongstack/profiles/<name>/config.json` is:

```jsonc
{
  "features": {
    "plugins": true
  },
  "plugins": ["@wrongstack/telegram"],
  "extensions": {
    "telegram": {
      "botToken": "123456789:ABCdefGHIjkl...",
      "notifyChatId": "987654321",
      "inboundMode": "paired",
      "allowedUsers": [987654321],
      "allowedChats": [987654321],
      "allowedOutboundChats": [987654321],
      "notifyOnSessionEnd": true,
      "longToolThresholdMs": 30000,
      "pollIntervalSec": 2
    }
  }
}
```

The `plugins` array controls loading. `extensions.telegram` stores this
plugin's options.

The plugin loads on the next WrongStack start. Use
`wstack plugin disable @wrongstack/telegram` and
`wstack plugin enable @wrongstack/telegram` to turn it off/on without deleting
the Telegram options.

## Configuration reference

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `botToken` | `string` | **yes** | — | Bot token from @BotFather |
| `notifyChatId` | `string \| number` | no | — | Default chat for outgoing messages and notifications; it is also the paired chat when `inboundMode` is `paired` |
| `inboundMode` | `disabled \| paired \| allowlist \| public` | no | `disabled` | Inbound authorization policy. `public` must be selected explicitly. |
| `allowedUsers` | `(string \| number)[]` | no | `[]` | Immutable user IDs accepted by paired/allowlist authorization and remote approvals |
| `allowedChats` | `(string \| number)[]` | no | `[]` | Chat IDs accepted when `inboundMode` is `allowlist` |
| `allowedOutboundChats` | `(string \| number)[]` | no | `[]` | Additional explicitly trusted outbound targets beyond `notifyChatId` |
| `allowGroupChats` | `boolean` | no | `false` | Let `/telegram-settings chat` select a negative group/channel ID as an outbound-only target |
| `allowGroupApprovals` | `boolean` | no | `false` | Permit approvals in a group target; still requires explicit `allowedUsers` identity binding |
| `pollIntervalSec` | `number` | no | `2` | How often to poll Telegram for new messages (1–60) |
| `notifyOnSessionEnd` | `boolean` | no | `false` | Send token usage summary when a session ends |
| `longToolThresholdMs` | `number` | no | `30000` | Notify when a tool runs longer than this (ms). `0` = off |
| `maxMessageLength` | `number` | no | `4000` | Max chars per outgoing message (Telegram limit: 4096) |
| `singleInstanceLock` | `boolean` | no | `true` | Elect a single poller per bot token across wstack instances. Extra instances stand by and take over when the active one stops (prevents HTTP 409 conflicts) |

## Tools

### `telegram_read`

Read buffered incoming messages.

```jsonc
// Read all recent messages
telegram_read()

// Read from a specific chat
telegram_read(chat_id: "987654321", limit: 5)

// Read and acknowledge (clear from buffer)
telegram_read(ack_last: 42)
```

Permission: `auto` | Category: `Telegram`

### `telegram_send`

Send a message to a Telegram chat.

```jsonc
// Send using default chat
telegram_send(message: "Build succeeded ✓")

// Send to a specific chat
telegram_send(chat_id: "123456", message: "Deploy complete. Check staging.")
```

Permission: `confirm` | Category: `Telegram`

Message text supports Telegram HTML: `<b>bold</b>`, `<i>italic</i>`, `<code>mono</code>`, `<a href="...">links</a>`, `<pre>code blocks</pre>`.

## Slash commands (TUI)

| Command | Description |
|---|---|
| `/telegram` | Plugin-name alias for Telegram bot health. |
| `/telegram-health` | Explicit Telegram bot health command: connection, polling config, allowlist stats, notification settings. |
| `/telegram:send [chat_id] <msg>` | Send a message from the terminal |
| `/telegram:chatid` | Show the configured default chat ID |

## How it works

```
┌─────────────────┐     poll      ┌──────────────┐
│  Telegram API   │◄──────────────│  TelegramBot  │
│  (getUpdates)   │──────────────►│  (buffer)     │
└────────┬────────┘   updates     └──────┬───────┘
         │                               │
    user sends                      ┌────▼───────┐
    "build failed?"                 │  PluginAPI  │
                                    │  .emitCustom│
                                    │  .contrib.  │
                                    └────┬───────┘
                                         │
                               ┌─────────▼─────────┐
                               │  Agent sees inbox │
                               │  in system prompt │
                               │  calls read/send  │
                               └───────────────────┘
```

1. Bot polls Telegram every N seconds via `getUpdates`
2. Incoming messages go into a circular buffer (50 max)
3. A system prompt contributor exposes only the bounded unread count
4. Agent explicitly reads content with `telegram_read`, then responds with `telegram_send`
5. Custom event `telegram:message_received` fires for TUI panels / other plugins

## Events

| Event | Payload | When |
|---|---|---|
| `telegram:message_received` | `TelegramIncomingMessage` | Incoming message passes allowlist |
| `session.ended` | session summary → Telegram | If `notifyOnSessionEnd: true` |
| `tool.executed` | tool result → Telegram | If duration > `longToolThresholdMs` |

## License

MIT
