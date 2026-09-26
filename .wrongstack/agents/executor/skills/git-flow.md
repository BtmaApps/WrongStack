## `--write` generator verification

- In WrongStack’s shared dirty working tree, snapshot every file written by any `--write` generator into `.temp_files/<task>-backup` before execution.
- After execution, verify each snapshot against the written file with `fc /b`; treat differences as collateral damage to other agents’ uncommitted work.
- Do not verify such generator runs through `git status` or other git state; use the backup/`fc /b` check instead.
