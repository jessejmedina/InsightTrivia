import { useState } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, useDerivedValue, runOnJS } from 'react-native-reanimated';
import { logMap, logUnmap } from '../../lib/questionTypes/logic';
import { gameStyles as styles } from './gameStyles';

/** Horizontal slider (linear or log axis). Drag the thumb or tap the track. */
export function SliderInput({
  min, max, value, step, log, onChange,
}: { min: number; max: number; value: number; step?: number; log?: boolean; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const dragX = useSharedValue<number | null>(null); // non-null only while dragging

  const toPos = (v: number) => (log ? logMap(v, min, max) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const clamped = Math.min(1, Math.max(0, p));
    let v = log ? logUnmap(clamped, min, max) : min + clamped * (max - min);
    if (step) v = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, v));
  };

  const commit = (px: number) => onChange(fromPos(px / Math.max(width, 1)));

  const controlledPx = toPos(value) * width;
  const px = useDerivedValue(() => (dragX.value ?? controlledPx));

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => { dragX.value = Math.min(width, Math.max(0, e.x)); runOnJS(commit)(dragX.value); })
    .onChange((e) => { dragX.value = Math.min(width, Math.max(0, (dragX.value ?? 0) + e.changeX)); runOnJS(commit)(dragX.value); })
    .onFinalize(() => { dragX.value = null; });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: px.value - 14 }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: px.value }));

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
