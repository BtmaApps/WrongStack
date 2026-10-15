# WebUI UX Improvements — Software Design Document

**Spec ID:** `webui-ux-improvements-v1`  
Version: 1.0.0  
**Created:** 2026-10-15  
**Status:** Proposed  
**Template:** SDD feature  
**Owner:** WebUI maintainers  
**Scope:** `packages/webui`, WebUI browser-smoke tests, and WebUI locale catalogs

---

## Overview

WrongStack WebUI is a feature-rich operator workbench for long-running, keyboard-heavy AI-agent workflows. Its current architecture already provides semantic design tokens, Calm/Full density modes, virtualized chat, session-preserving parked views, responsive side panels, internationalization, reduced-motion behavior, and accessible dialog primitives.

The primary UX gap is not missing capability. It is the cost of discovering and entering that capability: first-run decisions compete with the primary prompt workflow; navigation metadata is distributed across several lists; the command palette is comprehensive but weakly ranked; global accelerators are disabled for new profiles; mobile retains desktop-oriented navigation; Activity Bar customization depends on pointer drag; and some visible runtime strings bypass locale catalogs.

This specification improves task entry, information architecture, navigation, keyboard and mobile operation, localization, status feedback, and measurable perceived performance without replacing the existing design system or changing backend domain behavior.

### Goals

1. Reduce the path from an empty session to the first meaningful prompt.
2. Make every primary WebUI capability discoverable through coherent, task-oriented navigation.
3. Preserve expert efficiency through ranked commands and safe keyboard accelerators.
4. Make mobile navigation and Activity Bar customization operable without pointer drag.
5. Remove remaining locale leaks and standardize asynchronous status feedback.
6. Add privacy-preserving, local performance evidence for the key journeys.
7. Establish a repeatable browser UX gate across viewport, theme, locale, motion, and state.

### Non-goals

- Redesigning the established operator-workbench visual identity.
- Replacing the semantic tokens, square geometry, palette system, or typography system.
- Changing agent execution, provider, tool, SAGE, Kanban, SDD, or mailbox domain contracts.
- Adding a third-party analytics service or sending UX telemetry over the network.
- Adding a new UI framework, state library, fuzzy-search dependency, or test runner.
- Replacing the desktop Activity Bar for desktop viewports.
- Reworking SimpleUI, TUI, Desktop shell menus, or HQ.
- Automatically submitting starter prompts without a user send action.

### Product invariants

- `packages/webui/src/index.css` remains the source of truth for semantic color, type, focus, radius, shadow, and reduced-motion behavior.
- The existing `View` union and `VIEW_REGISTRY` exhaustiveness guards remain live and non-vacuous.
- Chat drafts, image attachments, file references, transcript scroll position, and session-tab state survive permitted view transitions.
- New-session system-prompt semantics remain distinct from first-message selection semantics.
- Bug Hunter and Performance Run preserve their existing solo/read-only rules and prompt-loading contracts.
- Existing persisted user choices are not silently overwritten by migrations.
- User-visible text is translated through the existing seven-locale catalog system.
- Every new or modified hand-maintained file remains at or below 800 physical lines.

---

## Requirements

- [critical][ux] **R1 — Task-first empty session:** An empty session presents a direct route to composing the first prompt, while Bug Hunter, Performance Run, solo-session controls, and other advanced launchers remain available through progressive disclosure.
- [critical][functional] **R2 — Safe first-message system-prompt gate:** If no system-prompt variant has been chosen, the first send is paused before network submission, the choice is collected, and confirm or cancel preserves single-send and draft-ownership invariants.
- [critical][functional] **R3 — Canonical workbench catalog:** Standalone views expose navigation label, group, icon, search metadata, and default prominence through one typed catalog consumed by Activity Bar, Tools Launcher, and Command Palette.
- [high][ux] **R4 — Ranked command discovery:** Command Palette ranking accounts for exact matches, token prefixes, multi-token matches, active context, and bounded recent usage while preserving the existing combobox accessibility contract.
- [high][ux] **R5 — Safe accelerators for new profiles:** Safe global accelerators are enabled for new profiles, existing persisted preferences are preserved, and editing surfaces continue to suppress conflicting shortcuts.
- [critical][ux] **R6 — Mobile workbench navigation:** Below the shared mobile breakpoint, the desktop Activity Bar is replaced by an accessible menu that reaches all core panels and standalone views without reducing the primary work area.
- [high][ux] **R7 — Non-drag customization:** Activity Bar ordering can be changed and reset with keyboard- and touch-operable controls while retaining pointer drag on desktop if desired.
- [high][ux] **R8 — Locale-complete visible runtime copy:** Chat, status, health, iteration, unread-count, and remaining workbench copy are sourced from the seven-locale catalogs with correct pluralization.
- [high][ux] **R9 — Consistent asynchronous feedback:** Long-running and asynchronous actions provide timely, non-duplicative, assistive-technology-readable feedback without making the application excessively chatty.
- [high][performance] **R10 — Local user-centric performance evidence:** Key UX transitions emit bounded local Performance API measurements without recording user content or transmitting data.
- [critical][non-functional] **R11 — Browser UX quality gate:** Primary journeys are exercised at representative viewport, theme, locale, motion, keyboard, and application states with overflow, focus, console, and responsiveness assertions.
- [critical][non-functional] **R12 — Regression and architecture safety:** The implementation preserves design-token, i18n, navigation, typecheck, test, file-length, and no-new-dependency constraints.

