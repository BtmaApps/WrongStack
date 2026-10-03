import * as path from 'node:path';
import { stripAnsi } from '@wrongstack/core/utils';
import type {
  LanguageDiagnostic,
  LanguagePackageMutation,
  LanguagePackageVulnerability,
  LanguageProfileId,
  LanguageRunSummary,
} from './types.js';

const MAX_DIAGNOSTICS = 200;

interface ParsedDiagnostics {
  diagnostics: readonly LanguageDiagnostic[];
  omitted: number;
  summary: LanguageRunSummary;
}

export function parseLanguageDiagnostics(
  parser: string,
  stdout: string,
  stderr: string,
  workspaceRoot: string,
): ParsedDiagnostics {
  const text = `${stdout}${stdout && stderr ? '\n' : ''}${stderr}`;
  let diagnostics: LanguageDiagnostic[];
  switch (parser) {
    case 'typescript':
      diagnostics = parseTypeScript(text, workspaceRoot);
      break;
    case 'cargo-json':
      diagnostics = parseCargoJson(text, workspaceRoot);
      break;
    case 'php-lint':
      diagnostics = parsePhpLint(text, workspaceRoot);
      break;
    case 'dotnet-build':
    case 'dotnet-format':
      diagnostics = parseDotnet(text, workspaceRoot);
      break;
    case 'dotnet-test':
      // A test run can fail to COMPILE (compiler shape) or fail its tests.
      diagnostics = [
        ...parseDotnet(text, workspaceRoot),
        ...parseDotnetTestFailures(text, workspaceRoot),
      ];
      break;
    case 'go-test':
    case 'go-compiler':
    case 'gofmt':
      diagnostics = parseGo(text, workspaceRoot);
      break;
    case 'biome':
      diagnostics = parseBiome(text, workspaceRoot);
      break;
    case 'shellcheck':
      diagnostics = parseShellcheckJson(stdout, workspaceRoot);
      break;
    case 'cargo-test':
      diagnostics = parseCargoTest(text, workspaceRoot);
      break;
    case 'pytest':
      diagnostics = parsePytest(text, workspaceRoot);
      break;
    case 'python':
      diagnostics = parsePythonCompile(text, workspaceRoot);
      break;
    case 'deno-test':
      diagnostics = parseDenoTest(stripAnsi(text), workspaceRoot);
      break;
    case 'phpunit':
      diagnostics = parsePhpUnit(text, workspaceRoot);
      break;
    case 'maven':
    case 'gradle':
      diagnostics = parseJvmCompiler(text, workspaceRoot);
      break;
    default:
      diagnostics = parseGeneric(text, parser, workspaceRoot);
      break;
  }
  const sorted = dedupeDiagnostics(diagnostics).sort(compareDiagnostics);
  const omitted = Math.max(0, sorted.length - MAX_DIAGNOSTICS);
  const kept = Object.freeze(sorted.slice(0, MAX_DIAGNOSTICS).map((item) => Object.freeze(item)));
  return {
    diagnostics: kept,
    omitted,
    summary: summarize(kept),
  };
}

export function diagnosticsForInternalSyntax(
  language: LanguageProfileId,
  target: string,
  sourceText: string,
): Promise<ParsedDiagnostics> {
  if (language !== 'typescript' && language !== 'javascript') {
    return Promise.resolve({ diagnostics: [], omitted: 0, summary: emptySummary() });
  }
  return import('@typescript/typescript6').then((tsModule) => {
    const ts = ((tsModule as unknown as { default?: typeof tsModule }).default ??
      tsModule) as typeof tsModule;
    const extension = path.extname(target).toLowerCase();
    const scriptKind =
      extension === '.tsx'
        ? ts.ScriptKind.TSX
        : extension === '.ts' || extension === '.mts' || extension === '.cts'
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JSX;
    const sourceFile = ts.createSourceFile(
      path.basename(target),
      sourceText,
      ts.ScriptTarget.Latest,
      false,
      scriptKind,
    );
    const native =
      (
        sourceFile as unknown as {
          parseDiagnostics?: import('@typescript/typescript6').Diagnostic[];
        }
      ).parseDiagnostics ?? [];
    const diagnostics = native.map<LanguageDiagnostic>((diagnostic) => {
      const start = diagnostic.start ?? 0;
      const location = sourceFile.getLineAndCharacterOfPosition(start);
      return {
        severity: diagnostic.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
        ...(diagnostic.code ? { code: `TS${diagnostic.code}` } : {}),
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        file: target,
        range: { start: { line: location.line + 1, column: location.character + 1 } },
        source: 'typescript-parser',
      };
    });
    const sorted = dedupeDiagnostics(diagnostics).sort(compareDiagnostics);
    const omitted = Math.max(0, sorted.length - MAX_DIAGNOSTICS);
    const kept = Object.freeze(sorted.slice(0, MAX_DIAGNOSTICS).map((item) => Object.freeze(item)));
    return { diagnostics: kept, omitted, summary: summarize(kept) };
  });
}

function parseTypeScript(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const regex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)$/gm;
  for (const match of text.matchAll(regex)) {
    diagnostics.push({
      severity: match[4] === 'warning' ? 'warning' : 'error',
      code: match[5],
      message: match[6]!.trim(),
      file: normalizeDiagnosticPath(match[1]!, root),
      range: { start: { line: toPositiveInt(match[2]), column: toPositiveInt(match[3]) } },
      source: 'typescript',
    });
  }
  return diagnostics;
}

