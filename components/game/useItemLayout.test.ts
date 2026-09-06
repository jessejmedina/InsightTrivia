import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRect } from './useItemLayout';

test('mergeRect adds a rect at a new index', () => {
  const out = mergeRect({}, 2, { x: 0, y: 10, width: 100, height: 40 });
  assert.deepEqual(out, { 2: { x: 0, y: 10, width: 100, height: 40 } });
});

test('mergeRect replaces an existing index without mutating the input', () => {
  const input = { 1: { x: 0, y: 0, width: 10, height: 10 } };
  const out = mergeRect(input, 1, { x: 5, y: 5, width: 20, height: 20 });
  assert.deepEqual(out, { 1: { x: 5, y: 5, width: 20, height: 20 } });
  assert.deepEqual(input, { 1: { x: 0, y: 0, width: 10, height: 10 } });
});

test('mergeRect keeps other indices intact', () => {
  const input = { 0: { x: 1, y: 1, width: 1, height: 1 } };
  const out = mergeRect(input, 3, { x: 2, y: 2, width: 2, height: 2 });
  assert.deepEqual(Object.keys(out).sort(), ['0', '3']);
});
