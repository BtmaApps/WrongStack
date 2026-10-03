# Docker sandbox execution

`wstack sandbox docker` runs the complete agent in an independent copy of the
project. File tools, shell tools and tests run inside the container. It exposes no
host bind mounts, Docker socket, local home or local credential vault. The host
working tree is preserved, including existing uncommitted work.

Build an image from the current source:

```powershell
docker build -f containers/sandbox/Dockerfile.source -t wrongstack-sandbox .
```

Alternatively, build `containers/sandbox/Dockerfile` with an explicit
`WRONGSTACK_VERSION` that is already published. The source version may be newer
than the latest published package; the launcher never substitutes a release.

```powershell
wstack sandbox docker --image wrongstack-sandbox --prompt "Add tests for the parser" --provider openai --model <model> --env OPENAI_API_KEY --yolo
```

`--env` is a comma-separated list of names. Values remain off the command line.
Use `--dry-run` with the same options to print the shared headless launch plan
without starting Docker or exporting files. `--max-iterations` defaults to 40,
matching automation jobs; it accepts 1 to 1000. Environment output contains names
and missing-reference hints, never forwarded values.

Only explicitly named variables are forwarded. Process-control variables, the
host home and Docker connection settings cannot be forwarded. API credentials
are supported; importing local OAuth credential files is not implicit.

Networking defaults to Docker bridge networking, which permits normal provider
and dependency access. `--network none` disables networking. This is process and
filesystem isolation; bridge networking does not implement an egress allowlist.
The image is trusted executable code selected by the operator.

The source snapshot omits Git metadata, dependencies and generated/cache folders
(`.git`, `node_modules`, `dist`, `.temp_files`, `.reports`, `.next`, `.cache`).
A new repository inside the container records the imported files as its baseline.
The resulting patch is relative to that snapshot, not the host repository HEAD.
New non-ignored files are included. Existing host Git history is not copied.

Run results are saved under `.wrongstack/sandbox-runs/<id>` or `--out <directory>`:

- `changes.patch`: changes against the imported snapshot, when export succeeds.
- `run.json`: snapshot revision, image, network mode, exit code and cleanup state.

No patch is applied automatically. A nonzero agent exit can still produce a
reviewable patch. After a timeout, cancellation or export failure, a verified
owned container is stopped and retained for recovery instead of claiming an
empty successful patch. The metadata names that container. An unknown ownership
probe never authorizes deletion. Resource defaults are 2 CPUs, 2 GB RAM and 256
processes; the agent runs as UID 1000 with no-new-privileges.

This initial launcher runs one headless task. Persistent automation uses the same
workspace contract. Interactive WebUI port forwarding is a separate follow-up.
