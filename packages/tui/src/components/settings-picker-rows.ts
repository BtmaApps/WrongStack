import { hasPanelRoutedToSidebar, PANEL_IDS, PANEL_POSITION_FIELD_START } from '../ui-contracts.js';
import {
  CONTEXT_MODE_DESCS,
  FLEET_CHAT_MODE_DESCS,
  formatAnimationStyle,
  formatBreakerTimeout,
  formatEnhanceDelay,
  formatMaxIterations,
  formatMultiDiffSummaryThreshold,
  formatPreRefineSeconds,
  formatSageThreshold,
  formatSettingsDelay,
  MODE_DESC,
  SETTINGS_FIELD_LABELS,
  STATUSLINE_MODE_DESCS,
  SYSTEM_PROMPT_CHOICE_LABELS,
  TOKEN_SAVING_TIER_DESCS,
  toolResultViewSettingRow,
} from './settings-picker-model.js';
import type { SettingsPickerProps } from './settings-picker-props.js';
import type { SettingsPickerRowData } from './settings-picker-row-list.js';

/**
 * The settings picker's row list — section headers and one row per field,
 * each with its current value and a one-line description. Field order here
 * IS the field index the reducer and jump chords use.
 */
export function buildSettingsPickerRows({
  mode,
  delayMs,
  titleAnimation,
  yolo,
  fleetChat,
  chime,
  confirmExit,
  nextPrediction,
  featureMcp,
  featurePlugins,
  featureMemory,
  featureSkills,
  featureModelsRegistry,
  featureToolCoach,
  tokenSavingTier,
  allowOutsideProjectRoot,
  maxIterations,
  autoProceedMaxIterations,
  enhanceDelayMs,
  enhanceEnabled,
  enhanceLanguage,
  preRefineSeconds,
  indexOnStart,
  multiDiffSummaryThreshold,
  thinkingWord,
  thinkingWordEditing,
  thinkingWordDraft,
  wrongProxyUrlEditing,
  wrongProxyUrlDraft,
  reasoningMode,
  reasoningEffort,
  reasoningEffortLevels,
  reasoningPreserve,
  cacheTtl,
  contextAutoCompact,
  contextStrategy,
  contextMode,
  maxConcurrent,
  logLevel,
  auditLevel,
  debugStream,
  statuslineMode,
  configScope,
  animationStyle,
  breakerEnabled,
  breakerAutoKillResetMs,
  showModelReasoning,
  toolResultViewMode,
  selectionMode = 'block',
  showAgentSwarmPanel,
  showSidebar,
  showSageMemoryInject,
  sageMemoryInjectThreshold,
  nextStepsTool,
  nextStepsRequired,
  rememberStartupChoices,
  nextSystemPromptVariant,
  readSymbols,
  panelPositions,
  // WrongProxy / WrongTrace: pick these from the same slice as
  // `nextStepsTool` and `readSymbols`. The runtime probe (see
  // `runtime-controller-deps.ts:applyLiveSettings`) reads them off the
  // same object, so adding both at the destructuring level keeps the
  // mid-session effect coherent.
  wrongProxyEnabled,
  wrongProxyUrl,
}: SettingsPickerProps): SettingsPickerRowData[] {
  const boolVal = (v: boolean) => (v ? 'on' : 'off');
  // Pin rule: the sidebar can't be hidden while any F-key panel routes to
  // it — the settings reducer refuses the toggle (field 61) and shows a
  // hint; this marker tells the user why before they try.
  const sidebarPinned = hasPanelRoutedToSidebar(panelPositions, showAgentSwarmPanel === 'sidebar');

  return [
    // ── Autonomy ──
    { section: 'Autonomy' },
    { label: 'Default autonomy mode', value: mode, detail: MODE_DESC[mode] },
    {
      label: 'Auto-proceed delay',
      value: formatSettingsDelay(delayMs),
      detail: 'Wait before auto-continuing in auto mode',
    },
    // ── UX ──
    { section: 'UX' },
    {
      label: 'Terminal title animation',
      value: boolVal(titleAnimation),
      detail: 'Animated window/tab title with status',
    },
    {
      label: 'YOLO mode',
      value: boolVal(yolo),
      // Not "skip all" — damage of a gated kind still prompts. The per-kind
      // list is not a row of its own because this picker is positional (every
      // `settings-picker-jumps` binding names a fixed field index), so it lives
      // behind `/yolo confirm`. Keep this string short: `settings-overflow-24x80`
      // pins that a longer detail wraps and pushes rows out of the capped box.
      detail: 'Damage still asks: /yolo confirm',
    },
    {
      label: 'Fleet chat',
      value: fleetChat,
      detail: FLEET_CHAT_MODE_DESCS[fleetChat],
    },
    {
      label: 'Completion chime',
      value: boolVal(chime),
      detail: 'Play a sound when agent finishes',
    },
    {
      label: 'Confirm before exit',
      value: boolVal(confirmExit),
      detail: 'Confirmation on Esc interrupt & Ctrl+C exit',
    },
    {
      label: 'Next-step prediction',
      value: boolVal(nextPrediction),
      detail: 'Show LLM-predicted next steps (/next)',
    },
    // ── Features ──
    { section: 'Features' },
    {
      label: 'MCP servers',
      value: boolVal(featureMcp),
      detail: 'Load MCP servers from config',
    },
    {
      label: 'Plugins',
      value: boolVal(featurePlugins),
      detail: 'Load npm plugins from config',
    },
    {
      label: 'Memory',
      value: boolVal(featureMemory),
      detail: 'Enable remember/forget tools',
    },
    {
      label: 'Skills',
      value: boolVal(featureSkills),
      detail: 'Discover and load skills from disk',
    },
    {
      label: 'Models registry',
      value: boolVal(featureModelsRegistry),
      detail: 'Fetch models.dev catalog at startup',
    },
    {
      label: 'Token-saving mode',
      value: tokenSavingTier,
      detail: TOKEN_SAVING_TIER_DESCS[tokenSavingTier],
    },
    {
      label: 'Allow outside project',
      value: boolVal(allowOutsideProjectRoot),
      detail: 'Allow tools to access paths outside project root',
    },
    // ── Tools ──
    { section: 'Tools' },
    {
      label: 'Max iterations',
      value: formatMaxIterations(maxIterations),
      detail: '100–1000 or unlimited (0)',
    },
    {
      label: 'Auto-proceed max iterations',
      value: formatMaxIterations(autoProceedMaxIterations),
      detail: 'Stop auto-proceed after N iterations (0 = unlimited, default 50)',
    },
    {
      label: 'Refine preview countdown',
      value: formatEnhanceDelay(enhanceDelayMs),
      detail: 'Timeout for prompt refinement preview (15s–120s)',
    },
    {
      label: 'Refine',
      value: boolVal(enhanceEnabled),
      detail: 'Enable prompt refinement before sending',
    },
    {
      label: 'Refine language',
      value: enhanceLanguage,
      detail: 'original (keep language) | english (translate)',
    },
    {
      label: 'Index on session start',
      value: boolVal(indexOnStart),
      detail: 'Run incremental index at session start',
    },
    {
      label: 'Multi-diff summary',
      value: formatMultiDiffSummaryThreshold(multiDiffSummaryThreshold),
      detail: 'Min files before aggregate header (0 = off, default 5, 10 for big diffs)',
    },
    // ── Reasoning ──
    { section: 'Reasoning' },
    {
      label: 'Thinking word',
      value: thinkingWordEditing ? `${thinkingWordDraft ?? ''}▏` : thinkingWord,
      detail: thinkingWordEditing
        ? 'type a word · Enter ✓ · Esc ✗ (≤16, letters/digits/_/-)'
        : 'Status-bar working word · thinking/random = surprise me · ←/→ presets · Enter to type',
    },
    {
      label: 'Reasoning mode',
      value: reasoningMode,
      detail: 'auto (provider default) | on | off',
    },
    {
      label: 'Reasoning effort',
      value: reasoningEffort,
      detail:
        reasoningEffortLevels !== undefined && reasoningEffortLevels.length === 0
          ? 'not adjustable for this model'
          : reasoningEffortLevels?.length
            ? `documented for this model: ${reasoningEffortLevels.join(' · ')}`
            : 'none–max (model-dependent)',
    },
    {
      label: 'Preserve thinking',
      value: boolVal(reasoningPreserve),
      detail: 'Keep reasoning across turns',
    },
    {
      label: 'Cache TTL',
      value: cacheTtl,
      detail: 'Prompt cache TTL (5m | 1h)',
    },
    // ── Context ──
    { section: 'Context' },
    {
      label: 'Auto-compact',
      value: boolVal(contextAutoCompact),
      detail: 'Auto-compact context when thresholds crossed',
    },
    {
      label: 'Compactor strategy',
      value: contextStrategy,
      detail: 'hybrid (fast) | intelligent (LLM) | selective',
    },
    {
      label: 'Context mode',
      value: contextMode,
      detail: CONTEXT_MODE_DESCS[contextMode],
    },
    // ── Fleet ──
    { section: 'Fleet' },
    {
      label: 'Max concurrent',
      value: maxConcurrent === 0 ? 'default' : String(maxConcurrent),
      detail: 'Max subagents (0 = default)',
    },
    // ── Logging ──
    { section: 'Logging' },
    {
      label: 'Log level',
      value: logLevel,
      detail: 'Console log verbosity',
    },
    {
      label: 'Audit level',
      value: auditLevel,
      detail: 'minimal | standard | full (large)',
    },
    // ── Debug ──
    { section: 'Debug' },
    {
      label: 'Stream debug logging',
      value: boolVal(debugStream),
      detail: 'Hex-dump raw SSE bytes to stderr',
    },
    {
      label: 'Statusline',
      value: statuslineMode,
      detail: STATUSLINE_MODE_DESCS[statuslineMode],
    },
    {
      label: 'Config scope',
      value: configScope,
      detail: 'global (~/.wrongstack/) or project (.wrongstack/)',
    },
    {
      label: 'Animation',
      value: animationStyle,
      detail: formatAnimationStyle(animationStyle),
    },
    // ── Safety ──
    { section: 'Safety' },
    {
      label: 'Circuit breaker',
      value: boolVal(breakerEnabled),
      detail: 'Gate bash/exec after repeated failures',
    },
    {
      label: 'Breaker timeout',
      value: formatBreakerTimeout(breakerAutoKillResetMs),
      detail: 'Auto kill/reset delay when tripped (manual = /kill reset)',
    },
    // ── Display ──
    { section: 'Display' },
    {
      label: 'Show model reasoning',
      value: boolVal(showModelReasoning),
      detail: 'Show LLM reasoning blocks in chat history',
    },
    {
      label: 'Agent swarm panel',
      value: showAgentSwarmPanel,
      detail: 'bottom = lower region, sidebar = right sidebar, off = hidden',
    },
    {
      label: 'Pre-refine countdown',
      value: formatPreRefineSeconds(preRefineSeconds),
      detail: 'Grace period before refiner starts (0 = skip)',
    },
    // Appended to preserve the established field indices used by settings
    // reducers, slash commands, and persisted lastSettingsField values.
    {
      label: 'Read symbols',
      value: boolVal(readSymbols),
      detail: 'Include codebase-index symbols in read tool results',
    },
    {
      label: 'Show SAGE Memory Inject',
      value: boolVal(showSageMemoryInject),
      detail: 'Show SAGE memory injection blocks in tool results',
    },
    {
      label: 'SAGE Memory Inject threshold',
      value: formatSageThreshold(sageMemoryInjectThreshold),
      detail: 'Min relation strength for injection (0.72–0.95)',
    },
    {
      label: 'Nextsteps tool',
      value: boolVal(nextStepsTool),
      detail: 'Let the agent record <nextsteps> via a tool call (next session)',
    },
    // ── Panels (fields 46–58) ─────────────────────────────────────────────
    // One row per PanelId in PANEL_IDS order. SETTINGS_FIELD_LABELS indexes
    // 46..58 must stay in lock-step with PANEL_IDS — the resolveSettingsFieldValue
    // switch and the reducer's settingsValueChange arrow-key path both
    // index `PANEL_IDS[field - PANEL_POSITION_FIELD_START]` for these rows. ←/→ cycles the value
    // between 'bottom' (F-key) and 'sidebar' (right sidebar) — the
    // renderer (sidebar.tsx + overlay-key-router) reads `panelPositions`
    // at render time to decide where each panel surfaces.
    { section: 'Panels' },
    ...PANEL_IDS.map((panelId, i) => ({
      label: SETTINGS_FIELD_LABELS[PANEL_POSITION_FIELD_START + i] ?? panelId,
      value: panelPositions[panelId],
      detail:
        panelPositions[panelId] === 'sidebar'
          ? 'Render in right sidebar'
          : 'Render in lower F-key region',
    })),
    // ── Integrations (fields 59–60) ─────────────────────────────────────
    // WrongProxy / WrongTrace. Appended at the end so the existing
    // field indices 0–58 (including the panel-position block 46–58)
    // remain stable. The runtime probe (see
    // `runtime-controller-deps.ts:applyLiveSettings`) reads both keys
    // from the same picker slice so mid-session state stays coherent.
    { section: 'Integrations' },
    {
      label: 'WrongProxy / WrongTrace',
      value: boolVal(wrongProxyEnabled),
      detail:
        'Route base URLs through the local proxy (default http://localhost:3444). openai-codex is excluded.',
    },
    {
      label: 'WrongProxy URL',
      value: wrongProxyUrlEditing ? `${wrongProxyUrlDraft ?? ''}▏` : wrongProxyUrl,
      detail: wrongProxyUrlEditing
        ? 'type a URL · Enter ✓ · Esc ✗ (http://host:port or https://host:port)'
        : 'Where the local proxy daemon listens. Probed at <url>/api/health every 30s.',
    },
    // Second display-ish block (fields 61-62, appended after Integrations).
    // A distinct name: two "Display" headers in one list read as a glitch.
    { section: 'Layout' },
    {
      label: 'Right sidebar',
      value: `${boolVal(showSidebar ?? true)}${sidebarPinned ? ' · pinned' : ''}`,
      detail: sidebarPinned
        ? 'A panel is routed to the sidebar — set that panel to bottom to unlock hiding'
        : 'Show or hide the right sidebar in the TUI (chat history takes full width when off)',
    },
    toolResultViewSettingRow(toolResultViewMode),
    { section: 'Agent guidance' },
    {
      label: 'Tool Coach',
      value: boolVal(featureToolCoach),
      detail: 'Suggest enabled tools and guide recovery after tool errors (default on)',
    },
    {
      label: 'Require next steps',
      value: boolVal(nextStepsRequired),
      detail: 'Every finished turn ends with <nextsteps> or a completion marker (/nextsteps)',
    },
    { section: 'Startup' },
    {
      label: 'Reuse startup choices',
      value: boolVal(rememberStartupChoices),
      detail:
        'On: launch with the last model, system prompt and mode/YOLO/autonomy without asking. Off: ask every launch',
    },
    {
      label: 'System prompt',
      value: SYSTEM_PROMPT_CHOICE_LABELS[nextSystemPromptVariant] ?? nextSystemPromptVariant,
      detail:
        'Lite / Standard / Pro / Scout — applies from the next session; this session keeps its current prompt',
    },
    { section: 'Selection' },
    {
      label: 'Chat selection',
      value: selectionMode === 'text' ? 'Text' : 'Block',
      detail: 'Drag and release to copy whole blocks or only the selected text',
    },
  ];
}
