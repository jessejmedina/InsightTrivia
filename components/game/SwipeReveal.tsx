import { View, Text } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

type Card = { text: string; side: 'left' | 'right' };
type B = { cards: Card[]; mineSwipes: Record<number, 'left' | 'right'>; opponentSwipes: Record<number, 'left' | 'right'> };

export function SwipeReveal({ breakdown }: RevealProps) {
  const b = breakdown as B | null;
  if (!b) return <Text style={styles.revealLabel}>No answer</Text>;
  return (
    <View style={{ width: '100%', gap: 6 }}>
      {b.cards.map((c, i) => {
        const mine = b.mineSwipes[i];
        const ok = mine === c.side;
        return (
          <View key={i} style={styles.matchItem}>
            <Text style={styles.matchItemText}>
              {ok ? '✓' : '✗'} {c.text} — {c.side === 'left' ? 'LEFT' : 'RIGHT'}
              {mine ? '' : '  (you skipped)'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
