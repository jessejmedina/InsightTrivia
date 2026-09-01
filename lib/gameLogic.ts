/**
 * Core game logic helpers — shared between client and could be reused server-side.
 */

/** Points earned for a correct buzz-in answer */
export function calcBuzzPoints(secondsLeft: number): number {
  // Max 300 pts (buzz instantly), min 10 pts
  return Math.max(10, Math.round(secondsLeft * 10));
}

/** Points for answering after opponent buzzed in wrong */
export const OPPONENT_MISS_POINTS = 100;

/** A single left/right pairing for a 'matching' question. */
export interface MatchPair {
  left: string;
  right: string;
}

/** Points for a simultaneous-play question (ordering/matching), scaled by
 * accuracy and by how quickly the player submitted, against the 20s
 * simultaneous-question clock. Full accuracy + instant submit = 300; the
 * speed multiplier floors at 0.5 and is capped at 1.0. */
export function calcPartialCreditPoints(correctCount: number, totalCount: number, secondsLeft: number): number {
  if (totalCount <= 0) return 0;
  const accuracyFraction = correctCount / totalCount;
  const speedMultiplier = Math.min(1, Math.max(0.5, secondsLeft / 20));
  return Math.round(accuracyFraction * 300 * speedMultiplier);
}

/** Counts how many items in `submitted` are in the same position as in `correct`. */
export function checkOrderingCorrectness(submitted: string[], correct: string[]): number {
  let correctCount = 0;
  for (let i = 0; i < correct.length; i++) {
    if (submitted[i] === correct[i]) correctCount++;
  }
  return correctCount;
}

/** Counts how many of `submitted`'s left/right pairings match `correct`. */
export function checkMatchingCorrectness(submitted: MatchPair[], correct: MatchPair[]): number {
  let correctCount = 0;
  for (const pair of submitted) {
    const match = correct.find((c) => c.left === pair.left);
    if (match && match.right === pair.right) correctCount++;
  }
  return correctCount;
}

/** Generate a random 6-character uppercase room code */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Fisher-Yates shuffle — returns a new array, does not mutate the input */
export function shuffleArray<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Deterministic shuffle seeded by a string (e.g. a question id), so all
 * clients viewing the same question produce the identical arrangement. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const rng = () => {
    hash = (hash * 1103515245 + 12345) >>> 0;
    return hash / 0xFFFFFFFF;
  };
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Default avatar colors to pick from */
export const AVATAR_COLORS = [
  '#5B8DEF', // blue
  '#FF6B81', // coral
  '#FFC542', // gold
  '#4ADE80', // green
  '#A78BFA', // purple
  '#FF9F43', // orange
  '#2DD4BF', // teal
  '#F472B6', // pink
];

/** Avatar emoji options (free tier — no custom images yet) */
export const AVATARS = [
  { id: 'scroll', emoji: '📜' },
  { id: 'dove', emoji: '🕊️' },
  { id: 'star', emoji: '⭐' },
  { id: 'lamp', emoji: '🕯️' },
  { id: 'book', emoji: '📖' },
  { id: 'lion', emoji: '🦁' },
  { id: 'mountain', emoji: '⛰️' },
  { id: 'crown', emoji: '👑' },
  { id: 'shield', emoji: '🛡️' },
  { id: 'olive', emoji: '🫒' },
  { id: 'harp', emoji: '🪕' },
  { id: 'fish', emoji: '🐟' },
];

/** Cost in points to unlock a cosmetic */
export const COSMETIC_COSTS: Record<string, number> = {
  crown: 500,
  lion: 300,
  harp: 300,
  shield: 200,
  olive: 150,
  fish: 100,
};

/** Default unlocked avatars for every new user */
export const DEFAULT_UNLOCKED = ['scroll', 'dove', 'star', 'lamp', 'book', 'mountain'];
