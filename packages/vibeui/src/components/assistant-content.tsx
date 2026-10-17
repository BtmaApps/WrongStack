'use client';
import { ArrowUpRight, Pencil, Timer } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { assistantProjection } from '../lib/assistant-projection';
import { MarkdownContent } from './markdown-content';
import { NextStepMark } from './vibe-visuals';
export const AssistantContent = memo(function AssistantContent({
  text,
  showSteps,
  onPick,
  onSubmit,
  automatic,
  autoDelayMs = 15000,
}: {
  text: string;
  showSteps: boolean;
  onPick: (text: string) => void;
  onSubmit: (text: string, auto?: boolean) => boolean;
  automatic: boolean;
  autoDelayMs?: number;
}) {
  const projection = useMemo(() => assistantProjection(text), [text]);
  const [selected, setSelected] = useState<number[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const fired = useRef(false);
  const previousAutomatic = useRef(automatic);
  useEffect(() => {
    if (previousAutomatic.current && !automatic) setCancelled(true);
    previousAutomatic.current = automatic;
  }, [automatic]);
  const latest = useRef({ onSubmit, automatic, showSteps });
  latest.current = { onSubmit, automatic, showSteps };
  const autoText = projection.steps[0]?.auto ? projection.steps[0].text : '';
  useEffect(() => {
    if (!automatic || !showSteps || !autoText || cancelled || fired.current) {
      setRemaining(null);
      return;
    }
    const delay = Math.max(
      1000,
      Math.min(300000, Number.isFinite(autoDelayMs) ? autoDelayMs : 15000),
    );
    const deadline = Date.now() + delay;
    setRemaining(Math.ceil(delay / 1000));
    const cancel = () => {
      setCancelled(true);
      setRemaining(null);
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') cancel();
    };
    document.addEventListener('visibilitychange', visibility);
    const interval = setInterval(
      () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      250,
    );
    const timer = setTimeout(() => {
      if (
        !latest.current.automatic ||
        !latest.current.showSteps ||
        document.visibilityState !== 'visible' ||
        fired.current
      )
        return;
      fired.current = true;
      setRemaining(null);
      latest.current.onSubmit(autoText, true);
    }, delay);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [automatic, showSteps, autoText, autoDelayMs, cancelled]);
  const submit = (value: string) => {
    setCancelled(true);
    if (onSubmit(value)) setSelected([]);
  };
  return (
    <>
      <MarkdownContent text={projection.text} />
      {showSteps && projection.steps.length > 0 && (
        <section className="next-steps" aria-label="Next steps">
          <header>
            <span className="next-step-emblem">
              <NextStepMark />
            </span>
            <div>
              <strong>Next steps</strong>
              <small>Select one or more, then submit directly</small>
            </div>
            <span className="next-step-total">{projection.steps.length}</span>
          </header>
          {remaining !== null && (
            <div className="next-step-countdown" role="status">
              <Timer size={14} /> Auto-submit in {remaining}s
              <button
                type="button"
                onClick={() => {
                  setCancelled(true);
                  setRemaining(null);
                }}
              >
                Cancel auto-submit
              </button>
            </div>
          )}
          {projection.steps.map((step) => (
            <div className="next-step-row" key={step.index}>
              <input
                type="checkbox"
                aria-label={`Select step ${step.index}: ${step.text}`}
                checked={selected.includes(step.index)}
                onChange={(event) => {
                  setCancelled(true);
                  setSelected((values) =>
                    event.target.checked
                      ? [...values, step.index]
                      : values.filter((value) => value !== step.index),
                  );
                }}
              />
              <button
                type="button"
                className="next-step-submit"
                onClick={() => submit(step.text)}
                title="Submit this step directly"
              >
                <span>{step.index}</span>
                {step.text}
                <ArrowUpRight size={14} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Edit step ${step.index} in composer`}
                title="Edit in composer"
                onClick={() => {
                  setCancelled(true);
                  onPick(step.text);
                }}
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
          <footer>
            <span>
              {selected.length ? `${selected.length} selected` : 'Your draft stays unchanged'}
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={!selected.length}
              onClick={() =>
                submit(
                  projection.steps
                    .filter((step) => selected.includes(step.index))
                    .map((step, i) => `${i + 1}. ${step.text}`)
                    .join('\n'),
                )
              }
            >
              Submit selected
            </button>
          </footer>
        </section>
      )}
    </>
  );
});
