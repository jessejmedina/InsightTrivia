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
