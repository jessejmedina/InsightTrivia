import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimationLogic, logMap, logUnmap } from './estimation';

const payload = { value: 40, unit: 'years', min: 0, max: 100 };
const concurrent = {
  roundStyle: 'concurrent' as const, buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

function round300(s: number) { return Math.round(300 * Math.min(1, Math.max(0.5, s / 20))); }

test('closer player wins the full speed-scaled pot, other gets 0', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 42 }, opponent: { guess: 70 },
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 0);
});

test('slow winner is floored at half the pot', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 41 }, opponent: { guess: 90 },
    mySecondsLeft: 0, opponentSecondsLeft: 0,
  });
  assert.equal(r.points.mine, 150);
});

test('exact-distance tie pays both the pot', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 30 }, opponent: { guess: 50 }, // both 10 away
    mySecondsLeft: 20, opponentSecondsLeft: 10,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 300);
});

test('a non-submitter loses to any guess', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 99 }, opponent: null,
    mySecondsLeft: 5, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, round300(5));
  assert.equal(r.points.opponent, 0);
});

test('neither submits -> 0/0', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: null, opponent: null, mySecondsLeft: null, opponentSecondsLeft: null,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('log axis: proximity judged on the log scale', () => {
  const logPayload = { value: 1000, unit: 'people', min: 10, max: 100000, log: true };
  // 500 and 2000 are equidistant from 1000 on a log axis; 500 is closer on a linear one.
  const r = estimationLogic.score({
    question: { payload: logPayload, options: null, answer: null },
    mine: { guess: 500 }, opponent: { guess: 2000 },
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 300); // tie on the log axis
});

test('logMap/logUnmap round-trip', () => {
  const v = logUnmap(logMap(250, 10, 100000), 10, 100000);
  assert.ok(Math.abs(v - 250) < 1e-6);
});

test('isRoundComplete: both submitted', () => {
  assert.equal(estimationLogic.isRoundComplete({
    ...concurrent,
    submissions: { p1: { submission: { guess: 1 }, secondsLeft: 5 }, p2: { submission: { guess: 2 }, secondsLeft: 3 } },
  }), true);
});

test('isRoundComplete: one submitted, not timed out -> false', () => {
  assert.equal(estimationLogic.isRoundComplete({
    ...concurrent, submissions: { p1: { submission: { guess: 1 }, secondsLeft: 5 } },
  }), false);
});

test('isRoundComplete: timeout -> true', () => {
  assert.equal(estimationLogic.isRoundComplete({
    ...concurrent, timedOut: true, submissions: {},
  }), true);
});

test('validatePayload rejects min >= value and empty unit', () => {
  assert.equal(estimationLogic.validatePayload({ value: 5, unit: 'x', min: 5, max: 10 }).ok, false);
  assert.equal(estimationLogic.validatePayload({ value: 5, unit: '', min: 0, max: 10 }).ok, false);
});

test('validatePayload rejects log with min <= 0', () => {
  assert.equal(estimationLogic.validatePayload({ value: 5, unit: 'x', min: 0, max: 10, log: true }).ok, false);
});

test('validatePayload accepts a clean payload', () => {
  const v = estimationLogic.validatePayload({ value: 40, unit: 'years', min: 0, max: 100 });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.payload.value, 40);
});
