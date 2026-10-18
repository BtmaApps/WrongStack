import { describe, expect, it } from 'vitest';
import { securityAstScanTool } from '../src/index.js';
import {
  analyzeWithProfile,
  profileRuleIds,
  resolveScanLanguage,
  type SecurityRuleId,
} from '../src/security-scan-languages.js';

function scan(language: string, code: string): SecurityRuleId[] {
  const resolved = resolveScanLanguage(undefined, language);
  if (!resolved.profile) throw new Error(`no profile for ${language}`);
  return analyzeWithProfile(`sample.${language}`, code, resolved.profile).map((f) => f.ruleId);
}

interface Case {
  language: string;
  bad: Array<[SecurityRuleId, string]>;
  safe: string[];
}

const CASES: Case[] = [
  {
    language: 'python',
    bad: [
      ['sec/unsafe-dynamic-exec', 'result = eval(user_input)'],
      ['sec/unsafe-dynamic-exec', 'os.system(f"rm -rf {path}")'],
      ['sec/unsafe-dynamic-exec', 'subprocess.run(cmd, shell=True)'],
      ['sec/sql-injection', 'cur.execute(f"SELECT * FROM t WHERE id = {uid}")'],
      ['sec/sql-injection', 'cur.execute("SELECT * FROM t WHERE id = %s" % uid)'],
      ['sec/insecure-deserialization', 'obj = pickle.loads(blob)'],
      ['sec/insecure-deserialization', 'cfg = yaml.load(stream)'],
      ['sec/tls-verification-disabled', 'requests.get(url, verify=False)'],
    ],
    safe: [
      'model.eval()',
      'os.system("clear")',
      'subprocess.run(["ls", path])',
      'cur.execute("SELECT * FROM t WHERE id = %s", (uid,))',
      'cfg = yaml.safe_load(stream)',
      'cfg = yaml.load(stream, Loader=yaml.SafeLoader)',
      '# os.system(f"rm -rf {path}")',
    ],
  },
  {
    language: 'go',
    bad: [
      ['sec/unsafe-dynamic-exec', 'exec.Command("sh", "-c", cmd).Run()'],
      ['sec/sql-injection', 'db.Query(fmt.Sprintf("SELECT * FROM t WHERE id = %s", id))'],
      ['sec/sql-injection', 'db.Exec("DELETE FROM t WHERE id = " + id)'],
      ['sec/tls-verification-disabled', '&tls.Config{InsecureSkipVerify: true}'],
    ],
    safe: [
      'exec.Command("git", "status").Run()',
      'db.Query("SELECT * FROM t WHERE id = $1", id)',
      '// exec.Command("sh", "-c", cmd)',
    ],
  },
  {
    language: 'rust',
    bad: [
      ['sec/unsafe-dynamic-exec', 'Command::new("sh").arg("-c").arg(cmd).output()?;'],
      ['sec/sql-injection', 'sqlx::query(&format!("SELECT * FROM t WHERE id = {}", id))'],
      ['sec/tls-verification-disabled', 'Client::builder().danger_accept_invalid_certs(true)'],
    ],
    safe: [
      'Command::new("git").arg("status").output()?;',
      'sqlx::query("SELECT * FROM t WHERE id = ?").bind(id)',
    ],
  },
  {
    language: 'java',
    bad: [
      ['sec/unsafe-dynamic-exec', 'Runtime.getRuntime().exec(cmd);'],
      ['sec/unsafe-dynamic-exec', 'new ProcessBuilder("sh", "-c", cmd).start();'],
      ['sec/sql-injection', 'stmt.executeQuery("SELECT * FROM t WHERE id = " + id);'],
      [
        'sec/insecure-deserialization',
        'ObjectInputStream in = new ObjectInputStream(socket.getInputStream());',
      ],
      [
        'sec/tls-verification-disabled',
        'builder.setHostnameVerifier(NoopHostnameVerifier.INSTANCE);',
      ],
    ],
    safe: [
      'Runtime.getRuntime().exec("ls");',
      'conn.prepareStatement("SELECT * FROM t WHERE id = ?");',
      '// new ObjectInputStream(in)',
    ],
  },
  {
    language: 'kotlin',
    bad: [
      ['sec/unsafe-dynamic-exec', 'ProcessBuilder("sh", "-c", cmd).start()'],
      ['sec/sql-injection', 'stmt.executeQuery("SELECT * FROM t WHERE id = $id")'],
    ],
    safe: ['ProcessBuilder("git", "status").start()'],
  },
  {
    language: 'csharp',
    bad: [
      ['sec/unsafe-dynamic-exec', 'Process.Start("cmd.exe", "/c " + input);'],
      ['sec/sql-injection', 'var c = new SqlCommand($"SELECT * FROM t WHERE id = {id}", conn);'],
      ['sec/sql-injection', 'ctx.Users.FromSqlRaw($"SELECT * FROM Users WHERE Name = {name}");'],
      ['sec/insecure-deserialization', 'var f = new BinaryFormatter();'],
      [
        'sec/tls-verification-disabled',
        'handler.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;',
      ],
    ],
    safe: [
      'var c = new SqlCommand("SELECT * FROM t WHERE id = @id", conn);',
      'Process.Start("notepad.exe");',
    ],
  },
  {
    language: 'php',
    bad: [
      ['sec/unsafe-dynamic-exec', 'system($_GET["cmd"]);'],
      ['sec/unsafe-dynamic-exec', 'eval($code);'],
      ['sec/sql-injection', 'mysqli_query($db, "SELECT * FROM t WHERE id = $id");'],
      ['sec/insecure-deserialization', '$o = unserialize($_COOKIE["d"]);'],
      ['sec/tls-verification-disabled', 'curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);'],
    ],
    safe: ['$stmt = $db->prepare("SELECT * FROM t WHERE id = :id");', '// eval($code);'],
  },
  {
    language: 'ruby',
    bad: [
      ['sec/unsafe-dynamic-exec', 'eval(params[:code])'],
      ['sec/unsafe-dynamic-exec', 'system("ls #{dir}")'],
      ['sec/sql-injection', 'User.where("name = \'#{name}\'")'],
      ['sec/insecure-deserialization', 'obj = Marshal.load(data)'],
      ['sec/tls-verification-disabled', 'http.verify_mode = OpenSSL::SSL::VERIFY_NONE'],
    ],
    safe: ['User.where(name: name)', 'system("ls", dir)', 'cfg = YAML.safe_load(data)'],
  },
  {
    language: 'swift',
    bad: [
      ['sec/unsafe-dynamic-exec', 'p.launchPath = "/bin/sh"'],
      ['sec/unsafe-dynamic-exec', 'p.arguments = ["-c", "rm -rf " + k]'],
      ['sec/sql-injection', 'let q = "SELECT * FROM t WHERE id = \\(id)"'],
      ['sec/insecure-deserialization', 'let o = NSKeyedUnarchiver.unarchiveObject(with: data)'],
      [
        'sec/tls-verification-disabled',
        'completionHandler(.useCredential, URLCredential(trust: trust))',
      ],
    ],
    safe: ['let q = "SELECT * FROM t WHERE id = ?"', 'p.launchPath = "/usr/bin/git"'],
  },
  {
    language: 'c',
    bad: [
      ['sec/unsafe-dynamic-exec', 'system(cmd);'],
      ['sec/unsafe-memory-api', 'strcpy(buf, argv[1]);'],
      ['sec/unsafe-memory-api', 'gets(line);'],
      ['sec/unsafe-memory-api', 'scanf("%s", name);'],
      ['sec/tls-verification-disabled', 'curl_easy_setopt(h, CURLOPT_SSL_VERIFYPEER, 0L);'],
    ],
    safe: [
      'system("clear");',
      'snprintf(buf, sizeof buf, "%s", s);',
      'fgets(line, sizeof line, stdin);',
    ],
  },
  {
    language: 'shell',
    bad: [
      ['sec/unsafe-dynamic-exec', 'eval "$USER_INPUT"'],
      ['sec/unsafe-dynamic-exec', 'curl -s https://example.com/install | sudo bash'],
      ['sec/tls-verification-disabled', 'curl -k https://example.com/data'],
    ],
    safe: ['curl -fsSL https://example.com/data -o data', '# eval "$X"'],
  },
];

