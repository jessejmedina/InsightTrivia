/**
 * Game screen — handles the full live game session.
 * Phases: waiting → question → buzzed-in → answer-reveal → results
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  ActivityIndicator, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { Colors } from '../../constants/colors';
import { AVATARS, calcBuzzPoints, OPPONENT_MISS_POINTS, checkOrderingCorrectness, checkMatchingCorrectness, calcPartialCreditPoints } from '../../lib/gameLogic';
import type { MatchPair } from '../../lib/gameLogic';
import { getInteractionMode } from '../../lib/questionTypes';
import type { PlayerRow, Question } from '../../lib/gameTypes';
import { gameStyles } from '../../components/game/gameStyles';
import { WaitingPhase } from '../../components/game/WaitingPhase';
import { QuestionPhase } from '../../components/game/QuestionPhase';
import { OrderingPhase } from '../../components/game/OrderingPhase';
import { MatchingPhase } from '../../components/game/MatchingPhase';
import { RevealPhase } from '../../components/game/RevealPhase';
import { ResultsPhase } from '../../components/game/ResultsPhase';

type Phase = 'waiting' | 'question' | 'buzzed' | 'arranging' | 'reveal' | 'results';

const RACE_TIMER_SECONDS = 30;
const SIMULTANEOUS_TIMER_SECONDS = 20;

function timerSecondsFor(q: { type?: string | null } | null): number {
  return getInteractionMode(q?.type) === 'simultaneous' ? SIMULTANEOUS_TIMER_SECONDS : RACE_TIMER_SECONDS;
}

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
  const [sequenceSubmissions, setSequenceSubmissions] = useState<Record<string, { data: any; secondsLeft: number }>>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(30);
  const buzzScale = useRef(new Animated.Value(1)).current;
  // Guards advanceGame() so it only ever acts once per question index, no matter how
  // many independent triggers (timeout, completion effect, manual "Next" button) fire
  // for the same question.
  const advancedForIndexRef = useRef<number | null>(null);

  const isHost = room?.host_id === profile?.id;
  const myPlayer = players.find((p) => p.user_id === profile?.id);
  const buzzedPlayer = players.find((p) => p.user_id === buzzedUserId);
  const isBuzzedIn = buzzedUserId === profile?.id;
  const mySequenceSubmitted = !!(profile && sequenceSubmissions[profile.id]);
  const myTeamAlreadySubmitted = room?.mode === 'teams' && myPlayer?.team
    ? players.some((p) => p.team === myPlayer.team && sequenceSubmissions[p.user_id])
    : false;

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
      setPhase('question');
      const q = await loadQuestion(roomData.question_ids[roomData.current_question_index]);
      startTimer(timerSecondsFor(q));
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

  async function loadQuestion(qid: string): Promise<Question | null> {
    const { data } = await supabase.from('questions').select('*').eq('id', qid).single();
    if (!data) return null;
    const q = data as Question;
    setQuestion(q);
    if (getInteractionMode(q.type) === 'simultaneous') {
      setPhase('arranging');
    }
    return q;
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
      case 'game_start': {
        setPhase('question');
        const startQid = event.payload.question_id;
        setQuestionIndex(event.payload.question_index ?? 0);
        setSequenceSubmissions({});
        advancedForIndexRef.current = null;
        loadQuestion(startQid).then((q) => startTimer(timerSecondsFor(q)));
        break;
      }

      case 'sequence_submit':
        setSequenceSubmissions((prev) => ({
          ...prev,
          [event.player_id]: { data: event.payload.submission, secondsLeft: event.payload.seconds_left },
        }));
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

      case 'next_question': {
        const nextIdx = event.payload.question_index;
        setQuestionIndex(nextIdx);
        setQuestion(null);
        setBuzzedUserId(null);
        setAnswerResult(null);
        setSequenceSubmissions({});
        setPhase('question');
        advancedForIndexRef.current = null;
        loadQuestion(event.payload.question_id).then((q) => startTimer(timerSecondsFor(q)));
        break;
      }

      case 'game_over':
        stopTimer();
        setPhase('results');
        loadPlayers();
        break;
    }
  }

  // ── Timer ────────────────────────────────────────────────────
  function startTimer(durationSeconds = RACE_TIMER_SECONDS) {
    stopTimer();
    timeLeftRef.current = durationSeconds;
    setTimeLeft(durationSeconds);
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        stopTimer();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  useEffect(() => () => stopTimer(), []);

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

  async function handleSubmitAnswer(chosenAnswer?: string) {
    if (!question || !profile || question.answer === null) return;
    const raw = (chosenAnswer ?? answerInput).trim().toLowerCase();
    const correctRaw = question.answer.trim().toLowerCase();
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
      setTimeout(() => advanceGame(), 3000);
    }
  }

  async function handleSubmitSequence(submission: string[] | MatchPair[]) {
    if (!question || !profile || !question.payload) return;
    const secondsLeft = timeLeftRef.current;

    let correctCount: number;
    let totalCount: number;
    if (question.type === 'ordering' && 'items' in question.payload) {
      correctCount = checkOrderingCorrectness(submission as string[], question.payload.items);
      totalCount = question.payload.items.length;
    } else if (question.type === 'matching' && 'pairs' in question.payload) {
      correctCount = checkMatchingCorrectness(submission as MatchPair[], question.payload.pairs);
      totalCount = question.payload.pairs.length;
    } else {
      return; // unknown/mismatched type+payload combination, do nothing rather than silently scoring wrong
    }
    const points = calcPartialCreditPoints(correctCount, totalCount, secondsLeft);

    if (myPlayer) {
      await supabase
        .from('game_players')
        .update({ score: myPlayer.score + points })
        .eq('room_id', roomId)
        .eq('user_id', profile.id);
    }

    await supabase.from('game_events').insert({
      room_id: roomId,
      event_type: 'sequence_submit',
      player_id: profile.id,
      payload: { submission, seconds_left: secondsLeft },
    });
  }

  // Once every player (or, in teams mode, every team) has submitted a simultaneous-type
  // answer, the host advances the game.
  //
  // This effect's dependency array must include the full `players` array (not just
  // `players.length`) because the teams-mode branch needs each player's `.team`. But `players`
  // gets a brand-new array reference on every `game_players` realtime UPDATE — including the
  // score write that handleSubmitSequence performs right before inserting the sequence_submit
  // event. That score-write UPDATE and the sequence_submit INSERT travel on two independent
  // realtime channels with no ordering guarantee, so it's entirely possible for the score
  // UPDATE to arrive *after* the submission that already satisfied the completion condition —
  // which would re-run this effect (still satisfied) and schedule another
  // setTimeout(advanceGame) a moment later. That's harmless now: advanceGame() itself is
  // idempotent per question index (see advancedForIndexRef), so a redundant call here — or
  // from the timeout effect below firing around the same time — is a no-op.
  useEffect(() => {
    if (phase !== 'arranging' || !isHost) return;
    const expectedCount = room?.mode === 'teams'
      ? new Set(players.map((p) => p.team).filter(Boolean)).size
      : players.length;
    const submittedTeamsOrPlayers = room?.mode === 'teams'
      ? new Set(
          players
            .filter((p) => sequenceSubmissions[p.user_id])
            .map((p) => p.team)
        ).size
      : Object.keys(sequenceSubmissions).length;
    if (submittedTeamsOrPlayers >= expectedCount && expectedCount > 0) {
      stopTimer();
      setTimeout(() => advanceGame(), 1500);
    }
  }, [sequenceSubmissions, phase, isHost, players, room?.mode]);

  // Time's-up advance: the setInterval in startTimer() used to call handleTimeUp() via a
  // closure chain rooted in the realtime-subscription useEffect above, which froze
  // isHost/phase at their values from that one-time subscription render (typically before
  // `room` even loads) — so that check never actually fired with current state. This effect
  // re-runs with fresh state on every render, so it reliably detects timeLeft hitting 0 and
  // drives the advance directly, both for simultaneous-type ('arranging') questions where a
  // player never submits, and for race-type ('question') questions where nobody buzzes in.
  // advanceGame() is idempotent per question index, so it's safe to call from here even if
  // the completion effect above also calls it around the same time.
  useEffect(() => {
    if (!isHost) return;
    if ((phase === 'arranging' || phase === 'question') && timeLeft <= 0) {
      stopTimer();
      advanceGame();
    }
  }, [timeLeft, phase, isHost]);

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

    await advanceGame();
  }

  async function advanceGame() {
    if (advancedForIndexRef.current === questionIndex) return; // already advanced past this question
    advancedForIndexRef.current = questionIndex;
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
      <View style={gameStyles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={gameStyles.container}>
      {/* Top bar */}
      <View style={gameStyles.topBar}>
        <TouchableOpacity onPress={() => { stopTimer(); router.back(); }}>
          <Text style={gameStyles.exitBtn}>✕ Leave</Text>
        </TouchableOpacity>
        <Text style={gameStyles.roomCode}>Room: {room?.code}</Text>
        {phase !== 'waiting' && (
          <Text style={gameStyles.questionCounter}>{questionIndex + 1}/{questionIds.length}</Text>
        )}
      </View>

      {/* Score bar */}
      <View style={gameStyles.scoreBar}>
        {players.map((p) => {
          const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
          const isMe = p.user_id === profile?.id;
          return (
            <View key={p.id} style={[gameStyles.scoreCard, isMe && { borderColor: Colors.accent }]}>
              <View style={[gameStyles.miniAvatar, { backgroundColor: p.profiles?.avatar_color ?? Colors.primary }]}>
                <Text style={gameStyles.miniAvatarEmoji}>{av.emoji}</Text>
              </View>
              <Text style={gameStyles.scoreName} numberOfLines={1}>{p.profiles?.username}</Text>
              <Text style={gameStyles.scoreValue}>{p.score}</Text>
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

      {phase === 'arranging' && question?.type === 'ordering' && question.payload && 'items' in question.payload && (
        <OrderingPhase
          items={question.payload.items}
          questionId={question.id}
          timeLeft={timeLeft}
          hasSubmitted={mySequenceSubmitted || myTeamAlreadySubmitted}
          onSubmit={handleSubmitSequence}
        />
      )}

      {phase === 'arranging' && question?.type === 'matching' && question.payload && 'pairs' in question.payload && (
        <MatchingPhase
          pairs={question.payload.pairs}
          questionId={question.id}
          timeLeft={timeLeft}
          hasSubmitted={mySequenceSubmitted || myTeamAlreadySubmitted}
          onSubmit={handleSubmitSequence}
        />
      )}

      {phase === 'reveal' && question && (
        <RevealPhase
          question={question}
          answerResult={answerResult}
          buzzedPlayer={buzzedPlayer}
          isHost={isHost}
          onNext={() => advanceGame()}
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
