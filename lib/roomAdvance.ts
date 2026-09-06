import type { SupabaseClient } from '@supabase/supabase-js';

export type AdvanceDecision =
  | { kind: 'next'; nextIndex: number; nextQuestionId: string }
  | { kind: 'game_over' };

export function decideAdvance(currentIndex: number, questionIds: string[]): AdvanceDecision {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= questionIds.length) return { kind: 'game_over' };
  return { kind: 'next', nextIndex, nextQuestionId: questionIds[nextIndex] };
}

/**
 * Advances the room past `currentIndex` exactly once, no matter how many
 * callers fire for the same index. The guard is the WHERE clause on the
 * UPDATE: the first call flips current_question_index and its `.select()`
 * returns the row; a concurrent second call matches no row (index already
 * moved) and returns nothing, so it emits no event.
 *
 * Returns 'advanced' if this call performed the advance, 'noop' if another
 * call already did.
 */
export async function advanceRoom(
  supabase: SupabaseClient,
  roomId: string,
  currentIndex: number,
  questionIds: string[],
  hostId: string
): Promise<'advanced' | 'noop'> {
  const decision = decideAdvance(currentIndex, questionIds);

  if (decision.kind === 'game_over') {
    const { data } = await supabase
      .from('game_rooms')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('status', 'active')
      .select('id');
    if (!data || data.length === 0) return 'noop';
    await supabase.from('game_events').insert({
      room_id: roomId, event_type: 'game_over', player_id: hostId, payload: {},
    });
    return 'advanced';
  }

  const { data } = await supabase
    .from('game_rooms')
    .update({ current_question_index: decision.nextIndex })
    .eq('id', roomId)
    .eq('current_question_index', currentIndex)
    .select('id');
  if (!data || data.length === 0) return 'noop';

  await supabase.from('game_events').insert({
    room_id: roomId,
    event_type: 'next_question',
    player_id: hostId,
    payload: { question_id: decision.nextQuestionId, question_index: decision.nextIndex },
  });
  return 'advanced';
}
