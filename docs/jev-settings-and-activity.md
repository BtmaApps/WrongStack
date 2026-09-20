# Jev settings and activity

Open **WebUI → Settings → Jev** to select TypeSafe, OpenRouter Decisions or a
custom endpoint; add, replace or remove the profile API key; override the model
and request timeout; and enable or disable each consumer. The saved key is never
returned to the browser. Changing providers clears the old credential, endpoint
and model. A route-specific environment key can still apply after removing the
saved key.

**Test saved connection** sends one small, billed decision request. It uses the
saved settings, so save edits first. Configuration status is not a connectivity
test. Existing sessions should be restarted to apply changes to all consumers:
some clients and feature middleware are created at boot.

In the TUI, `/jev` (alias `/typesafe`) shows the account and every feature switch.
`/settings jev` reaches the same command. Examples:

```text
/jev login typesafe
/jev login openrouter
/jev endpoint https://example.com/v1/systemone
/jev login custom
/jev model default
/jev timeout 4000
/jev feature brain off
/jev feature skillSuggestion on
/jev test
/jev logs memoryRecall
/jev remove-key
```

Login reads the credential through the surface's masked secret prompt; never put
it in slash-command arguments. Jev is a decision provider and remains separate
from chat model selection.

The WebUI activity view refreshes every three seconds and shows the most recent
300 requests made by **this server process**, across its sessions. Each entry
contains a request ID, time, consumer, process working directory, route, model,
elapsed time, token usage, bounded answer identifiers/numbers and a safe failure
category. It covers judgment features, skill suggestions, fleet classification
and connection probes. No prompt state, question instructions, API credentials,
response legends or raw provider error bodies are recorded.

`answered` means the service returned a typed response; the consumer may still
decline a low-confidence answer. `incomplete` means required answers were missing
or malformed. `fallback` marks requests that failed or were
blocked by the resting/authentication gates. Features that are disabled or never
invoked do not generate request entries. The settings panel shows their switches.

Activity is also written to `~/.wrongstack/logs/jev-<pid>.jsonl`. The panel and
`/jev logs` show the exact path and any write failure. Each process file rotates
at 5 MB with one `.1` backup. Files from previous processes remain on disk for
investigation; the browser tail is current-process only. The working directory
is process attribution, not a per-session project identifier.