## Existing implementation boundaries

### Application shell and viewport

- `packages/webui/src/App.tsx` owns the global shell, Activity Bar, mobile sidebar modality, top bar, view routing, and global overlays.
- `packages/webui/src/hooks/useViewport.ts` owns the shared `768px` mobile and `640px` small-screen thresholds.
- `packages/webui/src/components/WorkbenchTopbar.tsx` owns distinct mobile and desktop headers.

### Task entry and chat

- `packages/webui/src/components/WelcomeScreen.tsx` owns empty-session content, task launchers, provider setup CTA, and solo-session selection.
- `packages/webui/src/components/ChatInput.tsx` owns the composer surface and composes submit, mention, attachment, refine, model, and prompt-library behavior.
- `packages/webui/src/components/ChatInput/use-chat-submit.ts` owns send/queue/steer/btw/abort submission behavior.
- `packages/webui/src/components/SystemPromptDialog.tsx` owns system-prompt selection for both new-session and first-run cases.
- `packages/webui/src/stores/system-prompt-store.ts` owns catalog state and per-session selection state.

### Navigation and discovery

- `packages/webui/src/stores/ui-store-types.ts` owns the canonical `View` union.
- `packages/webui/src/components/view-registry.ts` owns view rendering metadata and compile-time route coverage.
- `packages/webui/src/components/activity-bar/activity-bar-items.tsx` owns current Activity Bar panel/view definitions and responsive capacity.
- `packages/webui/src/components/activity-bar/tools-launcher.tsx` owns the Calm-mode grouped tool map.
- `packages/webui/src/components/CommandPalette/index.tsx` owns curated commands, slash-command projection, session-history projection, filtering, and combobox interaction.

### Design, locale, and tests

- `packages/webui/src/index.css` owns semantic design tokens and reduced-motion behavior.
- `packages/webui/src/i18n/locales/*` owns seven locale catalogs.
- `packages/webui/tests/lib/theme-color-boundaries.test.ts` guards semantic color use.
- `packages/webui/tests/lib/english-leak-boundaries.test.ts` guards hardcoded visible English.
- `packages/webui/tests/i18n/catalog-integrity.test.ts` guards locale-key parity.
- Existing browser-smoke scripts provide reusable Vite/WebSocket fixtures and viewport checks.

---

## Architecture

### A1. Task-first welcome composition

`WelcomeScreen` is split by responsibility instead of accumulating additional conditional UI:

- `WelcomeScreen/ProjectSummary.tsx` — project, model, provider, and working-directory context.
- `WelcomeScreen/TaskStarters.tsx` — localized starter prompts that populate and focus the composer but never auto-submit.
- `WelcomeScreen/AdvancedLaunchers.tsx` — existing Bug Hunter, Performance Run, and solo-session controls.

A starter prompt uses the existing `promptInsertRequest` path so draft ownership remains centralized in `ChatInput`. If a non-empty draft exists, insertion must use an explicit append/replace decision or the existing safe insertion behavior; it must not silently overwrite text.

### A2. First-message prompt gate

The first-message gate is modeled as a small state machine:

```text
idle
  -> submit requested
  -> variant already chosen: submit
  -> variant not chosen: pending-choice
pending-choice
  -> confirm: apply variant -> resume exactly once -> submitted
  -> cancel: return focus -> idle with draft unchanged
  -> session change/unmount: discard pending intent -> idle
```

The gate must not reuse `pickerStartsSession`; new-session confirmation still applies a variant and calls `session.new`, while first-message confirmation resumes only the pending composer submission. Pending submit intent is transient and session-scoped; it is not persisted.

A dedicated hook, `useFirstRunPromptGate`, should isolate this orchestration from `App.tsx` and `SystemPromptDialog.tsx`. It may use an in-memory resolver or explicit state callbacks, but must never persist functions or pending prompt content in localStorage.

### A3. Typed workbench catalog

Create `packages/webui/src/lib/workbench-catalog.tsx` as the single navigation metadata source for panels and standalone views. Each entry declares:

```ts
interface WorkbenchCatalogEntry {
  id: Activity | View;
  kind: 'panel' | 'view';
  group: 'work' | 'knowledge' | 'quality' | 'system';
  labelKey: string;
  icon: ReactElement;
  keywords: readonly string[];
  defaultPriority: number;
  launcher: boolean;
  activityBar: boolean;
  diagnostic?: boolean;
  drillDown?: boolean;
}
```

Rendering metadata remains in `view-registry.ts`; the catalog must not import lazy view components. Compile-time/test coverage proves that every standalone navigable view appears exactly once and that setup/drill-down/internal views are intentionally excluded.

