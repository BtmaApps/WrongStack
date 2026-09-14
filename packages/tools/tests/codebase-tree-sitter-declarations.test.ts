import { describe, expect, it } from 'vitest';
import type { SymbolLang } from '../src/codebase-index/schema.js';
import { parseSymbols } from '../src/codebase-index/tree-sitter-parser.js';

const symbolsOf = async (lang: SymbolLang, lines: string[]) =>
  (await parseSymbols({ file: `/p/sample.${lang}`, content: lines.join('\n'), lang })).symbols;
const view = async (lang: SymbolLang, lines: string[]) =>
  (await symbolsOf(lang, lines)).map((s) => `${s.kind}:${s.name}`);

describe('tree-sitter declarations', () => {
  it('reports 0-based columns', async () => {
    const syms = await symbolsOf('java', ['public class Repo {', '  void run() {}', '}']);
    expect(syms.map((s) => [s.name, s.line, s.col])).toEqual([
      ['Repo', 1, 0],
      ['run', 2, 2],
    ]);
  });

  it('java: names fields by their declarators, one symbol each', async () => {
    const out = await view('java', [
      'class Repo {',
      '  private String name;',
      '  int count, total;',
      '}',
      'interface Limits { int MAX = 3; }',
    ]);
    expect(out).toEqual(
      expect.arrayContaining(['property:name', 'property:count', 'property:total', 'const:MAX']),
    );
    expect(out).not.toContain('property:String');
  });

  it('csharp: names members, not their types', async () => {
    const out = await view('csharp', [
      'namespace App.Data {',
      '  public interface IRepo {',
      '    System.Threading.Tasks.Task RunAsync();',
      '    Models.User Current { get; }',
      '  }',
      '  public class Repo { private int _count; }',
      '}',
    ]);
    expect(out).toEqual([
      'namespace:App.Data',
      'interface:IRepo',
      'method:RunAsync',
      'property:Current',
      'class:Repo',
      'property:_count',
    ]);
  });

  it('c: distinguishes prototypes, globals and locals; follows pointer declarators', async () => {
    const out = await view('c', [
      'static int counter = 0, limit;',
      'char *dup_name(const char *s) { int local = 1; struct node *n = 0; return 0; }',
      'typedef struct node *NodePtr;',
      'struct node { int v; };',
    ]);
    expect(out).toEqual([
      'var:counter',
      'var:limit',
      'function:dup_name',
      'type:NodePtr',
      'struct:node',
    ]);
  });

  it('cpp: indexes namespaces and out-of-class method definitions', async () => {
    const syms = await symbolsOf('cpp', [
      'namespace geo {',
      'class Shape { public: double area() const; };',
      'double Shape::area() const { return 0; }',
      'class Forward;',
      '}',
    ]);
    expect(syms.map((s) => `${s.kind}:${s.name}:${s.scope}`)).toEqual([
      'namespace:geo:',
      'class:Shape:geo',
      'function:area:geo',
    ]);
  });

  it('ruby: constants only where assigned; methods inside classes are methods', async () => {
    const out = await view('ruby', [
      'module Billing',
      '  VERSION = "1.0"',
      '  class Invoice < Base',
      '    def total',
      '      raise ArgumentError unless Money::Currency.valid?',
      '    end',
      '  end',
      'end',
      'def helper; end',
    ]);
    expect(out).toEqual([
      'namespace:Billing',
      'const:VERSION',
      'class:Invoice',
      'method:total',
      'function:helper',
    ]);
  });

  it('kotlin: indexes properties', async () => {
    expect(await view('kotlin', ['class Repo {', '  val name: String = ""', '}'])).toEqual([
      'class:Repo',
      'property:name',
    ]);
  });

  it('php: keeps the qualified namespace name', async () => {
    expect(await view('php', ['<?php', 'namespace App\\Models;', 'class User {}'])).toEqual([
      'namespace:App\\Models',
      'class:User',
    ]);
  });

  it('elixir: indexes modules and definitions, never ordinary calls', async () => {
    const syms = await symbolsOf('elixir', [
      'defmodule Billing.Invoice do',
      '  def total(items), do: Enum.sum(items)',
      '  defp tax(x) when x > 0, do: round(x)',
      '  def ready?, do: helper()',
      'end',
    ]);
    expect(syms.map((s) => `${s.kind}:${s.name}:${s.scope}`)).toEqual([
      'namespace:Billing.Invoice:',
      'function:total:Billing.Invoice',
      'function:tax:Billing.Invoice',
      'function:ready?:Billing.Invoice',
    ]);
  });
});
