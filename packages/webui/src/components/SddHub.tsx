import { type KeyboardEvent, useCallback, useEffect } from 'react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { showPanel } from '@/lib/view-navigation';
import { type SddTab, useSddWizardStore } from '@/stores';
import { RequirementIntakeView } from './RequirementIntakeView';
import { SddBoardView } from './SddBoardView';
import { SddWizard } from './SddWizard';
import { SpecsView } from './SpecsView';

const TABS: { id: SddTab; labelKey: string }[] = [
  { id: 'requirements', labelKey: 'activity:sddhub.tabRequirements' },
  { id: 'project', labelKey: 'activity:sddhub.tabProject' },
  { id: 'board', labelKey: 'activity:sddhub.tabBoard' },
  { id: 'specs', labelKey: 'activity:sddhub.tabSpecs' },
];

/**
 * SddHub — unified tabbed container for the entire spec-driven workflow:
 * Requirements Intake → New SDD Project / Wizard → Live Board → Specifications.
 * Each tab renders its respective component without unmounting sibling tabs.
 *
 * Listens for `sdd.run.started` (via the wizard store) so a run kicked off
 * from Specs, Kanban, or the Project tab always flips to the Live Board.
 */
export function SddHub(): React.ReactElement {
  const { t } = useAppTranslation();
  const activeTab = useSddWizardStore((s) => s.activeHubTab);
  const setActiveTab = useSddWizardStore((s) => s.setActiveHubTab);
  const setPrefilledGoal = useSddWizardStore((s) => s.setPrefilledGoal);
  const startedRunId = useSddWizardStore((s) => s.startedRunId);
  const setStartedRunId = useSddWizardStore((s) => s.setStartedRunId);

  const onClose = () => showPanel('chat');
  const showBoard = useCallback(() => setActiveTab('board'), [setActiveTab]);

  // Any surface that starts an SDD run sets startedRunId — flip to Board once.
  useEffect(() => {
    if (!startedRunId) return;
    setActiveTab('board');
    setStartedRunId(null);
  }, [startedRunId, setStartedRunId]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = TABS[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {/* ── Tab bar ── */}
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex shrink-0 items-end border-b border-border/70 bg-card px-4"
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`sdd-hub-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`sdd-hub-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(tab.labelKey)}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Keep every panel mounted so switching tabs does not discard draft or run configuration state. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          id="sdd-hub-panel-requirements"
          role="tabpanel"
          aria-labelledby="sdd-hub-tab-requirements"
          hidden={activeTab !== 'requirements'}
          className="h-full overflow-hidden"
        >
          <RequirementIntakeView
            onStartSdd={async (intake) => {
              try {
                const res = await fetch(
                  `/api/requirement-intakes/${encodeURIComponent(intake.id)}`,
                );
                if (res.ok) {
                  const data = (await res.json()) as {
                    record?: { originalRequest?: string; title?: string };
                  };
                  setPrefilledGoal(data.record?.originalRequest || intake.title);
                } else {
                  setPrefilledGoal(intake.title);
                }
              } catch {
                setPrefilledGoal(intake.title);
              }
              setActiveTab('project');
            }}
          />
        </div>
        <div
          id="sdd-hub-panel-project"
          role="tabpanel"
          aria-labelledby="sdd-hub-tab-project"
          hidden={activeTab !== 'project'}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <SddWizard onClose={onClose} onRunStarted={showBoard} />
        </div>
        <div
          id="sdd-hub-panel-board"
          role="tabpanel"
          aria-labelledby="sdd-hub-tab-board"
          hidden={activeTab !== 'board'}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <SddBoardView onClose={onClose} />
        </div>
        <div
          id="sdd-hub-panel-specs"
          role="tabpanel"
          aria-labelledby="sdd-hub-tab-specs"
          hidden={activeTab !== 'specs'}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <SpecsView onClose={onClose} onRunStarted={showBoard} />
        </div>
      </div>
    </div>
  );
}
