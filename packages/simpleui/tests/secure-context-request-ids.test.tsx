// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useSkillMentionPicker } from '../src/hooks/use-skill-mention-picker.js';

/**
 * `crypto.randomUUID` only exists in secure contexts. SimpleUI is served by the
 * same webui-server as the WebUI (#415), so over plain HTTP from a LAN address a
 * direct call throws and unmounts the app. Request ids come from `messageId()`
 * in `src/lib/session-helpers.ts`, which falls back when randomUUID is absent.
 */
const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const realCrypto = globalThis.crypto;
afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  document.body.replaceChildren();
});

describe('secure-context-only crypto.randomUUID', () => {
  it('is never called unguarded', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replaceAll('\\', '/'))
      .filter((rel) => /\bcrypto\.randomUUID\(/.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps the $skill picker working without randomUUID', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
      configurable: true,
    });
    const sent: Array<{ requestId?: string }> = [];
    const client = {
      send: (_type: string, payload: { requestId?: string }) => sent.push(payload),
      onMessage: () => () => {},
    };
    let setCursor: ((cursor: number) => void) | undefined;
    function Probe() {
      const [input, setInput] = useState('$sec');
      const ref = useRef<HTMLTextAreaElement | null>(null);
      setCursor = useSkillMentionPicker(
        input,
        setInput,
        ref,
        client as never,
        's1',
        'open',
      ).setCursor;
      return <textarea ref={ref} readOnly value={input} />;
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    act(() => setCursor?.(4));
    expect(sent).toEqual([{ requestId: expect.stringMatching(/^skill-mention-./) }]);
    act(() => root.unmount());
  });
});
