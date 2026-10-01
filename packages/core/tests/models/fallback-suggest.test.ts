import { describe, expect, it } from 'vitest';
import {
  buildFallbackSuggestPrompt,
  type FallbackSuggestCandidate,
  excludeListedModels,
  isFallbackEligible,
  isModelRefListed,
  mergeLlmFallbackSuggestions,
  modelVersion,
  scoreFallbackCandidates,
  selectLlmCandidatePool,
  suggestFallbackProfiles,
} from '../../src/models/fallback-suggest.js';

const tools = ['tools'];
const reasoning = ['tools', 'reasoning'];

const POOL: FallbackSuggestCandidate[] = [
  {
    provider: 'anthropic',
    model: 'claude-opus-4-1',
    releaseDate: '2025-08-05',
    contextWindow: 200_000,
    inputCost: 15,
    outputCost: 75,
    capabilities: reasoning,
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    releaseDate: '2025-10-15',
    contextWindow: 200_000,
    inputCost: 1,
    outputCost: 5,
    capabilities: reasoning,
  },
  {
    provider: 'openai',
    model: 'gpt-5',
    releaseDate: '2025-08-07',
    contextWindow: 400_000,
    inputCost: 1.25,
    outputCost: 10,
    capabilities: reasoning,
  },
  {
    provider: 'openai',
    model: 'gpt-5-nano',
    releaseDate: '2025-08-07',
    contextWindow: 400_000,
    inputCost: 0.05,
    outputCost: 0.4,
    capabilities: reasoning,
  },
  {
    provider: 'google',
    model: 'gemini-2.5-pro',
    releaseDate: '2025-06-17',
    contextWindow: 1_048_576,
    inputCost: 1.25,
    outputCost: 10,
    capabilities: reasoning,
  },
  {
    provider: 'google',
    model: 'gemini-2.5-flash',
    releaseDate: '2025-06-17',
    contextWindow: 1_048_576,
    inputCost: 0.3,
    outputCost: 2.5,
    capabilities: reasoning,
  },
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    releaseDate: '2025-09-29',
    contextWindow: 128_000,
    inputCost: 0.28,
    outputCost: 0.42,
    capabilities: tools,
  },
];

describe('fallback suggestions — eligibility', () => {
  it('drops non-agent models, tool-less models and tiny contexts', () => {
    expect(isFallbackEligible({ provider: 'openai', model: 'text-embedding-3-large' })).toBe(false);
    expect(isFallbackEligible({ provider: 'openai', model: 'gpt-image-1' })).toBe(false);
    expect(isFallbackEligible({ provider: 'openai', model: 'gpt-4o-audio-preview' })).toBe(false);
    expect(
      isFallbackEligible({ provider: 'x', model: 'chat-only', capabilities: ['vision'] }),
    ).toBe(false);
    expect(isFallbackEligible({ provider: 'x', model: 'old', contextWindow: 8_192 })).toBe(false);
  });

  it('keeps models whose capabilities are undocumented (custom/local providers)', () => {
    expect(isFallbackEligible({ provider: 'custom-1', model: 'qwen3-coder' })).toBe(true);
  });
});

describe('fallback suggestions — scoring', () => {
  it('reads family size hints as whole tokens, so a brand name is not a size', () => {
    const [minimax, mini] = scoreFallbackCandidates([
      { provider: 'minimax', model: 'MiniMax-M2', capabilities: tools },
      { provider: 'openai', model: 'o4-mini', capabilities: tools },
    ]);
    expect(minimax?.speed).toBeLessThan(mini?.speed ?? 0);
    expect(minimax?.strength).toBeGreaterThan(mini?.strength ?? 1);
  });

  it('does not read an unpriced subscription model as the weakest', () => {
    const scored = scoreFallbackCandidates([
      ...POOL,
      { provider: 'codex', model: 'gpt-5-codex', capabilities: reasoning },
    ]);
    const codex = scored.find((s) => s.ref === 'codex/gpt-5-codex');
    const nano = scored.find((s) => s.ref === 'openai/gpt-5-nano');
    expect(codex?.cheapness).toBe(0.5);
    expect(codex?.strength).toBeGreaterThan(nano?.strength ?? 1);
  });

  it('treats a zero price as free, not unknown', () => {
    const [local] = scoreFallbackCandidates([
      { provider: 'ollama', model: 'qwen3:32b', inputCost: 0, outputCost: 0 },
    ]);
    expect(local?.cheapness).toBe(1);
  });
});

