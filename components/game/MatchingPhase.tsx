import { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { shuffleArray } from '../../lib/gameLogic';
import type { MatchPair } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';

interface MatchingPhaseProps {
  pairs: MatchPair[]; // the correct pairing
  timeLeft: number;
  hasSubmitted: boolean;
  onSubmit: (submittedPairs: MatchPair[]) => void;
}

// Both columns are identified by their position in the original (pre-shuffle)
// `pairs` array, not by their text value. This keeps identity stable and
// unique even when two pairs share identical left or right text (e.g. two
// events that both map to "Book of Exodus").
export function MatchingPhase({ pairs, timeLeft, hasSubmitted, onSubmit }: MatchingPhaseProps) {
  const leftItems = useMemo(() => pairs.map((p, index) => ({ text: p.left, index })), [pairs]);
  const rightItems = useMemo(
    () => shuffleArray(pairs.map((p, index) => ({ text: p.right, index }))),
    [pairs]
  );

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [pairing, setPairing] = useState<Record<number, number>>({}); // leftIndex -> rightIndex
  const hasSubmittedRef = useRef(false);

  const pairedRights = new Set(Object.values(pairing));

  function tapLeft(leftIndex: number) {
    if (hasSubmitted) return;
    if (pairing[leftIndex] !== undefined) {
      // already paired — tapping it again unpairs
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
      // unpair whichever left it was paired to
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
    onSubmit(submittedPairs);
  }

  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.timerRing, { borderColor: timeLeft > 10 ? '#2ECC71' : '#FF5A5F' }]}>
        <Text style={styles.timerNumber}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

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
    </View>
  );
}
