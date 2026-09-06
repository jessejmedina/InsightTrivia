/**
 * Owns the live plumbing for a game session: room/player/question loading,
 * the Supabase Realtime subscriptions, and the countdown timer. It exposes
 * plain state plus three actions (start / buzz / submit).
 *
 * It deliberately knows NO game rules — deciding when a round is complete,
 * scoring it, and advancing the room all live in the host component
 * (`app/game/[roomId].tsx`), which has the descriptor logic and the players
 * array it needs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getTypeLogic } from '../../lib/questionTypes/logic';
import type {
  PlayerRow, Question, RoomRow, GamePhaseV3, RoundScoredPayload, RoundSubmissionRecord,
} from '../../lib/gameTypes';

/** Seconds a player has to pick an option after buzzing in (also the
 *  opponent's shot window). Keeps a buzz round from hanging if nobody picks. */
const ANSWER_WINDOW_SECONDS = 12;

export interface GameRound {
  loading: boolean;
  phase: GamePhaseV3;
  room: RoomRow | null;
  players: PlayerRow[];
  question: Question | null;
  questionIndex: number;
  questionIds: string[];
  timeLeft: number;
  buzzedUserId: string | null;
  submissions: Record<string, RoundSubmissionRecord>;
  roundScore: RoundScoredPayload | null;
  isHost: boolean;
  startGame: () => Promise<void>;
  buzzIn: () => Promise<void>;
  submitRound: (submission: unknown) => Promise<void>;
}

export function useGameRound(roomId: string, profileId: string | undefined): GameRound {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<GamePhaseV3>('waiting');
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(30);
  const [buzzedUserId, setBuzzedUserId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, RoundSubmissionRecord>>({});
  const [roundScore, setRoundScore] = useState<RoundScoredPayload | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(30);
  const buzzedUserIdRef = useRef<string | null>(null);
  const buzzScoreSecondsRef = useRef<number | null>(null);
  const questionIdsRef = useRef<string[]>([]);
  const isHostRef = useRef(false);

  const isHost = room?.host_id === profileId;
  isHostRef.current = isHost;
  buzzedUserIdRef.current = buzzedUserId;
  questionIdsRef.current = questionIds;

  // ── Timer ────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback((durationSeconds: number) => {
    stopTimer();
    timeLeftRef.current = durationSeconds;
    setTimeLeft(durationSeconds);
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) stopTimer();
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Loaders ──────────────────────────────────────────────────
  const loadPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('game_players')
      .select('*, profiles(username, avatar_id, avatar_color)')
      .eq('room_id', roomId);
    if (data) setPlayers(data as PlayerRow[]);
  }, [roomId]);

  const loadQuestion = useCallback(async (qid: string): Promise<Question | null> => {
    const { data } = await supabase.from('questions').select('*').eq('id', qid).single();
    if (!data) return null;
    const q = data as Question;
    setQuestion(q);
    return q;
  }, []);

  const resetForNewQuestion = useCallback((index: number) => {
    setQuestion(null);
    setBuzzedUserId(null);
    setSubmissions({});
    setRoundScore(null);
    buzzScoreSecondsRef.current = null;
    setQuestionIndex(index);
    setPhase('playing');
  }, []);

  const loadRoom = useCallback(async () => {
    setLoading(true);
    const { data: roomData } = await supabase
      .from('game_rooms').select('*').eq('id', roomId).single();
    if (!roomData) { setLoading(false); return; }
    const r = roomData as RoomRow;
    setRoom(r);
    setQuestionIds(r.question_ids ?? []);
    setQuestionIndex(r.current_question_index ?? 0);

    if (r.status === 'active') {
      setPhase('playing');
      const q = await loadQuestion(r.question_ids[r.current_question_index]);
      startTimer(getTypeLogic(q?.type).timerSeconds);
    } else if (r.status === 'finished') {
      setPhase('results');
    } else {
      setPhase('waiting');
    }
    await loadPlayers();
    setLoading(false);
  }, [roomId, loadQuestion, loadPlayers, startTimer]);

  useEffect(() => { if (roomId) loadRoom(); }, [roomId, loadRoom]);

  // ── Realtime ─────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    function handleGameEvent(event: { event_type: string; player_id: string; payload: any }) {
      switch (event.event_type) {
        case 'game_start': {
          resetForNewQuestion(event.payload.question_index ?? 0);
          loadQuestion(event.payload.question_id).then((q) =>
            startTimer(getTypeLogic(q?.type).timerSeconds));
          break;
        }
        case 'next_question': {
          resetForNewQuestion(event.payload.question_index);
          loadQuestion(event.payload.question_id).then((q) =>
            startTimer(getTypeLogic(q?.type).timerSeconds));
          break;
        }
        case 'buzz_in': {
          setBuzzedUserId(event.player_id);
          buzzScoreSecondsRef.current = event.payload.time_left ?? 0;
          startTimer(ANSWER_WINDOW_SECONDS);
          break;
        }
        case 'opponent_shot': {
          setBuzzedUserId(event.payload.player_id);
          startTimer(ANSWER_WINDOW_SECONDS);
          break;
        }
        case 'round_submit': {
          setSubmissions((prev) => ({
            ...prev,
            [event.player_id]: {
              submission: event.payload.submission,
              secondsLeft: event.payload.seconds_left,
            },
          }));
          break;
        }
        case 'round_scored': {
          setRoundScore(event.payload as RoundScoredPayload);
          setPhase('reveal');
          stopTimer();
          loadPlayers();
          break;
        }
        case 'game_over': {
          stopTimer();
          setPhase('results');
          loadPlayers();
          break;
        }
      }
    }

    const roomChannel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}`,
      }, (payload) => {
        setRoom(payload.new as RoomRow);
        if ((payload.new as RoomRow).status === 'finished') {
          stopTimer();
          setPhase('results');
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_players', filter: `room_id=eq.${roomId}`,
      }, () => { loadPlayers(); })
      .subscribe();

    const eventsChannel = supabase
      .channel(`events-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}`,
      }, (payload) => { handleGameEvent(payload.new as any); })
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [roomId, profileId, resetForNewQuestion, loadQuestion, loadPlayers, startTimer, stopTimer]);

  // ── Actions ──────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!isHostRef.current || !profileId) return;
    const firstQid = questionIdsRef.current[0];
    await supabase.from('game_rooms')
      .update({ status: 'active', current_question_index: 0 }).eq('id', roomId);
    await supabase.from('game_events').insert({
      room_id: roomId, event_type: 'game_start', player_id: profileId,
      payload: { question_id: firstQid, question_index: 0 },
    });
  }, [roomId, profileId]);

  const buzzIn = useCallback(async () => {
    if (buzzedUserIdRef.current || !profileId) return;
    await supabase.from('game_events').insert({
      room_id: roomId, event_type: 'buzz_in', player_id: profileId,
      payload: { time_left: timeLeftRef.current },
    });
  }, [roomId, profileId]);

  const submitRound = useCallback(async (submission: unknown) => {
    if (!profileId) return;
    const secondsLeft = buzzedUserIdRef.current
      ? (buzzScoreSecondsRef.current ?? 0)
      : timeLeftRef.current;
    await supabase.from('game_events').insert({
      room_id: roomId, event_type: 'round_submit', player_id: profileId,
      payload: { submission, seconds_left: secondsLeft },
    });
  }, [roomId, profileId]);

  return {
    loading, phase, room, players, question, questionIndex, questionIds,
    timeLeft, buzzedUserId, submissions, roundScore, isHost,
    startGame, buzzIn, submitRound,
  };
}
