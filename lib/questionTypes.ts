/**
 * Question type registry — tells the game screen how a question should be
 * played: 'race' (buzz in first, then answer) or 'simultaneous' (everyone
 * arranges/matches at once, scored by accuracy + speed).
 */

export type QuestionType = 'free_text' | 'multiple_choice' | 'fill_blank' | 'ordering' | 'matching';
export type InteractionMode = 'race' | 'simultaneous';

const SIMULTANEOUS_TYPES: ReadonlySet<string> = new Set(['ordering', 'matching']);

/** Returns 'simultaneous' for ordering/matching, 'race' for everything else
 * (including unknown/missing types, so new types default safely to the
 * existing buzz-in behavior until explicitly registered here). */
export function getInteractionMode(type: string | null | undefined): InteractionMode {
  return type && SIMULTANEOUS_TYPES.has(type) ? 'simultaneous' : 'race';
}
