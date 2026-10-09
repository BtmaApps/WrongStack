# Remotion workflow

Checked 2026-10-09: Remotion and @remotion/renderer 4.0.534.
Keep all @remotion/* packages on the matching release. Verify the current
[setup](https://www.remotion.dev/docs/),
[renderer API](https://www.remotion.dev/docs/renderer/render-media) and
[license](https://www.remotion.dev/docs/license) before adding or upgrading.

## Frame contract

- Register compositions with explicit id, component, width, height, fps and
  durationInFrames; validate inputProps and derived duration metadata.
- Drive animation from useCurrentFrame/useVideoConfig; convert seconds to frames
  deliberately. Sequence-local frame values reset with their sequence.
- Clamp interpolation where extrapolation would cause invalid opacity/geometry.
  Seed randomness and snapshot external data before rendering.
- Resolve fonts, images and audio with supported loading primitives and bounded
  delays. A live API call during frame rendering makes runs nondeterministic.
- Use actual styled components/CSS; utility classes work only if the project's
  Tailwind compilation is configured.

## Rendering

1. Verify the installed CLI/API. For a configured composition, the normal shape is:

~~~powershell
pnpm exec remotion render src/index.ts ProductDemo out/product-demo.mp4
~~~

2. Render representative stills or a short frame range first; inspect captions,
   safe areas, assets and transition boundaries.
3. Render the final artifact with an explicitly chosen codec and audio policy.
   Limit concurrency to the host's memory/CPU instead of assuming more is faster.
4. Probe and play the output. Record dimensions, fps, duration, audio streams,
   render command and source revision/inputs.

Do not use browser setTimeout/CSS animations as the rendering clock. Do not
claim free commercial use without checking the applicable Remotion license.
