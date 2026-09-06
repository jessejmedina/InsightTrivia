import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderingLogic } from './ordering';

const payload = { items: ['a', 'b', 'c', 'd'] };

const concurrentState = {
  roundStyle: 'concurrent' as const,
  buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

test('both players scored independently by partial credit', () => {
  const r = orderingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { order: ['a', 'b', 'c', 'd'] },       // 4/4
    opponent: { order: ['b', 'a', 'c', 'd'] },   // 2/4
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 150);
});

test('a non-submitter scores 0', () => {
  const r = orderingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { order: ['a', 'b', 'c', 'd'] }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 0);
});

test('isRoundComplete when both submitted', () => {
  assert.equal(orderingLogic.isRoundComplete({
    ...concurrentState,
    submissions: {
      p1: { submission: { order: [] }, secondsLeft: 5 },
      p2: { submission: { order: [] }, secondsLeft: 3 },
    },
  }), true);
});

test('isRoundComplete false when only one submitted and not timed out', () => {
  assert.equal(orderingLogic.isRoundComplete({
    ...concurrentState,
    submissions: { p1: { submission: { order: [] }, secondsLeft: 5 } },
  }), false);
});

test('isRoundComplete true on timeout even with no submissions', () => {
  assert.equal(orderingLogic.isRoundComplete({
    ...concurrentState, timedOut: true, submissions: {},
  }), true);
});

test('validatePayload rejects non-distinct items', () => {
  assert.equal(orderingLogic.validatePayload({ items: ['a', 'a', 'c', 'd'] }).ok, false);
});

test('validatePayload rejects wrong count', () => {
  assert.equal(orderingLogic.validatePayload({ items: ['a', 'b', 'c'] }).ok, false);
});

test('validatePayload accepts 4 distinct strings', () => {
  const v = orderingLogic.validatePayload({ items: ['a', 'b', 'c', 'd'] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.payload.items, ['a', 'b', 'c', 'd']);
});
