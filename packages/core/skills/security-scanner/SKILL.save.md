# Security Scanner (Compact)

Scans code, configs, and dependencies for security issues. Reports with severity and concrete remediation.

## Rules

1. Always provide remediation — "found X" without "do Y" is useless.
2. Don't scan `node_modules` — use `npm audit` for supply chain.
3. Don't flag test fixtures — mock credentials in tests are acceptable.
4. Always run dependency audit — supply chain is a real attack vector.
5. Flag config issues (TLS disabled, HTTP in production) as CRITICAL.

## Critical patterns

| Pattern | Severity |
|---------|----------|
| Hardcoded GitHub token `ghp_[a-zA-Z0-9]{36}` | CRITICAL |
| Hardcoded AWS key `AKIA[0-9A-Z]{16}` (`ASIA` for temporary keys) | CRITICAL |
| Private key PEM `-----BEGIN.*PRIVATE KEY-----` | CRITICAL |
| `innerHTML = x` — use `textContent` | HIGH |
| `exec(\`cmd ${input}\`)` — use `execFile` with args | HIGH |
| SQL concatenation — use parameterized queries | CRITICAL |
| JWT in code `eyJ[a-zA-Z0-9_-]+` | HIGH |