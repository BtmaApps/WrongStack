import {
  detectContinueIntent,
  type InputBuilder,
  resolveContinuation,
  setBtwNote,
} from '@wrongstack/core/agent';
import type { Director } from '@wrongstack/core/coordination';
import { PROMPT_JOURNAL_RAW_MARKER } from '@wrongstack/core/prompts';
import type { AttachmentStore, ContentBlock } from '@wrongstack/core/types';
import { typeSafeJudgeFromContainer } from '@wrongstack/core/typesafe';
import { todoTool } from '@wrongstack/tools/todo';
import type { Action, State } from './app-reducer.js';
import type { SendMode } from './components/send-mode-picker.js';
import type { ShellCommandWarningDecision } from './components/shell-command-warning.js';
import { INLINE_TOKEN_SRC } from './input-tokens.js';
import type { emptyMemoryContextMonitor } from './memory-context-monitor.js';
import type { MutableCell } from './shared-types.js';
import { buildSteeringPreamble } from './steering-preamble.js';
import { shouldPushSubmittedHistory } from './submit-history.js';
import { refineSubmittedPrompt } from './submit-prompt-refinement.js';
import { submitSlashCommand } from './submit-slash-command.js';
import { resolveAttachmentTokens, type TokenPreviewStore } from './token-previews.js';
import { startFreshTopicContext, TopicShiftAdvisor } from './topic-shift-advisor.js';
import type { SubmitCapabilities } from './tui-host-capabilities.js';

/**
 * Wait up to `deadlineMs` for an in-flight run to settle into `idle` before
 * kicking the next iteration. Polls `isIdle` rather than spinning: the cadence
 * starts tight (so we react quickly when the abort settles early) and backs
 * off toward the deadline, so a long wait never hammers the event loop at a
 * fixed high frequency. Returns true if idle was reached before the deadline.
 */
async function waitForIdleSettle(
  isIdle: () => boolean,
  deadlineMs: number,
  opts: { maxPollMs?: number } = {},
): Promise<boolean> {
  const maxPollMs = opts.maxPollMs ?? 150;
  const start = Date.now();
  let pollMs = 20;
  while (!isIdle()) {
    const remaining = deadlineMs - (Date.now() - start);
    if (remaining <= 0) return false;
    const wait = Math.min(Math.max(pollMs, 1), maxPollMs, remaining);
    await new Promise((resolve) => setTimeout(resolve, wait));
    pollMs = Math.min(pollMs * 2, maxPollMs);
  }
  return true;
}

