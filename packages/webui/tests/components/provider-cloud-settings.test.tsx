// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderCloudSettings as SimpleCloud } from '../../../simpleui/src/provider-cloud-settings.js';

const mock = vi.hoisted(() => ({
  operation: vi.fn(async (_client: unknown, _message: unknown) => true),
}));
vi.mock('@/lib/auth-operation', () => ({ requestAuthOperation: mock.operation }));

import { ProviderCloudSettings as WebCloud } from '../../src/components/SettingsPanel/ProviderCloudSettings';

afterEach(() => {
  cleanup();
  mock.operation.mockClear();
});
describe('cloud settings forms', () => {
  it('writes explicit profile fields through WebUI without sending credentials', async () => {
    const send = vi.fn();
    render(
      <WebCloud
        id="work"
        type="google-vertex"
        cloud={{ project: 'old-project', location: 'us-central1' }}
        ws={{ send } as never}
      />,
    );
    fireEvent.change(screen.getByLabelText('project'), { target: { value: 'new-project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cloud settings' }));
    await waitFor(() => expect(mock.operation).toHaveBeenCalled());
    expect(mock.operation.mock.calls[0]?.[1]).toEqual({
      type: 'provider.update',
      payload: { id: 'work', cloud: { project: 'new-project', location: 'us-central1' } },
    });
  });
  it('uses the same validation and empty-field fallback in SimpleUI', async () => {
    const save = vi.fn(async () => {});
    render(
      <SimpleCloud
        type="amazon-bedrock"
        cloud={{ region: 'us-east-1' }}
        busy={false}
        onSave={save}
      />,
    );
    fireEvent.change(screen.getByLabelText('region'), { target: { value: 'bad/region' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cloud settings' }));
    await screen.findByRole('alert');
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('region'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cloud settings' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({}));
  });
});
