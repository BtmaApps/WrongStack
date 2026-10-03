import { describe, expect, it } from 'vitest';
import { resolveOAuthKind } from '../src/auth-menu/oauth-menu.js';

/**
 * `resolveOAuthKind` is the single source of truth for the OAuth vocabulary.
 * Before it existed, `wstack auth login <x>` and the interactive OAuth submenu
 * each carried their own alias set — `claude-pro` and `gh` worked on the CLI
 * but not in the menu. These tests pin the union so the two can't drift apart
 * again.
 */
describe('resolveOAuthKind', () => {
  it.each([
    ['grok', 'xai'],
    ['kimi-coding', 'kimi'],
    ['muse', 'meta'],
    ['chatgpt-direct', 'chatgpt-api'],
  ])('maps %s to the new %s strategy', (alias, strategy) => {
    expect(resolveOAuthKind(alias)).toBe(strategy);
  });
  it('maps every ChatGPT spelling both surfaces used to accept', () => {
    for (const alias of ['chatgpt', 'openai', 'codex', 'codex-cli', 'openai-codex']) {
      expect(resolveOAuthKind(alias)).toBe('chatgpt');
    }
  });

  it('maps every Claude spelling both surfaces used to accept', () => {
    for (const alias of ['claude', 'anthropic', 'claude-pro', 'claude-max', 'anthropic-oauth']) {
      expect(resolveOAuthKind(alias)).toBe('claude');
    }
  });

  it('maps every Copilot spelling both surfaces used to accept', () => {
    for (const alias of ['copilot', 'github', 'gh', 'github-copilot']) {
      expect(resolveOAuthKind(alias)).toBe('copilot');
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveOAuthKind('  ChatGPT  ')).toBe('chatgpt');
    expect(resolveOAuthKind('CLAUDE-MAX')).toBe('claude');
  });

  it('resolves the menu 1/2/3 picks only when numeric input is allowed', () => {
    expect(resolveOAuthKind('1')).toBe('chatgpt');
    expect(resolveOAuthKind('2')).toBe('claude');
    expect(resolveOAuthKind('3')).toBe('copilot');
    // `wstack auth login 2` is a typo, not a request to sign into Claude.
    expect(resolveOAuthKind('2', { allowNumeric: false })).toBeUndefined();
  });

  it('returns undefined for empty and unknown input rather than guessing', () => {
    expect(resolveOAuthKind('')).toBeUndefined();
    expect(resolveOAuthKind('   ')).toBeUndefined();
    expect(resolveOAuthKind('gemini')).toBeUndefined();
    expect(resolveOAuthKind('999')).toBeUndefined();
  });
});
