/**
 * Regression: two credential spellings reached `/ps` output, telemetry and
 * Telegram notifications verbatim while their neighbours were redacted.
 *
 *  - The API-key header `x-api-key: …` (Anthropic) / `api-key: …` (Azure):
 *    the key-value rule only knew the underscore spelling `API_KEY`.
 *  - A JSON body field (`curl -d '{"password":"…"}'`): the key-value rule
 *    needs `[=:]` right after the name, and the key's closing quote sits there.
 */
import { describe, expect, it } from 'vitest';
import { redactCommand, redactCommandArgs, redactSecrets } from '../src/redact-command.js';

const SECRET = 'Zq9xK2mP7vL4nR8tW3yB6cF1';

describe('hyphenated API-key headers', () => {
  it.each([
    `curl https://api.anthropic.com/v1/messages -H "x-api-key: ${SECRET}"`,
    `curl -H 'X-Api-Key: ${SECRET}' https://x`,
    `curl -H "api-key: ${SECRET}" https://res.openai.azure.com`,
    `curl -H "x-goog-api-key: ${SECRET}" https://x`,
  ])('redacts %s on both profiles', (cmd) => {
    expect(redactCommand(cmd)).not.toContain(SECRET);
    expect(redactSecrets(cmd)).not.toContain(SECRET);
  });

  it('keeps the header name and the long-flag spelling readable', () => {
    expect(redactCommand(`curl -H 'x-api-key: ${SECRET}' https://x`)).toBe(
      "curl -H 'x-api-key:[REDACTED] https://x",
    );
    expect(redactCommand(`tool --api-key=${SECRET}`)).toBe('tool --api-key=[REDACTED]');
  });
});

describe('JSON secret fields', () => {
  it.each([
    `curl -d '{"username":"bob","password":"${SECRET}"}' https://x/login`,
    `curl --data '{"client_secret": "${SECRET}"}' https://x/token`,
    `curl -d '{"accessToken":"${SECRET}","n":1}' https://x`,
    `curl -d "{\\"password\\":\\"${SECRET}\\"}" https://x`,
  ])('redacts %s on both profiles', (cmd) => {
    expect(redactCommand(cmd)).not.toContain(SECRET);
    expect(redactSecrets(cmd)).not.toContain(SECRET);
  });

  it('keeps the key and the JSON structure, and is idempotent', () => {
    const once = redactCommand(`curl -d '{"user":"bob","password":"${SECRET}"}' https://x`);
    expect(once).toBe(`curl -d '{"user":"bob","password":[REDACTED]}' https://x`);
    expect(redactCommand(once)).toBe(once);
    expect(redactSecrets(redactSecrets(`{"secret": "${SECRET}"}`))).toBe('{"secret":[REDACTED]}');
  });

  it('redacts a JSON argv entry', () => {
    const out = redactCommandArgs('curl', ['-d', `{"password":"${SECRET}"}`]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it.each([
    `curl -H "Content-Type: application/json" -d '{"name":"bob","count":3}' https://x`,
    `echo '{"tokens_used": 12, "author":"ann"}'`,
  ])('leaves %s unchanged', (cmd) => {
    expect(redactCommand(cmd)).toBe(cmd);
    expect(redactSecrets(cmd)).toBe(cmd);
  });
});
