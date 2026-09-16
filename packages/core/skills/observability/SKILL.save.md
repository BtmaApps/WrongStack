# Observability (Compact)

Instrument so the next incident is answered from telemetry, using the project's existing logger and tracing.

## Rules

1. Use the project's logger and conventions; never add a second logging stack.
2. Structured events with stable names and fields, not sentences.
3. Levels mean something: error needs a human, debug is off in production.
4. Carry a request/trace id across async boundaries and into every log line.
5. No secrets or personal data; configure redaction once in the logger.
6. Log an error once, where it is handled, with the error object.
7. Bounded metric labels (route templates, error classes), never ids or raw URLs.
8. Spans around outbound HTTP, database, queue, and cache calls.
