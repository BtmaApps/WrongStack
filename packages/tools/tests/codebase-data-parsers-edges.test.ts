import { describe, expect, it } from 'vitest';
import { parseGeneric } from '../src/codebase-index/generic-parser.js';
import { parseSymbols as parseJson } from '../src/codebase-index/json-parser.js';
import type { Symbol as IndexSymbol, SymbolLang } from '../src/codebase-index/schema.js';
import { parseSymbols as parseYaml } from '../src/codebase-index/yaml-parser.js';

const namesOf = (symbols: readonly IndexSymbol[], kind?: string) =>
  symbols.filter((s) => kind === undefined || s.kind === kind).map((s) => s.name);

describe('json parser', () => {
  it('indexes every package script, including names with colons and values with braces', () => {
    const { symbols } = parseJson({
      file: '/p/package.json',
      lang: 'json',
      content: JSON.stringify(
        {
          name: 'x',
          scripts: { 'build:prod': 'tsc && node -e "if (1) {}"', 'test:unit': 'vitest' },
          workspaces: [{ scripts: { nested: 'x' } }],
        },
        null,
        2,
      ),
    });
    expect(namesOf(symbols, 'function')).toEqual(['build:prod', 'test:unit']);
  });

  it('reads compilerOptions past nested objects without descending into them', () => {
    const { symbols } = parseJson({
      file: '/p/tsconfig.json',
      lang: 'json',
      content:
        '{\n  // comment\n  "compilerOptions": {\n    "paths": { "@/*": ["src/*"] },\n    "strict": true,\n    "plugins": [{ "name": "p" }]\n  }\n}\n',
    });
    const names = namesOf(symbols);
    expect(names).toEqual(expect.arrayContaining(['paths', 'strict', 'plugins']));
    expect(names).not.toContain('@/*');
    expect(names).not.toContain('name');
  });

  it('does not report a root array as an object', () => {
    const { symbols } = parseJson({
      file: '/p/list.json',
      lang: 'json',
      content: '[\n  {"a": 1}\n]',
    });
    expect(symbols).toEqual([]);
  });

  it('indexes schema definitions, and only in schema documents', () => {
    const schema = parseJson({
      file: '/p/api.json',
      lang: 'json',
      content: JSON.stringify({
        openapi: '3.0.0',
        components: { schemas: { User: { type: 'object' }, Order: { type: 'object' } } },
      }),
    });
    expect(namesOf(schema.symbols, 'schema')).toEqual(['User', 'Order']);

    const plain = parseJson({
      file: '/p/i18n.json',
      lang: 'json',
      content: JSON.stringify({ components: { schemas: { Button: 'Knopf' } } }),
    });
    expect(namesOf(plain.symbols)).toEqual(['i18n.json', 'components']);
  });
});

describe('yaml parser', () => {
  it('treats chomped block scalars as text, not mapping keys', () => {
    const { symbols } = parseYaml({
      file: '/p/ci.yml',
      lang: 'yaml',
      content: [
        'jobs:',
        '  build:',
        '    steps:',
        '      - run: |-',
        '          echo start',
        '          config: not-a-key',
        '          echo *not-alias',
        '      - name: done',
        '"quoted": 1',
      ].join('\n'),
    });
    const names = namesOf(symbols);
    expect(names).not.toContain('config');
    expect(names).not.toContain('not-alias');
    expect(names.filter((n) => n === 'run')).toHaveLength(1);
    expect(names).toEqual(expect.arrayContaining(['jobs', 'build', 'steps', 'name', 'quoted']));
  });
});

describe('generic regex parser', () => {
  const generic = (lang: SymbolLang, content: string) =>
    namesOf(parseGeneric({ file: `/p/f.${lang}`, lang, content }).symbols);

  it('does not index calls after return/new as declarations; keeps capitalised keyword names', () => {
    const names = generic(
      'java',
      [
        'class Module {',
        '  int run() { return helper(1); }',
        '  void make() { Foo f = new Foo(2); throw Error(3); }',
        '}',
      ].join('\n'),
    );
    expect(names).toEqual(expect.arrayContaining(['Module', 'run', 'make']));
    expect(names).not.toContain('helper');
    expect(names).not.toContain('Foo');
    expect(names).not.toContain('Error');
  });

  it('ignores headings inside fenced code blocks', () => {
    expect(generic('md', '# Title\n```bash\n# not a heading\n```\n## Real\n')).toEqual([
      'Title',
      'Real',
    ]);
  });

  it('names TOML array tables without the bracket', () => {
    expect(generic('toml', '[[bin]]\nname = "x"\n[package]\n')).toEqual(['bin', 'package']);
  });

  it('does not treat a python comparison as an assignment', () => {
    expect(generic('py', 'x == 1\ny = 2\n')).toEqual(['y']);
  });
});
