/** Versioned, bounded execution evidence. Completion alone is never a test verdict. */
export interface AutomationResult {
  version: 1;
  agentStatus: string | null;
  sessionId: string | null;
  finalText: string | null;
  durationMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    iterations: number | null;
    costUsd: number | null;
    costSource: 'catalog-estimate' | 'unknown';
  };
  changedFiles: string[];
  changedFilesTruncated: boolean;
  validation: { status: 'not-verified'; evidence: Array<'output.log' | 'changes.patch'> };
}

export function buildAutomationResult(
  output: string,
  patch: string | null,
  durationMs: number,
): AutomationResult {
  let payload: Record<string, unknown> = {};
  for (const line of output.split('\n').reverse()) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      if (
        ['done', 'completed', 'failed', 'aborted', 'max_iterations'].includes(
          String(record['status']),
        )
      ) {
        payload = record;
        break;
      }
    } catch {
      break;
    }
  }
  const usage =
    payload['usage'] && typeof payload['usage'] === 'object'
      ? (payload['usage'] as Record<string, unknown>)
      : {};
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const files = new Set<string>();
  for (const line of (patch ?? '').split('\n')) {
    if (!line.startsWith('+++ ') && !line.startsWith('--- ')) continue;
    let raw = line.slice(4);
    if (raw.startsWith('"') && raw.endsWith('"')) {
      const bytes: Buffer[] = [];
      for (let i = 1; i < raw.length - 1; i++) {
        if (raw[i] === '\\' && /[0-7]{3}/.test(raw.slice(i + 1, i + 4))) {
          bytes.push(Buffer.from([Number.parseInt(raw.slice(i + 1, i + 4), 8)]));
          i += 3;
        } else if (raw[i] === '\\' && i + 1 < raw.length - 1) {
          const escaped = raw[++i]!;
          bytes.push(
            Buffer.from(
              ({ t: '\t', n: '\n', r: '\r', '\\': '\\', '"': '"' } as Record<string, string>)[
                escaped
              ] ?? escaped,
            ),
          );
        } else bytes.push(Buffer.from(raw[i]!));
      }
      raw = Buffer.concat(bytes).toString('utf8');
    }
    if (!raw.startsWith('a/') && !raw.startsWith('b/')) continue;
    const file = raw.slice(2);
    if (file.length <= 4096 && !/[\x00-\x1f\x7f]/.test(file)) files.add(file);
  }
  const costSource = usage['costSource'] === 'catalog-estimate' ? 'catalog-estimate' : 'unknown';
  return {
    version: 1,
    agentStatus: typeof payload['status'] === 'string' ? payload['status'] : null,
    sessionId: typeof payload['sessionId'] === 'string' ? payload['sessionId'].slice(0, 256) : null,
    finalText:
      typeof payload['finalText'] === 'string' ? payload['finalText'].slice(0, 16_384) : null,
    durationMs: Math.max(0, Math.round(durationMs)),
    usage: {
      inputTokens: number(usage['input']),
      outputTokens: number(usage['output']),
      iterations: number(usage['iterations']),
      costUsd: costSource === 'catalog-estimate' ? number(usage['cost']) : null,
      costSource,
    },
    changedFiles: [...files].slice(0, 200),
    changedFilesTruncated: files.size > 200,
    validation: {
      status: 'not-verified',
      evidence: patch === null ? ['output.log'] : ['output.log', 'changes.patch'],
    },
  };
}