### A4. Palette ranking without a dependency

Extract a pure `rankPaletteItems` function. Ranking order is deterministic:

1. exact normalized label;
2. label token prefix;
3. all query tokens matched across label, hint, category, or keywords;
4. active-view contextual boost;
5. bounded recent-use boost;
6. general substring match;
7. stable original order as the final tie-breaker.

Recent usage stores item IDs only, with a maximum of 10 entries. It stores no prompt, path, session title, provider credential, or command argument.

### A5. Mobile navigation

At widths below `MOBILE_BREAKPOINT`, `AppInner` does not render the desktop Activity Bar. `WorkbenchTopbar` opens `MobileWorkbenchMenu`, built from the canonical workbench catalog. The menu exposes core panels and grouped standalone views, announces the active destination, closes on selection, traps focus while open, and restores focus to its trigger.

The existing sidebar continues to act as contextual panel content. Opening a panel through the mobile menu uses the existing navigation helpers and therefore preserves panel/view coupling.

### A6. Accessible customization

`ActivityBarCustomizeDialog` presents ordered panel/view lists with native Move Up, Move Down, and Reset buttons. Locked core panels are described but cannot move. Pointer drag may remain as a desktop accelerator; it is no longer the only route.

### A7. Local UX performance measurements

`ux-performance.ts` wraps `performance.mark` and `performance.measure` behind support checks and bounded names. It records durations only. Initial measures:

- `webui:first-composer-ready`;
- `webui:prompt-submit-feedback`;
- `webui:view-open:<view>`;
- `webui:transcript-restore`;
- `webui:palette-search-result`.

The wrapper must be no-op safe during SSR/jsdom and must not emit network requests.

---

## User journeys and state coverage

### J1. First prompt

1. User opens an empty configured session.
2. Composer and starter tasks are immediately available.
3. User types or inserts a starter.
4. First send opens system-prompt selection only when a choice is still required.
5. Confirm submits once; cancel returns to the unchanged draft.

Recovery states: disconnected, no provider, unavailable prompt catalog, session switch during selection, and component unmount.

### J2. Find and open a tool

1. User opens Command Palette or Tools Launcher.
2. User searches with one or multiple tokens.
3. Contextual and recent relevant results rank above generic substring matches.
4. Keyboard selection opens the target and focus lands in the target surface.

Recovery states: no results, stale recent ID, removed view, disabled shortcut preference.

### J3. Mobile navigation

1. User opens the mobile workbench menu.
2. User selects a panel or standalone view.
3. Menu closes and restores a coherent focus target in the destination.
4. Draft and transcript scroll state are unchanged.

Recovery states: resize while open, Escape/back close, disconnected state, long localized labels.

### J4. Customize navigation

1. User opens customization.
2. User moves an unlocked entry with keyboard or touch.
3. Focus stays on the moved entry.
4. Order updates immediately and persists across reload.
5. Reset returns to delivery defaults.

Recovery states: first/last item, locked entry, corrupt persisted order, new catalog entry after an older saved order.

---

## Acceptance Criteria

### AC-R1 — Task-first empty session

- The primary composer or an explicit composer-focus action is visible before advanced launchers.
- Exactly three initial task starters cover understanding, debugging, and implementation.
- Selecting a starter populates the draft and focuses the textarea without sending.
- A non-empty draft is never silently overwritten.
- Bug Hunter and Performance Run retain their existing behavioral tests.
- Provider-missing state presents one clear setup path and explains why execution actions are unavailable.

### AC-R2 — First-message prompt gate

- The system-prompt dialog no longer opens automatically merely because the page rendered.
- An unchosen first send produces zero outbound user-message frames until confirmation.
- Confirm resumes the pending submission exactly once.
- Cancel preserves draft text, images, PDFs, file references, and textarea focus.
- Session switch or unmount discards pending submit intent without sending.
- New-session `pickerStartsSession` behavior is unchanged.

### AC-R3 — Canonical workbench catalog

- Every standalone navigable view is represented exactly once.
- Internal, setup, parked, and drill-down views are explicitly excluded.
- Activity Bar, Tools Launcher, mobile menu, and palette view entries consume catalog metadata.
- Removing a required catalog entry fails typecheck or a focused coverage test.
- `VIEW_REGISTRY_STRICT` continues to use `satisfies`; its coverage guard remains live.

### AC-R4 — Ranked command discovery

- Exact matches rank first.
- Multi-token queries match tokens across metadata fields independent of order.
- Contextual items beat equally scored generic items.
- Recent history is capped at 10 valid item IDs and ignores removed IDs.
- Empty results plus Enter executes nothing.
- `aria-activedescendant` always resolves to the sole selected option.

### AC-R5 — Safe accelerators

- New profiles enable the approved safe shortcut set.
- Persisted `keyboardShortcuts: false` remains false after migration.
- Single-key shortcuts do not fire inside input, textarea, Monaco, or contenteditable surfaces.
- Open dialogs receive Escape before run-abort handling.
- Users can disable global shortcuts through existing settings.

