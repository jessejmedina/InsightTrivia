import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressiveLogic, ladderPoints, CLUE_LADDER } from './progressive';

const q = { payload: { clues: ['c1', 'c2', 'c3', 'c4'] }, options: ['A', 'B', 'C', 'D'], answer: 'B' };
const base = {
  roundStyle: 'buzz' as const, buzzedPlayerId: 'p1', opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: 'B',
};

test('ladderPoints follows the ladder and clamps past the end', () => {
  assert.equal(ladderPoints(1), 300);
  assert.equal(ladderPoints(3), 150);
  assert.equal(ladderPoints(9), CLUE_LADDER[CLUE_LADDER.length - 1]);
  assert.equal(ladderPoints(0), 0);
});

test('correct buzz on clue 2 scores 220', () => {
  const r = progressiveLogic.score({
    question: q, mine: { chosen: 'B', cluesShownAtBuzz: 2 }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 220);
  assert.equal(r.points.opponent, 0);
});

test('wrong buzz, opponent shot correct on clue 3 scores opponent 150', () => {
  const r = progressiveLogic.score({
    question: q,
    mine: { chosen: 'A', cluesShownAtBuzz: 1 },
    opponent: { chosen: 'B', cluesShownAtBuzz: 3 },
    mySecondsLeft: 12, opponentSecondsLeft: 8,
  });
  assert.equal(r.points.mine, 0);
  assert.equal(r.points.opponent, 150);
});

test('both wrong -> 0/0', () => {
  const r = progressiveLogic.score({
    question: q,
    mine: { chosen: 'A', cluesShownAtBuzz: 1 }, opponent: { chosen: 'C', cluesShownAtBuzz: 4 },
    mySecondsLeft: 12, opponentSecondsLeft: 8,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('isRoundComplete: correct buzz ends it', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, submissions: { p1: { submission: { chosen: 'B', cluesShownAtBuzz: 1 }, secondsLeft: 20 } },
  }), true);
});

test('isRoundComplete: wrong buzz, no shot yet, 2 players -> false', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, submissions: { p1: { submission: { chosen: 'A', cluesShownAtBuzz: 1 }, secondsLeft: 20 } },
  }), false);
});

test('isRoundComplete: solo wrong buzz ends it', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, playerIds: ['p1'],
    submissions: { p1: { submission: { chosen: 'A', cluesShownAtBuzz: 1 }, secondsLeft: 20 } },
  }), true);
});

test('isRoundComplete: wrong buzz, opponent shot taken -> true', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, opponentShotTaken: true,
    submissions: {
      p1: { submission: { chosen: 'A', cluesShownAtBuzz: 1 }, secondsLeft: 20 },
      p2: { submission: { chosen: 'C', cluesShownAtBuzz: 3 }, secondsLeft: 6 },
    },
  }), true);
});

test('isRoundComplete: nobody buzzed, timed out -> true', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, buzzedPlayerId: null, timedOut: true, submissions: {},
  }), true);
});

test('validatePayload: 3-5 non-empty clue strings', () => {
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', 'b'] }).ok, false);
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', 'b', 'c', 'd', 'e', 'f'] }).ok, false);
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', '', 'c'] }).ok, false);
  const v = progressiveLogic.validatePayload({ clues: ['a', 'b', 'c'] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.payload.clues, ['a', 'b', 'c']);
});
