# `wstack skill-suggest` — Routing preview and evaluation

Preview the configured two-stage skill routing for a request or evaluate a
labeled JSONL dataset. These are live Jev/TypeSafe-route evaluations; they are
not offline lexical search or skill installation.

```bash
wstack skill-suggest "review the current change"
wstack skill-suggest --eval cases.jsonl
wstack skill-suggest --eval cases.jsonl --sweep
```

Each dataset line contains `text` and optional `gold`, the expected skill name.
Omitting `gold` records a request for which no skill is expected:

```jsonl
{"text":"review this module","gold":"code-review"}
{"text":"explain this sentence"}
```

Choose labels from the installed skill catalog rather than assuming the example
skill is installed. The output shows stage/gate decisions, selected candidates
and evaluation summaries. `--sweep` compares threshold cuts over the evaluated
data; it does not automatically persist the best threshold or establish
production accuracy on unseen requests.

Configure the route/account with `wstack typesafe login` and inspect its status.
Requests/dataset text are sent to that route, and larger evaluations can take
multiple calls. A missing request/dataset, unreadable or invalid data, or
unavailable service is reported rather than silently choosing a skill.

Source: [`skill-suggest.ts`](../../packages/cli/src/subcommands/handlers/skill-suggest.ts).
See [skill suggestions](../skills-suggestion.md) and
[Jev diagnostics](typesafe.md).