function parseCargoJson(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const value = JSON.parse(line) as {
        reason?: string;
        message?: {
          level?: string;
          code?: { code?: string };
          message?: string;
          spans?: Array<{
            file_name?: string;
            line_start?: number;
            column_start?: number;
            is_primary?: boolean;
          }>;
        };
      };
      if (value.reason !== 'compiler-message' || !value.message?.message) continue;
      const primary =
        value.message.spans?.find((span) => span.is_primary) ?? value.message.spans?.[0];
      diagnostics.push({
        severity: normalizeSeverity(value.message.level),
        ...(value.message.code?.code ? { code: value.message.code.code } : {}),
        message: value.message.message,
        ...(primary?.file_name ? { file: normalizeDiagnosticPath(primary.file_name, root) } : {}),
        ...(primary?.line_start
          ? { range: { start: { line: primary.line_start, column: primary.column_start ?? 1 } } }
          : {}),
        source: 'rustc',
      });
    } catch {
      // Non-JSON build output is retained as raw output, not fabricated into diagnostics.
    }
  }
  return diagnostics;
}

function parseGo(text: string, root: string): LanguageDiagnostic[] {
  return parseLinePattern(
    text,
    // `go test` reports a failing assertion as `    a_test.go:7: got 2 want 3`
    // — indented, and without a column (the compiler and vet do give one).
    // A package that does not type-check makes vet prefix its own name
    // (`vet.exe: .\b.go:3:23: …`, `vet: ` on unix) — not part of the path.
    /^\s*(?:vet(?:\.exe)?:\s+)?(.*?\.go):(\d+)(?::(\d+))?:\s*(.+)$/gm,
    root,
    'go',
    (_match, message) => ({ message, severity: /warning/i.test(message) ? 'warning' : 'error' }),
  );
}

function parsePhpLint(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const regex = /(?:PHP\s+)?(?:Parse|Fatal) error:\s*(.+?)\s+in\s+(.+?)\s+on line\s+(\d+)/gi;
  for (const match of text.matchAll(regex)) {
    diagnostics.push({
      severity: 'error',
      message: match[1]!.trim(),
      file: normalizeDiagnosticPath(match[2]!, root),
      range: { start: { line: toPositiveInt(match[3]), column: 1 } },
      source: 'php',
    });
  }
  return diagnostics;
}

function parseDotnet(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  // Codes are compiler/analyzer ids (CS1002, IDE0055) — or, from `dotnet
  // format --verify-no-changes`, digit-less WHITESPACE / FINALNEWLINE / CHARSET.
  const regex = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Z]+\d*):\s*(.+?)(?:\s+\[.+\])?$/gm;
  for (const match of text.matchAll(regex)) {
    diagnostics.push({
      severity: match[4] === 'warning' ? 'warning' : 'error',
      code: match[5],
      message: match[6]!.trim(),
      file: normalizeDiagnosticPath(match[1]!, root),
      range: { start: { line: toPositiveInt(match[2]), column: toPositiveInt(match[3]) } },
      source: 'dotnet',
    });
  }
  return diagnostics;
}

/**
 * Failed tests in `dotnet test` console output (VSTest logger):
 *   Failed dntest.UnitTest1.Test1 [75 ms]
 *   Error Message:
 *    Assert.Equal() Failure: Values differ
 *   Stack Trace:
 *      at dntest.UnitTest1.Test1() in D:\…\UnitTest1.cs:line 7
 * The first stack frame with a source location is where the test failed.
 */
function parseDotnetTestFailures(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const failed = /^\s*Failed (\S+) \[[^\]]*\]$/.exec(lines[i]!);
    if (!failed) continue;
    let message = '';
    let location: RegExpExecArray | null = null;
    for (let j = i + 1; j < lines.length && j <= i + 40; j++) {
      const line = lines[j]!;
      if (/^\s*Failed \S+ \[/.test(line)) break;
      if (!message && /^\s*Error Message:\s*$/.test(line)) {
        message = lines[j + 1]?.trim() ?? '';
        continue;
      }
      location = / in (.+):line (\d+)\s*$/.exec(line);
      if (location) break;
    }
    diagnostics.push({
      severity: 'error',
      code: failed[1]!,
      message: message || 'Test failed',
      ...(location
        ? {
            file: normalizeDiagnosticPath(location[1]!, root),
            range: { start: { line: toPositiveInt(location[2]), column: 1 } },
          }
        : {}),
      source: 'dotnet-test',
    });
  }
  return diagnostics;
}

function parseBiome(text: string, root: string): LanguageDiagnostic[] {
  // `--reporter=github`: one `::<level> title=<rule>,file=…,line=…,col=…::<msg>`
  // per finding — the real message and severity. Biome's default reporter puts
  // both on later lines (`  × Using == may be unsafe…`) under a header that
  // reads `a.js:2:30 lint/… FIXABLE ━━━…`, so the line regex below took the
  // decoration as the message and called every finding a warning.
  const github: LanguageDiagnostic[] = [];
  const githubRegex =
    /^::(error|warning|notice) title=([^,]*),file=(.+?),line=(\d+),endLine=\d+,col=(\d+),endColumn=\d+::(.*)$/gm;
  for (const match of text.matchAll(githubRegex)) {
    github.push({
      severity: match[1] === 'notice' ? 'info' : normalizeSeverity(match[1]),
      ...(match[2] ? { code: match[2] } : {}),
      message: match[6]!.trim(),
      file: normalizeDiagnosticPath(match[3]!, root),
      range: { start: { line: toPositiveInt(match[4]), column: toPositiveInt(match[5]) } },
      source: 'biome',
    });
  }
  if (github.length > 0) return github;
  const diagnostics: LanguageDiagnostic[] = [];
  const regex = /^(.+?):(\d+):(\d+)\s+(lint\/[^\s]+|format)\s+(.+)$/gm;
  for (const match of text.matchAll(regex)) {
    diagnostics.push({
      severity: 'warning',
      code: match[4],
      message: match[5]!.trim(),
      file: normalizeDiagnosticPath(match[1]!, root),
      range: { start: { line: toPositiveInt(match[2]), column: toPositiveInt(match[3]) } },
      source: 'biome',
    });
  }
  return diagnostics;
}

