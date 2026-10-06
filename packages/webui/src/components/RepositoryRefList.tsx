import { Braces, Check, GitBranch, GitFork, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HistoryRef } from './repository-history-model';

/** Left rail: local branches, remotes, and tags as history filters. */
export function RepositoryRefList({
  refs,
  activeRef,
  onSelect,
}: {
  refs: HistoryRef[];
  activeRef: string;
  onSelect: (ref: string) => void;
}) {
  const groups = [
    { kind: 'local' as const, label: 'Local branches', icon: GitBranch },
    { kind: 'remote' as const, label: 'Remotes', icon: GitFork },
    { kind: 'tag' as const, label: 'Tags', icon: Tag },
  ];
  return (
    <aside className="hidden min-h-0 w-[218px] shrink-0 flex-col border-r border-border/70 bg-card/35 xl:flex">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Repository
        </div>
        <button
          type="button"
          onClick={() => onSelect('')}
          className={cn(
            'mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
            activeRef === ''
              ? 'bg-primary/12 text-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <Braces className="h-3.5 w-3.5" /> All branches
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {groups.map(({ kind, label, icon: Icon }) => {
          const items = refs.filter((ref) => ref.kind === kind);
          if (items.length === 0) return null;
          return (
            <section key={kind} className="mb-5">
              <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                <Icon className="h-3 w-3" /> {label}
                <span className="ml-auto font-mono">{items.length}</span>
              </div>
              {items.map((ref) => (
                <button
                  key={ref.name}
                  type="button"
                  onClick={() => onSelect(ref.name)}
                  title={ref.name}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors',
                    activeRef === ref.name
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      ref.current
                        ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary))]'
                        : 'bg-muted-foreground/45',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{ref.shortName}</span>
                  {ref.current && <Check className="h-3 w-3" />}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
