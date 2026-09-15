import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin, Tool } from '@wrongstack/core/types';
import { afterAll, describe, expect, it } from 'vitest';
import accessibilityAuditor from '../src/accessibility-auditor/index.js';
import autoI18nExtractor from '../src/auto-i18n-extractor/index.js';
import codeMetrics from '../src/code-metrics/index.js';
import deadCodeDetector from '../src/dead-code-detector/index.js';
import duplicateCodeDetector from '../src/duplicate-code-detector/index.js';
import featureFlagTracker from '../src/feature-flag-tracker/index.js';
import interfaceContractGuard from '../src/interface-contract-guard/index.js';
import refactorSuggester from '../src/refactor-suggester/index.js';
import securityHotspotScanner from '../src/security-hotspot-scanner/index.js';

/**
 * Enabling a plugin (`wstack plugin enable <name>`, plugin_manager enable)
 * writes only a `plugins[]` entry. The loader then hands the plugin its
 * `defaultConfig` — or nothing, when no `extensions.<name>` block exists. These
 * nine defaulted their own `enabled` master switch to `false`, so a plugin the
 * user had just enabled registered its tools and every call threw
 * "<plugin> is disabled" (audit 2026-09-15). An explicit
 * `extensions.<name>.enabled: false` still turns them off.
 */
const PLUGINS: Array<[Plugin, string]> = [
  [accessibilityAuditor, 'a11y_audit'],
  [autoI18nExtractor, 'i18n_extract'],
  [codeMetrics, 'measure_code_metrics'],
  [deadCodeDetector, 'dead_code_scan'],
  [duplicateCodeDetector, 'detect_duplicate_code'],
  [featureFlagTracker, 'scan_feature_flags'],
  [interfaceContractGuard, 'check_interface_contracts'],
  [refactorSuggester, 'suggest_refactors'],
  [securityHotspotScanner, 'security_hotspot_scan'],
];

const root = mkdtempSync(path.join(os.tmpdir(), 'loaded-plugin-enabled-'));
mkdirSync(path.join(root, 'src'), { recursive: true });
const sourceFile = path.join(root, 'src', 'x.ts');
writeFileSync(sourceFile, 'export function hello(a: number) {\n  return a + 1;\n}\n');
afterAll(() => rmSync(root, { recursive: true, force: true }));

interface Loaded {
  api: unknown;
  tool: Tool | undefined;
}

function load(plugin: Plugin, toolName: string, extension: unknown): Loaded {
  const tools: Tool[] = [];
  const noop = () => {};
  const off = () => noop;
  const metric = { inc: noop, add: noop, set: noop, observe: noop, record: noop };
  const api = {
    tools: {
      register: (tool: Tool) => {
        tools.push(tool);
        return noop;
      },
      unregister: noop,
    },
    log: { info: noop, warn: noop, error: noop, debug: noop, trace: noop },
    metrics: { counter: () => metric, gauge: () => metric, histogram: () => metric },
    registerHook: off,
    registerSystemPromptContributor: off,
    onEvent: off,
    onPattern: off,
    onConfigChange: off,
    emitCustom: noop,
    events: { on: off, emit: noop },
    extensions: { register: off },
    llm: { complete: async () => Promise.reject(new Error('no llm')) },
    config: {
      cwd: root,
      extensions: extension === undefined ? {} : { [plugin.name]: extension },
    },
  };
  void plugin.setup(api as never);
  return { api, tool: tools.find((t) => t.name === toolName) };
}

async function callMessage(tool: Tool): Promise<string> {
  try {
    await tool.execute(
      { path: root, directory: root, files: [sourceFile] } as never,
      { cwd: root, projectRoot: root } as never,
      { signal: new AbortController().signal },
    );
    return 'ok';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe('a loaded plugin exposes working tools without an extensions block', () => {
  for (const [plugin, toolName] of PLUGINS) {
    it(`${plugin.name}: defaultConfig keeps the master switch on`, () => {
      expect(plugin.defaultConfig?.['enabled']).toBe(true);
    });

    for (const [label, extension] of [
      ['loader-supplied defaultConfig', plugin.defaultConfig],
      ['no extensions block', undefined],
    ] as const) {
      it(`${plugin.name}: ${toolName} is not disabled (${label})`, async () => {
        const { api, tool } = load(plugin, toolName, extension);
        try {
          expect(tool).toBeDefined();
          expect(await callMessage(tool as Tool)).not.toMatch(/is disabled/);
        } finally {
          await plugin.teardown?.(api as never);
        }
      });
    }

    it(`${plugin.name}: explicit enabled:false still disables ${toolName}`, async () => {
      const { api, tool } = load(plugin, toolName, { enabled: false });
      try {
        expect(await callMessage(tool as Tool)).toMatch(/is disabled/);
      } finally {
        await plugin.teardown?.(api as never);
      }
    });
  }
});
