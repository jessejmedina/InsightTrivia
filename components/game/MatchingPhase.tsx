import { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { seededShuffle } from '../../lib/gameLogic';
import type { MatchPair } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';

// Both columns are identified by their position in the original (pre-shuffle)
// `pairs` array, not by their text value. This keeps identity stable and
// unique even when two pairs share identical left or right text.
export function MatchingPhase({ question, questionId, timeLeft, hasSubmitted, onSubmit }: PlayProps) {
  const pairs = (question.payload as { pairs?: MatchPair[] })?.pairs ?? [];
  const leftItems = useMemo(() => pairs.map((p, index) => ({ text: p.left, index })), [pairs]);
  const rightItems = useMemo(
    () => seededShuffle(pairs.map((p, index) => ({ text: p.right, index })), questionId),
    [pairs, questionId]
  );

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [pairing, setPairing] = useState<Record<number, number>>({}); // leftIndex -> rightIndex
  const hasSubmittedRef = useRef(false);

  const pairedRights = new Set(Object.values(pairing));

  function tapLeft(leftIndex: number) {
    if (hasSubmitted) return;
    if (pairing[leftIndex] !== undefined) {
      const next = { ...pairing };
      delete next[leftIndex];
      setPairing(next);
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(leftIndex === selectedLeft ? null : leftIndex);
  }

  function tapRight(rightIndex: number) {
    if (hasSubmitted) return;
    if (pairedRights.has(rightIndex)) {
      const leftKey = Object.keys(pairing).find((l) => pairing[Number(l)] === rightIndex);
      if (leftKey !== undefined) {
        const next = { ...pairing };
        delete next[Number(leftKey)];
        setPairing(next);
      }
      setSelectedLeft(null);
      return;
    }
    if (selectedLeft === null) return;
    setPairing({ ...pairing, [selectedLeft]: rightIndex });
    setSelectedLeft(null);
  }

  const allPaired = Object.keys(pairing).length === leftItems.length;

  function handleSubmit() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    const submittedPairs: MatchPair[] = Object.entries(pairing).map(([leftIndexStr, rightIndex]) => ({
      left: pairs[Number(leftIndexStr)].left,
      right: pairs[rightIndex].right,
    }));
    onSubmit({ pairs: submittedPairs });
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />

      <Text style={styles.buzzedLabel}>Tap a left item, then its match on the right</Text>

      <View style={styles.matchColumns}>
        <View style={styles.matchColumn}>
          {leftItems.map((left) => (
            <TouchableOpacity
              key={left.index}
              style={[
                styles.matchItem,
                selectedLeft === left.index && styles.matchItemSelected,
                pairing[left.index] !== undefined && styles.matchItemPaired,
              ]}
              onPress={() => tapLeft(left.index)}
            >
              <Text style={styles.matchItemText}>{left.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.matchColumn}>
          {rightItems.map((right) => (
            <TouchableOpacity
              key={right.index}
              style={[styles.matchItem, pairedRights.has(right.index) && styles.matchItemPaired]}
              onPress={() => tapRight(right.index)}
            >
              <Text style={styles.matchItemText}>{right.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {hasSubmitted ? (
        <Text style={styles.submittedBanner}>Submitted — waiting for the other player...</Text>
      ) : (
        <TouchableOpacity
          style={[styles.submitBtn, !allPaired && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!allPaired}
        >
          <Text style={styles.submitBtnText}>Lock In Matches</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
