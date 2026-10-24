'use client';

import {
  ArrowRight,
  Compass,
  FileDiff,
  ImagePlus,
  MessageSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { Modal } from './dialogs';

export function GettingStarted({
  open,
  onOpenChange,
  onFocus,
  onChanges,
  onSettings,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onFocus: () => void;
  onChanges: () => void;
  onSettings: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="A little help getting started"
      description="You don’t need to know how to code to have a good idea."
      icon={<Compass size={20} />}
    >
      <div className="getting-started">
        <div className="guide-lead">
          <SparkleScene />
          <p>
            Think of this as a conversation
            <br />
            <strong>with your creative team.</strong>
          </p>
        </div>
        <ol className="guide-steps">
          <li>
            <span>01</span>
            <div>
              <strong>Tell us what you have in mind</strong>
              <p>
                Who is it for? What should it do? A sentence is enough. If you’re unsure, ask for
                ideas.
              </p>
            </div>
            <MessageSquare size={20} />
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Show the feeling you’re after</strong>
              <p>
                Attach a screenshot with the image button, or say “warmer colors” or “easier to use
                on my phone”.
              </p>
            </div>
            <ImagePlus size={20} />
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Review, then keep shaping</strong>
              <p>
                Follow progress in Tasks. Open Changes to review edited files, then ask for another
                improvement. You can stop a running task from the message area.
              </p>
            </div>
            <FileDiff size={20} />
          </li>
        </ol>
        <div className="guide-example">
          <span>TRY SOMETHING LIKE</span>
          <p>
            “I’d like a welcoming website for my flower shop. Help me figure out what it needs.”
          </p>
        </div>
        <div className="guide-actions">
          <button type="button" className="secondary-button" onClick={onSettings}>
            <SlidersHorizontal size={14} /> Adjust my experience
          </button>
          <button type="button" className="secondary-button" onClick={onChanges}>
            <FileDiff size={14} /> See changes
          </button>
          <button type="button" className="primary-button" onClick={onFocus}>
            Let’s make something <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SparkleScene() {
  return (
    <div className="guide-scene" aria-hidden="true">
      <span>✦</span>
      <span>✧</span>
      <span>✦</span>
    </div>
  );
}
