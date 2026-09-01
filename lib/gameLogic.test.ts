import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcPartialCreditPoints, checkOrderingCorrectness, checkMatchingCorrectness } from './gameLogic';

test('calcPartialCreditPoints: full accuracy, instant answer scores max 300', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 20), 300);
});

test('calcPartialCreditPoints: zero correct scores zero regardless of speed', () => {
  assert.equal(calcPartialCreditPoints(0, 4, 20), 0);
});

test('calcPartialCreditPoints: partial accuracy scores proportionally', () => {
  assert.equal(calcPartialCreditPoints(2, 4, 20), 150); // 0.5 * 300 * 1.0
});

test('calcPartialCreditPoints: slow answer applies the 0.5 speed floor', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 0), 150); // 1.0 * 300 * 0.5
});

test('calcPartialCreditPoints: mid-clock scales linearly between floor and 1.0', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 15), 225); // 1.0 * 300 * 0.75
  assert.equal(calcPartialCreditPoints(4, 4, 10), 150); // multiplier max(0.5, 0.5)
});

test('calcPartialCreditPoints: never exceeds 300 even if secondsLeft > 20', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 30), 300);
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
