import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInteractionMode } from './questionTypes';

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

test('unknown or missing type defaults to race (matches DB default of free_text)', () => {
  assert.equal(getInteractionMode(undefined), 'race');
  assert.equal(getInteractionMode(null), 'race');
  assert.equal(getInteractionMode('something_new'), 'race');
});
