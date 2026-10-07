import * as path from 'node:path';
import { stripAnsi } from '@wrongstack/core/utils';
import {
  parseBiome,
  parseCargoJson,
  parseDotnet,
  parseGeneric,
  parseGo,
  parseJvmCompiler,
  parsePhpLint,
  parsePythonCompile,
  parseShellcheckJson,
  parseTypeScript,
} from './compiler-diagnostics.js';
import {
  compareDiagnostics,
  dedupeDiagnostics,
  emptySummary,
  summarize,
} from './diagnostic-normalization.js';
import type { ParsedPackageReports } from './package-report-types.js';
import {
  parseBundlerAudit,
  parseCargoAudit,
  parseComposerAudit,
  parseComposerOutdated,
  parseDotnetPackage,
  parsePipAudit,
} from './package-reports-ecosystems.js';
import { parseNpmAudit, parseNpmOutdated } from './package-reports-npm.js';
import {
  parseCargoTest,
  parseDenoTest,
  parseDotnetTestFailures,
  parsePhpUnit,
  parsePytest,
} from './test-diagnostics.js';
import type { LanguageDiagnostic, LanguageProfileId, LanguageRunSummary } from './types.js';

export type { ParsedPackageReports } from './package-report-types.js';

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
    case 'bundler-audit':
      return parseBundlerAudit(json);
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
