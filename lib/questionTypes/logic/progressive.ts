import type { TypeLogic, ProgressivePayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface ProgressiveSubmission { chosen: string; cluesShownAtBuzz: number }

export const CLUE_LADDER = [300, 220, 150, 90, 50] as const;

/** Points for a correct answer buzzed with `cluesShown` clues visible. */
export function ladderPoints(cluesShown: number): number {
  if (cluesShown < 1) return 0;
  return CLUE_LADDER[Math.min(cluesShown, CLUE_LADDER.length) - 1];
}

function score(input: DescriptorScoreInput<ProgressivePayload, ProgressiveSubmission>) {
  const answer = input.question.answer ?? '';
  const mine = input.mine;
  const opp = input.opponent;
  if (mine && mine.chosen === answer) {
    return { points: { mine: ladderPoints(mine.cluesShownAtBuzz), opponent: 0 }, breakdown: { answer, winner: 'mine' as const, mine, opponent: opp } };
  }
  if (opp && opp.chosen === answer) {
    return { points: { mine: 0, opponent: ladderPoints(opp.cluesShownAtBuzz) }, breakdown: { answer, winner: 'opponent' as const, mine, opponent: opp } };
  }
  return { points: { mine: 0, opponent: 0 }, breakdown: { answer, winner: 'none' as const, mine, opponent: opp } };
}

function isRoundComplete(state: DescriptorRoundState<ProgressiveSubmission>): boolean {
  if (state.timedOut) return true;
  const buzzed = state.buzzedPlayerId ? state.submissions[state.buzzedPlayerId] : undefined;
  if (!buzzed) return false;
  if (buzzed.submission.chosen === state.correctAnswer) return true;
  // Wrong buzz: ends once the opponent's shot resolves, or immediately if there's no opponent.
  return state.opponentShotTaken || state.playerIds.length < 2;
}

function validatePayload(raw: unknown) {
  const clues = (raw as { clues?: unknown })?.clues;
  if (!Array.isArray(clues) || clues.length < 3 || clues.length > 5) {
    return { ok: false as const, error: 'progressive payload.clues must be 3 to 5 strings' };
  }
  if (clues.some((c) => typeof c !== 'string' || !c.trim())) {
    return { ok: false as const, error: 'every progressive clue must be a non-empty string' };
  }
  return { ok: true as const, payload: { clues: clues.map((c) => (c as string).trim()) } };
}

export const progressiveLogic: TypeLogic<ProgressivePayload, ProgressiveSubmission> = {
  id: 'progressive', roundStyle: 'buzz', timerSeconds: 30, score, isRoundComplete, validatePayload,
};
