import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundState, needsOpponentShot, orderScorePlayers } from './roundState';
import { multipleChoiceLogic } from './multipleChoice';
import { orderingLogic } from './ordering';

test('buildRoundState: concurrent round, both submitted, no opponent shot concept', () => {
  const s = buildRoundState('concurrent',
    { p1: { submission: {}, secondsLeft: 5 }, p2: { submission: {}, secondsLeft: 3 } },
    null, ['p1', 'p2'], false, null);
  assert.equal(s.opponentShotTaken, false);
  assert.equal(s.roundStyle, 'concurrent');
});

test('buildRoundState: buzz round, only buzzer submitted -> opponentShotTaken false', () => {
  const s = buildRoundState('buzz',
    { p1: { submission: { chosen: 'x' }, secondsLeft: 20 } },
    'p1', ['p1', 'p2'], false, 'A');
  assert.equal(s.opponentShotTaken, false);
});

test('buildRoundState: buzz round, both submitted -> opponentShotTaken true', () => {
  const s = buildRoundState('buzz',
    { p1: { submission: { chosen: 'x' }, secondsLeft: 20 }, p2: { submission: { chosen: 'y' }, secondsLeft: 9 } },
    'p1', ['p1', 'p2'], false, 'A');
  assert.equal(s.opponentShotTaken, true);
});

test('needsOpponentShot: buzzer wrong, no shot yet -> true', () => {
  const s = buildRoundState('buzz',
    { p1: { submission: { chosen: 'WRONG' }, secondsLeft: 20 } },
    'p1', ['p1', 'p2'], false, 'RIGHT');
  assert.equal(needsOpponentShot(multipleChoiceLogic, s), true);
});

test('needsOpponentShot: buzzer correct -> false', () => {
  const s = buildRoundState('buzz',
    { p1: { submission: { chosen: 'RIGHT' }, secondsLeft: 20 } },
    'p1', ['p1', 'p2'], false, 'RIGHT');
  assert.equal(needsOpponentShot(multipleChoiceLogic, s), false);
});

test('needsOpponentShot: timed out -> false', () => {
  const s = buildRoundState('buzz',
    { p1: { submission: { chosen: 'WRONG' }, secondsLeft: 20 } },
    'p1', ['p1', 'p2'], true, 'RIGHT');
  assert.equal(needsOpponentShot(multipleChoiceLogic, s), false);
});

test('needsOpponentShot: solo (1 player) -> false', () => {
  const s = buildRoundState('buzz',
    { p1: { submission: { chosen: 'WRONG' }, secondsLeft: 20 } },
    'p1', ['p1'], false, 'RIGHT');
  assert.equal(needsOpponentShot(multipleChoiceLogic, s), false);
});

test('needsOpponentShot: concurrent type -> false', () => {
  const s = buildRoundState('concurrent',
    { p1: { submission: { order: [] }, secondsLeft: 5 } },
    null, ['p1', 'p2'], false, null);
  assert.equal(needsOpponentShot(orderingLogic, s), false);
});

test('orderScorePlayers: buzz round puts the buzzer first', () => {
  assert.deepEqual(orderScorePlayers(['p1', 'p2'], 'p2', 'buzz'), ['p2', 'p1']);
  assert.deepEqual(orderScorePlayers(['p1', 'p2'], 'p1', 'buzz'), ['p1', 'p2']);
});

test('orderScorePlayers: concurrent keeps original order', () => {
  assert.deepEqual(orderScorePlayers(['p1', 'p2'], null, 'concurrent'), ['p1', 'p2']);
});
