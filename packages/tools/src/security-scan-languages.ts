/**
 * Language profiles for `security-ast-scan`.
 *
 * JavaScript/TypeScript keep their dedicated rules in the tool file. Every
 * other supported language gets a small, table-driven set of single-line
 * heuristics for the defect classes that are cheap to spot without a parser:
 * shell/command injection, SQL built from strings, unsafe deserialization,
 * disabled TLS verification and (C/C++) unbounded memory APIs. The language-
 * agnostic secret scan runs on top of every profile.
 *
 * These are heuristics, not data-flow analysis: a clean result means these
 * patterns were absent, which is why the tool reports the rule ids it checked.
 */

import * as path from 'node:path';

export type SecurityRuleId =
  | 'perf/n-plus-one-query'
  | 'sec/sql-injection'
  | 'sec/hardcoded-secret'
  | 'sec/prototype-pollution'
  | 'sec/redos-vulnerable-regex'
  | 'sec/unsafe-dynamic-exec'
  | 'sec/insecure-deserialization'
  | 'sec/tls-verification-disabled'
  | 'sec/unsafe-memory-api';

export interface SecurityFinding {
  ruleId: SecurityRuleId;
  category: 'security' | 'performance';
  severity: 'critical' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  snippet: string;
  recommendation: string;
}

type ProfileRuleId = Extract<
  SecurityRuleId,
  | 'sec/unsafe-dynamic-exec'
  | 'sec/sql-injection'
  | 'sec/insecure-deserialization'
  | 'sec/tls-verification-disabled'
  | 'sec/unsafe-memory-api'
>;

const RULE_INFO: Record<
  ProfileRuleId,
  { severity: 'critical' | 'warning'; message: string; recommendation: string }
> = {
  'sec/unsafe-dynamic-exec': {
    severity: 'critical',
    message: 'Command or code execution built from a non-literal string (injection risk).',
    recommendation:
      'Pass an argument vector to the process API without a shell, avoid eval-style execution, and never splice untrusted input into a command string.',
  },
  'sec/sql-injection': {
    severity: 'critical',
    message: 'SQL statement built by string concatenation or interpolation.',
    recommendation:
      'Use parameterized queries or prepared statements and bind values instead of formatting them into the SQL text.',
  },
  'sec/insecure-deserialization': {
    severity: 'critical',
    message: 'Deserialization of data with a format that can instantiate arbitrary types.',
    recommendation:
      'Use a data-only format (JSON) with an explicit schema, or restrict the deserializer to an allow-list of types; never deserialize untrusted input.',
  },
  'sec/tls-verification-disabled': {
    severity: 'critical',
    message: 'TLS certificate or hostname verification is disabled.',
    recommendation:
      'Keep certificate and hostname verification on; trust a private CA explicitly instead of turning verification off.',
  },
  'sec/unsafe-memory-api': {
    severity: 'warning',
    message: 'Unbounded C string/IO function that can overflow its destination buffer.',
    recommendation:
      'Use the bounded variants (snprintf, strncpy/strlcpy, fgets) or std::string/std::span and check the sizes.',
  },
};

type RuleSet = ReadonlyArray<readonly [ProfileRuleId, RegExp]>;

const SHELL_NAME = String.raw`(?:\/(?:usr\/)?bin\/)?(?:ba|z|da|k)?sh`;
const WIN_SHELL = String.raw`(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh)`;

