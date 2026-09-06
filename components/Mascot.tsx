import { useEffect } from 'react';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withSpring, Easing, cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

export type MascotMood = 'idle' | 'cheer' | 'sad' | 'think' | 'taunt';

/**
 * Placeholder mascot: a simple round character animated with Reanimated.
 * Commissioned art later replaces the SVG body without touching call sites.
 */
export function Mascot({ mood = 'idle', size = 96 }: { mood?: MascotMood; size?: number }) {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(-6, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true,
    );
    return () => cancelAnimation(translateY);
  }, [translateY]);

  useEffect(() => {
    cancelAnimation(rotate);
    rotate.value = 0;
    if (mood === 'cheer' || mood === 'taunt') {
      scale.value = withSequence(withSpring(1.15), withSpring(1));
      translateY.value = withSequence(withTiming(-18, { duration: 160 }), withSpring(0));
    } else if (mood === 'sad') {
      translateY.value = withTiming(6, { duration: 300 });
      rotate.value = withTiming(0.05, { duration: 300 });
    } else if (mood === 'think') {
      rotate.value = withRepeat(withTiming(-0.08, { duration: 700 }), -1, true);
    }
  }, [mood, rotate, scale, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}rad` },
      { scale: scale.value },
    ],
  }));

  const mouth =
    mood === 'sad' ? 'M 30 62 Q 48 50 66 62'
      : mood === 'cheer' || mood === 'taunt' ? 'M 28 54 Q 48 78 68 54'
        : 'M 32 58 Q 48 66 64 58';

  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Circle cx="48" cy="48" r="40" fill="#8B5CF6" />
        <Circle cx="36" cy="42" r="5" fill="#FFFFFF" />
        <Circle cx="60" cy="42" r="5" fill="#FFFFFF" />
        <Path d={mouth} stroke="#FFFFFF" strokeWidth={4} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}
