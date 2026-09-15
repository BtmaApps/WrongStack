import type {
  StatuslineDensities,
  StatuslineLines,
  StatuslineOrder,
} from '@wrongstack/core/statusline';
import { useEffect } from 'react';
import type { StatuslineItem } from '../components/statusline-picker.js';

export function statuslineHiddenDiffers(
  hookHidden: readonly StatuslineItem[],
  pickerHidden: readonly StatuslineItem[],
): boolean {
  const currentHidden = new Set<string>(hookHidden);
  const pickerHiddenSet = new Set<string>(pickerHidden);
  return (
    currentHidden.size !== pickerHiddenSet.size ||
    pickerHidden.some((item) => !currentHidden.has(item)) ||
    hookHidden.some((item) => !pickerHiddenSet.has(item))
  );
}

/**
 * Shallow key/value comparison for the sparse layout maps. Cheap enough to
 * run on every picker keystroke and exact enough that a no-op re-render
 * never triggers a disk write.
 */
export function statuslineLayoutDiffers(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return true;
  return keysA.some((key) => a[key] !== b[key]);
}

interface UseStatuslineHiddenSyncOptions {
  pickerOpen: boolean;
  pickerHidden: readonly StatuslineItem[];
  hiddenItems: readonly StatuslineItem[];
  setHiddenItems: (items: StatuslineItem[]) => void;
}

/**
 * Mirrors reducer-owned statusline hidden-item changes back into the
 * statusline state hook so the visible status bar updates immediately.
 */
export function useStatuslineHiddenSync({
  pickerOpen,
  pickerHidden,
  hiddenItems,
  setHiddenItems,
}: UseStatuslineHiddenSyncOptions): void {
  useEffect(() => {
    if (!pickerOpen) return;
    if (statuslineHiddenDiffers(hiddenItems, pickerHidden)) {
      setHiddenItems([...pickerHidden]);
    }
  }, [pickerHidden, pickerOpen, setHiddenItems, hiddenItems]);
}

interface UseStatuslineLayoutSyncOptions {
  pickerOpen: boolean;
  /**
   * Whether the editor's layout is the live one. False when a caller opened
   * the picker without seeding it — mirroring an unseeded (empty) layout back
   * would publish, and then persist, a wipe of the user's assignment.
   */
  layoutSeeded: boolean;
  pickerLines: StatuslineLines;
  pickerDensities: StatuslineDensities;
  pickerOrder: StatuslineOrder;
  lines: StatuslineLines;
  densities: StatuslineDensities;
  order: StatuslineOrder;
  setLines: (lines: StatuslineLines) => void;
  setDensities: (densities: StatuslineDensities) => void;
  setOrder: (order: StatuslineOrder) => void;
}

/**
 * The layout twin of {@link useStatuslineHiddenSync}: reducer-owned line and
 * density/order edits land in the statusline state hook, which re-renders the bar
 * and (via `use-tui-environment-state`) persists them. Without this the
 * picker's `1-4` / `Shift+Up/Down` / `d` keys would only change its own view.
 */
export function useStatuslineLayoutSync({
  pickerOpen,
  layoutSeeded,
  pickerLines,
  pickerDensities,
  pickerOrder,
  lines,
  densities,
  order,
  setLines,
  setDensities,
  setOrder,
}: UseStatuslineLayoutSyncOptions): void {
  useEffect(() => {
    if (!pickerOpen || !layoutSeeded) return;
    if (statuslineLayoutDiffers(lines, pickerLines)) setLines({ ...pickerLines });
  }, [pickerOpen, layoutSeeded, pickerLines, lines, setLines]);

  useEffect(() => {
    if (!pickerOpen || !layoutSeeded) return;
    if (statuslineLayoutDiffers(densities, pickerDensities)) setDensities({ ...pickerDensities });
  }, [pickerOpen, layoutSeeded, pickerDensities, densities, setDensities]);

  useEffect(() => {
    if (!pickerOpen || !layoutSeeded) return;
    if (
      pickerOrder.length !== order.length ||
      pickerOrder.some((item, index) => item !== order[index])
    ) {
      setOrder([...pickerOrder]);
    }
  }, [pickerOpen, layoutSeeded, pickerOrder, order, setOrder]);
}
