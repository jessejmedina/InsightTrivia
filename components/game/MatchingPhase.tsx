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

export function MatchingPhase({ pairs, timeLeft, hasSubmitted, onSubmit }: MatchingPhaseProps) {
  const leftItems = useMemo(() => pairs.map((p) => p.left), [pairs]);
  const rightItems = useMemo(() => shuffleArray(pairs.map((p) => p.right)), [pairs]);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [pairing, setPairing] = useState<Record<string, string>>({}); // left -> right
  const hasSubmittedRef = useRef(false);

  const pairedRights = new Set(Object.values(pairing));

  function tapLeft(left: string) {
    if (hasSubmitted) return;
    if (pairing[left]) {
      // already paired — tapping it again unpairs
      const next = { ...pairing };
      delete next[left];
      setPairing(next);
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(left === selectedLeft ? null : left);
  }

  function tapRight(right: string) {
    if (hasSubmitted) return;
    if (pairedRights.has(right)) {
      // unpair whichever left it was paired to
      const leftKey = Object.keys(pairing).find((l) => pairing[l] === right);
      if (leftKey) {
        const next = { ...pairing };
        delete next[leftKey];
        setPairing(next);
      }
      return;
    }
    if (!selectedLeft) return;
    setPairing({ ...pairing, [selectedLeft]: right });
    setSelectedLeft(null);
  }

  const allPaired = Object.keys(pairing).length === leftItems.length;

  function handleSubmit() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    const submittedPairs: MatchPair[] = Object.entries(pairing).map(([left, right]) => ({ left, right }));
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
              key={left}
              style={[
                styles.matchItem,
                selectedLeft === left && styles.matchItemSelected,
                pairing[left] && styles.matchItemPaired,
              ]}
              onPress={() => tapLeft(left)}
            >
              <Text style={styles.matchItemText}>{left}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.matchColumn}>
          {rightItems.map((right) => (
            <TouchableOpacity
              key={right}
              style={[styles.matchItem, pairedRights.has(right) && styles.matchItemPaired]}
              onPress={() => tapRight(right)}
            >
              <Text style={styles.matchItemText}>{right}</Text>
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
