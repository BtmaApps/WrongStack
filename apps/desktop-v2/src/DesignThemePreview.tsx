import type { CSSProperties } from 'react';

export function DesignThemePreview({
  tokens,
  label,
  compact = false,
}: {
  tokens: Record<string, string>;
  label: string;
  compact?: boolean;
}) {
  const style: CSSProperties = {
    backgroundColor: tokens['bg'] ?? '#ffffff',
    color: tokens['fg'] ?? '#18181b',
    fontFamily: tokens['font-sans'] ?? tokens['fontSans'] ?? 'inherit',
    '--design-surface': tokens['surface'] ?? tokens['bg'] ?? '#ffffff',
    '--design-muted': tokens['muted'] ?? tokens['fg'] ?? '#666666',
    '--design-primary': tokens['primary'] ?? '#2563eb',
    '--design-accent': tokens['accent'] ?? tokens['primary'] ?? '#2563eb',
    '--design-border': tokens['border'] ?? '#dddddd',
    '--design-radius': tokens['radius-md'] ?? tokens['radius'] ?? '8px',
    '--design-display': tokens['font-display'] ?? tokens['fontSans'] ?? 'inherit',
    '--design-space': tokens['space-4'] ?? '16px',
    '--design-shadow': tokens['shadow-2'] ?? tokens['shadow'] ?? 'none',
  } as CSSProperties;
  return (
    <div
      className={`design-theme-preview ${compact ? 'design-preview-compact' : ''}`}
      style={style}
      role="img"
      aria-label={`${label} theme sample`}
    >
      <div className="design-preview-top">
        <span className="design-preview-brand">
          <i />
          <i />
          <i />
        </span>
        <small>{label}</small>
        <span className="design-preview-avatar" />
      </div>
      <div className="design-preview-body">
        <aside aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </aside>
        <div className="design-preview-canvas">
          <span className="design-preview-overline">YOUR NEXT IDEA</span>
          <h3>
            Make room
            <br />
            for great work.
          </h3>
          <p>A quiet place to focus, create and move forward.</p>
          <div className="design-preview-actions">
            <span>
              Start creating <b>↗</b>
            </span>
            <small>Explore</small>
          </div>
          <div className="design-preview-content">
            <div className="design-preview-chart" aria-hidden="true">
              {[28, 45, 36, 65, 52, 84, 72, 100].map((height, i) => (
                <i key={i} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="design-preview-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </div>
      <footer>
        <span>THEME SAMPLE</span>
        <div>
          {['primary', 'accent', 'fg', 'surface'].map((key) => (
            <i key={key} style={{ backgroundColor: tokens[key] }} title={key} />
          ))}
        </div>
      </footer>
    </div>
  );
}
