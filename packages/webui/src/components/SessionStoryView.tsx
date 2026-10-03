import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  Clock3,
  FileCode2,
  GitFork,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { sessionModelStats } from '@/lib/session-model-stats';
import { buildSessionStory, type StoryEvent, type StoryKind } from '@/lib/session-story';
import { storyStats } from '@/lib/session-story-stats';
import { useActiveSessionId, useSessionStore } from '@/stores';
import { EMPTY_LANE, useChatLanes } from '@/stores/chat-lanes';
import { useFleetStore } from '@/stores/fleet-store';
import { useMailboxStore } from '@/stores/mailbox-store';
import { useMemoryInjectorTraceStore } from '@/stores/memory-injector-store';
import { useUIStore } from '@/stores/ui-store';
import { ModelDashboard } from './session-story/ModelDashboard';
import { ActivityPulse, StoryChart, storyTime } from './session-story/StoryChart';
import { StoryInsights } from './session-story/StoryInsights';
import { StoryStream } from './session-story/StoryStream';
import { StoryTables } from './session-story/StoryTables';
import { TeamConstellation } from './session-story/TeamConstellation';
import { useStoryHistory } from './session-story/use-story-history';
import './session-story/story-motion.css';

export function SessionStoryView() {
  const sessionId = useActiveSessionId();
  const session = useSessionStore((state) => state.session);
  const projectRoot = useSessionStore((state) => state.projectRoot);
  const running = useChatLanes((state) => state.lanes[sessionId ?? '']?.isLoading ?? false);
  const messages = useChatLanes(
    (state) => state.lanes[sessionId ?? '']?.messages ?? EMPTY_LANE.messages,
  );
  const latestRequest = [...messages].reverse().find((message) => message.role === 'user')?.content;
  const agents = useFleetStore((state) => state.agents);
  const mail = useMailboxStore((state) => state.messages);
  const traces = useMemoryInjectorTraceStore((state) => state.traces);
  const [follow, setFollow] = useState(true);
  const live =
    running ||
    [...agents.values()].some(
      (agent) => agent.sessionId === sessionId && agent.status === 'running',
    );
  const history = useStoryHistory(sessionId, follow);
  const story = useMemo(() => {
    const model = buildSessionStory(
      sessionId ?? '',
      history.events,
      [...agents.values()],
      mail,
      traces,
      projectRoot,
    );
    if (model.actors.length && session?.id === sessionId && session.startedAt > 0)
      model.start = Math.min(model.start, session.startedAt);
    return model;
  }, [sessionId, history.events, agents, mail, traces, session, projectRoot]);
  const [now, setNow] = useState(Date.now());
  const [cursor, setCursor] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [kind, setKind] = useState<StoryKind | 'all'>('all');
  const [actor, setActor] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [tab, setTab] = useState<'overview' | 'timeline' | 'models' | 'tools' | 'files' | 'team'>(
    'overview',
  );
  const [motion, setMotion] = useState(true);
  const stats = useMemo(() => storyStats(story, projectRoot), [story, projectRoot]);
  const models = useMemo(() => sessionModelStats(story), [story]);
  useEffect(() => {
    setCursor(100);
    setActor('all');
    setKind('all');
    setSearch('');
    setSelectedId(null);
    setPlaying(false);
    setLimit(50);
    setFollow(true);
    setTab('overview');
  }, [sessionId]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((previous) => {
          if (previous >= 100) {
            setPlaying(false);
            return 100;
          }
          return Math.min(100, previous + 1);
        }),
      200,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const end = Math.max(story.end, live && follow ? now : story.end);
  const span = Math.max(0, end - story.start);
  const cursorAt = story.start + (span * cursor) / 100;
  const visible = useMemo(
    () =>
      story.events
        .filter(
          (event) =>
            event.at <= cursorAt &&
            (kind === 'all' || event.kind === kind) &&
            (actor === 'all' || event.actor === actor) &&
            `${event.title} ${event.detail}`.toLowerCase().includes(search.toLowerCase()),
        )
        .reverse(),
    [story.events, cursorAt, kind, actor, search],
  );
  const selected = story.events.find((event) => event.id === selectedId);
  const selectedActor = story.actors.find(
    (item) => item.id === (actor === 'all' ? selected?.actor : actor),
  );
  const pick = (event: StoryEvent) => {
    setSelectedId(event.id);
    setPlaying(false);
  };
  const cards = [
    { label: 'Observed span', value: story.start ? storyTime(span) : '—', icon: Clock3 },
    { label: 'Team lanes', value: story.actors.length, icon: GitFork },
    { label: 'Tool calls', value: story.toolCalls, icon: Terminal },
    { label: 'Recorded files', value: story.files.length, icon: FileCode2 },
    {
      label: 'Injected IDs / write events',
      value: `${story.observedInjectedMemories} / ${story.memoryWrites}`,
      icon: BrainCircuit,
    },
    { label: 'Mail events', value: story.counts.mail, icon: Mail },
    { label: 'Drift / retry / error', value: story.counts.alert, icon: TriangleAlert },
  ];
  return (
    <div
      className="session-story h-full overflow-auto bg-background"
      data-testid="session-story"
      data-motion={motion ? 'on' : 'off'}
    >
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-7">
        <header className="relative overflow-hidden rounded-3xl border border-info/20 bg-gradient-to-br from-info/10 via-card to-primary/10 p-5 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => useUIStore.getState().setCurrentView('chat')}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <ArrowLeft size={14} /> Back to session
            </button>
            <span className="rounded-full border px-3 py-1 text-xs">
              {live ? '● SESSION LIVE' : 'RECORDED SESSION'} ·{' '}
              {history.events.length.toLocaleString()} history events
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[.25em] text-info">
                SESSION STORY / FLIGHT RECORDER
              </p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                The work. The team. The trail.
              </h1>
              {latestRequest && (
                <p className="mt-3 max-w-3xl text-sm leading-6">{latestRequest.slice(0, 320)}</p>
              )}
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                {session?.id === sessionId ? session.id : (sessionId ?? 'No session selected')} ·
                Every lane, including this tab's subagents.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={motion}
                onClick={() => setMotion((value) => !value)}
                className="rounded-xl border px-3 py-2 text-xs"
              >
                Effects {motion ? 'on' : 'off'}
              </button>
              <button
                type="button"
                onClick={() => setFollow((value) => !value)}
                aria-pressed={follow}
                className="rounded-xl border px-3 py-2 text-xs"
              >
                {follow ? 'History refresh on' : 'History refresh paused'}
              </button>
              <button
                type="button"
                onClick={history.refresh}
                disabled={history.loading}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
              >
                <RefreshCw size={14} className={history.loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {cards.map((card) => (
              <div
                key={card.label}
                className="story-card rounded-2xl border border-border/70 bg-background/60 p-3"
              >
                <card.icon size={16} className="mb-3 text-muted-foreground" />
                <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{card.label}</p>
              </div>
            ))}
          </div>
        </header>
        <div
          role="tablist"
          aria-label="Session dashboard sections"
          className="sticky top-0 z-10 flex gap-1 overflow-x-auto rounded-2xl border bg-background/95 p-1.5 backdrop-blur"
        >
          {(['overview', 'timeline', 'models', 'tools', 'files', 'team'] as const).map(
            (value, index, values) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`story-tab-${value}`}
                aria-controls={`story-panel-${value}`}
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => {
                  setTab(value);
                  setPlaying(false);
                }}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowRight'
                      ? (index + 1) % values.length
                      : event.key === 'ArrowLeft'
                        ? (index + values.length - 1) % values.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? values.length - 1
                            : undefined;
                  if (next === undefined) return;
                  event.preventDefault();
                  setTab(values[next]!);
                  setPlaying(false);
                  document.getElementById(`story-tab-${values[next]}`)?.focus();
                }}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm capitalize transition-colors ${tab === value ? 'bg-info/15 font-semibold text-info' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {value === 'overview' ? 'Overview' : value}
              </button>
            ),
          )}
        </div>
        <div
          role="tabpanel"
          id={`story-panel-${tab}`}
          aria-labelledby={`story-tab-${tab}`}
          className="space-y-5"
        >
          {history.error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {history.error}
            </p>
          )}
          {history.total > history.events.length && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
              <span>
                Loaded {history.events.length.toLocaleString()} of {history.total.toLocaleString()}{' '}
                recorded events. Charts and totals describe the loaded window.
              </span>
              {history.cursor && (
                <button
                  type="button"
                  disabled={history.loading}
                  onClick={() => {
                    setFollow(false);
                    history.loadEarlier();
                  }}
                  className="rounded border px-3 py-1"
                >
                  Load earlier events
                </button>
              )}
            </div>
          )}
          {story.actors.length > 0 && tab === 'overview' && (
            <>
              <StoryInsights
                story={story}
                end={end}
                cursor={cursorAt}
                kind={kind}
                onKind={(value) => {
                  setKind(value);
                  setTab('timeline');
                  setCursor(100);
                }}
              />
              <section className="story-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border bg-card px-5 py-4">
                <span className="text-sm font-semibold">Recorded reach</span>
                {[
                  `${stats.tools.length} tool types`,
                  `${stats.files.length} file paths`,
                  `${stats.directories} directories`,
                  `${stats.files.reduce((sum, file) => sum + file.reads, 0)} reads`,
                  `${stats.files.reduce((sum, file) => sum + file.edits + file.writes, 0)} edits / writes`,
                ].map((value) => (
                  <span key={value} className="font-mono text-xs text-muted-foreground">
                    {value}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setTab('files')}
                  className="ml-auto text-xs text-info underline"
                >
                  Inspect file footprint
                </button>
              </section>
              <ActivityPulse story={story} end={end} />
            </>
          )}
          {(tab === 'tools' || tab === 'files') && (
            <StoryTables
              key={tab}
              stats={stats}
              type={tab}
              onInspect={(value) => {
                setSearch(value);
                setKind('all');
                setActor('all');
                setCursor(100);
                setTab('timeline');
                setLimit(50);
              }}
            />
          )}
          {tab === 'models' && (
            <ModelDashboard
              models={models}
              onInspect={(event) => {
                setSearch('');
                setKind('all');
                setActor('all');
                setCursor(100);
                setTab('timeline');
                pick(event);
              }}
            />
          )}
          {tab === 'timeline' && story.actors.length > 0 && (
            <>
              <ActivityPulse story={story} end={end} />
              <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
                <button
                  type="button"
                  aria-label={playing ? 'Pause session replay' : 'Play session replay'}
                  onClick={() => {
                    setFollow(false);
                    if (!playing && cursor >= 100) setCursor(0);
                    setPlaying((value) => !value);
                  }}
                  className="rounded-full border p-2"
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cursor}
                  aria-label="Session replay position"
                  onChange={(event) => {
                    setCursor(Number(event.target.value));
                    setPlaying(false);
                    setFollow(false);
                  }}
                  className="min-w-40 flex-1 accent-cyan-500"
                />
                <span className="font-mono text-xs tabular-nums">
                  +{storyTime(cursorAt - story.start)} / {storyTime(span)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCursor(100);
                    setPlaying(false);
                  }}
                  className="text-xs underline"
                >
                  Latest
                </button>
              </section>
              <StoryChart
                story={story}
                end={end}
                cursor={cursorAt}
                selected={selectedId}
                onSelect={pick}
                actor={actor}
              />
            </>
          )}
          {story.actors.length === 0 && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              <Activity className="mx-auto mb-3" />
              <p>
                {history.loading
                  ? 'Loading the session story…'
                  : 'No timestamped session events are available yet.'}
              </p>
              <p className="mt-2 text-xs">
                Recorded Chronicle events and explicitly owned team activity appear here as they
                arrive.
              </p>
            </div>
          )}
          {(tab === 'timeline' || tab === 'team') && (
            <div
              className={
                tab === 'timeline'
                  ? 'grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]'
                  : ''
              }
            >
              {tab === 'timeline' && (
                <StoryStream
                  story={story}
                  events={visible}
                  actor={actor}
                  kind={kind}
                  search={search}
                  limit={limit}
                  selectedId={selectedId}
                  onSearch={(value) => {
                    setSearch(value);
                    setLimit(50);
                  }}
                  onActor={(value) => {
                    setActor(value);
                    setLimit(50);
                  }}
                  onKind={(value) => {
                    setKind(value);
                    setLimit(50);
                  }}
                  onSelect={pick}
                  onMore={() => setLimit((value) => value + 50)}
                />
              )}
              <aside
                className={tab === 'team' ? 'grid items-start gap-5 md:grid-cols-2' : 'space-y-5'}
              >
                {story.actors.length > 0 && (
                  <TeamConstellation actors={story.actors} selected={actor} onSelect={setActor} />
                )}
                {selectedActor && (
                  <section className="rounded-2xl border bg-card p-4">
                    <h2 className="font-semibold">{selectedActor.name}</h2>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {[selectedActor.model, selectedActor.status].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                      {selectedActor.task || 'No assignment was recorded for this actor.'}
                    </p>
                  </section>
                )}
                <section className="rounded-2xl border bg-card p-4">
                  <h2 className="font-semibold">Event evidence</h2>
                  {selected ? (
                    <div className="mt-4 space-y-3">
                      <p className="break-words text-sm font-medium">{selected.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(selected.at).toLocaleString()} · {selected.kind}
                      </p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-3 text-xs">
                        {selected.detail}
                      </pre>
                      {selected.raw && (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            Recorded metadata
                          </summary>
                          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                            {JSON.stringify(selected.raw, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Select a chart marker or event to inspect its recorded evidence.
                    </p>
                  )}
                </section>
                <section className="rounded-2xl border bg-card p-4">
                  <h2 className="font-semibold">File footprint</h2>
                  <ul className="mt-3 space-y-2">
                    {story.files.slice(0, 30).map((path) => (
                      <li
                        key={path}
                        className="break-all font-mono text-[11px] text-muted-foreground"
                      >
                        {path}
                      </li>
                    ))}
                  </ul>
                  {story.files.length === 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No file paths were recorded in this window.
                    </p>
                  )}
                  {story.files.length > 30 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      +{story.files.length - 30} more paths in the loaded events
                    </p>
                  )}
                </section>
                <p className="px-2 text-[11px] leading-5 text-muted-foreground">
                  Only explicit session ownership is included. Mail and memory traces supplement
                  durable history from bounded recent caches. Hidden or unrecorded events, parents,
                  durations, and drift are not invented. Chart markers are sampled; the event stream
                  retains every loaded event.
                </p>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
