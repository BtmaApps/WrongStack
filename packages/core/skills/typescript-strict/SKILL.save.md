# TypeScript Strict (Compact)

<!-- source-version: 2.1.1 -->

## Selection card
- Task: TypeScript contracts and narrowing without any. / TR: any kullanmadan TypeScript sözleşmeleri ve daraltma.
- Start: Locate the affected route/component and its runtime/lockfile.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Target TypeScript 7.0.2, verified from npm on 2026-10-09. Static types protect
compile-time contracts; external data still needs runtime validation. Work
within the project strictness and module-resolution contract.

## Rules

1. **Pre-flight: Inspect repo `tsconfig.json` & live TypeScript version first.** Check `package.json`
   for the installed `typescript` version and inspect the project's `tsconfig.json`. Query
   `registry.npmjs.org/typescript/latest` before recommending modern compiler flags (e.g.
   `isolatedDeclarations` in TS 5.5+, `satisfies` in TS 4.9+) to ensure compiler compatibility.
2. Respect the project's `tsconfig`. Write code that passes the flags it has.
   Tightening flags repo-wide is a separate, requested change — it can surface
   hundreds of errors.
3. Fix type errors, don't silence them. No `as any`, no `as unknown as T`, no
   `@ts-ignore`; a `@ts-expect-error` needs a comment explaining why.
3. Choose satisfies when validating an inferred expression without replacing its
   inferred type; keep intentional annotations/widening where the contract needs them.
4. Validate at trust boundaries. JSON, network responses, environment, and user
   input arrive as `unknown` and are narrowed by Zod, TypeBox, or explicit type guards.
5. Prefer narrowing to assertion. A non-null `!` or an `as` cast is acceptable
   only where the invariant is locally obvious and a check would be noise.
6. Model finite states as discriminated unions, and end exhaustive switches with
   a `never` check so a new variant fails to compile.
7. Always handle potential `undefined` safely when `noUncheckedIndexedAccess` is active.
8. Annotate the return types of exported functions (`isolatedDeclarations` compliance);
   inference is fine inside private helpers.

## Detailed workflow

Load the full typescript-strict skill before relying on its specialized modes,
references or output contracts. Its current SKILL.md is the source of truth;
this compact body does not expand task scope or authorization.

## Before returning

- [ ] Code passes the project's own `tsconfig`, checked with the type checker
- [ ] No new `any`, double assertions, or unexplained suppressions
- [ ] External data narrowed from `unknown` at the boundary
- [ ] Finite states modeled as unions with exhaustive handling
- [ ] Exported functions have explicit return types
