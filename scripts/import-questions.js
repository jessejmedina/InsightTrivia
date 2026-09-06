#!/usr/bin/env node
/**
 * One-off importer: reads a JSON array of trivia questions and inserts the
 * new ones into the Supabase `questions` table, skipping exact duplicates.
 *
 * Usage: npx tsx scripts/import-questions.js path/to/questions.json
 *        (tsx, not plain node — validate() imports the TS descriptor logic)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (server-only key, bypasses RLS
 * so it can insert without a signed-in user) alongside the existing
 * EXPO_PUBLIC_SUPABASE_URL.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getTypeLogic } = require('../lib/questionTypes/logic');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Types the app can actually play. `fill_blank` collapses to multiple_choice.
const PLAYABLE_TYPES = new Set(['multiple_choice', 'progressive', 'ordering', 'matching', 'estimation', 'swipe']);
// Types that carry a 4-entry `options` array + a scalar `answer`.
const NEEDS_OPTIONS = new Set(['multiple_choice', 'progressive']);
// Types whose `payload` is validated by the descriptor (getTypeLogic(type).validatePayload).
const NEEDS_PAYLOAD = new Set(['ordering', 'matching', 'estimation', 'progressive', 'swipe']);

function shuffleOptions(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function validate(raw, index) {
  const errors = [];

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) errors.push('missing question');

  let difficulty = typeof raw.difficulty === 'string' ? raw.difficulty.toLowerCase() : 'medium';
  if (!DIFFICULTIES.includes(difficulty)) difficulty = 'medium';
  const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General';
  const reference = typeof raw.reference === 'string' && raw.reference.trim() ? raw.reference.trim() : null;
  const hint = typeof raw.hint === 'string' && raw.hint.trim() ? raw.hint.trim() : null;

  // Resolve type. Explicit wins; fill_blank collapses to multiple_choice;
  // no type + a 4-entry options array infers multiple_choice.
  let type = typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : null;
  if (type === 'fill_blank') type = 'multiple_choice';
  if (!type) {
    if (Array.isArray(raw.options) && raw.options.length === 4) type = 'multiple_choice';
    else { errors.push('no playable type: give a "type", or a 4-entry "options" array for multiple choice'); return { ok: false, index, errors }; }
  }
  if (!PLAYABLE_TYPES.has(type)) { errors.push(`unknown type "${type}"`); return { ok: false, index, errors }; }

  // Options (multiple_choice, progressive).
  let answer = null;
  let options = null;
  if (NEEDS_OPTIONS.has(type)) {
    answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
    if (!answer) errors.push('missing answer');
    options = Array.isArray(raw.options) ? raw.options.slice() : null;
    if (!options || options.length !== 4) errors.push(`${type} needs exactly 4 options`);
    else if (!options.includes(answer)) errors.push('options must include the answer');
  }

  // Payload — delegated to the descriptor's validatePayload so rules live in one place.
  let payload = null;
  if (NEEDS_PAYLOAD.has(type)) {
    const v = getTypeLogic(type).validatePayload(raw.payload);
    if (!v.ok) errors.push(v.error);
    else payload = v.payload;
  }

  if (errors.length) return { ok: false, index, errors };
  if (options) options = shuffleOptions(options);
  return {
    ok: true,
    row: { question, answer: answer || null, options, payload, category, difficulty, reference, hint, type, active: true },
  };
}

module.exports = { validate };

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-questions.js <path-to-json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.questions;
  if (!Array.isArray(list)) {
    console.error('Expected a JSON array of questions (or { "questions": [...] }).');
    process.exit(1);
  }

  const valid = [];
  const invalid = [];
  list.forEach((item, i) => {
    const result = validate(item, i);
    if (result.ok) valid.push(result.row);
    else invalid.push(result);
  });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: existing, error: fetchErr } = await supabase.from('questions').select('question');
  if (fetchErr) {
    console.error('Failed to fetch existing questions:', fetchErr.message);
    process.exit(1);
  }
  const existingSet = new Set(existing.map((q) => q.question.trim().toLowerCase()));

  const toInsert = [];
  const skippedDupes = [];
  for (const row of valid) {
    const key = row.question.toLowerCase();
    if (existingSet.has(key)) {
      skippedDupes.push(row.question);
      continue;
    }
    existingSet.add(key);
    toInsert.push(row);
  }

  if (toInsert.length) {
    const { error: insertErr } = await supabase.from('questions').insert(toInsert);
    if (insertErr) {
      console.error('Insert failed:', insertErr.message);
      process.exit(1);
    }
  }

  console.log(`Read: ${list.length}`);
  console.log(`Inserted: ${toInsert.length}`);
  console.log(`Skipped (duplicate): ${skippedDupes.length}`);
  console.log(`Skipped (invalid): ${invalid.length}`);
  invalid.forEach((v) => console.log(`  - item #${v.index}: ${v.errors.join(', ')}`));
}

if (require.main === module) {
  main();
}
