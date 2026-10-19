import { describe, expect, it } from 'vitest';
import { parseDesignMd } from '../../src/execution/design-md.js';
import { diffDesignMd, renderDesignMdDiff } from '../../src/execution/design-md-diff.js';

const doc = (front: string) => {
  const parsed = parseDesignMd(`---\nname: T\n${front}\n---\n\n## Overview\nx\n`);
  if (!parsed.doc) throw new Error(parsed.issues.map((i) => i.message).join('; '));
  return parsed.doc;
};

const BASE = `colors:
  primary: "#1d4ed8"
  on-primary: "#ffffff"
  fg: "#111111"
  bg: "#ffffff"
  dark-fg: "#eeeeee"
  dark-bg: "#111111"
typography:
  body:
    fontFamily: Inter
    fontSize: 16px
rounded:
  md: 8px
spacing:
  base: 16px
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"`;

const lines = (before: string, after: string) =>
  diffDesignMd(doc(before), doc(after)).map((c) => `${c.severity} ${c.path}`);

describe('diffDesignMd', () => {
  it('reports nothing for identical systems', () => {
    expect(diffDesignMd(doc(BASE), doc(BASE))).toEqual([]);
    expect(renderDesignMdDiff([], 'a → b')).toBe('a → b: no token changes.');
  });

  it('fails a color change that takes a text pair below AA, in either theme', () => {
    const lighter = BASE.replace('primary: "#1d4ed8"', 'primary: "#93c5fd"');
    const out = lines(BASE, lighter);
    expect(out).toContain('FAIL colors.on-primary on primary');
    expect(out).toContain('FAIL components.button');
    expect(out).toContain('INFO colors.primary');

    const darkMuddy = BASE.replace('dark-fg: "#eeeeee"', 'dark-fg: "#333333"');
    expect(lines(BASE, darkMuddy)).toContain('FAIL colors.dark-fg on bg');
    // A pair that never met AA is not a regression.
    expect(lines(lighter, lighter.replace('#93c5fd', '#a5b4fc'))).not.toContain(
      'FAIL colors.on-primary on primary',
    );
  });

  it('marks an imperceptible nudge as such', () => {
    const changes = diffDesignMd(doc(BASE), doc(BASE.replace('#1d4ed8', '#1d4ed9')));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.message).toContain('imperceptible');
  });

  it('fails a removal that breaks a component reference and warns on plain removals', () => {
    const noRadius = BASE.replace('rounded:\n  md: 8px\n', 'rounded:\n  lg: 12px\n');
    const out = lines(BASE, noRadius);
    expect(out).toContain('FAIL components.button.rounded');
    expect(out).not.toContain('WARN rounded.md');
    expect(lines(BASE, BASE.replace('spacing:\n  base: 16px\n', ''))).toContain(
      'WARN spacing.base',
    );
  });

  it('warns on a font family change and orders FAIL before WARN before INFO', () => {
    const changed = BASE.replace('fontFamily: Inter', 'fontFamily: Fraunces').replace(
      'primary: "#1d4ed8"',
      'primary: "#bfdbfe"',
    );
    const out = diffDesignMd(doc(BASE), doc(changed));
    expect(out.map((c) => `${c.severity} ${c.path}`)).toContain('WARN typography.body.fontFamily');
    const order = out.map((c) => c.severity);
    expect(order).toEqual(
      [...order].sort(
        (a, b) => ['FAIL', 'WARN', 'INFO'].indexOf(a) - ['FAIL', 'WARN', 'INFO'].indexOf(b),
      ),
    );
    expect(renderDesignMdDiff(out, 'x')).toMatch(/^x: \d+ FAIL · 1 WARN · \d+ INFO/);
  });
});
