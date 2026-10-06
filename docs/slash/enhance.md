# /enhance — Prompt Refinement ("did you mean this?")

## What it does

`/enhance` toggles **prompt refinement**. When on, every free-text message you submit in the TUI — not just the first — is rewritten in a **separate context** (its own system prompt, its own one-shot LLM call) into a clearer, more complete instruction, then briefly previewed before it reaches the main agent. The goal is for the main agent to start from a well-understood request instead of guessing intent from terse input like *"fix the bug"*.

The refiner is **context-aware**: the recent conversation (the last few user/assistant text turns) is passed to it as read-only context, so follow-up messages that reference earlier work — *"do the same for the other file"*, *"make it red instead"*, *"now write tests for that"* — are resolved into self-contained instructions rather than refined blind. The conversation is supplied as context only; the refiner rewrites **only your latest message**.

It is **on by default** and persisted to the active profile config (`autonomy.enhance`).

## Usage

```
/enhance            Show current status
/enhance on         Enable refinement
/enhance off        Send prompts verbatim
/enhance toggle     Flip the current state
```

## The refine flow (TUI)

1. You type a free-text prompt and press Enter.
2. A one-shot LLM call (your session model) rewrites it. While it runs, a `✨ refining your request…` line is shown.
3. A preview panel appears with a short auto-send countdown:

   ```
   ┌─ ✨ Refined request ─────────── sending in 3s ─┐
   │ original: fix the bug                           │
   │ refined:  Fix the null-deref in auth.ts login() │
   │           when the token is missing             │
   │ [Enter] send · [Esc] use original · [e]dit      │
   └─────────────────────────────────────────────────┘
   ```

   | Key | Action |
   |-----|--------|
   | `Enter` | Send the refined version now |
   | `Esc` | Send your original text instead |
   | `e` | Load the refined text into the input to tweak, then re-submit |
   | *(wait)* | Auto-sends the refined version when the countdown expires |

## What the refiner does (and does not)

The refiner is instructed to **preserve intent and scope exactly** — it restates, it does not solve. It keeps concrete details verbatim (file paths, identifiers, code, error text, numbers, URLs), resolves obvious ambiguity by making the implied subject explicit (never by inventing specifics), stays concise, and preserves your language (a Turkish prompt is refined in Turkish). If a message is already clear, it comes back essentially unchanged.

When you write in a non-English language, the refiner returns **two** versions — one in your language and one in English (the panel offers both). English input uses the **same** two-part contract: both versions are English and may be identical. Keeping the contract uniform for every language is what lets the parser validate the model's output deterministically outside the model, with one corrective pass when the format is violated.

## When it is skipped

Refinement is bypassed (the message is sent verbatim) for:

- slash commands and image / attachment-only messages
- messages carrying inline attachment chips (the refiner would drop the tokens)
- steering interrupts (Esc-redirected turns) and messages queued while the agent is busy
- one- or two-word inputs, bare affirmations (`yes`, `continue`, …) and their non-English counterparts (`evet devam et`, `oui`, `ja weiter`, …), bare numbers, and anything shorter than ~12 characters
- any refiner error or timeout — refinement is best-effort and never blocks you from sending

The refined output is also discarded automatically when it is effectively identical to what you typed (no panel is shown).

## Notes

- TUI only. The plain (non-TUI) CLI submits prompts verbatim.
- The refiner call goes through the session provider directly (outside the agent loop), so its small token use is not counted in the statusline cost.
- Refinement is a shallow rewrite, so the refiner asks the model for **minimal reasoning** — a low-effort hint (or thinking disabled) that is gated to what the active model advertises via `gatedEnhancerReasoning()`. On reasoning models this cuts the refiner's latency and hidden thinking-token cost; on models that can't reduce it (always-on / unknown), no reasoning field is sent and behavior is unchanged.

## Code reference

- `packages/core/src/execution/prompt-enhancer.ts` — `enhanceUserPrompt()`, `shouldEnhance()`, `gatedEnhancerReasoning()`, `ENHANCER_SYSTEM_PROMPT` (pure, React-free)
- `packages/tui/src/components/enhance-panel.tsx` — the countdown preview panel
- `packages/tui/src/app.tsx` — refine flow wired into `submit()`
- `packages/cli/src/slash-commands/enhance.ts` — the `/enhance` toggle (persists `autonomy.enhance`)