export interface SubmitControllerHost {
  readonly capabilities: SubmitCapabilities;
  readonly state: State;
  readonly live: {
    readonly mouseMode: boolean;
    /** Mouse tracking released to the terminal (`/mouse native`). */
    readonly nativeMouse: boolean;
    readonly model: string;
    readonly provider: string;
    readonly maxContext: number | undefined;
    readonly yolo: boolean;
    readonly autonomy: 'off' | 'suggest' | 'auto' | 'eternal' | 'eternal-parallel';
    readonly modeLabel: string | undefined;
    setMouseMode(value: boolean): void;
    setNativeMouse(value: boolean): void;
    setModel(value: string): void;
    setProvider(value: string): void;
    setMaxContext(value: number): void;
    setYolo(value: boolean): void;
    setAutonomy(value: 'off' | 'suggest' | 'auto' | 'eternal' | 'eternal-parallel'): void;
    setModeLabel(value: string): void;
    setToolCount(value: number): void;
  };
  readonly refs: {
    readonly state: MutableCell<State>;
    readonly interrupts: MutableCell<number>;
    readonly autoSubmitStreak: MutableCell<number>;
    readonly autoSubmitCapWarned: MutableCell<boolean>;
    readonly autoSubmitLoopGuard: MutableCell<{ reset(): void }>;
    readonly tokenPreviews: MutableCell<TokenPreviewStore>;
    readonly attachments: AttachmentStore;
    readonly builder: MutableCell<InputBuilder | null>;
    readonly sessionGeneration: MutableCell<number>;
    readonly eternalLoop: MutableCell<() => Promise<void>>;
    readonly parallelLoop: MutableCell<() => Promise<void>>;
    readonly enhanceEnabled: MutableCell<boolean>;
    readonly enhanceOriginal: MutableCell<string>;
    readonly enhanceAbort: MutableCell<AbortController | null>;
    readonly enhanceCancelled: MutableCell<boolean>;
    readonly nextStepsTimer: MutableCell<ReturnType<typeof setInterval> | undefined>;
    readonly midRunSendPicker: MutableCell<boolean>;
    /** Managed-history scroll surface; null until ScrollableHistory mounts. */
    readonly historyScroll: MutableCell<
      import('./components/scrollable-history.js').HistoryScrollController | null
    >;
  };
  readonly actions: {
    dispatch(action: Action): void;
    clearDraft(): void;
    setDraft(buffer: string, cursor: number): void;
    pasteClipboardImage(): Promise<void>;
    openPromptPicker(): Promise<void>;
    refreshGoalSummary(): void;
    exit(): void;
    runBlocks(blocks: ContentBlock[]): Promise<void>;
    liveDirector(): Director | null;
    setMemoryContextMonitor(value: ReturnType<typeof emptyMemoryContextMonitor>): void;
    runSteerSequence(direction: string): { preamble: string };
    setEnhanceStartedAt(value: number | null): void;
    setEnhanceDuration(value: number | null): void;
    setRefineProvider(value: string | null): void;
    setRefineModel(value: string | null): void;
    onBugHuntStarted(command: string, totalRounds?: number): void;
    consumeBugHuntReplay(command: string): boolean;
    /** Called after /clear dispatches clearHistory — app.tsx uses this to
     *  reset mutable refs that the reducer cannot reach (paste accumulator,
     *  next-steps auto-submit, prompt-usage store, enhance abort). */
    onAfterClear?(): void;
  };
}

// createSubmitController is rebuilt as the App renders. Keep the bounded
// decision cache attached to the long-lived Agent instead of a render closure.
const topicAdvisorByAgent = new WeakMap<object, TopicShiftAdvisor>();

function topicAdvisorFor(agent: object): TopicShiftAdvisor {
  let advisor = topicAdvisorByAgent.get(agent);
  if (!advisor) {
    advisor = new TopicShiftAdvisor({
      getJudge: () =>
        typeSafeJudgeFromContainer(
          (agent as { container?: { safeResolve(token: unknown): unknown } }).container,
          'topicShift',
        ),
    });
    topicAdvisorByAgent.set(agent, advisor);
  }
  return advisor;
}

