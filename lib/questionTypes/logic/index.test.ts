import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTypeLogic, getInteractionMode } from './index';

// ── ported from the old lib/questionTypes.test.ts ──────────────
test('free_text is a race type', () => {
  assert.equal(getInteractionMode('free_text'), 'race');
});

test('multiple_choice is a race type', () => {
  assert.equal(getInteractionMode('multiple_choice'), 'race');
});

test('fill_blank is a race type', () => {
  assert.equal(getInteractionMode('fill_blank'), 'race');
});

test('ordering is a simultaneous type', () => {
  assert.equal(getInteractionMode('ordering'), 'simultaneous');
});

test('matching is a simultaneous type', () => {
  assert.equal(getInteractionMode('matching'), 'simultaneous');
});

test('unknown or missing type defaults to race', () => {
  assert.equal(getInteractionMode(undefined), 'race');
  assert.equal(getInteractionMode(null), 'race');
  assert.equal(getInteractionMode('something_new'), 'race');
});

// ── new registry behaviour ────────────────────────────────────
test('getTypeLogic returns the ordering logic for "ordering"', () => {
  assert.equal(getTypeLogic('ordering').id, 'ordering');
  assert.equal(getTypeLogic('matching').id, 'matching');
  assert.equal(getTypeLogic('multiple_choice').id, 'multiple_choice');
});

test('getTypeLogic falls back to multiple_choice for unknown/missing', () => {
  assert.equal(getTypeLogic('nope').id, 'multiple_choice');
  assert.equal(getTypeLogic(null).id, 'multiple_choice');
  assert.equal(getTypeLogic(undefined).id, 'multiple_choice');
});
