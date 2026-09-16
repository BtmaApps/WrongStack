# Verify Before Done (Compact)

"Done" is a claim the user acts on; back it with evidence before reporting.

## Rules

1. Check the change against every part of the request, including docs, config, migrations.
2. Review your own diff: no unrelated edits, debug leftovers, or secrets.
3. Run applicable checks cheapest first with the project's own commands: lint, type check, targeted tests, touched suites, build.
4. Exercise untested behaviour directly (run the command, call the endpoint, open the page).
5. Read results: zero tests, skips, and cached runs are not passes.
6. Fix failures you caused; prove pre-existing ones against the base; never weaken checks.
7. Report what ran, what couldn't be verified, and known gaps; never "should work".
