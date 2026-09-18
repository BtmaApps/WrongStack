import { describe, expect, it } from 'vitest';
import { ModelPicker } from '../src/components/model-picker.js';
import { displayWidth } from '../src/terminal-width.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const providers = Array.from({ length: 35 }, (_, i) => ({
  id: `provider-${i}`,
  family: 'openai-compatible',
  models: Array.from({ length: 30 }, (_, j) => `model-${j}`),
}));

it('keeps the provider preview compact when the terminal has spare height', async () => {
  const picker = (maxRows: number, selected = 22) => (
    <ModelPicker
      step="provider"
      providerOptions={providers}
      modelOptions={[]}
      filteredOptions={[]}
      selected={selected}
      columns={120}
      maxRows={maxRows}
    />
  );
  const view = renderRealTty(picker(54), { columns: 120, rows: 60 });
  try {
    await settle();
    const height = view.lastFrame().trimEnd().split('\n').length;
    expect(view.lastFrame()).toContain('provider-22');
    expect(height).toBeLessThanOrEqual(18);
    view.rerender(picker(22));
    await settle();
    expect(view.lastFrame().trimEnd().split('\n').length).toBe(height);
    view.rerender(picker(54, 34));
    await settle();
    expect(view.lastFrame()).toContain('provider-34');
    expect(view.lastFrame().trimEnd().split('\n').length).toBeLessThanOrEqual(18);
  } finally {
    view.unmount();
  }
});

it('does not fill unused provider preview rows for a small catalog', async () => {
  const small = providers.slice(0, 2).map((provider) => ({ ...provider, models: ['only-model'] }));
  const view = renderRealTty(
    <ModelPicker
      step="provider"
      providerOptions={small}
      modelOptions={[]}
      filteredOptions={[]}
      selected={0}
      columns={120}
      maxRows={54}
    />,
    { columns: 120, rows: 60 },
  );
  try {
    await settle();
    expect(view.lastFrame()).toContain('only-model');
    expect(view.lastFrame()).toContain('Esc');
    expect(view.lastFrame().trimEnd().split('\n').length).toBeLessThanOrEqual(10);
  } finally {
    view.unmount();
  }
});
describe.each([
  [120, 22],
  [80, 16],
  [52, 10],
  [40, 8],
])('model picker budget %ix%i', (columns, maxRows) => {
  it.each(['provider', 'model'] as const)(
    '%s keeps the selected option and controls in its allocated rows',
    async (step) => {
      const view = renderRealTty(
        <ModelPicker
          step={step}
          providerOptions={providers}
          modelOptions={providers[0]!.models}
          filteredOptions={providers[0]!.models}
          selected={22}
          pickedProviderId="provider-0"
          columns={columns}
          maxRows={maxRows}
        />,
        { columns, rows: maxRows + 6 },
      );
      try {
        await settle();
        const frame = view.lastFrame();
        expect(frame).toContain(step === 'provider' ? 'provider-22' : 'model-22');
        expect(frame).toContain('Enter');
        expect(frame).toContain('Esc');
        const lines = frame.trimEnd().split('\n');
        expect(lines.length).toBeLessThanOrEqual(maxRows);
        expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(columns);
      } finally {
        view.unmount();
      }
    },
  );
});
