# HQ as an always-on service (Ubuntu)

Install the standalone `wstack` binary system-wide, then register it as a
boot-persistent, automatically restarting systemd service. The service needs an
executable outside `/root` and `/home`, so point the installer at
`/usr/local/bin` instead of its per-user default (`~/.wrongstack/bin`). The
password is written to a root-only environment file rather than the unit or
process arguments:

```bash
curl -fsSL https://wrongstack.com/install.sh | sudo WSTACK_INSTALL_DIR=/usr/local/bin sh
sudo -E WRONGSTACK_HQ_PASSWORD='use-a-long-random-password' \
  wstack hq service install
```

The service listens on `0.0.0.0:3499`. Password authentication remains
mandatory.

## Network allowlist

An optional comma-separated exact-IP/CIDR admission list can reject traffic
before HTTP/WebSocket authentication:

```bash
sudo -E WRONGSTACK_HQ_PASSWORD='use-a-long-random-password' \
  WRONGSTACK_HQ_ALLOWLIST='198.51.100.42,10.20.0.0/16,2001:db8::/48' \
  wstack hq service install
```

Without `WRONGSTACK_HQ_ALLOWLIST`, no network allowlist is applied. Loopback is
always admitted when a list is active. Matching uses the real TCP peer, never
`X-Forwarded-For`; when a reverse proxy is used, allow its source network here
and perform end-user IP filtering at that proxy.

## Lifecycle

The installation creates `wrongstack-hq.service` plus a persistent daily update
timer. Updates stop HQ only for the replacement window, verify that the new CLI
starts, and reinstall the previous version when startup fails.

```bash
wstack hq service status      # inspect the unit and timer
sudo wstack hq service update # trigger an update now
sudo wstack hq service uninstall
```

`service uninstall` removes the units while preserving
`/var/lib/wrongstack-hq` and `/etc/wrongstack/hq.env`.

## Logs

Runtime logs remain in journald:

```bash
journalctl -u wrongstack-hq -f
```

Managed service startup suppresses bootstrap URLs and client-token secrets.
