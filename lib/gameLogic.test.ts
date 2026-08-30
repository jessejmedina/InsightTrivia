import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcPartialCreditPoints, checkOrderingCorrectness, checkMatchingCorrectness } from './gameLogic';

test('calcPartialCreditPoints: full accuracy, instant answer scores near max', () => {
  const points = calcPartialCreditPoints(5, 5, 30);
  assert.equal(points, 300);
});

test('calcPartialCreditPoints: zero correct scores zero regardless of speed', () => {
  assert.equal(calcPartialCreditPoints(0, 5, 30), 0);
});

test('calcPartialCreditPoints: partial accuracy scores proportionally', () => {
  const points = calcPartialCreditPoints(2, 4, 30);
  assert.equal(points, 150); // 0.5 accuracy * 300 * 1.0 speed
});

test('calcPartialCreditPoints: slower answer applies the speed floor multiplier', () => {
  const points = calcPartialCreditPoints(5, 5, 0);
  assert.equal(points, 90); // 1.0 accuracy * 300 * 0.3 floor
});

test('checkOrderingCorrectness: fully correct order counts every item', () => {
  const correct = ['Water to blood', 'Frogs', 'Gnats'];
  assert.equal(checkOrderingCorrectness(['Water to blood', 'Frogs', 'Gnats'], correct), 3);
});

test('checkOrderingCorrectness: counts only items in their correct position', () => {
  const correct = ['Water to blood', 'Frogs', 'Gnats'];
  assert.equal(checkOrderingCorrectness(['Frogs', 'Water to blood', 'Gnats'], correct), 1);
});

test('checkOrderingCorrectness: completely wrong order counts zero', () => {
  const correct = ['A', 'B', 'C'];
  assert.equal(checkOrderingCorrectness(['C', 'A', 'B'], correct), 0);
});

test('checkMatchingCorrectness: all pairs matched correctly', () => {
  const correct = [{ left: 'Exodus', right: 'Israel leaves Egypt' }, { left: 'Passover', right: 'Death angel passes over' }];
  const submitted = [{ left: 'Exodus', right: 'Israel leaves Egypt' }, { left: 'Passover', right: 'Death angel passes over' }];
  assert.equal(checkMatchingCorrectness(submitted, correct), 2);
});

test('checkMatchingCorrectness: swapped pairs count as zero correct for the swapped ones', () => {
  const correct = [{ left: 'Exodus', right: 'Israel leaves Egypt' }, { left: 'Passover', right: 'Death angel passes over' }];
  const submitted = [{ left: 'Exodus', right: 'Death angel passes over' }, { left: 'Passover', right: 'Israel leaves Egypt' }];
  assert.equal(checkMatchingCorrectness(submitted, correct), 0);
});
