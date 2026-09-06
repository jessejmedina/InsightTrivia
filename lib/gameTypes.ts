import type {
  OrderingPayload, MatchingPayload, EstimationPayload, ProgressivePayload, SwipePayload,
} from './questionTypes/logic';

export interface PlayerRow {
  id: string;
  user_id: string;
  score: number;
  team: string | null;
  profiles: { username: string; avatar_id: string; avatar_color: string };
}

export interface Question {
  id: string;
  question: string;
  answer: string | null;
  category: string;
  difficulty: string;
  reference: string | null;
  hint: string | null;
  type: string;
  options: string[] | null;
  payload:
    | OrderingPayload
    | MatchingPayload
    | EstimationPayload
    | ProgressivePayload
    | SwipePayload
    | null;
}

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  mode: '1v1' | 'teams';
  status: 'waiting' | 'active' | 'finished';
  current_question_index: number;
  question_ids: string[];
}

export type GamePhaseV3 = 'waiting' | 'playing' | 'reveal' | 'results';

export interface RoundScoredPayload {
  points: Record<string, number>;
  breakdown: unknown;
  correctAnswer: string | null;
  questionIndex: number;
}

/** One player's submission for the current round, as carried on `round_submit`. */
export interface RoundSubmissionRecord {
  submission: unknown;
  secondsLeft: number;
}

/** One completed round's outcome, accumulated by useGameRound for the results screen. */
export interface RoundHistoryEntry {
  questionIndex: number;
  points: Record<string, number>;
  correctAnswer: string | null;
}
