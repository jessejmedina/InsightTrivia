/**
 * App-facing question-type registry: pairs each type's pure logic with its
 * Play and Reveal components. Import this from the game screen; import
 * `./logic` from tests and non-React code.
 */
import type { ComponentType } from 'react';
import type { TypeLogic } from './logic';
import { getTypeLogic } from './logic';
import type { PlayProps, RevealProps } from './uiTypes';
import { QuestionPhase } from '../../components/game/QuestionPhase';
import { OrderingPhase } from '../../components/game/OrderingPhase';
import { MatchingPhase } from '../../components/game/MatchingPhase';
import { RevealPhase } from '../../components/game/RevealPhase';
import { EstimationPhase } from '../../components/game/EstimationPhase';
import { EstimationReveal } from '../../components/game/EstimationReveal';
import { ProgressivePhase } from '../../components/game/ProgressivePhase';
import { ProgressiveReveal } from '../../components/game/ProgressiveReveal';
import { SwipePhase } from '../../components/game/SwipePhase';
import { SwipeReveal } from '../../components/game/SwipeReveal';

export type { PlayProps, RevealProps } from './uiTypes';
export * from './logic';

export interface QuestionDescriptor {
  logic: TypeLogic<any, any>;
  PlayComponent: ComponentType<PlayProps>;
  RevealComponent: ComponentType<RevealProps>;
}

const UI: Record<string, { Play: ComponentType<PlayProps>; Reveal: ComponentType<RevealProps> }> = {
  multiple_choice: { Play: QuestionPhase, Reveal: RevealPhase },
  ordering: { Play: OrderingPhase, Reveal: RevealPhase },
  matching: { Play: MatchingPhase, Reveal: RevealPhase },
  estimation: { Play: EstimationPhase, Reveal: EstimationReveal },
  progressive: { Play: ProgressivePhase, Reveal: ProgressiveReveal },
  swipe: { Play: SwipePhase, Reveal: SwipeReveal },
};

export function getDescriptor(type: string | null | undefined): QuestionDescriptor {
  const logic = getTypeLogic(type);
  const ui = UI[logic.id] ?? UI.multiple_choice;
  return { logic, PlayComponent: ui.Play, RevealComponent: ui.Reveal };
}
