import type { DescriptorRoundState, RoundStyle, TypeLogic } from './types';

/**
 * Assembles the `DescriptorRoundState` the descriptor's `score` /
 * `isRoundComplete` consume, from the raw pieces the game host holds.
 *
 * `opponentShotTaken` is derived: on a buzz round it is true once both
 * players have a submission recorded (the buzzed player answered, then the
 * opponent took their shot).
 */
export function buildRoundState<TS = unknown>(
  roundStyle: RoundStyle,
  submissions: Record<string, { submission: TS; secondsLeft: number }>,
  buzzedPlayerId: string | null,
  playerIds: string[],
  timedOut: boolean,
  correctAnswer: string | null
): DescriptorRoundState<TS> {
  const submittedCount = playerIds.filter((id) => submissions[id] !== undefined).length;
  const opponentShotTaken = roundStyle === 'buzz' && submittedCount >= 2;
  return { roundStyle, submissions, buzzedPlayerId, opponentShotTaken, playerIds, timedOut, correctAnswer };
}

/**
 * True when a buzz round should hand the opponent a shot: the buzzed player
 * has answered, they were wrong (so the round is not yet complete), no shot
 * has been taken, and time has not run out.
 */
export function needsOpponentShot(logic: TypeLogic, state: DescriptorRoundState): boolean {
  if (logic.roundStyle !== 'buzz') return false;
  if (state.timedOut || state.opponentShotTaken) return false;
  if (state.playerIds.length < 2) return false; // no opponent to hand a shot to
  const buzzedSubmitted =
    state.buzzedPlayerId != null && state.submissions[state.buzzedPlayerId] !== undefined;
  if (!buzzedSubmitted) return false;
  return !logic.isRoundComplete(state);
}

/**
 * Orders the two players so index 0 maps to `score()`'s `mine` and index 1
 * to `opponent`. On a buzz round the buzzed player is `mine` (the answerer),
 * so `score()`'s buzzer-first logic lines up. Concurrent rounds are
 * symmetric, so original order is kept.
 */
export function orderScorePlayers(
  playerIds: string[],
  buzzedPlayerId: string | null,
  roundStyle: RoundStyle
): [string, string | undefined] {
  const [p0, p1] = playerIds;
  if (roundStyle === 'buzz' && p1 != null && buzzedPlayerId === p1) return [p1, p0];
  return [p0, p1];
}
