# Question Types v3 — New Types Implementation Plan (Plan 2 of 2)

> **STATUS: COMPLETE (2026-09-06).** All tasks done, commits `90b5e42`..`a5a3104`
> on `feature/question-type-system`. 89 unit + 13 import tests green;
> `tsc` clean (bar the 6 pre-existing `profile.tsx` baseline errors);
> `expo-doctor` 21/21. Live-DB `questions.type` CHECK constraint updated by
> the owner via the Supabase SQL editor. Web playtest of all three new
> types passed: estimation slider (drag + track-tap + whole-number readout
> + correct default position) → winner-takes-pot scoring verified
> end-to-end (+150 for a slow exact answer); progressive clue cadence +
> buzz → 12s window + 4-option grid + reveal; swipe card stack + L/R
> buttons + partial-on-timeout + per-card reveal; redesigned ResultsPhase
> (mascot, animated bars, per-question pip strip). Zero console errors.
> Three bugs found in playtest and fixed (`41df2ec`, `a5a3104`): slider
> float readout, progressive clue-count snapshot race, slider thumb stuck
> at 0 on mount.
>
> **Deferred:** clean fast-path scoring verification for progressive
> (correct answer) and swipe (accuracy) — the browser-automation round-trip
> latency kept overshooting the 12–20s timers; the scoring *logic* is
> unit-tested (10 progressive + 6 swipe cases) and the host
> resolve→round_scored→reveal pipeline is proven by the estimation run.
> The owner's Expo Go phone playtest (human speed) covers this.
> **Content:** `data/insight-{estimation,progressive,swipe}-batch1-4.json`
> (80 / 64 / 62 questions) written, all pass `validate()`, NOT imported yet
> — quality-review + import during the checkpoint.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new question types — numerical estimation (slider, winner-takes-the-pot), progressive clue ("Smart Ass" style, decaying points), and swipe-to-categorize (Tinder-style, graded credit) — on top of the Plan 1 descriptor framework, wire the importer to validate them through the shared descriptor logic, and redesign the results screen.

**Architecture:** Each new type is a pure-logic module under `lib/questionTypes/logic/` (roundStyle, timerSeconds, `score`, `isRoundComplete`, `validatePayload` — no React, unit-tested) plus a `.tsx` Play component and a Reveal component paired to it in `lib/questionTypes/index.tsx`. The Plan 1 host (`app/game/[roomId].tsx`), `useGameRound` hook, `round_submit`/`round_scored` events, and DB-conditional advance are **unchanged** — the framework was built for exactly this. The importer (`scripts/import-questions.js`) moves to `tsx` so its `validate()` can call the same `validatePayload` functions instead of duplicating rules.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript, `react-native-reanimated` v4 + `react-native-worklets`, `react-native-gesture-handler`, `react-native-svg` (all installed in Plan 1), Supabase, `tsx --test` + `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-05-question-types-v3-design.md` — this plan implements spec §2 (the three new types), §3.4 (`ResultsPhase` redesign), and §4.1 (importer `validatePayload` delegation). It is Plan 2 of 2; Plan 1 (`docs/superpowers/plans/2026-09-05-question-types-v3-foundation.md`, commits `7531d6a`..`0bd9edb`) built the framework and visual system.

## Global Constraints

