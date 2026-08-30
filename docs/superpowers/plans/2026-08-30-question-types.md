# Question Type System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pluggable question-type system to InsightTrivia — multiple choice, ordering, and matching — alongside the existing free-text buzz-in flow, so the game can render the right UI and scoring for whatever type a randomly-drawn question happens to be.

**Architecture:** Extend the `questions` table with `type`/`options`/`payload` columns (additive, no existing-row migration needed). Add a small type registry (`lib/questionTypes.ts`) that tells the game screen whether a type is a buzz-in "race" or a "simultaneous" arrange-and-submit interaction. Split the monolithic `app/game/[roomId].tsx` phase components out into `components/game/*.tsx` first (pure refactor, no behavior change) so the two new phase components (`OrderingPhase`, `MatchingPhase`) have a home that doesn't make the file unmanageable. New interactions use tap-based reordering/pairing (no drag gesture library — none is installed, and YAGNI doesn't justify adding one for v1).

**Tech Stack:** Expo Router + React Native + TypeScript, Supabase (Postgres + Realtime), Zustand. Test runner: Node's built-in `node:test`, run via `tsx` for `.ts` files (new dev dependency — the project currently has zero test infrastructure).

**Spec:** `docs/superpowers/specs/2026-08-30-question-types-design.md`

## Global Constraints

