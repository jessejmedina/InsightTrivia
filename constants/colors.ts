export const Colors = {
  bg: '#FFF8EE',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#F1E9DA',
  primary: '#3DA5F5',
  accent: '#8B5CF6',
  accentDim: '#C4B5FD',
  success: '#2ECC71',
  danger: '#FF5A5F',
  textPrimary: '#26263B',
  textSecondary: '#6B7280',
  textMuted: '#A0A3B8',
  white: '#FFFFFF',
  black: '#000000',
  teamA: '#3DA5F5',
  teamB: '#FF5A5F',
};

/** Soft "floating card" shadow used across surfaces for the light, happy look. */
export const CardShadow = {
  shadowColor: '#26263B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

/** Bright per-category colors, Trivia-Crack style. */
export const CATEGORY_COLORS: Record<string, string> = {
  General: '#60A5FA',
  Creation: '#4ADE80',
  History: '#F59E0B',
  Prophets: '#14B8A6',
  Jesus: '#FBBF24',
  Apostles: '#6366F1',
  Scriptures: '#3B82F6',
  Tabernacle: '#F472B6',
  People: '#FB7185',
  Geography: '#22D3EE',
  Places: '#2DD4BF',
  Chronology: '#A78BFA',
};

const FALLBACK_CATEGORY_COLORS = ['#60A5FA', '#4ADE80', '#F59E0B', '#14B8A6', '#FBBF24', '#6366F1', '#F472B6', '#FB7185'];

/** Consistent color for any category, including ones not in CATEGORY_COLORS. */
export function getCategoryColor(category: string): string {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return FALLBACK_CATEGORY_COLORS[hash % FALLBACK_CATEGORY_COLORS.length];
}
