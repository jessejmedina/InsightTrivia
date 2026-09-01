#!/usr/bin/env node
/**
 * Schema-drift check: verifies the live Supabase DB matches what
 * supabase/schema.sql claims — specifically the question-type columns
 * and the nullable `answer` column that ordering/matching rows need.
 *
 * Usage: node scripts/check-schema.js
 * Requires SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL in .env
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
console.log('URL:', url);
console.log('service key project ref:', JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref);

const supabase = createClient(url, key);

(async () => {
  const { data: sample, error: selErr } = await supabase
    .from('questions')
    .select('id, type, options, payload, answer')
    .limit(1);
  console.log('\n[select type/options/payload/answer]');
  console.log(selErr ? 'ERROR: ' + selErr.message : 'OK sample: ' + JSON.stringify(sample));

  console.log('\n[free_text row count — should be 0 after migration]');
  {
    const { count, error } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'free_text');
    if (error) console.log('ERROR:', error.message);
    else console.log(count === 0 ? 'OK — no free_text rows' : `WARNING — ${count} free_text rows remain`);
  }

  const testRow = {
    question: '__DIAG__ ordering constraint probe ' + Date.now(),
    answer: null,
    options: null,
    payload: { items: ['A', 'B', 'C', 'D'] },
    category: 'Test',
    difficulty: 'easy',
    type: 'ordering',
    active: false,
  };
  const { data: ins, error: insErr } = await supabase
    .from('questions')
    .insert(testRow)
    .select('id');
  console.log('\n[insert ordering row with answer:null]');
  if (insErr) {
    console.log('FAIL:', insErr.code, '-', insErr.message);
    if (insErr.details) console.log('details:', insErr.details);
    process.exitCode = 1;
  } else {
    console.log('SUCCESS - answer NOT NULL constraint is dropped. Inserted id:', ins[0].id);
    const { error: delErr } = await supabase.from('questions').delete().eq('id', ins[0].id);
    console.log('cleanup:', delErr ? 'FAILED ' + delErr.message : 'deleted probe row');
  }
})();
