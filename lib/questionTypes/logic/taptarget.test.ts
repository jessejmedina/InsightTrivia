import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapTargetLogic, tapDistance } from './taptarget';

const payload = { map: 'near-east', label: 'Nineveh', target: { x: 0.6, y: 0.3 } };
const concurrent = {
  roundStyle: 'concurrent' as const, buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

test('closer tap wins the full speed-scaled pot, other gets 0', () => {
  const r = tapTargetLogic.score({
    question: { payload, options: null, answer: null },
    mine: { x: 0.62, y: 0.31 }, opponent: { x: 0.2, y: 0.8 },
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 0);
  assert.equal((r.breakdown as { winner: string }).winner, 'mine');
});

test('slow winner is floored at half the pot', () => {
  const r = tapTargetLogic.score({
    question: { payload, options: null, answer: null },
    mine: { x: 0.6, y: 0.3 }, opponent: { x: 0.9, y: 0.9 },
    mySecondsLeft: 0, opponentSecondsLeft: 0,
  });
  assert.equal(r.points.mine, 150);
});

test('equal distance pays both the pot', () => {
  const r = tapTargetLogic.score({
    question: { payload, options: null, answer: null },
    mine: { x: 0.5, y: 0.3 }, opponent: { x: 0.7, y: 0.3 }, // both 0.1 away
    mySecondsLeft: 20, opponentSecondsLeft: 10,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 300);
  assert.equal((r.breakdown as { winner: string }).winner, 'tie');
});

test('a non-tapper loses to any tap', () => {
  const r = tapTargetLogic.score({
    question: { payload, options: null, answer: null },
    mine: { x: 0.1, y: 0.9 }, opponent: null,
    mySecondsLeft: 5, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, Math.round(300 * 0.5));
  assert.equal(r.points.opponent, 0);
});

test('neither taps -> 0/0', () => {
  const r = tapTargetLogic.score({
    question: { payload, options: null, answer: null },
    mine: null, opponent: null, mySecondsLeft: null, opponentSecondsLeft: null,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('tapDistance: null and malformed taps are infinitely far', () => {
  assert.equal(tapDistance(null, { x: 0.5, y: 0.5 }), Infinity);
  assert.equal(tapDistance({ x: 0.5, y: NaN as unknown as number }, { x: 0.5, y: 0.5 }), Infinity);
});

test('isRoundComplete: both tapped', () => {
  assert.equal(tapTargetLogic.isRoundComplete({
    ...concurrent,
    submissions: {
      p1: { submission: { x: 0.1, y: 0.1 }, secondsLeft: 5 },
      p2: { submission: { x: 0.2, y: 0.2 }, secondsLeft: 3 },
    },
  }), true);
});

test('isRoundComplete: one tapped, not timed out -> false', () => {
  assert.equal(tapTargetLogic.isRoundComplete({
    ...concurrent, submissions: { p1: { submission: { x: 0.1, y: 0.1 }, secondsLeft: 5 } },
  }), false);
});

test('isRoundComplete: timeout -> true', () => {
  assert.equal(tapTargetLogic.isRoundComplete({ ...concurrent, timedOut: true, submissions: {} }), true);
});

test('validatePayload rejects missing map, label, or out-of-range coords', () => {
  assert.equal(tapTargetLogic.validatePayload({ map: '', label: 'X', target: { x: 0.5, y: 0.5 } }).ok, false);
  assert.equal(tapTargetLogic.validatePayload({ map: 'm', label: '', target: { x: 0.5, y: 0.5 } }).ok, false);
  assert.equal(tapTargetLogic.validatePayload({ map: 'm', label: 'X', target: { x: 1.5, y: 0.5 } }).ok, false);
  assert.equal(tapTargetLogic.validatePayload({ map: 'm', label: 'X', target: { x: 0.5 } }).ok, false);
  assert.equal(tapTargetLogic.validatePayload({ map: 'm', label: 'X' }).ok, false);
});

test('validatePayload accepts and trims a clean payload', () => {
  const v = tapTargetLogic.validatePayload({ map: ' near-east ', label: ' Rome ', target: { x: 0, y: 1 } });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.payload.map, 'near-east');
    assert.equal(v.payload.label, 'Rome');
    assert.deepEqual(v.payload.target, { x: 0, y: 1 });
  }
});
