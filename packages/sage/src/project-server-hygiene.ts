/**
 * Hygiene runner for the SAGE project server: an `automatic` request is
 * served from the last report for {@link AUTO_HYGIENE_INTERVAL_MS} and
 * single-flighted; an explicit request always runs.
 */
import type { CompleteSageStore } from './project-server-options.js';
import type { SageServerOperations } from './project-server-protocol.js';

const AUTO_HYGIENE_INTERVAL_MS = 60 * 60_000;

export interface ProjectServerHygieneRunner {
  run(
    args: SageServerOperations['hygiene']['args'],
  ): Promise<SageServerOperations['hygiene']['result']>;
  /** True while an automatic pass is running (heap-watchdog stats). */
  automaticInFlight(): boolean;
}

export function createHygieneRunner(store: CompleteSageStore): ProjectServerHygieneRunner {
  let lastAutomaticHygieneAt = 0;
  let lastAutomaticHygieneReport: SageServerOperations['hygiene']['result'] | undefined;
  let automaticHygieneInFlight: Promise<SageServerOperations['hygiene']['result']> | undefined;
  return {
    automaticInFlight: () => automaticHygieneInFlight !== undefined,
    async run(args) {
      if (args.automatic) {
        const now = Date.now();
        if (lastAutomaticHygieneReport && now - lastAutomaticHygieneAt < AUTO_HYGIENE_INTERVAL_MS) {
          return lastAutomaticHygieneReport;
        }
        if (automaticHygieneInFlight) return automaticHygieneInFlight;
        automaticHygieneInFlight = store
          .hygiene(args.options)
          .then((report) => {
            lastAutomaticHygieneAt = Date.now();
            lastAutomaticHygieneReport = report;
            return report;
          })
          .finally(() => {
            automaticHygieneInFlight = undefined;
          });
        return automaticHygieneInFlight;
      }
      return store.hygiene(args.options);
    },
  };
}