- Expo SDK is **57** (`expo@^57.0.9`, RN `0.86.3`). Reanimated is **v4** with `react-native-worklets` as a separate package; **no `babel.config.js`** (`babel-preset-expo` auto-configures). All four native libs are already installed — do not reinstall.
- The game is **head-to-head (1v1)**. `playerIds` is exactly 2 in a real game, 1 in solo dev testing (`Start (Solo Dev Test)`). Every `score` / `isRoundComplete` must handle the 1-player case without hanging (see Plan 1 Task 10's `playerIds.length < 2` handling — mirror it).
- Pure descriptor logic under `lib/questionTypes/logic/` must **never import React, react-native, or any `.tsx` file** — it runs under plain `tsx --test`.
- Closest-wins scoring is **winner-takes-the-pot** (spec §2.1, owner-confirmed): the closer player gets the full speed-scaled pot, the other gets `0`. An exact-distance tie gives both the pot.
- Swipe-categorize is **graded partial credit** (NOT winner-takes-pot) — same `calcPartialCreditPoints` shape as ordering/matching.
- Progressive clue uses **MC-after-buzz** (pick from 4 `options`) — no free-typed answers (consistent with v2 WS1 removing the typed-answer path).
- The live Supabase DB has drifted from `schema.sql` before and there is **no migration runner** — the `questions.type` CHECK constraint change is applied to the live DB by a one-off script and verified with `scripts/check-schema.js`, and `schema.sql` is updated to match.
- **Content authoring is NOT in this plan.** Spec §4.3's "~15–20 of each type, then scale to 150+" is a separate parallel batched sub-task loop. This plan delivers the types, their validation, and a tiny `data/test-new-types.json` for playtesting.
- Copyright: this plan authors only a handful of throwaway test questions — still, write original prompts, never quote or closely paraphrase Insight.
- Every task ends green: `npm run test` passes and `npx tsc --noEmit` shows only the 6 pre-existing `app/(tabs)/profile.tsx` null-guard errors.
- Manual verification for any task that changes runtime behavior: web (`npx expo start --web`, seed with the new room helper) **and** Expo Go on a phone (`npx expo start --offline` to skip the sign-in requirement — the CLI signs the dev manifest when logged in, which Expo Go then demands too).
- Commit after every task with the message shown in its final step.

---

## Current framework shape (what Plan 1 left)

From `lib/questionTypes/logic/types.ts` — do not redefine these, import them:

```ts
export type RoundStyle = 'buzz' | 'concurrent';

export interface DescriptorScoreInput<TPayload = unknown, TSubmission = unknown> {
  question: { payload: TPayload | null; options: string[] | null; answer: string | null };
  mine: TSubmission | null;          // buzz: the answerer's submission. concurrent: this player's.
  opponent: TSubmission | null;      // buzz: the opponent's shot submission if any. concurrent: the other player's.
  mySecondsLeft: number | null;
  opponentSecondsLeft: number | null;
}

export interface RoundScoreResult {
  points: { mine: number; opponent: number };
  breakdown: unknown;                // the RevealComponent renders this
}

export interface DescriptorRoundState<TSubmission = unknown> {
  roundStyle: RoundStyle;
  submissions: Record<string, { submission: TSubmission; secondsLeft: number }>;
  buzzedPlayerId: string | null;
  opponentShotTaken: boolean;        // buzz round: true once both players have a submission
  playerIds: string[];
  timedOut: boolean;
  correctAnswer: string | null;
}

export type PayloadValidation<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; error: string };

export interface TypeLogic<TPayload = unknown, TSubmission = unknown> {
  id: string;
  roundStyle: RoundStyle;
  timerSeconds: number;
  score(input: DescriptorScoreInput<TPayload, TSubmission>): RoundScoreResult;
  isRoundComplete(state: DescriptorRoundState<TSubmission>): boolean;
  validatePayload(raw: unknown): PayloadValidation<TPayload>;
}
```

From `lib/questionTypes/logic/index.ts`: `TYPE_LOGICS` record, `getTypeLogic(type)`, plus `buildRoundState` / `needsOpponentShot` / `orderScorePlayers` helpers.

From `lib/questionTypes/index.tsx`: the `UI` record maps `type → { Play, Reveal }`, and `getDescriptor(type)` returns `{ logic, PlayComponent, RevealComponent }`.

From `lib/questionTypes/uiTypes.ts` — the component prop contracts:

```ts
export interface PlayProps {
  question: Question;
  questionId: string;
  timeLeft: number;
  hasSubmitted: boolean;
  buzzedByMe: boolean;
  buzzedByOpponent: boolean;
  onBuzz?: () => void;
  onSubmit: (submission: unknown) => void;
}
export interface RevealProps {
  question: Question;
  breakdown: unknown;
  myPointsThisRound: number;
  myRunningTotal: number;
}
```

From `lib/gameLogic.ts`: `calcPartialCreditPoints(correctCount, totalCount, secondsLeft)` (floor 0.5, /20 clock, cap 1.0 → max 300), `seededShuffle<T>(items, seed)`, `calcBuzzPoints(secondsLeft)`, `OPPONENT_MISS_POINTS = 100`.

The `useGameRound` hook: after a buzz the countdown restarts at `ANSWER_WINDOW_SECONDS = 12`; `submitRound(submission)` sends `round_submit` with `seconds_left` = the frozen buzz-time for buzz rounds, live `timeLeft` for concurrent. The host runs `descriptor.logic.score` once at round-complete, writes both scores, emits `round_scored`.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `lib/questionTypes/logic/estimation.ts` | `estimationLogic` — winner-takes-pot proximity scoring, slider-bounds validation, `logMap`/`logUnmap` helpers. |
| `lib/questionTypes/logic/estimation.test.ts` | Unit tests. |
| `lib/questionTypes/logic/progressive.ts` | `progressiveLogic` — clue-ladder scoring, opponent shot at the current clue level, `clues` validation. |
| `lib/questionTypes/logic/progressive.test.ts` | Unit tests. |
| `lib/questionTypes/logic/swipe.ts` | `swipeLogic` — graded partial credit, unswiped-as-wrong, category/card validation. |
| `lib/questionTypes/logic/swipe.test.ts` | Unit tests. |
| `components/game/SliderInput.tsx` | Reanimated + gesture-handler horizontal slider; linear or log axis; track-tap + drag; big value readout. |
| `components/game/EstimationPhase.tsx` | PlayComponent for `estimation`. |
| `components/game/EstimationReveal.tsx` | RevealComponent for `estimation` — number line, both marks, "Closer!" badge. |
| `components/game/ProgressivePhase.tsx` | PlayComponent for `progressive` — clue list revealed on the shared timer, buzz, then the 4-option grid. |
| `components/game/ProgressiveReveal.tsx` | RevealComponent for `progressive` — answer, each player's buzz clue-level. |
| `components/game/SwipePhase.tsx` | PlayComponent for `swipe` — card stack, `Gesture.Pan`, L/R buttons. |
| `components/game/SwipeReveal.tsx` | RevealComponent for `swipe` — each card, swipe vs correct side, count. |
| `scripts/seed-new-types-room.js` | Seeds room `NEWTYP` with the `data/test-new-types.json` questions. |
| `data/test-new-types.json` | 2 estimation + 2 progressive + 2 swipe throwaway questions for playtesting. (gitignored — `data/` is.) |
| `scripts/migrate-add-question-types.js` | One-off: drop + re-add the `questions.type` CHECK constraint with the new values. |

**Modified files:**

| Path | Change |
|---|---|
| `lib/questionTypes/logic/types.ts` | Add `EstimationPayload`, `ProgressivePayload`, `SwipePayload` interfaces. |
| `lib/questionTypes/logic/index.ts` | Register the 3 new logics in `TYPE_LOGICS`; re-export their submission types. |
| `lib/questionTypes/index.tsx` | Add the 3 new `{ Play, Reveal }` pairs to `UI`. |
| `lib/gameTypes.ts` | Widen `Question.payload` union to name the 3 new payload shapes; add `RoundHistoryEntry`. |
| `app/game/useGameRound.ts` | Accumulate each `round_scored` into a `roundHistory` array; expose it. |
| `components/game/ResultsPhase.tsx` | Redesign: winner banner, mascot, animated bars, per-round summary. |
| `scripts/import-questions.js` | `validate()` delegates payload checks to `getTypeLogic(type).validatePayload`; runs under `tsx`. |
| `scripts/import-all.js` | Runs under `tsx` (requires the updated importer). |
| `scripts/import-questions.test.js` | Runs under `tsx`; add cases for the 3 new types. |
| `package.json` | `test:import` → `tsx --test scripts/import-questions.test.js`. |
| `supabase/schema.sql` | `questions.type` CHECK adds `estimation`, `progressive`, `swipe`. |
| `components/game/gameStyles.ts` | Styles for slider, card stack, and the new reveals. |

---

## PART A — Schema & importer foundation

### Task A1: Extend the `questions.type` CHECK constraint

**Files:**
- Modify: `supabase/schema.sql:57-58`
- Create: `scripts/migrate-add-question-types.js`
- Modify: `scripts/check-schema.js` (add an assertion)

**Interfaces:**
- Produces: the live DB and `schema.sql` both accept `type IN ('free_text','multiple_choice','ordering','matching','fill_blank','estimation','progressive','swipe')`.

- [x] **Step 1: Update `schema.sql`**

Change lines 57–58 from:
```sql
  add column if not exists type text not null default 'free_text'
    check (type in ('free_text', 'multiple_choice', 'ordering', 'matching', 'fill_blank')),
```
to:
```sql
  add column if not exists type text not null default 'free_text'
    check (type in ('free_text', 'multiple_choice', 'ordering', 'matching', 'fill_blank', 'estimation', 'progressive', 'swipe')),
```

- [x] **Step 2: Write the migration script**

Create `scripts/migrate-add-question-types.js` (plain Node — no descriptor imports):
```js
#!/usr/bin/env node
/**
 * One-off: replace the questions.type CHECK constraint so the three v3
 * types (estimation, progressive, swipe) are allowed. Idempotent — safe to
 * re-run. Requires SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL.
 *
 * Supabase JS has no DDL API, so this uses a Postgres function call. If
 * your project has no `exec_sql` RPC, run the SQL in Step 3 manually in the
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
  if (!url || !key) { console.error('Missing env'); process.exit(1); }
  const supabase = createClient(url, key);
  const { error } = await supabase.rpc('exec_sql', { sql: SQL });
  if (error) {
    console.error('RPC failed:', error.message);
    console.error('Run this SQL manually in the Supabase SQL editor:\n' + SQL);
    process.exit(1);
  }
  console.log('questions.type constraint updated.');
}
main();
```

- [x] **Step 3: Apply it**

```bash
node scripts/migrate-add-question-types.js
```
If it reports the RPC is missing, open the Supabase dashboard → SQL editor, paste the two `alter table` statements it printed, run them.

- [x] **Step 4: Add a `check-schema.js` assertion**

In `scripts/check-schema.js`, after the existing checks, add a probe that inserts a throwaway `type='swipe'` row and deletes it:
```js
console.log('\n[insert type=swipe probe]');
{
  const { data, error } = await supabase.from('questions').insert({
    question: '__schema probe swipe__', answer: null, type: 'swipe',
    category: 'General', difficulty: 'medium',
    payload: { categoryLeft: 'L', categoryRight: 'R', cards: [
      { text: 'a', side: 'left' }, { text: 'b', side: 'right' },
      { text: 'c', side: 'left' }, { text: 'd', side: 'right' },
    ]},
  }).select('id').single();
  if (error) { console.error('FAIL — type=swipe rejected:', error.message); process.exitCode = 1; }
  else { console.log('OK — type=swipe accepted'); await supabase.from('questions').delete().eq('id', data.id); }
}
```

- [x] **Step 5: Run it**

```bash
node scripts/check-schema.js
```
Expected: all existing checks unchanged, plus `OK — type=swipe accepted`.

- [x] **Step 6: Commit**

```bash
git add supabase/schema.sql scripts/migrate-add-question-types.js scripts/check-schema.js
git commit -m "feat(schema): allow estimation/progressive/swipe question types"
```

---

### Task A2: Importer delegates payload validation to the descriptor logic

**Files:**
- Modify: `scripts/import-questions.js`
- Modify: `scripts/import-all.js` (usage comment only — it inherits the tsx requirement transitively)
- Modify: `scripts/import-questions.test.js`
- Modify: `package.json` (`test:import` script)

**Interfaces:**
- Consumes: `getTypeLogic` from `../lib/questionTypes/logic` (Plan 1).
- Produces: `validate(raw, index)` unchanged signature — `{ ok: true, row } | { ok: false, index, errors }`. `row` shape unchanged: `{ question, answer, options, payload, category, difficulty, reference, hint, type, active }`.

- [x] **Step 1: Point `test:import` at `tsx`**

In `package.json`:
```json
"test:import": "tsx --test scripts/import-questions.test.js",
```
(`tsx` runs `.js` files and lets them import `.ts` — it's already a devDependency.)

- [x] **Step 2: Run the import test to confirm the toolchain switch is clean**

```bash
npm run test:import
```
Expected: the existing 9 tests still pass (no code changed yet — this just proves `tsx --test` runs the `.js` test file).

- [x] **Step 3: Rewrite `validate()` to delegate**

In `scripts/import-questions.js`, replace the type-resolution + per-type validation block (currently lines ~31–107) with:
```js
const { getTypeLogic } = require('../lib/questionTypes/logic');

const PLAYABLE_TYPES = new Set(['multiple_choice', 'progressive', 'ordering', 'matching', 'estimation', 'swipe']);
const NEEDS_OPTIONS = new Set(['multiple_choice', 'progressive']);
const NEEDS_PAYLOAD = new Set(['ordering', 'matching', 'estimation', 'progressive', 'swipe']);

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
    else { errors.push('no playable type: give a "type", or a 4-entry "options" array'); return { ok: false, index, errors }; }
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

  // Payload (everything except plain multiple_choice) — delegated to the descriptor.
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
```
Keep the existing `loadEnv()`, `shuffleOptions()`, `DIFFICULTIES`, and the `main()` at the bottom. Delete the old inline `QUESTION_TYPES` array and the old ordering/matching validation blocks.

- [x] **Step 4: Add new-type cases to `scripts/import-questions.test.js`**

Append:
```js
test('validate: estimation delegates to the descriptor (rejects min >= value)', () => {
  const r = validate({ question: 'How tall?', type: 'estimation',
    payload: { value: 50, unit: 'cubits', min: 60, max: 100 } }, 0);
  assert.equal(r.ok, false);
});

test('validate: estimation accepts a well-formed payload, answer stays null', () => {
  const r = validate({ question: 'How tall?', type: 'estimation',
    payload: { value: 50, unit: 'cubits', min: 0, max: 100 } }, 0);
  assert.equal(r.ok, true);
  assert.equal(r.row.answer, null);
  assert.equal(r.row.payload.value, 50);
});

test('validate: progressive needs 4 options AND a clues payload', () => {
  const noClues = validate({ question: 'Who?', type: 'progressive', answer: 'A',
    options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(noClues.ok, false);
  const good = validate({ question: 'Who?', type: 'progressive', answer: 'A',
    options: ['A', 'B', 'C', 'D'], payload: { clues: ['c1', 'c2', 'c3'] } }, 0);
  assert.equal(good.ok, true);
  assert.equal(good.row.answer, 'A');
  assert.deepEqual(good.row.payload.clues, ['c1', 'c2', 'c3']);
});

test('validate: swipe delegates card/category checks', () => {
  const bad = validate({ question: 'Sort', type: 'swipe',
    payload: { categoryLeft: 'X', categoryRight: 'X', cards: [] } }, 0);
  assert.equal(bad.ok, false);
  const good = validate({ question: 'Sort', type: 'swipe',
    payload: { categoryLeft: 'OT', categoryRight: 'NT', cards: [
      { text: 'Genesis', side: 'left' }, { text: 'Matthew', side: 'right' },
      { text: 'Exodus', side: 'left' }, { text: 'Mark', side: 'right' },
    ]}}, 0);
  assert.equal(good.ok, true);
  assert.equal(good.row.answer, null);
});
```
These reference `validatePayload` behaviour defined in Tasks B1 / C1 / D1 — if this task runs first, the descriptors don't exist yet and the 4 new tests fail to import. **Order:** do Task A2 Step 4 (and Step 5's green run) after B1, C1, D1 are merged. Steps 1–3 can land now; note it in the commit.

- [x] **Step 5: Run the full suite**

```bash
npm run test
```
Expected: `test:unit` unchanged; `test:import` green including the 4 new cases (once B1/C1/D1 exist).

- [x] **Step 6: Update usage comments**

In `scripts/import-questions.js` and `scripts/import-all.js` header comments, change `node scripts/import-*.js` to `npx tsx scripts/import-*.js` (they now import TS). Same in `scripts/seed-test-room.js`'s comment block and `data/HANDOFF.md` if it names the command.

- [x] **Step 7: Commit**

```bash
git add scripts/import-questions.js scripts/import-all.js scripts/import-questions.test.js scripts/seed-test-room.js package.json data/HANDOFF.md
git commit -m "feat(import): validate() delegates payload checks to descriptor logic; run under tsx"
```

---

## PART B — Numerical estimation

### Task B1: `estimation` descriptor logic

**Files:**
- Create: `lib/questionTypes/logic/estimation.ts`
- Create: `lib/questionTypes/logic/estimation.test.ts`
- Modify: `lib/questionTypes/logic/types.ts` (add `EstimationPayload`)
- Modify: `lib/questionTypes/logic/index.ts` (register)

**Interfaces:**
- Produces:
  - `interface EstimationPayload { value: number; unit: string; min: number; max: number; step?: number; log?: boolean }` (in `types.ts`)
  - `interface EstimationSubmission { guess: number }`
  - `estimationLogic: TypeLogic<EstimationPayload, EstimationSubmission>` — `roundStyle: 'concurrent'`, `timerSeconds: 20`.
  - `logMap(value: number, min: number, max: number): number` → position in `[0,1]`
  - `logUnmap(pos: number, min: number, max: number): number` → value
- Scoring (winner takes the pot):
  - `d(guess) = |guess − value|` on the linear axis, or `|logMap(guess) − logMap(value)|` when `log` (so proximity is judged on the axis the player actually sees).
  - Winner = the player with the smaller `d`. `speedMultiplier = min(1, max(0.5, winnerSecondsLeft / 20))`. Winner gets `round(300 * speedMultiplier)`, other gets `0`.
  - Equal `d` (includes identical guesses): **both** get `round(300 * speedMultiplier)` using the larger `secondsLeft`.
  - A player with no submission has `d = Infinity` and loses. Both missing → `0` / `0`.
- `isRoundComplete(state)`: `state.timedOut`, OR every id in `playerIds` has a submission.
- `validatePayload(raw)`: `value`/`min`/`max` finite numbers; `min < value < max`; `unit` a non-empty string; `step` (if present) a positive number; when `log === true`, `min > 0`.

- [x] **Step 1: Write the failing tests**

Create `lib/questionTypes/logic/estimation.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimationLogic, logMap, logUnmap } from './estimation';

const payload = { value: 40, unit: 'years', min: 0, max: 100 };
const concurrent = {
  roundStyle: 'concurrent' as const, buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

test('closer player wins the full speed-scaled pot, other gets 0', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 42 }, opponent: { guess: 70 },
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 0);
});

test('slow winner is floored at half the pot', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 41 }, opponent: { guess: 90 },
    mySecondsLeft: 0, opponentSecondsLeft: 0,
  });
  assert.equal(r.points.mine, 150);
});

test('exact-distance tie pays both the pot', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 30 }, opponent: { guess: 50 }, // both 10 away
    mySecondsLeft: 20, opponentSecondsLeft: 10,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 300);
});

test('a non-submitter loses to any guess', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: { guess: 99 }, opponent: null,
    mySecondsLeft: 5, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, round300(5));
  assert.equal(r.points.opponent, 0);
});

function round300(s: number) { return Math.round(300 * Math.min(1, Math.max(0.5, s / 20))); }

test('neither submits -> 0/0', () => {
  const r = estimationLogic.score({
    question: { payload, options: null, answer: null },
    mine: null, opponent: null, mySecondsLeft: null, opponentSecondsLeft: null,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('log axis: proximity judged on the log scale', () => {
  const logPayload = { value: 1000, unit: 'people', min: 10, max: 100000, log: true };
  // 500 and 2000 are equidistant from 1000 on a log axis; 500 is closer on a linear one.
  const r = estimationLogic.score({
    question: { payload: logPayload, options: null, answer: null },
    mine: { guess: 500 }, opponent: { guess: 2000 },
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 300); // tie on the log axis
});

test('logMap/logUnmap round-trip', () => {
  const v = logUnmap(logMap(250, 10, 100000), 10, 100000);
  assert.ok(Math.abs(v - 250) < 1e-6);
});

test('isRoundComplete: both submitted', () => {
  assert.equal(estimationLogic.isRoundComplete({
    ...concurrent,
    submissions: { p1: { submission: { guess: 1 }, secondsLeft: 5 }, p2: { submission: { guess: 2 }, secondsLeft: 3 } },
  }), true);
});

test('isRoundComplete: one submitted, not timed out -> false', () => {
  assert.equal(estimationLogic.isRoundComplete({
    ...concurrent, submissions: { p1: { submission: { guess: 1 }, secondsLeft: 5 } },
  }), false);
});

test('validatePayload rejects min >= value and empty unit', () => {
  assert.equal(estimationLogic.validatePayload({ value: 5, unit: 'x', min: 5, max: 10 }).ok, false);
  assert.equal(estimationLogic.validatePayload({ value: 5, unit: '', min: 0, max: 10 }).ok, false);
});

test('validatePayload rejects log with min <= 0', () => {
  assert.equal(estimationLogic.validatePayload({ value: 5, unit: 'x', min: 0, max: 10, log: true }).ok, false);
});

test('validatePayload accepts a clean payload', () => {
  const v = estimationLogic.validatePayload({ value: 40, unit: 'years', min: 0, max: 100 });
  assert.equal(v.ok, true);
});
```

- [x] **Step 2: Run, verify failure**

`npx tsx --test lib/questionTypes/logic/estimation.test.ts` → FAIL, module not found.

- [x] **Step 3: Add `EstimationPayload` to `types.ts`**

```ts
export interface EstimationPayload {
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
}
```

- [x] **Step 4: Implement `estimation.ts`**

```ts
import type { TypeLogic, EstimationPayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface EstimationSubmission { guess: number }

/** Position in [0,1] of `value` on a log axis from `min` to `max` (both > 0). */
export function logMap(value: number, min: number, max: number): number {
  const lv = Math.log(Math.max(value, min));
  return (lv - Math.log(min)) / (Math.log(max) - Math.log(min));
}
export function logUnmap(pos: number, min: number, max: number): number {
  return Math.exp(Math.log(min) + pos * (Math.log(max) - Math.log(min)));
}

function speedMult(secondsLeft: number | null): number {
  return Math.min(1, Math.max(0.5, (secondsLeft ?? 0) / 20));
}

function distance(guess: number | null, p: EstimationPayload): number {
  if (guess == null) return Infinity;
  if (p.log) return Math.abs(logMap(guess, p.min, p.max) - logMap(p.value, p.min, p.max));
  return Math.abs(guess - p.value);
}

function score(input: DescriptorScoreInput<EstimationPayload, EstimationSubmission>) {
  const p = input.question.payload;
  if (!p) return { points: { mine: 0, opponent: 0 }, breakdown: null };
  const dMine = distance(input.mine?.guess ?? null, p);
  const dOpp = distance(input.opponent?.guess ?? null, p);
  const breakdown = {
    value: p.value, unit: p.unit, min: p.min, max: p.max, log: !!p.log,
    mine: input.mine?.guess ?? null, opponent: input.opponent?.guess ?? null,
    dMine, dOpp,
  };
  if (dMine === Infinity && dOpp === Infinity) return { points: { mine: 0, opponent: 0 }, breakdown };
  if (dMine === dOpp) {
    const pot = Math.round(300 * speedMult(Math.max(input.mySecondsLeft ?? 0, input.opponentSecondsLeft ?? 0)));
    return { points: { mine: pot, opponent: pot }, breakdown: { ...breakdown, winner: 'tie' } };
  }
  if (dMine < dOpp) {
    return { points: { mine: Math.round(300 * speedMult(input.mySecondsLeft)), opponent: 0 }, breakdown: { ...breakdown, winner: 'mine' } };
  }
  return { points: { mine: 0, opponent: Math.round(300 * speedMult(input.opponentSecondsLeft)) }, breakdown: { ...breakdown, winner: 'opponent' } };
}

function isRoundComplete(state: DescriptorRoundState<EstimationSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const p = raw as Partial<EstimationPayload> | null | undefined;
  if (!p || typeof p !== 'object') return { ok: false as const, error: 'estimation needs a payload object' };
  for (const k of ['value', 'min', 'max'] as const) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) return { ok: false as const, error: `estimation payload.${k} must be a finite number` };
  }
  if (!(p.min! < p.value! && p.value! < p.max!)) return { ok: false as const, error: 'estimation needs min < value < max' };
  if (typeof p.unit !== 'string' || !p.unit.trim()) return { ok: false as const, error: 'estimation needs a non-empty unit' };
  if (p.step !== undefined && (typeof p.step !== 'number' || p.step <= 0)) return { ok: false as const, error: 'estimation step must be a positive number' };
  if (p.log === true && p.min! <= 0) return { ok: false as const, error: 'estimation log scale needs min > 0' };
  return { ok: true as const, payload: {
    value: p.value!, unit: p.unit.trim(), min: p.min!, max: p.max!,
    ...(p.step !== undefined ? { step: p.step } : {}),
    ...(p.log ? { log: true } : {}),
  } };
}

export const estimationLogic: TypeLogic<EstimationPayload, EstimationSubmission> = {
  id: 'estimation', roundStyle: 'concurrent', timerSeconds: 20, score, isRoundComplete, validatePayload,
};
```

- [x] **Step 5: Register in `lib/questionTypes/logic/index.ts`**

Add the import, the `export { estimationLogic }` + `export type { EstimationSubmission }`, and the `TYPE_LOGICS` entry `estimation: estimationLogic`.

- [x] **Step 6: Run, verify pass**

`npx tsx --test lib/questionTypes/logic/estimation.test.ts` → PASS.

- [x] **Step 7: Full unit suite + typecheck**

`npx tsx --test "lib/**/*.test.ts" "components/**/*.test.ts" && npx tsc --noEmit` → green (baseline tsc errors only; `[roomId].tsx` / importer may show errors only if you also started A2 Step 3 — otherwise clean).

- [x] **Step 8: Commit**

```bash
git add lib/questionTypes/logic/estimation.ts lib/questionTypes/logic/estimation.test.ts lib/questionTypes/logic/types.ts lib/questionTypes/logic/index.ts
git commit -m "feat(questionTypes): estimation descriptor logic (winner-takes-pot)"
```

---

### Task B2: `SliderInput` + `EstimationPhase`

**Files:**
- Create: `components/game/SliderInput.tsx`
- Create: `components/game/EstimationPhase.tsx`
- Modify: `components/game/gameStyles.ts` (slider styles)

**Interfaces:**
- Consumes: `EstimationPayload` (Task B1), `PlayProps` (Plan 1), `logMap`/`logUnmap` (Task B1).
- Produces:
  - `<SliderInput min max value step log onChange={(v:number)=>void} />` — controlled; renders a track, a draggable thumb, and responds to a tap anywhere on the track. Linear position unless `log`.
  - `EstimationPhase` (a `PlayProps` component) — reads `question.payload as EstimationPayload`, holds the current guess in state (initialised to the midpoint), calls `onSubmit({ guess })` once on "Lock In", `hasSubmittedRef` one-shot guard.

- [x] **Step 1: Implement `SliderInput.tsx`**

```tsx
import { useState } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, useDerivedValue, runOnJS } from 'react-native-reanimated';
import { logMap, logUnmap } from '../../lib/questionTypes/logic';
import { gameStyles as styles } from './gameStyles';

export function SliderInput({
  min, max, value, step, log, onChange,
}: { min: number; max: number; value: number; step?: number; log?: boolean; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const dragX = useSharedValue<number | null>(null); // non-null only while dragging

  const toPos = (v: number) => (log ? logMap(v, min, max) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const clamped = Math.min(1, Math.max(0, p));
    let v = log ? logUnmap(clamped, min, max) : min + clamped * (max - min);
    if (step) v = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, v));
  };

  const commit = (px: number) => onChange(fromPos(px / Math.max(width, 1)));

  // px position of the thumb: follow the finger while dragging, else derive from the controlled value.
  const controlledPx = toPos(value) * width;
  const px = useDerivedValue(() => (dragX.value ?? controlledPx));

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => { dragX.value = Math.min(width, Math.max(0, e.x)); runOnJS(commit)(dragX.value); })
    .onChange((e) => { dragX.value = Math.min(width, Math.max(0, (dragX.value ?? 0) + e.changeX)); runOnJS(commit)(dragX.value); })
    .onFinalize(() => { dragX.value = null; });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: px.value - 14 }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: px.value }));

  return (
    <View style={styles.sliderTrack} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.sliderFill, fillStyle]} pointerEvents="none" />
      <GestureDetector gesture={pan}>
        <Pressable style={styles.sliderHit}>
          <Animated.View style={[styles.sliderThumb, thumbStyle]} />
        </Pressable>
      </GestureDetector>
    </View>
  );
}
```
The `Pan` gesture covers the whole track (tap-to-jump falls out of `onBegin` firing at `e.x`), so no separate `onPress` is needed.

- [x] **Step 2: Add slider styles to `gameStyles.ts`**

```ts
sliderTrack: {
  width: '100%', height: 44, justifyContent: 'center', marginVertical: 8,
},
sliderHit: { position: 'absolute', left: 0, right: 0, height: 44 },
sliderFill: {
  position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: Colors.accentDim,
},
sliderThumb: {
  position: 'absolute', left: 0, width: 28, height: 28, borderRadius: 14,
  backgroundColor: Colors.accent, ...CardShadow,
},
estimateReadout: { fontSize: 40, fontWeight: '900', color: Colors.accent },
estimateUnit: { fontSize: 16, color: Colors.textSecondary, fontWeight: '700' },
```

- [x] **Step 3: Implement `EstimationPhase.tsx`**

```tsx
import { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import { SliderInput } from './SliderInput';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { EstimationPayload } from '../../lib/questionTypes/logic';

export function EstimationPhase({ question, timeLeft, hasSubmitted, onSubmit }: PlayProps) {
  const p = question.payload as EstimationPayload;
  const [guess, setGuess] = useState<number>(() => {
    const mid = p.log ? Math.sqrt(p.min * p.max) : (p.min + p.max) / 2;
    return p.step ? Math.round(mid / p.step) * p.step : Math.round(mid);
  });
  const hasSubmittedRef = useRef(false);

  function handleSubmit() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    onSubmit({ guess });
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
        {question.reference && <Text style={styles.qRef}>{question.reference}</Text>}
      </View>

      <Text style={styles.estimateReadout}>{formatGuess(guess)}</Text>
      <Text style={styles.estimateUnit}>{p.unit}</Text>

      <SliderInput min={p.min} max={p.max} value={guess} step={p.step} log={p.log} onChange={setGuess} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
        <Text style={styles.qRef}>{formatGuess(p.min)}</Text>
        <Text style={styles.qRef}>{formatGuess(p.max)}</Text>
      </View>

      {hasSubmitted ? (
        <Text style={styles.submittedBanner}>Locked in — waiting for the other player...</Text>
      ) : (
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Lock In</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function formatGuess(n: number): string {
  return Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(n);
}
```

- [x] **Step 4: Typecheck**

`npx tsc --noEmit` → baseline errors only (the components aren't wired into the registry yet — that's B3 — so nothing renders them, but they must compile).

- [x] **Step 5: Commit**

```bash
git add components/game/SliderInput.tsx components/game/EstimationPhase.tsx components/game/gameStyles.ts
git commit -m "feat(visual): SliderInput + EstimationPhase play UI"
```

---

### Task B3: `EstimationReveal` + register + playtest

**Files:**
- Create: `components/game/EstimationReveal.tsx`
- Modify: `lib/questionTypes/index.tsx` (add `estimation` to `UI`)
- Modify: `components/game/gameStyles.ts` (number-line styles)
- Create/Modify: `data/test-new-types.json` (add 2 estimation questions), `scripts/seed-new-types-room.js`

**Interfaces:**
- Consumes: `RevealProps` (Plan 1); the `breakdown` shape from `estimationLogic.score` — `{ value, unit, min, max, log, mine, opponent, dMine, dOpp, winner? }`.

- [x] **Step 1: Implement `EstimationReveal.tsx`**

```tsx
import { View, Text } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';
import { logMap } from '../../lib/questionTypes/logic';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

type B = {
  value: number; unit: string; min: number; max: number; log: boolean;
  mine: number | null; opponent: number | null; winner?: 'mine' | 'opponent' | 'tie';
};

export function EstimationReveal({ breakdown }: RevealProps) {
  const b = breakdown as B | null;
  if (!b) return <Text style={styles.revealLabel}>No answer</Text>;
  const pos = (v: number) => (b.log ? logMap(v, b.min, b.max) : (v - b.min) / (b.max - b.min));

  return (
    <View style={{ width: '100%', alignItems: 'center', gap: 12 }}>
      <Text style={styles.revealLabel}>The answer:</Text>
      <Text style={styles.revealAnswer}>{b.value.toLocaleString('en-US')} {b.unit}</Text>

      <View style={styles.numberLine}>
        <View style={[styles.numberLineMark, { left: `${pos(b.value) * 100}%`, backgroundColor: Colors.success }]} />
        {b.mine != null && <View style={[styles.numberLineMark, { left: `${pos(b.mine) * 100}%`, backgroundColor: Colors.accent }]} />}
        {b.opponent != null && <View style={[styles.numberLineMark, { left: `${pos(b.opponent) * 100}%`, backgroundColor: Colors.textMuted }]} />}
      </View>

      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Text style={styles.qRef}>You: {b.mine != null ? b.mine.toLocaleString('en-US') : '—'}</Text>
        <Text style={styles.qRef}>Them: {b.opponent != null ? b.opponent.toLocaleString('en-US') : '—'}</Text>
      </View>
      {b.winner === 'mine' && <Text style={[styles.buzzedLabel, { color: Colors.success }]}>Closer! 🎯</Text>}
      {b.winner === 'tie' && <Text style={styles.buzzedLabel}>Dead heat — both score!</Text>}
    </View>
  );
}
```

- [x] **Step 2: Add number-line styles**

```ts
numberLine: {
  width: '100%', height: 8, borderRadius: 4, backgroundColor: Colors.border, marginVertical: 20,
},
numberLineMark: {
  position: 'absolute', top: -6, width: 4, height: 20, borderRadius: 2, marginLeft: -2,
},
```

- [x] **Step 3: Register in `lib/questionTypes/index.tsx`**

Import `EstimationPhase` + `EstimationReveal`, add to `UI`:
```tsx
estimation: { Play: EstimationPhase, Reveal: EstimationReveal },
```

- [x] **Step 4: Create the test-content file and seed helper**

`data/test-new-types.json` — start with 2 estimation entries (original wording, real numbers):
```json
[
  { "question": "About how many years did the Israelites wander in the wilderness after leaving Egypt?",
    "type": "estimation", "category": "Chronology", "difficulty": "easy",
    "reference": "General Bible chronology (cross-check: Insight, 'Wilderness')",
    "payload": { "value": 40, "unit": "years", "min": 0, "max": 120 } },
  { "question": "Roughly how many cubits long was Noah's ark, according to the Genesis account?",
    "type": "estimation", "category": "Places", "difficulty": "medium",
    "reference": "Genesis 6:15 (cross-check: Insight, 'Ark')",
    "payload": { "value": 300, "unit": "cubits", "min": 0, "max": 600 } }
]
```

`scripts/seed-new-types-room.js` — copy `scripts/seed-test-room.js`, change `ROOM_CODE` to `'NEWTYP'` and the test file to `data/test-new-types.json`. (Run `npx tsx scripts/import-questions.js data/test-new-types.json` once first to load the questions, per Task A2's tsx requirement.)

- [x] **Step 5: Typecheck + unit suite**

`npm run test && npx tsc --noEmit` → green.

- [x] **Step 6: Manual playtest — web + Expo Go**

```bash
npx tsx scripts/import-questions.js data/test-new-types.json
node scripts/seed-new-types-room.js playtester
npx expo start --web
```
Join `NEWTYP`, `Start (Solo Dev Test)`. On an estimation question: drag the slider (and tap the track) — the readout updates; "Lock In" → reveal shows the number line with your mark and the truth, points awarded (solo: you always "win" the pot, speed-scaled). Timer expiry with no lock-in → 0, still advances. Repeat on Expo Go (`npx expo start --offline`) and confirm the slider drags with touch.

- [x] **Step 7: Commit**

```bash
git add components/game/EstimationReveal.tsx components/game/gameStyles.ts lib/questionTypes/index.tsx scripts/seed-new-types-room.js
git commit -m "feat(questionTypes): wire estimation type end to end (reveal + registry + seed)"
```
(`data/` is gitignored — `data/test-new-types.json` is not committed.)

---

## PART C — Progressive clue

### Task C1: `progressive` descriptor logic

**Files:**
- Create: `lib/questionTypes/logic/progressive.ts`
- Create: `lib/questionTypes/logic/progressive.test.ts`
- Modify: `lib/questionTypes/logic/types.ts` (add `ProgressivePayload`)
- Modify: `lib/questionTypes/logic/index.ts` (register)

**Interfaces:**
- Produces:
  - `interface ProgressivePayload { clues: string[] }` (in `types.ts`)
  - `interface ProgressiveSubmission { chosen: string; cluesShownAtBuzz: number }`
  - `progressiveLogic: TypeLogic<ProgressivePayload, ProgressiveSubmission>` — `roundStyle: 'buzz'`, `timerSeconds: 30`.
  - `CLUE_LADDER: readonly number[]` = `[300, 220, 150, 90, 50]`.
  - `ladderPoints(cluesShown: number): number` — `CLUE_LADDER[min(cluesShown, CLUE_LADDER.length) - 1]`, and `0` for `cluesShown < 1`.
- Scoring:
  - `mine` (the buzzer) chose `question.answer` → `mine` gets `ladderPoints(mine.cluesShownAtBuzz)`, `opponent` `0`.
  - buzzer wrong, `opponent` present and chose `answer` → `opponent` gets `ladderPoints(opponent.cluesShownAtBuzz)`, `mine` `0`.
  - both wrong / no opponent shot → `0` / `0`.
- `isRoundComplete(state)`: `state.timedOut`, OR the buzzed player chose correctly, OR `state.opponentShotTaken`, OR `playerIds.length < 2` and the buzzed player has submitted (solo — no shot possible). Mirror `multipleChoiceLogic.isRoundComplete` (Plan 1) — same shape, `chosen` lives on the submission.
- `validatePayload(raw)`: `raw.clues` an array of 3–5 non-empty strings.

- [x] **Step 1: Write failing tests**

Create `lib/questionTypes/logic/progressive.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressiveLogic, ladderPoints, CLUE_LADDER } from './progressive';

const q = { payload: { clues: ['c1', 'c2', 'c3', 'c4'] }, options: ['A', 'B', 'C', 'D'], answer: 'B' };
const base = {
  roundStyle: 'buzz' as const, buzzedPlayerId: 'p1', opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: 'B',
};

test('ladderPoints follows the ladder and clamps past the end', () => {
  assert.equal(ladderPoints(1), 300);
  assert.equal(ladderPoints(3), 150);
  assert.equal(ladderPoints(9), CLUE_LADDER[CLUE_LADDER.length - 1]);
  assert.equal(ladderPoints(0), 0);
});

test('correct buzz on clue 2 scores 220', () => {
  const r = progressiveLogic.score({
    question: q, mine: { chosen: 'B', cluesShownAtBuzz: 2 }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 220);
  assert.equal(r.points.opponent, 0);
});

test('wrong buzz, opponent shot correct on clue 3 scores opponent 150', () => {
  const r = progressiveLogic.score({
    question: q,
    mine: { chosen: 'A', cluesShownAtBuzz: 1 },
    opponent: { chosen: 'B', cluesShownAtBuzz: 3 },
    mySecondsLeft: 12, opponentSecondsLeft: 8,
  });
  assert.equal(r.points.mine, 0);
  assert.equal(r.points.opponent, 150);
});

test('both wrong -> 0/0', () => {
  const r = progressiveLogic.score({
    question: q,
    mine: { chosen: 'A', cluesShownAtBuzz: 1 }, opponent: { chosen: 'C', cluesShownAtBuzz: 4 },
    mySecondsLeft: 12, opponentSecondsLeft: 8,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('isRoundComplete: correct buzz ends it', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, submissions: { p1: { submission: { chosen: 'B', cluesShownAtBuzz: 1 }, secondsLeft: 20 } },
  }), true);
});

test('isRoundComplete: wrong buzz, no shot yet, 2 players -> false', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, submissions: { p1: { submission: { chosen: 'A', cluesShownAtBuzz: 1 }, secondsLeft: 20 } },
  }), false);
});

test('isRoundComplete: solo wrong buzz ends it', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, playerIds: ['p1'],
    submissions: { p1: { submission: { chosen: 'A', cluesShownAtBuzz: 1 }, secondsLeft: 20 } },
  }), true);
});

test('isRoundComplete: nobody buzzed, timed out -> true', () => {
  assert.equal(progressiveLogic.isRoundComplete({
    ...base, buzzedPlayerId: null, timedOut: true, submissions: {},
  }), true);
});

test('validatePayload: 3-5 non-empty clue strings', () => {
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', 'b'] }).ok, false);
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', 'b', 'c', 'd', 'e', 'f'] }).ok, false);
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', '', 'c'] }).ok, false);
  assert.equal(progressiveLogic.validatePayload({ clues: ['a', 'b', 'c'] }).ok, true);
});
```

- [x] **Step 2: Run, verify failure.**

- [x] **Step 3: Add `ProgressivePayload` to `types.ts`**

```ts
export interface ProgressivePayload { clues: string[] }
```

- [x] **Step 4: Implement `progressive.ts`**

```ts
import type { TypeLogic, ProgressivePayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface ProgressiveSubmission { chosen: string; cluesShownAtBuzz: number }

export const CLUE_LADDER = [300, 220, 150, 90, 50] as const;

export function ladderPoints(cluesShown: number): number {
  if (cluesShown < 1) return 0;
  return CLUE_LADDER[Math.min(cluesShown, CLUE_LADDER.length) - 1];
}

function score(input: DescriptorScoreInput<ProgressivePayload, ProgressiveSubmission>) {
  const answer = input.question.answer ?? '';
  const mine = input.mine;
  const opp = input.opponent;
  if (mine && mine.chosen === answer) {
    return { points: { mine: ladderPoints(mine.cluesShownAtBuzz), opponent: 0 }, breakdown: { answer, winner: 'mine' as const, mine, opponent: opp } };
  }
  if (opp && opp.chosen === answer) {
    return { points: { mine: 0, opponent: ladderPoints(opp.cluesShownAtBuzz) }, breakdown: { answer, winner: 'opponent' as const, mine, opponent: opp } };
  }
  return { points: { mine: 0, opponent: 0 }, breakdown: { answer, winner: 'none' as const, mine, opponent: opp } };
}

function isRoundComplete(state: DescriptorRoundState<ProgressiveSubmission>): boolean {
  if (state.timedOut) return true;
  const buzzed = state.buzzedPlayerId ? state.submissions[state.buzzedPlayerId] : undefined;
  if (!buzzed) return false;
  if (buzzed.submission.chosen === state.correctAnswer) return true;
  return state.opponentShotTaken || state.playerIds.length < 2;
}

function validatePayload(raw: unknown) {
  const clues = (raw as { clues?: unknown })?.clues;
  if (!Array.isArray(clues) || clues.length < 3 || clues.length > 5) {
    return { ok: false as const, error: 'progressive payload.clues must be 3 to 5 strings' };
  }
  if (clues.some((c) => typeof c !== 'string' || !c.trim())) {
    return { ok: false as const, error: 'every progressive clue must be a non-empty string' };
  }
  return { ok: true as const, payload: { clues: clues.map((c) => (c as string).trim()) } };
}

export const progressiveLogic: TypeLogic<ProgressivePayload, ProgressiveSubmission> = {
  id: 'progressive', roundStyle: 'buzz', timerSeconds: 30, score, isRoundComplete, validatePayload,
};
```

- [x] **Step 5: Register in `index.ts`** — import, `export { progressiveLogic }`, `export type { ProgressiveSubmission }`, `TYPE_LOGICS` entry.

- [x] **Step 6: Run, verify pass. Step 7: Full suite + tsc. Step 8: Commit**

```bash
git add lib/questionTypes/logic/progressive.ts lib/questionTypes/logic/progressive.test.ts lib/questionTypes/logic/types.ts lib/questionTypes/logic/index.ts
git commit -m "feat(questionTypes): progressive-clue descriptor logic (point ladder)"
```

---

### Task C2: `ProgressivePhase` play UI

**Files:**
- Create: `components/game/ProgressivePhase.tsx`
- Modify: `components/game/gameStyles.ts` (clue-list styles)

**Interfaces:**
- Consumes: `ProgressivePayload` (C1), `PlayProps` (Plan 1).
- Produces: `ProgressivePhase` — derives how many clues are visible from `timeLeft`, snapshots that count when `buzzedByMe` flips true, submits `{ chosen, cluesShownAtBuzz }`.
- Clue cadence rule (spec §8): clue `k` (1-indexed) is visible once `elapsed >= (k - 1) * (30 / clues.length)`, where `elapsed = 30 - timeLeft` **while not buzzed**. Even spread; the trailing remainder after the last clue is "all shown, last chance". After a buzz the countdown restarts at 12, so the component must stop deriving from `timeLeft` and hold the snapshot.

- [x] **Step 1: Implement `ProgressivePhase.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { ProgressivePayload } from '../../lib/questionTypes/logic';

const RACE_SECONDS = 30;

export function ProgressivePhase({
  question, timeLeft, hasSubmitted, buzzedByMe, buzzedByOpponent, onBuzz, onSubmit,
}: PlayProps) {
  const clues = (question.payload as ProgressivePayload)?.clues ?? [];
  const cadence = RACE_SECONDS / Math.max(clues.length, 1);
  const hasSubmittedRef = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const snapshotRef = useRef<number | null>(null);

  const liveCluesShown = Math.min(
    clues.length,
    Math.max(1, 1 + Math.floor((RACE_SECONDS - timeLeft) / cadence)),
  );
  const isBuzzed = buzzedByMe || buzzedByOpponent;

  useEffect(() => {
    if (buzzedByMe && snapshotRef.current === null) snapshotRef.current = liveCluesShown;
  }, [buzzedByMe, liveCluesShown]);

  const cluesShown = snapshotRef.current ?? liveCluesShown;

  function pick(option: string) {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setSelected(option);
    onSubmit({ chosen: option, cluesShownAtBuzz: snapshotRef.current ?? liveCluesShown });
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      <View style={styles.clueList}>
        {clues.slice(0, cluesShown).map((c, i) => (
          <View key={i} style={styles.clueRow}>
            <Text style={styles.clueIndex}>{i + 1}</Text>
            <Text style={styles.clueText}>{c}</Text>
          </View>
        ))}
        {cluesShown < clues.length && !isBuzzed && (
          <Text style={styles.qRef}>next clue coming… ({cluesShown}/{clues.length})</Text>
        )}
      </View>

      {!isBuzzed && (
        <TouchableOpacity style={styles.buzzBtn} onPress={onBuzz}>
          <Text style={styles.buzzBtnText}>I Know It!</Text>
          <Text style={styles.buzzBtnSub}>Fewer clues = more points</Text>
        </TouchableOpacity>
      )}

      {isBuzzed && buzzedByMe && (
        Array.isArray(question.options) && question.options.length >= 2 ? (
          <View style={styles.optionsGrid}>
            {question.options.map((o, i) => (
              <TouchableOpacity key={i}
                style={[styles.optionBtn, selected === o && styles.optionBtnSelected]}
                onPress={() => pick(o)} disabled={selected !== null || hasSubmitted}>
                <Text style={styles.optionBtnText}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : <Text style={styles.buzzedLabel}>Question unavailable — waiting for the round to advance.</Text>
      )}

      {isBuzzed && buzzedByOpponent && (
        <View style={styles.waitBuzzed}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.waitBuzzedText}>Opponent buzzed — waiting for their answer…</Text>
        </View>
      )}
    </ScrollView>
  );
}
```

- [x] **Step 2: Add clue-list styles to `gameStyles.ts`**

```ts
clueList: { width: '100%', gap: 8 },
clueRow: {
  flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  backgroundColor: Colors.surface, borderRadius: 12, padding: 12, ...CardShadow,
},
clueIndex: { fontWeight: '800', color: Colors.accent, width: 18 },
clueText: { flex: 1, color: Colors.textPrimary, fontSize: 15, lineHeight: 21 },
```

- [x] **Step 3: Typecheck. Step 4: Commit**

```bash
git add components/game/ProgressivePhase.tsx components/game/gameStyles.ts
git commit -m "feat(visual): ProgressivePhase play UI (clue ladder + buzz)"
```

---

### Task C3: `ProgressiveReveal` + register + playtest

**Files:**
- Create: `components/game/ProgressiveReveal.tsx`
- Modify: `lib/questionTypes/index.tsx`
- Modify: `data/test-new-types.json` (add 2 progressive questions)

**Interfaces:**
- Consumes: `RevealProps`; the `breakdown` from `progressiveLogic.score` — `{ answer, winner, mine, opponent }` where `mine`/`opponent` are `ProgressiveSubmission | null`.

- [x] **Step 1: Implement `ProgressiveReveal.tsx`**

```tsx
import { View, Text } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

type Sub = { chosen: string; cluesShownAtBuzz: number } | null;
type B = { answer: string; winner: 'mine' | 'opponent' | 'none'; mine: Sub; opponent: Sub };

export function ProgressiveReveal({ question, breakdown }: RevealProps) {
  const b = breakdown as B | null;
  if (!b) return <Text style={styles.revealLabel}>No answer</Text>;
  return (
    <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
      <Text style={styles.revealLabel}>The answer:</Text>
      <Text style={styles.revealAnswer}>{b.answer}</Text>
      {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      <Text style={styles.qRef}>
        You: {b.mine ? `"${b.mine.chosen}" after ${b.mine.cluesShownAtBuzz} clue(s)` : 'no buzz'}
      </Text>
      <Text style={styles.qRef}>
        Them: {b.opponent ? `"${b.opponent.chosen}" after ${b.opponent.cluesShownAtBuzz} clue(s)` : 'no buzz'}
      </Text>
      {b.winner === 'mine' && <Text style={[styles.buzzedLabel, { color: Colors.success }]}>Got it!</Text>}
    </View>
  );
}
```

- [x] **Step 2: Register in `lib/questionTypes/index.tsx`** — `progressive: { Play: ProgressivePhase, Reveal: ProgressiveReveal }`.

- [x] **Step 3: Add 2 progressive questions to `data/test-new-types.json`**

```json
{ "question": "Which judge of Israel am I?", "type": "progressive",
  "category": "People", "difficulty": "medium", "answer": "Gideon",
  "options": ["Gideon", "Samson", "Ehud", "Deborah"],
  "reference": "Judges 6-8 (cross-check: Insight, 'Gideon')",
  "payload": { "clues": [
    "An angel found me threshing wheat in a winepress to hide it from raiders.",
    "I asked for a sign with a wool fleece and morning dew — twice.",
    "I cut my army from 32,000 down to 300 men.",
    "We beat the Midianites with trumpets, jars, and torches." ] } },
{ "question": "Which city am I?", "type": "progressive",
  "category": "Places", "difficulty": "medium", "answer": "Jericho",
  "options": ["Jericho", "Ai", "Hebron", "Gibeon"],
  "reference": "Joshua 6 (cross-check: Insight, 'Jericho')",
  "payload": { "clues": [
    "I was the first city taken west of the Jordan.",
    "My walls were famous, and I sat near palm trees and springs.",
    "Israel marched around me once a day for six days.",
    "On the seventh day they circled seven times, shouted, and my walls fell." ] } }
```

- [x] **Step 4: Import, typecheck, unit suite** — `npx tsx scripts/import-questions.js data/test-new-types.json && npm run test && npx tsc --noEmit`.

- [x] **Step 5: Manual playtest — web + Expo Go**

`node scripts/seed-new-types-room.js playtester`, join `NEWTYP`, start. On a progressive question: clues appear one at a time on the shared clock; buzz early → fewer clues, more points; pick correct → reveal shows the answer + how many clues you used. Buzz then pick wrong (solo) → resolves immediately, 0 points, no hang. Let the timer expire without buzzing → 0, advances.

- [x] **Step 6: Commit**

```bash
git add components/game/ProgressiveReveal.tsx lib/questionTypes/index.tsx
git commit -m "feat(questionTypes): wire progressive-clue type end to end"
```

---

## PART D — Swipe-categorize

### Task D1: `swipe` descriptor logic

**Files:**
- Create: `lib/questionTypes/logic/swipe.ts`
- Create: `lib/questionTypes/logic/swipe.test.ts`
- Modify: `lib/questionTypes/logic/types.ts` (add `SwipePayload`)
- Modify: `lib/questionTypes/logic/index.ts` (register)

**Interfaces:**
- Produces:
  - `interface SwipePayload { categoryLeft: string; categoryRight: string; cards: { text: string; side: 'left' | 'right' }[] }`
  - `interface SwipeSubmission { swipes: Record<number, 'left' | 'right'> }` — card index → chosen side; unswiped indices absent.
  - `swipeLogic: TypeLogic<SwipePayload, SwipeSubmission>` — `roundStyle: 'concurrent'`, `timerSeconds: 20`.
- Scoring (graded partial credit, per player independently):
  - `correct(sub) = count of i where sub.swipes[i] === cards[i].side` (unswiped counts as wrong).
  - `round((correct / cards.length) * 300 * speedMult)`, `speedMult = min(1, max(0.5, secondsLeft / 20))`.
  - A player with no submission scores 0.
- `isRoundComplete(state)`: `state.timedOut`, OR every id in `playerIds` has a submission.
- `validatePayload(raw)`: `categoryLeft`/`categoryRight` non-empty strings **and distinct**; `cards` an array of 4–8 `{ text: non-empty string, side: 'left'|'right' }`; at least one card on each side.

- [x] **Step 1: Write failing tests**

Create `lib/questionTypes/logic/swipe.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeLogic } from './swipe';

const payload = { categoryLeft: 'OT', categoryRight: 'NT', cards: [
  { text: 'Genesis', side: 'left' }, { text: 'Matthew', side: 'right' },
  { text: 'Exodus', side: 'left' }, { text: 'Mark', side: 'right' },
]};
const concurrent = {
  roundStyle: 'concurrent' as const, buzzedPlayerId: null, opponentShotTaken: false,
  playerIds: ['p1', 'p2'], timedOut: false, correctAnswer: null,
};

test('all correct + fast = 300; graded per player', () => {
  const r = swipeLogic.score({
    question: { payload, options: null, answer: null },
    mine: { swipes: { 0: 'left', 1: 'right', 2: 'left', 3: 'right' } },   // 4/4
    opponent: { swipes: { 0: 'left', 1: 'left', 2: 'left', 3: 'right' } }, // 3/4
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 225);
});

test('unswiped cards count as wrong', () => {
  const r = swipeLogic.score({
    question: { payload, options: null, answer: null },
    mine: { swipes: { 0: 'left', 1: 'right' } }, // 2/4
    opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 150);
  assert.equal(r.points.opponent, 0);
});

test('slow answer floored at 0.5x', () => {
  const r = swipeLogic.score({
    question: { payload, options: null, answer: null },
    mine: { swipes: { 0: 'left', 1: 'right', 2: 'left', 3: 'right' } },
    opponent: null, mySecondsLeft: 0, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 150);
});

test('isRoundComplete: both submitted / timeout', () => {
  assert.equal(swipeLogic.isRoundComplete({
    ...concurrent,
    submissions: { p1: { submission: { swipes: {} }, secondsLeft: 5 }, p2: { submission: { swipes: {} }, secondsLeft: 3 } },
  }), true);
  assert.equal(swipeLogic.isRoundComplete({ ...concurrent, timedOut: true, submissions: {} }), true);
  assert.equal(swipeLogic.isRoundComplete({
    ...concurrent, submissions: { p1: { submission: { swipes: {} }, secondsLeft: 5 } },
  }), false);
});

test('validatePayload rejects identical categories and out-of-range card counts', () => {
  assert.equal(swipeLogic.validatePayload({ categoryLeft: 'X', categoryRight: 'X', cards: payload.cards }).ok, false);
  assert.equal(swipeLogic.validatePayload({ categoryLeft: 'A', categoryRight: 'B', cards: payload.cards.slice(0, 3) }).ok, false);
  assert.equal(swipeLogic.validatePayload({ categoryLeft: 'A', categoryRight: 'B',
    cards: [{ text: 'x', side: 'left' }, { text: 'y', side: 'left' }, { text: 'z', side: 'left' }, { text: 'w', side: 'left' }] }).ok, false); // no right-side card
});

test('validatePayload accepts a clean payload', () => {
  assert.equal(swipeLogic.validatePayload(payload).ok, true);
});
```

- [x] **Step 2: Run, verify failure.**

- [x] **Step 3: Add `SwipePayload` to `types.ts`**

```ts
export interface SwipePayload {
  categoryLeft: string;
  categoryRight: string;
  cards: { text: string; side: 'left' | 'right' }[];
}
```

- [x] **Step 4: Implement `swipe.ts`**

```ts
import type { TypeLogic, SwipePayload, DescriptorScoreInput, DescriptorRoundState } from './types';

export interface SwipeSubmission { swipes: Record<number, 'left' | 'right'> }

function speedMult(s: number | null): number {
  return Math.min(1, Math.max(0.5, (s ?? 0) / 20));
}

function scoreOne(sub: SwipeSubmission | null, cards: SwipePayload['cards'], s: number | null): number {
  if (!sub || s == null) return 0;
  const correct = cards.reduce((n, c, i) => n + (sub.swipes[i] === c.side ? 1 : 0), 0);
  return Math.round((correct / cards.length) * 300 * speedMult(s));
}

function score(input: DescriptorScoreInput<SwipePayload, SwipeSubmission>) {
  const cards = input.question.payload?.cards ?? [];
  return {
    points: {
      mine: scoreOne(input.mine, cards, input.mySecondsLeft),
      opponent: scoreOne(input.opponent, cards, input.opponentSecondsLeft),
    },
    breakdown: {
      cards,
      mineSwipes: input.mine?.swipes ?? {},
      opponentSwipes: input.opponent?.swipes ?? {},
    },
  };
}

function isRoundComplete(state: DescriptorRoundState<SwipeSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const p = raw as Partial<SwipePayload> | null | undefined;
  if (!p || typeof p !== 'object') return { ok: false as const, error: 'swipe needs a payload object' };
  if (typeof p.categoryLeft !== 'string' || !p.categoryLeft.trim() ||
      typeof p.categoryRight !== 'string' || !p.categoryRight.trim()) {
    return { ok: false as const, error: 'swipe needs non-empty categoryLeft and categoryRight' };
  }
  if (p.categoryLeft.trim() === p.categoryRight.trim()) {
    return { ok: false as const, error: 'swipe categories must be different' };
  }
  const cards = p.cards;
  if (!Array.isArray(cards) || cards.length < 4 || cards.length > 8) {
    return { ok: false as const, error: 'swipe needs 4 to 8 cards' };
  }
  if (cards.some((c) => !c || typeof c.text !== 'string' || !c.text.trim() || (c.side !== 'left' && c.side !== 'right'))) {
    return { ok: false as const, error: 'every swipe card needs text and side "left" or "right"' };
  }
  if (!cards.some((c) => c.side === 'left') || !cards.some((c) => c.side === 'right')) {
    return { ok: false as const, error: 'swipe needs at least one card on each side' };
  }
  return { ok: true as const, payload: {
    categoryLeft: p.categoryLeft.trim(), categoryRight: p.categoryRight.trim(),
    cards: cards.map((c) => ({ text: c.text.trim(), side: c.side })),
  } };
}

export const swipeLogic: TypeLogic<SwipePayload, SwipeSubmission> = {
  id: 'swipe', roundStyle: 'concurrent', timerSeconds: 20, score, isRoundComplete, validatePayload,
};
```

- [x] **Step 5: Register in `index.ts`. Step 6: Run pass. Step 7: Full suite + tsc. Step 8: Commit**

```bash
git add lib/questionTypes/logic/swipe.ts lib/questionTypes/logic/swipe.test.ts lib/questionTypes/logic/types.ts lib/questionTypes/logic/index.ts
git commit -m "feat(questionTypes): swipe-categorize descriptor logic (graded credit)"
```

---

### Task D2: `SwipePhase` card-stack play UI

**Files:**
- Create: `components/game/SwipePhase.tsx`
- Modify: `components/game/gameStyles.ts` (card styles)

**Interfaces:**
- Consumes: `SwipePayload` (D1), `PlayProps` (Plan 1), `seededShuffle` (`lib/gameLogic`).
- Produces: `SwipePhase` — shuffles cards with `seededShuffle(cards, questionId)` (both players see the same order), shows the top card, `Gesture.Pan` to fling left/right past a threshold, plus explicit L/R buttons. Records `swipes[originalIndex] = side` (index into the **shuffled** array is fine as long as `score` uses the same array — but `score` uses `payload.cards` order, so the component must map back: store `swipes` keyed by the card's index in `payload.cards`). Submits `{ swipes }` once — when the last card is cleared or on unmount/timeout (guard with `hasSubmittedRef`). The host also scores on timeout via `isRoundComplete`, so a player who never finishes still gets partial credit for the cards they did swipe — **the component must submit whatever it has when `hasSubmitted` becomes true or the timer reaches 0**.

- [x] **Step 1: Implement `SwipePhase.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { seededShuffle } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';
import { TimerRing } from './TimerRing';
import type { PlayProps } from '../../lib/questionTypes/uiTypes';
import type { SwipePayload } from '../../lib/questionTypes/logic';

export function SwipePhase({ question, questionId, timeLeft, hasSubmitted, onSubmit }: PlayProps) {
  const p = question.payload as SwipePayload;
  // Keep the original index alongside each card so swipes map back to payload.cards order.
  const deck = useRef(seededShuffle(p.cards.map((c, i) => ({ ...c, orig: i })), questionId)).current;

  const [pos, setPos] = useState(0);
  const swipesRef = useRef<Record<number, 'left' | 'right'>>({});
  const submittedRef = useRef(false);
  const x = useSharedValue(0);

  function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmit({ swipes: swipesRef.current });
  }

  function commit(side: 'left' | 'right') {
    const card = deck[pos];
    if (!card) return;
    swipesRef.current = { ...swipesRef.current, [card.orig]: side };
    x.value = 0;
    const next = pos + 1;
    setPos(next);
    if (next >= deck.length) submit();
  }

  useEffect(() => {
    if (hasSubmitted || timeLeft <= 0) submit();
  }, [hasSubmitted, timeLeft]);

  const pan = Gesture.Pan()
    .onChange((e) => { x.value += e.changeX; })
    .onEnd(() => {
      if (x.value > 90) runOnJS(commit)('right');
      else if (x.value < -90) runOnJS(commit)('left');
      else x.value = withSpring(0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 20}deg` }],
  }));

  const card = deck[pos];
  const done = pos >= deck.length;

  return (
    <View style={styles.phaseContainer}>
      <TimerRing timeLeft={timeLeft} />
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>
      <View style={styles.swipeCatsRow}>
        <Text style={styles.swipeCatLeft}>◀ {p.categoryLeft}</Text>
        <Text style={styles.swipeCatRight}>{p.categoryRight} ▶</Text>
      </View>

      <View style={styles.swipeStage}>
        {done ? (
          <Text style={styles.submittedBanner}>All sorted — waiting for the other player…</Text>
        ) : (
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.swipeCard, cardStyle]}>
              <Text style={styles.swipeCardText}>{card.text}</Text>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {!done && (
        <View style={styles.swipeBtnRow}>
          <Text onPress={() => commit('left')} style={styles.swipeBtn}>◀ {p.categoryLeft}</Text>
          <Text onPress={() => commit('right')} style={styles.swipeBtn}>{p.categoryRight} ▶</Text>
        </View>
      )}
      <Text style={styles.qRef}>{Math.min(pos + (done ? 0 : 1), deck.length)}/{deck.length}</Text>
    </View>
  );
}
```

- [x] **Step 2: Add swipe styles to `gameStyles.ts`**

```ts
swipeCatsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
swipeCatLeft: { color: Colors.primary, fontWeight: '800' },
swipeCatRight: { color: Colors.danger, fontWeight: '800' },
swipeStage: { height: 220, width: '100%', alignItems: 'center', justifyContent: 'center' },
swipeCard: {
  width: 240, height: 180, borderRadius: 20, backgroundColor: Colors.surface,
  alignItems: 'center', justifyContent: 'center', padding: 20, ...CardShadow,
},
swipeCardText: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
swipeBtnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 8 },
swipeBtn: {
  color: Colors.white, fontWeight: '800', fontSize: 14, overflow: 'hidden',
  backgroundColor: Colors.accent, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16,
},
```

- [x] **Step 3: Typecheck. Step 4: Commit**

```bash
git add components/game/SwipePhase.tsx components/game/gameStyles.ts
git commit -m "feat(visual): SwipePhase card-stack play UI"
```

---

### Task D3: `SwipeReveal` + register + playtest

**Files:**
- Create: `components/game/SwipeReveal.tsx`
- Modify: `lib/questionTypes/index.tsx`
- Modify: `data/test-new-types.json` (add 2 swipe questions)

**Interfaces:**
- Consumes: `RevealProps`; `breakdown` from `swipeLogic.score` — `{ cards, mineSwipes, opponentSwipes }`.

- [x] **Step 1: Implement `SwipeReveal.tsx`**

```tsx
import { View, Text } from 'react-native';
import { gameStyles as styles } from './gameStyles';
import type { RevealProps } from '../../lib/questionTypes/uiTypes';

