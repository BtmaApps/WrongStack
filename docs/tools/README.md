# Built-in tool workflows

The [source-derived catalog](../current-catalog.md#built-in-tools) lists exact
registrations. Enabled tools and direct schema exposure depend on session
policy and token-saving settings. Discover a deferred tool with `tool_search`
and invoke it through `tool_use`; discovery does not grant permission.

| Need | Tools | Operating guide |
|---|---|---|
| Locate relevant source | `codebase-context`, search/skeleton/repo-map/index tools | [Context retrieval](codebase-context.md), [calls and impact](../codebase-index-calls.md) |
| Check/build/test a language workspace | `language_info`, `language`, `language_package` | [Language operations](language.md) |
| Remove confirmed dead code | `dead-code-scan`, `dead-code-fix` | [Scan, preview, apply and undo](dead-code.md) |
| Read public web evidence | `search`, `read_url_content`, `fetch` | [Web content](web-content.md) |
| Interact with a rendered page | `browser_*`, `e2e_plan` | [Browser automation](../browser-automation.md), [E2E planning](../e2e-runner.md) |
| Compose dependent calls and compact results | `tool_script` | [ToolFlow](../toolflow.md) |
| Use a reusable project script contract | `project_kit`, `project_kit_run` | [Project Kit](../project-kit.md) |
| Present an artifact | `present_artifact` | [Artifact presentation](../present-artifact.md) |
| Track work | `todo`, `plan`, `task`, `kanban` | [Todos](../todos_architecture.md), [plans](../plans_architecture.md), [Kanban](../kanban-architecture.md) |
| Materialize project design | `design` | [Design workflow](../design-quality-workflow.md), [/design](../slash/design.md) |

Read the source/tool schema for required inputs and use the returned status
and evidence to decide the next step. A successful discovery, plan or preview
is not a successful test, file mutation or completed project task.

For new tool implementations, use [the author guide](../tool-author-guide.md).
