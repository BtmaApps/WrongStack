// Browser-side fake for src/lib/ws.ts, loaded via resolve.alias by
// tests/app-browser-smoke.mjs. Plain ESM — served by vite as a real file,
// which sidesteps virtual-module interception entirely (the package's own
// shiki shim uses the same alias mechanism).
//
// Frame delivery hits BOTH consumption paths: the core app injects onMessage
// via constructor options (use-simple-socket), while panels subscribe
// imperatively via onMessage(fn).
const listeners = new Set();

export class SimpleSocket {
  constructor(options) {
    this.options = options;
  }

  #emit(type, payload) {
    const message = { type, payload };
    listeners.forEach((fn) => {
      fn(message);
    });
    this.options.onMessage?.(message);
  }

  connect() {
    queueMicrotask(() => {
      this.options.onState('open');
      this.#emit('session.start', {
        sessionId: 'sess-browser-smoke',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        projectName: 'BROWSER SMOKE',
        cwd: 'D:/Codebox/PROJECTS/WrongStack',
        startedAt: new Date().toISOString(),
        reset: true,
        isRunning: false,
        replayMessages: [],
      });
    });
    return Promise.resolve();
  }

  send(type, payload) {
    window.__sent.push({ type, payload });
    queueMicrotask(() => {
      if (type === 'providers.list') {
        this.#emit('provider.catalog', {
          providers: [
            {
              id: 'openai',
              name: 'OpenAI',
              family: 'openai',
              apiBase: 'https://api.openai.com/v1',
            },
          ],
        });
      }
      if (type === 'prefs.get') this.#emit('prefs.updated', {});
      if (type === 'user_message') {
        this.#emit('iteration.started', { sessionId: 'sess-browser-smoke' });
        this.#emit('provider.response', {
          content: 'Smoke acknowledged.',
          stopReason: 'end_turn',
          sessionId: 'sess-browser-smoke',
        });
        this.#emit('run.result', { status: 'done', sessionId: 'sess-browser-smoke' });
      }
    });
  }

  close() {}

  onMessage(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
}

window.__sent = [];
export const defaultWsUrl = () => new URL('ws://127.0.0.1:3466');
export const scrubPageToken = () => {};
export const exchangeAuthCookie = async (url) => url;
export const __test__ = {};
