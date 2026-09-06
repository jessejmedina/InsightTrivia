import { View, Text } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

type Sub = { chosen: string; cluesShownAtBuzz: number } | null;
type B = { answer: string; winner: 'mine' | 'opponent' | 'none'; mine: Sub; opponent: Sub };

export function ProgressiveReveal({ question, breakdown }: RevealProps) {
  const b = breakdown as B | null;
  if (!b) return <Text style={styles.revealLabel}>No answer</Text>;
  return (
    <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
      <Text style={styles.revealLabel}>The answer:</Text>
      <Text style={styles.revealAnswer}>{b.answer}</Text>
      {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      <Text style={styles.qRef}>
        You: {b.mine ? `"${b.mine.chosen}" after ${b.mine.cluesShownAtBuzz} clue(s)` : 'no buzz'}
      </Text>
      <Text style={styles.qRef}>
        Them: {b.opponent ? `"${b.opponent.chosen}" after ${b.opponent.cluesShownAtBuzz} clue(s)` : 'no buzz'}
      </Text>
      {b.winner === 'mine' && <Text style={[styles.buzzedLabel, { color: Colors.success }]}>Got it!</Text>}
    </View>
  );
}
