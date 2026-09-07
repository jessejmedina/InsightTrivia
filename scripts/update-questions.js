#!/usr/bin/env node
/**
 * Update existing rows in the Supabase `questions` table from a JSON file,
 * matching on exact (trimmed, case-insensitive) question text. Use this to
 * revise the options / answer / reference / difficulty of questions that are
 * ALREADY imported, without creating duplicates.
 *
 * Usage: npx tsx scripts/update-questions.js path/to/questions.json [--dry-run]
 *
 * - Rows whose `question` text is not found in the DB are reported and skipped
 *   (use import-questions.js to add new ones).
 * - Only writes a row when a field actually changed.
 * - `--dry-run` prints the diff and writes nothing.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL in .env.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { validate } = require('./import-questions.js');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const norm = (s) => String(s).trim().toLowerCase();
const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!filePath) {
    console.error('Usage: npx tsx scripts/update-questions.js <path-to-json> [--dry-run]');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.questions;
  if (!Array.isArray(list)) { console.error('Expected a JSON array of questions.'); process.exit(1); }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Page through every row (Supabase caps a plain select at 1000).
  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, answer, options, reference, difficulty, type')
      .range(from, from + 999);
    if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
    existing.push(...data);
    if (data.length < 1000) break;
  }
  const byText = new Map(existing.map((r) => [norm(r.question), r]));

  let changed = 0, unchanged = 0, missing = 0, invalid = 0;
  const missingList = [];

  for (const item of list) {
    const v = validate(item, 0);
    if (!v.ok) { invalid++; console.log('  INVALID:', (item.question || '').slice(0, 60), '->', v.errors.join(', ')); continue; }
    const row = v.row; // { question, answer, options (shuffled), payload, category, difficulty, reference, hint, type, active }
    const dbRow = byText.get(norm(row.question));
    if (!dbRow) { missing++; missingList.push(row.question); continue; }

    const patch = {};
    // Compare option SETS (order is randomized on import), not sequences.
    const sameOptionSet = Array.isArray(dbRow.options) && Array.isArray(row.options)
      && dbRow.options.length === row.options.length
      && new Set(dbRow.options.map(norm)).size === new Set([...dbRow.options, ...row.options].map(norm)).size;
    if (!sameOptionSet && row.options) patch.options = row.options;
    if ((dbRow.answer || null) !== (row.answer || null)) patch.answer = row.answer;
    if ((dbRow.reference || null) !== (row.reference || null)) patch.reference = row.reference;
    if ((dbRow.difficulty || null) !== (row.difficulty || null)) patch.difficulty = row.difficulty;

    if (Object.keys(patch).length === 0) { unchanged++; continue; }
    changed++;
    console.log('\n~ ' + row.question.slice(0, 80));
    for (const k of Object.keys(patch)) {
      console.log(`    ${k}:`);
      console.log('      was:', JSON.stringify(k === 'options' ? dbRow.options : dbRow[k]));
      console.log('      now:', JSON.stringify(patch[k]));
    }
    if (!dryRun) {
      const { error } = await supabase.from('questions').update(patch).eq('id', dbRow.id);
      if (error) { console.error('    UPDATE FAILED:', error.message); process.exit(1); }
    }
  }

  console.log('\n----');
  console.log(dryRun ? '(dry run — nothing written)' : 'applied');
  console.log('changed:', changed, '| unchanged:', unchanged, '| not in DB:', missing, '| invalid:', invalid);
  if (missingList.length) {
    console.log('not in DB (add with import-questions.js):');
    for (const q of missingList) console.log('  -', q.slice(0, 90));
  }
}
main();
