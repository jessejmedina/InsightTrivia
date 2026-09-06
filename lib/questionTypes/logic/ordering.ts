import type { TypeLogic, OrderingPayload, DescriptorScoreInput, DescriptorRoundState } from './types';
import { calcPartialCreditPoints, checkOrderingCorrectness } from '../../gameLogic';

export interface OrderingSubmission { order: string[] }

function scoreOne(sub: OrderingSubmission | null, items: string[], secondsLeft: number | null): number {
  if (!sub || secondsLeft == null) return 0;
  return calcPartialCreditPoints(checkOrderingCorrectness(sub.order, items), items.length, secondsLeft);
}

function score(input: DescriptorScoreInput<OrderingPayload, OrderingSubmission>) {
  const items = input.question.payload?.items ?? [];
  return {
    points: {
      mine: scoreOne(input.mine, items, input.mySecondsLeft),
      opponent: scoreOne(input.opponent, items, input.opponentSecondsLeft),
    },
    breakdown: { items },
  };
}

function isRoundComplete(state: DescriptorRoundState<OrderingSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length !== 4) {
    return { ok: false as const, error: 'ordering payload.items must be an array of exactly 4 strings' };
  }
  if (items.some((i) => typeof i !== 'string' || !i.trim())) {
    return { ok: false as const, error: 'every ordering item must be a non-empty string' };
  }
  if (new Set(items).size !== 4) {
    return { ok: false as const, error: 'ordering items must be distinct' };
  }
  return { ok: true as const, payload: { items: items.slice() as string[] } };
}

export const orderingLogic: TypeLogic<OrderingPayload, OrderingSubmission> = {
  id: 'ordering',
  roundStyle: 'concurrent',
  timerSeconds: 20,
  score,
  isRoundComplete,
  validatePayload,
};
