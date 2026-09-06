import type { TypeLogic } from './types';
import { multipleChoiceLogic } from './multipleChoice';
import { orderingLogic } from './ordering';
import { matchingLogic } from './matching';
import { estimationLogic } from './estimation';
import { progressiveLogic } from './progressive';
import { swipeLogic } from './swipe';

export * from './types';
export { buildRoundState, needsOpponentShot, orderScorePlayers } from './roundState';
export { multipleChoiceLogic } from './multipleChoice';
export type { MultipleChoiceSubmission } from './multipleChoice';
export { orderingLogic } from './ordering';
export type { OrderingSubmission } from './ordering';
export { matchingLogic } from './matching';
export type { MatchingSubmission } from './matching';
export { estimationLogic, logMap, logUnmap } from './estimation';
export type { EstimationSubmission } from './estimation';
export { progressiveLogic, ladderPoints, CLUE_LADDER } from './progressive';
export type { ProgressiveSubmission } from './progressive';
export { swipeLogic } from './swipe';
export type { SwipeSubmission } from './swipe';

export const TYPE_LOGICS: Record<string, TypeLogic<any, any>> = {
  multiple_choice: multipleChoiceLogic,
  ordering: orderingLogic,
  matching: matchingLogic,
  estimation: estimationLogic,
  progressive: progressiveLogic,
  swipe: swipeLogic,
};

/** Returns the logic for `type`, or the multiple_choice logic for any
 *  unknown/missing type so new content fails safe into buzz-in play. */
export function getTypeLogic(type: string | null | undefined): TypeLogic<any, any> {
  return (type && TYPE_LOGICS[type]) || multipleChoiceLogic;
}

export type InteractionMode = 'race' | 'simultaneous';

/** Back-compat wrapper. Prefer `getTypeLogic(type).roundStyle` in new code. */
export function getInteractionMode(type: string | null | undefined): InteractionMode {
  return getTypeLogic(type).roundStyle === 'buzz' ? 'race' : 'simultaneous';
}
