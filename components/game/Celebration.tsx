import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

const COLORS = ['#8B5CF6', '#2ECC71', '#FBBF24', '#FB7185', '#3DA5F5'];
const N = 12;

function Particle({ angle, play }: { angle: number; play: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (play) p.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [play, p]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * 120 * p.value },
      { translateY: Math.sin(angle) * 120 * p.value },
      { scale: 0.6 + 0.6 * (1 - p.value) },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute', width: 10, height: 10, borderRadius: 5,
          backgroundColor: COLORS[Math.floor((angle / (Math.PI * 2)) * COLORS.length) % COLORS.length],
        },
        style,
      ]}
    />
  );
}

/** One-shot particle burst. Renders nothing until `play` flips true. */
export function Celebration({ play }: { play: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (play) {
      setArmed(true);
      const t = setTimeout(() => setArmed(false), 1600);
      return () => clearTimeout(t);
    }
  }, [play]);
  if (!armed) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: '40%', left: '50%' }}>
      {Array.from({ length: N }, (_, i) => (
        <Particle key={i} angle={(i / N) * Math.PI * 2} play={armed} />
      ))}
    </View>
  );
}
