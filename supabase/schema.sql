-- ============================================================
-- INSIGHT TRIVIA — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- ── PROFILES ────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  avatar_id text not null default 'scroll',
  avatar_color text not null default '#4a90d9',
  points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  total_questions_answered integer not null default 0,
  correct_answers integer not null default 0,
  owned_cosmetics text[] not null default '{"scroll","dove","star","lamp","book","mountain"}',
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "Public read" on profiles for select using (true);
create policy "Own write" on profiles for update using (auth.uid() = id);
create policy "Own insert" on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── QUESTIONS ───────────────────────────────────────────────
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'General',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  reference text,        -- e.g. "Insight, Vol. 1, p. 243"
  hint text,             -- optional 1-sentence hint shown before buzz
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
alter table questions enable row level security;
create policy "Public read active" on questions for select using (active = true);
create policy "Admin insert" on questions for insert with check (true);  -- restrict later

-- ── QUESTION TYPES (added for multiple choice / ordering / matching) ──
alter table questions
  add column if not exists type text not null default 'free_text'
    check (type in ('free_text', 'multiple_choice', 'ordering', 'matching', 'fill_blank')),
  add column if not exists options text[],
  add column if not exists payload jsonb;

-- NOTE: 'free_text' is deprecated and unplayable as of the Question Types v2
-- work (2026-08-31). It remains a legal constraint value only for historical
-- rows; the importer never writes it and the client has no render path for it.
-- Run scripts/migrate-free-text-to-mc.js to convert existing rows.

alter table questions alter column answer drop not null;

-- ── GAME ROOMS ───────────────────────────────────────────────
create table if not exists game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references profiles(id),
  mode text not null default '1v1' check (mode in ('1v1','teams')),
  status text not null default 'waiting' check (status in ('waiting','active','finished')),
  current_question_index integer not null default 0,
  total_questions integer not null default 10,
  question_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table game_rooms enable row level security;
create policy "Room members read" on game_rooms for select using (true);
create policy "Host update" on game_rooms for update using (auth.uid() = host_id);
create policy "Authenticated insert" on game_rooms for insert with check (auth.uid() = host_id);

-- ── GAME PLAYERS ─────────────────────────────────────────────
create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id),
  team text check (team in ('A','B')),
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
alter table game_players enable row level security;
create policy "Room members read" on game_players for select using (true);
create policy "Own insert" on game_players for insert with check (auth.uid() = user_id);
create policy "Own update" on game_players for update using (auth.uid() = user_id);

-- ── GAME EVENTS (realtime log) ───────────────────────────────
-- Used for real-time sync: buzz-in, answer, next-question events
create table if not exists game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references game_rooms(id) on delete cascade,
  event_type text not null, -- 'game_start' | 'buzz_in' | 'answer' | 'sequence_submit' | 'next_question' | 'game_over'
  player_id uuid references profiles(id),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table game_events enable row level security;
create policy "Room members read" on game_events for select using (true);
create policy "Authenticated insert" on game_events for insert with check (auth.uid() = player_id);

-- Enable realtime on game_events and game_rooms
alter publication supabase_realtime add table game_events;
alter publication supabase_realtime add table game_rooms;
alter publication supabase_realtime add table game_players;

-- ── LEADERBOARD VIEW ─────────────────────────────────────────
create or replace view leaderboard as
  select
    id,
    username,
    avatar_id,
    avatar_color,
    points,
    wins,
    losses,
    total_questions_answered,
    correct_answers,
    case when total_questions_answered > 0
      then round(correct_answers::numeric / total_questions_answered * 100, 1)
      else 0
    end as accuracy_pct
  from profiles
  order by points desc;

-- ── SEED QUESTIONS ───────────────────────────────────────────
-- A small set of starter questions. Jesse: add more via the admin panel or directly here.
insert into questions (question, answer, category, difficulty, reference, hint) values
  ('What was the name of the first man created by God?', 'Adam', 'Creation', 'easy', 'Insight, Vol. 1, p. 45', 'He was formed from the dust of the ground'),
  ('How many days did it rain during the global flood in Noah''s day?', '40', 'History', 'easy', 'Genesis 7:12', 'It was also the number of years Israel wandered'),
  ('What language was most of the Hebrew Scriptures originally written in?', 'Hebrew', 'Scriptures', 'easy', 'Insight, Vol. 2, p. 1200', 'The language shares its name with the people'),
  ('What was the name of the garden where Adam and Eve lived?', 'Eden', 'Creation', 'easy', 'Genesis 2:8', 'Its name means "pleasure" or "delight"'),
  ('How many books are in the Hebrew-Aramaic Scriptures (Old Testament)?', '39', 'Scriptures', 'medium', 'Insight, Vol. 2, p. 1199', 'Less than half the total Bible books'),
  ('What was the name of Moses'' father-in-law, also called Jethro?', 'Reuel', 'People', 'medium', 'Insight, Vol. 2, p. 795', 'He was a priest of Midian'),
  ('What metal was used to make the Ark of the Covenant''s cover (mercy seat)?', 'Gold', 'Tabernacle', 'easy', 'Exodus 25:17', 'The most precious metal'),
  ('In what city was Jesus born?', 'Bethlehem', 'Jesus', 'easy', 'Matthew 2:1', 'Prophesied by Micah 5:2'),
  ('How many tribes made up ancient Israel?', '12', 'History', 'easy', 'Insight, Vol. 2, p. 1113', 'One for each son of Jacob'),
  ('What was the first miracle Jesus performed?', 'Turning water into wine', 'Jesus', 'medium', 'John 2:1-11', 'It happened at a wedding in Cana'),
  ('What was the name of the sea Israel crossed during the Exodus from Egypt?', 'Red Sea', 'History', 'easy', 'Exodus 14:21', 'Also called the Sea of Reeds'),
  ('How many psalms are in the book of Psalms?', '150', 'Scriptures', 'medium', 'Insight, Vol. 2, p. 700', 'More chapters than any other Bible book'),
  ('Who was the first king of Israel?', 'Saul', 'History', 'easy', 'Insight, Vol. 2, p. 868', 'He was from the tribe of Benjamin'),
  ('What was the name of David''s son who became the wisest king?', 'Solomon', 'History', 'easy', '1 Kings 3:12', 'He built the first temple in Jerusalem'),
  ('How many days was Jonah inside the big fish?', '3', 'Prophets', 'easy', 'Jonah 1:17', 'Jesus used this as a sign'),
  ('What was the original name of the apostle Paul?', 'Saul', 'Apostles', 'medium', 'Acts 7:58; 13:9', 'He shared his name with Israel''s first king'),
  ('In what river was Jesus baptized?', 'Jordan', 'Jesus', 'easy', 'Matthew 3:13', 'The same river Israel crossed to enter Canaan'),
  ('What is the shortest verse in the Bible (KJV)?', 'Jesus wept', 'Scriptures', 'medium', 'John 11:35', 'Two words that show deep emotion'),
  ('Who wrote the most books of the Greek Scriptures?', 'Paul', 'Scriptures', 'medium', 'Insight, Vol. 2, p. 580', '14 letters are attributed to him'),
  ('What does the name "Jesus" mean?', 'Jehovah is salvation', 'Jesus', 'hard', 'Insight, Vol. 2, p. 53', 'Related to the name Joshua')
on conflict do nothing;
