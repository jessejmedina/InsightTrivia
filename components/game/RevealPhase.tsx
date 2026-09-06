import { View, Text } from 'react-native';
import { Colors } from '../../constants/colors';
import type { MatchPair } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

/**
 * Shared reveal body for multiple_choice / ordering / matching in Plan 1.
 * Plan 2 gives ordering and matching their own richer reveal components.
 */
export function RevealPhase({ question, breakdown, myPointsThisRound, myRunningTotal }: RevealProps) {
  const winner = (breakdown as { winner?: 'mine' | 'opponent' | 'none' } | null)?.winner;
  const scoredWell = myPointsThisRound > 0;

  const bannerColor = winner === 'mine' || scoredWell ? Colors.success : Colors.danger;
  const bannerText =
    winner === 'mine' ? 'Correct!'
      : winner === 'opponent' ? 'Opponent got it'
        : winner === 'none' ? 'Wrong!'
          : scoredWell ? `+${myPointsThisRound}` : 'No points';

  const items = (breakdown as { items?: string[] } | null)?.items;
  const pairs = (breakdown as { pairs?: MatchPair[] } | null)?.pairs;

  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.resultBanner, { backgroundColor: bannerColor }]}>
        <Text style={styles.resultText}>{bannerText}</Text>
      </View>

      <View style={styles.revealBox}>
        <Text style={styles.revealLabel}>The answer:</Text>
        {question.answer && <Text style={styles.revealAnswer}>{question.answer}</Text>}
        {items && items.map((it, i) => (
          <Text key={i} style={styles.revealAnswer}>{i + 1}. {it}</Text>
        ))}
        {pairs && pairs.map((p, i) => (
          <Text key={i} style={styles.revealAnswer}>{p.left} → {p.right}</Text>
        ))}
        {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      </View>

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      <Text style={styles.buzzedLabel}>
        {myPointsThisRound > 0 ? `+${myPointsThisRound} this round` : 'No points this round'}
      </Text>
      <Text style={styles.waitingHint}>{myRunningTotal} total · host is advancing…</Text>
    </View>
  );
}
