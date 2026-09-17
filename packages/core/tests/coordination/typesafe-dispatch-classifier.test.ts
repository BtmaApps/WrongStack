import { describe, expect, it, vi } from 'vitest';
import type { AgentDefinition } from '../../src/coordination/agents/types.js';
import { dispatchAgent } from '../../src/coordination/dispatcher.js';
import { makeTypeSafeDispatchClassifier } from '../../src/coordination/typesafe-dispatch-classifier.js';
import type {
  SystemOneRequest,
  SystemOneResult,
  TypeSafeClient,
} from '../../src/typesafe/client.js';

const CANDIDATES = [
  {
    role: 'security-auditor',
    name: 'Security Auditor',
    summary: 'Finds vulnerabilities in existing code',
    differentiatesFrom: 'audits code that exists rather than designing new controls',
  },
  { role: 'security-architect', name: 'Security Architect', summary: 'Designs security controls' },
];

function clientOf(result: SystemOneResult | Error): TypeSafeClient & {
  calls: SystemOneRequest[];
} {
  const calls: SystemOneRequest[] = [];
  return {
    calls,
    async systemOne(req) {
      calls.push(req);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function answers(opts: {
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  fit?: number;
  omitFit?: boolean;
}): SystemOneResult {
  const probabilities = opts.probabilities ?? {
    'security-auditor': 0.8,
    'security-architect': 0.2,
  };
  const result: SystemOneResult = {
    answers: {
      which: {
        type: 'choice',
        choice: opts.choice ?? 'security-auditor',
        probabilities,
        confidence: opts.confidence ?? 0.75,
      },
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  if (!opts.omitFit) {
    result.answers['any_fits'] = { type: 'noul', noul: opts.fit ?? 0.8 };
  }
  return result;
}

describe('makeTypeSafeDispatchClassifier', () => {
  it('picks a role and reports the distribution as real confidence', async () => {
    const client = clientOf(answers({ confidence: 0.62 }));
    const classify = makeTypeSafeDispatchClassifier({ client });

    const choice = await classify('audit this module for injection flaws', CANDIDATES);

    expect(choice?.role).toBe('security-auditor');
    // The prose path had no certainty to report; this one does.
    expect(choice?.confidence).toBeCloseTo(0.62);
    expect(choice?.reason).toContain('fit');
  });

  it('sends one Choice over the candidates plus the decline Noul', async () => {
    const client = clientOf(answers({}));
    await makeTypeSafeDispatchClassifier({ client })('audit this', CANDIDATES);

    const request = client.calls[0]!;
    expect(Object.keys(request.questions).sort()).toEqual(['any_fits', 'which']);
    const criteria = (request.questions['which'] as { criteria: Record<string, string> }).criteria;
    expect(Object.keys(criteria).sort()).toEqual(['security-architect', 'security-auditor']);
    // The contrast line is the useful evidence here: the classifier only runs
    // when summaries alone did not separate siblings.
    expect(criteria['security-auditor']).toContain('audits code that exists');
  });

  it('declines when no candidate genuinely fits', async () => {
    // A model asked to pick one of six always picks one of six. The Noul is
    // what makes "none of these" expressible at all.
    const client = clientOf(answers({ fit: 0.1 }));
    const choice = await makeTypeSafeDispatchClassifier({ client })(
      'book me a flight to Berlin',
      CANDIDATES,
    );
    expect(choice).toBeNull();
  });

  it('declines when the distribution says nothing at all', async () => {
    const client = clientOf(answers({ confidence: 0.05 }));
    expect(
      await makeTypeSafeDispatchClassifier({ client })('something vague', CANDIDATES),
    ).toBeNull();
  });

  it('does not decline on a near-tie between two acceptable roles', async () => {
    // Several equally good answers spread probability the same way genuine
    // confusion does. Refusing here would throw away a usable pick.
    const client = clientOf(
      answers({
        probabilities: { 'security-auditor': 0.52, 'security-architect': 0.48 },
        confidence: 0.28,
      }),
    );
    const choice = await makeTypeSafeDispatchClassifier({ client })('security work', CANDIDATES);
    expect(choice?.role).toBe('security-auditor');
  });

  it('declines when the fit answer is missing rather than proceeding without it', async () => {
    // Without it there is nothing between a task no agent covers and the
    // nearest one.
    const client = clientOf(answers({ omitFit: true }));
    expect(await makeTypeSafeDispatchClassifier({ client })('audit this', CANDIDATES)).toBeNull();
  });

  it('declines a role that was not offered', async () => {
    const client = clientOf(answers({ choice: 'totally-made-up' }));
    expect(await makeTypeSafeDispatchClassifier({ client })('audit this', CANDIDATES)).toBeNull();
  });

  it('declines on a transport failure instead of throwing into dispatch', async () => {
    const client = clientOf(new Error('network down'));
    expect(await makeTypeSafeDispatchClassifier({ client })('audit this', CANDIDATES)).toBeNull();
  });

  it('spends nothing when there is nothing to decide', async () => {
    const client = clientOf(answers({}));
    const classify = makeTypeSafeDispatchClassifier({ client });
    expect(await classify('audit this', [])).toBeNull();
    expect(await classify('audit this', [CANDIDATES[0]!])).toBeNull();
    expect(client.calls).toHaveLength(0);
  });
});

describe('dispatchAgent with a confidence-reporting classifier', () => {
  /** Two roles with no keyword overlap with the task, forcing the classifier. */
  const catalog: Record<string, AgentDefinition> = {
    alpha: {
      config: { role: 'alpha', name: 'Alpha' },
      budget: {},
      capability: { phase: 'build', summary: 'Alpha work', keywords: ['alpha'] },
    },
    beta: {
      config: { role: 'beta', name: 'Beta' },
      budget: {},
      capability: { phase: 'build', summary: 'Beta work', keywords: ['beta'] },
    },
  };

  it('carries the classifier confidence into the result instead of hardcoding 1', async () => {
    const result = await dispatchAgent('an unrelated task', {
      catalog,
      classifier: async () => ({ role: 'alpha', confidence: 0.55, reason: 'because' }),
    });
    expect(result.method).toBe('llm');
    expect(result.confidence).toBeCloseTo(0.55);
  });

  it('keeps the historical confidence of 1 for a classifier that reports none', async () => {
    const result = await dispatchAgent('an unrelated task', {
      catalog,
      classifier: async () => ({ role: 'alpha' }),
    });
    expect(result.confidence).toBe(1);
  });

  it('offers the WHOLE catalog when the heuristic found fewer than two candidates', async () => {
    // Found by running this against the real 75-role catalog: "design how we
    // should store and rotate the signing keys" scores exactly ONE keyword hit
    // — `designer`, the UI role, on the word "design". The classifier was
    // handed that single name, which is not a choice at all, so it could only
    // rubber-stamp it and key management went to the UI designer.
    //
    // We only reach a classifier BECAUSE the heuristic was inconclusive, so a
    // pool built from it is inconclusive too.
    const seen: string[][] = [];
    const catalog: Record<string, AgentDefinition> = {
      designer: {
        config: { role: 'designer', name: 'Designer' },
        budget: {},
        capability: { phase: 'build', summary: 'UI design', keywords: ['design'] },
      },
      auth: {
        config: { role: 'auth', name: 'Auth' },
        budget: {},
        capability: { phase: 'build', summary: 'Credentials and keys', keywords: ['oauth'] },
      },
      executor: {
        config: { role: 'executor', name: 'Executor' },
        budget: {},
        capability: { phase: 'build', summary: 'Generalist', keywords: ['build'] },
      },
    };

    await dispatchAgent('design how we store and rotate signing keys', {
      catalog,
      classifier: async (_task, candidates) => {
        seen.push(candidates.map((c) => c.role).sort());
        return { role: 'auth' };
      },
    });

    // `designer` alone matched a keyword; the classifier must still see `auth`.
    expect(seen[0]).toEqual(['auth', 'designer', 'executor']);
  });

  it('still narrows to the heuristic shortlist when it found a real contest', async () => {
    const seen: string[][] = [];
    const catalog: Record<string, AgentDefinition> = {
      alpha: {
        config: { role: 'alpha', name: 'Alpha' },
        budget: {},
        capability: { phase: 'build', summary: 'Alpha', keywords: ['shared'] },
      },
      beta: {
        config: { role: 'beta', name: 'Beta' },
        budget: {},
        capability: { phase: 'build', summary: 'Beta', keywords: ['shared'] },
      },
      unrelated: {
        config: { role: 'unrelated', name: 'Unrelated' },
        budget: {},
        capability: { phase: 'build', summary: 'Unrelated', keywords: ['nothing'] },
      },
    };

    await dispatchAgent('a shared task', {
      catalog,
      classifier: async (_task, candidates) => {
        seen.push(candidates.map((c) => c.role).sort());
        return null;
      },
    });

    // Two candidates tied on a keyword: that IS a contest, so the pool stays
    // narrow and `unrelated` is not dragged in.
    expect(seen[0]).toEqual(['alpha', 'beta']);
  });

  it('falls back to its own routing when the classifier declines', async () => {
    const classifier = vi.fn(async () => null);
    const result = await dispatchAgent('an unrelated task', { catalog, classifier });
    expect(classifier).toHaveBeenCalled();
    expect(result.method).toBe('fallback');
  });
});