/**
 * `shellcheck --format=json`: ONE JSON array of
 * `{file, line, column, level, code, message}` — the generic line regex never
 * matched it, so every shellcheck finding was dropped. `style` is ShellCheck's
 * lowest level (below `info`).
 */
function parseShellcheckJson(stdout: string, root: string): LanguageDiagnostic[] {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end < start) return [];
  let items: unknown;
  try {
    items = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const diagnostics: LanguageDiagnostic[] = [];
  for (const item of items as Array<Record<string, unknown>>) {
    if (typeof item?.['message'] !== 'string') continue;
    const level = typeof item['level'] === 'string' ? item['level'] : undefined;
    diagnostics.push({
      severity: level === 'style' ? 'hint' : normalizeSeverity(level),
      ...(typeof item['code'] === 'number' ? { code: `SC${item['code']}` } : {}),
      message: item['message'],
      ...(typeof item['file'] === 'string'
        ? { file: normalizeDiagnosticPath(item['file'], root) }
        : {}),
      ...(typeof item['line'] === 'number'
        ? {
            range: {
              start: {
                line: toPositiveInt(String(item['line'])),
                column: toPositiveInt(String(item['column'] ?? 1)),
              },
            },
          }
        : {}),
      source: 'shellcheck',
    });
  }
  return diagnostics;
}

/**
 * Human `cargo test` output (it has no JSON mode on stable). Two shapes:
 * - a failing test: `thread 'tests::boom' (97428) panicked at src\lib.rs:9:17:`
 *   with the message on the next line (Rust 1.73+), or the older
 *   `thread 'x' panicked at 'msg', src/lib.rs:9:17`;
 * - a compile error: `error[E0308]: mismatched types` then ` --> src\lib.rs:1:34`.
 * The generic `file:line:col:` regex kept the whole "thread '…' panicked at "
 * prefix inside the file path and never matched the ` --> ` form at all.
 */
function parseCargoTest(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const modern = /^thread '([^']*)'(?: \(\d+\))? panicked at (.+?):(\d+):(\d+):$/.exec(line);
    const legacy = modern
      ? null
      : /^thread '([^']*)'(?: \(\d+\))? panicked at '(.*)', (.+?):(\d+):(\d+)$/.exec(line);
    if (modern || legacy) {
      const test = (modern ?? legacy)![1]!;
      const message = modern ? (lines[i + 1]?.trim() ?? '') : legacy![2]!;
      const [file, ln, col] = modern
        ? [modern[2]!, modern[3], modern[4]]
        : [legacy![3]!, legacy![4], legacy![5]];
      diagnostics.push({
        severity: 'error',
        code: test,
        message: message || 'test panicked',
        file: normalizeDiagnosticPath(file, root),
        range: { start: { line: toPositiveInt(ln), column: toPositiveInt(col) } },
        source: 'cargo-test',
      });
      continue;
    }
    const header = /^(error|warning)(?:\[(E\d+)\])?: (.+)$/.exec(line);
    const location = header ? /^\s*--> (.+?):(\d+):(\d+)$/.exec(lines[i + 1] ?? '') : null;
    if (header && location) {
      diagnostics.push({
        severity: normalizeSeverity(header[1]),
        ...(header[2] ? { code: header[2] } : {}),
        message: header[3]!.trim(),
        file: normalizeDiagnosticPath(location[1]!, root),
        range: {
          start: { line: toPositiveInt(location[2]), column: toPositiveInt(location[3]) },
        },
        source: 'rustc',
      });
    }
  }
  return diagnostics;
}

/**
 * pytest's traceback ends each failure with its location — `test_a.py:6:
 * AssertionError` (file:line, NO column) — after the `E   …` lines that say
 * what failed. The generic `file:line:col:` regex matched neither, so a failing
 * run produced zero diagnostics.
 */
function parsePytest(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const location = /^(\S.*?\.py):(\d+): (\w+)$/.exec(lines[i]!);
    if (!location) continue;
    // The `E   ` block above the location (past one blank line) carries the
    // failure text.
    const explanation: string[] = [];
    let j = i - 1;
    while (j >= 0 && lines[j]!.trim() === '') j--;
    for (; j >= 0 && /^E\s/.test(lines[j]!); j--) {
      explanation.unshift(lines[j]!.replace(/^E\s+/, ''));
    }
    diagnostics.push({
      severity: 'error',
      code: location[3]!,
      message: explanation[0] ?? location[3]!,
      file: normalizeDiagnosticPath(location[1]!, root),
      range: { start: { line: toPositiveInt(location[2]), column: 1 } },
      source: 'pytest',
    });
  }
  return diagnostics;
}

/**
 * `python -m py_compile` errors. A traceback-style one:
 *   File "broken.py", line 1  …  SyntaxError: invalid syntax
 * and the one-line form CPython uses for indentation errors:
 *   Sorry: IndentationError: unexpected indent (indent.py, line 2)
 * Neither has the `file:line:col:` shape the generic parser needs.
 */
