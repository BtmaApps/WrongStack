import { useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_FONT_SETTINGS,
  editorFontOptions,
  getFontLoadVersion,
  resolveFontStacks,
  subscribeFontLoads,
  terminalFontOptions,
} from '@/lib/fonts';
import { useConfigStore } from '@/stores/config-store';

/**
 * Resolved typography for components that cannot read CSS variables (Monaco,
 * xterm, previews). `loadVersion` bumps whenever a web font finishes loading,
 * so consumers re-measure glyphs that were laid out with a fallback face.
 */
export function useFontSettings() {
  const fonts = useConfigStore((state) => state.fonts);
  const loadVersion = useSyncExternalStore(
    subscribeFontLoads,
    getFontLoadVersion,
    getFontLoadVersion,
  );
  return useMemo(() => {
    const settings = fonts ?? DEFAULT_FONT_SETTINGS;
    return {
      settings,
      loadVersion,
      stacks: resolveFontStacks(settings),
      editor: editorFontOptions(settings),
      terminal: terminalFontOptions(settings),
    };
  }, [fonts, loadVersion]);
}
