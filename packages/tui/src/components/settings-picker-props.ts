import type {
  AnimationStyleChoice,
  AuditLevel,
  CacheTtl,
  CompactorStrategy,
  ConfigScope,
  ContextMode,
  EnhanceLanguage,
  FleetChatVerbosityTui,
  LogLevel,
  ReasoningEffort,
  ReasoningMode,
  SettingsMode,
  StatuslineMode,
  TokenSavingTierTui,
  ToolResultViewMode,
} from './settings-picker-model.js';
import type { SettingsPickerRowData } from './settings-picker-row-list.js';

export interface SettingsPickerProps {
  /** Focused row index. */
  field: number;
  // ── Autonomy ──
  mode: SettingsMode;
  delayMs: number;
  // ── UX ──
  titleAnimation: boolean;
  yolo: boolean;
  fleetChat: FleetChatVerbosityTui;
  chime: boolean;
  confirmExit: boolean;
  nextPrediction: boolean;
  // ── Features ──
  featureMcp: boolean;
  featurePlugins: boolean;
  featureMemory: boolean;
  featureSkills: boolean;
  featureModelsRegistry: boolean;
  featureToolCoach: boolean;
  /** Token-saving tier: off | minimal | light | medium | aggressive. */
  tokenSavingTier: TokenSavingTierTui;
  /** Allow tools to read/write paths outside the project root directory. Default: true. */
  allowOutsideProjectRoot: boolean;
  // ── Tools ──
  maxIterations: number;
  /** Maximum auto-proceed iterations before stopping (0 = unlimited). */
  autoProceedMaxIterations: number;
  /** Prompt refinement preview countdown (ms). Cycled via ENHANCE_DELAY_PRESETS. */
  enhanceDelayMs: number;
  /** Enable/disable prompt refinement. */
  enhanceEnabled: boolean;
  /** Default language for refinement: original (keep user's language) or english. */
  enhanceLanguage: EnhanceLanguage;
  /** Pre-refine grace countdown (seconds). 0 = skip. */
  preRefineSeconds: number;
  /** Run incremental index at session start. */
  indexOnStart: boolean;
  /** User-tunable cutoff for the multi-file diff summary footer. 0 = off. */
  multiDiffSummaryThreshold: number;
  // ── Reasoning ──
  /** Thinking word displayed in status bar while agent is working. */
  thinkingWord: string;
  /** True while the user is free-text editing the thinking word (Enter on the row). */
  thinkingWordEditing?: boolean | undefined;
  /** In-progress text buffer shown while `thinkingWordEditing`. */
  thinkingWordDraft?: string | undefined;
  /** Reasoning mode: auto (provider default) | on | off. */
  reasoningMode: ReasoningMode;
  /** Reasoning effort level. */
  reasoningEffort: ReasoningEffort;
  /** Effort levels the active model documents (absent = undocumented). */
  reasoningEffortLevels?: string[] | undefined;
  /** Preserve thinking across turns. */
  reasoningPreserve: boolean;
  /** Prompt cache TTL. */
  cacheTtl: CacheTtl;
  // ── Context ──
  contextAutoCompact: boolean;
  contextStrategy: CompactorStrategy;
  contextMode: ContextMode;
  // ── Fleet ──
  maxConcurrent: number;
  // ── Logging ──
  logLevel: LogLevel;
  auditLevel: AuditLevel;
  // ── Safety ──
  /** Whether the process circuit breaker gates bash/exec. */
  breakerEnabled: boolean;
  /** Auto kill/reset delay (ms) when the breaker trips. 0 = manual recovery. */
  breakerAutoKillResetMs: number;
  /** Show the "Model Reasoning" blocks in chat history. Default: true. */
  showModelReasoning: boolean;
  toolResultViewMode: ToolResultViewMode;
  /** Agent swarm placement. */
  showAgentSwarmPanel: import('../app-settings-type.js').AgentSwarmPanelMode;
  /** Right sidebar master toggle. */
  showSidebar?: boolean | undefined;
  /** Show SAGE Memory Inject blocks in tool results. Default: false. */
  showSageMemoryInject: boolean;
  /** Minimum relation strength for SAGE memory injection. Default: 0.85. */
  sageMemoryInjectThreshold: number;
  /** Register the leader's agent-callable `nextsteps` tool. Default: false. */
  nextStepsTool: boolean;
  /** Leader must end every finished turn with <nextsteps> or the completion marker (`autonomy.nextSteps: 'required'`). Default: true. */
  nextStepsRequired: boolean;
  /** Launch with the last model, system prompt and mode/YOLO/autonomy instead of asking (`launch.rememberStartupChoices`). Default: true. */
  rememberStartupChoices: boolean;
  /** System prompt the NEXT session starts with (`systemPrompt.variant` in the profile config); the running session keeps its own. */
  nextSystemPromptVariant: 'lite' | 'default' | 'pro' | 'scout';
  // ── Tools ──
  /** When true, read tool includes codebase-index symbols alongside file content. */
  readSymbols: boolean;
  /**
   * Per-panel placement map (F-key bottom vs right sidebar). One picker row
   * per PanelId in PANEL_IDS order; each row cycles 'bottom' ↔ 'sidebar'.
   */
  panelPositions: import('../ui-contracts.js').PanelPositionMap;
  // ── Integrations ──
  /**
   * WrongProxy / WrongTrace: master switch. When true AND the daemon at
   * `wrongProxyUrl` is reachable, every provider's base URL is rewritten
   * through `${wrongProxyUrl}/proxy/<host><path>`. openai-codex is
   * excluded by spec. Toggled on the row at field index 59.
   */
  wrongProxyEnabled: boolean;
  /**
   * WrongProxy / WrongTrace URL. Default `http://localhost:3444`. Text
   * field (Enter on the row opens an inline edit). Picker field 60.
   */
  wrongProxyUrl: string;
  /** True while free-text editing the WrongProxy URL (Enter on its row). */
  wrongProxyUrlEditing: boolean;
  /** In-progress text buffer while `wrongProxyUrlEditing`. */
  wrongProxyUrlDraft: string;
  // ── Debug ──
  /** Raw SSE stream debugging toggle — hex-dump every byte received from providers. */
  debugStream: boolean;
  /** Statusline density: minimum single-line or detailed multi-line. */
  statuslineMode: StatuslineMode;
  /** Where settings are persisted. */
  configScope: ConfigScope;
  /** Active profile config path used when {@link configScope} is global. */
  profileConfigPath?: string | undefined;
  /**
   * Animation style for the status bar's working/thinking chip.
   * One of the AnimationStyle values, or 'cycle' to rotate through variants.
   */
  animationStyle: AnimationStyleChoice;
  /**
   * Live filter for the row-search modal (entered via `/`). When non-empty,
   * the picker renders only matching rows. The leading `/` is part of the
   * value (matches fzf/vim convention) — the matcher strips it before
   * matching against row labels.
   */
  filter?: string | undefined;
  /**
   * Real rendered height of the Input box below the picker (rows).
   * When omitted, defaults to 3 (single-line prompt + 2 border/padding
   * rows). Passed from AppView so the picker's height budget accounts
   * for multi-line input buffers instead of assuming a constant.
   */
  inputHeight?: number | undefined;
  maxRows?: number | undefined;
  columns?: number | undefined;
  hint?: string | undefined;
  /** @internal Test seam for asserting the production row/header layout contract. */
  onLayoutComputed?:
    | ((layout: {
        rows: readonly SettingsPickerRowData[];
        fieldRowIndex: readonly number[];
      }) => void)
    | undefined;
}
