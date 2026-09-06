import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';

/** The countdown ring, shared by every play component. Pulses under 5s. */
export function TimerRing({ timeLeft }: { timeLeft: number }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (timeLeft <= 5 && timeLeft > 0) {
      pulse.value = withRepeat(withTiming(1.08, { duration: 500 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [timeLeft, pulse]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const color = timeLeft > 10 ? Colors.success : Colors.danger;

  return (
    <Animated.View style={[styles.timerRing, { borderColor: color }, style]}>
      <Text style={[styles.timerNumber, { color }]}>{timeLeft}</Text>
      <Text style={styles.timerLabel}>sec</Text>
    </Animated.View>
  );
}
