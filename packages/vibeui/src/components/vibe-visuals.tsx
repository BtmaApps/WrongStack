/** Small, decorative SVGs share the current palette and never carry runtime state alone. */
export function VibeMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`vibe-mark ${className}`} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        className="vibe-mark-frame"
        d="M10 5H6a1 1 0 0 0-1 1v4m17-5h4a1 1 0 0 1 1 1v4M5 22v4a1 1 0 0 0 1 1h4m12 0h4a1 1 0 0 0 1-1v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="vibe-mark-stroke"
        d="m9 12 6 10 8-13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="vibe-mark-dot" cx="23" cy="9" r="2" fill="currentColor" />
    </svg>
  );
}

export function WorkspaceArtwork() {
  return (
    <svg className="workspace-artwork" viewBox="0 0 300 240" fill="none" aria-hidden="true">
      <path
        className="art-guide"
        d="M20 64h260M20 176h260M72 20v200M228 20v200"
        stroke="currentColor"
        strokeDasharray="2 7"
      />
      <g className="art-back-panel">
        <rect
          x="91"
          y="32"
          width="150"
          height="128"
          rx="14"
          fill="var(--raised)"
          stroke="var(--border)"
        />
        <path d="M108 53h24m8 0h8" stroke="var(--faint)" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="art-main-panel">
        <rect
          x="59"
          y="70"
          width="158"
          height="132"
          rx="15"
          fill="var(--base)"
          stroke="var(--border)"
        />
        <path d="M59 99h158" stroke="var(--border)" />
        <circle cx="76" cy="85" r="2" fill="var(--accent)" />
        <circle cx="86" cy="85" r="2" fill="var(--faint)" />
        <path d="M101 85h29" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="m90 124-10 9 10 9m27-18 10 9-10 9m-10-22-7 26"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M80 165h57m-57 12h90"
          stroke="var(--border)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <path
        className="art-route"
        d="M217 135h35v-44h26M59 151H26v34H9"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle className="art-node art-node-one" cx="252" cy="135" r="4" fill="var(--accent)" />
      <circle className="art-node art-node-two" cx="26" cy="185" r="4" fill="var(--accent)" />
      <g className="art-check">
        <rect
          x="184"
          y="169"
          width="42"
          height="42"
          rx="12"
          fill="var(--raised)"
          stroke="var(--border)"
        />
        <path
          d="m196 190 6 6 12-13"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function RunSignal() {
  return (
    <svg className="run-signal" viewBox="0 0 28 24" fill="none" aria-hidden="true">
      {[5, 11, 17, 23].map((x, i) => (
        <path
          key={x}
          d={`M${x} 6v12`}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ animationDelay: `${i * -0.18}s` }}
        />
      ))}
    </svg>
  );
}

export function EmptyArtwork({
  kind,
}: {
  kind: 'activity' | 'changes' | 'tasks' | 'agents' | 'files' | 'memory' | 'providers';
}) {
  return (
    <svg className="empty-artwork" viewBox="0 0 128 96" fill="none" aria-hidden="true">
      <path d="M12 78h104M24 18h80" stroke="var(--border)" strokeDasharray="2 5" />
      <rect
        x="36"
        y="16"
        width="64"
        height="58"
        rx="10"
        fill="var(--raised)"
        stroke="var(--border)"
      />
      <rect
        x="26"
        y="25"
        width="64"
        height="58"
        rx="10"
        fill="var(--base)"
        stroke="var(--border)"
      />
      {kind === 'activity' ? (
        <path
          d="m42 44 8 7-8 7m16 0h15"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : kind === 'changes' ? (
        <path
          d="M42 44h30M42 54h22M42 64h26m-19-24v8m-4-4h8"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : kind === 'tasks' ? (
        <path
          d="m40 44 3 3 5-6m-8 15 3 3 5-6m7-9h17M55 56h13M40 68h28"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : kind === 'files' ? (
        <path
          d="M45 38h17l10 10v23H45V38Zm17 0v10h10M51 56h15m-15 7h11"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : kind === 'providers' ? (
        <g stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="51" cy="49" r="8" />
          <path d="m57 55 14 14m-6-6 5-5m-10 0 5-5" />
        </g>
      ) : kind === 'memory' ? (
        <g stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M45 41h27v28H45V41Zm6 7h15m-15 7h15m-15 7h8M40 45v28h27" />
        </g>
      ) : (
        <g stroke="var(--accent)" strokeWidth="1.6">
          <path d="M58 45v12m-13 8v-8h26v8" />
          <circle cx="58" cy="41" r="4" />
          <circle cx="45" cy="69" r="4" />
          <circle cx="71" cy="69" r="4" />
        </g>
      )}
      <circle className="empty-signal" cx="97" cy="27" r="5" fill="var(--accent)" />
      <path d="M18 43v8m-4-4h8" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function NextStepMark() {
  return (
    <svg className="next-step-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        className="step-route"
        d="M9 23v-7h14V8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="24" r="3" fill="var(--raised)" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m19 11 4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
