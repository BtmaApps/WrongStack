import { checkJevJudgments } from '@wrongstack/runtime/jev-checks';
import type { SubcommandDeps } from '../contracts.js';

export async function checkJudgments(
  deps: SubcommandDeps,
  write: (line: string) => void,
): Promise<number> {
  try {
    const report = await checkJevJudgments(deps.config);
    let feature = '';
    for (const result of report.cases) {
      if (feature !== result.feature) {
        feature = result.feature;
        write(feature);
      }
      write(
        `${result.ok ? '✓' : '✗'} ${result.name} (${result.ms}ms) — expected ${result.expected}, got ${result.actual}${result.note ? ` [${result.note}]` : ''}`,
      );
    }
    write(
      `${report.passed}/${report.total} as expected — ${report.route} route, model ${report.model}`,
    );
    return report.passed === report.total ? 0 : 1;
  } catch {
    write('Jev checks unavailable. Configure an account with wstack typesafe login.');
    return 2;
  }
}
