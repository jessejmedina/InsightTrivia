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

/** Default avatar colors to pick from */
export const AVATAR_COLORS = [
  '#4a90d9', // blue
  '#e94560', // red
  '#f2c14e', // gold
  '#4caf7d', // green
  '#9b59b6', // purple
  '#e67e22', // orange
  '#1abc9c', // teal
  '#e91e8c', // pink
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
