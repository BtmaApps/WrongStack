import { describe, expect, it } from 'vitest';
import { ModelPicker } from '../src/components/model-picker.js';
import { displayWidth } from '../src/terminal-width.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const providers = Array.from({ length: 35 }, (_, i) => ({
  id: `provider-${i}`,
  family: 'openai-compatible',
  models: Array.from({ length: 30 }, (_, j) => `model-${j}`),
}));
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
