/**
 * `/memory doctor [--fix[=<ids>]]` — the SAGE health report and its repairs,
 * rendered by the same formatter as `wstack sage doctor`.
 */
import { toErrorMessage } from '@wrongstack/core/utils';
import {
  formatSageDoctorReport,
  parseDoctorFixArg,
  type SageSurface,
  sageHygieneOptionsFromConfig,
  suggestedDoctorFixes,
} from '@wrongstack/sage';
import type { SlashCommandContext } from './command-context.js';

function fixArgFrom(rest: readonly string[]): string | true | undefined {
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith('--fix=')) return arg.slice('--fix='.length);
    if (arg === '--fix') {
      const next = rest[i + 1];
      return next !== undefined && !next.startsWith('--') ? next : true;
    }
  }
  return undefined;
}

export async function runMemoryDoctor(
  opts: SlashCommandContext,
  surface: SageSurface | undefined,
  rest: readonly string[],
): Promise<{ message: string }> {
  if (!surface?.doctor) return { message: 'SAGE doctor requires a SAGE memory store.' };
  try {
    const requested = parseDoctorFixArg(fixArgFrom(rest));
    // Not every surface rendering this command carries a config store; the
    // hygiene repair then runs with the store's defaults.
    const config = (opts.configStore as typeof opts.configStore | undefined)?.get?.();
    const hygieneOptions = sageHygieneOptionsFromConfig(config?.Sage?.hygiene);
    let report = await surface.doctor({ hygieneOptions });
    if (!report?.checks) {
      return {
        message:
          'The running SAGE daemon predates `doctor`; it restarts once every session for this project closes.',
      };
    }
    if (requested !== undefined) {
      const fix = requested === 'suggested' ? suggestedDoctorFixes(report) : requested;
      if (fix.length > 0) report = await surface.doctor({ fix, hygieneOptions });
    }
    return { message: formatSageDoctorReport(report) };
  } catch (error) {
    return { message: `SAGE doctor failed: ${toErrorMessage(error)}` };
  }
}
