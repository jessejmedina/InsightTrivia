import type { TypeLogic, SwipePayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface SwipeSubmission { swipes: Record<number, 'left' | 'right'> }

function speedMult(s: number | null): number {
  return Math.min(1, Math.max(0.5, (s ?? 0) / 20));
}

function scoreOne(sub: SwipeSubmission | null, cards: SwipePayload['cards'], s: number | null): number {
  if (!sub || s == null) return 0;
  const correct = cards.reduce((n, c, i) => n + (sub.swipes[i] === c.side ? 1 : 0), 0);
  return Math.round((correct / cards.length) * 300 * speedMult(s));
}

function score(input: DescriptorScoreInput<SwipePayload, SwipeSubmission>) {
  const cards = input.question.payload?.cards ?? [];
  return {
    points: {
      mine: scoreOne(input.mine, cards, input.mySecondsLeft),
      opponent: scoreOne(input.opponent, cards, input.opponentSecondsLeft),
    },
    breakdown: {
      cards,
      mineSwipes: input.mine?.swipes ?? {},
      opponentSwipes: input.opponent?.swipes ?? {},
    },
  };
}

function isRoundComplete(state: DescriptorRoundState<SwipeSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const p = raw as Partial<SwipePayload> | null | undefined;
  if (!p || typeof p !== 'object') return { ok: false as const, error: 'swipe needs a payload object' };
  if (typeof p.categoryLeft !== 'string' || !p.categoryLeft.trim() ||
      typeof p.categoryRight !== 'string' || !p.categoryRight.trim()) {
    return { ok: false as const, error: 'swipe needs non-empty categoryLeft and categoryRight' };
  }
  if (p.categoryLeft.trim() === p.categoryRight.trim()) {
    return { ok: false as const, error: 'swipe categories must be different' };
  }
  const cards = p.cards;
  if (!Array.isArray(cards) || cards.length < 4 || cards.length > 8) {
    return { ok: false as const, error: 'swipe needs 4 to 8 cards' };
  }
  if (cards.some((c) => !c || typeof c.text !== 'string' || !c.text.trim() || (c.side !== 'left' && c.side !== 'right'))) {
    return { ok: false as const, error: 'every swipe card needs text and side "left" or "right"' };
  }
  if (!cards.some((c) => c.side === 'left') || !cards.some((c) => c.side === 'right')) {
    return { ok: false as const, error: 'swipe needs at least one card on each side' };
  }
  return {
    ok: true as const,
    payload: {
      categoryLeft: p.categoryLeft.trim(), categoryRight: p.categoryRight.trim(),
      cards: cards.map((c) => ({ text: c.text.trim(), side: c.side })),
    },
  };
}

export const swipeLogic: TypeLogic<SwipePayload, SwipeSubmission> = {
  id: 'swipe', roundStyle: 'concurrent', timerSeconds: 20, score, isRoundComplete, validatePayload,
};