- `options` always has exactly 4 entries and always includes the correct answer (from the spec's existing content convention — already true of all 302 questions in `data/`).
- `type` defaults to `'free_text'` — every existing question and every existing JSON import file must keep working unchanged.
- No new runtime npm dependencies for game UI (no gesture/drag libraries) — tap-based interactions only, per the spec's YAGNI note.
- Follow the existing code style: function components, `StyleSheet.create`, no class components, no external state library beyond the existing Zustand stores.
- The Supabase schema change must be applied manually by the user via the Supabase SQL editor (same as every other change in `supabase/schema.sql` — this repo has no migration runner). Tasks that depend on the column existing include a manual checkpoint for this.

---

## File Structure

New files:
- `lib/gameTypes.ts` — shared TS interfaces (`PlayerRow`, `Question`, `MatchPair`) currently duplicated/local to `app/game/[roomId].tsx`.
- `lib/questionTypes.ts` — the type registry (`getInteractionMode`).
- `lib/gameLogic.test.ts`, `lib/questionTypes.test.ts` — unit tests (new; project has none today).
- `scripts/import-questions.test.js` — unit tests for the extended `validate()`.
- `components/game/gameStyles.ts` — the existing giant `styles` object from `app/game/[roomId].tsx`, moved verbatim plus new styles for the two new phases.
- `components/game/WaitingPhase.tsx`, `QuestionPhase.tsx`, `RevealPhase.tsx`, `ResultsPhase.tsx` — extracted verbatim (behavior-preserving) from the current inline functions.
- `components/game/OrderingPhase.tsx` — new.
- `components/game/MatchingPhase.tsx` — new.

Modified files:
- `supabase/schema.sql` — add `type`/`options`/`payload` columns.
- `lib/gameLogic.ts` — add `calcPartialCreditPoints`, `checkOrderingCorrectness`, `checkMatchingCorrectness`.
- `scripts/import-questions.js` — extend `validate()`.
- `app/game/[roomId].tsx` — becomes the orchestrator only: state, realtime subscriptions, event handlers, phase dispatch. Imports the phase components instead of defining them inline.
- `package.json` — add `tsx` dev dependency and `test`/`test:unit`/`test:import` scripts.

---

### Task 1: Database schema — add type/options/payload columns

**Files:**
- Modify: `supabase/schema.sql` (append after the existing `questions` table block, currently ending around the `create policy "Admin insert"` line)

**Interfaces:**
- Produces: `questions.type` (text, default `'free_text'`), `questions.options` (text[], nullable), `questions.payload` (jsonb, nullable) — every later task that queries or writes questions relies on these columns existing.

- [ ] **Step 1: Add the migration SQL**

Add this block to `supabase/schema.sql` immediately after the existing `questions` table's policies (after the line `create policy "Admin insert" on questions for insert with check (true);`):

```sql
-- ── QUESTION TYPES (added for multiple choice / ordering / matching) ──
alter table questions
  add column if not exists type text not null default 'free_text'
    check (type in ('free_text', 'multiple_choice', 'ordering', 'matching', 'fill_blank')),
  add column if not exists options text[],
  add column if not exists payload jsonb;
```

`if not exists` makes this safe to paste into the SQL editor multiple times without erroring on a re-run.

- [ ] **Step 2: Apply it manually**

This cannot be run from the agent — it must be applied by the human operator. Tell the user: "Open the Supabase SQL editor for this project and run the new block at the bottom of `supabase/schema.sql` (the `QUESTION TYPES` section)." Wait for confirmation before proceeding to any task that depends on these columns (Tasks 5, 7, 8, 9).

- [ ] **Step 3: Verify the columns exist**

Run this read-only check (uses the existing `.env` credentials, same pattern as `scripts/import-questions.js`):

```bash
node -e "
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*\$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['\"]|['\"]\$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('questions').select('type, options, payload').limit(1).then(({ data, error }) => {
  if (error) { console.error('FAIL:', error.message); process.exit(1); }
  console.log('PASS: columns exist, sample row:', data);
});
"
```
Expected: `PASS: columns exist, sample row: [ { type: 'free_text', options: null, payload: null } ]` (or similar — options will be non-null for previously-imported multiple_choice rows if any exist yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add type/options/payload columns to questions table"
```

---

### Task 2: Test runner setup

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `npm test` (runs both unit suites), `npm run test:unit` (lib/*.test.ts via tsx), `npm run test:import` (scripts/*.test.js via node's native runner) — every later task with a "Write the failing test" step relies on these commands existing.

- [ ] **Step 1: Add tsx as a dev dependency and add test scripts**

Edit `package.json`'s `devDependencies` and `scripts`:

```json
  "devDependencies": {
    "@types/react": "~19.1.10",
    "tsx": "^4.19.2",
    "typescript": "~5.9.2"
  },
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test:unit": "tsx --test lib/gameLogic.test.ts lib/questionTypes.test.ts",
    "test:import": "node --test scripts/import-questions.test.js",
    "test": "npm run test:unit && npm run test:import"
  },
```

- [ ] **Step 2: Install**

```bash
npm install
```
Expected: `tsx` added to `node_modules`, `package-lock.json` updated.

- [ ] **Step 3: Verify the test commands run (with no test files yet, this should report "no tests found" or similar, not a crash)**

```bash
npm run test:unit
```
Expected: tsx runs, reports 0 tests found (the two test files don't exist yet — that's fine, this step just confirms the tool itself works). If it errors with "cannot find module tsx", re-run `npm install`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add tsx and test scripts for unit testing lib/ and scripts/"
```

---

### Task 3: Scoring and correctness functions

**Files:**
- Modify: `lib/gameLogic.ts`
- Create: `lib/gameLogic.test.ts`

**Interfaces:**
- Consumes: nothing new (pure functions, no imports needed beyond what's already in the file).
- Produces: `calcPartialCreditPoints(correctCount: number, totalCount: number, secondsLeft: number): number`, `checkOrderingCorrectness(submitted: string[], correct: string[]): number`, `checkMatchingCorrectness(submitted: MatchPair[], correct: MatchPair[]): number`, and the `MatchPair` type (`{ left: string; right: string }`) — Tasks 4, 8, and 9 import these by these exact names.

- [ ] **Step 1: Write the failing tests**

Create `lib/gameLogic.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcPartialCreditPoints, checkOrderingCorrectness, checkMatchingCorrectness } from './gameLogic';

test('calcPartialCreditPoints: full accuracy, instant answer scores near max', () => {
  const points = calcPartialCreditPoints(5, 5, 30);
  assert.equal(points, 300);
});

test('calcPartialCreditPoints: zero correct scores zero regardless of speed', () => {
  assert.equal(calcPartialCreditPoints(0, 5, 30), 0);
});

test('calcPartialCreditPoints: partial accuracy scores proportionally', () => {
  const points = calcPartialCreditPoints(2, 4, 30);
  assert.equal(points, 150); // 0.5 accuracy * 300 * 1.0 speed
});

test('calcPartialCreditPoints: slower answer applies the speed floor multiplier', () => {
  const points = calcPartialCreditPoints(5, 5, 0);
  assert.equal(points, 90); // 1.0 accuracy * 300 * 0.3 floor
});

test('checkOrderingCorrectness: fully correct order counts every item', () => {
  const correct = ['Water to blood', 'Frogs', 'Gnats'];
  assert.equal(checkOrderingCorrectness(['Water to blood', 'Frogs', 'Gnats'], correct), 3);
});

test('checkOrderingCorrectness: counts only items in their correct position', () => {
  const correct = ['Water to blood', 'Frogs', 'Gnats'];
  assert.equal(checkOrderingCorrectness(['Frogs', 'Water to blood', 'Gnats'], correct), 1);
});

test('checkOrderingCorrectness: completely wrong order counts zero', () => {
  const correct = ['A', 'B', 'C'];
  assert.equal(checkOrderingCorrectness(['C', 'A', 'B'], correct), 0);
});

test('checkMatchingCorrectness: all pairs matched correctly', () => {
  const correct = [{ left: 'Exodus', right: 'Israel leaves Egypt' }, { left: 'Passover', right: 'Death angel passes over' }];
  const submitted = [{ left: 'Exodus', right: 'Israel leaves Egypt' }, { left: 'Passover', right: 'Death angel passes over' }];
  assert.equal(checkMatchingCorrectness(submitted, correct), 2);
});

test('checkMatchingCorrectness: swapped pairs count as zero correct for the swapped ones', () => {
  const correct = [{ left: 'Exodus', right: 'Israel leaves Egypt' }, { left: 'Passover', right: 'Death angel passes over' }];
  const submitted = [{ left: 'Exodus', right: 'Death angel passes over' }, { left: 'Passover', right: 'Israel leaves Egypt' }];
  assert.equal(checkMatchingCorrectness(submitted, correct), 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:unit
```
Expected: FAIL — `calcPartialCreditPoints`, `checkOrderingCorrectness`, `checkMatchingCorrectness` are not exported from `./gameLogic` yet.

- [ ] **Step 3: Implement**

Add to `lib/gameLogic.ts`, after the existing `OPPONENT_MISS_POINTS` constant:

```ts
/** A single left/right pairing for a 'matching' question. */
export interface MatchPair {
  left: string;
  right: string;
}

/** Points for a simultaneous-play question (ordering/matching), scaled by
 * accuracy and by how quickly the player submitted. Mirrors calcBuzzPoints'
 * shape: full accuracy + instant submit = 300, floor of 30% of that. */
export function calcPartialCreditPoints(correctCount: number, totalCount: number, secondsLeft: number): number {
  if (totalCount <= 0) return 0;
  const accuracyFraction = correctCount / totalCount;
  const speedMultiplier = Math.max(0.3, secondsLeft / 30);
  return Math.round(accuracyFraction * 300 * speedMultiplier);
}

/** Counts how many items in `submitted` are in the same position as in `correct`. */
export function checkOrderingCorrectness(submitted: string[], correct: string[]): number {
  let correctCount = 0;
  for (let i = 0; i < correct.length; i++) {
    if (submitted[i] === correct[i]) correctCount++;
  }
  return correctCount;
}

/** Counts how many of `submitted`'s left/right pairings match `correct`. */
export function checkMatchingCorrectness(submitted: MatchPair[], correct: MatchPair[]): number {
  let correctCount = 0;
  for (const pair of submitted) {
    const match = correct.find((c) => c.left === pair.left);
    if (match && match.right === pair.right) correctCount++;
  }
  return correctCount;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit
```
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/gameLogic.ts lib/gameLogic.test.ts
git commit -m "Add scoring and correctness functions for ordering/matching questions"
```

---

### Task 4: Question type registry

**Files:**
- Create: `lib/questionTypes.ts`
- Create: `lib/questionTypes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `QuestionType` (union type), `InteractionMode` (`'race' | 'simultaneous'`), `getInteractionMode(type: string | null | undefined): InteractionMode` — Task 7 (QuestionPhase MC rendering) and Task 8/9's orchestrator wiring in `app/game/[roomId].tsx` call this by this exact name.

- [ ] **Step 1: Write the failing tests**

Create `lib/questionTypes.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInteractionMode } from './questionTypes';

test('free_text is a race type', () => {
  assert.equal(getInteractionMode('free_text'), 'race');
});

test('multiple_choice is a race type', () => {
  assert.equal(getInteractionMode('multiple_choice'), 'race');
});

test('fill_blank is a race type', () => {
  assert.equal(getInteractionMode('fill_blank'), 'race');
});

test('ordering is a simultaneous type', () => {
  assert.equal(getInteractionMode('ordering'), 'simultaneous');
});

test('matching is a simultaneous type', () => {
  assert.equal(getInteractionMode('matching'), 'simultaneous');
});

test('unknown or missing type defaults to race (matches DB default of free_text)', () => {
  assert.equal(getInteractionMode(undefined), 'race');
  assert.equal(getInteractionMode(null), 'race');
  assert.equal(getInteractionMode('something_new'), 'race');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:unit
```
Expected: FAIL — `lib/questionTypes.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `lib/questionTypes.ts`:

```ts
/**
 * Question type registry — tells the game screen how a question should be
 * played: 'race' (buzz in first, then answer) or 'simultaneous' (everyone
 * arranges/matches at once, scored by accuracy + speed).
 */

export type QuestionType = 'free_text' | 'multiple_choice' | 'fill_blank' | 'ordering' | 'matching';
export type InteractionMode = 'race' | 'simultaneous';

const SIMULTANEOUS_TYPES: ReadonlySet<string> = new Set(['ordering', 'matching']);

/** Returns 'simultaneous' for ordering/matching, 'race' for everything else
 * (including unknown/missing types, so new types default safely to the
 * existing buzz-in behavior until explicitly registered here). */
export function getInteractionMode(type: string | null | undefined): InteractionMode {
  return type && SIMULTANEOUS_TYPES.has(type) ? 'simultaneous' : 'race';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit
```
Expected: all 6 tests pass (15 total across both unit test files).

- [ ] **Step 5: Commit**

```bash
git add lib/questionTypes.ts lib/questionTypes.test.ts
git commit -m "Add question type registry (race vs simultaneous interaction modes)"
```

---

### Task 5: Extend the import script for new question types

**Files:**
- Modify: `scripts/import-questions.js`
- Create: `scripts/import-questions.test.js`

**Interfaces:**
- Consumes: none (this task only touches the standalone import script).
- Produces: `validate()` now accepts `type`, `options`, `payload` on the raw JSON row and produces a `row` object with those fields set — no other task depends on this directly, but it's required before new ordering/matching content can be imported.

**Depends on:** Task 1 (the DB columns must exist before `main()`'s `supabase.from('questions').insert(toInsert)` call will succeed with the new fields — but `validate()` itself can be written and tested before that, since it doesn't touch the network).

- [ ] **Step 1: Write the failing tests**

Create `scripts/import-questions.test.js`. This requires exporting `validate` from `import-questions.js` first (see Step 3) — write the test assuming that export exists:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./import-questions.js');

test('validate: defaults type to free_text when omitted (backward compatibility)', () => {
  const result = validate({ question: 'Q?', answer: 'A' }, 0);
  assert.equal(result.ok, true);
  assert.equal(result.row.type, 'free_text');
});

test('validate: multiple_choice requires options to include the answer', () => {
  const bad = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['B', 'C', 'D', 'E'] }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /options must include the answer/);

  const good = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(good.ok, true);
  assert.deepEqual(good.row.options, ['A', 'B', 'C', 'D']);
});

test('validate: multiple_choice requires exactly 4 options', () => {
  const result = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['A', 'B', 'C'] }, 0);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /exactly 4 options/);
});

test('validate: ordering requires payload.items with at least 3 entries, and no answer/options', () => {
  const bad = validate({ question: 'Order these', type: 'ordering', payload: { items: ['A', 'B'] } }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /at least 3 items/);

  const good = validate({ question: 'Order these', type: 'ordering', payload: { items: ['A', 'B', 'C'] } }, 0);
  assert.equal(good.ok, true);
  assert.deepEqual(good.row.payload, { items: ['A', 'B', 'C'] });
  assert.equal(good.row.answer, null);
});

test('validate: matching requires payload.pairs with at least 3 left/right entries', () => {
  const bad = validate({ question: 'Match these', type: 'matching', payload: { pairs: [{ left: 'A', right: 'B' }] } }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /at least 3 pairs/);

  const good = validate({
    question: 'Match these',
    type: 'matching',
    payload: { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }, { left: 'C', right: '3' }] },
  }, 0);
  assert.equal(good.ok, true);
});

test('validate: unknown type is rejected', () => {
  const result = validate({ question: 'Q?', answer: 'A', type: 'not_a_real_type' }, 0);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unknown type/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:import
```
Expected: FAIL — `import-questions.js` doesn't export `validate` yet (it's currently a top-level function used only internally).

- [ ] **Step 3: Implement**

In `scripts/import-questions.js`, replace the existing `validate` function and its surrounding constants with:

```js
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUESTION_TYPES = ['free_text', 'multiple_choice', 'fill_blank', 'ordering', 'matching'];

function validate(raw, index) {
  const errors = [];
  const type = typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'free_text';
  if (!QUESTION_TYPES.includes(type)) {
    errors.push(`unknown type "${type}"`);
    return { ok: false, index, errors };
  }

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) errors.push('missing question');

  let difficulty = typeof raw.difficulty === 'string' ? raw.difficulty.toLowerCase() : 'medium';
  if (!DIFFICULTIES.includes(difficulty)) difficulty = 'medium';
  const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General';
  const reference = typeof raw.reference === 'string' && raw.reference.trim() ? raw.reference.trim() : null;

  if (type === 'ordering' || type === 'matching') {
    const payload = raw.payload;
    if (type === 'ordering') {
      const items = payload && Array.isArray(payload.items) ? payload.items : null;
      if (!items || items.length < 3) errors.push('ordering questions need a payload.items array with at least 3 items');
    } else {
      const pairs = payload && Array.isArray(payload.pairs) ? payload.pairs : null;
      if (!pairs || pairs.length < 3) errors.push('matching questions need a payload.pairs array with at least 3 pairs');
      else if (pairs.some((p) => !p || typeof p.left !== 'string' || typeof p.right !== 'string')) {
        errors.push('every matching pair needs a string "left" and "right"');
      }
    }
    if (errors.length) return { ok: false, index, errors };
    return {
      ok: true,
      row: { question, answer: null, options: null, payload, category, difficulty, reference, type, active: true },
    };
  }

  // free_text, multiple_choice, fill_blank all share the answer/options shape
  const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  if (!answer) errors.push('missing answer');

  let options = null;
  if (type === 'multiple_choice' || (type === 'fill_blank' && raw.options)) {
    options = Array.isArray(raw.options) ? raw.options : null;
    if (!options || options.length !== 4) {
      errors.push('multiple_choice/fill_blank questions need exactly 4 options');
    } else if (!options.includes(answer)) {
      errors.push('options must include the answer');
    }
  }

  if (errors.length) return { ok: false, index, errors };
  return {
    ok: true,
    row: { question, answer, options, payload: null, category, difficulty, reference, type, active: true },
  };
}

module.exports = { validate };
```

Note this removes the old inline `const DIFFICULTIES = [...]` near the top of the file (now redefined above) — delete that old line so it isn't declared twice.

Also update `main()`'s call site — it currently does `list.forEach((item, i) => { const result = validate(item, i); ...})`, which is unchanged and still works since `validate`'s signature (`raw, index`) and return shape (`{ok, row}` or `{ok, index, errors}`) are the same. No changes needed there.

Finally, add `if (require.main === module) { main(); }` immediately before the final `main();` call at the bottom of the file, replacing the bare `main();` call, so that `require('./import-questions.js')` from the test file doesn't trigger a real Supabase connection attempt:

```js
if (require.main === module) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:import
```
Expected: all 6 tests pass.

- [ ] **Step 5: Manually verify the CLI still works end-to-end (requires Task 1's migration already applied)**

```bash
node scripts/import-questions.js data/insight-vol2-questions-batch10.json
```
Expected: same `Read: / Inserted: / Skipped (duplicate): / Skipped (invalid): 0` summary format as before — confirms existing free-text-shaped JSON files still import cleanly through the extended validator.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-questions.js scripts/import-questions.test.js
git commit -m "Extend import-questions.js validate() for multiple_choice/ordering/matching"
```

---

### Task 6: Extract shared game types

**Files:**
- Create: `lib/gameTypes.ts`
- Modify: `app/game/[roomId].tsx:19-35` (removes the local `PlayerRow`/`Question` interface definitions, imports them instead)

**Interfaces:**
- Produces: `PlayerRow`, `Question` (extended with `type`, `options`, `payload` fields) — Tasks 7-10 and all `components/game/*.tsx` files import these.

- [ ] **Step 1: Create the shared types file**

Create `lib/gameTypes.ts`:

```ts
import type { MatchPair } from './gameLogic';

export interface PlayerRow {
  id: string;
  user_id: string;
  score: number;
  team: string | null;
  profiles: { username: string; avatar_id: string; avatar_color: string };
}

export interface Question {
  id: string;
  question: string;
  answer: string | null;
  category: string;
  difficulty: string;
  reference: string | null;
  hint: string | null;
  type: string;
  options: string[] | null;
  payload: { items: string[] } | { pairs: MatchPair[] } | null;
}
```

- [ ] **Step 2: Update `app/game/[roomId].tsx` to import these instead of defining them locally**

Replace lines 19-35 (the local `interface PlayerRow { ... }` and `interface Question { ... }` blocks) with:

```ts
import type { PlayerRow, Question } from '../../lib/gameTypes';
```

Add this import near the top of the file, alongside the other `../../lib/...` imports.

- [ ] **Step 3: Manually verify nothing broke**

```bash
npx tsc --noEmit
```
Expected: no new type errors introduced (the pre-existing `profile is possibly 'null'` errors in `app/(tabs)/profile.tsx` are unrelated and expected to remain — see Task 6's exit criteria: error count should not increase).

- [ ] **Step 4: Commit**

```bash
git add lib/gameTypes.ts "app/game/[roomId].tsx"
git commit -m "Extract shared PlayerRow/Question types to lib/gameTypes.ts"
```

---

### Task 7: Extract phase components (pure refactor, no behavior change)

**Files:**
- Create: `components/game/gameStyles.ts`
- Create: `components/game/WaitingPhase.tsx`
- Create: `components/game/RevealPhase.tsx`
- Create: `components/game/ResultsPhase.tsx`
- Modify: `app/game/[roomId].tsx` (remove the extracted function definitions and the `styles`/`statStyles`-equivalent `StyleSheet.create` block; import the components and styles instead)

**Interfaces:**
- Consumes: `PlayerRow`, `Question` from `lib/gameTypes.ts` (Task 6).
- Produces: `<WaitingPhase>`, `<RevealPhase>`, `<ResultsPhase>` components and the `gameStyles` object — Task 8 and 9's new phase components import `gameStyles` for shared visual conventions (colors, card shadow, etc.), and `app/game/[roomId].tsx` renders these three components in place of its old inline functions.

**Note:** `QuestionPhase` is deliberately handled in Task 8 (not here), since it needs behavior changes (multiple-choice rendering) anyway — no point extracting it unchanged first.

- [ ] **Step 1: Move the styles**

Create `components/game/gameStyles.ts` containing the entire existing `const styles = StyleSheet.create({...})` block from the bottom of `app/game/[roomId].tsx` (currently lines 612-727), renamed to `gameStyles` and exported:

```ts
import { StyleSheet } from 'react-native';
import { Colors, CardShadow } from '../../constants/colors';

export const gameStyles = StyleSheet.create({
  // ... paste the entire existing styles object body here, verbatim,
  // exactly as it is today in app/game/[roomId].tsx lines 613-727 ...
});
```

Delete that `const styles = StyleSheet.create({...})` block from `app/game/[roomId].tsx` entirely (it moves, doesn't duplicate).

- [ ] **Step 2: Extract WaitingPhase**

Create `components/game/WaitingPhase.tsx`:

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { AVATARS } from '../../lib/gameLogic';
import type { PlayerRow } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface WaitingPhaseProps {
  players: PlayerRow[];
  isHost: boolean;
  onStart: () => void;
  roomCode: string | undefined;
}

export function WaitingPhase({ players, isHost, onStart, roomCode }: WaitingPhaseProps) {
  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.waitTitle}>Waiting for players</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Room Code</Text>
        <Text style={styles.codeBig}>{roomCode}</Text>
        <Text style={styles.codeHint}>Share this code with friends</Text>
      </View>

      <Text style={styles.playerListLabel}>Players ({players.length})</Text>
      {players.map((p) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        return (
          <View key={p.id} style={styles.waitPlayer}>
            <View style={[styles.waitAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={{ fontSize: 20 }}>{av.emoji}</Text>
            </View>
            <Text style={styles.waitPlayerName}>{p.profiles?.username}</Text>
          </View>
        );
      })}

      {isHost && (
        <TouchableOpacity
          // DEV-ONLY BYPASS — remove before opening to real users
          style={[styles.startBtn, (players.length < 2 && !__DEV__) && { opacity: 0.4 }]}
          onPress={onStart}
          disabled={players.length < 2 && !__DEV__}
        >
          <Text style={styles.startBtnText}>
            {players.length < 2
              ? (__DEV__ ? 'Start (Solo Dev Test)' : 'Waiting for 2nd player...')
              : 'Start Game!'}
          </Text>
        </TouchableOpacity>
      )}
      {!isHost && (
        <Text style={styles.waitingHint}>Waiting for host to start...</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Extract RevealPhase**

Create `components/game/RevealPhase.tsx`:

```tsx
import { View, Text, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/colors';
import type { PlayerRow, Question } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface RevealPhaseProps {
  question: Question;
  answerResult: 'correct' | 'wrong' | null;
  buzzedPlayer: PlayerRow | undefined;
  isHost: boolean;
  onNext: () => void;
  onOpponentAnswer: () => void;
}

export function RevealPhase({ question, answerResult, isHost, onNext, onOpponentAnswer }: RevealPhaseProps) {
  const correct = answerResult === 'correct';
  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.resultBanner, { backgroundColor: correct ? Colors.success : Colors.danger }]}>
        <Text style={styles.resultEmoji}>{correct ? '✓' : '✗'}</Text>
        <Text style={styles.resultText}>{correct ? 'Correct!' : 'Wrong!'}</Text>
      </View>

      <View style={styles.revealBox}>
        <Text style={styles.revealLabel}>The answer was:</Text>
        <Text style={styles.revealAnswer}>{question.answer}</Text>
        {question.reference && <Text style={styles.revealRef}>{question.reference}</Text>}
      </View>

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      {isHost && !correct && (
        <TouchableOpacity style={styles.oppBtn} onPress={onOpponentAnswer}>
          <Text style={styles.oppBtnText}>Award Opponent 100 pts & Continue</Text>
        </TouchableOpacity>
      )}

      {isHost && correct && (
        <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
          <Text style={styles.nextBtnText}>Next Question →</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingHint}>Host is advancing...</Text>
      )}
    </View>
  );
}
```

(Note: the original inline `RevealPhase` accepted `buzzedPlayer` as a prop but never used it in its render — dropped from the destructured params here since it's unused; kept in the interface for call-site compatibility in case a future task needs it.)

- [ ] **Step 4: Extract ResultsPhase**

Create `components/game/ResultsPhase.tsx`:

```tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../../constants/colors';
import { AVATARS } from '../../lib/gameLogic';
import type { PlayerRow } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface ResultsPhaseProps {
  players: PlayerRow[];
  myUserId: string;
  onLeave: () => void;
}

export function ResultsPhase({ players, myUserId, onLeave }: ResultsPhaseProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ScrollView contentContainerStyle={styles.phaseContainer}>
      <Text style={styles.resultsTitle}>Game Over!</Text>

      {sorted.map((p, i) => {
        const av = AVATARS.find((a) => a.id === p.profiles?.avatar_id) ?? AVATARS[0];
        const isMe = p.user_id === myUserId;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        return (
          <View key={p.id} style={[styles.resultRow, isMe && { borderColor: Colors.accent }]}>
            <Text style={styles.resultMedal}>{medal}</Text>
            <View style={[styles.miniAvatar, { backgroundColor: p.profiles?.avatar_color }]}>
              <Text style={styles.miniAvatarEmoji}>{av.emoji}</Text>
            </View>
            <Text style={[styles.resultName, isMe && { color: Colors.accent }]}>{p.profiles?.username}</Text>
            <Text style={styles.resultScore}>{p.score} pts</Text>
          </View>
        );
      })}

      <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
        <Text style={styles.leaveBtnText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Update `app/game/[roomId].tsx` to use the extracted components**

- Delete the inline `function WaitingPhase(...) {...}`, `function RevealPhase(...) {...}`, and `function ResultsPhase(...) {...}` definitions (currently roughly lines 421-463, 545-581, 583-610 respectively — exact line numbers shift once Task 6 lands first).
- Add imports near the top of the file:
  ```ts
  import { WaitingPhase } from '../../components/game/WaitingPhase';
  import { RevealPhase } from '../../components/game/RevealPhase';
  import { ResultsPhase } from '../../components/game/ResultsPhase';
  ```
- The JSX call sites (`<WaitingPhase players={...} .../>`, etc.) inside the main `GameScreen` render already pass the exact same props — no changes needed there.
- Replace every remaining reference to the local `styles.xxx` (used by the parts of the file NOT extracted — the top bar, score bar, and the still-inline `QuestionPhase`) with `gameStyles.xxx`, and add `import { gameStyles } from '../../components/game/gameStyles';`.

- [ ] **Step 6: Manually verify the refactor preserved behavior**

```bash
npx tsc --noEmit
```
Expected: no new type errors (same baseline as Task 6's check).

Then run the app and play through a full solo dev-test game (per the existing `__DEV__` bypass that allows starting with 1 player) to confirm waiting → question → buzzed → reveal → results all still render and function identically to before the refactor:

```bash
npx expo start --web
```
Manually: create a game, start it, buzz in, answer (right and wrong at least once each), reach the results screen. Nothing should look or behave differently from before this task.

- [ ] **Step 7: Commit**

```bash
git add components/game/gameStyles.ts components/game/WaitingPhase.tsx components/game/RevealPhase.tsx components/game/ResultsPhase.tsx "app/game/[roomId].tsx"
git commit -m "Extract WaitingPhase/RevealPhase/ResultsPhase into components/game/ (no behavior change)"
```

---

### Task 8: Multiple-choice rendering

**Files:**
- Create: `components/game/QuestionPhase.tsx` (extracted from the inline `QuestionPhase` function, extended for multiple choice)
- Modify: `app/game/[roomId].tsx` (remove the inline `QuestionPhase` function, import the new component, pass one new prop)
- Modify: `components/game/gameStyles.ts` (add option-button styles)

**Interfaces:**
- Consumes: `getInteractionMode` from `lib/questionTypes.ts` (Task 4), `Question`/`PlayerRow` from `lib/gameTypes.ts` (Task 6).
- Produces: `<QuestionPhase>` now handles `question.type === 'multiple_choice'` by rendering 4 tappable buttons in the `buzzed` phase instead of a `TextInput`, calling the same `onSubmitAnswer` flow with the selected option as the answer text.

- [ ] **Step 1: Add option-button styles**

Add to `components/game/gameStyles.ts` (append to the existing style object):

```ts
  optionsGrid: { width: '100%', gap: 10 },
  optionBtn: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: Colors.border, ...CardShadow,
  },
  optionBtnSelected: { borderColor: Colors.accent },
  optionBtnText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600', textAlign: 'center' },
```

- [ ] **Step 2: Create the extended QuestionPhase component**

Create `components/game/QuestionPhase.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Animated, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { getCategoryColor } from '../../constants/colors';
import type { PlayerRow, Question } from '../../lib/gameTypes';
import { gameStyles as styles } from './gameStyles';

interface QuestionPhaseProps {
  question: Question;
  timeLeft: number;
  phase: 'question' | 'buzzed';
  buzzedPlayer: PlayerRow | undefined;
  isBuzzedIn: boolean;
  isHost: boolean;
  answerInput: string;
  setAnswerInput: (v: string) => void;
  onBuzzIn: () => void;
  onSubmitAnswer: (chosenAnswer?: string) => void;
  buzzScale: Animated.Value;
  questionIndex: number;
  totalQuestions: number;
}

export function QuestionPhase({
  question, timeLeft, phase, buzzedPlayer, isBuzzedIn, answerInput, setAnswerInput,
  onBuzzIn, onSubmitAnswer, buzzScale,
}: QuestionPhaseProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const timerColor = timeLeft > 15 ? Colors.success : timeLeft > 7 ? Colors.accent : Colors.danger;
  const diffColor: any = { easy: Colors.success, medium: Colors.accent, hard: Colors.danger };
  const isMultipleChoice = question.type === 'multiple_choice' && Array.isArray(question.options);

  function handlePickOption(option: string) {
    setSelectedOption(option);
    onSubmitAnswer(option);
  }

  return (
    <ScrollView contentContainerStyle={styles.phaseContainer} keyboardShouldPersistTaps="handled">
      <View style={[styles.timerRing, { borderColor: timerColor }]}>
        <Text style={[styles.timerNumber, { color: timerColor }]}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

      <View style={styles.qMeta}>
        <View style={[styles.qCategoryPill, { backgroundColor: getCategoryColor(question.category) }]}>
          <Text style={styles.qCategory}>{question.category}</Text>
        </View>
        <Text style={[styles.qDifficulty, { color: diffColor[question.difficulty] }]}>
          {question.difficulty}
        </Text>
      </View>

      {question.hint && phase === 'question' && (
        <View style={styles.hintBox}>
          <Text style={styles.hintLabel}>Hint</Text>
          <Text style={styles.hintText}>{question.hint}</Text>
        </View>
      )}

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{question.question}</Text>
        {question.reference && <Text style={styles.qRef}>{question.reference}</Text>}
      </View>

      {phase === 'question' && (
        <Animated.View style={{ transform: [{ scale: buzzScale }] }}>
          <TouchableOpacity style={styles.buzzBtn} onPress={onBuzzIn}>
            <Text style={styles.buzzBtnText}>I Know It!</Text>
            <Text style={styles.buzzBtnSub}>Buzz in to stop the clock</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {phase === 'buzzed' && (
        <View style={styles.buzzedContainer}>
          <Text style={styles.buzzedLabel}>
            {buzzedPlayer?.profiles?.username ?? 'Player'} buzzed in!
          </Text>
          {isBuzzedIn ? (
            isMultipleChoice ? (
              <View style={styles.optionsGrid}>
                {question.options!.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionBtn, selectedOption === option && styles.optionBtnSelected]}
                    onPress={() => handlePickOption(option)}
                    disabled={selectedOption !== null}
                  >
                    <Text style={styles.optionBtnText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.answerContainer}>
                <Text style={styles.answerPrompt}>Type your answer:</Text>
                <TextInput
                  style={styles.answerInput}
                  placeholder="Your answer..."
                  placeholderTextColor={Colors.textMuted}
                  value={answerInput}
                  onChangeText={setAnswerInput}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => onSubmitAnswer()}
                />
                <TouchableOpacity style={styles.submitBtn} onPress={() => onSubmitAnswer()}>
                  <Text style={styles.submitBtnText}>Submit Answer</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={styles.waitBuzzed}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.waitBuzzedText}>Waiting for their answer...</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Update the orchestrator's `handleSubmitAnswer` to accept an explicit answer**

In `app/game/[roomId].tsx`, change the existing `handleSubmitAnswer` function signature from `async function handleSubmitAnswer()` to accept an optional override, so multiple-choice's tap-to-answer and free-text's type-then-submit both funnel through the same function:

```ts
async function handleSubmitAnswer(chosenAnswer?: string) {
  if (!question || !profile) return;
  const raw = (chosenAnswer ?? answerInput).trim().toLowerCase();
  const correctRaw = question.answer!.trim().toLowerCase();
  const correct = raw === correctRaw || correctRaw.includes(raw) || raw.includes(correctRaw);
  // ... rest of the function body is unchanged from today ...
}
```

(Only the first two lines change — `raw` now reads from `chosenAnswer` when provided, falling back to the existing `answerInput` state for free-text. Everything after stays the same.)

- [ ] **Step 4: Wire up the new component in place of the inline one**

Delete the inline `function QuestionPhase(...) {...}` definition from `app/game/[roomId].tsx`. Add:
```ts
import { QuestionPhase } from '../../components/game/QuestionPhase';
```
The existing JSX call site (`<QuestionPhase question={...} .../>`) already passes every prop the new component expects — no changes needed there beyond `onSubmitAnswer={handleSubmitAnswer}` already matching the new optional-arg signature.

- [ ] **Step 5: Manually verify**

```bash
npx tsc --noEmit
```
Expected: no new errors.

Then, since no `multiple_choice` question exists in the live DB yet at this point in the plan (Task 5's importer supports it, but nothing's been imported with that type), manually verify by temporarily importing one test question:

```bash
node -e "
const fs = require('fs');
fs.writeFileSync('/tmp/mc-test.json', JSON.stringify([{
  question: 'Test MC question — pick B',
  answer: 'B', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'],
  category: 'Test', difficulty: 'easy',
}]));
"
node scripts/import-questions.js /tmp/mc-test.json
npx expo start --web
```
Manually: create a game, buzz in when this question comes up (may need to create several games / question counts to land on it, or temporarily set `questionCount` to `1` in a throwaway local edit to force it), confirm 4 buttons render, tapping one submits and reaches the reveal phase with correct scoring. Delete the test question from Supabase afterward (or leave it — it's harmless test content, but note it to the user).

- [ ] **Step 6: Commit**

```bash
git add components/game/QuestionPhase.tsx components/game/gameStyles.ts "app/game/[roomId].tsx"
git commit -m "Add multiple-choice rendering to QuestionPhase"
```

---

### Task 9: Ordering phase

**Files:**
- Create: `components/game/OrderingPhase.tsx`
- Modify: `components/game/gameStyles.ts` (add ordering-specific styles)
- Modify: `app/game/[roomId].tsx` (add the `arranging` phase, `sequence_submit` event handling, scoring call)
- Modify: `lib/gameLogic.ts` (add `shuffleArray`-based helper is already present from the earlier randomization fix — reused, no new function needed here)

**Interfaces:**
- Consumes: `checkOrderingCorrectness`, `calcPartialCreditPoints`, `shuffleArray` from `lib/gameLogic.ts` (Task 3 and the pre-existing randomization fix), `getInteractionMode` from `lib/questionTypes.ts` (Task 4).
- Produces: the `arranging` phase in the game's phase machine, and a `sequence_submit` `game_events` event type with `payload: { items: string[], seconds_left: number }`.

- [ ] **Step 1: Add ordering styles**

Add to `components/game/gameStyles.ts`:

```ts
  orderList: { width: '100%', gap: 8 },
  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 12, ...CardShadow,
  },
  orderIndex: { width: 24, textAlign: 'center', fontWeight: '800', color: Colors.accent },
  orderItemText: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  orderArrows: { flexDirection: 'row', gap: 4 },
  orderArrowBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  orderArrowText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '700' },
  submittedBanner: { color: Colors.success, fontWeight: '700', fontSize: 16, textAlign: 'center', marginTop: 8 },
```

- [ ] **Step 2: Create OrderingPhase**

Create `components/game/OrderingPhase.tsx`. Interaction: items start in a shuffled order; up/down arrow buttons on each row move it (no drag library needed); a submit button locks in the current arrangement.

```tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { shuffleArray } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';

interface OrderingPhaseProps {
  items: string[]; // the correct order — this component shuffles its own working copy
  timeLeft: number;
  hasSubmitted: boolean;
  onSubmit: (submittedOrder: string[]) => void;
}

export function OrderingPhase({ items, timeLeft, hasSubmitted, onSubmit }: OrderingPhaseProps) {
  const [order, setOrder] = useState<string[]>(() => shuffleArray(items));

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.timerRing, { borderColor: timeLeft > 10 ? '#2ECC71' : '#FF5A5F' }]}>
        <Text style={styles.timerNumber}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

      <Text style={styles.buzzedLabel}>Arrange these in the correct order</Text>

      <View style={styles.orderList}>
        {order.map((item, i) => (
          <View key={item} style={styles.orderRow}>
            <Text style={styles.orderIndex}>{i + 1}</Text>
            <Text style={styles.orderItemText}>{item}</Text>
            <View style={styles.orderArrows}>
              <TouchableOpacity style={styles.orderArrowBtn} onPress={() => moveItem(i, -1)} disabled={hasSubmitted}>
                <Text style={styles.orderArrowText}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.orderArrowBtn} onPress={() => moveItem(i, 1)} disabled={hasSubmitted}>
                <Text style={styles.orderArrowText}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {hasSubmitted ? (
        <Text style={styles.submittedBanner}>Submitted — waiting for the other player...</Text>
      ) : (
        <TouchableOpacity style={styles.submitBtn} onPress={() => onSubmit(order)}>
          <Text style={styles.submitBtnText}>Lock In Order</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Wire the `arranging` phase into the orchestrator**

In `app/game/[roomId].tsx`:

1. Extend the `Phase` type: `type Phase = 'waiting' | 'question' | 'buzzed' | 'arranging' | 'reveal' | 'results';`

2. Add state for tracking simultaneous-type submissions, alongside the existing `buzzedUserId` state:
```ts
const [sequenceSubmissions, setSequenceSubmissions] = useState<Record<string, { data: any; secondsLeft: number }>>({});
const mySequenceSubmitted = !!(profile && sequenceSubmissions[profile.id]);
```

3. In `handleGameEvent`'s `'game_start'` case, after `setPhase('question')`, branch on interaction mode once the question loads. Since `loadQuestion` is async and sets state, add the branch inside a `.then`-free approach by checking type right after `startTimer()`:
```ts
case 'game_start': {
  setPhase('question');
  const startQid = event.payload.question_id;
  loadQuestion(startQid);
  setQuestionIndex(event.payload.question_index ?? 0);
  setSequenceSubmissions({});
  startTimer();
  break;
}
```
(No change needed here beyond resetting `sequenceSubmissions` — the phase transition into `arranging` happens differently for simultaneous types, see point 4.)

4. Add a new case to `handleGameEvent`'s switch statement, for the new event type:
```ts
case 'sequence_submit': {
  setSequenceSubmissions((prev) => ({
    ...prev,
    [event.player_id]: { data: event.payload.submission, secondsLeft: event.payload.seconds_left },
  }));
  break;
}
```

5. The existing `'next_question'` case must also reset submissions — otherwise a leftover `sequenceSubmissions` entry from a completed ordering/matching question would immediately (and incorrectly) count toward the "everyone's answered" check on the very next question. Add `setSequenceSubmissions({});` to the `'next_question'` case, alongside its existing `setBuzzedUserId(null); setAnswerInput(''); setAnswerResult(null);` resets:
```ts
case 'next_question': {
  const nextIdx = event.payload.question_index;
  setQuestionIndex(nextIdx);
  loadQuestion(event.payload.question_id);
  setBuzzedUserId(null);
  setAnswerInput('');
  setAnswerResult(null);
  setSequenceSubmissions({});
  setTimeLeft(30);
  setPhase('question');
  startTimer();
  break;
}
```

6. For simultaneous-type questions, the game should skip the buzz race entirely and go straight into `arranging` when the question phase starts. Add this logic where `question` state updates (in `loadQuestion`, after `setQuestion(data as Question)`):
```ts
async function loadQuestion(qid: string) {
  const { data } = await supabase
    .from('questions')
    .select('*')
    .eq('id', qid)
    .single();
  if (data) {
    setQuestion(data as Question);
    if (getInteractionMode((data as Question).type) === 'simultaneous') {
      setPhase('arranging');
    }
  }
}
```
Add `import { getInteractionMode } from '../../lib/questionTypes';` near the top of the file.

7. Add the submit handler, alongside `handleSubmitAnswer`:
```ts
async function handleSubmitSequence(submittedOrder: string[]) {
  if (!question || !profile || !question.payload || !('items' in question.payload)) return;
  const secondsLeft = timeLeftRef.current;
  const correctCount = checkOrderingCorrectness(submittedOrder, question.payload.items);
  const points = calcPartialCreditPoints(correctCount, question.payload.items.length, secondsLeft);

  if (myPlayer) {
    await supabase
      .from('game_players')
      .update({ score: myPlayer.score + points })
      .eq('room_id', roomId)
      .eq('user_id', profile.id);
  }

  await supabase.from('game_events').insert({
    room_id: roomId,
    event_type: 'sequence_submit',
    player_id: profile.id,
    payload: { submission: submittedOrder, seconds_left: secondsLeft },
  });
}
```
Add `import { checkOrderingCorrectness, calcPartialCreditPoints } from '../../lib/gameLogic';` (alongside the existing `calcBuzzPoints, OPPONENT_MISS_POINTS` import — merge into one import line from the same module).

8. Add a `useEffect` that watches `sequenceSubmissions` and, once every player has submitted, has the host advance the game (mirrors the existing host-only advance pattern used elsewhere):
```ts
useEffect(() => {
  if (phase !== 'arranging' || !isHost) return;
  if (Object.keys(sequenceSubmissions).length >= players.length && players.length > 0) {
    stopTimer();
    setAnswerResult('correct'); // simultaneous types don't have a binary right/wrong reveal banner sense; treat as "correct" so RevealPhase shows the neutral/green state
    setTimeout(() => advanceGame(true), 1500);
  }
}, [sequenceSubmissions, phase, isHost, players.length]);
```

9. In `handleTimeUp` (the existing function that fires when `timeLeftRef.current <= 0`), add a branch so simultaneous types also advance on timeout even if not everyone submitted:
```ts
async function handleTimeUp() {
  if (phase === 'arranging') {
    await advanceGame(Object.keys(sequenceSubmissions).length > 0);
    return;
  }
  await advanceGame(false);
}
```

10. In the render section, add the `arranging` branch alongside the existing `(phase === 'question' || phase === 'buzzed')` block:
```tsx
{phase === 'arranging' && question?.payload && 'items' in question.payload && (
  <OrderingPhase
    items={question.payload.items}
    timeLeft={timeLeft}
    hasSubmitted={mySequenceSubmitted}
    onSubmit={handleSubmitSequence}
  />
)}
```
Add `import { OrderingPhase } from '../../components/game/OrderingPhase';`.

- [ ] **Step 4: Manually verify**

```bash
npx tsc --noEmit
```
Expected: no new errors.

Import a test ordering question and play through it in a solo dev-test 1v1 game:
```bash
node -e "
const fs = require('fs');
fs.writeFileSync('/tmp/order-test.json', JSON.stringify([{
  question: 'Put these in alphabetical order',
  type: 'ordering', payload: { items: ['Apple', 'Banana', 'Cherry'] },
  category: 'Test', difficulty: 'easy',
}]));
"
node scripts/import-questions.js /tmp/order-test.json
npx expo start --web
```
Manually: reach this question, confirm the arranging UI shows 3 shuffled items with up/down arrows, reorder them, submit, confirm the game advances after submission and scoring reflects the accuracy achieved.

- [ ] **Step 5: Commit**

```bash
git add components/game/OrderingPhase.tsx components/game/gameStyles.ts "app/game/[roomId].tsx"
git commit -m "Add ordering question phase (simultaneous arrange-and-submit)"
```

---

### Task 10: Matching phase

**Files:**
- Create: `components/game/MatchingPhase.tsx`
- Modify: `components/game/gameStyles.ts` (add matching-specific styles)
- Modify: `app/game/[roomId].tsx` (render `MatchingPhase` in the `arranging` branch when the question is a matching type, and call `checkMatchingCorrectness` instead of `checkOrderingCorrectness` in `handleSubmitSequence`)

**Interfaces:**
- Consumes: `checkMatchingCorrectness`, `calcPartialCreditPoints` from `lib/gameLogic.ts` (Task 3), `MatchPair` type.
- Produces: matching questions play through the same `arranging` phase and `sequence_submit` event as ordering, distinguished by `question.payload` shape (`'pairs' in payload` vs `'items' in payload`).

- [ ] **Step 1: Add matching styles**

Add to `components/game/gameStyles.ts`:

```ts
  matchColumns: { flexDirection: 'row', width: '100%', gap: 12 },
  matchColumn: { flex: 1, gap: 8 },
  matchItem: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 2, borderColor: Colors.border, ...CardShadow,
  },
  matchItemSelected: { borderColor: Colors.accent },
  matchItemPaired: { borderColor: Colors.success, opacity: 0.6 },
  matchItemText: { color: Colors.textPrimary, fontSize: 14, textAlign: 'center' },
```

- [ ] **Step 2: Create MatchingPhase**

Create `components/game/MatchingPhase.tsx`. Interaction: left column shown in fixed order; right column shuffled. Tap a left item to select it (highlighted), then tap a right item to pair them; tapping either item of an existing pair again unpairs it. Submit enabled once every left item has a pairing.

```tsx
import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { shuffleArray } from '../../lib/gameLogic';
import type { MatchPair } from '../../lib/gameLogic';
import { gameStyles as styles } from './gameStyles';

interface MatchingPhaseProps {
  pairs: MatchPair[]; // the correct pairing
  timeLeft: number;
  hasSubmitted: boolean;
  onSubmit: (submittedPairs: MatchPair[]) => void;
}

export function MatchingPhase({ pairs, timeLeft, hasSubmitted, onSubmit }: MatchingPhaseProps) {
  const leftItems = useMemo(() => pairs.map((p) => p.left), [pairs]);
  const rightItems = useMemo(() => shuffleArray(pairs.map((p) => p.right)), [pairs]);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [pairing, setPairing] = useState<Record<string, string>>({}); // left -> right

  const pairedRights = new Set(Object.values(pairing));

  function tapLeft(left: string) {
    if (hasSubmitted) return;
    if (pairing[left]) {
      // already paired — tapping it again unpairs
      const next = { ...pairing };
      delete next[left];
      setPairing(next);
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(left === selectedLeft ? null : left);
  }

  function tapRight(right: string) {
    if (hasSubmitted) return;
    if (pairedRights.has(right)) {
      // unpair whichever left it was paired to
      const leftKey = Object.keys(pairing).find((l) => pairing[l] === right);
      if (leftKey) {
        const next = { ...pairing };
        delete next[leftKey];
        setPairing(next);
      }
      return;
    }
    if (!selectedLeft) return;
    setPairing({ ...pairing, [selectedLeft]: right });
    setSelectedLeft(null);
  }

  const allPaired = Object.keys(pairing).length === leftItems.length;

  function handleSubmit() {
    const submittedPairs: MatchPair[] = Object.entries(pairing).map(([left, right]) => ({ left, right }));
    onSubmit(submittedPairs);
  }

  return (
    <View style={styles.phaseContainer}>
      <View style={[styles.timerRing, { borderColor: timeLeft > 10 ? '#2ECC71' : '#FF5A5F' }]}>
        <Text style={styles.timerNumber}>{timeLeft}</Text>
        <Text style={styles.timerLabel}>sec</Text>
      </View>

      <Text style={styles.buzzedLabel}>Tap a left item, then its match on the right</Text>

      <View style={styles.matchColumns}>
        <View style={styles.matchColumn}>
          {leftItems.map((left) => (
            <TouchableOpacity
              key={left}
              style={[
                styles.matchItem,
                selectedLeft === left && styles.matchItemSelected,
                pairing[left] && styles.matchItemPaired,
              ]}
              onPress={() => tapLeft(left)}
            >
              <Text style={styles.matchItemText}>{left}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.matchColumn}>
          {rightItems.map((right) => (
            <TouchableOpacity
              key={right}
              style={[styles.matchItem, pairedRights.has(right) && styles.matchItemPaired]}
              onPress={() => tapRight(right)}
            >
              <Text style={styles.matchItemText}>{right}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {hasSubmitted ? (
        <Text style={styles.submittedBanner}>Submitted — waiting for the other player...</Text>
      ) : (
        <TouchableOpacity
          style={[styles.submitBtn, !allPaired && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!allPaired}
        >
          <Text style={styles.submitBtnText}>Lock In Matches</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Update the orchestrator to dispatch by payload shape**

In `app/game/[roomId].tsx`, update `handleSubmitSequence` to branch on which payload shape the current question has, and update the render branch:

```ts
async function handleSubmitSequence(submission: string[] | MatchPair[]) {
  if (!question || !profile || !question.payload) return;
  const secondsLeft = timeLeftRef.current;

  let correctCount: number;
  let totalCount: number;
  if ('items' in question.payload) {
    correctCount = checkOrderingCorrectness(submission as string[], question.payload.items);
    totalCount = question.payload.items.length;
  } else {
    correctCount = checkMatchingCorrectness(submission as MatchPair[], question.payload.pairs);
    totalCount = question.payload.pairs.length;
  }
  const points = calcPartialCreditPoints(correctCount, totalCount, secondsLeft);

  if (myPlayer) {
    await supabase
      .from('game_players')
      .update({ score: myPlayer.score + points })
      .eq('room_id', roomId)
      .eq('user_id', profile.id);
  }

  await supabase.from('game_events').insert({
    room_id: roomId,
    event_type: 'sequence_submit',
    player_id: profile.id,
    payload: { submission, seconds_left: secondsLeft },
  });
}
```
Update the import line to `import { checkOrderingCorrectness, checkMatchingCorrectness, calcPartialCreditPoints } from '../../lib/gameLogic';` and add `import type { MatchPair } from '../../lib/gameLogic';`.

Update the render branch to choose the component by payload shape:
```tsx
{phase === 'arranging' && question?.payload && 'items' in question.payload && (
  <OrderingPhase items={question.payload.items} timeLeft={timeLeft} hasSubmitted={mySequenceSubmitted} onSubmit={handleSubmitSequence} />
)}
{phase === 'arranging' && question?.payload && 'pairs' in question.payload && (
  <MatchingPhase pairs={question.payload.pairs} timeLeft={timeLeft} hasSubmitted={mySequenceSubmitted} onSubmit={handleSubmitSequence} />
)}
```
Add `import { MatchingPhase } from '../../components/game/MatchingPhase';`.

- [ ] **Step 4: Manually verify**

```bash
npx tsc --noEmit
```
Expected: no new errors.

Import a test matching question and play through it:
```bash
node -e "
const fs = require('fs');
fs.writeFileSync('/tmp/match-test.json', JSON.stringify([{
  question: 'Match the event to its book',
  type: 'matching',
  payload: { pairs: [{ left: 'The Exodus', right: 'Book of Exodus' }, { left: 'The Flood', right: 'Book of Genesis' }, { left: 'The Ten Plagues', right: 'Book of Exodus' }] },
  category: 'Test', difficulty: 'easy',
}]));
"
node scripts/import-questions.js /tmp/match-test.json
npx expo start --web
```
Manually: reach this question, confirm both columns render (right column shuffled relative to left), tap-pair works, unpairing works, submit only enables once all 3 are paired, scoring reflects correct pair count.

- [ ] **Step 5: Commit**

```bash
git add components/game/MatchingPhase.tsx components/game/gameStyles.ts "app/game/[roomId].tsx"
git commit -m "Add matching question phase (simultaneous tap-to-pair)"
```

---

### Task 11: Teams-mode handling for simultaneous types

**Files:**
- Modify: `app/game/[roomId].tsx`

**Interfaces:**
- Consumes: existing `room.mode` (`'1v1' | 'teams'`), `PlayerRow.team`.
- Produces: in teams mode, once one teammate submits a `sequence_submit`, the other teammate's `OrderingPhase`/`MatchingPhase` is replaced with a "your team already answered" message instead of letting them submit a second, competing answer.

**Depends on:** Task 9 and Task 10 (both phase components and the submission flow must exist first).

- [ ] **Step 1: Compute whether my team already submitted**

In `app/game/[roomId].tsx`, add a derived value near the existing `myPlayer`/`isBuzzedIn` derived values:

```ts
const myTeamAlreadySubmitted = room?.mode === 'teams' && myPlayer?.team
  ? players.some((p) => p.team === myPlayer.team && sequenceSubmissions[p.user_id])
  : false;
```

- [ ] **Step 2: Gate the submit UI on this**

Update the `arranging` phase render branches from Task 10 to pass a combined flag instead of just `mySequenceSubmitted`:

```tsx
{phase === 'arranging' && question?.payload && 'items' in question.payload && (
  <OrderingPhase
    items={question.payload.items}
    timeLeft={timeLeft}
    hasSubmitted={mySequenceSubmitted || myTeamAlreadySubmitted}
    onSubmit={handleSubmitSequence}
  />
)}
{phase === 'arranging' && question?.payload && 'pairs' in question.payload && (
  <MatchingPhase
    pairs={question.payload.pairs}
    timeLeft={timeLeft}
    hasSubmitted={mySequenceSubmitted || myTeamAlreadySubmitted}
    onSubmit={handleSubmitSequence}
  />
)}
```
Since both components already render a "Submitted — waiting..." banner whenever `hasSubmitted` is true, this reuses that existing UI state for "someone else on my team already locked in" — no new UI needed.

- [ ] **Step 3: Update the host's "everyone submitted" check to count teams, not players, in teams mode**

Update the `useEffect` from Task 9 Step 7:

```ts
useEffect(() => {
  if (phase !== 'arranging' || !isHost) return;
  const expectedCount = room?.mode === 'teams'
    ? new Set(players.map((p) => p.team).filter(Boolean)).size
    : players.length;
  const submittedTeamsOrPlayers = room?.mode === 'teams'
    ? new Set(
        players
          .filter((p) => sequenceSubmissions[p.user_id])
          .map((p) => p.team)
      ).size
    : Object.keys(sequenceSubmissions).length;
  if (submittedTeamsOrPlayers >= expectedCount && expectedCount > 0) {
    stopTimer();
    setAnswerResult('correct');
    setTimeout(() => advanceGame(true), 1500);
  }
}, [sequenceSubmissions, phase, isHost, players, room?.mode]);
```

- [ ] **Step 4: Manually verify**

```bash
npx tsc --noEmit
```
Expected: no new errors.

Manual test requires a 2-player teams-mode game (or, if solo dev-testing is limited to 1v1, note this as a follow-up manual QA item for the user to verify with a real second device/account, since simulating two teammates solo isn't straightforward with the existing dev bypass). Document in the commit message that teams-mode simultaneous-type behavior needs human verification with 2+ real players.

- [ ] **Step 5: Commit**

```bash
git add "app/game/[roomId].tsx"
git commit -m "Handle teams-mode submission locking for ordering/matching questions"
```

---

## Self-Review Notes

**Spec coverage:** Data model (Task 1), registry (Task 4), race-type MC rendering (Task 8), simultaneous mode + arranging phase (Tasks 9-10), scoring (Task 3), content authoring / import script (Task 5), teams-mode handling (Task 11, addresses the ambiguity fixed during spec self-review) — all sections of the spec have a corresponding task. `fill_blank` is intentionally not given its own rendering task per the spec's Non-goals (it reuses the free-text/MC-shaped UI already handled by Task 8's `isMultipleChoice` check being false and falling through to the existing `TextInput` path — no separate work needed).

**Not covered (intentionally, per spec Non-goals):** admin-panel authoring UI for ordering/matching, DB-side random sampling beyond ~1000 rows.

**Known v1 limitation (accepted, not blocking):** `RevealPhase` always shows the green "Correct!" banner after a simultaneous-type question (Task 9 Step 8 hardcodes `setAnswerResult('correct')`), since partial-credit accuracy doesn't map cleanly onto today's binary correct/wrong banner. The actual points awarded are still accurate (computed by `calcPartialCreditPoints` per player before the banner ever renders) — only the banner's color/label is a simplification. A follow-up could show per-player accuracy (e.g. "3/5 correct") instead; not in scope for this plan.

**Type consistency check:** `MatchPair` defined once in `lib/gameLogic.ts` (Task 3), imported everywhere else that needs it (Tasks 6, 10) — never redefined. `getInteractionMode` signature (`string | null | undefined) => InteractionMode`) is consistent between its definition (Task 4) and both call sites (Task 9's `loadQuestion`). `calcPartialCreditPoints(correctCount, totalCount, secondsLeft)` parameter order is consistent across its definition (Task 3) and both call sites (Tasks 9 and 10's `handleSubmitSequence`).