function parsePythonCompile(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const sorry = /^Sorry: (\w+): (.+) \((.+), line (\d+)\)$/.exec(lines[i]!);
    if (sorry) {
      diagnostics.push({
        severity: 'error',
        code: sorry[1]!,
        message: sorry[2]!,
        file: normalizeDiagnosticPath(sorry[3]!, root),
        range: { start: { line: toPositiveInt(sorry[4]), column: 1 } },
        source: 'python',
      });
      continue;
    }
    const frame = /^\s*File "(.+)", line (\d+)/.exec(lines[i]!);
    if (!frame) continue;
    // The error line follows the source excerpt and caret lines.
    for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
      const error = /^(\w+(?:Error|Exception|Warning)): (.*)$/.exec(lines[j]!);
      if (!error) continue;
      diagnostics.push({
        severity: 'error',
        code: error[1]!,
        message: error[2]!,
        file: normalizeDiagnosticPath(frame[1]!, root),
        range: { start: { line: toPositiveInt(frame[2]), column: 1 } },
        source: 'python',
      });
      break;
    }
  }
  return diagnostics;
}

/**
 * `deno test` (colour codes already stripped). A failing test is reported as
 * `bad => ./a_test.ts:2:6` followed by `error: Error: expected 3`; a type error
 * from the pre-run check as `TS2322 [ERROR]: <message>` with its location on a
 * later `    at file:///D:/…/b_test.ts:1:7` line. The FAILURES recap repeats
 * the `name => location` header without an `error:` line and is skipped.
 */
function parseDenoTest(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const failure = /^(.+?) => (.+?):(\d+):(\d+)$/.exec(lines[i]!);
    const error = failure ? /^error: (.+)$/.exec(lines[i + 1] ?? '') : null;
    if (failure && error) {
      diagnostics.push({
        severity: 'error',
        code: failure[1]!,
        message: error[1]!,
        file: normalizeDiagnosticPath(failure[2]!, root),
        range: { start: { line: toPositiveInt(failure[3]), column: toPositiveInt(failure[4]) } },
        source: 'deno-test',
      });
      continue;
    }
    const typeError = /^(TS\d+) \[(ERROR|WARNING)\]: (.+)$/.exec(lines[i]!);
    if (!typeError) continue;
    for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
      const at = /^\s+at (file:\/\/\/.+?):(\d+):(\d+)$/.exec(lines[j]!);
      if (!at) continue;
      let file = decodeURIComponent(at[1]!.replace(/^file:\/\/\//, ''));
      if (!/^[A-Za-z]:/.test(file)) file = `/${file}`;
      diagnostics.push({
        severity: typeError[2] === 'WARNING' ? 'warning' : 'error',
        code: typeError[1]!,
        message: typeError[3]!,
        file: normalizeDiagnosticPath(file, root),
        range: { start: { line: toPositiveInt(at[2]), column: toPositiveInt(at[3]) } },
        source: 'deno',
      });
      break;
    }
  }
  return diagnostics;
}

/**
 * PHPUnit's failure/error list:
 *   1) FooTest::testA
 *   Failed asserting that 3 is identical to 2.
 *
 *   D:\…\tests\FooTest.php:4
 * The first `<file>.php:<line>` line after the numbered header is the test's
 * own frame (the location has no column, so the generic parser missed it).
 */
function parsePhpUnit(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = /^\d+\) (.+)$/.exec(lines[i]!);
    if (!header) continue;
    let message = '';
    for (let j = i + 1; j < lines.length && j <= i + 60; j++) {
      const line = lines[j]!;
      if (/^\d+\) /.test(line)) break;
      const location = /^(.+\.php):(\d+)$/.exec(line.trim());
      if (location) {
        diagnostics.push({
          severity: 'error',
          code: header[1]!.trim(),
          message: message || 'Test failed',
          file: normalizeDiagnosticPath(location[1]!, root),
          range: { start: { line: toPositiveInt(location[2]), column: 1 } },
          source: 'phpunit',
        });
        break;
      }
      if (!message && line.trim()) message = line.trim();
    }
  }
  return diagnostics;
}

/**
 * JVM compiler output through Maven or Gradle — none of it has the generic
 * `file:line:col:` shape:
 *   Maven:  [ERROR] /D:/…/App.java:[4,13] incompatible types: …
 *   javac:  D:\…\App.java:4: error: incompatible types: …   (caret line = column)
 */
function parseJvmCompiler(text: string, root: string): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  const filePath = (raw: string) => {
    const decoded = raw.startsWith('file://') ? decodeURIComponent(raw.slice(7)) : raw;
    // Maven and file URLs write a Windows path as `/D:/…`.
    return normalizeDiagnosticPath(decoded.replace(/^\/([A-Za-z]:[\\/])/, '$1'), root);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const maven = /^\[(ERROR|WARNING)\] (.+?\.(?:java|kt|scala|groovy)):\[(\d+),(\d+)\] (.+)$/.exec(
      line,
    );
    if (maven) {
      diagnostics.push({
        severity: maven[1] === 'WARNING' ? 'warning' : 'error',
        message: maven[5]!.trim(),
        file: filePath(maven[2]!),
        range: { start: { line: toPositiveInt(maven[3]), column: toPositiveInt(maven[4]) } },
        source: 'javac',
      });
      continue;
    }
    const javac = /^(.+?\.java):(\d+): (error|warning): (.+)$/.exec(line);
    if (javac) {
      // javac echoes the source line, then a caret under the offending column.
      const caret = lines[i + 2]?.indexOf('^') ?? -1;
      diagnostics.push({
        severity: javac[3] === 'warning' ? 'warning' : 'error',
        message: javac[4]!.trim(),
        file: filePath(javac[1]!),
        range: {
          start: { line: toPositiveInt(javac[2]), column: caret >= 0 ? caret + 1 : 1 },
        },
        source: 'javac',
      });
      continue;
    }
  }
  return diagnostics;
}