export function createSubmitController(host: SubmitControllerHost) {
  const {
    capabilities: {
      agent,
      slashRegistry,
      tokenCounter,
      getSettings,
      saveSettings,
      getYolo,
      getAutonomy,
      getEternalEngine,
      getParallelEngine,
      getModeLabel,
      getToolsItems,
      onExit,
      clearTerminal,
      onClearHistory,
      getSuggestions,
      getSDDContext,
      switchAutonomy,
      memoryStore,
      getEnhancerReasoning,
      buildEnhancerProvider,
      getEnhanceFallbackRef,
      getConfiguredRefinerRef,
      getPickableProviders,
    },
    state,
    live: {
      mouseMode,
      nativeMouse,
      model: liveModel,
      provider: liveProvider,
      maxContext: activeMaxContext,
      yolo: yoloLive,
      autonomy: autonomyLive,
      modeLabel: liveModeLabel,
      setMouseMode,
      setNativeMouse,
      setModel: setLiveModel,
      setProvider: setLiveProvider,
      setMaxContext: setActiveMaxContext,
      setYolo: setYoloLive,
      setAutonomy: setAutonomyLive,
      setModeLabel: setLiveModeLabel,
      setToolCount: setLiveToolCount,
    },
    refs: {
      state: stateRef,
      interrupts: interruptsSyncRef,
      autoSubmitStreak: autoSubmitStreakRef,
      autoSubmitCapWarned: autoSubmitCapWarnedRef,
      autoSubmitLoopGuard: autoSubmitLoopGuardRef,
      tokenPreviews: tokenPreviewsRef,
      attachments,
      builder: builderRef,
      sessionGeneration: sessionGenerationRef,
      eternalLoop: runEternalLoopRef,
      parallelLoop: runParallelLoopRef,
      enhanceEnabled: enhanceEnabledRef,
      enhanceOriginal: enhanceOriginalRef,
      enhanceAbort: enhanceAbortRef,
      enhanceCancelled: enhanceCancelledRef,
      nextStepsTimer: nextStepsAutoSubmitTimerRef,
      midRunSendPicker: midRunSendPickerRef,
    },
    actions: {
      dispatch,
      clearDraft,
      setDraft,
      pasteClipboardImage,
      openPromptPicker,
      refreshGoalSummary,
      exit,
      runBlocks,
      liveDirector,
      setMemoryContextMonitor,
      runSteerSequence,
      setEnhanceStartedAt,
      setEnhanceDuration: setEnhanceDurationMs,
      setRefineProvider: setRefineProviderId,
      setRefineModel,
      onBugHuntStarted,
      consumeBugHuntReplay,
      onAfterClear,
    },
  } = host;
  const submit = async (overrideRaw?: string) => {
    if (stateRef.current.resumeLoad) {
      dispatch({ type: 'hint', text: 'Please wait for session resume and replay to finish.' });
      return;
    }
    const raw = overrideRaw ?? stateRef.current.buffer;
    const trimmed = raw.trim();
    // Attachment chips live inline in the buffer now, so a paste/file-only
    // message is already non-empty here — a single `!trimmed` guard suffices.
    if (!trimmed) {
      // If the user pressed Esc to steer and now hits Enter with an empty
      // buffer, consume the steering state — otherwise the *next* non-empty
      // message picks up a stale STEERING preamble and injects it into a
      // completely unrelated new message. Consuming here gives the user a
      // way to silently cancel steering by pressing Enter on a blank line.
      if (state.steeringPending) {
        dispatch({ type: 'steerConsume' });
      }
      return;
    }

    interruptsSyncRef.current = 0;
    dispatch({ type: 'resetInterrupts' });
    // Manual input re-arms the next-steps auto-submit loop: the consecutive
    // cap counts AUTOMATIC turns between user inputs only.
    autoSubmitStreakRef.current = 0;
    autoSubmitCapWarnedRef.current = false;
    autoSubmitLoopGuardRef.current.reset();
    // …and releases the post-resume hold. Only this path reaches here: the
    // auto-proceed loop feeds `runBlocks` directly, so it cannot release its
    // own hold. That asymmetry is the point — a resume waits for a human.
    dispatch({ type: 'autoProceedRelease' });
    // Submitting anything snaps the managed viewport back to the newest output
    // (no-op when already pinned or outside mouse mode).
    host.refs.historyScroll.current?.scrollToBottom();
    const isAutomaticBugHuntReplay = consumeBugHuntReplay(trimmed);
    const pushSubmittedHistory = () => {
      if (isAutomaticBugHuntReplay) return;
      const decision = shouldPushSubmittedHistory(trimmed);
      if (decision.push) {
        dispatch({ type: 'historyPush', text: decision.trimmed });
      }
    };
    if (trimmed === '/image' || trimmed === '/paste-image') {
      pushSubmittedHistory();
      clearDraft();
      await pasteClipboardImage();
      return;
    }

    if (trimmed.startsWith('!')) {
      const command = trimmed.slice(1).trim();
      if (!command) {
        dispatch({
          type: 'addEntry',
          entry: { kind: 'info', text: 'Usage: !<shell command>' },
        });
        return;
      }

      const settings = getSettings?.();
      if (settings?.shellBangWarningDontShowAgain !== true) {
        const decision = await new Promise<ShellCommandWarningDecision>((resolve) => {
          dispatch({ type: 'shellCommandWarningOpen', info: { command, resolve } });
        });
        dispatch({ type: 'shellCommandWarningClose' });
        if (decision === 'no') return;
        if (decision === 'dont-show-again') {
          if (settings && saveSettings) {
            const err = await saveSettings({ ...settings, shellBangWarningDontShowAgain: true });
            if (err) {
              dispatch({ type: 'addEntry', entry: { kind: 'warn', text: err } });
            }
          }
        }
      }

      return submit(`/dev ${command}`);
    }

    // Bare `/prompt` opens the visual library picker (TUI-only). `/prompt <args>`
    // (search / insert) falls through to the plugin command below.
    if (trimmed === '/prompt' || trimmed === '/prompts-browse') {
      pushSubmittedHistory();
      clearDraft();
      void openPromptPicker();
      return;
    }

    // Slash commands always dispatch immediately, even mid-iteration —
    // they don't conflict with a running agent.
    if (trimmed.startsWith('/'))
      return await submitSlashCommand({
        trimmed,
        sessionGenerationRef,
        attachments,
        tokenPreviewsRef,
        isAutomaticBugHuntReplay,
        dispatch,
        pushSubmittedHistory,
        clearDraft,
        slashRegistry,
        agent,
        refreshGoalSummary,
        onBugHuntStarted,
        mouseMode,
        nativeMouse,
        setNativeMouse,
        setMouseMode,
        getSettings,
        saveSettings,
        liveModel,
        setLiveModel,
        liveProvider,
        setLiveProvider,
        activeMaxContext,
        setActiveMaxContext,
        getYolo,
        yoloLive,
        setYoloLive,
        getAutonomy,
        autonomyLive,
        setAutonomyLive,
        getEternalEngine,
        runEternalLoopRef,
        getParallelEngine,
        runParallelLoopRef,
        getModeLabel,
        liveModeLabel,
        setLiveModeLabel,
        getToolsItems,
        setLiveToolCount,
        exit,
        onExit,
        builderRef,
        waitForIdleSettle,
        stateRef,
        runBlocks,
        liveDirector,
        clearTerminal,
        onClearHistory,
        setMemoryContextMonitor,
        tokenCounter,
        enhanceAbortRef,
        enhanceCancelledRef,
        enhanceOriginalRef,
        nextStepsAutoSubmitTimerRef,
        autoSubmitStreakRef,
        autoSubmitCapWarnedRef,
        autoSubmitLoopGuardRef,
        onAfterClear,
      });

    const builder = builderRef.current;
    if (!builder) return;
    // Steering inject: if the user pressed Esc on the prior iteration,
    // prepend a STEERING preamble so the model sees this isn't a
    // follow-up — it's an interrupt redirecting the work. The preamble
    // carries (a) context the model would otherwise have to guess
    // (what tools were running, what subagents were live) and (b)
    // explicit authority — "drop the prior plan, respawn subagents
    // if useful, ask for clarification if needed". Plain user-role
    // text so accountability stays with the human who triggered it.
    const steering = state.steeringPending;

    // ── Bare "continue" → resolve against live plan state ──────────────
    // A lone "continue" / "devam" / "go on" carries no new instruction and
    // has nothing worth refining. Resolve it to the next open todo, else the
    // top stored suggestion, else an open continuation that keeps the agent
    // working without fabricating busywork. The full resolved instruction is
    // injected as `effectiveText` (what the model sees); the user's chat
    // bubble shows only the short `label`. Idle-only: a "continue" typed
    // mid-run flows through the normal send-mode picker unchanged.
    const continueResolved =
      !steering && state.status === 'idle' && detectContinueIntent(trimmed)
        ? resolveContinuation({
            todos: agent.ctx.todos,
            suggestions: getSuggestions?.() ?? [],
          })
        : null;
    if (continueResolved?.source === 'todo' && continueResolved.todoId) {
      const selected = agent.ctx.todos.find((todo) => todo.id === continueResolved.todoId);
      if (selected?.status === 'pending') {
        await todoTool.execute(
          {
            todos: agent.ctx.todos.map((todo) =>
              todo.id === continueResolved.todoId
                ? { ...todo, status: 'in_progress' as const }
                : todo.status === 'in_progress'
                  ? { ...todo, status: 'pending' as const }
                  : todo,
            ),
          },
          agent.ctx,
          { signal: AbortSignal.timeout(30_000) },
        );
      }
    }

    // Resolve SDD state once and reuse it below. An active spec conversation
    // already owns its topic boundary, so the generic advisor must stay out.
    const sddContext = await getSDDContext?.();

    // ── Long-history topic boundary advisory ────────────────────────
    // The advisor performs a cheap local gate first. It calls the provider
    // only when history is substantial and lexical continuity is low, then
    // caches the bounded decision. A fresh context resets only provider-bound
    // conversational state: visible chat and the append-only session remain.
    if (
      !isAutomaticBugHuntReplay &&
      !steering &&
      stateRef.current.status === 'idle' &&
      continueResolved === null &&
      !sddContext
    ) {
      const liveState = stateRef.current;
      const advice = await topicAdvisorFor(agent).advise({
        prompt: trimmed,
        messages: agent.ctx.messages,
        provider: agent.ctx.provider,
        model: agent.ctx.model,
        contextTokens: agent.ctx.lastRequestTokens ?? liveState.leader.ctxTokens,
        maxContext:
          activeMaxContext ??
          liveState.leader.ctxMaxTokens ??
          agent.ctx.provider.capabilities.maxContext,
        onModelCheck: (on) => dispatch({ type: 'topicCheckBusy', on }),
      });
      if (advice.suggestNewContext) {
        const percent = Math.round(advice.confidence * 100);
        const topic = advice.nextTopic ? `\nNew topic: ${advice.nextTopic}` : '';
        const decision = await new Promise<boolean | null>((resolve) => {
          dispatch({
            type: 'slashConfirmOpen',
            info: {
              question: [
                `This looks like a different topic (${percent}% confidence).`,
                advice.reason,
                topic,
                'Start a fresh model context? Previous chat stays visible and saved.',
                'y = new context · n/Enter = continue in this context',
              ]
                .filter(Boolean)
                .join('\n'),
              defaultYes: false,
              resolve,
            },
          });
        });
        dispatch({ type: 'slashConfirmClose' });
        if (decision === null) {
          setDraft(trimmed, trimmed.length);
          return;
        }
        if (decision) {
          await startFreshTopicContext(agent.ctx);
          dispatch({ type: 'resetContextChip' });
          dispatch({
            type: 'addEntry',
            entry: {
              kind: 'info',
              text: 'New context started — previous chat remains in session history but is no longer sent to the model.',
            },
          });
        }
      }
    }

    // ── Prompt refinement ("did you mean this?") ───────────────────────
    // Before the main agent sees the message, run it through a separate
    // one-shot LLM call (its own system prompt, no history) that rewrites it
    // into a clearer instruction, then briefly preview it. The user can let
    // it auto-send (countdown), accept now (Enter), keep the original (Esc),
    // or edit (e). Skipped for steering interrupts and inputs the heuristic
    // judges not worth refining. When chips (file/image/paste tokens) are
    // present, they are stripped before refinement and re-attached afterwards
    // so file references survive the rewrite. Best-effort — any failure falls
    // straight through to the original text.
    const refinement = await refineSubmittedPrompt(
      {
        capabilities: {
          agent,
          memoryStore,
          getEnhancerReasoning,
          buildEnhancerProvider,
          getEnhanceFallbackRef,
          getConfiguredRefinerRef,
          getPickableProviders,
        },
        status: state.status,
        enabled: enhanceEnabledRef,
        original: enhanceOriginalRef,
        abortController: enhanceAbortRef,
        cancelled: enhanceCancelledRef,
        preRefineSeconds: state.settingsPicker.preRefineSeconds,
        dispatch,
        clearDraft,
        setDraft,
        setStartedAt: setEnhanceStartedAt,
        setDuration: setEnhanceDurationMs,
        setProviderId: setRefineProviderId,
        setModel: setRefineModel,
      },
      trimmed,
      {
        steering,
        // Internal bug-hunt continuation text is already generated by the
        // workflow. Treat it like a resolved continuation so a second model
        // cannot rewrite workflow control text before the main run sees it.
        continuationResolved: continueResolved !== null || isAutomaticBugHuntReplay,
      },
    );
    if (refinement.kind === 'cancel') return;
    let effectiveText = refinement.effectiveText;

    // A resolved bare-continue is confirmed before it is sent — the panel makes
    // the resolution *and its drift risk* visible instead of silently guessing.
    // Grounded (todo / suggestion) auto-proceeds after a short countdown; the
    // `open` guess waits for an explicit key. On proceed, the concrete
    // instruction becomes what the model sees (the user's bubble shows only the
    // short label). Cancel discards the turn; edit loads a seed to tweak.
    if (continueResolved) {
      const decision = await new Promise<'proceed' | 'edit' | 'cancel'>((resolve) => {
        dispatch({
          type: 'continueConfirmOpen',
          info: {
            label: continueResolved.label,
            instruction: continueResolved.text,
            source: continueResolved.source,
            grounded: continueResolved.source !== 'open',
            resolve,
          },
        });
      });
      dispatch({ type: 'continueConfirmClose' });
      if (decision === 'cancel') {
        clearDraft();
        return;
      }
      if (decision === 'edit') {
        // Grounded → seed the resolved instruction to tweak; open → empty prompt
        // so the user states what to continue.
        const seed = continueResolved.source === 'open' ? '' : continueResolved.text;
        setDraft(seed, seed.length);
        return;
      }
      effectiveText = continueResolved.text;
    }

    // Journal provenance: when the refiner rewrote the prompt, remember the raw
    // typed text so the CLI prompt-journal recorder (via the core-owned
    // PROMPT_JOURNAL_RAW_MARKER) labels this turn `refined_user` with
    // `rawContent` preserved. The stamp is applied ONLY on paths that reach
    // agent.run (steer / queue / idle runBlocks) — exits that return without
    // running the pipeline (btw, cancel, continue edit/cancel) must not leave
    // a marker that a later, unrelated submission would wrongly consume.
    const refinedRaw = effectiveText !== trimmed && trimmed ? trimmed : undefined;
    const stampJournalMarker = (): void => {
      if (refinedRaw) agent.ctx.meta[PROMPT_JOURNAL_RAW_MARKER] = refinedRaw;
    };

    // ── SDD Context Injection ──────────────────────────────────────────
    // When an SDD session is active, prepend the session context so the
    // model knows it's in a spec-building conversation. The context getter
    // is zero-arg (see app-props / run-tui-options), so the Q/A pair for
    // the questioning phase is recorded elsewhere; here we just fetch the
    // prompt prefix.
    if (sddContext && trimmed) {
      builder.appendText(`[SDD SESSION ACTIVE]\n${sddContext}\n\n---\nUser message:\n`);
    }

    if (trimmed) {
      const toAppend = steering
        ? buildSteeringPreamble(state.steerSnapshot, effectiveText)
        : effectiveText;
      builder.appendText(toAppend);
    }
    if (steering) dispatch({ type: 'steerConsume' });
    // The user sees their original text + a visual ↯ marker when
    // steering, not the full preamble — keeps the chat readable while
    // the model still gets the explicit instruction.
    const displayText = continueResolved
      ? continueResolved.label
      : steering
        ? `↯ ${effectiveText}`
        : effectiveText;
    // Build the history preview by scanning the message for inline chip tokens
    // and pulling each one's stored preview. Each chip becomes a label line
    // followed by an indented snippet of its collapsed content.
    const pasteParts: string[] = [];
    for (const m of trimmed.matchAll(new RegExp(INLINE_TOKEN_SRC, 'g'))) {
      const token = m[0];
      const content = tokenPreviewsRef.current.get(token);
      pasteParts.push(token);
      if (content) pasteParts.push(`  ${content.split('\n').slice(0, 6).join('\n  ')}`);
    }
    const pasteContent = pasteParts.length > 0 ? pasteParts.join('\n') : undefined;
    pushSubmittedHistory();
    clearDraft();
    const blocks = await builder.submit();

    // Live read, NOT the render-closure `state`: unbounded awaits sit above
    // this line (refine countdown, continueConfirm keypress, builder.submit),
    // so the closure's status can be minutes stale. A stale 'idle' here while
    // the eternal poll already started a run would kick a SECOND concurrent
    // agent.run() — clobbering activeController (first run becomes
    // un-abortable) and interleaving two streams into one JSONL. Read into a
    // local so TS doesn't narrow the ref chain (the steer branch below
    // re-polls the same property in its wait loop).
    const busyNow = stateRef.current.status !== 'idle';
    if (busyNow && !steering) {
      // Agent is busy. Abort any next-steps auto-submit countdown since the
      // user is providing input. Only cancel autonomy if a countdown was
      // actually running — otherwise this would override the user's explicit
      // 'auto' selection in the autonomy picker (which also fires this handler
      // via Enter). (#87: steering already short-circuits the outer `if`.)
      if (autonomyLive === 'auto' && nextStepsAutoSubmitTimerRef.current != null) {
        switchAutonomy?.('off');
      }

      // ── Mid-run send-mode picker ───────────────────────────────────
      // Instead of silently queueing, ask how to deliver this message:
      //   queue  — run after the current turn (legacy behavior)
      //   btw    — fold in at the next iteration without interrupting
      //   steer  — abort now, drop the queue, redirect to this
      // The picker is on by default; `/queue picker off` reverts to silent
      // queue. Esc restores the draft to the composer — nothing is sent.
      let mode: SendMode | 'cancel' = 'queue';
      if (midRunSendPickerRef.current) {
        mode = await new Promise<SendMode | 'cancel'>((resolve) => {
          dispatch({
            type: 'sendModePickerOpen',
            info: { selected: 0, text: effectiveText, displayText, blocks, pasteContent, resolve },
          });
        });
        dispatch({ type: 'sendModePickerClose' });
      }

      if (mode === 'btw') {
        const noteText = await resolveAttachmentTokens(effectiveText, attachments);
        const pending = setBtwNote(agent.ctx, noteText);
        dispatch({
          type: 'addEntry',
          entry: {
            kind: 'info',
            text: `↯ Noted (${pending} pending) — folded in at the agent's next step:\n  ${displayText}`,
          },
        });
        return;
      }

      if (mode === 'steer') {
        const { preamble } = runSteerSequence(effectiveText);
        dispatch({
          type: 'addEntry',
          entry: { kind: 'user', text: `↯ ${effectiveText}`, pasteContent },
        });
        const b = builderRef.current;
        if (b) {
          b.appendText(preamble);
          const steerBlocks = await b.submit();
          // Wait briefly for the aborting iteration to settle into 'idle' before
          // kicking the next one — otherwise runBlocks early-returns on the busy
          // guard. Same wait-loop the `/steer` runText path uses.
          await waitForIdleSettle(() => stateRef.current.status === 'idle', 1500);
          try {
            stampJournalMarker();
            await runBlocks(steerBlocks);
          } finally {
            clearDraft();
          }
        }
        return;
      }

      if (mode === 'cancel') {
        // Esc: hand the text back to the composer instead of delivering it.
        // The user changed their mind about interrupting the run — restore
        // the draft exactly as typed so the turn simply never happened.
        setDraft(effectiveText, effectiveText.length);
        return;
      }

      // 'queue': enqueue for the drainer. The raw (pre-refinement) text rides
      // on the item itself (journalRaw) — NOT stamped into the single-slot
      // ctx.meta marker here — so the drainer can stamp it per-item right
      // before that item runs. Enqueue-time stamping would let one queued
      // refined prompt's raw leak into the next item's entry (they share one
      // marker slot) and would orphan the marker if the queue is cleared.
      dispatch({
        type: 'addEntry',
        entry: { kind: 'user', text: displayText, queued: true, pasteContent },
      });
      dispatch({
        type: 'enqueue',
        item: {
          displayText,
          blocks,
          ...(refinedRaw ? { journalRaw: refinedRaw } : {}),
        },
      });
      return;
    }

    if (!isAutomaticBugHuntReplay) {
      dispatch({ type: 'addEntry', entry: { kind: 'user', text: displayText, pasteContent } });
    }

    // ── Abort auto-proceed countdown ────────────────────────────────────
    // User submitted input — abort any pending next-steps auto-submit
    // countdown and switch to manual mode so the next step waits for
    // explicit trigger. Only cancel if a countdown was actually running —
    // otherwise this would override the user's explicit 'auto' selection
    // in the autonomy picker (which also fires this handler via Enter).
    if (autonomyLive === 'auto' && nextStepsAutoSubmitTimerRef.current != null) {
      switchAutonomy?.('off');
    }

    stampJournalMarker();
    await runBlocks(blocks);
  };
  return submit;
}
