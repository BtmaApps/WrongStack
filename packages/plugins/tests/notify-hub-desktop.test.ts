import { describe, expect, it, vi } from 'vitest';
import { DesktopNotifier, desktopCommand, toastText } from '../src/notify-hub/desktop-notifier.js';

type ExecCall = [
  string,
  string[],
  { env: Record<string, string>; windowsHide: boolean; timeout: number },
];

function fakeExec(fail = false) {
  const calls: ExecCall[] = [];
  const exec = vi.fn(
    (file: string, args: string[], opts: ExecCall[2], cb: (err: Error | null) => void) => {
      calls.push([file, args, opts]);
      cb(fail ? new Error('boom\nstack') : null);
      return { on: () => {} };
    },
  );
  return { exec, calls };
}

describe('desktopCommand', () => {
  it('has a command per desktop platform and none elsewhere', () => {
    expect(desktopCommand('win32')?.file).toBe('powershell.exe');
    expect(desktopCommand('darwin')?.file).toBe('osascript');
    expect(desktopCommand('linux')?.file).toBe('notify-send');
    expect(desktopCommand('aix')).toBeNull();
  });

  it('never embeds the text in the script — it reads the environment', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      const script = desktopCommand(platform)?.args.join(' ') ?? '';
      expect(script).toContain('WS_NOTIFY_TITLE');
      expect(script).toContain('WS_NOTIFY_BODY');
    }
  });
});

describe('DesktopNotifier', () => {
  it('never hands the notification command a credential from the environment', () => {
    const { exec, calls } = fakeExec();
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-secret');
    try {
      new DesktopNotifier({ platform: 'darwin', exec: exec as never }).notify('stop', 't', 'b');
    } finally {
      vi.unstubAllEnvs();
    }
    const env = (calls[0] as ExecCall)[2].env;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.WS_NOTIFY_BODY).toBe('b');
  });

  it('passes a hostile title through the environment, not the command', () => {
    const { exec, calls } = fakeExec();
    const notifier = new DesktopNotifier({ platform: 'win32', exec: exec as never });
    const hostile = 'x"; Remove-Item C:\\ -Recurse; "$(whoami)`';
    expect(notifier.notify('permission', hostile, 'body')).toBe(true);
    const [file, args, opts] = calls[0] as ExecCall;
    expect(file).toBe('powershell.exe');
    expect(args.join(' ')).not.toContain('Remove-Item');
    expect(opts.env.WS_NOTIFY_TITLE).toContain('Remove-Item');
    expect(opts.windowsHide).toBe(true);
    expect(opts.timeout).toBe(5000);
  });

  it('gives notify-send the text as argv items', () => {
    const { exec, calls } = fakeExec();
    new DesktopNotifier({ platform: 'linux', exec: exec as never }).notify('stop', 'T', 'B');
    expect((calls[0] as ExecCall)[1]).toEqual(['--app-name=WrongStack', 'T', 'B']);
  });

  it('drops a repeat of one kind inside the interval, not another kind', () => {
    const { exec } = fakeExec();
    const notifier = new DesktopNotifier({
      platform: 'darwin',
      exec: exec as never,
      minIntervalMs: 10_000,
    });
    expect(notifier.notify('stop', 't', 'b', 1_000)).toBe(true);
    expect(notifier.notify('stop', 't', 'b', 5_000)).toBe(false);
    expect(notifier.notify('input', 't', 'b', 5_000)).toBe(true);
    expect(notifier.notify('stop', 't', 'b', 12_000)).toBe(true);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('reports a failing command once, not on every notification', () => {
    const { exec } = fakeExec(true);
    const onError = vi.fn();
    const notifier = new DesktopNotifier({
      platform: 'linux',
      exec: exec as never,
      onError,
      minIntervalMs: 0,
    });
    notifier.notify('a', 't', 'b');
    notifier.notify('b', 't', 'b');
    expect(notifier.failed).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe('notify-send failed: boom');
  });

  it('does nothing on a platform without a command', () => {
    const { exec } = fakeExec();
    const notifier = new DesktopNotifier({ platform: 'aix', exec: exec as never });
    expect(notifier.supported).toBe(false);
    expect(notifier.notify('stop', 't', 'b')).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('toastText', () => {
  it('flattens to one bounded line without markdown marks', () => {
    expect(toastText('**Run**\n`bash`  now', 80)).toBe('Run bash now');
    expect(toastText('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});
