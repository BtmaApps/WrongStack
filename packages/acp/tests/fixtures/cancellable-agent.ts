import { WrongStackACPServer } from '../../src/agent/wrongstack-acp-agent.js';

await new WrongStackACPServer({
  runTurn: async ({ signal }, emit) => {
    emit({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'started' } });
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
    });
    throw new Error('provider aborted');
  },
}).start();
