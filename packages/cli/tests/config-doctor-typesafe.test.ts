/**
 * The doctor rule for "a TypeSafe feature is on with no account behind it".
 *
 * This is the one misconfiguration the runtime cannot usefully shout about:
 * both consumers fail closed and degrade to their previous behaviour, so the
 * symptom is a switch that does nothing, with no error anywhere.
 */

import { describe, expect, it } from 'vitest';
import { diagnoseConfig } from '../src/config-doctor.js';

const NO_ENV: NodeJS.ProcessEnv = {};

describe('diagnoseConfig — TypeSafe account', () => {
  it('says nothing when no feature asks for TypeSafe', () => {
    // An install that never configured this must not be nagged about it.
    const report = diagnoseConfig({ version: 1 }, [], NO_ENV);
    expect(report.findings).toEqual([]);
  });

  it('flags every switch that is on without a usable account', () => {
    const report = diagnoseConfig(
      {
        version: 1,
        skills: { suggest: { enabled: true } },
        fleet: { dispatch: { typesafeClassifier: true } },
      },
      [],
      NO_ENV,
    );
    const paths = report.findings.map((f) => f.path);
    expect(paths).toContain('skills.suggest.enabled');
    expect(paths).toContain('fleet.dispatch.typesafeClassifier');
    // Never auto-fixed: turning the feature off discards a deliberate choice,
    // and nothing here can invent a credential.
    expect(report.findings.every((f) => f.fix === undefined)).toBe(true);
    expect(report.findings.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('accepts a key that lives only in the environment', () => {
    const report = diagnoseConfig({ version: 1, skills: { suggest: { enabled: true } } }, [], {
      TYPESAFE_API_KEY: 'k',
    });
    expect(report.findings).toEqual([]);
  });

  it('accepts an OpenRouter key for the OpenRouter route', () => {
    const report = diagnoseConfig(
      { version: 1, typesafe: { route: 'openrouter' }, skills: { suggest: { enabled: true } } },
      [],
      { OPENROUTER_API_KEY: 'sk-or-x' },
    );
    expect(report.findings).toEqual([]);
  });

  it('removes an unknown route and reports it as the route problem it is', () => {
    // Left in place, an invalid route would surface below as "no account",
    // which points the reader at the wrong line entirely.
    const report = diagnoseConfig(
      { version: 1, typesafe: { route: 'openai', apiKey: 'k' } },
      [],
      NO_ENV,
    );
    const finding = report.findings.find((f) => f.path === 'typesafe.route');
    expect(finding?.severity).toBe('error');
    expect(finding?.fix).toBeTruthy();
    expect((report.fixed['typesafe'] as Record<string, unknown>)['route']).toBeUndefined();
  });
});
