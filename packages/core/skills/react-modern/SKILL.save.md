# Modern React (Compact)

Establish the setup first: React version, and RSC framework (Next.js App Router) or client-only app.

## Rules

1. Server Components, `'use client'`, and server actions only in RSC frameworks; client-only apps fetch through the project's data layer.
2. Derive values during render instead of syncing them into state with effects.
3. Effects sync external systems only; user-caused changes go in event handlers.
4. Effects clean up, and async effects guard against stale responses.
5. Never mutate state or props.
6. Stable keys from data identity, not array indexes.
7. Memoize after measuring, or not at all with the React Compiler.
8. Framework file conventions win (Next.js route files need default exports).
9. Accessible by default: semantic elements, labels, keyboard, focus.
