## Search fallback

- Under `packages/webui/src/i18n/locales` on Windows, use `grep` with `**/activity.json` or a direct file path; never rely on `*/activity.json`. Treat zero matches as suspect when a script has proven the file or content exists.
- If `read` reports `unchanged since previous read` for locale JSON, switch directly to `grep` with a line-anchored pattern such as `^ "` on that same file; do not retry `read` after summary mode or with a fresh `offset`. In `bash`, avoid Unix `tail`; redirect long output to a project-local file and inspect it with `grep`.