describe('security-ast-scan language profiles', () => {
  for (const c of CASES) {
    describe(c.language, () => {
      for (const [ruleId, code] of c.bad) {
        it(`flags ${ruleId}: ${code}`, () => {
          expect(scan(c.language, code)).toContain(ruleId);
        });
      }
      for (const code of c.safe) {
        it(`stays quiet on: ${code}`, () => {
          expect(scan(c.language, code)).toEqual([]);
        });
      }
    });
  }

  it('resolves extensions and aliases to profiles, and leaves the rest unsupported', () => {
    expect(resolveScanLanguage('Sources/Foo.swift', undefined).id).toBe('swift');
    expect(resolveScanLanguage('a/b.kts', undefined).id).toBe('kotlin');
    expect(resolveScanLanguage('x.hpp', undefined).id).toBe('cpp');
    expect(resolveScanLanguage(undefined, 'C#').id).toBe('csharp');
    expect(resolveScanLanguage(undefined, 'golang').id).toBe('go');
    expect(resolveScanLanguage('main.zig', undefined)).toMatchObject({
      id: 'zig',
      supported: false,
    });
  });

  it('lists the rule ids a profile evaluates', () => {
    const swift = resolveScanLanguage('a.swift', undefined).profile;
    expect(swift && profileRuleIds(swift)).toEqual([
      'sec/unsafe-dynamic-exec',
      'sec/sql-injection',
      'sec/insecure-deserialization',
      'sec/tls-verification-disabled',
    ]);
  });
});

