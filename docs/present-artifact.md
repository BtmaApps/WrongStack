# Presenting project artifacts

The agent can call `present_artifact({ path: "docs/report.md", title: "Results" })`
after producing a report, source file, patch or raster image. WebUI and Desktop reveal text in their
existing file view; SimpleUI opens its file explorer. Images and unified diffs
open a read-only preview in both graphical surfaces. CLI and TUI
retain the project-relative path in the tool result.

The tool validates an existing text/diff file up to 2 MB or raster image up to 4 MB inside the canonical project
root. Outside paths and symlinks escaping the project are refused even when the
session permits unrestricted filesystem access. Image type comes from bytes, not
the extension. Other binary files are unsupported; HTML and SVG are displayed
as source. The tool does not execute document content.

For an already open browser use `present_artifact({ browserSessionId: "<id>" })`.
The browser must belong to the calling agent and current conversation. WebUI
opens its existing Browser dock; SimpleUI observes the same read-only live feed.
Closing the preview stops observation. This action does not navigate or operate
the browser, expose a host dev-server port, or start a new browser session.

Presentation is a request, not a delivery receipt. Graphical clients only handle
requests for the session they are viewing. Repeated requests are deduplicated,
and existing editor contents are preserved. WebUI keeps another panel the user
has selected; SimpleUI keeps an edit with unsaved changes.

The result is a compact versioned descriptor with session ownership and a unique
presentation ID. It contains no file contents. Existing correlated file reads
load the content, with normal server containment and size limits. Clients retain
version 1 text-descriptor support; version 2 adds text/image/diff/browser kinds.
