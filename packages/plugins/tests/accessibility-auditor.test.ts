import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accessibilityAuditorPlugin = (await import('../src/accessibility-auditor')).default;

interface MockApi {
  tools: { register: ReturnType<typeof vi.fn> };
  config: { extensions: Record<string, unknown> };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  metrics: {
    counter: ReturnType<typeof vi.fn>;
  };
  registerHook: ReturnType<typeof vi.fn>;
}

function makeApi(overrides: { extensions?: Record<string, unknown> } = {}): MockApi {
  return {
    tools: { register: vi.fn() },
    config: {
      extensions: {
        'accessibility-auditor': { enabled: true },
        ...(overrides.extensions ?? {}),
      },
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
}

function getTool(api: MockApi, name: string): (input: unknown) => Promise<unknown> {
  const call = api.tools.register.mock.calls.find((c) => (c[0] as { name: string }).name === name);
  if (!call) throw new Error(`tool ${name} not registered`);
  return (call[0] as { execute: (input: unknown) => Promise<unknown> }).execute;
}

type HookResult = { decision?: string; reason?: string; additionalContext?: string } | undefined;

function getHook(api: MockApi): (input: unknown) => HookResult {
  const call = api.registerHook.mock.calls[0];
  if (!call) throw new Error('hook not registered');
  return (call as unknown[])[2] as (input: unknown) => HookResult;
}

// Scoped to THIS process. `beforeEach`/`afterEach` recursively delete this
// directory, so a fixed path let two overlapping runs of this suite delete
// each other's fixtures mid-test: a11y_audit then found no files and returned
// zero findings, failing assertions that pass in isolation. The pid suffix
// keeps concurrent passes independent. It must stay under process.cwd()
// because the auditor rejects paths outside the project.
const FIXTURE_DIR = resolve(process.cwd(), `.temp_files/a11y-tests-${process.pid}`);

function writeFixture(name: string, content: string) {
  const p = resolve(FIXTURE_DIR, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
  mkdirSync(FIXTURE_DIR, { recursive: true });
});

afterEach(async () => {
  const api = makeApi();
  await accessibilityAuditorPlugin.teardown?.(api as never);
  try {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('accessibility-auditor plugin', () => {
  it('registers a11y_audit, a11y_status and a PostToolUse write|edit hook', async () => {
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    expect(api.tools.register).toHaveBeenCalledTimes(2);
    const names = api.tools.register.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(names).toContain('a11y_audit');
    expect(names).toContain('a11y_status');
    const [event, matcher] = api.registerHook.mock.calls[0]!;
    expect(event).toBe('PostToolUse');
    expect(matcher).toBe('write|edit');
  });

  // Regression guard for the contention-bound flake: this suite was green solo
  // but failed under two CONCURRENT passes, because beforeEach/afterEach
  // recursively delete FIXTURE_DIR and a fixed path let one pass wipe the
  // other's fixtures mid-test (a11y_audit then returned zero findings). The
  // real end-to-end proof is a two-process run; this asserts the structural
  // invariant that makes concurrent passes independent.
  it('scopes FIXTURE_DIR to this process so concurrent passes cannot collide', () => {
    expect(FIXTURE_DIR).toContain(String(process.pid));
    // Must stay under cwd: the auditor rejects paths outside the project.
    expect(FIXTURE_DIR.startsWith(resolve(process.cwd(), '.temp_files'))).toBe(true);
  });

  it('a11y_audit reports missing alt on images', async () => {
    writeFixture('MissingAlt.tsx', '<div><img src="/a.png" /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string; message: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.rule === 'missing-alt')).toBe(true);
  });

  // Round-38 regression: ATTR_ALT and the value regex in hasMeaningfulAlt used
  // a bare `\b` word boundary. A hyphen IS a word boundary, so both also matched
  // `data-alt="…"` / `data-x-alt="…"` and read a data-* attribute — invisible to
  // assistive tech — as alt text, suppressing the error-severity missing-alt
  // finding. Same hazard already fixed for ATTR_ID with `(?<![-\w])`.
  it('a11y_audit reports missing-alt when only a data-alt attribute is present', async () => {
    writeFixture(
      'DataAltOnly.tsx',
      '<div><img src="/chart.png" data-alt="Sales chart for Q3" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.rule === 'missing-alt')).toBe(true);
  });

  it('a11y_audit reports missing-alt when data-alt precedes an empty real alt', async () => {
    // The bare `\b` made the FIRST match win, so data-alt's value was read as the
    // alt text and masked the genuinely empty alt="".
    writeFixture(
      'DataAltThenEmptyAlt.tsx',
      '<div><img data-alt="Chart" src="/chart.png" alt="" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-alt')).toBe(true);
  });

  it('a11y_audit reports missing-alt for an unrelated data-x-alt lookalike', async () => {
    writeFixture('DataXAlt.tsx', '<div><img src="/i.png" data-x-alt="nope" /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-alt')).toBe(true);
  });

  it('a11y_audit still honours a real alt alongside a data-alt attribute', async () => {
    // No-over-correction guard: the fix must not make real alt text stop working.
    writeFixture(
      'DataAltPlusRealAlt.tsx',
      '<div><img data-alt="Chart" src="/chart.png" alt="Sales chart" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-alt')).toBe(false);
  });

  it('a11y_audit reports missing input labels and placeholder warnings', async () => {
    writeFixture('MissingLabel.tsx', '<input type="text" placeholder="Name" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
    expect(result.findings.some((f) => f.rule === 'low-contrast-placeholder')).toBe(true);
  });

  it('a11y_audit recognizes a label associated by for/id', async () => {
    writeFixture(
      'LabeledInput.tsx',
      '<label for="name">Name</label><input id="name" type="text" />\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(false);
  });

  it('recognizes a JSX htmlFor label and does not read data-id as an id', async () => {
    writeFixture(
      'JsxLabel.tsx',
      [
        '<label htmlFor="email">Email</label>',
        '<input data-id="row" id="email" type="email" />',
        '<li data-id="row"></li>',
      ].join('\n'),
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.map((f) => f.rule)).toEqual([]);
  });

  it('does not read data-title as a title, since a data-* attribute is not an accessible name', async () => {
    writeFixture(
      'DataTitle.tsx',
      [
        '<input type="text" data-title="Email address" />',
        '<button data-title="Close"></button>',
        '<input type="submit" data-title="Go" />',
      ].join('\n'),
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    // A hyphen is a word boundary, so `\btitle` also matched `data-title=`.
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
    expect(result.findings.filter((f) => f.rule === 'missing-button-text').length).toBe(2);
  });

  it('a real title= attribute still counts as an accessible name', async () => {
    writeFixture(
      'RealTitle.tsx',
      ['<input type="text" title="Email address" />', '<button title="Close"></button>'].join('\n'),
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    // Guards the opposite direction: the `(?<![-\w])` guard must not
    // over-correct and start flagging elements that really are labelled.
    expect(result.findings.map((f) => f.rule)).toEqual([]);
  });

  // Round-40 bug-hunter regression: ATTR_ARIA_LABEL was an EXISTENCE test, so
  // `aria-label=""` / `aria-labelledby=""` — which name nothing for assistive
  // tech — counted as a primary label and suppressed the error-severity
  // findings. This is a different defect from rounds 38/39: those matched the
  // WRONG attribute via a hyphen word boundary; this matched the RIGHT
  // attribute and still accepted an empty value.
  it('a11y_audit reports an input whose aria-label is empty', async () => {
    writeFixture('EmptyAriaLabel.tsx', '<div><input type="text" aria-label="" /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
  });

  it('a11y_audit reports empty aria-label and aria-labelledby on buttons', async () => {
    writeFixture(
      'EmptyAriaLabelButton.tsx',
      '<div><button aria-label=""></button><input type="submit" aria-labelledby="" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-button-text');
    expect(found).toHaveLength(2);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
  });

  it('a whitespace-only aria-label is still not an accessible name', async () => {
    writeFixture('BlankAriaLabel.tsx', '<div><input type="text" aria-label="   " /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
  });

  it('a duplicate attribute does not rescue an empty name (HTML keeps the first)', async () => {
    // The WHATWG tokenizer discards a repeated attribute name, so this
    // element's accessible name is the empty first one.
    writeFixture(
      'DuplicateAriaLabel.tsx',
      '<div><input type="text" aria-label="" aria-label="Email" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
  });

  // Round-41 bug-hunter regression: ATTR_TITLE was still an EXISTENCE test
  // after round 39 fixed only its word boundary, so `title=""` / `title="   "`
  // — a fallback name that supplies nothing — kept suppressing the
  // error-severity findings. Same existence-vs-value class as round 40, on a
  // different constant and with different suppressed rules.
  it('a11y_audit reports an input whose title is empty', async () => {
    writeFixture('EmptyTitle.tsx', '<div><input type="text" title="" /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
  });

  it('a11y_audit reports empty title on a button and on input[type=submit]', async () => {
    writeFixture(
      'EmptyTitleButton.tsx',
      '<div><button title=""></button><input type="submit" title="" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-button-text');
    expect(found).toHaveLength(2);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
  });

  it('a whitespace-only title is still not an accessible name', async () => {
    writeFixture('BlankTitle.tsx', '<div><input type="text" title="   " /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
  });

  it('a duplicate title does not rescue an empty one (HTML keeps the first)', async () => {
    // The WHATWG tokenizer discards a repeated attribute name, so this
    // element's fallback name is the empty first one.
    writeFixture('DuplicateTitle.tsx', '<div><input type="text" title="" title="Email" /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
  });

  // Round-42 bug-hunter regression: ATTR_ARIA_DESCRIBEDBY was an EXISTENCE
  // test, so an empty `aria-describedby=""` (which references nothing) was
  // treated as a real supplementary description. That did two wrong things:
  // it REPLACED the error-severity `missing-input-label` with a mere warning,
  // and it emitted a message claiming the element "uses aria-describedby as
  // a description" — false for an empty one. A downgrade with a false claim,
  // distinct from rounds 40/41 where the error was suppressed outright.
  it('a11y_audit reports missing-input-label for an empty aria-describedby', async () => {
    writeFixture('EmptyDescribedby.tsx', '<div><input type="text" aria-describedby="" /></div>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string; message: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
    // The element declares no description, so claiming it uses one is false.
    expect(result.findings.filter((f) => /uses aria-describedby/.test(f.message))).toEqual([]);
  });

  it('a whitespace-only aria-describedby references nothing either', async () => {
    writeFixture(
      'BlankDescribedby.tsx',
      '<div><input type="text" aria-describedby="   " /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
  });

  it('a duplicate aria-describedby cannot supply a description (HTML keeps the first)', async () => {
    writeFixture(
      'DuplicateDescribedby.tsx',
      '<div><input type="text" aria-describedby="" aria-describedby="hint" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
  });

  it('a REAL aria-describedby still downgrades to the warning (intended design)', async () => {
    // No-over-correction guard: the rule's deliberate purpose is that a real
    // supplementary description earns a warning rather than the error.
    writeFixture(
      'RealDescribedby.tsx',
      '<div><input type="text" aria-describedby="hint" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'low-contrast-placeholder')).toBe(true);
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(false);
  });

  // Round-43 bug-hunter regression: ATTR_VALUE used a bare `\b`, and a hyphen
  // IS a word boundary, so it also matched `data-value="…"` / `data-x-value=`.
  // For input[type=submit|button|reset] the `value` attribute IS the accessible
  // name, and a data-* attribute is invisible to assistive tech, so a bare-`\b`
  // match suppressed the error-severity `missing-button-text` finding. This is
  // the word-boundary class (r38 ATTR_ALT, r39 ATTR_TITLE), NOT the
  // existence-vs-empty-value class of r40/r41/r42.
  it('a11y_audit reports a submit control whose only value-like attribute is data-value', async () => {
    writeFixture(
      'DataValueSubmit.tsx',
      '<div><input type="submit" data-value="save" /><input type="reset" data-value="clear" /><input type="button" data-x-value="a" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-button-text');
    expect(found).toHaveLength(3);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
  });

  it('a real value= alongside a data-value still names the control', async () => {
    // No-over-correction guard: the real value= is the accessible name, so the
    // data-* sibling must not resurrect the finding.
    writeFixture(
      'DataAndRealValue.tsx',
      '<div><input type="submit" data-value="save" value="Save changes" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-button-text')).toBe(false);
  });

  // Round-46 bug-hunter regression: ATTR_PLACEHOLDER was the last constant in
  // the module still using a bare `\b`. A hyphen IS a word boundary, so it
  // also matched `data-placeholder=` / `data-x-placeholder=`, and the rule then
  // reported an input as "uses placeholder text" when it has no placeholder at
  // all — inventing a finding and stating something false. This completes the
  // word-boundary class (r38 ATTR_ALT, r39 ATTR_TITLE, r43 ATTR_VALUE).
  it('a11y_audit does not report a data-placeholder attribute as placeholder text', async () => {
    writeFixture(
      'DataPlaceholder.tsx',
      '<div><input type="text" data-placeholder="Search" /><input type="text" data-x-placeholder="y" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; message: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'low-contrast-placeholder')).toBe(false);
    expect(result.findings.filter((f) => /uses placeholder text/.test(f.message))).toEqual([]);
    // The error-severity branch is separate and must still fire for both.
    expect(result.findings.filter((f) => f.rule === 'missing-input-label')).toHaveLength(2);
  });

  it('a real placeholder alongside a data-placeholder still earns the warning', async () => {
    // No-over-correction guard: the real placeholder is the genuine
    // placeholder-as-label signal and must not be silenced.
    writeFixture(
      'DataAndRealPlaceholder.tsx',
      '<div><input type="text" data-placeholder="a" placeholder="Name" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; message: string }>;
    };
    expect(result.findings.filter((f) => f.rule === 'low-contrast-placeholder')).toHaveLength(1);
    expect(result.findings.filter((f) => /uses placeholder text/.test(f.message))).toHaveLength(1);
  });

  // Round-47 bug-hunter regression: round 43 fixed ATTR_VALUE's word boundary
  // but left it an EXISTENCE test, so `value=""` counted as a value. For
  // input[type=submit|button|reset] the value attribute IS the button's label,
  // so an empty one renders an unlabelled control — and the rule's own message
  // says the element "is missing value/aria-label/title". The finding it asks
  // for was being suppressed by the very attribute it names.
  it('a11y_audit reports a submit control whose value attribute is empty', async () => {
    writeFixture(
      'EmptyValue.tsx',
      '<div><input type="submit" value="" /><input type="reset" value="" /><input type="button" value="   " /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-button-text');
    expect(found).toHaveLength(3);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
  });

  it('a duplicate value cannot rescue an empty one (HTML keeps the first)', async () => {
    // The WHATWG tokenizer discards a repeated attribute name, so the
    // effective value is the empty first one.
    writeFixture(
      'DuplicateValue.tsx',
      '<div><input type="submit" value="" value="Save changes" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; severity: string }>;
    };
    const found = result.findings.filter((f) => f.rule === 'missing-button-text');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
  });

  // Round-48 bug-hunter regression: round 46 fixed ATTR_PLACEHOLDER's word
  // boundary, but it stayed an EXISTENCE test, so `placeholder=""` counted as
  // placeholder text. An empty placeholder displays no hint at all, so the rule
  // invented a finding and stated something false. This closes the
  // existence-vs-empty-value axis for every ATTR_ constant in the module.
  it('a11y_audit does not report an empty placeholder as placeholder text', async () => {
    writeFixture(
      'EmptyPlaceholder.tsx',
      '<div><input type="text" placeholder="" /><input type="text" placeholder="   " /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; message: string }>;
    };
    expect(result.findings.filter((f) => /uses placeholder text/.test(f.message))).toEqual([]);
    // The error-severity branch is separate and must still fire for both.
    expect(result.findings.filter((f) => f.rule === 'missing-input-label')).toHaveLength(2);
  });

  it('a duplicate placeholder cannot rescue an empty one (HTML keeps the first)', async () => {
    // The WHATWG tokenizer discards a repeated attribute name, so the
    // effective placeholder is the empty first one.
    writeFixture(
      'DuplicatePlaceholder.tsx',
      '<div><input type="text" placeholder="" placeholder="Name" /></div>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; message: string }>;
    };
    expect(result.findings.filter((f) => /uses placeholder text/.test(f.message))).toEqual([]);
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(true);
  });

  it('a11y_audit reports missing button text', async () => {
    writeFixture('EmptyButton.tsx', '<button></button>\n<input type="submit" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.findings.filter((f) => f.rule === 'missing-button-text').length).toBe(2);
  });

  it('a11y_audit reports duplicate ids', async () => {
    writeFixture('DuplicateIds.tsx', '<div id="x"></div>\n<span id="x"></span>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      findings: Array<{ rule: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.rule === 'duplicate-id')).toBe(true);
  });

  it('a11y_audit skips non-UI files', async () => {
    writeFixture('ignored.md', '<img src="/a.png" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const result = (await audit({ path: FIXTURE_DIR })) as {
      ok: boolean;
      fileCount: number;
      findings: unknown[];
    };
    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('a11y_audit rejects paths outside the project', async () => {
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    await expect(audit({ path: '../../outside' })).rejects.toThrow(/inside the project/);
  });

  it('a11y_audit throws for a missing path instead of reporting a clean audit', async () => {
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    await expect(audit({ path: 'definitely-missing-a11y-dir' })).rejects.toThrow(/path not found/);
  });

  it('a11y_status reports counters', async () => {
    writeFixture('MissingAlt2.tsx', '<img src="/b.png" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    const status = getTool(api, 'a11y_status');
    await audit({ path: FIXTURE_DIR });
    const result = (await status({})) as {
      ok: boolean;
      counters: { audits: number; findings: number };
    };
    expect(result.ok).toBe(true);
    expect(result.counters.audits).toBe(1);
    expect(result.counters.findings).toBeGreaterThan(0);
  });

  it('PostToolUse hook injects additionalContext for UI file writes', async () => {
    writeFixture('HookTarget.tsx', '<img src="/c.png" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const hook = getHook(api);
    const result = (await hook({
      toolName: 'write',
      toolInput: { path: resolve(FIXTURE_DIR, 'HookTarget.tsx') },
      toolResult: { content: '', isError: false },
    })) as HookResult;
    expect(result?.additionalContext).toContain('missing-alt');
  });

  it('PostToolUse hook skips non-UI files', async () => {
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const hook = getHook(api);
    const result = (await hook({
      toolName: 'write',
      toolInput: { path: 'README.md' },
      toolResult: { content: '', isError: false },
    })) as HookResult;
    expect(result).toBeUndefined();
  });

  it('PostToolUse hook skips errored tool results', async () => {
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const hook = getHook(api);
    const result = (await hook({
      toolName: 'write',
      toolInput: { path: 'src/App.tsx' },
      toolResult: { content: 'error', isError: true },
    })) as HookResult;
    expect(result).toBeUndefined();
  });

  it('treats aria-describedby-only inputs as supplementary, not labeled (issue #369)', async () => {
    writeFixture('Described.tsx', '<input type="text" aria-describedby="desc-id" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(false);
    expect(result.findings.some((f) => f.rule === 'low-contrast-placeholder')).toBe(true);
  });

  it('does not flag decorative img alt="" with role=presentation', async () => {
    writeFixture('Deco.tsx', '<img alt="" role="presentation" src="/dot.png" />\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-alt')).toBe(false);
  });

  it('notes the single-file limitation when a sibling label file is invisible', async () => {
    writeFixture('Input.tsx', '<input type="email" />\n');
    writeFixture('Label.tsx', '<label htmlFor="email">Email</label>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(
      api,
      'a11y_audit',
    )({
      path: resolve(FIXTURE_DIR, 'Input.tsx'),
    })) as { findings: Array<{ rule: string; note?: string }> };
    const missing = result.findings.find((f) => f.rule === 'missing-input-label');
    expect(missing?.note).toMatch(/sibling/i);
  });

  it('recognizes checkbox + fieldset/legend via aria-labelledby', async () => {
    writeFixture(
      'Group.tsx',
      '<fieldset><legend id="group-id">Opts</legend><input type="checkbox" aria-labelledby="group-id" /></fieldset>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(false);
  });

  it('flags an unlabelled input even when a sibling input is label-wrapped elsewhere (per-element label scoping)', async () => {
    writeFixture(
      'ScopedMixedLabels.tsx',
      '<input type="email" name="email" />\n<label>Name<input type="text" name="name" /></label>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; line: number }>;
    };
    const missing = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.line).toBe(1);
  });

  it('flags an unlabelled checkbox even when a fieldset/legend labels another checkbox elsewhere', async () => {
    writeFixture(
      'ScopedMixedFieldset.tsx',
      '<input type="checkbox" name="agree" />\n<fieldset><legend>Prefs</legend><input type="checkbox" name="p1" /></fieldset>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string; line: number }>;
    };
    const missing = result.findings.filter((f) => f.rule === 'missing-input-label');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.line).toBe(1);
  });

  it('accepts an input wrapped in its own implicit label (no over-flagging)', async () => {
    writeFixture('ScopedWrappedOnly.tsx', '<label>Name<input type="text" name="name" /></label>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(false);
  });

  it('accepts a checkbox inside its own fieldset/legend (no over-flagging)', async () => {
    writeFixture(
      'ScopedFieldsetOnly.tsx',
      '<fieldset><legend>Prefs</legend><input type="checkbox" name="p1" /></fieldset>\n',
    );
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-input-label')).toBe(false);
  });

  it('does not flag a button with aria-label and a single-character glyph', async () => {
    writeFixture('Close.tsx', '<button aria-label="Close">×</button>\n');
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: FIXTURE_DIR })) as {
      findings: Array<{ rule: string }>;
    };
    expect(result.findings.some((f) => f.rule === 'missing-button-text')).toBe(false);
  });

  it('emits a partial-scan warning when maxFindings stops a directory walk', async () => {
    const dir = resolve(FIXTURE_DIR, 'many');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 12; i++) {
      writeFileSync(resolve(dir, `f${i}.tsx`), `<img src="/${i}.png" />\n`, 'utf-8');
    }
    const api = makeApi({
      extensions: { 'accessibility-auditor': { enabled: true, maxFindings: 5 } },
    });
    accessibilityAuditorPlugin.setup(api as never);
    const result = (await getTool(api, 'a11y_audit')({ path: dir })) as {
      truncated: boolean;
      fileCount: number;
      scannedFiles: number;
      additionalContext?: string;
    };
    expect(result.truncated).toBe(true);
    expect(result.fileCount).toBe(12);
    expect(result.scannedFiles).toBeLessThan(12);
    expect(result.additionalContext).toMatch(/partial scan/i);
    expect(result.additionalContext).toMatch(/files not examined/i);
  });

  it('enabled:false disables tools', async () => {
    const api = makeApi({ extensions: { 'accessibility-auditor': { enabled: false } } });
    accessibilityAuditorPlugin.setup(api as never);
    const audit = getTool(api, 'a11y_audit');
    await expect(audit({ path: FIXTURE_DIR })).rejects.toThrow(/disabled/);
  });

  it('severity:block returns a block decision', async () => {
    writeFixture('BlockTarget.tsx', '<img src="/d.png" />\n');
    const api = makeApi({ extensions: { 'accessibility-auditor': { severity: 'block' } } });
    accessibilityAuditorPlugin.setup(api as never);
    const hook = getHook(api);
    const result = (await hook({
      toolName: 'edit',
      toolInput: { path: resolve(FIXTURE_DIR, 'BlockTarget.tsx') },
      toolResult: { content: '', isError: false },
    })) as HookResult;
    expect(result?.decision).toBe('block');
  });

  it('teardown zeros state and logs', async () => {
    const api = makeApi();
    accessibilityAuditorPlugin.setup(api as never);
    accessibilityAuditorPlugin.teardown!(api as never);
    const health = (await accessibilityAuditorPlugin.health!()) as {
      counters: Record<string, number>;
    };
    expect(health.counters['audits']).toBe(0);
    expect(api.log.info).toHaveBeenCalledWith(
      'accessibility-auditor: teardown complete',
      expect.any(Object),
    );
  });
});
