---
name: motion-canvas-video
version: 1.0.2
description: "Create exported TypeScript animations with Motion Canvas scenes, signals, generators and narration cues. Use when producing animated diagrams, code walkthroughs or precise 2D video timelines; use motion-design for interactive web UI and manim-video for mathematical scenes."
trigger: "producing animated diagrams, code walkthroughs or precise 2D video timelines; use motion-design for interactive web UI and manim-video for mathematical scenes."
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
metadata:
  routing-group: media
---

# Motion Canvas Video

## Selection card
- Task: Animate a scripted 2D scene with Motion Canvas.
- Start: Identify the existing engine, scene, timeline and delivery format.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Target Motion Canvas 3.17.2, verified 2026-10-23 for core, 2d, vite-plugin and
ffmpeg packages. Motion Canvas is a video scene/timeline system; its JSX is
not React and its generators are not browser animation hooks.

## Rules

1. Verify all Motion Canvas package versions together and inspect the Vite plugin's
   peer range. Version 3.17.2 declares Vite 4.x or 5.x; latest Vite is 8.3.5.
   Do not force this unsupported combination or silently claim all packages are
   current and compatible. Report the blocker; isolate a compatible video workspace
   only when that tradeoff is authorized, or choose another renderer.
2. Build scenes with makeScene2D and controlled generators. Use yield* for awaited
   animation, and explicit all/sequence/chain primitives for composition.
3. Treat signals as scene values; read them through their API, not copied snapshots
   that stop reacting. Keep node refs and ownership explicit.
4. Synchronize narration with timeline cues/time events rather than approximate
   sleeps. Resolve fonts, images and audio before rendering.
5. Specify fps, dimensions, duration and exporter. An editor preview or PNG sequence
   does not establish that a playable MP4 with audio was exported.
6. Keep scene reset and seeking deterministic: no wall-clock logic, unresolved
   network state or unseeded random layout in rendered frames.

## Workflow

1. Inspect project/package/tsconfig and the editor's installed rendering integration.
   Read the current official setup before scaffolding; preserve package-manager choice.
2. Write a storyboard with scenes, labels and narration markers.
3. Prototype a scene with nodes, refs and a sequential/parallel transition.
   Test timeline seeking and repeated playback before building the whole video.
4. Add responsive scene geometry for the output dimensions, safe areas and
   readable text. Reuse visual roles across scenes.
5. Inspect boundary frames and export a short sample. Check alpha and background
   handling, font availability, timing and audio inclusion.
6. Export the final video or assemble the image sequence through FFmpeg with
   matching fps. Probe and play the delivered file.

## Before returning

- [ ] `@motion-canvas/*` package alignment and Vite peer compatibility (`4.x`/`5.x` vs Vite 8 blocker) verified and reported
- [ ] Scene animations driven deterministically via `yield*`, `all()`, `sequence()`, `chain()`, and reactive signals (`createSignal`, `createRef`)
- [ ] Narration cues synchronized via timeline events (`waitUntil`) with all fonts and assets resolved prior to render
- [ ] Exported video artifact verified with `ffprobe` and playback for resolution, fps, duration, and audio sync

## Sources

[Quickstart](https://motioncanvas.io/docs/quickstart/),
[animation flow](https://motioncanvas.io/docs/flow/),
[npm plugin metadata](https://registry.npmjs.org/@motion-canvas/vite-plugin/latest).

## Skills in scope

- media-production — multi-shot timeline assembly, FFmpeg H.264/ProRes encoding, and subtitle burn-in.
- audio-studio — generating voiceover narration and background music matched to Motion Canvas scene cues.
- tech-stack — managing isolated workspace dependencies when `@motion-canvas/vite-plugin` peer ranges lag the main app's Vite version.
