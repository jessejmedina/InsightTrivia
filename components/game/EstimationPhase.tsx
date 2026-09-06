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
  const [guess, setGuess] = useState<number>(() => {
    const mid = p.log ? Math.sqrt(p.min * p.max) : (p.min + p.max) / 2;
    return p.step ? Math.round(mid / p.step) * p.step : Math.round(mid);
  });
  const hasSubmittedRef = useRef(false);

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

      <Text style={styles.estimateReadout}>{formatGuess(guess)}</Text>
      <Text style={styles.estimateUnit}>{p.unit}</Text>

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