### AC-R6 — Mobile navigation

- Desktop Activity Bar is absent below `MOBILE_BREAKPOINT` and unchanged above it.
- Chat, Files, Changes, Mailbox, Agents, and all standalone catalog views are reachable.
- Menu items have at least 44px target height.
- Opening the menu makes the background inert; closing restores trigger focus.
- 320px and 390px journeys have no horizontal document overflow.

### AC-R7 — Non-drag customization

- Every movable item exposes keyboard-operable Move Up and Move Down controls.
- Invalid directions are disabled at list boundaries.
- Locked core panels cannot be moved and expose an accessible explanation.
- Focus follows the moved item.
- Persistence, corrupt-value coercion, appended-new-entry behavior, and Reset are tested.

### AC-R8 — Locale completeness

- Visible chat, unread, restore, iteration, health, and readiness copy uses catalog keys.
- Counts use locale pluralization rather than English suffix construction.
- All seven locale catalogs retain identical key shape.
- Product names, model identifiers, protocol values, logs, and file paths are not translated.
- English-leak and catalog-integrity gates pass with no new exemption.

### AC-R9 — Asynchronous feedback

- User actions expected to exceed 100ms display accepted/busy feedback within 100ms under the test fixture.
- Success/progress uses polite status semantics; time-sensitive failures use alert semantics.
- The same event is not simultaneously announced by multiple live regions without a documented reason.
- Streaming text remains protected by the existing log-region `aria-busy` behavior.
- Reduced-motion mode retains equivalent textual/state information.

### AC-R10 — Local performance evidence

- Unsupported Performance APIs degrade to no-op without throwing.
- Durations contain no prompt text, file path, model credential, session title, or message content.
- Measures are bounded and do not grow an unbounded in-memory list.
- No fetch, WebSocket, beacon, storage, or third-party analytics write is introduced.

### AC-R11 — Browser UX gate

- Journeys run at 320x720, 390x844, 768x900, and 1366x900.
- Light/dark, Calm/Full, English/Turkish, and normal/reduced-motion states are represented.
- First prompt, palette navigation, mobile navigation, and non-drag customization are exercised.
- Tests fail on document horizontal overflow, lost focus, console errors, unhandled rejections, and undersized mobile primary targets.

### AC-R12 — Regression and architecture safety

- No new runtime dependency is added.
- Changed source, test, configuration, and documentation files remain at or below 800 lines unless generated/exempt.
- Typecheck, focused tests, full WebUI tests, lint, build, theme boundary, locale boundary, and browser UX smoke pass.
- Final diff contains no unrelated formatting or generated output.

---

## Implementation Tasks

Canonical companion graph: [`webui-ux-improvements.task-graph.json`](webui-ux-improvements.task-graph.json).

Task dependency semantics are canonical **dependency -> dependent**. The `Depends on` field lists blockers; the edge table below renders the same relation as `from -> to`.

### WUX-S0.1 — Establish the WebUI UX browser baseline

- **Sprint:** 0
- **Type:** test
- **Priority:** critical
- **Depends on:** none
- **Requirements:** R11, R12
- **Expected files:**
  - `packages/webui/tests/ux-shell-browser-smoke.mjs`
  - `packages/webui/tests/helpers/ux-shell-fixture.mjs` if shared fixture extraction is necessary
- **Work:** Reuse existing browser-smoke conventions to cover the viewport/theme/locale/motion matrix, overflow, focus, target sizing, console errors, and the four primary journeys. Record current failures as baseline evidence before product edits.
- **Acceptance:** AC-R11 baseline scenarios execute deterministically; the harness does not require production credentials or external network.
- **Verification:** `bun packages/webui/tests/ux-shell-browser-smoke.mjs`

### WUX-S0.2 — Add privacy-preserving UX performance measures

- **Sprint:** 0
- **Type:** feature
- **Priority:** high
- **Depends on:** none
- **Requirements:** R10, R12
- **Expected files:**
  - `packages/webui/src/lib/ux-performance.ts`
  - `packages/webui/tests/lib/ux-performance.test.ts`
  - `packages/webui/src/components/MainViewSlot.tsx`
  - `packages/webui/src/components/ChatInput/use-chat-submit.ts`
  - `packages/webui/src/components/ChatView/index.tsx`
