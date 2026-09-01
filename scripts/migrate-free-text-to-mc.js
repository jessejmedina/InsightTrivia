#!/usr/bin/env node
/**
 * One-time migration: convert legacy `type = 'free_text'` rows to
 * `multiple_choice`.
 *
 * The live DB's free_text rows have `options = null` — the v1 importer
 * discarded options for non-MC rows. The options still exist in the local
 * data/*.json source files, so this script matches each free_text DB row to
 * a local question by normalized question text, and UPDATEs the row with
 * shuffled 4-option data + `type = 'multiple_choice'`. Rows with no local
 * match are reported and left untouched.
 *
 * Usage:
 *   node scripts/migrate-free-text-to-mc.js            # dry run (default)
 *   node scripts/migrate-free-text-to-mc.js --apply    # perform the update
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');
const DATA_DIR = path.join(__dirname, '..', 'data');

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

function shuffle(arr) {
  const r = arr.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Build normalized-question -> { answer, options } from every data/*.json. */
function loadLocalOptions() {
  const map = new Map();
  for (const f of fs.readdirSync(DATA_DIR).filter((x) => x.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    } catch {
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : parsed.questions || [];
    for (const q of list) {
      if (q.type === 'ordering' || q.type === 'matching') continue;
      const answer = typeof q.answer === 'string' ? q.answer.trim() : '';
      const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : null;
      if (!answer || !options || options.length !== 4 || !options.includes(answer)) continue;
      map.set(norm(q.question), { answer, options });
    }
  }
  return map;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  console.log('URL:', SUPABASE_URL);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const local = loadLocalOptions();
  console.log(`Local questions with usable 4-option data: ${local.size}`);

  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question')
      .eq('type', 'free_text')
      .range(from, from + PAGE - 1);
    if (error) { console.error('Query failed:', error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const matched = [];
  const unmatched = [];
  for (const r of rows) {
    const hit = local.get(norm(r.question));
    if (hit) matched.push({ id: r.id, ...hit });
    else unmatched.push(r.question);
  }

  console.log(`\nfree_text rows total:        ${rows.length}`);
  console.log(`  -> matched to local data:  ${matched.length}`);
  console.log(`  -> no local match:         ${unmatched.length}`);
  if (unmatched.length) {
    console.log('\nNo local match (NOT changed — add options to a data/*.json file):');
    unmatched.slice(0, 40).forEach((q) => console.log(`  ${q.slice(0, 75)}`));
    if (unmatched.length > 40) console.log(`  ... and ${unmatched.length - 40} more`);
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to update the matched rows.');
    return;
  }

  let done = 0;
  for (const m of matched) {
    const { error } = await supabase
      .from('questions')
      .update({ type: 'multiple_choice', answer: m.answer, options: shuffle(m.options) })
      .eq('id', m.id);
    if (error) { console.error(`Update failed for ${m.id}:`, error.message); process.exit(1); }
    done++;
    if (done % 100 === 0) console.log(`  updated ${done}/${matched.length}`);
  }
  console.log(`\nApplied: ${done} rows converted to multiple_choice.`);
  if (unmatched.length) console.log(`${unmatched.length} rows still free_text — needs local option data + re-run.`);
}

main();
