/**
 * Host-only helpers: resolve a completed round into score writes + a
 * `round_scored` event, and emit an `opponent_shot` on a wrong buzz.
 */
import { supabase } from '../../lib/supabase';
import { orderScorePlayers } from '../../lib/questionTypes/logic';
import type { QuestionDescriptor } from '../../lib/questionTypes';
import type { PlayerRow, Question, RoundSubmissionRecord } from '../../lib/gameTypes';

export async function resolveAndScoreRound(params: {
  descriptor: QuestionDescriptor;
  question: Question;
  submissions: Record<string, RoundSubmissionRecord>;
  players: PlayerRow[];
  buzzedPlayerId: string | null;
  roomId: string;
  hostId: string;
}): Promise<void> {
  const { descriptor, question, submissions, players, buzzedPlayerId, roomId, hostId } = params;
  const playerIds = players.map((p) => p.user_id);
  if (playerIds.length < 1) return;

  // pA = "mine" for score(), pB = "opponent". pB is undefined in solo dev testing.
  const [pA, pB] = orderScorePlayers(playerIds, buzzedPlayerId, descriptor.logic.roundStyle);
  const result = descriptor.logic.score({
    question: {
      payload: question.payload as never,
      options: question.options,
      answer: question.answer,
    },
    mine: submissions[pA]?.submission ?? null,
    opponent: pB ? (submissions[pB]?.submission ?? null) : null,
    mySecondsLeft: submissions[pA]?.secondsLeft ?? null,
    opponentSecondsLeft: pB ? (submissions[pB]?.secondsLeft ?? null) : null,
  });

  const pointsByPlayer: Record<string, number> = { [pA]: result.points.mine };
  if (pB) pointsByPlayer[pB] = result.points.opponent;

  for (const p of players) {
    const add = pointsByPlayer[p.user_id] ?? 0;
    if (add > 0) {
      await supabase.from('game_players')
        .update({ score: p.score + add })
        .eq('room_id', roomId).eq('user_id', p.user_id);
    }
  }

  await supabase.from('game_events').insert({
    room_id: roomId, event_type: 'round_scored', player_id: hostId,
    payload: { points: pointsByPlayer, breakdown: result.breakdown, correctAnswer: question.answer },
  });
}

export async function emitOpponentShot(roomId: string, hostId: string, opponentId: string): Promise<void> {
  await supabase.from('game_events').insert({
    room_id: roomId, event_type: 'opponent_shot', player_id: hostId,
    payload: { player_id: opponentId },
  });
}
