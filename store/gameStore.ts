import { create } from 'zustand';

export type GamePhase = 'lobby' | 'waiting' | 'bidding' | 'question' | 'answer' | 'results';
export type GameMode = '1v1' | 'teams';

export interface Player {
  id: string;
  username: string;
  avatar_id: string;
  avatar_color: string;
  score: number;
  team?: 'A' | 'B';
  buzzedIn?: boolean;
}

export interface Question {
  id: string;
  question: string;
  answer: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reference?: string; // e.g. "Insight, Vol. 1, p. 243"
  hint?: string;
}

export interface GameRoom {
  id: string;
  code: string;
  host_id: string;
  mode: GameMode;
  status: GamePhase;
  current_question_index: number;
  total_questions: number;
  players: Player[];
}

interface GameState {
  room: GameRoom | null;
  currentQuestion: Question | null;
  phase: GamePhase;
  timeLeft: number;
  buzzedInPlayerId: string | null;
  myPlayerId: string | null;
  answerCorrect: boolean | null;
  roundScores: Record<string, number>;

  setRoom: (room: GameRoom | null) => void;
  setQuestion: (q: Question | null) => void;
  setPhase: (phase: GamePhase) => void;
  setTimeLeft: (t: number) => void;
  setBuzzedIn: (playerId: string | null) => void;
  setMyPlayerId: (id: string) => void;
  setAnswerCorrect: (correct: boolean | null) => void;
  addRoundScore: (playerId: string, points: number) => void;
  reset: () => void;
}

const initialState = {
  room: null,
  currentQuestion: null,
  phase: 'lobby' as GamePhase,
  timeLeft: 30,
  buzzedInPlayerId: null,
  myPlayerId: null,
  answerCorrect: null,
  roundScores: {},
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setRoom: (room) => set({ room }),
  setQuestion: (q) => set({ currentQuestion: q }),
  setPhase: (phase) => set({ phase }),
  setTimeLeft: (t) => set({ timeLeft: t }),
  setBuzzedIn: (playerId) => set({ buzzedInPlayerId: playerId }),
  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setAnswerCorrect: (correct) => set({ answerCorrect: correct }),
  addRoundScore: (playerId, points) =>
    set((s) => ({
      roundScores: { ...s.roundScores, [playerId]: (s.roundScores[playerId] ?? 0) + points },
    })),
  reset: () => set(initialState),
}));