function parseGeneric(text: string, source: string, root: string): LanguageDiagnostic[] {
  return parseLinePattern(
    text,
    // gcc/clang attach `note:` lines to an error and say `fatal error:` for a
    // missing header; outside the alternation, a note became a second ERROR
    // whose message read "note: …".
    /^(.+?):(\d+):(\d+):\s*(?:(fatal error|error|warning|info|note):\s*)?(.+)$/gm,
    root,
    source,
    (match, fallback) => ({
      severity: normalizeSeverity(match[4] === 'fatal error' ? 'error' : match[4]),
      message: match[5]?.trim() || fallback,
    }),
  );
}

export interface ParsedPackageReports {
  diagnostics: readonly LanguageDiagnostic[];
  vulnerabilities: readonly LanguagePackageVulnerability[];
  outdated: readonly LanguagePackageMutation[];
}

export function parsePackageReports(
  parser: string,
  stdout: string,
  stderr: string,
): ParsedPackageReports {
  const text = `${stdout}${stdout && stderr ? '\n' : ''}${stderr}`;
  // The JSON reports are on stdout. Appending stderr broke every one of them
  // the moment the tool warned there (`npm warn Unknown project config …`,
  // composer's TLS notice): the whole-text parse failed and read as "no
  // vulnerabilities".
  const json = stdout.trim() ? stdout : text;
  switch (parser) {
    case 'npm-audit':
      return parseNpmAudit(json);
    case 'npm-outdated':
      return parseNpmOutdated(json);
    case 'cargo-audit':
      return parseCargoAudit(json);
    case 'pip-audit':
      return parsePipAudit(json);
    case 'composer-audit':
      return parseComposerAudit(json);
    case 'composer-outdated':
      return parseComposerOutdated(json);
    case 'dotnet-package':
      return parseDotnetPackage(json);
    default:
      return { diagnostics: [], vulnerabilities: [], outdated: [] };
  }
}

function parseNpmAudit(text: string): ParsedPackageReports {
  const advisories: LanguagePackageVulnerability[] = [];
  const diagnostics: LanguageDiagnostic[] = [];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    root = undefined;
  }
  // Yarn 1 `audit --json` is NDJSON: one `{"type":"auditAdvisory","data":
  // {"advisory":{…}}}` per finding PATH (same advisory repeated), between
  // warning lines. Yarn 2+ `npm audit --json` is NDJSON too, one
  // `{"value":pkg,"children":{"ID","Issue","URL","Severity",…}}` per advisory —
  // and with ONE advisory that is a valid single JSON document. Collect either
  // into an npm v6-style `advisories` map.
  const berryDocument =
    typeof root === 'object' && root !== null && 'value' in root && 'children' in root;
  if (root === undefined || berryDocument) {
    const fromLines: Record<string, unknown> = {};
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes('"auditAdvisory"') && !line.includes('"children"')) continue;
      try {
        const event = JSON.parse(line) as {
          type?: string;
          data?: { advisory?: { id?: unknown } };
          value?: unknown;
          children?: { ID?: unknown; Issue?: unknown; URL?: unknown; Severity?: unknown };
        };
        const advisory = event.data?.advisory;
        if (event.type === 'auditAdvisory' && advisory) {
          fromLines[String(advisory.id ?? Object.keys(fromLines).length)] = advisory;
        } else if (typeof event.value === 'string' && event.children) {
          const child = event.children;
          fromLines[String(child.ID ?? `${event.value}-${Object.keys(fromLines).length}`)] = {
            name: event.value,
            title: child.Issue,
            severity: typeof child.Severity === 'string' ? child.Severity.toLowerCase() : undefined,
            url: child.URL,
          };
        }
      } catch {
        // not a JSON line
      }
    }
    if (Object.keys(fromLines).length === 0) {
      return { diagnostics, vulnerabilities: advisories, outdated: [] };
    }
    root = { advisories: fromLines };
  }
  const vulnerabilities =
    (root as { vulnerabilities?: Record<string, unknown> })?.vulnerabilities ?? {};
  let advisoriesRecord: Record<string, unknown> =
    (root as { advisories?: Record<string, unknown> })?.advisories ?? vulnerabilities;
  // `bun audit --json` has neither key: it maps each package name to an ARRAY
  // of advisories (`{"lodash":[{id,url,title,severity,…}]}`).
  if (
    root &&
    typeof root === 'object' &&
    !('vulnerabilities' in root) &&
    !('advisories' in root) &&
    Object.values(root).every(Array.isArray)
  ) {
    advisoriesRecord = {};
    for (const [name, list] of Object.entries(root as Record<string, unknown[]>)) {
      for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const id = String((entry as { id?: unknown }).id ?? `${name}-${list.indexOf(entry)}`);
        advisoriesRecord[id] = { ...(entry as object), name };
      }
    }
  }
  for (const [id, value] of Object.entries(advisoriesRecord)) {
    const advisory = value as {
      module_name?: string;
      package_name?: string;
      name?: string;
      title?: string;
      severity?: string;
      url?: string;
      range?: string;
      patched_versions?: string;
    };
    const name = advisory.module_name ?? advisory.package_name ?? advisory.name ?? id;
    advisories.push({
      package: name,
      ...(advisory.title ? { advisory: advisory.title } : { advisory: id }),
      severity: mapSeverity(advisory.severity),
      ...(advisory.patched_versions ? { fixedIn: advisory.patched_versions } : {}),
      ...(advisory.url ? { url: advisory.url } : {}),
    });
    diagnostics.push({
      severity:
        mapSeverity(advisory.severity) === 'critical' || mapSeverity(advisory.severity) === 'high'
          ? 'error'
          : 'warning',
      code: id,
      message: advisory.title ?? `Vulnerability reported for ${name}.`,
      source: 'npm-audit',
    });
  }
  return { diagnostics, vulnerabilities: advisories, outdated: [] };
}