describe('security-ast-scan tool on supported non-JS languages (issue #413)', () => {
  const swift = [
    'import Foundation',
    'let k = ProcessInfo.processInfo.environment["X"]!',
    'let p = Process(); p.launchPath = "/bin/sh"; p.arguments = ["-c", "rm -rf " + k]; try! p.run()',
  ].join('\n');
  const run = (input: Parameters<typeof securityAstScanTool.execute>[0]) =>
    securityAstScanTool.execute(
      input,
      { projectRoot: process.cwd(), cwd: process.cwd() } as never,
      {
        signal: new AbortController().signal,
      },
    );

  it('detects the shell injection from the issue repro', async () => {
    const res = await run({ content: swift, language: 'swift' });
    expect(res.status).toBe('findings_detected');
    expect(res.languageSupported).toBe(true);
    expect(res.findings.some((f) => f.ruleId === 'sec/unsafe-dynamic-exec' && f.line === 3)).toBe(
      true,
    );
    expect(res.findings[0]?.file).toBe('inline-code.swift');
  });

  it('says which rules a clean result actually covered', async () => {
    const res = await run({ content: 'let x = 1', language: 'swift' });
    expect(res.status).toBe('clean');
    expect(res.rulesChecked).toEqual([
      'sec/hardcoded-secret',
      'sec/unsafe-dynamic-exec',
      'sec/sql-injection',
      'sec/insecure-deserialization',
      'sec/tls-verification-disabled',
    ]);
    expect(res.summary).toContain('checked:');
  });

  it('still scans secrets in any language', async () => {
    const res = await run({ content: 'key = "AKIAIOSFODNN7EXAMPLE"', language: 'python' });
    expect(res.findings.map((f) => f.ruleId)).toContain('sec/hardcoded-secret');
  });
});
