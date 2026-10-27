# Desktop v2 chat and composer parity

This is an action inventory, not a completion percentage. The desktop owns all rendering and
interaction; WebUI files below are reference evidence only. A matching button or protocol name
does not establish working parity. Native evidence must name the tested portable build and scope.
The broader [feature inventory](desktop-v2-feature-parity.md) continues to cover every other domain.

## Keep the conversation calm

The resting composer shows the draft, current session model, reasoning effort, one delivery-mode
selector and one submit button. Running turns add stop controls. An empty queue occupies no space;
a populated queue is a collapsed summary. Prompt refinement opens a focused review dialog rather
than adding another permanent panel. Advanced controls belong in contextual menus and dedicated
workspaces. A plain textarea plus submit is not sufficient feature parity.

## Action inventory

| Area | Desktop implementation | Remaining work / limits |
|---|---|---|
| Draft entry | Auto-growing textarea, Enter submit, Shift Enter newline, IME composition guard, session-isolated text, references, attachments and delivery mode stored in native SQLite and restored on UI restart; ordered saves and acknowledged cleanup, error reporting, duplicate-submit lock and draft retained on refusal | Simultaneous editing of the same session in multiple windows; complete focus/shortcut matrix |
| Model selection | Inline session chip, provider selector, model search, current selection, acknowledged engine switch, provider settings link | Favorites, disabled-model policy presentation, richer capability/pricing/context details, variants, catalog refresh/testing and full quick-switch parity |
| Reasoning effort | Session preference with readback; Auto inheritance; active-model advertised vocabulary; retain visibly unsupported saved choices; hide only explicit non-support; live project/leader hint | Native cases for every provider vocabulary and leader override/reset; separate reasoning mode/preserve controls where supported |
| Subagent model plans | Existing profile routing settings | Session composer access to lane/role plans, companion policy and current effective assignments |
| Ordinary send / BTW | Idle uses the real human user-turn path with correlated acceptance/refusal; it does not substitute a queued runtime input. During a run, BTW sends acknowledged mailbox mail to this session’s leader without aborting or claiming a new turn | Inline delivery/read/processing receipt history; image-aware fallback and the topic-boundary advisor below |
| Persistent queue | Engine-owned queue, acknowledged add/get/remove/clear, collapsed summary, copy text to draft with overwrite guard, queued user turn appears once when drained; late snapshots cannot restore already-started prompts | Display sorting, richer queue panel and longer restart/stress cases. View sorting must not silently reorder engine FIFO execution |
| Steer | Stop the active turn, wait for actual completion, then submit the replacement instruction; failure retains draft | Existing queued work must be removed explicitly before steering. Atomic prioritization with a nonempty queue needs a canonical engine contract; never silently clear or bypass the queue |
| Stop / stop and edit | Explicit abort; restore the last user prompt; existing unsent text requires a replace/keep choice | More native error/race coverage, queued-turn handoff explanation and partial-output recovery |
| Refinement preference | Manual refinement and the profile's real refine-before-send preference | Countdown/delay policy and optional automatic submission require a separate deliberate UX; no hidden auto-send is implemented |
| Refinement review | Real `model.refine`, original/refined/English versions, Markdown preview, editable approved text, keep original, use in composer, explicit approve/send preserving the captured delivery mode | Retain in-flight previews across workspace/app restart, richer change comparison and provenance |
| Refinement retry | Retry feedback, longer retry budget, optional independent provider/model IDs; configured refiner/fallback policy remains server-owned | Searchable refiner picker, surfaced fallback choice and structured timeout/error-kind guidance; provider-quality validation |
| Refinement safety | Original draft remains until acceptance; late detached replies are ignored; invalid/empty result is not rendered as a successful rewrite | Broader reconnect and concurrent draft replacement cases |
| Topic changes | Not implemented | Canonical topic advice, explain why a fresh context is suggested, explicit same-context/fresh-context choice, preserve choice through refinement |
| Images / PDFs | Desktop picker/paste/drop, local image decoding/signature normalization/downscaling, separate image/PDF counts and byte budgets, thumbnails/named PDF cards/remove/clear, per-session durable draft media, actual binary transport through direct/queue/steer/refinement, engine refusal with draft retention, conversation image preview and canonical replay, stop/edit media restoration. Native frames now support bounded media; older hosts refuse oversized sends before transfer | Full document viewer, broader image-format/compression and real-provider capability/fallback proof, richer PDF queue-copy/restoration. Queue copy explicitly copies text only when binary files remain in the engine queue |
| File references | Project-owned `@` file picker, keyboard selection without submit, per-session file chips across tab switches, explicit full-read contract bound to the project root, human chat chips instead of wire metadata; references remain attached through refinement and are restored by stop/edit or queue copy | Line/range/snippet selection chips, bounded content previews where useful, durable reference drafts across app restart |
| Skill references | Canonical `$skill-name` detection/matching/insertion, live project catalog, Enter/Tab/click insertion without submit, caret restoration and literal-code safeguards; separate full skill library | Rich invocation/resource-progress visibility and durable drafts; external model skill compliance is not established by picker tests |
| Paste ergonomics | Plain text plus image/PDF clipboard and mixed text/file handling | Code detection/fenced-code hint, dismiss/undo and broader document paste policy |
| Speech | Not implemented | Supported-platform detection, permission/start/stop state, transcript insertion without overwriting a draft; unsupported platforms must not show a fake microphone |
| Prompt recall | Up/Down input history with sticky draft and caret restoration; pickers own their navigation keys before submit/history handling | Durable recall history independent of the conversation transcript, richer history search and reference-aware recall |
| Prompt library | Project/chat entry points, source ownership, search/category/favorites/recent, actual detail variants, required/default/enum/multiline template variables, Markdown preview, append-to-draft/copy, new user template creation, readback and unsaved-close guard | Atomic same-title create conflict handling; expanded authoring metadata. Existing canonical WebUI handlers expose list/content/create/favorite/used/recent, not invented edit/delete/export endpoints |
| Prompt journal | Dedicated composer history shortcut; real project original/refined records, exact session/date/category filters, bounded windows, search, full Markdown detail and append reuse. Standalone user-input journal recording and persisted original/final refinement metadata are wired through Core’s writer; runtime auto-wakes are excluded | Export, larger-history paging/performance and richer links to turn IDs. Journal reads remain project-owned; the visible history shortcut stays beside the composer |
| Slash commands | Native registry with keyboard completion/help, aliases, queue/BTW/steer arguments, project files/review/skills/Memory/Kanban/Atlas navigation, prompt library/journal, settings, refinement and context controls; unsupported commands keep the draft and do not reach the agent; literal slash text uses `//` | Remaining WebUI command families must be backed by their real desktop workspaces before being offered |
| MCP in composer | Separate connection management exists | Prompt/resource discovery, argument forms, resolution/attachments, tool invocation and task status where supported |
| Next steps | Canonical suggestions from completed engine turns or successful nextsteps tools; select and append to the existing draft for explicit submission through normal delivery and refinement | Automatic countdown/policy variants and broader native lifecycle coverage |
| Token/context feedback | Existing reported usage/estimated cost distinction plus session-owned calibrated context breakdown, tool/message estimates, explicit effective-instruction read, acknowledged repair/normal or aggressive compaction, guarded provider-context clear with session/disk identity retained | Draft token estimate, full validated context editor/apply, mode authoring, residency/retention visualization and richer compaction feedback |
| Message rendering | Per-turn assistant reply ownership even with reused wire stream IDs; streaming Markdown, tables/code/copy, links and question forms. Session activity groups tool input/output, thinking, retries, timing, file links and evidence by run and agent | Inline chronological presentation, complete media viewing, all tool-specific visualizations and large-transcript virtualization |
| Message/session actions | Copy, persisted session identity, reload/restart reattach and tabs | Edit/resend/retry, history search, fork/resume/inspect/story, checkpoints/rewind/recovery and durable review threads |
| Permission interaction | Readable commands and complete arguments, edit diff previews, risk and policy explanations, exact/command/tool remembered-allow scopes, denial choices and engine-acknowledged resolution | Broader policy/error and concurrent-session native coverage; more tool-specific previews |
| Multi-project/session safety | Native project/session ownership; queue, model, effort and mailbox operations use the owning engine's session; foreign conversation frames are ignored | Native cross-session/cross-project stress with concurrent queues, refinement, model switches and approvals; fleet-wide approvals |
| Accessibility / density | Keyboard-operable native dialogs, named controls, compact layout, existing light/dark and canonical palettes | Screen-reader pass, focus restoration, all popover escape/outside-click paths, high contrast and long localized labels |

