'use client';

import { CircleAlert } from 'lucide-react';
import { useRef } from 'react';
import { stopAllPrompt } from '../lib/stop-all-prompt';
import { Modal } from './dialogs';

export function StopAllDialog({
  open,
  leaderRunning,
  agentNames,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leaderRunning: boolean;
  agentNames: readonly string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const prompt = stopAllPrompt(leaderRunning, agentNames);
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
      title={prompt.title}
      description={prompt.body}
      icon={<CircleAlert size={20} />}
      initialFocusRef={confirmRef}
    >
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Keep working
        </button>
        <button
          ref={confirmRef}
          type="button"
          className="secondary-button danger-button"
          onClick={onConfirm}
        >
          Stop all
        </button>
      </div>
    </Modal>
  );
}
