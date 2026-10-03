# Persistent agent automation

`wstack automation` keeps job definitions and run history outside interactive
sessions. `serve` runs the worker and a loopback control API. Each run uses an
independent Docker source snapshot and produces reviewable patches; it does not
edit the host checkout, push a branch or publish a PR automatically.

Build a trusted runtime image using [the sandbox guide](sandbox.md), then create
and run a job from the project directory:

```powershell
wstack automation add --name daily-review --image wrongstack-sandbox --prompt "Review dependency changes and prepare a verified patch" --every 86400 --provider openai --model <model> --env OPENAI_API_KEY --yolo
wstack automation list
wstack automation serve
```

`--every` is a fixed interval in seconds, from one minute to one year. It is not
a cron expression. An overdue schedule coalesces downtime into one run instead
of launching all missed intervals. Definitions and queued runs survive a worker
restart. Disabling a job prevents new claims; queued runs remain inspectable.

For a calendar schedule use `--cron "0 9 * * 1-5" --timezone Europe/Istanbul`.
Cron accepts five numeric fields; choose either cron or `--every`. The timezone
defaults to UTC. Invalid timezones, impossible dates, seconds and randomized cron
fields are rejected. During a spring DST gap, the selected hour shifts forward;
a repeated autumn hour fires once. The scheduler still coalesces missed runs.

`wstack automation preview` accepts the same definition options as `add` and
prints the shared headless launch plan, next five times and missing environment
or saved credential references. `add --dry-run` does the same. Neither starts a
container, decrypts saved keys or writes a job. Credential presence is a setup
check; execution still resolves its value at use time.

The WebUI Tools menu and SimpleUI utilities menu both include **Automations**.
Create or edit jobs, preview schedules and conditions, queue or cancel runs,
enable/disable jobs and read exported patches/logs. Existing job edits require
the observed revision; a stale editor receives a conflict instead of overwriting
new settings. Already queued runs retain their frozen definition. Starting
templates provide dependency review, test triage and PR followup prompts.

Templates now carry stable IDs and version 1 provenance. List them with
`wstack automation templates`, then use `add --template test-triage` with your
trusted image and execution settings. They reuse existing project instructions
and skills. Required setup is shown alongside the template; preview checks
credential-reference presence but does not prove that the image contains a test
runner or that a provider account can access the selected model.

Export a definition with `wstack automation export <job-id>` and import its JSON
using `wstack automation import --file job.json` (or validate with `--dry-run`).
The versioned document omits generated IDs, project paths and credential values.
Imports bind to the current project, start disabled and turn unattended tools
off. Review the settings and enable explicitly. Both graphical screens offer
the same portable JSON workflow and preserve the template ID/version.

Finished runs include a version 1 result in history and `run.json`: bounded
final text, agent status, duration, token/iteration counts, changed-file paths
and references to exported evidence. Cost is a catalog estimate only when the
CLI observed complete pricing coverage; otherwise it is `null`/unknown, including
legacy CLI output. Execution completion and an agent's claim that tests passed
do not constitute independent test verification. Review the log/patch or run
the project's deterministic tests. Patches render as read-only diffs.

These screens use the machine's default automation directory and the same
persisted job validator as the CLI. Their API is scoped to the server's project
and uses existing WebUI access/origin guards. The worker token stays on the
server. Start `wstack automation serve` separately to execute queued work; an
offline worker does not discard jobs. A custom `--data-dir` worker is managed
through its own CLI/control API rather than the default project screen.

The default execution timeout is 600 seconds and the leader iteration limit is
40. Set `--timeout` and `--max-iterations` when creating a job. These are time and
iteration limits, not a dollar budget. Permission mode is persisted per job:
`--yolo` explicitly permits unattended tool execution inside that job's isolated
container. Without it, the normal headless permission behavior applies.

State defaults to the machine WrongStack home under `automation/`. Use
`--data-dir` consistently for an alternate directory. The state uses existing
WrongStack atomic writes and cooperative file locks. Multiple workers cannot
claim the same run. Runs for one job and external subject are serialized, while
different subjects can use `serve --max-concurrent <1..16>`.

## Existing credential references

Use an existing named API key from the active machine profile:

```powershell
wstack automation add --name code-review --image wrongstack-sandbox --prompt "Review the project" --provider work-openai --model <model> --credential OPENAI_API_KEY=work-openai/work
```

The job stores the profile, provider, key label and destination environment name.
The worker reads the existing profile and vault at use time. Endpoint and key
come from one profile snapshot, so ordinary key rotation is visible and aliases
retain their configured endpoint. Only the selected provider settings and key
are injected into the container; the complete host config/home/vault are not
copied. Secret-valued custom headers are not imported. OAuth key entries require
their own file/authentication flow and are refused by this API-key resolver.