function parseNpmOutdated(text: string): ParsedPackageReports {
  const diagnostics: LanguageDiagnostic[] = [];
  const outdated: LanguagePackageMutation[] = [];
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text);
  } catch {
    // `bun outdated` ignores --json and prints a box table:
    // `| minimist        | 0.0.8   | 0.0.8  | 1.2.8  |`, `| is-number (dev) | …`.
    for (const line of text.split(/\r?\n/)) {
      const row =
        /^\|\s*(\S+?)(?:\s+\((dev|optional|peer)\))?\s*\|\s*([^|\s]+)\s*\|\s*([^|\s]+)\s*\|\s*([^|\s]+)\s*\|\s*$/.exec(
          line,
        );
      if (!row || row[1] === 'Package' || /^-+$/.test(row[1]!)) continue;
      payload[row[1]!] = {
        current: row[3],
        wanted: row[4],
        latest: row[5],
        type: row[2] === 'dev' ? 'development' : row[2] === 'optional' ? 'optional' : undefined,
      };
    }
  }
  for (const [name, info] of Object.entries(payload)) {
    const entry = info as {
      current?: string;
      latest?: string;
      wanted?: string;
      type?: string;
      // pnpm names the manifest section `dependencyType`; npm uses `type`.
      dependencyType?: string;
      location?: string;
    };
    if (!entry.latest || entry.latest === entry.current) continue;
    outdated.push({
      name,
      previous: entry.current,
      resolved: entry.latest,
      kind: mapOutdatedKind(entry.type ?? entry.dependencyType),
    });
    diagnostics.push({
      severity: 'info',
      code: 'outdated',
      message: `${name}: ${entry.current ?? '?'} → ${entry.latest}`,
      source: 'npm-outdated',
    });
  }
  return { diagnostics, vulnerabilities: [], outdated };
}

/** `pip-audit --format json`: `{dependencies: [{name, version, vulns: [{id, fix_versions, aliases}]}]}`. */
function parsePipAudit(text: string): ParsedPackageReports {
  const diagnostics: LanguageDiagnostic[] = [];
  const vulnerabilities: LanguagePackageVulnerability[] = [];
  const document = parseJsonDocument(text) as {
    dependencies?: Array<{
      name?: string;
      version?: string;
      vulns?: Array<{ id?: string; fix_versions?: string[]; aliases?: string[] }>;
    }>;
  } | null;
  for (const dep of document?.dependencies ?? []) {
    for (const vuln of dep.vulns ?? []) {
      if (!dep.name || !vuln.id) continue;
      const fixedIn = vuln.fix_versions?.[0];
      vulnerabilities.push({
        package: dep.name,
        advisory: vuln.id,
        // pip-audit reports no severity.
        severity: 'unknown',
        ...(fixedIn ? { fixedIn } : {}),
      });
      diagnostics.push({
        severity: 'warning',
        code: vuln.id,
        message: `${dep.name} ${dep.version ?? ''} is affected by ${vuln.id}${fixedIn ? ` (fixed in ${fixedIn})` : ''}.`,
        source: 'pip-audit',
      });
    }
  }
  return { diagnostics, vulnerabilities, outdated: [] };
}

function parseCargoAudit(text: string): ParsedPackageReports {
  const diagnostics: LanguageDiagnostic[] = [];
  const vulnerabilities: LanguagePackageVulnerability[] = [];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { diagnostics, vulnerabilities, outdated: [] };
  }
  const findings = (root as { vulnerabilities?: { found?: unknown } }).vulnerabilities?.found;
  if (!Array.isArray(findings)) return { diagnostics, vulnerabilities, outdated: [] };
  for (const finding of findings) {
    const item = finding as {
      id?: string;
      package?: string;
      title?: string;
      severity?: string;
      patched_versions?: string[];
      url?: { long?: string; short?: string };
      advisory?: { id?: string };
    };
    const name = item.package ?? 'unknown';
    const advisory = item.id ?? item.advisory?.id ?? 'cargo-audit';
    vulnerabilities.push({
      package: name,
      ...(item.title ? { advisory: item.title } : { advisory }),
      severity: mapSeverity(item.severity),
      ...(item.patched_versions && item.patched_versions.length > 0
        ? { fixedIn: item.patched_versions[0] }
        : {}),
      ...(item.url?.short ? { url: item.url.short } : {}),
    });
    diagnostics.push({
      severity:
        mapSeverity(item.severity) === 'critical' || mapSeverity(item.severity) === 'high'
          ? 'error'
          : 'warning',
      code: advisory,
      message: item.title ?? `${name} reported by cargo-audit.`,
      source: 'cargo-audit',
    });
  }
  return { diagnostics, vulnerabilities, outdated: [] };
}

