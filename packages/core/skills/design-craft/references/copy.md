# Copy

Interface copy is design. It is also where generated UI is most obvious,
because filler copy is the one thing that survives no matter how good the
pixels are.

## 1. The swap test

Replace the product name throughout with any other product. If the copy still
makes sense, it is filler. Real copy uses the nouns and verbs of the actual
domain — "workspace", "invoice", "run", "commit", "patient", "shipment" — not
"solution", "platform", "experience".

## 2. The banned register

| Banned | Why | Instead |
|---|---|---|
| "Unlock the power of…" | Says nothing, appears everywhere | What it does, in one sentence |
| "Seamlessly integrate" | Unfalsifiable | "Connects to Postgres in one step" |
| "Take X to the next level" | Filler | The specific improvement |
| "Game-changing", "revolutionary", "cutting-edge" | Claims without evidence | A number, or nothing |
| "Powerful. Simple. Fast." | Rhythm substituting for content | One claim you can defend |
| "Effortlessly…" | Marketing adverb | Show the step count |
| Lorem ipsum | Placeholder that shipped | Real copy, or ask the user |

## 3. Voice by surface

- **Headings** — a claim or a name, not a sentence fragment aiming to sound
  profound. Sentence case unless the brand says otherwise.
- **Body** — short sentences, concrete. Second person for instructions.
- **Buttons** — the verb of the action: "Create workspace", not "Submit". The
  label should make sense read aloud without the surrounding context.
- **Labels** — the noun, no colon, no "Please".
- **Help text** — what the field expects, not a restatement of the label.
- **Tooltips** — never the only place information exists.

## 4. Empty states

The cheapest place to show product voice, and the most commonly wasted:

A good empty state answers three things:
1. What belongs here
2. Why it is empty right now
3. The one action that fills it

```
No runs yet
Runs appear here the first time a workflow executes.
[ Run "deploy-api" ]
```

Not: "No data available."

## 5. Errors

Three parts, in order: what happened, why, what to do.

| Bad | Good |
|---|---|
| "Error: ECONNREFUSED" | "Can't reach the database. It may still be starting. Retry in a moment." |
| "Invalid input" | "Workspace names use letters, numbers and hyphens." |
| "Something went wrong" | What went wrong, plus a way to recover or report |

Never surface an exception string in a user-facing surface. Never blame the
user. Never make an error dead-end — there is always a next action.

## 6. Loading and progress

- Say what is happening if it takes more than a moment: "Importing 1,240 rows…"
- Never "Please wait".
- If you know the shape, use a skeleton and no words at all.

## 7. Numbers, dates, units

- Format for the locale; never hand-concatenate a date.
- Relative time for recent ("2 min ago"), absolute for old, and the absolute
  value in a tooltip/title either way.
- Round in the UI, keep precision in the data. State the unit once, in the
  header, not in every cell.
- Zero is a real value — "0 errors" reads better than an empty cell.

## 8. Microcopy checks

- Read every string aloud. Anything you would not say to a colleague, cut.
- Any string that could apply to another product, rewrite.
- Any sentence over ~20 words in UI chrome, split.
- Any "Please", "simply", "just", "easily" — delete the word and re-read; the
  sentence is almost always better.