describe('fallback suggestions — chains', () => {
  it('builds strong / balanced / fast / budget chains from the reachable pool', () => {
    const suggestions = suggestFallbackProfiles(POOL);
    const byId = Object.fromEntries(suggestions.map((s) => [s.id, s]));
    expect(byId['strong']?.chain[0]).toBe('anthropic/claude-opus-4-1');
    expect(byId['balanced']?.chain[0]).not.toMatch(/nano/);
    expect(byId['fast']?.chain[0]).toMatch(/nano|flash|haiku/);
    expect(byId['budget']?.chain[0]).toMatch(/nano|deepseek-chat/);
    for (const s of suggestions) {
      expect(s.chain.length).toBeGreaterThanOrEqual(2);
      expect(s.chain.length).toBeLessThanOrEqual(4);
      expect(new Set(s.chain).size).toBe(s.chain.length);
      expect(s.source).toBe('heuristic');
      // Only refs the user can actually reach.
      for (const ref of s.chain) {
        expect(POOL.some((c) => `${c.provider}/${c.model}` === ref)).toBe(true);
      }
    }
  });

  it('spreads a chain across providers before reusing one', () => {
    const strong = suggestFallbackProfiles(POOL, { ids: ['strong'] })[0];
    const leading = strong?.chain.slice(0, 3).map((ref) => ref.split('/')[0]);
    expect(new Set(leading).size).toBe(3);
  });

  it('never chains two dated snapshots of the same model on one provider', () => {
    const suggestions = suggestFallbackProfiles(
      [
        {
          provider: 'openai',
          model: 'gpt-4o',
          capabilities: tools,
          inputCost: 2.5,
          outputCost: 10,
        },
        {
          provider: 'openai',
          model: 'gpt-4o-2024-08-06',
          capabilities: tools,
          inputCost: 2.5,
          outputCost: 10,
        },
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          capabilities: tools,
          inputCost: 0.15,
          outputCost: 0.6,
        },
      ],
      { ids: ['strong'] },
    );
    expect(suggestions[0]?.chain).toHaveLength(2);
  });

  it('omits a chain that cannot reach two models and dedupes identical chains', () => {
    expect(suggestFallbackProfiles([POOL[0] as FallbackSuggestCandidate])).toEqual([]);
    const two = suggestFallbackProfiles(POOL.slice(0, 2), { chainLength: 2 });
    const keys = two.map((s) => [...s.chain].sort().join(','));
    // Two models make at most two orderings of the same pair, never a repeat.
    expect(new Set(two.map((s) => s.chain.join(','))).size).toBe(two.length);
    expect(keys.every((k) => k === keys[0])).toBe(true);
  });

  it('is deterministic', () => {
    expect(suggestFallbackProfiles(POOL)).toEqual(suggestFallbackProfiles([...POOL].reverse()));
  });
});