- **Work:** Implement safe Performance API wrappers and instrument the defined transition boundaries without storing content or transmitting measurements.
- **Acceptance:** AC-R10 passes in browser, jsdom, and unsupported-API fixtures.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/lib/ux-performance.test.ts`

### WUX-S1.1 — Refactor WelcomeScreen into a task-first empty state

- **Sprint:** 1
- **Type:** feature
- **Priority:** critical
- **Depends on:** WUX-S0.1
- **Requirements:** R1, R8, R12
- **Expected files:**
  - `packages/webui/src/components/WelcomeScreen.tsx`
  - `packages/webui/src/components/WelcomeScreen/ProjectSummary.tsx`
  - `packages/webui/src/components/WelcomeScreen/TaskStarters.tsx`
  - `packages/webui/src/components/WelcomeScreen/AdvancedLaunchers.tsx`
  - `packages/webui/tests/components/welcome-screen-task-starters.test.tsx`
  - existing WelcomeScreen Bug Hunter and Performance Run tests
- **Work:** Move the primary task entry ahead of advanced launchers, connect starters through the existing draft insertion path, and keep existing advanced execution contracts intact.
- **Acceptance:** AC-R1 passes; existing bug-hunt and performance-ratchet tests remain green.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/components/welcome-screen-task-starters.test.tsx tests/components/welcome-screen-bug-hunter.test.tsx tests/components/welcome-screen-perf-ratchet.test.tsx`

### WUX-S1.2 — Gate the first send instead of page render

- **Sprint:** 1
- **Type:** refactor
- **Priority:** critical
- **Depends on:** WUX-S1.1
- **Requirements:** R2, R9, R12
- **Expected files:**
  - `packages/webui/src/App.tsx`
  - `packages/webui/src/hooks/useFirstRunPromptGate.ts`
  - `packages/webui/src/components/SystemPromptDialog.tsx`
  - `packages/webui/src/components/ChatInput/use-chat-submit.ts`
  - `packages/webui/src/stores/system-prompt-store.ts`
  - `packages/webui/tests/components/chat-input-first-run-gate.test.tsx`
  - `packages/webui/tests/components/system-prompt-dialog.test.tsx`
  - `packages/webui/tests/components/chat-input-submit-draft-restore.test.ts`
- **Work:** Remove render-time first-run opening and implement the session-scoped pending-submit state machine, including confirm, cancel, reconnect, unmount, and session-switch paths.
- **Acceptance:** AC-R2 and the relevant AC-R9 feedback requirements pass.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/components/chat-input-first-run-gate.test.tsx tests/components/system-prompt-dialog.test.tsx tests/components/chat-input-submit-draft-restore.test.ts`

### WUX-S2.1 — Introduce the typed workbench catalog

- **Sprint:** 2
- **Type:** refactor
- **Priority:** critical
- **Depends on:** WUX-S0.1
- **Requirements:** R3, R12
- **Expected files:**
  - `packages/webui/src/lib/workbench-catalog.tsx`
  - `packages/webui/src/components/activity-bar/activity-bar-items.tsx`
  - `packages/webui/src/components/activity-bar/tools-launcher.tsx`
  - `packages/webui/src/components/CommandPalette/index.tsx`
  - `packages/webui/src/components/view-registry.ts`
  - `packages/webui/src/stores/ui-store-types.ts`
  - `packages/webui/tests/lib/workbench-catalog.test.ts`
  - existing activity-bar and navigation tests
- **Work:** Centralize navigation metadata without moving render metadata or weakening `View`/registry exhaustiveness checks.
- **Acceptance:** AC-R3 passes; Tools Launcher still lists every standalone view exactly once.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/lib/workbench-catalog.test.ts tests/components/activity-bar-calm.test.tsx tests/components/activity-bar-responsive.test.ts tests/lib/view-navigation.test.ts`

### WUX-S2.2 — Add deterministic palette ranking and bounded recents

- **Sprint:** 2
- **Type:** feature
- **Priority:** high
- **Depends on:** WUX-S2.1
- **Requirements:** R4, R8, R12
- **Expected files:**
  - `packages/webui/src/components/CommandPalette/rank-items.ts`
  - `packages/webui/src/components/CommandPalette/palette-history.ts`
  - `packages/webui/src/components/CommandPalette/index.tsx`
  - `packages/webui/tests/components/command-palette-ranking.test.ts`
  - `packages/webui/tests/components/command-palette-combobox.test.tsx`
- **Work:** Replace substring-only ordering with pure ranked matching, active-context boosts, bounded item-ID recents, and stable tie-breaking.
- **Acceptance:** AC-R4 passes without regressing combobox semantics.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/components/command-palette-ranking.test.ts tests/components/command-palette-combobox.test.tsx`

### WUX-S2.3 — Enable safe shortcuts for new profiles

- **Sprint:** 2
- **Type:** feature
- **Priority:** high
- **Depends on:** WUX-S0.1
- **Requirements:** R5, R12
- **Expected files:**
  - `packages/webui/src/stores/local-prefs-defaults.ts`
  - `packages/webui/src/stores/local-prefs.ts`
  - `packages/webui/src/hooks/useGlobalKeyboardShortcuts.ts`
  - `packages/webui/src/components/ShortcutsOverlay.tsx`
  - `packages/webui/src/components/SettingsPanel/DisplaySection.tsx`
  - `packages/webui/tests/hooks/use-global-keyboard-shortcuts.test.tsx`
  - `packages/webui/tests/lib/global-shortcuts-section.test.ts`
- **Work:** Change only new-profile defaults, preserve persisted user choice, and verify suppression and modal precedence.
- **Acceptance:** AC-R5 passes for new, migrated, disabled, typing, Monaco, contenteditable, and open-dialog states.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/hooks/use-global-keyboard-shortcuts.test.tsx tests/lib/global-shortcuts-section.test.ts`

