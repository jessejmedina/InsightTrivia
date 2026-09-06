import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { seededShuffle } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { SwipePayload } from '../../lib/questionTypes/logic';

/**
 * Play UI for `swipe` — a card stack, one card at a time. Fling or tap
 * left/right to categorise. `swipes` is keyed by each card's index in
 * `payload.cards` (not the shuffled order) so scoring lines up. Whatever
 * has been swiped is submitted when the deck clears or the timer ends.
 */
export function SwipePhase({ question, questionId, timeLeft, hasSubmitted, onSubmit }: PlayProps) {
  const p = question.payload as SwipePayload;
  const deck = useRef(
    seededShuffle(p.cards.map((c, i) => ({ ...c, orig: i })), questionId)
  ).current;

  const [pos, setPos] = useState(0);
  const swipesRef = useRef<Record<number, 'left' | 'right'>>({});
  const submittedRef = useRef(false);
  const x = useSharedValue(0);

  function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmit({ swipes: swipesRef.current });
  }

  function commit(side: 'left' | 'right') {
    const card = deck[pos];
    if (!card || submittedRef.current) return;
    swipesRef.current = { ...swipesRef.current, [card.orig]: side };
    x.value = 0;
    const next = pos + 1;
    setPos(next);
    if (next >= deck.length) submit();
  }

  useEffect(() => {
    if (hasSubmitted || timeLeft <= 0) submit();
  }, [hasSubmitted, timeLeft]);

  const pan = Gesture.Pan()
    .onChange((e) => { x.value += e.changeX; })
    .onEnd(() => {
      if (x.value > 90) runOnJS(commit)('right');
      else if (x.value < -90) runOnJS(commit)('left');
      else x.value = withSpring(0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 20}deg` }],
  }));

  const card = deck[pos];
  const done = pos >= deck.length;

  return (
    <View style={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>
      <View style={styles.swipeCatsRow}>
        <Text style={styles.swipeCatLeft}>◀ {p.categoryLeft}</Text>
        <Text style={styles.swipeCatRight}>{p.categoryRight} ▶</Text>
      </View>

      <View style={styles.swipeStage}>
        {done ? (
          <Text style={styles.submittedBanner}>All sorted — waiting for the other player…</Text>
        ) : (
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.swipeCard, cardStyle]}>
              <Text style={styles.swipeCardText}>{card.text}</Text>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {!done && (
        <View style={styles.swipeBtnRow}>
          <Text onPress={() => commit('left')} style={styles.swipeBtn}>◀ {p.categoryLeft}</Text>
          <Text onPress={() => commit('right')} style={styles.swipeBtn}>{p.categoryRight} ▶</Text>
        </View>
      )}
      <Text style={styles.qRef}>{Math.min(pos + (done ? 0 : 1), deck.length)}/{deck.length}</Text>
    </View>
  );
}
