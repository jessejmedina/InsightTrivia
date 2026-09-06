import type { TypeLogic, EstimationPayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface EstimationSubmission { guess: number }

/** Position in [0,1] of `value` on a log axis from `min` to `max` (both > 0). */
export function logMap(value: number, min: number, max: number): number {
  const lv = Math.log(Math.max(value, min));
  return (lv - Math.log(min)) / (Math.log(max) - Math.log(min));
}
export function logUnmap(pos: number, min: number, max: number): number {
  return Math.exp(Math.log(min) + pos * (Math.log(max) - Math.log(min)));
}

function speedMult(secondsLeft: number | null): number {
  return Math.min(1, Math.max(0.5, (secondsLeft ?? 0) / 20));
}

function distance(guess: number | null, p: EstimationPayload): number {
  if (guess == null) return Infinity;
  if (p.log) return Math.abs(logMap(guess, p.min, p.max) - logMap(p.value, p.min, p.max));
  return Math.abs(guess - p.value);
}

function score(input: DescriptorScoreInput<EstimationPayload, EstimationSubmission>) {
  const p = input.question.payload;
  if (!p) return { points: { mine: 0, opponent: 0 }, breakdown: null };
  const dMine = distance(input.mine?.guess ?? null, p);
  const dOpp = distance(input.opponent?.guess ?? null, p);
  const breakdown = {
    value: p.value, unit: p.unit, min: p.min, max: p.max, log: !!p.log,
    mine: input.mine?.guess ?? null, opponent: input.opponent?.guess ?? null,
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

function isRoundComplete(state: DescriptorRoundState<EstimationSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const p = raw as Partial<EstimationPayload> | null | undefined;
  if (!p || typeof p !== 'object') return { ok: false as const, error: 'estimation needs a payload object' };
  for (const k of ['value', 'min', 'max'] as const) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) {
      return { ok: false as const, error: `estimation payload.${k} must be a finite number` };
    }
  }
  if (!(p.min! < p.value! && p.value! < p.max!)) {
    return { ok: false as const, error: 'estimation needs min < value < max' };
  }
  if (typeof p.unit !== 'string' || !p.unit.trim()) {
    return { ok: false as const, error: 'estimation needs a non-empty unit' };
  }
  if (p.step !== undefined && (typeof p.step !== 'number' || p.step <= 0)) {
    return { ok: false as const, error: 'estimation step must be a positive number' };
  }
  if (p.log === true && p.min! <= 0) {
    return { ok: false as const, error: 'estimation log scale needs min > 0' };
  }
  return {
    ok: true as const,
    payload: {
      value: p.value!, unit: p.unit.trim(), min: p.min!, max: p.max!,
      ...(p.step !== undefined ? { step: p.step } : {}),
      ...(p.log ? { log: true } : {}),
    },
  };
}

export const estimationLogic: TypeLogic<EstimationPayload, EstimationSubmission> = {
  id: 'estimation', roundStyle: 'concurrent', timerSeconds: 20, score, isRoundComplete, validatePayload,
};