const PYTHON: RuleSet = [
  ['sec/unsafe-dynamic-exec', /(?<![\w.])(?:eval|exec)\s*\(\s*(?!["'][^"'\\]*["']\s*\))[^)\s]/],
  [
    'sec/unsafe-dynamic-exec',
    /\bos\.(?:system|popen)\s*\(\s*(?:f["']|[^"'\s)]|["'][^"']*["']\s*(?:[+%]|\.format\())/,
  ],
  ['sec/unsafe-dynamic-exec', /\bsubprocess\.\w+\([^)]*\bshell\s*=\s*True/],
  [
    'sec/sql-injection',
    /\.(?:execute|executemany|executescript|raw|extra)\s*\(\s*(?:f["']|["'][^"']*["']\s*(?:%|\+|\.format\())/,
  ],
  ['sec/insecure-deserialization', /\b(?:pickle|cPickle|_pickle|dill|marshal)\.loads?\s*\(/],
  [
    'sec/insecure-deserialization',
    /\byaml\.(?:load|unsafe_load)\s*\((?![^)]*Loader\s*=\s*(?:yaml\.)?C?SafeLoader)/,
  ],
  ['sec/tls-verification-disabled', /\bverify\s*=\s*False\b/],
  ['sec/tls-verification-disabled', /\bssl\._create_unverified_context\b|\bCERT_NONE\b/],
];

const GO: RuleSet = [
  [
    'sec/unsafe-dynamic-exec',
    new RegExp(
      String.raw`\bexec\.Command(?:Context)?\(\s*(?:[\w.]+,\s*)?"${SHELL_NAME}"\s*,\s*"-c"`,
    ),
  ],
  [
    'sec/unsafe-dynamic-exec',
    new RegExp(
      String.raw`\bexec\.Command(?:Context)?\(\s*(?:[\w.]+,\s*)?"${WIN_SHELL}"\s*,\s*"\/[cC]"`,
    ),
  ],
  [
    'sec/sql-injection',
    /\.(?:Query|QueryRow|Exec|Prepare|Get|Select)(?:Context)?\(\s*(?:[\w.]+,\s*)?(?:fmt\.Sprintf\(|"[^"]*"\s*\+)/,
  ],
  ['sec/tls-verification-disabled', /\bInsecureSkipVerify:\s*true\b/],
];

const RUST: RuleSet = [
  ['sec/unsafe-dynamic-exec', new RegExp(String.raw`\bCommand::new\(\s*"${SHELL_NAME}"\s*\)`)],
  ['sec/unsafe-dynamic-exec', new RegExp(String.raw`\bCommand::new\(\s*"${WIN_SHELL}"\s*\)`)],
  ['sec/sql-injection', /\b(?:query|query_as|query_scalar|execute|prepare)\s*\(\s*&?format!\(/],
  ['sec/tls-verification-disabled', /\bdanger_accept_invalid_(?:certs|hostnames)\s*\(\s*true\s*\)/],
];

const JVM: RuleSet = [
  ['sec/unsafe-dynamic-exec', /\bRuntime\.getRuntime\(\)\.exec\(\s*(?!"[^"+]*"\s*[),])/],
  [
    'sec/unsafe-dynamic-exec',
    new RegExp(String.raw`\bProcessBuilder\(\s*"(?:${SHELL_NAME}|${WIN_SHELL})"`),
  ],
  [
    'sec/sql-injection',
    /\b(?:executeQuery|executeUpdate|execute|prepareStatement|createQuery|createNativeQuery|nativeQuery|queryForObject|queryForList)\s*\(\s*(?:"[^"]*"\s*\+|String\.format\(|"[^"]*\$\{?\w)/,
  ],
  [
    'sec/insecure-deserialization',
    /\bObjectInputStream\s*\(|\bXMLDecoder\s*\(|\benableDefaultTyping\b/,
  ],
  [
    'sec/tls-verification-disabled',
    /ALLOW_ALL_HOSTNAME_VERIFIER|NoopHostnameVerifier|TrustAllStrategy|TrustSelfSignedStrategy|\.setHostnameVerifier\([^)]*->\s*true|hostnameVerifier\s*\{\s*_\s*,\s*_\s*->\s*true/,
  ],
];

const CSHARP: RuleSet = [
  [
    'sec/unsafe-dynamic-exec',
    new RegExp(String.raw`\bProcess\.Start\(\s*"(?:${SHELL_NAME}|${WIN_SHELL})"`),
  ],
  [
    'sec/unsafe-dynamic-exec',
    new RegExp(String.raw`\bFileName\s*=\s*"(?:${SHELL_NAME}|${WIN_SHELL})"`),
  ],
  [
    'sec/sql-injection',
    /\bnew\s+(?:Sql|Npgsql|MySql|Oracle|Sqlite)Command\(\s*(?:\$@?"|@\$"|@?"[^"]*"\s*\+|string\.Format\()/,
  ],
  [
    'sec/sql-injection',
    /\b(?:FromSqlRaw|ExecuteSqlRaw|ExecuteSqlRawAsync|SqlQueryRaw)\(\s*(?:\$@?"|"[^"]*"\s*\+|string\.Format\()/,
  ],
  [
    'sec/insecure-deserialization',
    /\b(?:BinaryFormatter|NetDataContractSerializer|LosFormatter|SoapFormatter|ObjectStateFormatter)\b|TypeNameHandling\s*=\s*TypeNameHandling\.(?:All|Auto|Objects|Arrays)/,
  ],
  [
    'sec/tls-verification-disabled',
    /ServerCertificateValidationCallback\s*\+?=\s*[^;]*(?:=>\s*true|delegate\s*\{\s*return\s+true)|DangerousAcceptAnyServerCertificateValidator/,
  ],
];

const PHP: RuleSet = [
  [
    'sec/unsafe-dynamic-exec',
    /\b(?:system|exec|shell_exec|passthru|popen|proc_open|pcntl_exec)\s*\(\s*(?:\$|["'][^"']*["']\s*\.\s*\$|"[^"]*\$)/,
  ],
  ['sec/unsafe-dynamic-exec', /\beval\s*\(|\bassert\s*\(\s*\$|\bcreate_function\s*\(/],
  [
    'sec/sql-injection',
    /\b(?:mysqli_query|mysql_query|pg_query|sqlite_query|->query|->exec)\s*\([^)]*(?:["']\s*\.\s*\$|"[^"]*\$\w)/,
  ],
  ['sec/insecure-deserialization', /\bunserialize\s*\(\s*\$/],
  [
    'sec/tls-verification-disabled',
    /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*(?:false|0)\b|['"]verify['"]\s*=>\s*false/,
  ],
];

const RUBY: RuleSet = [
  ['sec/unsafe-dynamic-exec', /(?<![\w.:])eval[ (]\s*(?:"[^"]*#\{|[A-Za-z_@])/],
  ['sec/unsafe-dynamic-exec', /\b(?:system|exec|spawn)\s*\(?\s*"[^"]*#\{/],
  ['sec/unsafe-dynamic-exec', /%x[({[]|`[^`]*#\{[^`]*`/],
  ['sec/unsafe-dynamic-exec', /\b(?:Open3\.\w+|IO\.popen)\(\s*"[^"]*#\{/],
  [
    'sec/sql-injection',
    /\b(?:where|find_by_sql|execute|select_all|select_value|order|group|having|joins|update_all|delete_all|pluck|from)\s*\(?\s*"[^"]*#\{/,
  ],
  [
    'sec/insecure-deserialization',
    /\bMarshal\.(?:load|restore)\b|\bYAML\.(?:load|unsafe_load)(?![\w_])/,
  ],
  ['sec/tls-verification-disabled', /\bVERIFY_NONE\b/],
];

const SWIFT: RuleSet = [
  [
    'sec/unsafe-dynamic-exec',
    new RegExp(String.raw`\b(?:launchPath|executableURL)\s*=[^;\n]*${SHELL_NAME}\b`),
  ],
  ['sec/unsafe-dynamic-exec', /\barguments\s*=\s*\[\s*"-c"/],
  ['sec/unsafe-dynamic-exec', /(?<![\w.])system\s*\(\s*(?:[A-Za-z_]|"[^"]*\\\()/],
  ['sec/sql-injection', /"[^"\n]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^"\n]*\\\(/i],
  [
    'sec/insecure-deserialization',
    /\bNSKeyedUnarchiver\.unarchiveObject\s*\(|\brequiresSecureCoding\s*=\s*false\b/,
  ],
  [
    'sec/tls-verification-disabled',
    /\.useCredential\s*,\s*URLCredential\(\s*trust:|\bDisabledTrustEvaluator\b|\bdisableEvaluation\b/,
  ],
];

const C_FAMILY: RuleSet = [
  [
    'sec/unsafe-dynamic-exec',
    /(?<![\w.>])(?:system|popen|_popen|_wsystem)\s*\(\s*(?!"[^"\\]*"\s*\))/,
  ],
  ['sec/unsafe-dynamic-exec', new RegExp(String.raw`\bexec[lv]p?\s*\(\s*"${SHELL_NAME}"`)],
  [
    'sec/unsafe-memory-api',
    /(?<![\w.>])(?:gets|strcpy|strcat|sprintf|vsprintf|wcscpy|wcscat)\s*\(/,
  ],
  ['sec/unsafe-memory-api', /\b(?:scanf|sscanf|fscanf)\s*\([^)]*%s/],
  [
    'sec/sql-injection',
    /"[^"\n]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^"\n]*"\s*\+\s*\w/i,
  ],
  [
    'sec/tls-verification-disabled',
    /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*0L?\b|\bSSL_VERIFY_NONE\b/,
  ],
];

const SHELL: RuleSet = [
  ['sec/unsafe-dynamic-exec', /\beval\s+["']?\$/],
  ['sec/unsafe-dynamic-exec', /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/],
  [
    'sec/tls-verification-disabled',
    /\bcurl\b[^\n]*\s(?:-k|--insecure)\b|\bwget\b[^\n]*--no-check-certificate/,
  ],
];

export interface LanguageProfile {
  id: string;
  extensions: readonly string[];
  aliases?: readonly string[];
  commentPrefixes: readonly string[];
  rules: RuleSet;
}

const SLASH_COMMENTS = ['//', '/*', '*'] as const;
const HASH_COMMENTS = ['#'] as const;

const LANGUAGE_PROFILES: readonly LanguageProfile[] = [
  {
    id: 'python',
    extensions: ['py', 'pyw', 'pyi'],
    aliases: ['python3'],
    commentPrefixes: HASH_COMMENTS,
    rules: PYTHON,
  },
  { id: 'go', extensions: ['go'], aliases: ['golang'], commentPrefixes: SLASH_COMMENTS, rules: GO },
  { id: 'rust', extensions: ['rs'], commentPrefixes: SLASH_COMMENTS, rules: RUST },
  { id: 'java', extensions: ['java'], commentPrefixes: SLASH_COMMENTS, rules: JVM },
  { id: 'kotlin', extensions: ['kt', 'kts'], commentPrefixes: SLASH_COMMENTS, rules: JVM },
  { id: 'scala', extensions: ['scala', 'sc'], commentPrefixes: SLASH_COMMENTS, rules: JVM },
  {
    id: 'csharp',
    extensions: ['cs'],
    aliases: ['c#', 'dotnet'],
    commentPrefixes: SLASH_COMMENTS,
    rules: CSHARP,
  },
  {
    id: 'php',
    extensions: ['php', 'phtml', 'php5', 'php7'],
    commentPrefixes: ['//', '#', '/*', '*'],
    rules: PHP,
  },
  { id: 'ruby', extensions: ['rb', 'rake', 'ru'], commentPrefixes: HASH_COMMENTS, rules: RUBY },
  { id: 'swift', extensions: ['swift'], commentPrefixes: SLASH_COMMENTS, rules: SWIFT },
  { id: 'c', extensions: ['c', 'h'], commentPrefixes: SLASH_COMMENTS, rules: C_FAMILY },
  {
    id: 'cpp',
    extensions: ['cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx'],
    aliases: ['c++'],
    commentPrefixes: SLASH_COMMENTS,
    rules: C_FAMILY,
  },
  {
    id: 'shell',
    extensions: ['sh', 'bash', 'zsh'],
    aliases: ['shell'],
    commentPrefixes: HASH_COMMENTS,
    rules: SHELL,
  },
];

const JS_TS_BY_NAME: Record<string, 'typescript' | 'javascript'> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  javascript: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
};

export interface ResolvedScanLanguage {
  /** Canonical id for supported languages, otherwise the normalised hint or extension. */
  id: string;
  /** True when the tool has code rules for this language (everything but secrets). */
  supported: boolean;
  /** Table-driven rules for non-JS/TS languages; absent for JS/TS (dedicated rules) and unsupported. */
  profile?: LanguageProfile | undefined;
}

function normaliseLanguageHint(hint: string): string {
  return hint
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/[^a-z0-9+#_-]/g, '');
}

function lookup(name: string): ResolvedScanLanguage | undefined {
  const jsTs = JS_TS_BY_NAME[name];
  if (jsTs) return { id: jsTs, supported: true };
  const profile = LANGUAGE_PROFILES.find(
    (p) => p.id === name || p.extensions.includes(name) || p.aliases?.includes(name),
  );
  return profile ? { id: profile.id, supported: true, profile } : undefined;
}

/** Resolve the scan language from an explicit hint, then the file extension, then the TS default. */
export function resolveScanLanguage(
  file: string | undefined,
  language: string | undefined,
): ResolvedScanLanguage {
  const hint = language ? normaliseLanguageHint(language) : '';
  if (hint) return lookup(hint) ?? { id: hint, supported: false };
  if (file) {
    const ext = path.extname(file).slice(1).toLowerCase();
    return lookup(ext) ?? { id: ext || 'unknown', supported: false };
  }
  return { id: 'typescript', supported: true };
}

/** Rule ids a profile evaluates, in a stable order. */
export function profileRuleIds(profile: LanguageProfile): SecurityRuleId[] {
  return [...new Set(profile.rules.map(([ruleId]) => ruleId))];
}

/**
 * Run a profile's rules over `content`. Comment-only lines are skipped and each
 * rule reports a line at most once.
 */
export function analyzeWithProfile(
  filePath: string,
  content: string,
  profile: LanguageProfile,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const relPath = filePath.replace(/\\/g, '/');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || profile.commentPrefixes.some((prefix) => trimmed.startsWith(prefix))) continue;
    const reported = new Set<ProfileRuleId>();
    for (const [ruleId, pattern] of profile.rules) {
      if (reported.has(ruleId) || !pattern.test(line)) continue;
      reported.add(ruleId);
      const info = RULE_INFO[ruleId];
      findings.push({
        ruleId,
        category: 'security',
        severity: info.severity,
        file: relPath,
        line: i + 1,
        message: info.message,
        snippet: trimmed,
        recommendation: info.recommendation,
      });
    }
  }
  return findings;
}
