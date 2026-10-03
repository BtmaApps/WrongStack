# Offline routing and quality experiments

These commands extend the existing benchmark and transcript tools. They read
evidence, make no model calls and do not change live Brain or model routing.
`bench run` remains the model-running command and uses deterministic graders.

```powershell
wstack bench review --transcript session.jsonl --policy review-policy.json
wstack bench route ./bench-results/run --policy routing-policy.json
wstack bench experiment ./baseline ./candidate --dimension compaction
wstack bench run --suite core --cell provider/model --review-policy review-policy.json
```

A review policy may contain `allowedEditPaths`, `requiredFinalMarkers` and
`repeatLimit` (default 3). Reviews report failed tools, identical repeated calls,
edits outside a curated allow-list, missing recognized test commands and missing
curated final-answer markers. Findings include source event indexes and a SHA-256
hash. CLI reviews hash the original JSONL; benchmark rows hash the parsed JSON
event array and name that encoding. Missing transcripts produce no review row.
All findings are advisory: repeated reads can be legitimate, custom test commands
may be unrecognized, and a final-answer marker is not proof of correct behavior.
Existing Brain decisions and deterministic completion gates retain their roles.

Routing policy example (use task IDs from your actual corpus):

```json
{
  "version": 1,
  "categories": { "repair": ["core/broken-pager"] },
  "minAttempts": 3,
  "minPassRate": 0.8,
  "objective": "cost"
}
```

Candidates need the same category task/attempt corpus, enough graded attempts
and the configured pass rate. Cost optimization refuses missing/unknown pricing;
latency optimization uses measured time. The output records reasons and the
source harness fingerprint. It is a shadow recommendation, not an automatic
model switch or a claim that one model is universally better.

Paired experiments require identical task/model/attempt identities and fixed
CLI, tool, prompt and subset fields. A changed behavior-config hash is explicitly
operator-declared; the hash cannot prove only the named setting changed. Reports
compare deterministic grades, existing retrieval/recall/edit-application evidence,
latency, known cost and optional transcript-review observations. Full-request
compaction savings are reported only when every compaction has the appropriate
measurements. Legacy message-only token counts are not substituted for them.

To compare compaction strategies, run the same corpus with separately controlled
existing context settings and `--review-policy`, then compare the finished runs.
Use repeat attempts and the existing transcript-mined continuation cases before
changing defaults. Synthetic fixture checks establish plumbing, not model quality.
