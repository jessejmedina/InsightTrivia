#!/usr/bin/env node
/**
 * Report-only audit of multiple_choice questions for degenerate option
 * sets — cases where the answer is trivially guessable. Changes nothing.
 *
 * Flags:
 *   LENGTH   — the answer is more than 1.8x the mean length of the wrong options
 *   DUPES    — two options are identical after normalizing case/space/punctuation
 *   SHORT    — fewer than 4 options, or answer missing from options
 *
 * Usage: node scripts/audit-mc-options.js
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function issues(row) {
  const out = [];
  const opts = Array.isArray(row.options) ? row.options : [];
  if (opts.length !== 4 || !opts.includes(row.answer)) { out.push('SHORT'); return out; }
  const normed = opts.map(norm);
  if (new Set(normed).size !== normed.length) out.push('DUPES');
  const wrong = opts.filter((o) => o !== row.answer);
  const meanWrong = wrong.reduce((a, o) => a + o.length, 0) / wrong.length;
  if (meanWrong > 0 && row.answer.length > meanWrong * 1.8) out.push('LENGTH');
  return out;
}

async function main() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, answer, options')
      .eq('type', 'multiple_choice')
      .range(from, from + 999);
    if (error) { console.error(error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const flagged = rows.map((r) => ({ r, tags: issues(r) })).filter((x) => x.tags.length);
  console.log(`multiple_choice rows: ${rows.length}`);
  console.log(`flagged:              ${flagged.length}\n`);
  for (const { r, tags } of flagged) {
    console.log(`[${tags.join(',')}] ${r.id}`);
    console.log(`   Q: ${r.question.slice(0, 80)}`);
    console.log(`   answer: ${r.answer}`);
    console.log(`   options: ${JSON.stringify(r.options)}\n`);
  }
}
main();
