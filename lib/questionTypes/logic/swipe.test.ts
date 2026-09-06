import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeLogic } from './swipe';

const payload = { categoryLeft: 'OT', categoryRight: 'NT', cards: [
  { text: 'Genesis', side: 'left' as const }, { text: 'Matthew', side: 'right' as const },
  { text: 'Exodus', side: 'left' as const }, { text: 'Mark', side: 'right' as const },
]};
const concurrent = {
  roundStyle: 'concurrent' as const, buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

test('all correct + fast = 300; graded per player', () => {
  const r = swipeLogic.score({
    question: { payload, options: null, answer: null },
    mine: { swipes: { 0: 'left', 1: 'right', 2: 'left', 3: 'right' } },   // 4/4
    opponent: { swipes: { 0: 'left', 1: 'left', 2: 'left', 3: 'right' } }, // 3/4
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 225);
});

test('unswiped cards count as wrong', () => {
  const r = swipeLogic.score({
    question: { payload, options: null, answer: null },
    mine: { swipes: { 0: 'left', 1: 'right' } }, // 2/4
    opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 150);
  assert.equal(r.points.opponent, 0);
});

test('slow answer floored at 0.5x', () => {
  const r = swipeLogic.score({
    question: { payload, options: null, answer: null },
    mine: { swipes: { 0: 'left', 1: 'right', 2: 'left', 3: 'right' } },
    opponent: null, mySecondsLeft: 0, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 150);
});

test('isRoundComplete: both submitted / timeout / one submitted', () => {
  assert.equal(swipeLogic.isRoundComplete({
    ...concurrent,
    submissions: { p1: { submission: { swipes: {} }, secondsLeft: 5 }, p2: { submission: { swipes: {} }, secondsLeft: 3 } },
  }), true);
  assert.equal(swipeLogic.isRoundComplete({ ...concurrent, timedOut: true, submissions: {} }), true);
  assert.equal(swipeLogic.isRoundComplete({
    ...concurrent, submissions: { p1: { submission: { swipes: {} }, secondsLeft: 5 } },
  }), false);
});

test('validatePayload rejects identical categories and out-of-range card counts', () => {
  assert.equal(swipeLogic.validatePayload({ categoryLeft: 'X', categoryRight: 'X', cards: payload.cards }).ok, false);
  assert.equal(swipeLogic.validatePayload({ categoryLeft: 'A', categoryRight: 'B', cards: payload.cards.slice(0, 3) }).ok, false);
  assert.equal(swipeLogic.validatePayload({ categoryLeft: 'A', categoryRight: 'B',
    cards: [{ text: 'x', side: 'left' }, { text: 'y', side: 'left' }, { text: 'z', side: 'left' }, { text: 'w', side: 'left' }] }).ok, false);
});

test('validatePayload accepts a clean payload', () => {
  const v = swipeLogic.validatePayload(payload);
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.payload.cards.length, 4);
});
