import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// An isolated loopback protocol fixture, never an external LLM or a real credential.
export const fixtureKey = 'desktop-fixture-key-not-a-real-secret-7654';
export const fixtureModel = 'desktop-fixture-model';
export const fixtureText = 'Native provider connection verified.';
export const fixtureMarkdown = `${fixtureText}

## Native result

- **Desktop** owns the conversation.
- Read the [project README](README.md).
- Read a [project note](native-notes.md).

| Surface | Result |
| --- | --- |
| Native chat | Pass |

\`\`\`ts
const native = true;
\`\`\`

[Blocked script](javascript:alert(1))

![Diagram](https://example.invalid/diagram.png)

<script>window.nativeUnsafeScriptRan = true</script>`;
export const inputFixture = {
  title: 'Native project decisions',
  submitLabel: 'Apply decisions',
  tabs: [
    {
      id: 'build',
      label: 'Build',
      questions: [
        {
          id: 'stack',
          question: 'Choose a stack',
          type: 'single_select',
          options: [
            { id: 'native', label: 'Native' },
            { id: 'react', label: 'React' },
          ],
          recommendedOption: 'native',
          recommendationReason: 'Keep the project in desktop.',
        },
        {
          id: 'features',
          question: 'Choose features',
          type: 'multi_select',
          options: [
            { id: 'terminal', label: 'Terminal' },
            { id: 'chat', label: 'Chat' },
            { id: 'git', label: 'Git' },
          ],
          recommendedOptions: ['terminal'],
        },
      ],
    },
    {
      id: 'delivery',
      label: 'Delivery',
      questions: [
        {
          id: 'notes',
          question: 'Release notes',
          type: 'text',
          required: true,
          placeholder: 'Describe the native release.',
        },
      ],
    },
  ],
};
export async function startLocalProvider() {
  const calls = [];
  const toolResults = [];
  const holds = new Map();
  const canceledHolds = new Set();
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/v1/models') {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            object: 'list',
            data: [{ id: fixtureModel, object: 'model', owned_by: 'desktop-test' }],
          }),
        );
        return;
      }
      let raw = '';
      for await (const part of request) {
        raw += part;
        if (raw.length > 8 * 1024 * 1024) throw new Error('Fixture request too large');
      }
      const body = JSON.parse(raw || '{}');
      const userTexts = (body.messages ?? [])
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
      const refiner = (body.messages ?? []).some(
        (m) => m.role === 'system' && String(m.content).includes('You are a request refiner'),
      );
      const composerPrompt = userTexts.findLast((text) => /\[native-composer-/.test(text)) ?? '';
      // Engine notes can quote earlier prompts inside a multimodal message.
      // Only a literal current instruction may activate this fixture's hold.
      const composerInstruction =
        (body.messages ?? [])
          .filter((message) => message.role === 'user')
          .flatMap((message) =>
            typeof message.content === 'string'
              ? [message.content]
              : (message.content ?? [])
                  .filter((part) => part.type === 'text')
                  .map((part) => part.text ?? ''),
          )
          .findLast((text) => /^\[native-composer-/.test(text.trim())) ?? '';
      const answer = refiner
        ? 'Build the desktop composer and preserve the requested session boundaries.\n---\nImplement the desktop composer while keeping the requested session boundaries.'
        : fixtureMarkdown;
      calls.push({
        path: request.url,
        authorized: request.headers.authorization === `Bearer ${fixtureKey}`,
        model: body.model,
        stream: body.stream,
        refiner,
        composerPrompt,
        reasoningEffort: body.reasoning_effort,
      });
      assert.equal(request.url, '/v1/chat/completions');
      assert.equal(body.model, fixtureModel);
      assert.ok(calls.at(-1).authorized, 'The encrypted saved key must reach the local provider');
      const common = {
        id: `desktop-fixture-response-${calls.length}`,
        created: Math.floor(Date.now() / 1000),
        model: fixtureModel,
      };
      const usage = { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 };
      // The real engine may append a context note as a user-role message after
      // tool output. Find the actual test prompt rather than that generated note.
      const lastUser =
        body.messages?.findLastIndex(
          (message) =>
            message.role === 'user' &&
            typeof message.content === 'string' &&
            /\[native-clarify-(?:submit|cancel)\]/.test(message.content),
        ) ?? -1;
      const content = String(body.messages?.[lastUser]?.content ?? '');
      const challenge = content.includes('[native-clarify-submit]')
        ? 'submit'
        : content.includes('[native-clarify-cancel]')
          ? 'cancel'
          : null;
      const toolReply = challenge
        ? body.messages.slice(lastUser + 1).find((message) => message.role === 'tool')
        : undefined;
      if (toolReply) toolResults.push({ challenge, content: toolReply.content });
      const needsForm = challenge && !toolReply;
      if (needsForm)
        assert.ok(
          body.tools?.some((tool) => tool.function?.name === 'clarify'),
          'Real clarify tool must be offered by the engine',
        );
      const toolCall = needsForm
        ? {
            index: 0,
            id: `desktop-clarify-${challenge}`,
            type: 'function',
            function: {
              name: 'clarify',
              arguments: JSON.stringify(
                challenge === 'submit'
                  ? inputFixture
                  : {
                      title: 'Native optional decision',
                      question: 'Should this request continue?',
                      options: ['Continue', 'Stop'],
                    },
              ),
            },
          }
        : undefined;
      if (!body.stream) {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            ...common,
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: toolCall
                  ? { role: 'assistant', content: null, tool_calls: [toolCall] }
                  : { role: 'assistant', content: answer },
                finish_reason: toolCall ? 'tool_calls' : 'stop',
              },
            ],
            usage,
          }),
        );
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const chunk = (choices, extra = {}) =>
        response.write(
          `data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices, ...extra })}\n\n`,
        );
      if (toolCall) {
        chunk([
          { index: 0, delta: { role: 'assistant', tool_calls: [toolCall] }, finish_reason: null },
        ]);
        chunk([{ index: 0, delta: {}, finish_reason: 'tool_calls' }], { usage });
        response.end('data: [DONE]\n\n');
        return;
      }
      chunk([
        {
          index: 0,
          delta: { role: 'assistant', content: refiner ? '' : 'Native provider ' },
          finish_reason: null,
        },
      ]);
      const hold =
        !refiner && composerInstruction.trim().match(/^\[native-composer-hold-([a-z]+)\]/)?.[1];
      if (hold) {
        await new Promise((resolve) => {
          holds.set(hold, resolve);
          response.once('close', () => {
            if (!response.writableEnded) canceledHolds.add(hold);
            holds.delete(hold);
            resolve();
          });
        });
        holds.delete(hold);
        if (response.destroyed) return;
      }
      chunk([
        {
          index: 0,
          delta: { content: answer.slice(refiner ? 0 : 'Native provider '.length) },
          finish_reason: null,
        },
      ]);
      chunk([{ index: 0, delta: {}, finish_reason: 'stop' }], { usage });
      response.end('data: [DONE]\n\n');
    } catch (error) {
      response.statusCode = 400;
      response.end(
        JSON.stringify({ error: { message: error.message, type: 'desktop_fixture_error' } }),
      );
    }
  });
  server.requestTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    calls,
    toolResults,
    holds,
    canceledHolds,
    releaseHold: (name) => holds.get(name)?.(),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
