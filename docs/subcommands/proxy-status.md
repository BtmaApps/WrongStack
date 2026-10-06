# `wstack proxy-status` — WrongProxy diagnostics

```bash
wstack proxy-status
```

Read the optional WrongProxy configuration and daemon-routing health through
the diagnostic handler. When enabled with an origin, it awaits a one-shot probe
before reporting active/rewrite state. This does not start or install the external WrongTrace
daemon. It is distinct from the chat provider's own account or quota check.

When a proxy is configured but unavailable, use the reported origin and
connection result to inspect the external daemon and `tools.wrongProxy`.
WrongTrace is optional; normal provider routes can continue without a running
daemon according to the routing configuration. A reachable endpoint is not
proof that a particular provider request has successfully traversed it.

Source: [`diag-doctor.ts`](../../packages/cli/src/subcommands/handlers/diag-doctor.ts).
See [WrongTrace integration](../wrongtrace.md), [diagnostics](diag-doctor.md)
and [provider health](../slash/provider-status.md).
