import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingLogic } from './matching';

const payload = { pairs: [
  { left: 'Noah', right: 'Ark' }, { left: 'Jonah', right: 'Fish' },
  { left: 'David', right: 'Goliath' }, { left: 'Moses', right: 'Exodus' },
]};

const concurrentState = {
  roundStyle: 'concurrent' as const,
  buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

test('matching scored per player by partial credit', () => {
  const r = matchingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { pairs: payload.pairs },                                  // 4/4
    opponent: { pairs: [
      { left: 'Noah', right: 'Fish' }, { left: 'Jonah', right: 'Ark' },
      { left: 'David', right: 'Goliath' }, { left: 'Moses', right: 'Exodus' },
    ] },                                                             // 2/4
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 150);
});

test('a non-submitter scores 0', () => {
  const r = matchingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { pairs: payload.pairs }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.opponent, 0);
});

test('isRoundComplete when both submitted', () => {
  assert.equal(matchingLogic.isRoundComplete({
    ...concurrentState,
    submissions: {
      p1: { submission: { pairs: [] }, secondsLeft: 5 },
      p2: { submission: { pairs: [] }, secondsLeft: 3 },
    },
  }), true);
});

test('isRoundComplete true on timeout', () => {
  assert.equal(matchingLogic.isRoundComplete({
    ...concurrentState, timedOut: true, submissions: {},
  }), true);
});

test('validatePayload rejects duplicate left values', () => {
  assert.equal(matchingLogic.validatePayload({ pairs: [
    { left: 'A', right: '1' }, { left: 'A', right: '2' },
    { left: 'C', right: '3' }, { left: 'D', right: '4' },
  ]}).ok, false);
});

test('validatePayload rejects wrong count', () => {
  assert.equal(matchingLogic.validatePayload({ pairs: [{ left: 'A', right: '1' }] }).ok, false);
});

test('validatePayload accepts 4 pairs with distinct lefts', () => {
  assert.equal(matchingLogic.validatePayload(payload).ok, true);
});
