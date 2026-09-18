import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from '../ink.js';
import { theme } from '../theme.js';
import { glyphs } from '../ui-glyphs.js';
import { wrapRefinementPreview } from './enhance-panel.js';

type RefineCountdownDecision = 'proceed' | 'skip' | 'cancel';

interface RefineCountdownPanelProps {
  /** The user's just-submitted message. */
  original: string;
  /** Grace period, in seconds, before the refiner call starts. */
  seconds: number;
  /** Called once with the chosen action (keypress or countdown expiry). */
  onDecision: (decision: RefineCountdownDecision) => void;
  /** Provider id of the model that will run the refinement (e.g. "openai"). */
  providerId?: string | undefined;
  /** Model name that will run the refinement (e.g. "gpt-4o"). */
  model?: string | undefined;
}

/**
 * Pre-refine grace countdown ("about to refine — last chance to bail").
 *
 * Shown for the window between submit and the refiner's first LLM call:
 * Enter starts refining immediately, Backspace/Delete or Esc cancels back
 * to the composer (the submitted text is restored as the draft), any other
 * key sends the message unchanged (skip), and expiry proceeds into the
 * normal refine flow. Mirrors the
 * WebUI/SimpleUI RefinePanel's 'countdown' face.
 */
export function RefineCountdownPanel({
  original,
  seconds,
  onDecision,
  providerId,
  model,
}: RefineCountdownPanelProps): React.ReactElement {
  const [remaining, setRemaining] = useState(Math.max(1, seconds));
  const resolvedRef = useRef(false);
  const onDecisionRef = useRef(onDecision);
  useEffect(() => {
    onDecisionRef.current = onDecision;
  }, [onDecision]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            onDecisionRef.current('proceed');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(id);
      // The caller is blocked on this panel's promise. Anything that unmounts
      // it without a decision — /clear, closeAllPanels, a newer countdown
      // superseding this one — would otherwise leave that submit awaiting a
      // resolve nobody can call again. Cancel restores the draft and ends the
      // turn instead of hanging it.
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        onDecisionRef.current('cancel');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((input, key) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    // Backspace/Delete is the "oops, let me edit that" key: like Esc it
    // cancels the turn, which puts the submitted text back in the composer.
    // Without this it fell into the any-key branch and SENT the message
    // as-is — the opposite of what the keystroke means. Some terminals
    // deliver DEL/BS as raw bytes without the key flag, so check both.
    const isBackspace = key.backspace || key.delete || input === '\x7f' || input === '\b';
    if (key.escape || isBackspace) onDecision('cancel');
    else if (key.return) onDecision('proceed');
    else onDecision('skip');
  });

  const preview = wrapRefinementPreview(original, 60, 2);

  return (
    <Box
      alignSelf="stretch"
      width="100%"
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Box height={1}>
        <Text color={theme.brand} bold>
          {glyphs.brain} PROMPT REFINER
        </Text>
        {providerId && model ? (
          <Text color={theme.textMuted}>
            {' '}
            on {providerId}/{model}
          </Text>
        ) : null}
        <Box flexGrow={1} />
        <Text color={theme.brand}>refining in {remaining}s…</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {preview.map((line, index) => (
          <Box key={`refine-countdown-preview-${index}`} height={1}>
            <Text color={theme.brand}>▎</Text>
            <Text color={theme.textSecondary}> {line}</Text>
          </Box>
        ))}
      </Box>

      <Box height={1} marginTop={1}>
        <Text color={theme.textMuted}>
          Enter refines now · Backspace edits · any key sends as-is · Esc cancels
        </Text>
      </Box>
    </Box>
  );
}
