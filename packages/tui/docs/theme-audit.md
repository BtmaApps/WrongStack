# TUI theme audit — 2026-09-18

The audit covers all 64 registered presets, active-theme propagation, shared
ANSI color aliases, panel accents, and statusline capsule rendering.

## Fixes

- Statusline backgrounds retain five preset-derived tones but reduce tint
  intensity until primary text reaches 4.5:1 contrast. The previous fixed
  blend failed this floor in 59 presets. Rendering and pointer geometry are
  unchanged; the theme preview uses the same capsule renderer.
- Memoized statusline, composer, inspect, history, Markdown and code components
  subscribe to theme changes. An idle view updates without waiting for a new
  message or animation frame.
- F3 agent status colors and auth/model panel semantic colors resolve at use
  time. Gray, blue and bright ANSI aliases follow the current preset. Context
  meters, sidebar accents and transient composer pulses use theme tokens.
- Startup uses the canonical default preset, including its distinct tool color.
  Inherited object property names cannot be selected as themes.

## Validation

- Every preset: body/syntax/diff/panel checks, five statusline contrast checks,
  theme switching and panel color resolution.
- Truecolor renderer: all 64 capsule palettes; identical visible geometry
  in monochrome mode; live theme switching for idle statusline, code and prose.
- Full TUI regression suite: 361 files / 6,119 tests passed; dedicated color
  suite: 71 tests passed. Source/test typecheck, build and scoped Biome passed.
- Real Windows PTY smoke: F1–F12 and short-view pickers, including `/theme`.

Provider identity colors and explicitly selected rainbow animations retain
their own palettes. Validation does not imply live Linux/macOS terminal,
external provider or complete release-gate coverage.