### WUX-S3.1 — Replace the mobile rail with a workbench menu

- **Sprint:** 3
- **Type:** feature
- **Priority:** critical
- **Depends on:** WUX-S2.1
- **Requirements:** R6, R8, R11, R12
- **Expected files:**
  - `packages/webui/src/components/MobileWorkbenchMenu.tsx`
  - `packages/webui/src/App.tsx`
  - `packages/webui/src/components/WorkbenchTopbar.tsx`
  - `packages/webui/src/hooks/useViewport.ts`
  - `packages/webui/src/lib/workbench-catalog.tsx`
  - `packages/webui/tests/components/mobile-workbench-menu.test.tsx`
  - `packages/webui/tests/hooks/useViewport.test.ts`
  - `packages/webui/tests/ux-shell-browser-smoke.mjs`
- **Work:** Hide the desktop Activity Bar below the shared breakpoint and expose all destinations through an accessible, catalog-driven mobile menu while preserving panel coupling and draft state.
- **Acceptance:** AC-R6 and mobile portions of AC-R11 pass at 320px and 390px.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/components/mobile-workbench-menu.test.tsx tests/hooks/useViewport.test.ts && bun packages/webui/tests/ux-shell-browser-smoke.mjs`

### WUX-S3.2 — Add non-drag Activity Bar customization

- **Sprint:** 3
- **Type:** feature
- **Priority:** high
- **Depends on:** WUX-S2.1
- **Requirements:** R7, R9, R12
- **Expected files:**
  - `packages/webui/src/components/activity-bar/ActivityBarCustomizeDialog.tsx`
  - `packages/webui/src/components/activity-bar/index.tsx`
  - `packages/webui/src/components/activity-bar/tools-launcher.tsx`
  - `packages/webui/tests/components/activity-bar-reorder.test.tsx`
- **Work:** Provide native reorder controls with focus retention, boundary disabling, locked-item semantics, immediate preview, persistence, and reset.
- **Acceptance:** AC-R7 passes using keyboard only and touch-equivalent click interactions.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/components/activity-bar-reorder.test.tsx tests/components/activity-bar-calm.test.tsx`

### WUX-S4.1 — Complete visible-copy localization and strengthen the leak gate

- **Sprint:** 4
- **Type:** refactor
- **Priority:** high
- **Depends on:** WUX-S0.1
- **Requirements:** R8, R12
- **Expected files:**
  - `packages/webui/src/components/ChatView/index.tsx`
  - `packages/webui/src/components/ChatView/SubagentTranscriptView.tsx`
  - `packages/webui/src/components/CheckpointTimeline.tsx`
  - `packages/webui/src/components/FleetPanel.tsx`
  - `packages/webui/src/components/SystemHealthChip.tsx`
  - `packages/webui/src/components/WorkbenchTopbar.tsx`
  - `packages/webui/src/components/KanbanWorkbench.tsx`
  - `packages/webui/src/components/UserInputDialog.tsx`
  - `packages/webui/src/i18n/locales/*/activity.json`
  - `packages/webui/tests/lib/english-leak-boundaries.test.ts`
  - `packages/webui/tests/i18n/catalog-integrity.test.ts`
  - `packages/webui/tests/components/chat-view-localization.test.tsx`
- **Work:** Move remaining visible runtime copy to catalogs, use plural rules, and expand the existing leak gate only enough to cover currently missed visible literal forms without broad false-positive exemptions.
- **Acceptance:** AC-R8 passes with no new English-leak exemption.
- **Verification:** `bun --cwd packages/webui --bun run vitest run tests/lib/english-leak-boundaries.test.ts tests/i18n/catalog-integrity.test.ts tests/components/chat-view-localization.test.tsx`

### WUX-S4.2 — Standardize asynchronous status feedback

- **Sprint:** 4
- **Type:** refactor
- **Priority:** high
- **Depends on:** WUX-S0.2, WUX-S1.2
- **Requirements:** R9, R10, R12
- **Expected files:**
  - `packages/webui/src/components/PanelSuspense.tsx`
  - `packages/webui/src/components/Toaster.tsx`
  - `packages/webui/src/components/ChatView/index.tsx`
  - `packages/webui/src/components/CommandPalette/index.tsx`
  - `packages/webui/src/components/ConnectionBanner.tsx`
  - focused component tests for changed feedback paths
- **Work:** Audit duplicate live regions, align status/alert semantics, add completion announcements where busy text merely disappears, and retain reduced-motion equivalence.
- **Acceptance:** AC-R9 passes without per-token streaming announcements or duplicate toaster/inline announcements.
- **Verification:** Focused Vitest files for each changed component plus the UX browser smoke.

### WUX-S5.1 — Establish and enforce UX performance budgets

