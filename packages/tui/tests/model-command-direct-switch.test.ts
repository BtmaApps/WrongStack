// @vitest-environment jsdom
/**
 * `/model <provider>/<model>` switches at once; bare `/model` opens the
 * picker. The TUI command used to ignore its argument and always open the
 * picker, so `/model acp/claude-code` could not be typed at all.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  parseModelTarget,
  useProviderSlashCommands,
} from '../src/hooks/use-provider-slash-commands.js';

type Cmd = { name: string; run(args: string): Promise<{ message?: string }> };

function setup(switchResult: string | null = null) {
  const cmds = new Map<string, Cmd>();
  const registry = {
    register: (cmd: Cmd) => cmds.set(cmd.name, cmd),
    unregister: (name: string) => cmds.delete(name),
    get: (name: string) => cmds.get(name),
    ownerOf: () => undefined,
  };
  const switchProviderAndModel = vi.fn(async () => switchResult);
  const openModelPicker = vi.fn(async () => {});
  renderHook(() =>
    useProviderSlashCommands({
      slashRegistry: registry,
      getPickableProviders: async () => [],
      switchProviderAndModel,
      openModelPicker,
      openFKeyPicker: vi.fn(),
    } as never),
  );
  return { model: cmds.get('model') as Cmd, switchProviderAndModel, openModelPicker };
}

describe('/model', () => {
  it('reads provider/model and "provider model"; the model may carry a slash', () => {
    expect(parseModelTarget('acp/claude-code')).toEqual({ provider: 'acp', model: 'claude-code' });
    expect(parseModelTarget(' acp  claude-code ')).toEqual({
      provider: 'acp',
      model: 'claude-code',
    });
    expect(parseModelTarget('openrouter/meta/llama-4')).toEqual({
      provider: 'openrouter',
      model: 'meta/llama-4',
    });
    expect(parseModelTarget('')).toBeUndefined();
    expect(parseModelTarget('claude-code')).toBeUndefined();
    expect(parseModelTarget('/x')).toBeUndefined();
  });

  it('switches at once when given a target, and opens the picker without one', async () => {
    const { model, switchProviderAndModel, openModelPicker } = setup();
    await expect(model.run('acp/claude-code')).resolves.toEqual({
      message: 'Switched to acp / claude-code.',
    });
    expect(switchProviderAndModel).toHaveBeenCalledWith('acp', 'claude-code');
    expect(openModelPicker).not.toHaveBeenCalled();

    await model.run('');
    expect(openModelPicker).toHaveBeenCalledTimes(1);
  });

  it('says why a switch failed, and how to use it when the target is unreadable', async () => {
    const { model, openModelPicker } = setup('Unknown ACP agent "x"');
    await expect(model.run('acp/x')).resolves.toEqual({
      message: 'Could not switch to acp/x: Unknown ACP agent "x"',
    });
    await expect(model.run('claude-code')).resolves.toEqual({
      message: 'Usage: /model <provider>/<model>  (or /model to pick from a list)',
    });
    expect(openModelPicker).not.toHaveBeenCalled();
  });
});
