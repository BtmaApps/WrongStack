import type { ParsedNextStep } from '@wrongstack/webui-protocol';
import { Lightbulb, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import './next-steps.css';

/** Suggestions come only from the engine's completed turn, never generated locally. */
export function NextStepsPanel({
  steps,
  onAdd,
}: {
  steps: readonly ParsedNextStep[];
  onAdd: (text: string) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    setSelected([]);
  }, [steps]);
  return (
    <details className="next-steps-panel">
      <summary>
        <Lightbulb size={14} /> Suggested next steps <small>{steps.length}</small>
      </summary>
      <div className="next-steps-body">
        <p>Choose suggestions to add to your draft. You can edit them and choose how to send.</p>
        {steps.map((step) => (
          <label key={step.index} className="next-step">
            <input
              type="checkbox"
              checked={selected.includes(step.index)}
              onChange={(event) =>
                setSelected((old) =>
                  event.target.checked
                    ? [...old, step.index]
                    : old.filter((id) => id !== step.index),
                )
              }
            />
            <span>{step.text}</span>
          </label>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={!selected.length}
          onClick={() => {
            onAdd(
              steps
                .filter((step) => selected.includes(step.index))
                .map((step) => step.text)
                .join('\n'),
            );
            setSelected([]);
          }}
        >
          <Plus size={13} /> Add selected to draft
        </button>
      </div>
    </details>
  );
}
