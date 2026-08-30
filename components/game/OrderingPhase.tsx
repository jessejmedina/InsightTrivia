import { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { seededShuffle } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';

interface OrderingPhaseProps {
  items: string[]; // the correct order — this component shuffles its own working copy
  questionId: string; // seeds the shuffle so every client sees the identical arrangement
  timeLeft: number;
  hasSubmitted: boolean;
  onSubmit: (submittedOrder: string[]) => void;
}

export function OrderingPhase({ items, questionId, timeLeft, hasSubmitted, onSubmit }: OrderingPhaseProps) {
  const [order, setOrder] = useState<string[]>(() => seededShuffle(items, questionId));
  const hasSubmittedRef = useRef(false);

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  function handleSubmit() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    onSubmit(order);
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <View style={[styles.timerRing, { borderColor: timeLeft > 10 ? '#2ECC71' : '#FF5A5F' }]}>
        <Text style={styles.timerNumber}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

      <Text style={styles.buzzedLabel}>Arrange these in the correct order</Text>

      <View style={styles.orderList}>
        {order.map((item, i) => (
          <View key={i} style={styles.orderRow}>
            <Text style={styles.orderIndex}>{i + 1}</Text>
            <Text style={styles.orderItemText}>{item}</Text>
            <View style={styles.orderArrows}>
              <TouchableOpacity style={styles.orderArrowBtn} onPress={() => moveItem(i, -1)} disabled={hasSubmitted}>
                <Text style={styles.orderArrowText}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.orderArrowBtn} onPress={() => moveItem(i, 1)} disabled={hasSubmitted}>
                <Text style={styles.orderArrowText}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {hasSubmitted ? (
        <Text style={styles.submittedBanner}>Submitted — waiting for the other player...</Text>
      ) : (
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Lock In Order</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
