import { describe, expect, it } from 'vitest';
import {
  groupCatalog,
  matchesQuery,
  SETTINGS_CATALOG,
  SETTINGS_GROUPS,
  type SettingsEntry,
} from '../src/lib/settings-catalog.js';

describe('settings-catalog', () => {
  it('covers every SettingsGroup declared', () => {
    const declaredGroupIds = new Set(SETTINGS_GROUPS.map((g) => g.id));
    const catalogGroupIds = new Set(SETTINGS_CATALOG.map((e) => e.group));
    for (const id of declaredGroupIds) {
      expect(catalogGroupIds.has(id)).toBe(true);
    }
  });

  it('uses unique, non-empty ids', () => {
    const ids = SETTINGS_CATALOG.map((e) => e.id);
    const seen = new Set<string>();
    for (const id of ids) {
      expect(id.length).toBeGreaterThan(0);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('has at least one keyword per entry', () => {
    for (const entry of SETTINGS_CATALOG) {
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty label and hint', () => {
    for (const entry of SETTINGS_CATALOG) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it('groupCatalog() preserves the declared display order', () => {
    const grouped = groupCatalog();
    expect(grouped.map((g) => g.group.id)).toEqual([...SETTINGS_GROUPS].map((g) => g.id));
  });

  it('exposes the v16 Refine and Session additions with the right shapes', () => {
    const byId = new Map(SETTINGS_CATALOG.map((e) => [e.id, e]));
    expect(byId.get('refine.preRefineSeconds')).toMatchObject({ group: 'refine', kind: 'select' });
    expect(byId.get('refine.refinerModel')).toMatchObject({ group: 'refine', kind: 'select' });
    expect(byId.get('session.showTabTitle')).toMatchObject({ group: 'session', kind: 'toggle' });
  });

  it('finds the new entries through the search predicate', () => {
    const countdown = SETTINGS_CATALOG.find((e) => e.id === 'refine.preRefineSeconds')!;
    expect(matchesQuery(countdown, 'Refine', 'countdown')).toBe(true);
    const refiner = SETTINGS_CATALOG.find((e) => e.id === 'refine.refinerModel')!;
    expect(matchesQuery(refiner, 'Refine', 'refiner')).toBe(true);
    const tabTitle = SETTINGS_CATALOG.find((e) => e.id === 'session.showTabTitle')!;
    expect(matchesQuery(tabTitle, 'Session', 'tab')).toBe(true);
  });
});

describe('matchesQuery', () => {
  const entry: SettingsEntry = SETTINGS_CATALOG.find((e) => e.id === 'autonomy.yolo')!;
  const groupTitle = 'Autonomy';

  it('empty/whitespace query matches everything', () => {
    expect(matchesQuery(entry, groupTitle, '')).toBe(true);
    expect(matchesQuery(entry, groupTitle, '   ')).toBe(true);
  });

  it('matches by label substring', () => {
    expect(matchesQuery(entry, groupTitle, 'yolo')).toBe(true);
    expect(matchesQuery(entry, groupTitle, 'YOLO')).toBe(true);
  });

  it('matches by hint substring', () => {
    expect(matchesQuery(entry, groupTitle, 'auto-approve')).toBe(true);
  });

  it('matches by keyword substring', () => {
    expect(matchesQuery(entry, groupTitle, 'permission')).toBe(true);
  });

  it('matches by group title substring', () => {
    expect(matchesQuery(entry, 'Autonomy', 'auto')).toBe(true);
  });

  it('does not match when nothing contains the query', () => {
    expect(matchesQuery(entry, groupTitle, 'unrelated-xyz')).toBe(false);
  });
});
