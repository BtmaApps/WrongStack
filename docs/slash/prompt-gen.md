# /prompt-gen — AI-guided prompt authoring

Registered by the built-in `wstack-prompts` plugin. Mirrors `/skill-gen`: it
drives the agent to interview you and author a high-quality, reusable prompt,
then save it to your library.

## Usage

| Command | Effect |
|---|---|
| `/prompt-gen` | Start AI-guided authoring (interview → draft → save) |
| `/prompt-gen list` | List prompts in your merged library |
| `/prompt-gen edit <slug>` | View an existing prompt |

The driven agent reads the bundled `prompt-engineering` skill as its playbook,
asks one question at a time (purpose → task → variables → format), drafts a
prompt using `{{variables}}`, and saves it via:

```
/prompts add --category <cat> --description "<summary>" --tags <a,b> --var <name:desc> "<Title>" "<content>"
```

## Related

- `/prompt` — search & insert from the library
- `/prompts` — manage your library directly

## Code Reference

- `packages/builtin-plugins/src/prompts-plugin.ts`
- `packages/core/skills/prompt-engineering/SKILL.md` (the authoring playbook)
