import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { getCategoryColor } from '../../constants/colors';
import { gameStyles as styles } from './gameStyles';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';

/** Play UI for `multiple_choice` (buzz in, then pick from 4 options). */
export function QuestionPhase({
  question, timeLeft, hasSubmitted, buzzedByMe, buzzedByOpponent, onBuzz, onSubmit,
}: PlayProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const hasSubmittedRef = useRef(false);
  const buzzScale = useRef(new Animated.Value(1)).current;

  const isBuzzed = buzzedByMe || buzzedByOpponent;

  useEffect(() => {
    if (isBuzzed) {
      Animated.sequence([
        Animated.timing(buzzScale, { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.timing(buzzScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [isBuzzed, buzzScale]);

  const timerColor = timeLeft > 15 ? Colors.success : timeLeft > 7 ? Colors.accent : Colors.danger;
  const diffColor: Record<string, string> = { easy: Colors.success, medium: Colors.accent, hard: Colors.danger };

  function handlePickOption(option: string) {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setSelectedOption(option);
    onSubmit({ chosen: option });
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
        <Text style={[styles.qDifficulty, { color: diffColor[question.difficulty] ?? Colors.accent }]}>
          {question.difficulty}
        </Text>
      </View>

      {question.hint && !isBuzzed && (
        <View style={styles.hintBox}>
          <Text style={styles.hintLabel}>Hint</Text>
          <Text style={styles.hintText}>{question.hint}</Text>
        </View>
      )}

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
        {question.reference && <Text style={styles.qRef}>{question.reference}</Text>}
      </View>

      {!isBuzzed && (
        <Animated.View style={{ transform: [{ scale: buzzScale }] }}>
          <TouchableOpacity style={styles.buzzBtn} onPress={onBuzz}>
            <Text style={styles.buzzBtnText}>I Know It!</Text>
            <Text style={styles.buzzBtnSub}>Buzz in to stop the clock</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {isBuzzed && (
        <View style={styles.buzzedContainer}>
          <Text style={styles.buzzedLabel}>
            {buzzedByMe ? 'You buzzed in!' : 'Opponent buzzed in!'}
          </Text>
          {buzzedByMe ? (
            Array.isArray(question.options) && question.options.length >= 2 ? (
              <View style={styles.optionsGrid}>
                {question.options.map((option, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionBtn, selectedOption === option && styles.optionBtnSelected]}
                    onPress={() => handlePickOption(option)}
                    disabled={selectedOption !== null || hasSubmitted}
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
