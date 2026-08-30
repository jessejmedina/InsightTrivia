#!/usr/bin/env node
/**
 * Diagnostic: lists auth users via the Admin API (bypasses dashboard UI/caching).
 * Usage: node scripts/list-auth-users.js
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  console.log('Project URL:', SUPABASE_URL);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('listUsers failed:', error.message);
    process.exit(1);
  }

  console.log(`Found ${data.users.length} auth user(s):`);
  for (const u of data.users) {
    console.log(`  - ${u.email}  confirmed=${!!u.email_confirmed_at}  created=${u.created_at}  id=${u.id}`);
  }

  const { data: profiles, error: profErr } = await supabase.from('profiles').select('id, username, created_at');
  if (profErr) {
    console.error('profiles fetch failed:', profErr.message);
    process.exit(1);
  }
  console.log(`Found ${profiles.length} profile row(s):`);
  for (const p of profiles) {
    console.log(`  - ${p.username}  id=${p.id}  created=${p.created_at}`);
  }
}

main();