type Card = { text: string; side: 'left' | 'right' };
type B = { cards: Card[]; mineSwipes: Record<number, 'left' | 'right'>; opponentSwipes: Record<number, 'left' | 'right'> };

export function SwipeReveal({ breakdown }: RevealProps) {
  const b = breakdown as B | null;
  if (!b) return <Text style={styles.revealLabel}>No answer</Text>;
  return (
    <View style={{ width: '100%', gap: 6 }}>
      {b.cards.map((c, i) => {
        const mine = b.mineSwipes[i];
        const ok = mine === c.side;
        return (
          <View key={i} style={styles.matchItem}>
            <Text style={styles.matchItemText}>
              {ok ? '✓' : '✗'} {c.text} — {c.side === 'left' ? 'LEFT' : 'RIGHT'}
              {mine ? '' : '  (you skipped)'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
```

- [x] **Step 2: Register** — `swipe: { Play: SwipePhase, Reveal: SwipeReveal }` in `lib/questionTypes/index.tsx`.

- [x] **Step 3: Add 2 swipe questions to `data/test-new-types.json`**

```json
{ "question": "Old Testament or New Testament book?", "type": "swipe",
  "category": "Scriptures", "difficulty": "easy",
  "reference": "Bible book order (cross-check: Insight, 'Bible')",
  "payload": { "categoryLeft": "Old Testament", "categoryRight": "New Testament", "cards": [
    { "text": "Habakkuk", "side": "left" }, { "text": "Philemon", "side": "right" },
    { "text": "Nahum", "side": "left" }, { "text": "Jude", "side": "right" },
    { "text": "Haggai", "side": "left" }, { "text": "Titus", "side": "right" } ] } },
{ "question": "Did this person walk with Jesus during his ministry, or live centuries earlier?", "type": "swipe",
  "category": "People", "difficulty": "medium",
  "reference": "Gospels vs Hebrew Scriptures (cross-check: Insight)",
  "payload": { "categoryLeft": "Earlier", "categoryRight": "With Jesus", "cards": [
    { "text": "Nathanael", "side": "right" }, { "text": "Boaz", "side": "left" },
    { "text": "Zacchaeus", "side": "right" }, { "text": "Gideon", "side": "left" },
    { "text": "Lazarus of Bethany", "side": "right" }, { "text": "Samuel", "side": "left" } ] } }
```

- [x] **Step 4: Import, typecheck, unit suite.**

- [x] **Step 5: Manual playtest — web + Expo Go**

Join `NEWTYP`, start. On a swipe question: the card stack shows one card at a time; swipe (mouse-drag on web) past the threshold flings it, L/R buttons also work; clearing all cards ends early; timer expiry submits what you have. Reveal lists every card with ✓/✗ and skips. Score is graded partial credit. Confirm touch-drag on Expo Go.

- [x] **Step 6: Commit**

```bash
git add components/game/SwipeReveal.tsx lib/questionTypes/index.tsx
git commit -m "feat(questionTypes): wire swipe-categorize type end to end"
```

---

## PART E — ResultsPhase redesign

### Task E1: `roundHistory` in `useGameRound`

**Files:**
- Modify: `app/game/useGameRound.ts`
- Modify: `lib/gameTypes.ts` (add `RoundHistoryEntry`)

**Interfaces:**
- Produces:
  - `interface RoundHistoryEntry { questionIndex: number; points: Record<string, number>; correctAnswer: string | null }` (in `gameTypes.ts`)
  - `useGameRound` return gains `roundHistory: RoundHistoryEntry[]` — one entry per `round_scored` event, in order, reset on `game_start`.

- [x] **Step 1: Add the type to `lib/gameTypes.ts`**

```ts
export interface RoundHistoryEntry {
  questionIndex: number;
  points: Record<string, number>;
  correctAnswer: string | null;
}
```

- [x] **Step 2: Accumulate it in `useGameRound.ts`**

Add `const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);` (import the type). In the `round_scored` case, after `setRoundScore(...)`:
```ts
setRoundHistory((prev) => [
  ...prev,
  {
    questionIndex: /* current index at scoring time */ questionIndexAtScore,
    points: (event.payload as RoundScoredPayload).points,
    correctAnswer: (event.payload as RoundScoredPayload).correctAnswer,
  },
]);
```
`round_scored` does not carry the question index — add it. In `app/game/scoreRound.ts` `resolveAndScoreRound`, include `questionIndex` in the params and the event payload:
```ts
payload: { points: pointsByPlayer, breakdown: result.breakdown, correctAnswer: question.answer, questionIndex },
```
and pass `questionIndex` from the host effect in `[roomId].tsx`. Then in the hook read `event.payload.questionIndex`.
In `game_start`'s `resetForNewQuestion` path (and on `game_start` specifically), `setRoundHistory([])`.

- [x] **Step 3: Expose it** — add `roundHistory` to the `GameRound` interface and the returned object.

- [x] **Step 4: Typecheck + unit suite** — `npm run test && npx tsc --noEmit`.

- [x] **Step 5: Commit**

```bash
git add app/game/useGameRound.ts app/game/scoreRound.ts app/game/[roomId].tsx lib/gameTypes.ts
git commit -m "feat(game): track per-round score history in useGameRound"
```

---

### Task E2: Redesign `ResultsPhase`

**Files:**
- Modify: `components/game/ResultsPhase.tsx`
- Modify: `app/game/[roomId].tsx` (pass `roundHistory`, `questionCount`)
- Modify: `components/game/gameStyles.ts` (results styles)

**Interfaces:**
- Consumes: `PlayerRow[]`, `myUserId`, `onLeave`, `roundHistory: RoundHistoryEntry[]`, `questionCount: number`.
- Produces: a redesigned results screen — winner banner ("You win!" / "You lost" / "Tie!"), `<Mascot mood={won ? 'cheer' : 'sad'} />`, each player's final score as an animated bar (width ∝ score / maxScore), and a compact per-question strip showing which questions you scored on.

- [x] **Step 1: Rewrite `ResultsPhase.tsx`**

```tsx
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { AVATARS } from '../../lib/gameLogic';
import type { PlayerRow, RoundHistoryEntry } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';
import { Mascot } from '../Mascot';

function Bar({ frac, color }: { frac: number; color: string }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withTiming(frac, { duration: 700 }); }, [frac]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <View style={styles.resultBarTrack}><Animated.View style={[styles.resultBarFill, { backgroundColor: color }, style]} /></View>;
}

export function ResultsPhase({
  players, myUserId, onLeave, roundHistory, questionCount,
}: {
  players: PlayerRow[]; myUserId: string; onLeave: () => void;
  roundHistory: RoundHistoryEntry[]; questionCount: number;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const me = players.find((p) => p.user_id === myUserId);
  const top = sorted[0]?.score ?? 0;
  const iWon = me != null && me.score === top && (sorted.length < 2 || sorted[0].score !== sorted[1].score);
  const tie = sorted.length >= 2 && sorted[0].score === sorted[1].score;
  const maxScore = Math.max(1, top);

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <Mascot mood={iWon ? 'cheer' : tie ? 'idle' : 'sad'} size={96} />
      <Text style={styles.resultsTitle}>{tie ? 'Tie!' : iWon ? 'You win!' : 'Good game'}</Text>

      {sorted.map((p) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        const isMe = p.user_id === myUserId;
        return (
          <View key={p.id} style={[styles.resultRow, isMe && { borderColor: Colors.accent }]}>
            <View style={[styles.miniAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={styles.miniAvatarEmoji}>{av.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.resultName, isMe && { color: Colors.accent }]}>{p.profiles?.username}</Text>
              <Bar frac={p.score / maxScore} color={isMe ? Colors.accent : Colors.textMuted} />
            </View>
            <Text style={styles.resultScore}>{p.score}</Text>
          </View>
        );
      })}

      {roundHistory.length > 0 && (
        <View style={styles.resultStrip}>
          {Array.from({ length: questionCount }, (_, i) => {
            const entry = roundHistory.find((e) => e.questionIndex === i);
            const mine = entry?.points[myUserId] ?? 0;
            return <View key={i} style={[styles.resultPip, { backgroundColor: mine > 0 ? Colors.success : Colors.border }]} />;
          })}
        </View>
      )}

      <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
        <Text style={styles.leaveBtnText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

- [x] **Step 2: Add results styles**

```ts
resultBarTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
resultBarFill: { height: 8, borderRadius: 4 },
resultStrip: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginVertical: 8 },
resultPip: { width: 14, height: 14, borderRadius: 4 },
```

- [x] **Step 3: Pass the new props from `[roomId].tsx`**

```tsx
{phase === 'results' && (
  <ResultsPhase
    players={players}
    myUserId={profile?.id ?? ''}
    onLeave={() => router.replace('/(tabs)/home')}
    roundHistory={round.roundHistory}
    questionCount={questionIds.length}
  />
)}
```

- [x] **Step 4: Typecheck + unit suite.**

- [x] **Step 5: Manual playtest — web + Expo Go**

Play any short game to the end. Results screen: mascot reacts to win/loss, score bars animate in, the pip strip shows which questions you scored on, "Back to Home" works.

- [x] **Step 6: Commit**

```bash
git add components/game/ResultsPhase.tsx components/game/gameStyles.ts app/game/[roomId].tsx
git commit -m "feat(visual): redesign ResultsPhase (winner banner, mascot, animated bars, round strip)"
```

---

## PART F — End-to-end verification

### Task F1: Full new-types playthrough

**Files:** none — verification only.

- [x] **Step 1: Fresh full suite + typecheck**

```bash
npm run test
npx tsc --noEmit
npx expo-doctor
```
Expected: all green; tsc baseline-only; doctor 21/21.

- [x] **Step 2: `check-schema.js`**

```bash
node scripts/check-schema.js
```
Expected: `OK — no free_text rows`, `OK — type=swipe accepted`, no failures.

- [x] **Step 3: Import the test content, seed the room**

```bash
npx tsx scripts/import-questions.js data/test-new-types.json
node scripts/seed-new-types-room.js playtester
```

- [x] **Step 4: Web playthrough — all six test questions**

`npx expo start --web`, join `NEWTYP`, `Start (Solo Dev Test)`, play through all 6:
- estimation ×2: slider drag + track tap, lock in, number-line reveal, timeout path
- progressive ×2: clue cadence, early buzz = more points, correct + wrong paths, timeout
- swipe ×2: card fling + L/R buttons, early finish, timeout submits partial
- results screen at the end
- zero console errors throughout

- [x] **Step 5: Expo Go playthrough**

`npx expo start --offline`, repeat Step 4 on a phone. Specifically confirm the **slider** and the **card fling** respond to touch, and the SDK-version banner is absent.

- [x] **Step 6: Regression — Plan 1 types still play**

In the same session, one MC race game + the `TESTTY` ordering/matching room (`node scripts/seed-test-room.js playtester`) — buzz/answer/reveal, arrows, tap-pair, scoring, results, all still working.

- [x] **Step 7: Commit the verification note**

```bash
git commit --allow-empty -m "test(v3): full new-types + regression playthrough verified (web + Expo Go)"
```

---

## Self-Review

**1. Spec coverage:**

| Spec item | Task |
|---|---|
| §2 constraint change for the 3 types | A1 |
| §4.1 importer delegates to `validatePayload` | A2 |
| §2.1 estimation: slider, winner-takes-pot, log axis, tie | B1, B2, B3 |
| §2.1 estimation reveal: number line, "Closer!" badge | B3 |
| §2.2 progressive: clue cadence, `[300,220,150,90,50]` ladder, MC-after-buzz | C1, C2 |
| §2.2 progressive: wrong buzz → opponent shot at current clue level | C1 (`score` uses `opponent.cluesShownAtBuzz`); Plan 1 host emits `opponent_shot` |
| §2.2 progressive reveal: answer + each player's clue level | C3 |
| §2.3 swipe: 4–8 cards, `Gesture.Pan` + L/R fallback, `seededShuffle`, graded credit, timeout = partial | D1, D2 |
| §2.3 swipe reveal: per-card ✓/✗ + skips | D3 |
| §2.4 Play/Reveal prop shape | reused from Plan 1 (`uiTypes.ts`) unchanged |
| §3.4 `ResultsPhase` redesign: winner banner, mascot, animated bars, summary | E1, E2 |
| §4.2 `data/test-new-types.json` + seed script | B3, C3, D3, F1 |
| §8 progressive cadence rule when clues don't divide evenly | C2 (even fractional spread, `elapsed >= (k-1)*(30/clues.length)`) |
| §7 execution order steps 4–7 | Parts B, C, D, E |

**Gaps / deferred (intentional):** content authoring beyond the 6 test questions (spec §4.3 — parallel batched loop, not this plan); tap-the-map and Wits & Wagers (spec §2 says v3 Spec B); the 2-player (not solo) verification of estimation/swipe/progressive requires two clients — Task F1 covers solo + the logic is unit-tested for the 2-player branches.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Task A2 Step 4's ordering caveat (new-type import tests need B1/C1/D1 merged first) is explicit with a stated resolution, not a placeholder.

**3. Type consistency:** `EstimationPayload`/`EstimationSubmission`, `ProgressivePayload`/`ProgressiveSubmission` (`{chosen, cluesShownAtBuzz}`), `SwipePayload`/`SwipeSubmission` (`{swipes: Record<number,'left'|'right'>}`) are defined in B1/C1/D1 and consumed unchanged in B2/B3, C2/C3, D2/D3. `RoundHistoryEntry` defined in E1, consumed in E2. `ladderPoints` / `CLUE_LADDER` defined in C1, used in C1 tests only. `logMap`/`logUnmap` defined in B1, consumed in B2 (`SliderInput`) and B3 (`EstimationReveal`). The `breakdown` shapes each `score()` returns are matched field-for-field by their Reveal component's local `B` type.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-question-types-v3-new-types.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks. Parts B/C/D are three near-identical shapes, which suits a per-task subagent well.

**2. Inline Execution** — tasks run in this session via `superpowers:executing-plans`, batched with checkpoints.

Which approach?
