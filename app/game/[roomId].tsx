/**
 * Game screen — handles the full live game session.
 * Phases: waiting → question → buzzed-in → answer-reveal → results
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, Animated, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { Colors, CardShadow, getCategoryColor } from '../../constants/colors';
import { AVATARS, calcBuzzPoints, OPPONENT_MISS_POINTS } from '../../lib/gameLogic';
import type { PlayerRow, Question } from '../../lib/gameTypes';

type Phase = 'waiting' | 'question' | 'buzzed' | 'reveal' | 'results';

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();

  const [phase, setPhase] = useState<Phase>('waiting');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [buzzedUserId, setBuzzedUserId] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [answerResult, setAnswerResult] = useState<'correct' | 'wrong' | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(30);
  const buzzScale = useRef(new Animated.Value(1)).current;

  const isHost = room?.host_id === profile?.id;
  const myPlayer = players.find((p) => p.user_id === profile?.id);
  const buzzedPlayer = players.find((p) => p.user_id === buzzedUserId);
  const isBuzzedIn = buzzedUserId === profile?.id;

  // ── Load room ────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    loadRoom();
  }, [roomId]);

  async function loadRoom() {
    setLoading(true);
    const { data: roomData } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (!roomData) { router.back(); return; }
    setRoom(roomData);
    setQuestionIds(roomData.question_ids ?? []);
    setQuestionIndex(roomData.current_question_index ?? 0);

    if (roomData.status === 'active') {
      await loadQuestion(roomData.question_ids[roomData.current_question_index]);
      setPhase('question');
    } else if (roomData.status === 'finished') {
      setPhase('results');
    }

    await loadPlayers();
    setLoading(false);
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from('game_players')
      .select('*, profiles(username, avatar_id, avatar_color)')
      .eq('room_id', roomId);
    if (data) setPlayers(data as PlayerRow[]);
  }

  async function loadQuestion(qid: string) {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('id', qid)
      .single();
    if (data) setQuestion(data as Question);
  }

  // ── Realtime subscriptions ───────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const roomChannel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        setRoom(payload.new);
        if (payload.new.status === 'finished') {
          stopTimer();
          setPhase('results');
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `room_id=eq.${roomId}`,
      }, () => {
        loadPlayers();
      })
      .subscribe();

    const eventsChannel = supabase
      .channel(`events-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_events',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        handleGameEvent(payload.new as any);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [roomId, profile?.id]);

  function handleGameEvent(event: { event_type: string; player_id: string; payload: any }) {
    switch (event.event_type) {
      case 'game_start':
        setPhase('question');
        const startQid = event.payload.question_id;
        loadQuestion(startQid);
        setQuestionIndex(event.payload.question_index ?? 0);
        startTimer();
        break;

      case 'buzz_in':
        setBuzzedUserId(event.player_id);
        const buzzTime = event.payload.time_left ?? 0;
        setTimeLeft(buzzTime);
        stopTimer();
        setPhase('buzzed');
        // animate button pulse
        Animated.sequence([
          Animated.timing(buzzScale, { toValue: 1.2, duration: 150, useNativeDriver: true }),
          Animated.timing(buzzScale, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
        break;

      case 'answer':
        setAnswerResult(event.payload.correct ? 'correct' : 'wrong');
        setPhase('reveal');
        stopTimer();
        loadPlayers(); // refresh scores
        break;

      case 'next_question':
        const nextIdx = event.payload.question_index;
        setQuestionIndex(nextIdx);
        loadQuestion(event.payload.question_id);
        setBuzzedUserId(null);
        setAnswerInput('');
        setAnswerResult(null);
        setTimeLeft(30);
        setPhase('question');
        startTimer();
        break;

      case 'game_over':
        stopTimer();
        setPhase('results');
        loadPlayers();
        break;
    }
  }

  // ── Timer ────────────────────────────────────────────────────
  function startTimer() {
    stopTimer();
    timeLeftRef.current = 30;
    setTimeLeft(30);
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        stopTimer();
        // Time's up — host advances
        if (isHost) handleTimeUp();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  useEffect(() => () => stopTimer(), []);

  async function handleTimeUp() {
    // No one buzzed — advance to next question or end game
    await advanceGame(false);
  }

  // ── Actions ──────────────────────────────────────────────────
  async function handleStartGame() {
    // DEV-ONLY BYPASS — remove before opening to real users
    if (!isHost || (players.length < 2 && !__DEV__)) {
      Alert.alert('Need at least 2 players to start.');
      return;
    }
    const firstQid = questionIds[0];
    await supabase.from('game_rooms').update({ status: 'active', current_question_index: 0 }).eq('id', roomId);
    await supabase.from('game_events').insert({
      room_id: roomId,
      event_type: 'game_start',
      player_id: profile!.id,
      payload: { question_id: firstQid, question_index: 0 },
    });
  }

  async function handleBuzzIn() {
    if (buzzedUserId) return; // someone already buzzed
    const t = timeLeftRef.current;
    await supabase.from('game_events').insert({
      room_id: roomId,
      event_type: 'buzz_in',
      player_id: profile!.id,
      payload: { time_left: t },
    });
  }

  async function handleSubmitAnswer() {
    if (!question || !profile) return;
    const raw = answerInput.trim().toLowerCase();
    const correctRaw = (question.answer ?? '').trim().toLowerCase();
    const correct = raw === correctRaw || correctRaw.includes(raw) || raw.includes(correctRaw);

    const points = correct ? calcBuzzPoints(timeLeft) : 0;

    // Update score
    if (points > 0 && myPlayer) {
      await supabase
        .from('game_players')
        .update({ score: myPlayer.score + points })
        .eq('room_id', roomId)
        .eq('user_id', profile.id);
    }

    await supabase.from('game_events').insert({
      room_id: roomId,
      event_type: 'answer',
      player_id: profile.id,
      payload: { correct, points, answer: answerInput.trim() },
    });

    // If host: after a delay, advance
    if (isHost) {
      setTimeout(() => advanceGame(correct), 3000);
    }
  }

  async function handleOpponentAnswer() {
    // After buzzed player got it wrong, opponent answers (host-only flow for simplicity)
    if (!isHost || !question || !profile) return;

    // Award opponent 100 pts
    const opponent = players.find((p) => p.user_id !== buzzedUserId);
    if (opponent) {
      await supabase
        .from('game_players')
        .update({ score: opponent.score + OPPONENT_MISS_POINTS })
        .eq('room_id', roomId)
        .eq('user_id', opponent.user_id);
    }

    await advanceGame(true);
  }

  async function advanceGame(wasAnswered: boolean) {
    const nextIdx = questionIndex + 1;
    if (nextIdx >= questionIds.length) {
      // Game over
      await supabase.from('game_rooms').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', roomId);
      await supabase.from('game_events').insert({
        room_id: roomId,
        event_type: 'game_over',
        player_id: profile!.id,
        payload: {},
      });
    } else {
      await supabase.from('game_rooms').update({ current_question_index: nextIdx }).eq('id', roomId);
      await supabase.from('game_events').insert({
        room_id: roomId,
        event_type: 'next_question',
        player_id: profile!.id,
        payload: { question_id: questionIds[nextIdx], question_index: nextIdx },
      });
    }
  }

  // ── UI ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => { stopTimer(); router.back(); }}>
          <Text style={styles.exitBtn}>✕ Leave</Text>
        </TouchableOpacity>
        <Text style={styles.roomCode}>Room: {room?.code}</Text>
        {phase !== 'waiting' && (
          <Text style={styles.questionCounter}>{questionIndex + 1}/{questionIds.length}</Text>
        )}
      </View>

      {/* Score bar */}
      <View style={styles.scoreBar}>
        {players.map((p) => {
          const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
          const isMe = p.user_id === profile?.id;
          return (
            <View key={p.id} style={[styles.scoreCard, isMe && { borderColor: Colors.accent }]}>
              <View style={[styles.miniAvatar, { backgroundColor: p.profiles?.avatar_color ?? Colors.primary }]}>
                <Text style={styles.miniAvatarEmoji}>{av.emoji}</Text>
              </View>
              <Text style={styles.scoreName} numberOfLines={1}>{p.profiles?.username}</Text>
              <Text style={styles.scoreValue}>{p.score}</Text>
            </View>
          );
        })}
      </View>

      {/* Phase content */}
      {phase === 'waiting' && (
        <WaitingPhase
          players={players}
          isHost={isHost}
          onStart={handleStartGame}
          roomCode={room?.code}
        />
      )}

      {(phase === 'question' || phase === 'buzzed') && question && (
        <QuestionPhase
          question={question}
          timeLeft={timeLeft}
          phase={phase}
          buzzedPlayer={buzzedPlayer}
          isBuzzedIn={isBuzzedIn}
          isHost={isHost}
          answerInput={answerInput}
          setAnswerInput={setAnswerInput}
          onBuzzIn={handleBuzzIn}
          onSubmitAnswer={handleSubmitAnswer}
          buzzScale={buzzScale}
          questionIndex={questionIndex}
          totalQuestions={questionIds.length}
        />
      )}

      {phase === 'reveal' && question && (
        <RevealPhase
          question={question}
          answerResult={answerResult}
          buzzedPlayer={buzzedPlayer}
          isHost={isHost}
          onNext={() => advanceGame(true)}
          onOpponentAnswer={handleOpponentAnswer}
        />
      )}

      {phase === 'results' && (
        <ResultsPhase
          players={players}
          myUserId={profile?.id ?? ''}
          onLeave={() => router.replace('/(tabs)/home')}
        />
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────

function WaitingPhase({ players, isHost, onStart, roomCode }: any) {
  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.waitTitle}>Waiting for players</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Room Code</Text>
        <Text style={styles.codeBig}>{roomCode}</Text>
        <Text style={styles.codeHint}>Share this code with friends</Text>
      </View>

      <Text style={styles.playerListLabel}>Players ({players.length})</Text>
      {players.map((p: PlayerRow) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        return (
          <View key={p.id} style={styles.waitPlayer}>
            <View style={[styles.waitAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={{ fontSize: 20 }}>{av.emoji}</Text>
            </View>
            <Text style={styles.waitPlayerName}>{p.profiles?.username}</Text>
          </View>
        );
      })}

      {isHost && (
        <TouchableOpacity
          // DEV-ONLY BYPASS — remove before opening to real users
          style={[styles.startBtn, (players.length < 2 && !__DEV__) && { opacity: 0.4 }]}
          onPress={onStart}
          disabled={players.length < 2 && !__DEV__}
        >
          <Text style={styles.startBtnText}>
            {players.length < 2
              ? (__DEV__ ? 'Start (Solo Dev Test)' : 'Waiting for 2nd player...')
              : 'Start Game!'}
          </Text>
        </TouchableOpacity>
      )}
      {!isHost && (
        <Text style={styles.waitingHint}>Waiting for host to start...</Text>
      )}
    </View>
  );
}

function QuestionPhase({ question, timeLeft, phase, buzzedPlayer, isBuzzedIn, isHost, answerInput, setAnswerInput, onBuzzIn, onSubmitAnswer, buzzScale, questionIndex, totalQuestions }: any) {
  const timerColor = timeLeft > 15 ? Colors.success : timeLeft > 7 ? Colors.accent : Colors.danger;
  const diffColor: any = { easy: Colors.success, medium: Colors.accent, hard: Colors.danger };

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer} keyboardShouldPersistTaps="handled">
      {/* Timer */}
      <View style={[styles.timerRing, { borderColor: timerColor }]}>
        <Text style={[styles.timerNumber, { color: timerColor }]}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

      {/* Category / difficulty */}
      <View style={styles.qMeta}>
        <View style={[styles.qCategoryPill, { backgroundColor: getCategoryColor(question.category) }]}>
          <Text style={styles.qCategory}>{question.category}</Text>
        </View>
        <Text style={[styles.qDifficulty, { color: diffColor[question.difficulty] }]}>
          {question.difficulty}
        </Text>
      </View>

      {/* Hint */}
      {question.hint && phase === 'question' && (
        <View style={styles.hintBox}>
          <Text style={styles.hintLabel}>Hint</Text>
          <Text style={styles.hintText}>{question.hint}</Text>
        </View>
      )}

      {/* Question */}
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
        {question.reference && (
          <Text style={styles.qRef}>{question.reference}</Text>
        )}
      </View>

      {/* Buzz state */}
      {phase === 'question' && (
        <Animated.View style={{ transform: [{ scale: buzzScale }] }}>
          <TouchableOpacity style={styles.buzzBtn} onPress={onBuzzIn}>
            <Text style={styles.buzzBtnText}>I Know It!</Text>
            <Text style={styles.buzzBtnSub}>Buzz in to stop the clock</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {phase === 'buzzed' && (
        <View style={styles.buzzedContainer}>
          <Text style={styles.buzzedLabel}>
            {buzzedPlayer?.profiles?.username ?? 'Player'} buzzed in!
          </Text>
          {isBuzzedIn ? (
            <View style={styles.answerContainer}>
              <Text style={styles.answerPrompt}>Type your answer:</Text>
              <TextInput
                style={styles.answerInput}
                placeholder="Your answer..."
                placeholderTextColor={Colors.textMuted}
                value={answerInput}
                onChangeText={setAnswerInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={onSubmitAnswer}
              />
              <TouchableOpacity style={styles.submitBtn} onPress={onSubmitAnswer}>
                <Text style={styles.submitBtnText}>Submit Answer</Text>
              </TouchableOpacity>
            </View>
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

function RevealPhase({ question, answerResult, buzzedPlayer, isHost, onNext, onOpponentAnswer }: any) {
  const correct = answerResult === 'correct';
  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.resultBanner, { backgroundColor: correct ? Colors.success : Colors.danger }]}>
        <Text style={styles.resultEmoji}>{correct ? '✓' : '✗'}</Text>
        <Text style={styles.resultText}>{correct ? 'Correct!' : 'Wrong!'}</Text>
      </View>

      <View style={styles.revealBox}>
        <Text style={styles.revealLabel}>The answer was:</Text>
        <Text style={styles.revealAnswer}>{question.answer}</Text>
        {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      </View>

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      {isHost && !correct && (
        <TouchableOpacity style={styles.oppBtn} onPress={onOpponentAnswer}>
          <Text style={styles.oppBtnText}>Award Opponent 100 pts & Continue</Text>
        </TouchableOpacity>
      )}

      {isHost && correct && (
        <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
          <Text style={styles.nextBtnText}>Next Question →</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingHint}>Host is advancing...</Text>
      )}
    </View>
  );
}

function ResultsPhase({ players, myUserId, onLeave }: any) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <Text style={styles.resultsTitle}>Game Over!</Text>

      {sorted.map((p: PlayerRow, i: number) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        const isMe = p.user_id === myUserId;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        return (
          <View key={p.id} style={[styles.resultRow, isMe && { borderColor: Colors.accent }]}>
            <Text style={styles.resultMedal}>{medal}</Text>
            <View style={[styles.miniAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={styles.miniAvatarEmoji}>{av.emoji}</Text>
            </View>
            <Text style={[styles.resultName, isMe && { color: Colors.accent }]}>{p.profiles?.username}</Text>
            <Text style={styles.resultScore}>{p.score} pts</Text>
          </View>
        );
      })}

      <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
        <Text style={styles.leaveBtnText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exitBtn: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  roomCode: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  questionCounter: { color: Colors.accent, fontWeight: '800', fontSize: 14 },
  scoreBar: {
    flexDirection: 'row', gap: 8, padding: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  scoreCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 16, padding: 8,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  miniAvatarEmoji: { fontSize: 16 },
  scoreName: { color: Colors.textSecondary, fontSize: 11, marginTop: 4 },
  scoreValue: { color: Colors.accent, fontWeight: '800', fontSize: 16 },
  phaseContainer: { flexGrow: 1, padding: 20, gap: 16, alignItems: 'center' },
  // Waiting
  waitTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 16 },
  codeBox: {
    backgroundColor: Colors.surface, borderRadius: 24, padding: 24, alignItems: 'center',
    width: '100%', ...CardShadow,
  },
  codeLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  codeBig: { fontSize: 42, fontWeight: '900', color: Colors.accent, letterSpacing: 6, marginVertical: 8 },
  codeHint: { color: Colors.textMuted, fontSize: 12 },
  playerListLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, alignSelf: 'flex-start' },
  waitPlayer: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start' },
  waitAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  waitPlayerName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  startBtn: {
    backgroundColor: Colors.accent, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 22, marginTop: 16,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  startBtnText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  waitingHint: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 },
  // Question
  timerRing: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  timerNumber: { fontSize: 32, fontWeight: '900' },
  timerLabel: { color: Colors.textMuted, fontSize: 11, marginTop: -4 },
  qMeta: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  qCategoryPill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  qCategory: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  qDifficulty: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  hintBox: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14, width: '100%',
    borderLeftWidth: 4, borderLeftColor: Colors.primary, ...CardShadow,
  },
  hintLabel: { color: Colors.primary, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  hintText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  questionBox: {
    backgroundColor: Colors.surface, borderRadius: 22, padding: 20, width: '100%',
    ...CardShadow,
  },
  questionText: { color: Colors.textPrimary, fontSize: 18, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  qRef: { color: Colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
  buzzBtn: {
    backgroundColor: Colors.accent, borderRadius: 60, width: 160, height: 160,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
    shadowColor: Colors.accent, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  buzzBtnText: { color: Colors.white, fontSize: 20, fontWeight: '900' },
  buzzBtnSub: { color: Colors.white, fontSize: 11, opacity: 0.8, marginTop: 4 },
  buzzedContainer: { width: '100%', alignItems: 'center', gap: 12 },
  buzzedLabel: { color: Colors.accent, fontSize: 18, fontWeight: '800' },
  answerContainer: { width: '100%', gap: 10 },
  answerPrompt: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  answerInput: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    color: Colors.textPrimary, fontSize: 18, borderWidth: 1, borderColor: Colors.accent,
    textAlign: 'center',
  },
  submitBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 18, alignItems: 'center' },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  waitBuzzed: { gap: 8, alignItems: 'center', marginTop: 16 },
  waitBuzzedText: { color: Colors.textMuted, fontSize: 14 },
  // Reveal
  resultBanner: {
    width: '100%', borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center',
  },
  resultEmoji: { fontSize: 28 },
  resultText: { fontSize: 24, fontWeight: '900', color: Colors.white },
  revealBox: {
    backgroundColor: Colors.surface, borderRadius: 22, padding: 20, width: '100%',
    alignItems: 'center', ...CardShadow,
  },
  revealLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  revealAnswer: { color: Colors.success, fontSize: 24, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  revealRef: { color: Colors.textMuted, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  oppBtn: { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 18, width: '100%', alignItems: 'center' },
  oppBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  nextBtn: { backgroundColor: Colors.accent, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 18 },
  nextBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  // Results
  resultsTitle: { fontSize: 32, fontWeight: '900', color: Colors.accent, marginTop: 8 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%',
    backgroundColor: Colors.surface, borderRadius: 20, padding: 14,
    borderWidth: 2, borderColor: 'transparent', ...CardShadow,
  },
  resultMedal: { fontSize: 24, width: 36 },
  resultName: { flex: 1, color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  resultScore: { color: Colors.accent, fontWeight: '800', fontSize: 18 },
  leaveBtn: {
    backgroundColor: Colors.surface, paddingVertical: 16, paddingHorizontal: 40,
    borderRadius: 20, marginTop: 8, width: '100%', alignItems: 'center', ...CardShadow,
  },
  leaveBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
});
