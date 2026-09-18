import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Context } from '../../src/core/context.js';
import {
  activateDesign,
  clearActiveKit,
  detectFrontendFile,
  detectFrontendIntent,
  getDesignState,
  makeDesignDetectToolCallMiddleware,
  makeDesignDetectUserInputMiddleware,
  makeDesignStudioRequestMiddleware,
  setActiveKit,
} from '../../src/execution/design-detect.js';
import type { DesignKitLoader } from '../../src/types/design-kit.js';
import type { Request } from '../../src/types/provider.js';

function fakeCtx(): { meta: Record<string, unknown> } {
  return { meta: {} };
}

const fakeLoader: DesignKitLoader = {
  list: async () => [],
  listEntries: async () => [],
  find: async () => undefined,
  menuText: async () => '## Design kits (pick ONE)\n- **minimal-clarity** — calm',
  readBody: async () => '',
  readTokens: async () => undefined,
  foundationsText: async () => '',
  invalidateCache: () => {},
};

describe('detectFrontendIntent', () => {
  it('detects web UI intent and infers the web stack', () => {
    const hit = detectFrontendIntent('Build me a landing page with a hero section');
    expect(hit).not.toBeNull();
    expect(hit?.stack).toBe('web');
  });

  it('infers specific native stacks from keywords', () => {
    expect(detectFrontendIntent('make a flutter screen')?.stack).toBe('flutter');
    expect(detectFrontendIntent('an Expo react native app')?.stack).toBe('react-native');
    expect(detectFrontendIntent('a SwiftUI settings view')?.stack).toBe('swiftui');
    expect(detectFrontendIntent('a Jetpack Compose list')?.stack).toBe('compose');
  });

  it('returns null for non-UI prompts', () => {
    expect(detectFrontendIntent('fix the database migration script')).toBeNull();
    expect(detectFrontendIntent('refactor the retry policy')).toBeNull();
  });
});

describe('detectFrontendFile', () => {
  it('flags frontend file extensions and infers stack', () => {
    expect(detectFrontendFile('src/App.tsx')?.stack).toBe('web');
    expect(detectFrontendFile('styles/theme.css')?.stack).toBe('web');
    expect(detectFrontendFile('lib/home.dart')?.stack).toBe('flutter');
    expect(detectFrontendFile('Views/Home.swift')?.stack).toBe('swiftui');
  });

  it('ignores non-frontend files', () => {
    expect(detectFrontendFile('server/db.ts')).toBeNull();
    expect(detectFrontendFile('README.md')).toBeNull();
  });
});

describe('state helpers', () => {
  it('activate + setActiveKit + clearActiveKit mutate ctx.meta', () => {
    const ctx = fakeCtx();
    activateDesign(ctx, ['intent:ui'], 'web');
    let s = getDesignState(ctx);
    expect(s?.active).toBe(true);
    expect(s?.stack).toBe('web');

    setActiveKit(ctx, 'neo-brutalist', 'web');
    s = getDesignState(ctx);
    expect(s?.activeKit).toBe('neo-brutalist');

    clearActiveKit(ctx);
    expect(getDesignState(ctx)?.activeKit).toBeUndefined();
    expect(getDesignState(ctx)?.active).toBe(true); // detection survives
  });
});

describe('userInput middleware', () => {
  it('activates design state when the message has UI intent', async () => {
    const ctx = fakeCtx() as unknown as Context;
    const mw = makeDesignDetectUserInputMiddleware();
    await mw.handler({ text: 'design a dashboard UI', content: [], ctx }, async (p) => p);
    expect(getDesignState(ctx as unknown as { meta: Record<string, unknown> })?.active).toBe(true);
  });
});

describe('toolCall middleware', () => {
  it('activates when a frontend file is written', async () => {
    const ctx = fakeCtx() as unknown as Context;
    const mw = makeDesignDetectToolCallMiddleware();
    await mw.handler(
      {
        toolUse: { type: 'tool_use', id: 'x', name: 'write', input: { path: 'ui/Card.tsx' } },
        result: { type: 'tool_result', tool_use_id: 'x', content: [] },
        ctx,
      } as never,
      async (p) => p,
    );
    expect(getDesignState(ctx as unknown as { meta: Record<string, unknown> })?.active).toBe(true);
  });
});

