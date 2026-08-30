import type { MatchPair } from './gameLogic';

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
  payload: { items: string[] } | { pairs: MatchPair[] } | null;
}
