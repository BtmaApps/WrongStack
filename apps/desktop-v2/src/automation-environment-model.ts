import {
  type EnvironmentProfile,
  formatAutomationCommands,
  parseAutomationCommands,
  validateEnvironmentProfile,
} from '@wrongstack/webui-protocol';

export interface EnvironmentDraft {
  name: string;
  image: string;
  setup: string;
  timeoutSeconds: string;
  services: Array<{
    name: string;
    image: string;
    command: string;
    health: string;
    envNames: string;
  }>;
  caches: EnvironmentProfile['caches'];
  ports: Array<{ name: string; port: string; protocol: 'http' | 'tcp' }>;
}
export function environmentDraft(profile?: EnvironmentProfile, image = ''): EnvironmentDraft {
  return {
    name: profile?.name ?? 'project-environment',
    image: profile?.image ?? image,
    setup: formatAutomationCommands(profile?.setupCommands ?? []),
    timeoutSeconds: String((profile?.setupTimeoutMs ?? 300000) / 1000),
    services:
      profile?.services.map((service) => ({
        name: service.name,
        image: service.image,
        command: formatAutomationCommands([service.command]),
        health: formatAutomationCommands([service.healthCommand]),
        envNames: service.envNames.join(', '),
      })) ?? [],
    caches: structuredClone(profile?.caches ?? []),
    ports: profile?.ports.map((port) => ({ ...port, port: String(port.port) })) ?? [],
  };
}
export function environmentProfile(draft: EnvironmentDraft): EnvironmentProfile {
  const oneCommand = (text: string, empty = false) => {
    const lines = parseAutomationCommands(text);
    if (lines.length > 1 || (!empty && lines.length !== 1))
      throw Error('Each service command must contain one command line.');
    return lines[0] ?? [];
  };
  const profile: EnvironmentProfile = {
    version: 1,
    name: draft.name.trim(),
    image: draft.image.trim(),
    // Whole milliseconds: 16.1 × 1000 is 16100.000000000002 in binary floating
    // point, which the profile's safe-integer check reported as out of range.
    setupTimeoutMs: Math.round(Number(draft.timeoutSeconds) * 1000),
    setupCommands: parseAutomationCommands(draft.setup),
    services: draft.services.map((service) => ({
      name: service.name.trim(),
      image: service.image.trim(),
      command: oneCommand(service.command, true),
      healthCommand: oneCommand(service.health),
      envNames: service.envNames
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    })),
    caches: draft.caches.map((cache) => ({ name: cache.name.trim(), target: cache.target.trim() })),
    ports: draft.ports.map((port) => ({
      name: port.name.trim(),
      port: Number(port.port),
      protocol: port.protocol,
    })),
  };
  validateEnvironmentProfile(profile);
  return profile;
}
