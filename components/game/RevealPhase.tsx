import { View, Text, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/colors';
import type { PlayerRow, Question } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface RevealPhaseProps {
  question: Question;
  answerResult: 'correct' | 'wrong' | null;
  buzzedPlayer: PlayerRow | undefined;
  isHost: boolean;
  onNext: () => void;
  onOpponentAnswer: () => void;
}

export function RevealPhase({ question, answerResult, isHost, onNext, onOpponentAnswer }: RevealPhaseProps) {
  const correct = answerResult === 'correct';
  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.resultBanner, { backgroundColor: correct ? Colors.success : Colors.danger }]}>
        <Text style={styles.resultEmoji}>{correct ? '✓' : '✗'}</Text>
        <Text style={styles.resultText}>{correct ? 'Correct!' : 'Wrong!'}</Text>
      </View>

      <View style={styles.revealBox}>
        <Text style={styles.revealLabel}>The answer was:</Text>
        <Text style={styles.revealAnswer}>{question.answer}</Text>
        {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      </View>

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      {isHost && !correct && (
        <TouchableOpacity style={styles.oppBtn} onPress={onOpponentAnswer}>
          <Text style={styles.oppBtnText}>Award Opponent 100 pts & Continue</Text>
        </TouchableOpacity>
      )}

      {isHost && correct && (
        <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
          <Text style={styles.nextBtnText}>Next Question →</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingHint}>Host is advancing...</Text>
      )}
    </View>
  );
}
