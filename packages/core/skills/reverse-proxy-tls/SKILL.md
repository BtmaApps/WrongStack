---
name: reverse-proxy-tls
description: "Configure and troubleshoot reverse proxies, HTTPS, domains and upstream routing for an authorized application. Use when working with Caddy, Nginx or Traefik; validate the actual edge-to-application path and preserve renewal and access boundaries."
trigger: "Configure and troubleshoot reverse proxies, HTTPS, domains and upstream routing for an authorized application. Use when working with Caddy, Nginx or Traefik; validate the actual edge-to-application path and preserve renewal and access boundaries."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: operations
  domain: "deployment"
paths: ["Caddyfile", "nginx.conf", "**/nginx/**/*.conf", "traefik.{yml,yaml,toml}"]
---

# Reverse Proxy Tls

## Selection card
- Task: Configure proxy routing, certificates and TLS renewal.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Reverse proxies and edge terminators (Caddy, Nginx, Traefik) govern public DNS/HTTPS entrypoints, ACME certificate issuance and renewal, `X-Forwarded-*` client identity trust boundaries, request body/timeout limits, and HTTP/1.1, HTTP/2, HTTP/3, WebSocket, and SSE upstream routing. Safe proxy engineering validates syntax (`nginx -t`, `caddy validate`) before reloading and verifies the full external TLS-to-upstream path without disrupting sibling virtual hosts.

Checked 2026-10-23: Caddy 2.11.7, Nginx stable 1.30.6/mainline 1.31.8 and Traefik 3.7.16. Distinguish release channels and distro packages; verify current Traefik release before choosing it.

## Rules

1. Map the full ingress chain before editing: DNS `A`/`AAAA`/`CNAME` records, CDN/edge proxy mode (e.g., Cloudflare orange-cloud proxy vs DNS-only), TLS termination point, and upstream bind address/port.
2. Always validate configuration syntax (`nginx -t`, `caddy validate`) and preserve a backup of the active config before issuing a graceful reload (`systemctl reload`).
3. Configure trusted proxy CIDR ranges explicitly (`set_real_ip_from` / `trusted_proxies`); never let untrusted public clients spoof `X-Forwarded-For`, `X-Forwarded-Proto`, or `X-Forwarded-Host` headers used by the upstream app for rate limiting, IP allowlists, or redirect URLs.
4. Match proxy limits to route requirements: `client_max_body_size` / `request_body max_size` for upload routes, upstream read/send timeouts for long-running requests, and unbuffered streaming (`proxy_buffering off;` / `X-Accel-Buffering: no`) plus `Upgrade`/`Connection` headers for SSE and WebSockets.
5. Protect private keys (`0600`) and DNS-01 API tokens; test new ACME certificate automation against Let's Encrypt staging first when iterating so production domain rate limits are not exhausted.
6. Diagnose each layer independently: DNS resolution (`dig`), TCP/TLS handshake and SAN/expiry (`openssl s_client -connect host:443 -servername host`), proxy routing, and local upstream health (`curl http://127.0.0.1:PORT`).

## Core Patterns & Pitfalls

- **HTTPS Redirect Loops Behind CDNs**: When an upstream proxy redirects HTTP → HTTPS (`301`) while Cloudflare is set to `Flexible` SSL (sending HTTP to origin) or `X-Forwarded-Proto` is ignored, users hit `ERR_TOO_MANY_REDIRECTS`. Use `Full (strict)` TLS end-to-end and honor `X-Forwarded-Proto` only from verified proxy CIDRs.
- **Nginx `proxy_pass` Trailing Slash Subtlety**: In Nginx, `location /api/ { proxy_pass http://127.0.0.1:3000/; }` strips the `/api/` prefix, whereas `proxy_pass http://127.0.0.1:3000;` preserves `/api/` on the upstream request. Verify exact path forwarding on representative URLs.
- **Anti-pattern — Let's Encrypt Production Rate-Limit Lockout**: Repeatedly restarting a misconfigured container that requests fresh production ACME certificates without a persistent certificate volume (`/data` in Caddy, `/etc/letsencrypt` in Certbot, `acme.json` in Traefik) hits duplicate-certificate rate limits and locks out issuance for days.

## Workflow

1. Trace the configured domain and edge/upstream chain for the authorized service.
2. Inspect expiry, SAN/hostname and effective routes; identify the failing layer.
3. Apply the minimal config/ownership fix and validate syntax.
4. Perform the authorized reload and test HTTPS, routing, redirects and streaming where applicable.
5. Record live evidence, renewal state and rollback configuration.

## Before returning

- [ ] DNS records, TLS SAN/expiry, proxy listener, and upstream bind port verified end-to-end
- [ ] Configuration validated (`nginx -t` / `caddy validate`) and certificate storage persisted across restarts
- [ ] `X-Forwarded-*` headers stripped/trusted only from verified proxy CIDRs
- [ ] Upload body limits, timeouts, and WebSocket/SSE streaming behavior verified for target routes
- [ ] Unrelated virtual hosts, TLS private keys, and ACME renewal paths preserved

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Caddy docs](https://caddyserver.com/docs/), [Nginx releases](https://nginx.org/en/download.html), [Traefik docs](https://doc.traefik.io/traefik/).

## Skills in scope

- vps-deploy — deploy an owned application to an explicitly authorized VPS with versioned artifacts, service identity and live health evidence.
- ssh-operations — connect to and administer explicitly authorized hosts through OpenSSH with verified identity and bounded operations.
- api-design — upstream path prefixes, CORS headers, rate limiting, and healthcheck endpoints.
- realtime-systems — implement WebSocket, SSE or established realtime transports with explicit authentication, ordering and reconnect behavior.
