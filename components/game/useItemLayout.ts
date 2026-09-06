import { useRef, useCallback } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface Rect { x: number; y: number; width: number; height: number }
export type RectMap = Record<number, Rect>;

/** Returns a new RectMap with `index` set to `rect`. Does not mutate `map`. */
export function mergeRect(map: RectMap, index: number, rect: Rect): RectMap {
  return { ...map, [index]: rect };
}

/**
 * Records each item's on-screen rect (relative to its layout parent) into a
 * ref map keyed by a stable index. The ref does not trigger re-renders —
 * consumers read `rects.current` inside gesture callbacks.
 */
export function useItemLayout() {
  const rects = useRef<RectMap>({});
  const onItemLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      rects.current = mergeRect(rects.current, index, { x, y, width, height });
    },
    []
  );
  return { rects, onItemLayout };
}
