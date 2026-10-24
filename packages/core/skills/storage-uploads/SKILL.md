---
name: storage-uploads
description: "Implement owned file/object storage and upload/download flows with validated metadata, access and lifecycle. Use when working with S3/R2-compatible storage, attachments or multipart uploads; separate transient transfer state from durable application ownership."
trigger: "Implement owned file/object storage and upload/download flows with validated metadata, access and lifecycle. Use when working with S3/R2-compatible storage, attachments or multipart uploads; separate transient transfer state from durable application ownership."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: data
  domain: "data"
---

# Storage Uploads

## Selection card
- Task: Implement owned object storage and upload lifecycle.
- Start: Identify the data owner, query/schema, consistency and recovery contract.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Object storage and file upload pipelines (AWS S3, Cloudflare R2, MinIO, GCS) require separating transient transfer state from durable application records: generating server-generated UUID/tenant-prefixed object keys, scoping short-lived presigned upload/download URLs, verifying content type/size/checksums after upload, and cleaning up aborted multipart or orphan objects.

Checked AWS S3 JavaScript SDK target: 3.1156.0 on 2026-10-23. Verify provider-specific API/binding support; S3-compatible does not mean every operation or signature setting is identical.

## Rules

1. Generate canonical object keys on the server (`<tenant-id>/<resource-type>/<uuid>`), never from user-supplied filenames; sanitize display filenames separately and prevent path traversal (`..`).
2. Validate file size bounds, allowed MIME types (via magic bytes/header inspection where security-relevant), and checksums (`Content-MD5` / `x-amz-checksum-sha256`); browser-provided `file.type` and extension are untrusted hints.
3. Scope presigned URLs (`PutObjectCommand` / `GetObjectCommand` or POST policies) to a single key, exact content-length/type constraints, and a short expiry (`<= 15` minutes); never make private buckets public to bypass CORS or signing configuration.
4. Model the upload state machine (`pending_upload` → `uploaded` → `verified` → `active` / `deleted`) so database records and bucket objects reconcile cleanly across retries, failures, and deletions.
5. Serve untrusted user uploads with safe response headers (`Content-Disposition: attachment` for executable/HTML/SVG types, `X-Content-Type-Options: nosniff`) or from an isolated asset domain to prevent stored XSS.
6. Configure bucket lifecycle rules (`AbortIncompleteMultipartUpload` after 1–7 days) and stream large transfers instead of buffering whole files in server RAM.

## Core Patterns & Pitfalls

- **Two-Phase Presigned Upload Lifecycle**: (1) Server authorizes user, creates a `pending_upload` DB row with a server-generated object key, and returns a bounded presigned `PUT`/POST URL; (2) after client upload, server verifies object existence/size/etag via `HeadObject` before marking the DB record `active`.
- **S3 vs R2 Compatibility**: When targeting Cloudflare R2 or other S3-compatible stores with `@aws-sdk/client-s3`, verify supported checksum headers (`requestChecksumCalculation` / `responseChecksumValidation`), CORS `ExposeHeaders: ["ETag"]` for multipart uploads, and region (`"auto"`).
- **Anti-pattern — Orphaned Objects & Unverified Presigned URLs**: Marking a file "uploaded" in the database at the moment the presigned URL is issued leaves broken links whenever the client upload fails or is abandoned.

## Workflow

1. Inspect provider/bucket policies, SDK/bindings and existing file metadata.
2. Implement bounded upload/download and durable reference transitions.
3. Test size/type rejection, unauthorized access, retry and incomplete transfer cleanup.
4. Verify retrieval/expiry/retention in an isolated authorized storage environment.
5. Record provider-specific constraints and actual object/application consistency.

## Before returning

- [ ] Object keys generated server-side with tenant/owner scoping and no raw user path interpolation
- [ ] Presigned URLs/credentials bounded by operation, key, size/content-type, and short expiry
- [ ] Upload state machine reconciles DB metadata with verified bucket object (`HeadObject` / checksum)
- [ ] Untrusted content served with `nosniff` / safe `Content-Disposition` and incomplete multipart uploads bounded
- [ ] Size/type rejection, cross-user access denial, and orphan/delete cleanup verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[AWS S3 docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html), [Cloudflare R2](https://developers.cloudflare.com/r2/).

## Skills in scope

- api-design — presigned upload initiation/completion endpoints, streaming responses, and error contracts.
- data-governance — PII/attachment retention windows, encryption at rest, and right-to-erasure deletion cascades.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- backup-recovery — design and verify backups and restoration for owned databases, files and application state.
