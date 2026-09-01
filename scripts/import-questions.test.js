const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./import-questions.js');

test('validate: infers multiple_choice when options present and type omitted', () => {
  const r = validate({ question: 'Q?', answer: 'A', options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(r.ok, true);
  assert.equal(r.row.type, 'multiple_choice');
  assert.deepEqual([...r.row.options].sort(), ['A', 'B', 'C', 'D']);
});

test('validate: rejects a question with neither a playable type nor options', () => {
  const r = validate({ question: 'Q?', answer: 'A' }, 0);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /no playable type/i);
});

test('validate: multiple_choice requires options to include the answer', () => {
  const bad = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['B', 'C', 'D', 'E'] }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /options must include the answer/);
});

test('validate: multiple_choice requires exactly 4 options', () => {
  const r = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['A', 'B', 'C'] }, 0);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /exactly 4 options/);
});

test('validate: fill_blank is treated as multiple_choice', () => {
  const r = validate({ question: 'The ___ parted', answer: 'sea', type: 'fill_blank', options: ['sea', 'sky', 'road', 'wall'] }, 0);
  assert.equal(r.ok, true);
  assert.equal(r.row.type, 'multiple_choice');
});

test('validate: ordering requires exactly 4 distinct items', () => {
  assert.equal(validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C'] } }, 0).ok, false);
  assert.equal(validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'D', 'E'] } }, 0).ok, false);
  const dup = validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'A'] } }, 0);
  assert.equal(dup.ok, false);
  assert.match(dup.errors.join(' '), /distinct/);
  const good = validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'D'] } }, 0);
  assert.equal(good.ok, true);
  assert.deepEqual(good.row.payload, { items: ['A', 'B', 'C', 'D'] });
  assert.equal(good.row.answer, null);
});

test('validate: matching requires exactly 4 pairs with distinct left values', () => {
  const three = validate({ question: 'Match', type: 'matching', payload: { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }, { left: 'C', right: '3' }] } }, 0);
  assert.equal(three.ok, false);
  const dupLeft = validate({ question: 'Match', type: 'matching', payload: { pairs: [{ left: 'A', right: '1' }, { left: 'A', right: '2' }, { left: 'C', right: '3' }, { left: 'D', right: '4' }] } }, 0);
  assert.equal(dupLeft.ok, false);
  assert.match(dupLeft.errors.join(' '), /distinct/);
  const dupRight = validate({ question: 'Match', type: 'matching', payload: { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '1' }, { left: 'C', right: '3' }, { left: 'D', right: '4' }] } }, 0);
  assert.equal(dupRight.ok, true); // duplicate RIGHT is allowed
});

test('validate: unknown type is rejected', () => {
  const r = validate({ question: 'Q?', answer: 'A', type: 'not_a_real_type' }, 0);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /unknown type/);
});

test('validate: preserves a hint when present, null when absent', () => {
  const withHint = validate({ question: 'Q?', answer: 'A', options: ['A', 'B', 'C', 'D'], hint: '  a hint  ' }, 0);
  assert.equal(withHint.row.hint, 'a hint');
  const withoutHint = validate({ question: 'Q?', answer: 'A', options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(withoutHint.row.hint, null);
  const ordering = validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'D'] }, hint: 'chronological' }, 0);
  assert.equal(ordering.row.hint, 'chronological');
});
