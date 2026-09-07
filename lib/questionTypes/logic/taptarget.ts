import type { TypeLogic, TapTargetPayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface TapTargetSubmission { x: number; y: number }

function speedMult(secondsLeft: number | null): number {
  return Math.min(1, Math.max(0.5, (secondsLeft ?? 0) / 20));
}

/** Straight-line distance between a tap and the target in normalized map space. */
export function tapDistance(tap: TapTargetSubmission | null, target: { x: number; y: number }): number {
  if (!tap || !Number.isFinite(tap.x) || !Number.isFinite(tap.y)) return Infinity;
  return Math.hypot(tap.x - target.x, tap.y - target.y);
}

function score(input: DescriptorScoreInput<TapTargetPayload, TapTargetSubmission>) {
  const p = input.question.payload;
  if (!p) return { points: { mine: 0, opponent: 0 }, breakdown: null };
  const dMine = tapDistance(input.mine ?? null, p.target);
  const dOpp = tapDistance(input.opponent ?? null, p.target);
  const breakdown = {
    map: p.map, label: p.label, target: p.target,
    mine: input.mine ?? null, opponent: input.opponent ?? null,
    dMine, dOpp,
  };
  if (dMine === Infinity && dOpp === Infinity) {
    return { points: { mine: 0, opponent: 0 }, breakdown };
  }
  if (dMine === dOpp) {
    const pot = Math.round(300 * speedMult(Math.max(input.mySecondsLeft ?? 0, input.opponentSecondsLeft ?? 0)));
    return { points: { mine: pot, opponent: pot }, breakdown: { ...breakdown, winner: 'tie' as const } };
  }
  if (dMine < dOpp) {
    return {
      points: { mine: Math.round(300 * speedMult(input.mySecondsLeft)), opponent: 0 },
      breakdown: { ...breakdown, winner: 'mine' as const },
    };
  }
  return {
    points: { mine: 0, opponent: Math.round(300 * speedMult(input.opponentSecondsLeft)) },
    breakdown: { ...breakdown, winner: 'opponent' as const },
  };
}

function isRoundComplete(state: DescriptorRoundState<TapTargetSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function validatePayload(raw: unknown) {
  const p = raw as Partial<TapTargetPayload> | null | undefined;
  if (!p || typeof p !== 'object') return { ok: false as const, error: 'taptarget needs a payload object' };
  if (typeof p.map !== 'string' || !p.map.trim()) {
    return { ok: false as const, error: 'taptarget needs a non-empty map key' };
  }
  if (typeof p.label !== 'string' || !p.label.trim()) {
    return { ok: false as const, error: 'taptarget needs a non-empty label' };
  }
  const t = p.target as { x?: unknown; y?: unknown } | undefined;
  if (!t || typeof t !== 'object' || !isCoord(t.x) || !isCoord(t.y)) {
    return { ok: false as const, error: 'taptarget needs target.x and target.y, each a number in [0, 1]' };
  }
  return {
    ok: true as const,
    payload: { map: p.map.trim(), label: p.label.trim(), target: { x: t.x, y: t.y } },
  };
}

export const tapTargetLogic: TypeLogic<TapTargetPayload, TapTargetSubmission> = {
  id: 'taptarget', roundStyle: 'concurrent', timerSeconds: 20, score, isRoundComplete, validatePayload,
};
