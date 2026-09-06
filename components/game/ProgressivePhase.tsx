import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { ProgressivePayload } from '../../lib/questionTypes/logic';

const RACE_SECONDS = 30;

/**
 * Play UI for `progressive` — clues reveal one at a time on the shared
 * clock (clue k visible once elapsed >= (k-1) * 30/clues.length); buzz to
 * stop, then pick from 4 options. Fewer clues seen = more points.
 */
export function ProgressivePhase({
  question, timeLeft, hasSubmitted, buzzedByMe, buzzedByOpponent, onBuzz, onSubmit,
}: PlayProps) {
  const clues = (question.payload as ProgressivePayload)?.clues ?? [];
  const cadence = RACE_SECONDS / Math.max(clues.length, 1);
  const hasSubmittedRef = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const snapshotRef = useRef<number | null>(null);

  const liveCluesShown = Math.min(
    clues.length,
    Math.max(1, 1 + Math.floor((RACE_SECONDS - timeLeft) / cadence)),
  );
  const isBuzzed = buzzedByMe || buzzedByOpponent;

  useEffect(() => {
    if (buzzedByMe && snapshotRef.current === null) snapshotRef.current = liveCluesShown;
  }, [buzzedByMe, liveCluesShown]);

  const cluesShown = snapshotRef.current ?? liveCluesShown;

  function pick(option: string) {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setSelected(option);
    onSubmit({ chosen: option, cluesShownAtBuzz: snapshotRef.current ?? liveCluesShown });
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      <View style={styles.clueList}>
        {clues.slice(0, cluesShown).map((c, i) => (
          <View key={i} style={styles.clueRow}>
            <Text style={styles.clueIndex}>{i + 1}</Text>
            <Text style={styles.clueText}>{c}</Text>
          </View>
        ))}
        {cluesShown < clues.length && !isBuzzed && (
          <Text style={styles.qRef}>next clue coming… ({cluesShown}/{clues.length})</Text>
        )}
      </View>

      {!isBuzzed && (
        <TouchableOpacity style={styles.buzzBtn} onPress={onBuzz}>
          <Text style={styles.buzzBtnText}>I Know It!</Text>
          <Text style={styles.buzzBtnSub}>Fewer clues = more points</Text>
        </TouchableOpacity>
      )}

      {isBuzzed && buzzedByMe && (
        Array.isArray(question.options) && question.options.length >= 2 ? (
          <View style={styles.optionsGrid}>
            {question.options.map((o, i) => (
              <TouchableOpacity key={i}
                style={[styles.optionBtn, selected === o && styles.optionBtnSelected]}
                onPress={() => pick(o)} disabled={selected !== null || hasSubmitted}>
                <Text style={styles.optionBtnText}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : <Text style={styles.buzzedLabel}>Question unavailable — waiting for the round to advance.</Text>
      )}

      {isBuzzed && buzzedByOpponent && (
        <View style={styles.waitBuzzed}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.waitBuzzedText}>Opponent buzzed — waiting for their answer…</Text>
        </View>
      )}
    </ScrollView>
  );
}
