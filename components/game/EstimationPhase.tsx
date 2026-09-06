import { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import { SliderInput } from './SliderInput';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { EstimationPayload } from '../../lib/questionTypes/logic';

function formatGuess(n: number): string {
  const r = Math.round(n * 100) / 100; // guard against float drift
  return Math.abs(r) >= 1000 ? r.toLocaleString('en-US') : String(r);
}

/** Play UI for `estimation` — set a slider, closest to the truth wins the pot. */
export function EstimationPhase({ question, timeLeft, hasSubmitted, onSubmit }: PlayProps) {
  const p = question.payload as EstimationPayload;
  // Always start at the low end so the starting position never hints at the answer.
  const [guess, setGuess] = useState<number>(p.min);
  const hasSubmittedRef = useRef(false);

  // Fine-adjust step for the − / + buttons: the author's `step`, else 1
  // (years / counts / cubits are integers), clamped so huge ranges still move.
  const fineStep = p.step ?? Math.max(1, Math.round((p.max - p.min) / 500));
  const nudge = (dir: -1 | 1) =>
    setGuess((g) => Math.min(p.max, Math.max(p.min, g + dir * fineStep)));

  function handleSubmit() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    onSubmit({ guess });
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
        {question.reference && <Text style={styles.qRef}>{question.reference}</Text>}
      </View>

      <View style={styles.estimateRow}>
        <TouchableOpacity
          style={styles.estimateStepBtn}
          onPress={() => nudge(-1)}
          disabled={hasSubmitted || guess <= p.min}
        >
          <Text style={styles.estimateStepText}>−</Text>
        </TouchableOpacity>
        <View style={styles.estimateReadoutWrap}>
          <Text style={styles.estimateReadout}>{formatGuess(guess)}</Text>
          <Text style={styles.estimateUnit}>{p.unit}</Text>
        </View>
        <TouchableOpacity
          style={styles.estimateStepBtn}
          onPress={() => nudge(1)}
          disabled={hasSubmitted || guess >= p.max}
        >
          <Text style={styles.estimateStepText}>+</Text>
        </TouchableOpacity>
      </View>

      <SliderInput min={p.min} max={p.max} value={guess} step={p.step} log={p.log} onChange={setGuess} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
        <Text style={styles.qRef}>{formatGuess(p.min)}</Text>
        <Text style={styles.qRef}>{formatGuess(p.max)}</Text>
      </View>

      {hasSubmitted ? (
        <Text style={styles.submittedBanner}>Locked in — waiting for the other player...</Text>
      ) : (
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Lock In</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