describe('request inject middleware', () => {
  function baseReq(): Request {
    return { model: 'm', system: [{ type: 'text', text: 'BASE' }], messages: [] } as Request;
  }

  it('is a no-op when Design Studio is inactive', async () => {
    const ctx = fakeCtx() as unknown as Context;
    const mw = makeDesignStudioRequestMiddleware({ ctx, loader: fakeLoader });
    const out = await mw.handler(baseReq(), async (r) => r);
    expect(out.system).toHaveLength(1);
    expect(out.system?.[0]?.text).toBe('BASE');
  });

  it('injects the kit menu when active without a chosen kit', async () => {
    const ctx = fakeCtx() as unknown as Context;
    activateDesign(ctx as unknown as { meta: Record<string, unknown> }, ['intent:ui'], 'web');
    const mw = makeDesignStudioRequestMiddleware({ ctx, loader: fakeLoader });
    const out = await mw.handler(baseReq(), async (r) => r);
    expect(out.system).toHaveLength(2);
    const injected = out.system?.[1]?.text ?? '';
    expect(injected).toMatch(/Design Studio/i);
    expect(injected).toContain('minimal-clarity');
    expect(injected).toMatch(/WCAG/);
    // Does not mutate the shared base array.
    expect(out.system?.[0]?.text).toBe('BASE');
  });

  it('shrinks to a one-line reminder once a kit is active', async () => {
    const ctx = fakeCtx() as unknown as Context;
    setActiveKit(ctx as unknown as { meta: Record<string, unknown> }, 'neo-brutalist', 'web');
    const mw = makeDesignStudioRequestMiddleware({ ctx, loader: fakeLoader });
    const out = await mw.handler(baseReq(), async (r) => r);
    const injected = out.system?.[1]?.text ?? '';
    expect(injected).toMatch(/Active design kit: neo-brutalist/);
  });

  it('respects the enabled() gate', async () => {
    const ctx = fakeCtx() as unknown as Context;
    activateDesign(ctx as unknown as { meta: Record<string, unknown> }, ['intent:ui'], 'web');
    const mw = makeDesignStudioRequestMiddleware({ ctx, loader: fakeLoader, enabled: () => false });
    const out = await mw.handler(baseReq(), async (r) => r);
    expect(out.system).toHaveLength(1);
  });

  it('carries the current project brief across requests and kit changes without mutating history', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-brief-'));
    try {
      await fs.mkdir(path.join(root, '.design'));
      const brief = path.join(root, '.design', 'brief.md');
      await fs.writeFile(brief, 'Task: reconcile warehouse shortages.');
      const ctx = { projectRoot: root, meta: {} } as unknown as Context;
      activateDesign(ctx, ['intent:ui'], 'web');
      const mw = makeDesignStudioRequestMiddleware({ ctx, loader: fakeLoader });
      const req = baseReq();
      const first = await mw.handler(req, async (r) => r);
      expect(first.system?.[1]?.text).toContain('reconcile warehouse shortages');
      await fs.writeFile(brief, 'Task: compare shipment exceptions.');
      setActiveKit(ctx, 'neo-brutalist', 'web');
      const second = await mw.handler(req, async (r) => r);
      expect(second.system?.[1]?.text).toContain('compare shipment exceptions');
      expect(second.system?.[1]?.text).not.toContain('reconcile warehouse shortages');
      expect(first.system?.[1]?.text).toContain('reconcile warehouse shortages');
      expect(req.system).toHaveLength(1);
      await fs.rm(brief);
      const third = await mw.handler(req, async (r) => r);
      expect(third.system?.[1]?.text).not.toContain('compare shipment exceptions');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('bounds a large brief and directs the model to read the remainder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-brief-'));
    try {
      await fs.mkdir(path.join(root, '.design'));
      await fs.writeFile(
        path.join(root, '.design', 'brief.md'),
        `Audience: operators\n${'x'.repeat(20000)}END`,
      );
      const ctx = { projectRoot: root, meta: {} } as unknown as Context;
      setActiveKit(ctx, 'minimal-clarity', 'web');
      const mw = makeDesignStudioRequestMiddleware({ ctx, loader: fakeLoader });
      const out = await mw.handler(baseReq(), async (r) => r);
      const injected = out.system?.[1]?.text ?? '';
      expect(injected).toContain('Audience: operators');
      expect(injected).toContain('truncated');
      expect(injected).not.toContain('END');
      expect(injected.length).toBeLessThan(10000);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