/** The output as one JSON document (stderr noise after it allowed), or null. */
function parseJsonDocument(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseComposerAudit(text: string): ParsedPackageReports {
  const diagnostics: LanguageDiagnostic[] = [];
  const vulnerabilities: LanguagePackageVulnerability[] = [];
  // Real `composer audit --format=json` is ONE pretty-printed document
  // (`{"advisories": {"vendor/pkg": [ … ]}, "abandoned": …}`); no line of it
  // parses alone, so the per-line reader below found nothing.
  const document = parseJsonDocument(text) as {
    advisories?: Record<string, unknown> | unknown[];
  } | null;
  if (document?.advisories && typeof document.advisories === 'object') {
    for (const [pkg, entries] of Object.entries(document.advisories)) {
      const list = Array.isArray(entries) ? entries : Object.values(entries ?? {});
      for (const raw of list) {
        const entry = raw as {
          advisoryId?: string;
          packageName?: string;
          title?: string;
          cve?: string | null;
          link?: string;
          severity?: string | null;
        };
        const id = entry.cve ?? entry.advisoryId ?? 'composer-audit';
        vulnerabilities.push({
          package: entry.packageName ?? pkg,
          advisory: entry.title ?? id,
          severity: mapSeverity(entry.severity ?? undefined),
          ...(entry.link ? { url: entry.link } : {}),
        });
        diagnostics.push({
          severity: 'warning',
          code: id,
          message: entry.title ?? `${entry.packageName ?? pkg} reported by composer audit.`,
          source: 'composer-audit',
        });
      }
    }
    return { diagnostics, vulnerabilities, outdated: [] };
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const entry = JSON.parse(line) as {
        package?: string;
        advisory?: string;
        title?: string;
        severity?: string;
        affectedVersions?: string;
        url?: string;
      };
      if (!entry.package) continue;
      vulnerabilities.push({
        package: entry.package,
        ...(entry.advisory ? { advisory: entry.advisory } : {}),
        ...(entry.title
          ? { advisory: entry.title }
          : { advisory: entry.advisory ?? 'composer-audit' }),
        severity: mapSeverity(entry.severity),
        ...(entry.affectedVersions ? { fixedIn: entry.affectedVersions } : {}),
        ...(entry.url ? { url: entry.url } : {}),
      });
      diagnostics.push({
        severity: 'warning',
        code: entry.advisory ?? 'composer-audit',
        message: entry.title ?? `${entry.package} reported by composer audit.`,
        source: 'composer-audit',
      });
    } catch {
      // Ignore malformed composer audit lines; raw output is preserved.
    }
  }
  return { diagnostics, vulnerabilities, outdated: [] };
}

function parseComposerOutdated(text: string): ParsedPackageReports {
  const diagnostics: LanguageDiagnostic[] = [];
  const outdated: LanguagePackageMutation[] = [];
  // Real `composer outdated --format=json` is ONE document keyed by what was
  // checked (`{"locked": [...]}` / `{"installed": [...]}`); no single line of
  // it parses, so the per-line reader below never saw a package.
  const document = parseJsonDocument(text) as {
    locked?: unknown[];
    installed?: unknown[];
  } | null;
  const rows = document ? (document.locked ?? document.installed) : undefined;
  const lines = Array.isArray(rows) ? rows.map((row) => JSON.stringify(row)) : text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const entry = JSON.parse(line) as {
        name?: string;
        version?: string;
        latest?: string;
        description?: string;
      };
      if (!entry.name || entry.version === entry.latest) continue;
      outdated.push({
        name: entry.name,
        previous: entry.version,
        resolved: entry.latest ?? entry.version,
      });
      diagnostics.push({
        severity: 'info',
        code: 'outdated',
        message: `${entry.name}: ${entry.version ?? '?'} → ${entry.latest ?? '?'}`,
        source: 'composer-outdated',
      });
    } catch {
      // Skip malformed line; the raw output remains available.
    }
  }
  return { diagnostics, vulnerabilities: [], outdated };
}

