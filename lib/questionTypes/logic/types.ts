/**
 * Pure type definitions for the question-type descriptor system.
 *
 * IMPORTANT: nothing under `lib/questionTypes/logic/` may import React,
 * react-native, or any `.tsx` file — this code runs under plain `tsx --test`.
 */

export type RoundStyle = 'buzz' | 'concurrent';

export interface OrderingPayload {
  items: string[];
}

export interface MatchingPayload {
  pairs: { left: string; right: string }[];
}

export interface EstimationPayload {
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
}

export interface ProgressivePayload {
  clues: string[];
}

export interface SwipePayload {
  categoryLeft: string;
  categoryRight: string;
  cards: { text: string; side: 'left' | 'right' }[];
}

export interface TapTargetPayload {
  /** Which map image to render (a key the MapView component knows, e.g. 'near-east'). */
  map: string;
  /** Correct spot in normalized map coordinates: x from the left edge, y from
   *  the top edge, each in [0, 1]. */
  target: { x: number; y: number };
  /** Human-readable place name, shown in the reveal. */
  label: string;
}

export interface DescriptorScoreInput<TPayload = unknown, TSubmission = unknown> {
  question: { payload: TPayload | null; options: string[] | null; answer: string | null };
  /** buzz: the answerer's submission. concurrent: this player's submission. */
  mine: TSubmission | null;
  /** buzz: the opponent's shot submission if one happened. concurrent: the other player's submission. */
  opponent: TSubmission | null;
  mySecondsLeft: number | null;
  opponentSecondsLeft: number | null;
}

export interface RoundScoreResult {
  points: { mine: number; opponent: number };
  /** Structured data the RevealComponent renders. Type-specific. */
  breakdown: unknown;
}

export interface DescriptorRoundState<TSubmission = unknown> {
  roundStyle: RoundStyle;
  submissions: Record<string, { submission: TSubmission; secondsLeft: number }>;
  buzzedPlayerId: string | null;
  opponentShotTaken: boolean;
  playerIds: string[];
  timedOut: boolean;
  /** The question's correct answer, for buzz types that need to know whether
   *  a buzzed answer resolved the round. `null` for types without a scalar answer. */
  correctAnswer: string | null;
}

export type PayloadValidation<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; error: string };

export interface TypeLogic<TPayload = unknown, TSubmission = unknown> {
  id: string;
  roundStyle: RoundStyle;
  timerSeconds: number;
  score(input: DescriptorScoreInput<TPayload, TSubmission>): RoundScoreResult;
  isRoundComplete(state: DescriptorRoundState<TSubmission>): boolean;
  validatePayload(raw: unknown): PayloadValidation<TPayload>;
}