- **Sprint:** 5
- **Type:** test
- **Priority:** high
- **Depends on:** WUX-S0.2, WUX-S1.2, WUX-S2.2, WUX-S3.1
- **Requirements:** R10, R11, R12
- **Expected files:**
  - `packages/webui/src/lib/ux-performance.ts`
  - `packages/webui/tests/ux-shell-browser-smoke.mjs`
  - `packages/webui/tests/page-scroll-browser-smoke.mjs`
  - optionally `packages/webui/src/components/DebugDashboard.tsx` for local inspection
- **Work:** Convert Sprint 0 observations into tolerant regression budgets for submit feedback, view shell feedback, palette ranking, transcript restore, and long transcript interaction.
- **Acceptance:** Budgets compare matched fixtures, avoid CI-flaky wall-clock precision, and fail on material regressions rather than incidental variance.
- **Verification:** UX shell and page-scroll browser smokes pass sequentially.

### WUX-S5.2 — Run the final WebUI UX acceptance gate

- **Sprint:** 5
- **Type:** test
- **Priority:** critical
- **Depends on:** WUX-S2.3, WUX-S3.2, WUX-S4.1, WUX-S4.2, WUX-S5.1
- **Requirements:** R1-R12
- **Expected files:**
  - no production file required unless the gate exposes an in-scope regression
  - verification report may be recorded alongside the implementation change or task evidence
- **Work:** Execute the complete verification matrix, review the final diff, check file lengths, and classify any remaining visual or environment limitation as unverified rather than passed.
- **Acceptance:** Every requirement has direct test or browser evidence; no Critical/High accessibility or journey blocker remains in the scoped surfaces.
- **Verification:** Run the full command set in the Verification Plan.

---

## Dependency Graph

Canonical edge direction: `dependency -> dependent`.

| From | To | Reason |
|---|---|---|
| WUX-S0.1 | WUX-S1.1 | First-use changes require a rendered baseline. |
| WUX-S1.1 | WUX-S1.2 | Submit gating builds on the task-first entry state. |
| WUX-S0.1 | WUX-S2.1 | Navigation consolidation requires baseline route coverage. |
| WUX-S2.1 | WUX-S2.2 | Palette view entries consume the canonical catalog. |
| WUX-S0.1 | WUX-S2.3 | Shortcut default changes require baseline keyboard journeys. |
| WUX-S2.1 | WUX-S3.1 | Mobile navigation consumes the canonical catalog. |
| WUX-S2.1 | WUX-S3.2 | Customization operates on canonical ordered entries. |
| WUX-S0.1 | WUX-S4.1 | Locale cleanup requires rendered baseline needles. |
| WUX-S0.2 | WUX-S4.2 | Status-feedback timing uses local UX measurements. |
| WUX-S1.2 | WUX-S4.2 | First-submit feedback participates in the unified contract. |
| WUX-S0.2 | WUX-S5.1 | Performance budgets require measurement infrastructure. |
| WUX-S1.2 | WUX-S5.1 | First-submit path must be measured after its final flow. |
| WUX-S2.2 | WUX-S5.1 | Palette budget applies after ranking is implemented. |
| WUX-S3.1 | WUX-S5.1 | Mobile navigation timing applies after the new menu exists. |
| WUX-S2.3 | WUX-S5.2 | Final gate covers new-profile shortcut behavior. |
| WUX-S3.2 | WUX-S5.2 | Final gate covers non-drag customization. |
| WUX-S4.1 | WUX-S5.2 | Final gate requires locale completeness. |
| WUX-S4.2 | WUX-S5.2 | Final gate requires status semantics. |
| WUX-S5.1 | WUX-S5.2 | Final gate consumes performance budgets. |

### Ready tasks

- `WUX-S0.1`
- `WUX-S0.2`

### Parallel groups

- Group A: `WUX-S0.1` || `WUX-S0.2`
- Group B after `WUX-S0.1`: `WUX-S1.1` || `WUX-S2.1` || `WUX-S2.3` || `WUX-S4.1`
- Group C after `WUX-S2.1`: `WUX-S2.2` || `WUX-S3.1` || `WUX-S3.2`
- Group D after prerequisites: `WUX-S4.2` || remaining Group C work
- Final sequence: `WUX-S5.1` -> `WUX-S5.2`

### Critical paths

No `estimateHours` values are assigned, so critical-path comparison is unit-weighted. The DAG has four equal longest paths:

```text
WUX-S0.1 -> WUX-S1.1 -> WUX-S1.2 -> WUX-S4.2 -> WUX-S5.2
WUX-S0.1 -> WUX-S1.1 -> WUX-S1.2 -> WUX-S5.1 -> WUX-S5.2
WUX-S0.1 -> WUX-S2.1 -> WUX-S2.2 -> WUX-S5.1 -> WUX-S5.2
WUX-S0.1 -> WUX-S2.1 -> WUX-S3.1 -> WUX-S5.1 -> WUX-S5.2
```

