import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multipleChoiceLogic } from './multipleChoice';

const q = { payload: null, options: ['A', 'B', 'C', 'D'], answer: 'B' };

test('correct buzz scores calcBuzzPoints for the answerer', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'B' }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 200); // calcBuzzPoints(20) = round(20*10)
  assert.equal(r.points.opponent, 0);
});

test('wrong buzz then correct opponent shot scores the opponent 100', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'A' }, opponent: { chosen: 'B' },
    mySecondsLeft: 12, opponentSecondsLeft: 5,
  });
  assert.equal(r.points.mine, 0);
  assert.equal(r.points.opponent, 100);
});

test('both wrong scores nobody', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'A' }, opponent: { chosen: 'C' },
    mySecondsLeft: 12, opponentSecondsLeft: 5,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('exact-match only: a case-mismatched answer is wrong', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'b' }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 0);
});

const baseState = {
  roundStyle: 'buzz' as const,
  buzzedPlayerId: 'p1', opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: 'B',
};

test('isRoundComplete: correct answer ends the round', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    ...baseState,
    submissions: { p1: { submission: { chosen: 'B' }, secondsLeft: 20 } },
  }), true);
});

test('isRoundComplete: wrong answer, no opponent shot yet, not timed out -> false', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    ...baseState,
    submissions: { p1: { submission: { chosen: 'A' }, secondsLeft: 20 } },
  }), false);
});

test('isRoundComplete: wrong answer, opponent shot taken -> true', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    ...baseState, opponentShotTaken: true,
    submissions: {
      p1: { submission: { chosen: 'A' }, secondsLeft: 20 },
      p2: { submission: { chosen: 'C' }, secondsLeft: 8 },
    },
  }), true);
});

test('isRoundComplete: nobody buzzed, timed out -> true', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    ...baseState, buzzedPlayerId: null, timedOut: true, submissions: {},
  }), true);
});

test('isRoundComplete: solo (1 player) wrong answer ends the round immediately', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    ...baseState, playerIds: ['p1'],
    submissions: { p1: { submission: { chosen: 'A' }, secondsLeft: 20 } },
  }), true);
});

test('validatePayload is trivially ok for MC', () => {
  assert.deepEqual(multipleChoiceLogic.validatePayload(undefined), { ok: true, payload: null });
});