describe('fallback suggestions — LLM merge', () => {
  const draft = suggestFallbackProfiles(POOL);

  it('accepts a valid LLM chain and keeps the heuristic for ids it skipped', () => {
    const reply = JSON.stringify({
      profiles: [
        {
          id: 'strong',
          chain: ['openai/gpt-5', 'anthropic/claude-opus-4-1', 'google/gemini-2.5-pro'],
          rationale: 'GPT-5 leads agentic coding.',
        },
      ],
    });
    const { suggestions, rejected } = mergeLlmFallbackSuggestions(reply, POOL, draft);
    expect(rejected).toBe(0);
    const strong = suggestions.find((s) => s.id === 'strong');
    expect(strong?.source).toBe('llm');
    expect(strong?.chain[0]).toBe('openai/gpt-5');
    expect(strong?.rationale).toBe('GPT-5 leads agentic coding.');
    expect(suggestions.find((s) => s.id === 'budget')?.source).toBe('heuristic');
  });

  it('rejects a whole profile when the LLM invents a ref', () => {
    const reply = `\`\`\`json\n${JSON.stringify({
      profiles: [{ id: 'fast', chain: ['google/gemini-2.5-flash', 'openai/gpt-9-turbo'] }],
    })}\n\`\`\``;
    const { suggestions, rejected } = mergeLlmFallbackSuggestions(reply, POOL, draft);
    expect(rejected).toBe(1);
    expect(suggestions.find((s) => s.id === 'fast')).toEqual(draft.find((s) => s.id === 'fast'));
  });

  it('falls back to the draft on unparseable output', () => {
    const { suggestions } = mergeLlmFallbackSuggestions('sorry, I cannot', POOL, draft);
    expect(suggestions).toEqual(draft);
  });

  it('caps the pool and lists every pooled ref in the prompt', () => {
    const big: FallbackSuggestCandidate[] = Array.from({ length: 80 }, (_, i) => ({
      provider: `p${i % 5}`,
      // Letter-only ids: numbered ids would read as versions of ONE line.
      model: `model-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
      inputCost: i + 1,
      outputCost: (i + 1) * 4,
      capabilities: tools,
    }));
    const pool = selectLlmCandidatePool(big, 20);
    expect(pool).toHaveLength(20);
    const prompt = buildFallbackSuggestPrompt(pool, suggestFallbackProfiles(big));
    for (const s of pool) expect(prompt).toContain(s.ref);
  });
});

describe('fallback suggestions — only current models', () => {
  const refs = (pool: FallbackSuggestCandidate[]) =>
    scoreFallbackCandidates(pool).map((s) => s.ref);

  it('drops models models.dev marks deprecated', () => {
    expect(
      refs([
        {
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'deprecated',
          capabilities: tools,
        },
        { provider: 'deepseek', model: 'deepseek-flash', capabilities: tools },
      ]),
    ).toEqual(['deepseek/deepseek-flash']);
  });

  it('drops models a year older than the newest model in the pool', () => {
    const pool: FallbackSuggestCandidate[] = [
      {
        provider: 'cerebras',
        model: 'qwen-3.8-27b',
        releaseDate: '2026-08-14',
        capabilities: tools,
      },
      {
        provider: 'cerebras',
        model: 'gpt-oss-120b',
        releaseDate: '2025-08-05',
        capabilities: tools,
      },
      { provider: 'custom-1', model: 'local-coder', capabilities: [] },
    ];
    expect(refs(pool)).toEqual(['cerebras/qwen-3.8-27b', 'custom-1/local-coder']);
    expect(scoreFallbackCandidates(pool, { maxAgeMonths: 0 })).toHaveLength(3);
  });

  it('keeps only the newest release of a family line per provider', () => {
    expect(
      refs([
        {
          provider: 'openai',
          model: 'gpt-5.4-pro',
          releaseDate: '2026-03-01',
          capabilities: tools,
        },
        {
          provider: 'openai',
          model: 'gpt-5.5-pro',
          releaseDate: '2026-04-24',
          capabilities: tools,
        },
        {
          provider: 'anthropic',
          model: 'claude-opus-5',
          releaseDate: '2026-05-01',
          capabilities: tools,
        },
        {
          provider: 'anthropic',
          model: 'claude-opus-5-5',
          releaseDate: '2026-09-22',
          capabilities: tools,
        },
        // Same line on ANOTHER provider is a separate key — kept for resilience.
        {
          provider: 'github-copilot',
          model: 'claude-opus-5',
          releaseDate: '2026-05-01',
          capabilities: tools,
        },
      ]).sort(),
    ).toEqual(['anthropic/claude-opus-5-5', 'github-copilot/claude-opus-5', 'openai/gpt-5.5-pro']);
  });

  it('prefers stable models over beta / preview / free ones', () => {
    const [fast] = suggestFallbackProfiles(
      [
        {
          provider: 'opencode',
          model: 'space-bunny-free',
          inputCost: 0,
          outputCost: 0,
          capabilities: tools,
        },
        {
          provider: 'zai',
          model: 'glm-5.3-flash',
          inputCost: 0.1,
          outputCost: 0.4,
          capabilities: tools,
        },
        {
          provider: 'minimax',
          model: 'MiniMax-M3',
          inputCost: 0.3,
          outputCost: 1.2,
          capabilities: tools,
        },
      ],
      { ids: ['fast'] },
    );
    expect(fast?.chain[0]).toBe('zai/glm-5.3-flash');
    expect(fast?.entries.find((e) => e.model === 'space-bunny-free')?.unstable).toBe(true);
  });
});

describe('fallback suggestions — superseded versions (models.dev family)', () => {
  const refs = (pool: FallbackSuggestCandidate[]) =>
    scoreFallbackCandidates(pool)
      .map((s) => s.ref)
      .sort();

  // Mirrors the real minimax-coding-plan catalog (2026-10-01 cache).
  const MINIMAX: FallbackSuggestCandidate[] = [
    {
      provider: 'minimax-coding-plan',
      model: 'MiniMax-M3.1-Flash-Preview',
      family: 'minimax',
      releaseDate: '2026-09-27',
      capabilities: tools,
    },
    {
      provider: 'minimax-coding-plan',
      model: 'MiniMax-M3',
      family: 'minimax',
      releaseDate: '2026-06-01',
      capabilities: tools,
    },
    {
      provider: 'minimax-coding-plan',
      model: 'MiniMax-M2.7',
      family: 'minimax',
      releaseDate: '2026-03-18',
      capabilities: tools,
    },
    {
      provider: 'minimax-coding-plan',
      model: 'MiniMax-M2.7-highspeed',
      family: 'minimax',
      releaseDate: '2026-03-18',
      capabilities: tools,
    },
    {
      provider: 'minimax-coding-plan',
      model: 'MiniMax-M2.5',
      family: 'minimax',
      releaseDate: '2026-02-12',
      capabilities: tools,
    },
  ];

  it('keeps only the newest stable version of a family, plus a newer preview', () => {
    expect(refs(MINIMAX)).toEqual([
      'minimax-coding-plan/MiniMax-M3',
      'minimax-coding-plan/MiniMax-M3.1-Flash-Preview',
    ]);
  });

  it('retires older versions even when their variant has no newer twin', () => {
    expect(
      refs([
        {
          provider: 'zai',
          model: 'glm-5.3',
          family: 'glm',
          releaseDate: '2026-08-14',
          capabilities: tools,
        },
        {
          provider: 'zai',
          model: 'glm-5.3-highspeed',
          family: 'glm',
          releaseDate: '2026-08-14',
          capabilities: tools,
        },
        {
          provider: 'zai',
          model: 'glm-5.2-highspeed',
          family: 'glm',
          releaseDate: '2026-06-13',
          capabilities: tools,
        },
        {
          provider: 'zai',
          model: 'glm-5-turbo',
          family: 'glm',
          releaseDate: '2026-03-16',
          capabilities: tools,
        },
        // Different family on the same provider is its own line.
        {
          provider: 'zai',
          model: 'glm-5.3-flash',
          family: 'glm-flash',
          releaseDate: '2026-08-26',
          capabilities: tools,
        },
      ]),
    ).toEqual(['zai/glm-5.3', 'zai/glm-5.3-flash', 'zai/glm-5.3-highspeed']);
  });

  it('never suggests a superseded model in any chain', () => {
    const pool = [
      ...MINIMAX,
      {
        provider: 'zai',
        model: 'glm-5.3',
        family: 'glm',
        releaseDate: '2026-08-14',
        capabilities: tools,
      },
      {
        provider: 'zai',
        model: 'glm-5.2',
        family: 'glm',
        releaseDate: '2026-06-13',
        capabilities: tools,
      },
    ];
    const used = suggestFallbackProfiles(pool).flatMap((s) => s.chain);
    expect(used).not.toContain('minimax-coding-plan/MiniMax-M2.7');
    expect(used).not.toContain('minimax-coding-plan/MiniMax-M2.7-highspeed');
    expect(used).not.toContain('zai/glm-5.2');
  });

  it('parses release versions, skipping snapshot dates and parameter sizes', () => {
    expect(modelVersion('MiniMax-M3.1-Flash-Preview')).toEqual([3, 1]);
    expect(modelVersion('claude-opus-5-5')).toEqual([5, 5]);
    expect(modelVersion('claude-sonnet-4-5-20250929')).toEqual([4, 5]);
    expect(modelVersion('deepseek-v4-pro-0813')).toEqual([4]);
    expect(modelVersion('qwen3-30b-a3b')).toEqual([3]);
    expect(modelVersion('gpt-oss-120b')).toBeUndefined();
    expect(modelVersion('deepseek-flash')).toBeUndefined();
  });
});

describe('fallback suggestions — disabled models', () => {
  it('matches the picker ref grammar', () => {
    expect(isModelRefListed('zai', 'glm-5.3', ['ZAI/glm-5.3'])).toBe(true);
    expect(isModelRefListed('zai', 'glm-5.3', ['zai glm-5.3'])).toBe(true);
    expect(isModelRefListed('zai', 'glm-5.3', ['glm-5.3'])).toBe(true);
    expect(isModelRefListed('zai', 'glm-5.3', ['other/glm-5.3'])).toBe(false);
    expect(isModelRefListed('zai', 'glm-5.3', [])).toBe(false);
  });

  it('removes disabled models before any chain is built', () => {
    const pool = excludeListedModels(POOL, ['anthropic/claude-opus-4-1', 'gpt-5']);
    const used = suggestFallbackProfiles(pool).flatMap((s) => s.chain);
    expect(used).not.toContain('anthropic/claude-opus-4-1');
    expect(used).not.toContain('openai/gpt-5');
  });
});
