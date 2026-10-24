'use client';

import { ArrowDown, ArrowUpRight, Check, Folder, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { WorkspaceArtwork } from './vibe-visuals';

const starters = [
  {
    id: 'website',
    title: 'A beautiful website',
    detail: 'A home for your business, work or next big idea.',
    label: 'What is your website for?',
    placeholder: 'A cozy bakery with online cake orders…',
    prompt: 'Help me create a website',
    directions: ['Clean & minimal', 'Bold & colorful', 'Warm & welcoming'],
  },
  {
    id: 'app',
    title: 'A useful little app',
    detail: 'Make everyday tasks feel a little easier.',
    label: 'What should your app help people do?',
    placeholder: 'Keep track of my books and reading goals…',
    prompt: 'Help me build an easy-to-use app',
    directions: ['Simple & focused', 'Playful & friendly', 'Calm & organized'],
  },
  {
    id: 'improve',
    title: 'Make this project better',
    detail: 'Give something you already have a fresh start.',
    label: 'What would you like to improve?',
    placeholder: 'The home page feels confusing on my phone…',
    prompt: 'Help me improve this existing project',
    directions: ['Easier to use', 'More visual', 'Better on mobile'],
  },
] as const;

/** Decorative concept sketches, never presented as generated project output. */
function ConceptPreview({ kind }: { kind: string }) {
  return (
    <div className={`concept-preview concept-${kind}`} aria-hidden="true">
      {kind === 'website' ? (
        <div className="concept-browser">
          <div className="concept-browser-bar">
            <i />
            <i />
            <i />
            <span />
          </div>
          <div className="concept-site-body">
            <div>
              <span className="concept-line" />
              <b>
                Ideas
                <br />
                come alive.
              </b>
              <span className="concept-cta" />
            </div>
            <div className="concept-sculpture">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      ) : kind === 'app' ? (
        <div className="concept-dashboard">
          <div className="concept-dashboard-side">
            <i />
            <i />
            <i />
          </div>
          <div className="concept-dashboard-main">
            <span className="concept-line" />
            <div className="concept-metrics">
              <i />
              <i />
              <i />
            </div>
            <div className="concept-chart">
              {[35, 62, 45, 80, 57, 93, 74].map((height, index) => (
                <i key={height} style={{ height: `${height}%`, opacity: 0.4 + index * 0.08 }} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="concept-transformation">
          <div className="concept-before">
            <i />
            <i />
            <i />
            <i />
          </div>
          <ArrowUpRight size={22} />
          <div className="concept-after">
            <span />
            <i />
            <i />
            <b>
              <Check size={12} />
            </b>
          </div>
        </div>
      )}
    </div>
  );
}

export function StartSpace({
  project,
  canPrepare,
  needsProvider,
  onPrepare,
  onConnect,
}: {
  project: string;
  canPrepare: boolean;
  needsProvider: boolean;
  onPrepare: (text: string) => void;
  onConnect: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [idea, setIdea] = useState('');
  const [direction, setDirection] = useState('');
  const starter = starters[selected]!;
  return (
    <div className="welcome launchpad">
      <div className="launch-hero">
        <div className="launch-intro">
          <div className="launch-kicker">
            <span />
            <span>SMALL IDEAS. REAL POSSIBILITIES.</span>
          </div>
          <h1>
            What are we building<span className="launch-title-accent"> today?</span>
          </h1>
          <p>
            You bring the idea. We’ll help with the how.
            <br />
            No technical vocabulary required.
          </p>
        </div>
        <div className="launch-orbit" aria-hidden="true">
          <div className="orbit-ring" />
          <div className="orbit-ring orbit-ring-two" />
          <WorkspaceArtwork />
          <span className="orbit-caption">
            <Sparkles size={12} /> From “what if” to “here it is”
          </span>
        </div>
      </div>
      <div className="launch-section-heading">
        <h2>Pick a starting point</h2>
        <span>Or just write your own idea below</span>
      </div>
      <fieldset className="concept-grid" aria-label="Choose a starting point">
        {starters.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`concept-card ${selected === index ? 'is-selected' : ''}`}
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setDirection('');
            }}
          >
            <ConceptPreview kind={item.id} />
            <div className="concept-card-copy">
              <span className="concept-card-title">
                <strong>{item.title}</strong>
                <span className="concept-choice">
                  {selected === index ? <Check size={12} /> : <ArrowUpRight size={13} />}
                </span>
              </span>
              <small>{item.detail}</small>
            </div>
          </button>
        ))}
      </fieldset>
      <form
        className="idea-builder"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canPrepare) return;
          const brief = [
            starter.prompt,
            idea.trim() ? `: ${idea.trim()}` : '.',
            direction ? `\nDirection: ${direction}.` : '',
            '\nFirst, ask me a few simple questions to understand what I need. Explain your suggestions in everyday language and agree on a small first step with me before changing files.',
          ].join('');
          onPrepare(brief);
        }}
      >
        <div className="idea-builder-heading">
          <span className="idea-step">YOUR IDEA, IN YOUR WORDS</span>
          <span>Make it yours</span>
        </div>
        <label htmlFor="project-idea">
          {starter.label} <span>(optional)</span>
        </label>
        <input
          id="project-idea"
          value={idea}
          maxLength={1600}
          onChange={(event) => setIdea(event.target.value)}
          placeholder={starter.placeholder}
        />
        <fieldset className="idea-directions" aria-label="Choose a direction">
          {starter.directions.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={direction === item}
              onClick={() => setDirection(direction === item ? '' : item)}
            >
              {direction === item && <Check size={12} />}
              {item}
            </button>
          ))}
        </fieldset>
        <div className="idea-builder-footer">
          <p>
            <Sparkles size={13} /> A starting point you can edit before sending.
          </p>
          <button type="submit" className="primary-button" disabled={!canPrepare}>
            Add to my message <ArrowDown size={14} />
          </button>
        </div>
        {!canPrepare && (
          <p className="idea-availability" role="status">
            Your starting point will be available when the conversation finishes loading.
          </p>
        )}
      </form>
      <div className="launch-footer">
        <span>
          <Folder size={13} />
          {project || 'Waiting for your workspace'}
        </span>
        <span>Describe it. Shape it. Make it happen.</span>
      </div>
      {needsProvider && (
        <div className="launch-connect">
          <span>One more step: connect an AI account to start creating.</span>
          <button type="button" className="primary-button" onClick={onConnect}>
            Connect your first provider <ArrowUpRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
