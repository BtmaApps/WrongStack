# API Design (Compact)

An API is a contract; follow the project's existing API conventions before any rule here.

## Rules

1. Read a neighbouring endpoint, the error helper, validation library, and any OpenAPI spec first.
2. Authorize against the specific object on every request (object-level authorization).
3. Validate input at the edge with a schema; name the failing field.
4. Correct status codes (201, 204, 409, 422, 429 with Retry-After); never 200 with an error body.
5. One error shape; default to RFC 9457 problem details.
6. Additive changes only within a version.
7. Retry-safe: idempotent verbs, `Idempotency-Key` for creating POSTs.
8. Credentials in headers, never URLs.

## Collections

Cursor pagination for large or changing data, offset for small stable data; always cap `limit`.
