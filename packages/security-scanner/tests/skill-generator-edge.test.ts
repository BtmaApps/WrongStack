/**
 * Edge-case tests for SkillGenerator covering all remaining branches:
 * - All stack types not yet tested (php, ruby, cpp, c, kotlin, swift, unknown)
 * - includeInjection and includeConfig options set to false
 * - severityThreshold values: 'critical', 'low'
 * - calculateConfidence with empty dependencies / no manifest / unknown PM
 * - buildSkillContent filter branches for different file extension types
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SecurityScanner } from '../src/scanner.js';
import { SkillGenerator } from '../src/skill-generator.js';
import type { TechStackInfo } from '../src/types.js';

describe('SkillGenerator - edge coverage', () => {
  let generator: SkillGenerator;

  beforeEach(() => {
    generator = new SkillGenerator();
  });

  function makeStack(stack: TechStackInfo['stack'], deps = true): TechStackInfo {
    return {
      stack,
      packageManager:
        stack === 'nodejs'
          ? 'npm'
          : stack === 'python'
            ? 'pip'
            : stack === 'php'
              ? 'composer'
              : stack === 'ruby'
                ? 'bundler'
                : stack === 'cpp'
                  ? 'cmake'
                  : stack === 'c'
                    ? 'cmake'
                    : stack === 'kotlin'
                      ? 'gradle'
                      : stack === 'swift'
                        ? 'swiftpm'
                        : 'unknown',
      manifestFile:
        stack === 'nodejs'
          ? 'package.json'
          : stack === 'python'
            ? 'pyproject.toml'
            : stack === 'php'
              ? 'composer.json'
              : stack === 'ruby'
                ? 'Gemfile'
                : stack === 'cpp'
                  ? 'CMakeLists.txt'
                  : stack === 'c'
                    ? 'CMakeLists.txt'
                    : stack === 'kotlin'
                      ? 'build.gradle.kts'
                      : stack === 'swift'
                        ? 'Package.swift'
                        : '',
      dependencies: deps ? [{ name: 'test-pkg', version: '1.0.0', isDev: false }] : [],
      projectPath: '/test',
    };
  }

  // ── Uncovered stack: PHP ──────────────────────────────────────────────────
  it('generates skill for PHP stack', () => {
    const skill = generator.generate(makeStack('php'));
    expect(skill.name).toBe('security-scanner-php');
    expect(skill.techStack).toBe('php');
  });

  // ── Uncovered stack: Ruby ─────────────────────────────────────────────────
  it('generates skill for Ruby stack', () => {
    const skill = generator.generate(makeStack('ruby'));
    expect(skill.name).toBe('security-scanner-ruby');
  });

  // ── Uncovered stack: C++ ──────────────────────────────────────────────────
  it('generates skill for C++ stack', () => {
    const skill = generator.generate(makeStack('cpp'));
    expect(skill.name).toBe('security-scanner-cpp');
  });

  // ── Uncovered stack: C ────────────────────────────────────────────────────
  it('generates skill for C stack', () => {
    const skill = generator.generate(makeStack('c'));
    expect(skill.name).toBe('security-scanner-c');
    expect(skill.metadata.targetFiles).toContain('**/*.c');
  });

  // ── Uncovered stack: Kotlin ───────────────────────────────────────────────
  it('generates skill for Kotlin stack', () => {
    const skill = generator.generate(makeStack('kotlin'));
    expect(skill.name).toBe('security-scanner-kotlin');
    expect(skill.metadata.targetFiles).toContain('**/*.kt');
  });

  // ── Uncovered stack: Swift ────────────────────────────────────────────────
  it('generates skill for Swift stack', () => {
    const skill = generator.generate(makeStack('swift'));
    expect(skill.name).toBe('security-scanner-swift');
    expect(skill.metadata.targetFiles).toContain('**/*.swift');
  });

  // ── Uncovered stack: unknown ──────────────────────────────────────────────
  it('generates skill for unknown stack (fallback target files)', () => {
    const skill = generator.generate(makeStack('unknown'));
    expect(skill.name).toBe('security-scanner-unknown');
    expect(skill.metadata.targetFiles).toContain('**/*');
  });

  it('falls back to catch-all files for an unexpected runtime stack', () => {
    const stack = makeStack('unknown');
    stack.stack = 'future-language' as never;
    const skill = generator.generate(stack);
    expect(skill.metadata.targetFiles).toEqual(['**/*']);
  });

  // ── includeInjection: false → no injection patterns ───────────────────────
  it('excludes injection patterns when includeInjection is false', () => {
    const g = new SkillGenerator({ includeInjection: false });
    const skill = g.generate(makeStack('nodejs'));
    expect(skill.patterns.some((p) => p.id === 'command-injection')).toBe(false);
  });

  // ── includeConfig: false → no config patterns ─────────────────────────────
  it('excludes config patterns when includeConfig is false', () => {
    const g = new SkillGenerator({ includeConfig: false });
    const skill = g.generate(makeStack('nodejs'));
    expect(skill.patterns.some((p) => p.id === 'insecure-tls')).toBe(false);
  });

  // ── severityThreshold: 'critical' → only critical patterns ────────────────
  it('filters to only critical patterns when threshold is critical', () => {
    const g = new SkillGenerator({ severityThreshold: 'critical' });
    const skill = g.generate(makeStack('nodejs'));
    for (const p of skill.patterns) {
      expect(p.severity).toBe('critical');
    }
  });

  // ── severityThreshold: 'low' → all patterns included ──────────────────────
  it('includes all severity patterns when threshold is low', () => {
    const g = new SkillGenerator({ severityThreshold: 'low' });
    const skill = g.generate(makeStack('nodejs'));
    const severities = new Set(skill.patterns.map((p) => p.severity));
    // With threshold 'low', patterns of all severities should be included
    expect(severities.size).toBeGreaterThanOrEqual(2);
  });

  // ── calculateConfidence: no dependencies ──────────────────────────────────
  it('calculates lower confidence without dependencies', () => {
    const g = new SkillGenerator();
    const ts = makeStack('nodejs');
    ts.dependencies = [];
    const skill = g.generate(ts);
    // Without dependencies: 0.7 base; with manifest + known PM: +0.2 = ~0.9
    expect(skill.metadata.confidence).toBeCloseTo(0.9, 1);
  });

  // ── calculateConfidence: no manifest file ─────────────────────────────────
  it('calculates lower confidence without manifest file', () => {
    const g = new SkillGenerator();
    const ts = makeStack('nodejs');
    ts.manifestFile = '';
    const skill = g.generate(ts);
    expect(skill.metadata.confidence).toBeCloseTo(0.9, 1); // 0.7 + 0.1 (deps) + 0.1 (PM) = ~0.9
  });

  // ── calculateConfidence: unknown PM ────────────────────────────────────────
  it('calculates lower confidence with unknown package manager', () => {
    const g = new SkillGenerator();
    const ts = makeStack('nodejs');
    ts.packageManager = 'unknown';
    const skill = g.generate(ts);
    expect(skill.metadata.confidence).toBeCloseTo(0.9, 1); // 0.7 + 0.1 (deps) + 0.1 (manifest) = ~0.9
  });

  // ── buildSkillContent: config-only patterns (json/yaml/env filters) ───────
  it('includes config-targeted patterns in the Configuration Issues section', () => {
    const skill = generator.generate(makeStack('nodejs'));
    const content = skill.content.content;
    // There should be a "Configuration Issues" section
    expect(content).toContain('### Configuration Issues');
    expect(content).toContain('Debug Mode Enabled');
  });

  // ── buildSkillContent: code vulnerability patterns (ts/js filters) ────────
  it('includes code vulnerability patterns in the Code Vulnerabilities section', () => {
    const skill = generator.generate(makeStack('nodejs'));
    const content = skill.content.content;
    expect(content).toContain('### Code Vulnerabilities');
    expect(content).toContain('Hardcoded Secrets');
  });

  // ── All options disabled → no patterns ────────────────────────────────────
  it('generates empty skill when all options are disabled', () => {
    const g = new SkillGenerator({
      includeSecrets: false,
      includeInjection: false,
      includeConfig: false,
      includeDependencies: false,
    });
    const skill = g.generate(makeStack('nodejs'));
    expect(skill.patterns).toHaveLength(0);
  });

  // ── stack-specific secrets for Rust ────────────────────────────────────────
  it('includes Rust-specific secrets in generated patterns', () => {
    const skill = generator.generate(makeStack('rust'));
    const rustPattern = skill.patterns.find((p) => p.id === 'rust-env-secrets');
    expect(rustPattern).toBeDefined();
  });

  // ── stack-specific secrets for Go ─────────────────────────────────────────
  it('includes Go-specific secrets in generated patterns', () => {
    const skill = generator.generate(makeStack('go'));
    const goPattern = skill.patterns.find((p) => p.id === 'go-hardcoded-secret');
    expect(goPattern).toBeDefined();
  });

  // ── stack-specific injection for Go ───────────────────────────────────────
  it('includes Go-specific injection patterns', () => {
    const skill = generator.generate(makeStack('go'));
    const goPattern = skill.patterns.find((p) => p.id === 'go-sql-injection');
    expect(goPattern).toBeDefined();
  });

  // ── stack-specific injection for Rust ─────────────────────────────────────
  it('includes Rust-specific injection patterns', () => {
    const skill = generator.generate(makeStack('rust'));
    const rustPattern = skill.patterns.find((p) => p.id === 'rust-command-injection');
    expect(rustPattern).toBeDefined();
  });

  // ── stack-specific injection for Java ─────────────────────────────────────
  it('includes Java-specific injection patterns', () => {
    const skill = generator.generate(makeStack('java'));
    const javaPattern = skill.patterns.find((p) => p.id === 'java-sql-injection');
    expect(javaPattern).toBeDefined();
  });

  // ── stack-specific injection for .NET ─────────────────────────────────────
  it('includes .NET-specific injection patterns', () => {
    const skill = generator.generate(makeStack('dotnet'));
    const dotnetPattern = skill.patterns.find((p) => p.id === 'csharp-sql-injection');
    expect(dotnetPattern).toBeDefined();
  });

  // ── stack-specific secrets for Java ───────────────────────────────────────
  it('includes Java-specific secrets patterns', () => {
    const skill = generator.generate(makeStack('java'));
    const javaPattern = skill.patterns.find((p) => p.id === 'java-system-getenv');
    expect(javaPattern).toBeDefined();
  });

  // ── stack-specific secrets for .NET ───────────────────────────────────────
  it('includes .NET-specific secrets patterns', () => {
    const skill = generator.generate(makeStack('dotnet'));
    const dotnetPattern = skill.patterns.find((p) => p.id === 'dotnet-config-secrets');
    expect(dotnetPattern).toBeDefined();
  });

  // ── Stack detectors actually DETECT (end to end through the scanner) ─────
  //
  // The tests above only prove each pattern id is present. Probing them showed
  // two could not do their job: `rust-command-injection` was suppressed by its
  // own false-positive marker (`Command::new`, which its regex requires), and
  // `csharp-sql-injection` skipped C# verbatim strings (`@"..."`) because of a
  // bare '@' marker. Each detector must fire on the vulnerable line and stay
  // quiet on the safe form — through `scanFile`, so markers are applied.
  describe('each stack detector fires on the vulnerable form only', () => {
    const scanner = new SecurityScanner();
    function findingsFor(stack: TechStackInfo['stack'], file: string, line: string): string[] {
      const skill = new SkillGenerator().generate(makeStack(stack));
      const findings = (
        scanner as unknown as {
          scanFile(c: string, f: string, p: unknown, conf: unknown): Array<{ patternId: string }>;
        }
      ).scanFile(line, file, skill.patterns, skill.metadata.confidence);
      return findings.map((f) => f.patternId);
    }

    it.each([
      [
        'rust',
        'rust-command-injection',
        'main.rs',
        'Command::new("sh").arg(prefix + &user_input).spawn();',
        'Command::new("ls").args(&["-la", dir]).spawn();',
      ],
      [
        'rust',
        'rust-env-secrets',
        'main.rs',
        'const API_SECRET: &str = "sk_live_abc123";',
        'let api_secret = std::env::var("API_SECRET")?;',
      ],
      [
        'go',
        'go-sql-injection',
        'main.go',
        'rows, err := db.Query("SELECT * FROM users WHERE id=" + id)',
        'rows, err := db.Query("SELECT * FROM users WHERE id=?", id)',
      ],
      [
        'go',
        'go-hardcoded-secret',
        'main.go',
        'const apiSecret = "sk_live_abc123"',
        'apiSecret := os.Getenv("API_SECRET")',
      ],
      [
        'java',
        'java-sql-injection',
        'A.java',
        'ResultSet rs = conn.createStatement().executeQuery("SELECT * FROM u WHERE id=" + id);',
        'PreparedStatement ps = conn.prepareStatement("SELECT * FROM u WHERE id=?");',
      ],
      [
        'java',
        'java-system-getenv',
        'A.java',
        'private static final String API_SECRET = "sk_live_abc123";',
        'private static final String API_SECRET = System.getenv("API_SECRET");',
      ],
      [
        'dotnet',
        'csharp-sql-injection',
        'A.cs',
        'var cmd = new SqlCommand(@"SELECT * FROM Users WHERE Id = " + id, conn);',
        'var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = @id", conn);',
      ],
      [
        'dotnet',
        'dotnet-config-secrets',
        'A.cs',
        'private const string ApiSecret = "sk_live_abc123";',
        'private readonly string ApiSecret = Environment.GetEnvironmentVariable("API_SECRET");',
      ],
    ] as const)('%s %s', (stack, id, file, vulnerable, safe) => {
      expect(findingsFor(stack, file, vulnerable)).toContain(id);
      expect(findingsFor(stack, file, safe)).not.toContain(id);
    });

    it('csharp-sql-injection still flags a concatenation mixed with a parameter', () => {
      expect(
        findingsFor(
          'dotnet',
          'A.cs',
          'var cmd = new SqlCommand("SELECT * FROM T WHERE Id = @id AND Name = \'" + name + "\'", conn);',
        ),
      ).toContain('csharp-sql-injection');
    });
  });
});
