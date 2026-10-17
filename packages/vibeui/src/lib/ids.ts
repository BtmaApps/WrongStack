/** IDs identify local UI operations, including on plain-HTTP LAN deployments. */
export function clientId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `vibe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
