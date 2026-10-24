---
name: authentication-sessions
description: "Implement application sign-in, sessions and identity integration with explicit account/tenant authorization. Use when building OAuth/OIDC, passkeys, password login or session renewal; use security-scanner for a requested defensive review."
trigger: "Implement application sign-in, sessions and identity integration with explicit account/tenant authorization. Use when building OAuth/OIDC, passkeys, password login or session renewal; use security-scanner for a requested defensive review."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "product"
---

# Authentication Sessions

## Selection card
- Task: Build login, session rotation and revocation.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Authentication and session management establish verified identity (`sub`), account linkage, active tenant scope, and revocable session lifecycles across OAuth 2.1 / OIDC (PKCE + `state`/`nonce`), WebAuthn/Passkeys, password/MFA flows, and HTTP-only cookie or token renewal. Secure identity engineering requires strict separation between authentication ("who is calling") and server-side resource authorization ("what they may access").

Checked 2026-10-23: Better Auth 1.7.12 and jose 6.2.13. Use current provider/library contracts and OAuth security guidance; an OAuth draft is not automatically a stable replacement for the deployed protocol.

## Rules

1. Define trusted identity issuer (`iss`), audience (`aud`), account-linking rules (never auto-link unverified email claims across providers), active tenant/organization scope, and session ownership.
2. Validate OAuth/OIDC callback `state`, PKCE `code_verifier`, redirect URI allowlists (prevent open redirects), and cryptographic token signatures/claims (`iss`, `aud`, `exp`, `nbf`) using the project's supported library.
3. Enforce server-side authorization on every operation and object; a valid login session or client-supplied role/tenant parameter never grants cross-tenant access on its own.
4. Configure cookies (`HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`, `__Host-` prefix where compatible) and CSRF/origin protections for browser cookie sessions.
5. Model refresh token rotation, concurrent refresh tolerance, session revocation, password/MFA privilege changes, and logout; a stale in-flight refresh must never resurrect a revoked or logged-out session.
6. Keep signing keys, client secrets, and raw tokens out of source code, URLs, and logs; return uniform failure responses where account-enumeration resistance is required.

## Core Patterns & Pitfalls

- **Refresh Rotation & Reuse Detection**: Bind refresh tokens to a persisted session family ID (`jti` / family counter). When a session is revoked or logged out, invalidate the entire session family so concurrent or replayed refresh requests fail closed.
- **Account Linking & Email Verification**: Only link a newly authenticated OAuth identity to an existing local account when the provider explicitly guarantees `email_verified === true` for that authoritative domain or after re-authentication.
- **Anti-pattern — Decoding JWTs Without Verification**: Calling `jwt.decode()` or parsing base64 JWT payloads without verifying the signature, `alg` allowlist, `iss`, `aud`, and `exp` allows trivial token forgery.

## Workflow

1. Inspect existing auth/provider/session storage and route consumers.
2. Resolve current stable library/provider compatibility and define the state transitions.
3. Implement callback/session flows and server authorization with explicit errors.
4. Test expiry, rejection, retry, stale refresh, logout and two-user/tenant isolation.
5. Exercise the actual login/logout journey and report provider/device gaps.

## Before returning

- [ ] Identity issuer, audience, redirect URI allowlist, and account-linking rules verified
- [ ] Cookie security attributes (`HttpOnly`, `Secure`, `SameSite`) and CSRF/Origin checks enforced
- [ ] Server-side object and tenant authorization verified across two-user/two-tenant test cases
- [ ] Logout, session revocation, and concurrent/stale refresh race conditions tested
- [ ] Signing secrets and raw tokens excluded from source, query strings, and logs

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[OAuth current practice](https://www.rfc-editor.org/rfc/rfc9700.html), [Better Auth](https://www.better-auth.com/docs).

## Skills in scope

- api-design — `401 Unauthorized` vs `403 Forbidden` semantics, auth headers/cookies, and rate-limited auth endpoints.
- react-native-expo — build and upgrade React Native or Expo applications with navigation, native modules and verified platform integration.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- testing — multi-user/multi-tenant isolation, token expiry/revocation, and refresh-race regression tests.
