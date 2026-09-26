import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuotaChip } from '@/components/QuotaChip';
import { useProviderQuotaStore } from '@/stores';

beforeEach(() => {
  useProviderQuotaStore.getState().clear();
});
afterEach(cleanup);

const nowSec = () => Math.floor(Date.now() / 1000);

describe('QuotaChip pace forecast', () => {
  it('shows when the plan runs out at the current pace', () => {
    useProviderQuotaStore.getState().apply([
      {
        providerId: 'openai-codex',
        meterId: 'codex',
        capturedAt: 1,
        windows: [
          {
            id: 'primary',
            usedPercent: 50,
            windowMinutes: 300,
            resetsAt: nowSec() + 3 * 3600,
            exhaustsAt: nowSec() + 100 * 60 + 30,
          },
        ],
      },
    ]);
    const { container } = render(<QuotaChip />);
    expect(container.textContent).toContain('→100% ~1h 40m');
    expect(container.firstElementChild?.getAttribute('title')).toContain(
      "at the last hour's pace, full in ~1h 40m",
    );
  });

  it('adds nothing when the server sent no forecast', () => {
    useProviderQuotaStore.getState().apply([
      {
        providerId: 'openai-codex',
        meterId: 'codex',
        capturedAt: 1,
        windows: [{ id: 'primary', usedPercent: 50, resetsAt: nowSec() + 3600 }],
      },
    ]);
    const { container } = render(<QuotaChip />);
    expect(container.textContent).not.toContain('→100%');
  });
});