function parseDotnetPackage(text: string): ParsedPackageReports {
  const diagnostics: LanguageDiagnostic[] = [];
  const vulnerabilities: LanguagePackageVulnerability[] = [];
  const outdated: LanguagePackageMutation[] = [];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { diagnostics, vulnerabilities, outdated };
  }
  const projects = (root as { projects?: Array<{ frameworks?: unknown; packages?: unknown }> })
    .projects;
  if (!Array.isArray(projects)) return { diagnostics, vulnerabilities, outdated };
  for (const project of projects) {
    // The SDK's report nests packages per target framework
    // (`frameworks[].topLevelPackages[]` / `transitivePackages[]`, keyed `id`);
    // reading only a flat `packages[]` found nothing in a real report.
    const frameworks = Array.isArray(project.frameworks)
      ? (project.frameworks as Array<Record<string, unknown>>)
      : [];
    const packages = [
      ...(Array.isArray(project.packages) ? project.packages : []),
      ...frameworks.flatMap((framework) => [
        ...(Array.isArray(framework.topLevelPackages) ? framework.topLevelPackages : []),
        ...(Array.isArray(framework.transitivePackages) ? framework.transitivePackages : []),
      ]),
    ];
    for (const pkg of packages as Array<Record<string, unknown>>) {
      const name =
        typeof pkg.id === 'string' ? pkg.id : typeof pkg.name === 'string' ? pkg.name : 'unknown';
      const requested = typeof pkg.requestedVersion === 'string' ? pkg.requestedVersion : undefined;
      const resolved = typeof pkg.resolvedVersion === 'string' ? pkg.resolvedVersion : undefined;
      const latest = typeof pkg.latestVersion === 'string' ? pkg.latestVersion : undefined;
      if (latest && resolved && latest !== resolved) {
        outdated.push({
          name,
          ...(requested ? { requested } : {}),
          previous: resolved,
          resolved: latest,
        });
        diagnostics.push({
          severity: 'info',
          code: 'outdated',
          message: `${name}: ${resolved} → ${latest}`,
          source: 'dotnet-package',
        });
        continue;
      }
      const vulnerabilitiesRaw = Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities : [];
      for (const vuln of vulnerabilitiesRaw as Array<Record<string, unknown>>) {
        // The SDK spells the field `advisoryurl` (all lower case).
        const url = vuln.advisoryurl ?? vuln.advisoryUrl;
        const advisory = typeof url === 'string' ? url : 'dotnet-vulnerable';
        vulnerabilities.push({
          package: name,
          advisory,
          severity: mapSeverity(typeof vuln.severity === 'string' ? vuln.severity : undefined),
        });
      }
      if (vulnerabilitiesRaw.length > 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'dotnet-vulnerable',
          message: `${name} has ${vulnerabilitiesRaw.length} known vulnerability entry/entries.`,
          source: 'dotnet-package',
        });
      }
      if (
        requested &&
        resolved &&
        requested.startsWith('>') &&
        requested.split('>')[1]!.split('.').slice(0, 2).join('.') !==
          resolved.split('.').slice(0, 2).join('.')
      ) {
        outdated.push({ name, requested, resolved });
        diagnostics.push({
          severity: 'info',
          code: 'outdated',
          message: `${name}: ${requested} → ${resolved}`,
          source: 'dotnet-package',
        });
      }
    }
  }
  return { diagnostics, vulnerabilities, outdated };
}

function mapSeverity(value: string | undefined): LanguagePackageVulnerability['severity'] {
  switch (value?.toLowerCase()) {
    // `critical` is its own level: folded into `high`, every critical
    // advisory was reported one level low and the callers' `critical`
    // branches (and the audit tool's "N critical" count) never matched.
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
    case 'moderate':
      return 'moderate';
    case 'low':
      return 'low';
    case 'unknown':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function mapOutdatedKind(value: string | undefined): 'runtime' | 'development' | 'optional' {
  switch (value?.toLowerCase()) {
    case 'devdependencies':
    case 'development':
      return 'development';
    case 'optionaldependencies':
    case 'optional':
      return 'optional';
    default:
      return 'runtime';
  }
}

function parseLinePattern(
  text: string,
  regex: RegExp,
  root: string,
  source: string,
  details: (
    match: RegExpMatchArray,
    fallback: string,
  ) => { severity: LanguageDiagnostic['severity']; message: string },
): LanguageDiagnostic[] {
  const diagnostics: LanguageDiagnostic[] = [];
  for (const match of text.matchAll(regex)) {
    const parsed = details(match, match.at(-1)?.trim() ?? 'Diagnostic');
    diagnostics.push({
      severity: parsed.severity,
      message: parsed.message,
      file: normalizeDiagnosticPath(match[1]!, root),
      range: { start: { line: toPositiveInt(match[2]), column: toPositiveInt(match[3]) } },
      source,
    });
  }
  return diagnostics;
}

function normalizeDiagnosticPath(value: string, root: string): string {
  const clean = value.trim().replace(/^['"]|['"]$/g, '');
  return path.resolve(root, clean);
}

function normalizeSeverity(value: string | undefined): LanguageDiagnostic['severity'] {
  if (value === 'warning' || value === 'warn') return 'warning';
  // rustc closes a failed build with a span-less `failure-note` ("For more
  // information about this error, try `rustc --explain …`"): a pointer, not a
  // diagnostic. Read as `error` it inflated every failed cargo build by one.
  if (value === 'info' || value === 'note' || value === 'help' || value === 'failure-note')
    return 'info';
  if (value === 'hint') return 'hint';
  return 'error';
}

function toPositiveInt(value: string | undefined): number {
  return Math.max(1, Number.parseInt(value ?? '1', 10) || 1);
}

function summarize(diagnostics: readonly LanguageDiagnostic[]): LanguageRunSummary {
  return {
    errors: diagnostics.filter((item) => item.severity === 'error').length,
    warnings: diagnostics.filter((item) => item.severity === 'warning').length,
    infos: diagnostics.filter((item) => item.severity === 'info' || item.severity === 'hint')
      .length,
  };
}

function emptySummary(): LanguageRunSummary {
  return { errors: 0, warnings: 0, infos: 0 };
}

function dedupeDiagnostics(items: readonly LanguageDiagnostic[]): LanguageDiagnostic[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      item.source,
      item.code ?? '',
      item.file ?? '',
      item.range?.start.line ?? 0,
      item.range?.start.column ?? 0,
      item.message,
    ].join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareDiagnostics(a: LanguageDiagnostic, b: LanguageDiagnostic): number {
  return (
    (a.file ?? '').localeCompare(b.file ?? '') ||
    (a.range?.start.line ?? 0) - (b.range?.start.line ?? 0) ||
    (a.range?.start.column ?? 0) - (b.range?.start.column ?? 0) ||
    severityRank(a.severity) - severityRank(b.severity) ||
    (a.code ?? '').localeCompare(b.code ?? '') ||
    a.message.localeCompare(b.message)
  );
}

function severityRank(value: LanguageDiagnostic['severity']): number {
  return value === 'error' ? 0 : value === 'warning' ? 1 : value === 'info' ? 2 : 3;
}
