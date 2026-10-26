import type { UserInputPayload } from '@wrongstack/core/agent';
import { PROMPT_JOURNAL_RAW_MARKER, recordPromptJournalEntry } from '@wrongstack/core/prompts';

export const STANDALONE_JOURNAL_ORIGIN = 'standalonePromptJournalOrigin';

/** Standalone sessions use Core's journal writer, just as CLI-hosted sessions do. */
export function createStandalonePromptJournalRecorder() {
  const systems = new Set<string>();
  return {
    name: 'StandalonePromptJournalRecorder',
    async handler(
      payload: UserInputPayload,
      next: (value: UserInputPayload) => Promise<UserInputPayload>,
    ): Promise<UserInputPayload> {
      const ctx = payload.ctx;
      const original = ctx.meta[PROMPT_JOURNAL_RAW_MARKER];
      const origin = ctx.meta[STANDALONE_JOURNAL_ORIGIN];
      delete ctx.meta[PROMPT_JOURNAL_RAW_MARKER];
      delete ctx.meta[STANDALONE_JOURNAL_ORIGIN];
      if (origin === 'runtime' || !ctx.projectRoot || !payload.text.trim()) return next(payload);
      const sessionId = ctx.session?.id ?? ctx.activeRunSessionId ?? 'general';
      const common = {
        projectRoot: ctx.projectRoot,
        sessionId,
        model: ctx.model,
        provider: ctx.provider?.id,
      };
      const refined = typeof original === 'string' && original !== payload.text;
      // Core owns credential scrubbing, storage layout and nonfatal journal I/O.
      void recordPromptJournalEntry({
        ...common,
        category: refined ? 'refined_user' : 'raw_user',
        content: payload.text,
        ...(refined ? { rawContent: original } : {}),
      }).catch(() => {});
      if (!systems.has(sessionId)) {
        systems.add(sessionId);
        const text = (ctx.systemPrompt ?? [])
          .map((block) => block.text)
          .join('\n')
          .trim();
        if (text)
          void recordPromptJournalEntry({
            ...common,
            role: 'system',
            category: 'system_prompt',
            content: text,
          }).catch(() => {});
      }
      return next(payload);
    },
  };
}
