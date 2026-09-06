import { View, Text } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';
import { logMap } from '../../lib/questionTypes/logic';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

type B = {
  value: number; unit: string; min: number; max: number; log: boolean;
  mine: number | null; opponent: number | null; winner?: 'mine' | 'opponent' | 'tie';
};

export function EstimationReveal({ breakdown }: RevealProps) {
  const b = breakdown as B | null;
  if (!b) return <Text style={styles.revealLabel}>No answer</Text>;
  const pos = (v: number) => (b.log ? logMap(v, b.min, b.max) : (v - b.min) / (b.max - b.min));

  return (
    <View style={{ width: '100%', alignItems: 'center', gap: 12 }}>
      <Text style={styles.revealLabel}>The answer:</Text>
      <Text style={[styles.revealAnswer, (b.winner === 'mine' || b.winner === 'tie') && styles.revealAnswerWin]}>
        {b.value.toLocaleString('en-US')} {b.unit}
      </Text>

      <View style={styles.numberLine}>
        <View style={[styles.numberLineMark, { left: `${pos(b.value) * 100}%`, backgroundColor: Colors.success }]} />
        {b.mine != null && (
          <View style={[styles.numberLineMark, { left: `${pos(b.mine) * 100}%`, backgroundColor: Colors.accent }]} />
        )}
        {b.opponent != null && (
          <View style={[styles.numberLineMark, { left: `${pos(b.opponent) * 100}%`, backgroundColor: Colors.textMuted }]} />
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Text style={styles.qRef}>You: {b.mine != null ? b.mine.toLocaleString('en-US') : '—'}</Text>
        <Text style={styles.qRef}>Them: {b.opponent != null ? b.opponent.toLocaleString('en-US') : '—'}</Text>
      </View>
      {b.winner === 'mine' && <Text style={[styles.buzzedLabel, { color: Colors.success }]}>Closer! 🎯</Text>}
      {b.winner === 'tie' && <Text style={styles.buzzedLabel}>Dead heat — both score!</Text>}
    </View>
  );
}
