const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./import-questions.js');

test('validate: defaults type to free_text when omitted (backward compatibility)', () => {
  const result = validate({ question: 'Q?', answer: 'A' }, 0);
  assert.equal(result.ok, true);
  assert.equal(result.row.type, 'free_text');
});

test('validate: multiple_choice requires options to include the answer', () => {
  const bad = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['B', 'C', 'D', 'E'] }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /options must include the answer/);

  const good = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(good.ok, true);
  // Options are shuffled before storage (so the correct answer isn't biased toward
  // early positions), so compare as a set rather than asserting a fixed order.
  assert.deepEqual([...good.row.options].sort(), ['A', 'B', 'C', 'D']);
});

test('validate: multiple_choice requires exactly 4 options', () => {
  const result = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['A', 'B', 'C'] }, 0);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /exactly 4 options/);
});

test('validate: ordering requires payload.items with at least 3 entries, and no answer/options', () => {
  const bad = validate({ question: 'Order these', type: 'ordering', payload: { items: ['A', 'B'] } }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /at least 3 items/);

  const good = validate({ question: 'Order these', type: 'ordering', payload: { items: ['A', 'B', 'C'] } }, 0);
  assert.equal(good.ok, true);
  assert.deepEqual(good.row.payload, { items: ['A', 'B', 'C'] });
  assert.equal(good.row.answer, null);
});

test('validate: matching requires payload.pairs with at least 3 left/right entries', () => {
  const bad = validate({ question: 'Match these', type: 'matching', payload: { pairs: [{ left: 'A', right: 'B' }] } }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /at least 3 pairs/);

  const good = validate({
    question: 'Match these',
    type: 'matching',
    payload: { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }, { left: 'C', right: '3' }] },
  }, 0);
  assert.equal(good.ok, true);
});

test('validate: unknown type is rejected', () => {
  const result = validate({ question: 'Q?', answer: 'A', type: 'not_a_real_type' }, 0);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unknown type/);
});

test('validate: preserves a hint when present and defaults to null when absent', () => {
  const withHint = validate({ question: 'Q?', answer: 'A', hint: '  It rhymes with cat  ' }, 0);
  assert.equal(withHint.ok, true);
  assert.equal(withHint.row.hint, 'It rhymes with cat');

  const withoutHint = validate({ question: 'Q?', answer: 'A' }, 0);
  assert.equal(withoutHint.ok, true);
  assert.equal(withoutHint.row.hint, null);

  const orderingWithHint = validate({
    question: 'Order these',
    type: 'ordering',
    payload: { items: ['A', 'B', 'C'] },
    hint: 'Think chronologically',
  }, 0);
  assert.equal(orderingWithHint.ok, true);
  assert.equal(orderingWithHint.row.hint, 'Think chronologically');
});
