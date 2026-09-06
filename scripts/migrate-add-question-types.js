#!/usr/bin/env node
/**
 * One-off: replace the questions.type CHECK constraint so the three v3
 * types (estimation, progressive, swipe) are allowed. Idempotent — safe to
 * re-run. Requires SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL.
 *
 * Supabase JS has no DDL API, so this uses a Postgres function call. If
 * your project has no `exec_sql` RPC, run the SQL it prints in the
 * Supabase SQL editor and skip this script.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const SQL = `
alter table questions drop constraint if exists questions_type_check;
alter table questions add constraint questions_type_check
  check (type in ('free_text','multiple_choice','ordering','matching','fill_blank','estimation','progressive','swipe'));
`;

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
  const supabase = createClient(url, key);
  const { error } = await supabase.rpc('exec_sql', { sql: SQL });
  if (error) {
    console.error('RPC exec_sql failed:', error.message);
    console.error('\nRun this SQL manually in the Supabase dashboard SQL editor:\n' + SQL);
    process.exit(1);
  }
  console.log('questions.type constraint updated — estimation/progressive/swipe now allowed.');
}
main();
