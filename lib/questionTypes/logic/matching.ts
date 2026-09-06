import type { TypeLogic, MatchingPayload, DescriptorScoreInput, DescriptorRoundState } from './types';
import { calcPartialCreditPoints, checkMatchingCorrectness } from '../../gameLogic';
import type { MatchPair } from '../../gameLogic';

export interface MatchingSubmission { pairs: MatchPair[] }

function scoreOne(sub: MatchingSubmission | null, correct: MatchPair[], secondsLeft: number | null): number {
  if (!sub || secondsLeft == null) return 0;
  return calcPartialCreditPoints(checkMatchingCorrectness(sub.pairs, correct), correct.length, secondsLeft);
}

function score(input: DescriptorScoreInput<MatchingPayload, MatchingSubmission>) {
  const pairs = input.question.payload?.pairs ?? [];
  return {
    points: {
      mine: scoreOne(input.mine, pairs, input.mySecondsLeft),
      opponent: scoreOne(input.opponent, pairs, input.opponentSecondsLeft),
    },
    breakdown: { pairs },
  };
}

function isRoundComplete(state: DescriptorRoundState<MatchingSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const pairs = (raw as { pairs?: unknown })?.pairs;
  if (!Array.isArray(pairs) || pairs.length !== 4) {
    return { ok: false as const, error: 'matching payload.pairs must be an array of exactly 4 pairs' };
  }
  if (pairs.some((p) => !p || typeof p.left !== 'string' || typeof p.right !== 'string' || !p.left.trim() || !p.right.trim())) {
    return { ok: false as const, error: 'every matching pair needs a non-empty string "left" and "right"' };
  }
  if (new Set(pairs.map((p) => p.left)).size !== 4) {
    return { ok: false as const, error: 'matching "left" values must be distinct' };
  }
  return { ok: true as const, payload: { pairs: pairs.map((p) => ({ left: p.left, right: p.right })) as MatchPair[] } };
}

export const matchingLogic: TypeLogic<MatchingPayload, MatchingSubmission> = {
  id: 'matching',
  roundStyle: 'concurrent',
  timerSeconds: 20,
  score,
  isRoundComplete,
  validatePayload,
};
