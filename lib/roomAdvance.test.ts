import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAdvance } from './roomAdvance';

test('advances to the next question when more remain', () => {
  assert.deepEqual(decideAdvance(0, ['q0', 'q1', 'q2']), {
    kind: 'next', nextIndex: 1, nextQuestionId: 'q1',
  });
});

test('reports game_over on the last question', () => {
  assert.deepEqual(decideAdvance(2, ['q0', 'q1', 'q2']), { kind: 'game_over' });
});

test('reports game_over when currentIndex is already past the end', () => {
  assert.deepEqual(decideAdvance(5, ['q0', 'q1']), { kind: 'game_over' });
});
