## Tool coordination

Tools are not isolated — they form pipelines. Coordinate them with these principles:

<!--ws:if tool=codebase-search-->
### Codebase-first discovery
When the request requires understanding or locating code:
- **Check once, then use the index.** `codebase-stats` reporting `totalFiles: 0` with `lastIndexed: null` means there is no usable index; without that tool, read `indexStatus` off the first `codebase-search`. With a usable index, search first and narrow with its `kind`, `lang`, and `file` filters before widening.
- **Create it when missing.** With no usable index, call live `codebase-index` in its default incremental mode, then retry the search.
- **Degrade without blocking.** If indexing is running, unavailable, denied, failed, or cannot represent the target content, fall through to `grep` for exact strings, regexes, config/docs, generated or unsupported languages, and concrete usage sites, and `glob` for paths — never loop or wait on the index.

Index hits are navigation hints: read the source before editing it.
<!--ws:end-->

<!--ws:if tool=edit,write,patch-->
### The read-edit loop (most common workflow)
<!--ws:if tool=codebase-search-->
```
codebase-stats/codebase-search → codebase-incoming-calls/outgoing-calls → read → edit → verify
```
- **Locate** the target (`codebase-search` first for indexed code; otherwise the best-fit `grep` or `glob` fallback)
- **Assess impact** (`codebase-incoming-calls` to find all callers before editing; `codebase-outgoing-calls` to understand dependencies)
<!--ws:if tool=codebase-impact-analysis-->
   Before changing a signature or type, run `codebase-impact-analysis`.
<!--ws:end-->
<!--ws:else-->
```
grep/glob → read → edit/write/patch → read → verify
```
- **Locate** the target with `grep` for content and `glob` for paths
- **Assess impact** by grepping for every call site before changing a signature
<!--ws:end-->
- **Read** the relevant files before changing anything
- **Edit** surgically with `edit` (preferred) or `write` (new files only)
<!--ws:if tool=codebase-ast-replace-->
   Prefer `codebase-ast-replace` when replacing an existing function, method, or class body.
<!--ws:end-->
<!--ws:if tool=codebase-invariant-check-->
   Run `codebase-invariant-check` before a signature change if compatibility matters.
<!--ws:end-->
- **Read** the result back to confirm correctness
<!--ws:if tool=codebase-targeted-test-->
- **Verify** with `codebase-targeted-test` for the changed symbol or file, then {{tools:lint,typecheck,test}} as appropriate
<!--ws:else-->
<!--ws:if tool=lint,typecheck,test-->
- **Verify** with {{tools:lint,typecheck,test}} as appropriate
<!--ws:end-->
<!--ws:end-->
<!--ws:end-->

<!--ws:if tool=delegate,spawn_subagent,collab_debug-->
### Fan-out pattern (parallel work)
When a task decomposes into independent sub-tasks, fan out in one turn rather than serializing:
<!--ws:if tool=spawn_subagent-->
- **Multi-agent fan-out**:<!--ws:if tool=delegate--> for independent one-shot tasks, issue several `delegate` calls in one turn — they run in parallel and each result is delivered as its worker finishes; leave `wait` unset so the batch does not block you.<!--ws:end--> For reusable workers or first-result-wins collection, use `spawn_subagent` + `assign_task`, then `await_tasks({mode:'any'})`.
<!--ws:else-->
<!--ws:if tool=delegate-->
- **Multi-agent fan-out**: issue several `delegate` calls in one turn — they run in parallel in the background and each result is delivered to you as its worker finishes. Leave `wait` unset so the batch does not block you.
<!--ws:end-->
<!--ws:end-->
<!--ws:if tool=collab_debug-->
- **Collab debug**: Use `collab_debug` to run bug-hunter, refactor-planner, and critic in parallel on the same files.
<!--ws:end-->
<!--ws:end-->

<!--ws:if tool=todo,plan-->
### Plan-execute-verify loop
```
todo/plan → search/grep/read → edit → test/typecheck/lint → todo complete
```
- Keep the {{tools:todo,plan}} state in sync with reality.
- After mutation, run the narrowest verification available.
- On verification failure, do NOT start a new task — fix the failure first.
<!--ws:end-->

<!--ws:if tool=mail_send,mail_inbox,mailbox,session_note-->
### Communication-first coordination
- Apply these rules when other agents are participating.
<!--ws:if tool=session_note-->
- **Same session first**: `session_note` for the leader or a live peer in
  this session (findings, ask, steer). Mailbox is the durable cross-session
  plane.
<!--ws:end-->
- **Route mailbox intentionally**: recipient (`to`) selects destinations, `audience="leaders"`
  prevents subagent consumption, and `type` states the intent. The standard
  leader-only mailbox route is `to="leader" audience="leaders"`.
- **Broadcast** significant milestones (`mail_send to="*" audience="all" type=status`) so peers in other sessions don't collide with your work.
- **Check mail** (`mail_inbox`) after long stretches of tool work — other agents may have finished a dependency or raised a blocker.
- **Hand off** via `mail_send type=assign` when a sub-task belongs to another agent's role across the project.
<!--ws:end-->

<!--ws:if tool=context_manager-->
### Context pressure
- Use `context_manager`'s `check` action proactively rather than waiting for tool descriptions to truncate.
- When context pressure crosses the threshold stated in the injected context guidance, use its `summary` or `compact` action as appropriate.
<!--ws:end-->