`--env` forwards only explicitly named host environment variables. Process and
Docker control variables cannot be forwarded. Resolved values are kept out of
command arguments and job/run metadata. Private conversation checkpoints can
contain the container's own encrypted provider state; protect the state directory
like other WrongStack private state. Vault master-key rotation can require a
worker restart; unresolved references fail instead of selecting another key.

## GitHub events and conversation continuation

```powershell
wstack automation add --name pr-followup --image wrongstack-sandbox --prompt "Investigate the PR or CI feedback and verify a patch" --provider openai --model <model> --env OPENAI_API_KEY --repository owner/repo --events issue_comment.created,pull_request.opened,check_run.completed --webhook-secret-env GITHUB_WEBHOOK_SECRET --yolo
```

Supply the webhook secret to the worker environment. GitHub POSTs to
`/hooks/<job-id>/github` must have a valid HMAC-SHA256 signature, delivery ID,
configured event and matching repository. Delivery retries deduplicate while
their history is retained; reusing an ID for another task payload is refused.
Signed body fingerprints also deduplicate a replay with a changed unsigned
delivery header. Issue and PR numbers identify the subject. A check event with exactly one PR can
use that PR; ambiguous events stay separate. External text is task data and
cannot change the persisted job's image, credential references or project root.

For a subsequent event on the same PR, the worker restores its previous CLI
conversation and cumulative patch into a new isolated source snapshot. It uses
the existing CLI continuation flow. A patch conflict fails before the agent
runs, preserving the workspace for inspection. Scheduled and manual runs start
fresh. No new long-term memory system replaces SAGE.

The HTTP service binds only `127.0.0.1`. Remote GitHub delivery needs an explicitly
configured reverse proxy or tunnel; this command does not publish an endpoint.

## Control API and run results

The API token is generated in `token.txt` and its path is printed. Control calls
require `Authorization: Bearer <token>`. Tokens and state are written with private
permissions where the platform supports them.

| Route | Behavior |
|---|---|
| `GET /healthz` | Minimal process health, without credentials or job data |
| `GET /v1/state` | Authenticated job/run state and worker persistence errors |
| `POST /v1/jobs/<id>/run` | Manual dispatch; requires `Idempotency-Key` |
| `POST /v1/runs/<id>/cancel` | Cancel a queued or locally running run |
| `POST /hooks/<id>/github` | GitHub ingress verified by its own HMAC |

Runs record queued/running/terminal state and lease ownership. A worker heartbeat
fences late completion writes. Recovery requires an expired lease and a proven
absent local process. Unknown process or Docker liveness blocks redispatch of
that subject instead of risking a duplicate. Running cancellation on another
worker is not implemented by this local control API.

GitHub jobs can add `--mention @wrongstack`, `--label agent`, `--branch main`,
`--conclusion failure`, `--exclude-bots` and `--exclude-drafts`. Conditions are
combined with AND; missing condition fields do not match. Branch matches the
PR base branch or push ref. The draft condition applies to PR payloads. These
conditions run after signature/repository/event checks and before queueing.
Use `preview --event-file sample.json` or the UI sample payload to evaluate the
conditions without creating a run; this preview does not authenticate a webhook.

Additional authenticated management routes are `POST /v1/jobs`,
`PUT /v1/jobs/<id>` with `expectedRevision`, `POST /v1/jobs/<id>/enabled`,
`POST /v1/preview` and `GET /v1/runs/<id>/artifact?name=changes.patch`.
Create/edit/preview bodies contain `spec`; preview optionally includes `event`.
The WebUI exposes the same operations under `/api/automation/` and fixes the
project root server-side. Artifact names are restricted to `changes.patch`,
`output.log` and `run.json`, with a 2 MB read limit. Private conversation and
credential checkpoint files are never served by these routes.

Per-run artifacts include `claim.json`, `run.json`, `output.log`, a successful
`changes.patch` export, and a private conversation checkpoint. A completed run
means the CLI exited successfully and artifact export succeeded; it does not
replace Kanban verification or establish code correctness. A timeout, cancellation
or export failure retains a stopped, ownership-verified container for recovery.

Metadata is bounded to 128 jobs, 2000 runs and 16 MB. Use
`wstack automation prune --days 30` to prune old terminal metadata. It retains
active runs and the latest successful checkpoint for each PR subject, and does
not delete artifact files. Delivery IDs removed by pruning no longer deduplicate.

The existing in-session cron plugin remains a timer/event facility. Its legacy
`persistSchedules` field is not the implementation of this standalone service.