`WUX-S0.1` is the primary bottleneck. `WUX-S2.1` is the secondary bottleneck because palette ranking, mobile navigation, accessible customization, and performance closure depend on the canonical catalog.

---

## Sprint Ordering

| Sprint | Tasks | Exit condition |
|---|---|---|
| Sprint 0 — Evidence | WUX-S0.1, WUX-S0.2 | Baseline journeys run; local measures are safe and deterministic. |
| Sprint 1 — First task | WUX-S1.1, WUX-S1.2 | First prompt is task-first, draft-safe, and single-send. |
| Sprint 2 — Discovery | WUX-S2.1, WUX-S2.2, WUX-S2.3 | Navigation metadata is canonical; palette and safe shortcuts accelerate access. |
| Sprint 3 — Mobile and input | WUX-S3.1, WUX-S3.2 | Mobile uses a workbench menu; customization no longer requires drag. |
| Sprint 4 — Communication | WUX-S4.1, WUX-S4.2 | Visible copy is locale-complete; async feedback semantics are consistent. |
| Sprint 5 — Gate | WUX-S5.1, WUX-S5.2 | Performance budgets and the full UX acceptance matrix pass. |

Sprint numbers express dependency order, not calendar duration. Parallel tasks may be executed concurrently only when repository resource limits and file ownership do not overlap.

---

## Verification Plan

### Focused checks

Each task runs the verification command declared in its task record before review. Browser smokes run sequentially to keep CPU and memory bounded.

### Package gates

From the repository root in PowerShell:

```powershell
bun --cwd packages/webui run typecheck
bun --cwd packages/webui run test
bun run lint
bun --cwd packages/webui run build
```

### Browser gates

```powershell
bun packages/webui/tests/ux-shell-browser-smoke.mjs
bun packages/webui/tests/page-scroll-browser-smoke.mjs
bun packages/webui/tests/mailbox-compose-browser-smoke.mjs
```

The mailbox smoke is retained as a cross-surface regression guard because top-bar, theme, locale, dialog, and shared shell changes can affect it even though mailbox behavior is not redesigned.

### Source-policy gates

The full WebUI test command must include and pass:

- `tests/lib/theme-color-boundaries.test.ts`;
- `tests/lib/english-leak-boundaries.test.ts`;
- `tests/i18n/catalog-integrity.test.ts`;
- `tests/lib/view-navigation.test.ts`;
- `tests/components/activity-bar-responsive.test.ts`;
- `tests/components/command-palette-combobox.test.tsx`.

### Manual evidence when browser automation is unavailable

A blocked browser origin is not a pass. Record the exact blocked origin and leave visual, overflow, focus, target-size, and rendered contrast criteria unverified until an authorized browser run succeeds.

---

## Risks and Mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| First-submit replay races with reconnect or session switch | Duplicate or wrong-session message | Session-stamp pending intent, consume once, clear on switch/unmount, regression-test reconnect. |
| Canonical catalog weakens registry exhaustiveness | Unreachable or unrenderable view | Keep render registry separate; preserve literal `satisfies` guard; add bidirectional coverage tests. |
| Ranking changes hide expected commands | Expert workflow regression | Stable tie-breaker, exact-match priority, ranking fixtures, existing combobox tests. |
| Shortcut default surprises existing users | Preference regression | Change new-profile default only; preserve persisted booleans during migration. |
| Mobile menu duplicates sidebar concepts | Confusing navigation | Distinguish destination selection from contextual panel content; use existing navigation helpers. |
| Live-region cleanup removes needed announcements | Screen-reader regression | Test busy start and completion; avoid source-only accessibility claims; browser/AT evidence where available. |
| Browser timing budgets become flaky | Noisy CI | Baseline matched fixtures, generous regression thresholds, deterministic pure ranking tests, sequential browser runs. |
| Large components cross 800 lines | Project-policy violation | Extract responsibility-owned components before adding behavior; run physical line-count check at every task review. |

---

## Rollback and Compatibility

- Each sprint must remain independently releasable.
- Mobile menu rollout can revert to the existing Activity Bar by restoring the `AppInner` render condition; catalog work remains useful.
- Palette ranking can fall back to stable source order without deleting canonical catalog metadata.
- New shortcut defaults can be reverted for new profiles without changing persisted user values.
- UX measurements are isolated wrappers and can be disabled without changing product behavior.
- No task requires data migration outside existing local preference migrations.

---

## Definition of Done

The specification is complete only when:

1. Every requirement R1-R12 maps to at least one completed task and direct evidence.
2. Every task has passed its focused verification and review.
3. The dependency graph contains no unresolved task or cycle.
4. The full WebUI package gates pass.
5. Browser UX smoke passes at all required viewport/theme/locale/motion states.
6. No new hardcoded visible-English or semantic-color exception is added.
7. No changed hand-maintained file exceeds 800 lines.
8. No external analytics, dependency, network transmission, or unrelated redesign was introduced.
9. The final diff is reviewed for unrelated edits and generated noise.
10. Any environment-blocked browser or assistive-technology evidence is reported as unverified rather than complete.
