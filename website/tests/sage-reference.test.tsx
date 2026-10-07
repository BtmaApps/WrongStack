import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RouterProvider } from '../src/lib/router';
import { SagePage } from '../src/pages/SagePage';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), '..', path), 'utf8');
}

function pageText() {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <RouterProvider>
      <SagePage />
    </RouterProvider>,
  );
  return container.textContent?.replace(/\s+/g, ' ') ?? '';
}

it('documents the shipped SAGE injection defaults in rendered copy', () => {
  const defaults = source('packages/core/src/storage/config-loader/defaults.ts');
  const inject = defaults.match(/Sage:\s*\{[\s\S]*?inject:\s*\{([\s\S]*?)\n\s*\},/)?.[1];
  expect(inject).toBeDefined();
  const turnContext = inject?.match(/turnContext:\s*(true|false)/)?.[1];
  const toolResults = inject?.match(/toolResults:\s*(true|false)/)?.[1];
  const maxHints = inject?.match(/maxHintsPerTool:\s*(\d+)/)?.[1];
  expect(turnContext).toBeDefined();
  expect(toolResults).toBeDefined();
  expect(maxHints).toBeDefined();
  const text = pageText();
  expect(text).toContain(`Sage.inject.turnContext (default ${turnContext}; opt-in)`);
  expect(text).toContain(`Sage.inject.toolResults (default ${toolResults})`);
  expect(text).toContain(`maxHintsPerTool (default ${maxHints})`);
  expect(text).toContain(`"turnContext": ${turnContext}`);
  expect(text).toContain(`"maxHintsPerTool": ${maxHints}`);
});

it('ties the scoring explanation to current tool-result weights, not the old priority bonuses', () => {
  const scoring = source('packages/sage/src/middleware/tool-call-memory-scoring.ts');
  const metadataWeight = scoring.match(/metadataScore \* ([\d.]+)/)?.[1];
  const relationWeight = scoring.match(/relationStrength \* ([\d.]+)/)?.[1];
  expect(metadataWeight).toBeDefined();
  expect(relationWeight).toBeDefined();
  const text = pageText();
  expect(text).toContain(`metadata × ${metadataWeight}`);
  expect(text).toContain(`relation strength × ${relationWeight}`);
  expect(text).toContain('never bypasses relevance, lifecycle or budget gates');
  expect(text).toContain('Fictional entries — not runtime ranking output');
  expect(text).not.toContain('Critical entries get +5');
  expect(text).not.toContain('Always injected into context');
});
