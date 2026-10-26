import { readFileSync } from 'node:fs';
import { isRegisteredMessageType } from '@wrongstack/webui-protocol';
import { describe, expect, it } from 'vitest';
import { actionPayload, featureActions } from '../src/feature-actions';
import { desktopFeatures } from '../src/feature-catalog';

const webui = readFileSync(
  new URL('../../../packages/webui/src/stores/ui-store-types.ts', import.meta.url),
  'utf8',
);
function sourceArray(name: string): string[] {
  const body = webui.match(new RegExp(`export const ${name}(?:[^=]*)=\\s*\\[([\\s\\S]*?)\\]`))?.[1];
  if (!body) throw new Error(`Missing upstream navigation contract: ${name}`);
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}
describe('native desktop feature coverage', () => {
  it.each([
    ['VIEWS', 'views'],
    ['ACTIVITIES', 'activities'],
    ['SETTINGS_TABS', 'settings'],
  ] as const)('maps every WebUI %s entry to one native workspace module', (name, key) => {
    const source = sourceArray(name);
    const mapped = desktopFeatures.flatMap((feature) => feature[key] ?? []);
    expect(mapped.sort()).toEqual(source.sort());
    expect(new Set(mapped).size).toBe(mapped.length);
  });
  it('only sends registered engine operations and listens for registered responses', () => {
    const clients = { has: (type: string) => isRegisteredMessageType(type, 'client') };
    const servers = { has: (type: string) => isRegisteredMessageType(type, 'server') };
    expect(clients.has('native.fictional-operation')).toBe(false);
    for (const feature of desktopFeatures)
      for (const query of feature.queries ?? []) {
        if (query.type) {
          expect(clients.has(query.type), query.type).toBe(true);
          expect(servers.has(query.response ?? query.type), query.response ?? query.type).toBe(
            true,
          );
        }
      }
    for (const action of featureActions) {
      expect(
        desktopFeatures.some((feature) => feature.id === action.module),
        action.module,
      ).toBe(true);
      if (action.type) expect(clients.has(action.type), action.type).toBe(true);
      if (action.result) expect(servers.has(action.result), action.result).toBe(true);
    }
    expect(new Set(featureActions.map((action) => action.id)).size).toBe(featureActions.length);
  });
  it('builds typed native form payloads without shell evaluation or implicit submission', () => {
    const mcp = featureActions.find((action) => action.label === 'Add a local MCP server')!;
    expect(
      actionPayload(mcp, {
        name: 'local',
        command: 'tool.exe',
        args: '--project\nPath with spaces',
        enabled: false,
      }),
    ).toEqual({
      name: 'local',
      command: 'tool.exe',
      args: ['--project', 'Path with spaces'],
      enabled: false,
    });
    expect(() => actionPayload(mcp, { name: '', command: 'tool.exe' })).toThrow('Server name');
    const start = featureActions.find((action) => action.type === 'goal.start')!;
    expect(actionPayload(start, { goal: 'Build the native desktop' })).toMatchObject({
      goal: 'Build the native desktop',
      verifyTasks: true,
      worktrees: true,
    });
  });
});
