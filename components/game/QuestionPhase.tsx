import { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { getCategoryColor } from '../../constants/colors';
import type { PlayerRow, Question } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface QuestionPhaseProps {
  question: Question;
  timeLeft: number;
  phase: 'question' | 'buzzed';
  buzzedPlayer: PlayerRow | undefined;
  isBuzzedIn: boolean;
  isHost: boolean;
  onBuzzIn: () => void;
  onSubmitAnswer: (chosenAnswer: string) => void;
  buzzScale: Animated.Value;
  questionIndex: number;
  totalQuestions: number;
}

export function QuestionPhase({
  question, timeLeft, phase, buzzedPlayer, isBuzzedIn,
  onBuzzIn, onSubmitAnswer, buzzScale,
}: QuestionPhaseProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const hasSubmittedRef = useRef(false);
  const timerColor = timeLeft > 15 ? Colors.success : timeLeft > 7 ? Colors.accent : Colors.danger;
  const diffColor: any = { easy: Colors.success, medium: Colors.accent, hard: Colors.danger };

  function handlePickOption(option: string) {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setSelectedOption(option);
    onSubmitAnswer(option);
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer} keyboardShouldPersistTaps="handled">
      <View style={[styles.timerRing, { borderColor: timerColor }]}>
        <Text style={[styles.timerNumber, { color: timerColor }]}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

      <View style={styles.qMeta}>
        <View style={[styles.qCategoryPill, { backgroundColor: getCategoryColor(question.category) }]}>
          <Text style={styles.qCategory}>{question.category}</Text>
        </View>
        <Text style={[styles.qDifficulty, { color: diffColor[question.difficulty] }]}>
          {question.difficulty}
        </Text>
      </View>

      {question.hint && phase === 'question' && (
        <View style={styles.hintBox}>
          <Text style={styles.hintLabel}>Hint</Text>
          <Text style={styles.hintText}>{question.hint}</Text>
        </View>
      )}

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
        {question.reference && <Text style={styles.qRef}>{question.reference}</Text>}
      </View>

      {phase === 'question' && (
        <Animated.View style={{ transform: [{ scale: buzzScale }] }}>
          <TouchableOpacity style={styles.buzzBtn} onPress={onBuzzIn}>
            <Text style={styles.buzzBtnText}>I Know It!</Text>
            <Text style={styles.buzzBtnSub}>Buzz in to stop the clock</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {phase === 'buzzed' && (
        <View style={styles.buzzedContainer}>
          <Text style={styles.buzzedLabel}>
            {buzzedPlayer?.profiles?.username ?? 'Player'} buzzed in!
          </Text>
          {isBuzzedIn ? (
            Array.isArray(question.options) && question.options.length >= 2 ? (
              <View style={styles.optionsGrid}>
                {question.options.map((option, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionBtn, selectedOption === option && styles.optionBtnSelected]}
                    onPress={() => handlePickOption(option)}
                    disabled={selectedOption !== null}
                  >
                    <Text style={styles.optionBtnText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.buzzedLabel}>Question unavailable — waiting for the round to advance.</Text>
            )
          ) : (
            <View style={styles.waitBuzzed}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.waitBuzzedText}>Waiting for their answer...</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
