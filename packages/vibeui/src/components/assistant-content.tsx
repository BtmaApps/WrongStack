'use client';

import { memo, useMemo } from 'react';
import { assistantProjection } from '../lib/assistant-projection';
import { MarkdownContent } from './markdown-content';

export const AssistantContent = memo(function AssistantContent({
  text,
  showSteps,
  onPick,
  automatic,
}: {
  text: string;
  showSteps: boolean;
  onPick: (text: string) => void;
  automatic: boolean;
}) {
  const projection = useMemo(() => assistantProjection(text), [text]);
  return (
    <>
      <MarkdownContent text={projection.text} />
      {showSteps && projection.steps.length > 0 && (
        <section className="next-steps" aria-label="Next steps">
          <small>
            {automatic ? 'Follow-up suggestions · Auto is managed by the agent' : 'Continue with'}
          </small>
          {projection.steps.map((step) => (
            <button type="button" key={step.index} onClick={() => onPick(step.text)}>
              <span>{step.index}</span>
              {step.text}
            </button>
          ))}
        </section>
      )}
    </>
  );
});
