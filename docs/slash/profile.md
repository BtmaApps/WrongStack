# `/profile` — Configuration profiles

Profiles hold provider/model choices, credentials, fallback routes and behavior
settings in `~/.wrongstack/profiles/<name>/config.json`.

| Command | Effect |
|---|---|
| `/profile`, `/profile list` | List profiles and mark the active one |
| `/profile copy <name>` | Copy the active profile to a new name |
| `/profile switch <name>` | Activate an existing profile |

```text
/profile copy research
/profile switch research
/profile list
```

Copy clones the complete profile directory, including its profile-owned files;
it does not activate the new profile. An existing destination or invalid
name is refused. Names containing path separators, dots or traversal syntax
are not accepted. The copy contains credential configuration as well as
behavior settings; for a portable behavior-only export, use
[config transfer](../subcommands/config-transfer.md).

A successful switch updates the live config/provider watcher bindings.
Profile-owned memory, skills, prompts and statusline state resolved at boot
still need a restart to follow the new profile. Project overrides continue
to participate in the normal configuration merge.

Source: [`profile.ts`](../../packages/cli/src/slash-commands/profile.ts).
See [configuration layers](../configuration.md) and
[OAuth accounts](../oauth-signin.md).
