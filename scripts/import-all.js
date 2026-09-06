#!/usr/bin/env node
/**
 * Bulk importer: runs every data/*.json question file through the same
 * validate() the single-file importer uses, then does ONE dedupe pass and
 * ONE insert against Supabase. Safe to re-run — existing questions (matched
 * by exact question text) are skipped.
 *
 * Usage: npx tsx scripts/import-all.js [--dry-run] [glob-dir-or-file]
 *   (tsx, not plain node — it requires the TS-importing importer)
 *   default dir: data/
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { validate } = require('./import-questions.js');

const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const dir = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || path.join(__dirname, '..', 'data');

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) { console.error('No .json files in ' + dir); process.exit(1); }

  const valid = [];
  const invalidByFile = {};
  let readTotal = 0;

  for (const f of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      invalidByFile[f] = [`could not parse JSON: ${e.message}`];
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(list)) {
      invalidByFile[f] = ['not a JSON array (or { questions: [...] })'];
      continue;
    }
    readTotal += list.length;
    list.forEach((item, i) => {
      const result = validate(item, i);
      if (result.ok) valid.push({ ...result.row, __file: f });
      else (invalidByFile[f] ||= []).push(`item #${i}: ${result.errors.join(', ')}`);
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: existing, error: fetchErr } = await supabase.from('questions').select('question');
  if (fetchErr) { console.error('Failed to fetch existing questions:', fetchErr.message); process.exit(1); }
  const existingSet = new Set(existing.map((q) => q.question.trim().toLowerCase()));

  const toInsert = [];
  let skippedDupes = 0;
  const perFile = {};
  for (const row of valid) {
    const f = row.__file;
    perFile[f] ||= { insert: 0, dupe: 0 };
    const key = row.question.toLowerCase();
    if (existingSet.has(key)) { skippedDupes++; perFile[f].dupe++; continue; }
    existingSet.add(key);
    const { __file, ...clean } = row;
    toInsert.push(clean);
    perFile[f].insert++;
  }

  if (toInsert.length && !DRY_RUN) {
    // insert in chunks of 500 to stay well under any payload limit
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('questions').insert(chunk);
      if (error) { console.error(`Insert failed on chunk ${i}-${i + chunk.length}:`, error.message); process.exit(1); }
    }
  }

  console.log(`\nFiles scanned:        ${files.length}`);
  console.log(`Questions read:       ${readTotal}`);
  console.log(`Valid:                ${valid.length}`);
  console.log(`Already in DB (skip): ${skippedDupes}`);
  console.log(`${DRY_RUN ? 'Would insert' : 'Inserted'}:            ${toInsert.length}`);

  console.log('\nPer file (new / duplicate):');
  for (const f of files) {
    const s = perFile[f];
    const bad = invalidByFile[f];
    const tag = s ? `${s.insert} / ${s.dupe}` : bad ? 'FILE ERROR' : '0 / 0';
    console.log(`  ${f.padEnd(42)} ${tag}`);
  }

  const invalidFiles = Object.keys(invalidByFile);
  if (invalidFiles.length) {
    console.log('\nValidation problems:');
    for (const f of invalidFiles) {
      console.log(`  ${f}`);
      invalidByFile[f].slice(0, 10).forEach((e) => console.log(`    - ${e}`));
      if (invalidByFile[f].length > 10) console.log(`    ... and ${invalidByFile[f].length - 10} more`);
    }
    process.exitCode = 1;
  }
}

main();
