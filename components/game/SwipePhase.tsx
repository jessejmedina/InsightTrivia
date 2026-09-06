import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate,
} from 'react-native-reanimated';
import { seededShuffle } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';
import { TimerRing } from './TimerRing';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { SwipePayload } from '../../lib/questionTypes/logic';

const FLY = 700; // px the card travels off-screen on a commit

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
  const busyRef = useRef(false); // true during the fly-off animation
  const x = useSharedValue(0);

  function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmit({ swipes: swipesRef.current });
  }

  // Runs on the JS thread once the fly-off finishes: record the swipe, reset
  // the card to centre, and reveal the next one.
  function advance(side: 'left' | 'right') {
    busyRef.current = false;
    const card = deck[pos];
    if (!card || submittedRef.current) return;
    swipesRef.current = { ...swipesRef.current, [card.orig]: side };
    x.value = 0;
    const next = pos + 1;
    setPos(next);
    if (next >= deck.length) submit();
  }

  function commit(side: 'left' | 'right') {
    if (busyRef.current || submittedRef.current || pos >= deck.length) return;
    busyRef.current = true;
    x.value = withTiming(side === 'right' ? FLY : -FLY, { duration: 190 }, (finished) => {
      if (finished) runOnJS(advance)(side);
    });
  }

  useEffect(() => {
    if (hasSubmitted || timeLeft <= 0) submit();
  }, [hasSubmitted, timeLeft]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (!busyRef.current) x.value += e.changeX;
    })
    .onEnd(() => {
      if (busyRef.current) return;
      if (x.value > 100) {
        x.value = withTiming(FLY, { duration: 170 }, (f) => { if (f) runOnJS(advance)('right'); });
      } else if (x.value < -100) {
        x.value = withTiming(-FLY, { duration: 170 }, (f) => { if (f) runOnJS(advance)('left'); });
      } else {
        x.value = withSpring(0, { damping: 15, stiffness: 220 });
      }
    });

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { rotate: `${interpolate(x.value, [-FLY, 0, FLY], [-18, 0, 18])}deg` },
    ],
    opacity: interpolate(Math.abs(x.value), [0, FLY * 0.55, FLY], [1, 1, 0]),
  }));

  // Category hint that brightens as you drag toward it.
  const leftHintStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-140, -20], [1, 0], 'clamp') }));
  const rightHintStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, 140], [0, 1], 'clamp') }));

  const card = deck[pos];
  const nextCard = deck[pos + 1];
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
          <>
            {nextCard && (
              <View style={[styles.swipeCard, styles.swipeCardBehind]}>
                <Text style={styles.swipeCardText}>{nextCard.text}</Text>
              </View>
            )}
            <Animated.View style={[styles.swipeHintBadge, styles.swipeHintLeft, leftHintStyle]}>
              <Text style={styles.swipeHintText}>{p.categoryLeft}</Text>
            </Animated.View>
            <Animated.View style={[styles.swipeHintBadge, styles.swipeHintRight, rightHintStyle]}>
              <Text style={styles.swipeHintText}>{p.categoryRight}</Text>
            </Animated.View>
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.swipeCard, topCardStyle]}>
                <Text style={styles.swipeCardText}>{card.text}</Text>
              </Animated.View>
            </GestureDetector>
          </>
        )}
      </View>

      {!done && (
        <View style={styles.swipeBtnRow}>
          <Text onPress={() => commit('left')} style={[styles.swipeBtn, { backgroundColor: Colors.primary }]}>
            ◀ {p.categoryLeft}
          </Text>
          <Text onPress={() => commit('right')} style={[styles.swipeBtn, { backgroundColor: Colors.danger }]}>
            {p.categoryRight} ▶
          </Text>
        </View>
      )}
      <Text style={styles.qRef}>{Math.min(pos + (done ? 0 : 1), deck.length)}/{deck.length}</Text>
    </View>
  );
}
