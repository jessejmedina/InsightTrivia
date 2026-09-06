import { View, Text } from 'react-native';
import { Colors } from '../../constants/colors';
import type { MatchPair } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

/**
 * Shared reveal body for multiple_choice / ordering / matching in Plan 1.
 * Rendered inside RevealFrame, which owns the mascot, points, and total.
 * Plan 2 gives ordering and matching their own richer reveal components.
 */
export function RevealPhase({ question, breakdown, myPointsThisRound }: RevealProps) {
  const winner = (breakdown as { winner?: 'mine' | 'opponent' | 'none' } | null)?.winner;
  const scoredWell = myPointsThisRound > 0;
  const iGotItRight = winner === 'mine' || scoredWell;
  const answerStyle = [styles.revealAnswer, iGotItRight && styles.revealAnswerWin];

  const bannerColor = iGotItRight ? Colors.success : Colors.danger;
  const bannerText =
    winner === 'mine' ? 'Correct!'
      : winner === 'opponent' ? 'Opponent got it'
        : winner === 'none' ? 'Wrong!'
          : scoredWell ? `+${myPointsThisRound}` : 'No points';

  const items = (breakdown as { items?: string[] } | null)?.items;
  const pairs = (breakdown as { pairs?: MatchPair[] } | null)?.pairs;

  return (
    <View style={{ width: '100%', alignItems: 'center', gap: 14 }}>
      <View style={[styles.resultBanner, { backgroundColor: bannerColor }]}>
        <Text style={styles.resultText}>{bannerText}</Text>
      </View>

      <View style={styles.revealBox}>
        <Text style={styles.revealLabel}>The answer:</Text>
        {question.answer && <Text style={answerStyle}>{question.answer}</Text>}
        {items && items.map((it, i) => (
          <Text key={i} style={answerStyle}>{i + 1}. {it}</Text>
        ))}
        {pairs && pairs.map((p, i) => (
          <Text key={i} style={answerStyle}>{p.left} → {p.right}</Text>
        ))}
        {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      </View>

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>
    </View>
  );
}
