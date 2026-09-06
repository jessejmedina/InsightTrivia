import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';

/** Eases a displayed integer toward `value` over ~400ms instead of snapping. */
export function CountUp({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = Date.now();
    const durationMs = 400;
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setShown(Math.round(from + (to - from) * eased));
      if (t >= 1) {
        clearInterval(id);
        fromRef.current = to;
      }
    }, 16);
    return () => clearInterval(id);
  }, [value]);

  return <Text style={style}>{shown}</Text>;
}
