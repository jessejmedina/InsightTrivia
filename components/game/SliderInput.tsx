import { useState } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { logMap, logUnmap } from '../../lib/questionTypes/logic';
import { gameStyles as styles } from './gameStyles';

const THUMB = 28;

/** Horizontal slider (linear or log axis). Drag the thumb or tap the track. */
export function SliderInput({
  min, max, value, step, log, onChange,
}: { min: number; max: number; value: number; step?: number; log?: boolean; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const dragPx = useSharedValue<number | null>(null); // non-null only while dragging

  // Default to whole-number steps — years / counts / cubits are all integers.
  const effStep = step ?? 1;
  const toPos = (v: number) => (log ? logMap(v, min, max) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const clamped = Math.min(1, Math.max(0, p));
    let v = log ? logUnmap(clamped, min, max) : min + clamped * (max - min);
    v = Math.round(v / effStep) * effStep;
    return Math.min(max, Math.max(min, v));
  };

  const commit = (px: number) => onChange(fromPos(px / Math.max(width, 1)));

  // px position of the thumb centre, derived from the controlled value.
  const controlledPx = width > 0 ? toPos(value) * width : 0;

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => { dragPx.value = Math.min(width, Math.max(0, e.x)); runOnJS(commit)(dragPx.value); })
    .onChange((e) => { dragPx.value = Math.min(width, Math.max(0, (dragPx.value ?? controlledPx) + e.changeX)); runOnJS(commit)(dragPx.value); })
    .onFinalize(() => { dragPx.value = null; });

  // useAnimatedStyle re-runs on every React render, so reading the plain
  // `controlledPx` here is safe (unlike useDerivedValue).
  const thumbStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: (dragPx.value ?? controlledPx) - THUMB / 2 }] }),
    [controlledPx],
  );
  const fillStyle = useAnimatedStyle(
    () => ({ width: dragPx.value ?? controlledPx }),
    [controlledPx],
  );

  return (
    <View style={styles.sliderTrack} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.sliderFill, fillStyle]} pointerEvents="none" />
      <GestureDetector gesture={pan}>
        <Pressable style={styles.sliderHit}>
          <Animated.View style={[styles.sliderThumb, thumbStyle]} />
        </Pressable>
      </GestureDetector>
    </View>
  );
}
