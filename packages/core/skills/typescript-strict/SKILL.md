---
name: typescript-strict
description: |
  Use this skill when writing, reviewing, or fixing TypeScript where type safety matters — type errors, narrowing, unsafe casts, or tightening compiler strictness.
  Triggers: user mentions "TypeScript", "type error", "tsc", "strict", "type safety", "narrowing", "any", "unknown", "discriminated union", "branded type", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes".
version: 2.0.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run]
---

# TypeScript Strict

## Overview

Make the type checker carry the invariants so runtime doesn't have to discover
them. Work within the project's compiler settings: read `tsconfig.json` (and any
package-level configs it extends) before deciding what a file must satisfy.

## Rules

1. Respect the project's `tsconfig`. Write code that passes the flags it has.
   Tightening flags repo-wide is a separate, requested change — it can surface
   hundreds of errors.
2. Fix type errors, don't silence them. No `as any`, no `as unknown as T`, no
   `@ts-ignore`; a `@ts-expect-error` needs a comment explaining why.
3. Validate at trust boundaries. JSON, network responses, environment, and user
   input arrive as `unknown` and are narrowed by a parser or type guard.
4. Prefer narrowing to assertion. A non-null `!` or an `as` cast is acceptable
   only where the invariant is locally obvious and a check would be noise.
5. Model finite states as discriminated unions, and end exhaustive switches with
   a `never` check so a new variant fails to compile.
6. Annotate the return types of exported functions; inference is fine inside.
7. Verify with the type checker (the typecheck tool, or the project's own
   command) before calling the work done.

## Fixing a type error

1. Read the full error, including the "Type X is not assignable to Y" chain —
   the last line usually names the real mismatch.
2. Decide which side is wrong: the value, or the declared type. Changing the
   declaration to match a buggy value hides the bug.
3. Fix at the source of the bad value, not at every use site.
4. Re-run the checker; one fix can expose or clear several errors.

## Patterns

```ts
// Exhaustive switch — adding a variant becomes a compile error here.
type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'error'; message: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

function render(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'image':
      return `<img src="${block.url}">`;
    case 'error':
      return block.message;
    default:
      return assertNever(block);
  }
}

// Trust boundary — unknown in, narrowed out.
interface User {
  id: string;
  email: string;
}

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).email === 'string'
  );
}

const body: unknown = await response.json();
if (!isUser(body)) throw new Error('Unexpected user payload');

// Branded id — a SessionId can no longer be passed where a UserId is expected.
type UserId = string & { readonly __brand: 'UserId' };
const toUserId = (raw: string): UserId => raw as UserId; // the one sanctioned cast
```

With a schema library already in the project (zod, valibot, arktype), use it at
the boundary instead of hand-written guards.

## Strictness flags worth knowing

| Flag | What it catches | Typical fix |
|---|---|---|
| `strict` | Implicit any, unchecked null, loose function types | Annotate; narrow nullables |
| `noUncheckedIndexedAccess` | `arr[i]` and `record[key]` may be undefined | Check the value, or use `.at()` with a guard |
| `exactOptionalPropertyTypes` | `prop?: T` receiving an explicit `undefined` | Declare `prop?: T \| undefined`, or omit the key |
| `noImplicitReturns` | Code paths that fall off the end | Return on every path |
| `noImplicitOverride` | Accidental method overrides | Add `override` |

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| `as any` / double assertion | Turns off checking for everything downstream | Narrow, or fix the declaration |
| `Function`, `Object`, `{}` as types | Accept almost anything | Specific signatures and shapes |
| `Promise<any>` | Callers lose all type information | `Promise<unknown>` or a generic |
| `a?.b?.c?.d` to dodge an unclear type | Hides which level can be absent | Establish what can be absent, then narrow |
| Optional fields for mutually exclusive states | Allows impossible combinations | Discriminated union |
| Loosening `tsconfig` to make an error go away | Reintroduces the whole class of bugs | Fix the code |

## Before returning

- [ ] Code passes the project's own `tsconfig`, checked with the type checker
- [ ] No new `any`, double assertions, or unexplained suppressions
- [ ] External data narrowed from `unknown` at the boundary
- [ ] Finite states modeled as unions with exhaustive handling
- [ ] Exported functions have explicit return types

## Skills in scope

- `node-modern` — for runtime patterns in Node.js TypeScript code
- `react-modern` — for component and hook typing
- `testing` — for type-safe fixtures and assertions
