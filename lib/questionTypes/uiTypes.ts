/**
 * Prop contracts shared by every question type's Play and Reveal
 * components. Pure types — safe to import from component files without a
 * cycle through the descriptor registry.
 */
import type { Question } from '../gameTypes';

export interface PlayProps {
  question: Question;
  questionId: string;
  timeLeft: number;
  /** True once this player (or their team) has locked in for the round. */
  hasSubmitted: boolean;
  /** Buzz types: this player holds the buzz and should see the answer UI. */
  buzzedByMe: boolean;
  /** Buzz types: the opponent holds the buzz; show a waiting state. */
  buzzedByOpponent: boolean;
  /** Buzz types only. */
  onBuzz?: () => void;
  /** Emits the round submission (shape is per-type). Never scores. */
  onSubmit: (submission: unknown) => void;
}

export interface RevealProps {
  question: Question;
  /** The `breakdown` field from the descriptor's `score()` result. */
  breakdown: unknown;
  myPointsThisRound: number;
  myRunningTotal: number;
}
