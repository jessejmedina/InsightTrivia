/**
 * Game screen — a thin host over `useGameRound`. It resolves the question
 * type's descriptor, renders that type's Play / Reveal component, and (as
 * host) decides when a round is complete, scores it, and advances the room.
 * All live plumbing (realtime, timer, loading) lives in `useGameRound`.
 */
import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';
import { AVATARS } from '../../lib/gameLogic';
import { buildRoundState, needsOpponentShot } from '../../lib/questionTypes/logic';
import { getDescriptor } from '../../lib/questionTypes';
import { advanceRoom } from '../../lib/roomAdvance';
import { gameStyles } from '../../components/game/gameStyles';
import { WaitingPhase } from '../../components/game/WaitingPhase';
import { ResultsPhase } from '../../components/game/ResultsPhase';
import { RevealFrame } from '../../components/game/RevealFrame';
import { CountUp } from '../../components/game/CountUp';
import { useGameRound } from './useGameRound';
import { resolveAndScoreRound, emitOpponentShot } from './scoreRound';

const REVEAL_MS = 4000;

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();

  const round = useGameRound(roomId!, profile?.id);
  const {
    loading, phase, room, players, question, questionIndex, questionIds,
    timeLeft, buzzedUserId, submissions, roundScore, isHost,
    startGame, buzzIn, submitRound,
  } = round;

  const descriptor = question ? getDescriptor(question.type) : null;
  const myPlayer = players.find((p) => p.user_id === profile?.id);
  const mySubmitted = !!(profile && submissions[profile.id]);
  const myPoints = roundScore ? (roundScore.points[profile?.id ?? ''] ?? 0) : 0;

  // One-shot guards per question index.
  const scoredForIndexRef = useRef<number | null>(null);
  const shotForIndexRef = useRef<number | null>(null);
  useEffect(() => {
    scoredForIndexRef.current = null;
    shotForIndexRef.current = null;
  }, [questionIndex]);

  // ── Host: resolve a completed round exactly once ─────────────
  useEffect(() => {
    if (!isHost || !descriptor || phase !== 'playing' || !room || !question) return;
    const playerIds = players.map((p) => p.user_id);
    if (playerIds.length < 1) return;

    const state = buildRoundState(
      descriptor.logic.roundStyle, submissions, buzzedUserId, playerIds,
      timeLeft <= 0, question.answer,
    );

    if (needsOpponentShot(descriptor.logic, state)) {
      if (shotForIndexRef.current !== questionIndex) {
        shotForIndexRef.current = questionIndex;
        const opponentId = playerIds.find((id) => id !== buzzedUserId);
        if (opponentId) emitOpponentShot(roomId!, profile!.id, opponentId);
      }
      return;
    }

    if (!descriptor.logic.isRoundComplete(state)) return;
    if (scoredForIndexRef.current === questionIndex) return;
    scoredForIndexRef.current = questionIndex;
    resolveAndScoreRound({
      descriptor, question, questionIndex, submissions, players,
      buzzedPlayerId: buzzedUserId, roomId: roomId!, hostId: profile!.id,
    });
  }, [
    isHost, descriptor, phase, room, question, players, submissions,
    buzzedUserId, timeLeft, questionIndex, roomId, profile,
  ]);

  // ── Host: advance after the reveal window ───────────────────
  useEffect(() => {
    if (!isHost || phase !== 'reveal' || !room) return;
    const t = setTimeout(() => {
      advanceRoom(supabase, roomId!, questionIndex, questionIds, profile!.id);
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [isHost, phase, room, questionIndex, questionIds, roomId, profile]);

  function handleStart() {
    if (!isHost || (players.length < 2 && !__DEV__)) {
      Alert.alert('Need at least 2 players to start.');
      return;
    }
    startGame();
  }

  // ── UI ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={gameStyles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={gameStyles.container}>
      <View style={gameStyles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={gameStyles.exitBtn}>✕ Leave</Text>
        </TouchableOpacity>
        <Text style={gameStyles.roomCode}>Room: {room?.code}</Text>
        {phase !== 'waiting' && (
          <Text style={gameStyles.questionCounter}>{questionIndex + 1}/{questionIds.length}</Text>
        )}
      </View>

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
              <CountUp value={p.score} style={gameStyles.scoreValue} />
            </View>
          );
        })}
      </View>

      {phase === 'waiting' && (
        <WaitingPhase players={players} isHost={isHost} onStart={handleStart} roomCode={room?.code} />
      )}

      {phase === 'playing' && descriptor && question && (
        <descriptor.PlayComponent
          question={question}
          questionId={question.id}
          timeLeft={timeLeft}
          hasSubmitted={mySubmitted}
          buzzedByMe={buzzedUserId === profile?.id}
          buzzedByOpponent={!!buzzedUserId && buzzedUserId !== profile?.id}
          onBuzz={descriptor.logic.roundStyle === 'buzz' ? buzzIn : undefined}
          onSubmit={submitRound}
        />
      )}

      {phase === 'playing' && !question && (
        <View style={gameStyles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      )}

      {phase === 'reveal' && descriptor && question && roundScore && (
        <RevealFrame
          mascotMood={myPoints > 0 ? 'cheer' : 'sad'}
          pointsThisRound={myPoints}
          runningTotal={myPlayer?.score ?? 0}
          celebrate={myPoints >= 150}
        >
          <descriptor.RevealComponent
            question={question}
            breakdown={roundScore.breakdown}
            myPointsThisRound={myPoints}
            myRunningTotal={myPlayer?.score ?? 0}
          />
        </RevealFrame>
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
