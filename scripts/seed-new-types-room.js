#!/usr/bin/env node
/**
 * Dev helper: creates a waiting game room (code NEWTYP) seeded with the
 * v3 new-type test questions from data/test-new-types.json, so you can
 * play estimation / progressive / swipe deterministically.
 *
 * Usage:
 *   npx tsx scripts/import-questions.js data/test-new-types.json   # once
 *   node scripts/seed-new-types-room.js <your-username>
 *
 * Then in the app: Join Game -> code NEWTYP -> Start (Solo Dev Test).
 * Re-run any time; it recreates the NEWTYP room from scratch.
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
const ROOM_CODE = 'NEWTYP';

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node scripts/seed-new-types-room.js <your-username>');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const testFile = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'test-new-types.json'), 'utf8')
  );
  const wantTexts = testFile.map((q) => q.question.trim());
  const { data: found, error: qErr } = await supabase
    .from('questions')
    .select('id, question, type')
    .in('question', wantTexts);
  if (qErr) { console.error('Question lookup failed:', qErr.message); process.exit(1); }

  const byText = new Map(found.map((r) => [r.question.trim(), r]));
  const missing = wantTexts.filter((t) => !byText.has(t));
  if (missing.length) {
    console.error('These test questions are not in the DB yet — import them first:');
    console.error('  npx tsx scripts/import-questions.js data/test-new-types.json');
    missing.forEach((t) => console.error('  - ' + t));
    process.exit(1);
  }
  const questionIds = wantTexts.map((t) => byText.get(t).id);
  console.log('Seeded questions:');
  wantTexts.forEach((t) => console.log(`  [${byText.get(t).type}] ${t}`));

  const { data: profiles, error: pErr } = await supabase
    .from('profiles').select('id, username').eq('username', username);
  if (pErr) { console.error('Profile lookup failed:', pErr.message); process.exit(1); }
  if (!profiles.length) {
    console.error(`No profile with username "${username}". Known usernames:`);
    const { data: all } = await supabase.from('profiles').select('username');
    (all ?? []).forEach((p) => console.error('  - ' + p.username));
    process.exit(1);
  }
  const hostId = profiles[0].id;

  await supabase.from('game_rooms').delete().eq('code', ROOM_CODE);
  const { data: room, error: rErr } = await supabase
    .from('game_rooms')
    .insert({
      code: ROOM_CODE, host_id: hostId, mode: '1v1', status: 'waiting',
      current_question_index: 0, total_questions: questionIds.length, question_ids: questionIds,
    })
    .select().single();
  if (rErr) { console.error('Room create failed:', rErr.message); process.exit(1); }

  const { error: jErr } = await supabase
    .from('game_players').insert({ room_id: room.id, user_id: hostId, team: null });
  if (jErr) { console.error('Host join failed:', jErr.message); process.exit(1); }

  console.log(`\nRoom ready.  code: ${ROOM_CODE}  id: ${room.id}`);
  console.log(`In the app as "${username}": Join Game -> ${ROOM_CODE} -> Start (Solo Dev Test).`);
}

main();
