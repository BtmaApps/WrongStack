import type { Theme } from './theme-types.js';
import { mixHexColors } from './theme-utils.js';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Preserve the preset's five hues while keeping small status text at 4.5:1. */
export function statuslineBackgrounds(palette: Theme): string[] {
  return [palette.accent, palette.brand, palette.success, palette.warn, palette.brandPrimary].map(
    (tone) => {
      for (let step = 48; step >= 0; step--) {
        const background = mixHexColors(tone, palette.surfaceRaised, step / 100);
        if (contrast(palette.textPrimary, background) >= 4.5) return background;
      }
      return palette.surfaceRaised;
    },
  );
}