## Reference surfaces reviewed

- [ChatInput](../packages/webui/src/components/ChatInput.tsx),
  [submit routing](../packages/webui/src/components/ChatInput/use-chat-submit.ts),
  [button bar](../packages/webui/src/components/ChatInput/composer-button-bar.tsx),
  [keyboard ownership](../packages/webui/src/components/ChatInput/use-chat-keydown.ts).
- [Effort](../packages/webui/src/components/ChatInput/session-effort-select.tsx),
  [model switcher](../packages/webui/src/components/QuickModelSwitcher.tsx),
  [subagent model plans](../packages/webui/src/components/ChatInput/subagent-models-button.tsx).
- [Refinement](../packages/webui/src/components/ChatInput/refine-panel-host.tsx),
  [queue projection](../packages/webui/src/components/ChatInput/use-prompt-queue-view.ts),
  [queue rows](../packages/webui/src/components/ChatInput/queued-messages.tsx),
  [prompt library](../packages/webui/src/components/PromptLibraryModal.tsx),
  [prompt journal](../packages/webui/src/components/PromptJournalView.tsx).
- Canonical backend: [queue](../packages/webui-server/src/server/session-prompt-queue.ts),
  [conversation operations](../packages/webui-server/src/server/conversation-operations.ts),
  [model/refinement](../packages/webui-server/src/server/model-operations.ts),
  [mailbox](../packages/webui-server/src/server/mailbox-handlers.ts),
  [session preferences](../packages/webui-server/src/server/session-scoped-prefs.ts).

## Verification scope

`bun apps/desktop-v2/tests/native-smoke.mjs --release --bundled --composer` exercises a dedicated
composer scope in the real Tauri/WebView2 application, copied portable executables, production
backend and authenticated local provider. `--companion` also exercises the companion-host path.
This explicitly scoped result does not replace the default full native suite, certify all
project/settings workflows, or claim live external-provider quality. The default full suite also
includes the composer exercise. See the [validation record](desktop-v2-validation.md).
