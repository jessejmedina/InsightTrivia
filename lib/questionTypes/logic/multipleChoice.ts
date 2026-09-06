import type { TypeLogic, DescriptorScoreInput, DescriptorRoundState } from './types';
import { calcBuzzPoints, OPPONENT_MISS_POINTS } from '../../gameLogic';

export interface MultipleChoiceSubmission { chosen: string }

function score(input: DescriptorScoreInput<null, MultipleChoiceSubmission>) {
  const { question, mine, opponent, mySecondsLeft } = input;
  const answer = question.answer ?? '';
  const mineCorrect = !!mine && mine.chosen === answer;
  if (mineCorrect) {
    return { points: { mine: calcBuzzPoints(mySecondsLeft ?? 0), opponent: 0 }, breakdown: { winner: 'mine' as const } };
  }
  const oppCorrect = !!opponent && opponent.chosen === answer;
  if (oppCorrect) {
    return { points: { mine: 0, opponent: OPPONENT_MISS_POINTS }, breakdown: { winner: 'opponent' as const } };
  }
  return { points: { mine: 0, opponent: 0 }, breakdown: { winner: 'none' as const } };
}

function isRoundComplete(state: DescriptorRoundState<MultipleChoiceSubmission>): boolean {
  if (state.timedOut) return true;
  const buzzed = state.buzzedPlayerId ? state.submissions[state.buzzedPlayerId] : undefined;
  if (!buzzed) return false;
  const buzzedCorrect = buzzed.submission.chosen === state.correctAnswer;
  if (buzzedCorrect) return true;
  // The buzzed player was wrong — the round ends only once the opponent's shot resolves.
  return state.opponentShotTaken;
}

export const multipleChoiceLogic: TypeLogic<null, MultipleChoiceSubmission> = {
  id: 'multiple_choice',
  roundStyle: 'buzz',
  timerSeconds: 30,
  score,
  isRoundComplete,
  validatePayload: () => ({ ok: true, payload: null }),
};
