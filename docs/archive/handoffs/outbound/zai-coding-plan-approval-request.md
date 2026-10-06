# Z.AI GLM Coding Plan — Integration Approval Request

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


> **Draft date:** 2026-07-15
> **Project:** WrongStack — open-source AI coding agent (https://github.com/WrongStack/WrongStack)
> **License:** MIT
> **Vendor contact:** user_feedback@z.ai / Z.AI partnerships

---

## Subject

Request for approval to list WrongStack as an officially supported tool for the GLM Coding Plan, and confirmation that our interactive multi-agent usage model complies with the plan's Terms of Service.

---

## Overview

WrongStack is an MIT-licensed AI coding agent that helps developers write, review, and debug code through a terminal CLI, TUI, and browser-based WebUI. It is architecturally similar to the tools already on your supported list (Claude Code, Cline, OpenCode, Goose, Crush, Roo Code, Kilo Code).

We would like to offer GLM Coding Plan subscription keys as a first-class provider option so that WrongStack users who subscribe to your plan can use their quota natively.

---

## Current state

WrongStack already supports the **Z.AI pay-as-you-go API** (`https://api.z.ai/api/paas/v4`) through our generic OpenAI-compatible provider, including the `zai-glm` reasoning quirk for GLM chain-of-thought handling. This is permitted under the standard API Terms.

What we have **not** shipped is a native `zai-coding-plan` provider entry, because your subscription terms state that plan quota is "strictly limited to use within officially supported tools and products." WrongStack is not currently on that list, so we have refrained until we receive confirmation.

---

## What we are requesting

1. **Listing** — Add WrongStack to the "Supported Tools" page at https://docs.z.ai/devpack/tool/others so our users see us as an officially supported integration.

2. **Confirmation of usage model** — Confirm that the following usage pattern complies with the GLM Coding Plan Terms:

   | Aspect | WrongStack's model |
   |---|---|
   | **Auth method** | User-supplied API key (generated at z.ai/manage-apikey/apikey-list), sent as `Authorization: Bearer <key>` |
   | **Endpoints** | OpenAI: `https://api.z.ai/api/coding/paas/v4` · Anthropic: `https://api.z.ai/api/anthropic` |
   | **Client identity** | `User-Agent: WrongStack/<version>` (no spoofing of other clients) |
   | **Usage type** | Interactive coding — the human developer is in the loop; the agent does not run unattended batch jobs or serve as a public API proxy |
   | **Multi-agent** | WrongStack may spawn parallel sub-agents (code review, bug-hunt, documentation) within a single user session; each sub-agent makes its own API calls using the same user's key. All calls originate from the same developer's interactive session. |
   | **No reselling/proxying** | WrongStack does not resell, share, or proxy Z.AI access to third parties |
   | **No automation/SaaS** | WrongStack is a local developer tool, not a hosted SaaS that exposes Z.AI models to external users |

3. **Preferred protocol** — Confirm whether we should prefer the OpenAI Chat Completions endpoint or the Anthropic Messages endpoint for best compatibility with GLM models (we currently support both).

4. **Rate-limit guidance** — Any specific guidance on concurrency limits or request patterns for multi-agent sessions so we can configure reasonable defaults.

---

## Technical implementation (ready to ship upon approval)

Our trusted-preset infrastructure is already built and tested. Adding `zai-coding-plan` would be a single entry in `packages/providers/src/trusted-presets.ts`:

```ts
'zai-coding-plan': {
  id: 'zai-coding-plan',
  displayName: 'Z.AI Coding Plan',
  family: 'openai-compatible',
  baseUrl: 'https://api.z.ai/api/coding/paas/v4',
  envVars: ['ZHIPU_API_KEY'],
  models: ['glm-5.2', 'glm-5-turbo', 'glm-4.7'],
  quirks: { thinkingParam: 'zai-glm' },
  usage: 'subscription-interactive',
},
```

Once approved, this activates immediately — no additional engineering work is needed.

---

## Why this matters

- **User demand:** WrongStack users have asked for GLM Coding Plan support. Currently, we direct them to the metered Z.AI API or to running Z.AI through an already-supported external agent (OpenCode, Goose) via ACP.
- **Correctness:** We have proactively refrained from enabling plan-key usage until we receive vendor confirmation, respecting your Terms rather than shipping first and asking forgiveness.
- **Mutual benefit:** WrongStack's multi-agent architecture (parallel code review, bug hunting, documentation generation) is a compelling use case for GLM models and could drive plan subscriptions.

---

## Timeline

We are ready to ship the same day we receive approval. The change is a single config entry plus a WebUI setup card — approximately 30 lines of code, already tested in our preset framework.

Please confirm at your earliest convenience. We are happy to provide any additional technical details, compliance documentation, or integration testing.

---

**Contact:** WrongStack maintainers — https://github.com/WrongStack/WrongStack
**License:** MIT (https://github.com/WrongStack/WrongStack/blob/main/LICENSE)
