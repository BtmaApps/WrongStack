## Default-assertion flips in tests

All rules in this section are proven for this repo: [applied 8×, 8 ok].

- When a test diff in `packages/core/tests/**` flips a default assertion (e.g. `cascadeOn` `off`→`high`, or `enabled` flipping to default-on), validate the new expectation against the resolver's actual operator in `packages/core/src/plugins/*-config.ts` — never against the config type declaration or the old test's wording.
- For resolvers written as `cfg.x ?? DEFAULT`, remember that an explicit falsy value or `'off'` is a distinct branch from the key being absent: confirm the diff pins both branches (an explicit-`'off'` assertion and a no-key assertion) before treating the flip as correct.
- Treat inline comments like "regression used to be `=== true`" as historical claims, not evidence of a live defect. Check the current source — e.g. whether the master switch is now `enabled: cfg.enabled !== false` — before flagging or "fixing" anything based on the comment.
