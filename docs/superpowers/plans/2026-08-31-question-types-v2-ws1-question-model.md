# Question Types v2 — Workstream 1: Question Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `multiple_choice` the only race-mode question format, hard-cap `ordering`/`matching` at 4, retune simultaneous-question scoring and timer, and migrate the live DB — so all later work and all new content is authored against one settled model.

**Architecture:** Pure-function changes first (importer `validate()`, `calcPartialCreditPoints`), each TDD'd against existing node test files. Then the two client touch-points (`QuestionPhase.tsx` render, `[roomId].tsx` answer-check + timer). Then standalone operational scripts (migration, schema-check assertion, MC audit) that run against Supabase. No new runtime dependencies in this workstream — gesture libraries come in Workstream 2.

**Tech Stack:** Node scripts (`node:test`), TypeScript React Native (Expo SDK 54, expo-router), `tsx --test` for lib tests, Supabase JS client, `.env`-loaded service-role key.

**Spec:** `docs/superpowers/specs/2026-08-31-question-types-v2-design.md` (Workstream 1 section)

## Global Constraints

- Question types allowed in schema: `free_text`, `multiple_choice`, `ordering`, `matching`, `fill_blank` — `free_text` stays a legal constraint value (historical rows) but is deprecated and unplayable; nothing writes it going forward.
- `multiple_choice`: exactly 4 `options` (array of strings), containing `answer` exactly once; `options` shuffled at import before storage.
- `ordering`: `payload.items` is exactly 4 distinct strings. `matching`: `payload.pairs` is exactly 4 objects, `left` values distinct, `right` values may repeat.
- A question with neither a recognized playable `type` nor a valid `options` array is a hard import error — never a silent `free_text` fallback.
- `fill_blank` is treated as `multiple_choice` (same render + scoring; the blank is in the `question` text).
- Simultaneous-question timer = 20s. Race-question timer = 30s.
- `calcPartialCreditPoints` speed multiplier = `min(1, max(0.5, secondsLeft / 20))`.
- Scoring formula otherwise unchanged: `round(accuracyFraction * 300 * speedMultiplier)`.
- `hint` parsing into imported rows must be retained (regression guard).
- Migration scripts read `EXPO_PUBLIC_SUPABASE_URL` — it must be the `https://<ref>.supabase.co` API URL, NOT the dashboard URL.
- Existing tests stay green except where a task explicitly rewrites a test to match new behavior.
- Commit after every task. TDD: failing test → run → implement → run → commit.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `scripts/import-questions.js` | `validate()` — the single source of question validation, used by both importers | 1 |
| `scripts/import-questions.test.js` | node tests for `validate()` | 1 |
| `lib/gameLogic.ts` | `calcPartialCreditPoints` retune | 2 |
| `lib/gameLogic.test.ts` | tsx tests for scoring | 2 |
| `components/game/QuestionPhase.tsx` | race-mode render — always the 4-option grid | 3 |
| `app/game/[roomId].tsx` | `handleSubmitAnswer` exact-match; `startTimer(duration)` + per-type duration | 4, 5 |
| `supabase/schema.sql` | deprecation comment on `free_text` | 6 |
| `data/test-question-types.json` | the 4 seed questions for `seed-test-room.js`, re-capped to 4 | 6 |
| `data/insight-sequence-questions-batch1.json` | non-conforming (>4-item) content — moved aside for Workstream 3 to re-slice | 6 |
| `scripts/migrate-free-text-to-mc.js` (new) | one-time DB migration, dry-run by default | 7 |
| `scripts/check-schema.js` | add post-migration `free_text` count assertion | 8 |
| `scripts/audit-mc-options.js` (new) | report degenerate MC option sets — report only | 9 |

---

## Task 1: Importer — MC inference, hard caps, no silent fallback

**Files:**
- Modify: `scripts/import-questions.js` (`validate()`, lines 43–107)
- Test: `scripts/import-questions.test.js`

**Interfaces:**
- Consumes: nothing (entry task)
- Produces: `validate(raw, index)` returns `{ ok: true, row }` or `{ ok: false, index, errors: string[] }`. `row` shape unchanged: `{ question, answer, options, payload, category, difficulty, reference, hint, type, active }`. New behavior — `type` is inferred as `'multiple_choice'` when absent but `options` is a valid 4-array; `ordering`/`matching` require exactly 4; missing-format is an error.

- [ ] **Step 1: Rewrite the test file to describe the new behavior**

Replace the entire contents of `scripts/import-questions.test.js` with:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./import-questions.js');

test('validate: infers multiple_choice when options present and type omitted', () => {
  const r = validate({ question: 'Q?', answer: 'A', options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(r.ok, true);
  assert.equal(r.row.type, 'multiple_choice');
  assert.deepEqual([...r.row.options].sort(), ['A', 'B', 'C', 'D']);
});

test('validate: rejects a question with neither a playable type nor options', () => {
  const r = validate({ question: 'Q?', answer: 'A' }, 0);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /no playable type/i);
});

test('validate: multiple_choice requires options to include the answer', () => {
  const bad = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['B', 'C', 'D', 'E'] }, 0);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /options must include the answer/);
});

test('validate: multiple_choice requires exactly 4 options', () => {
  const r = validate({ question: 'Q?', answer: 'A', type: 'multiple_choice', options: ['A', 'B', 'C'] }, 0);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /exactly 4 options/);
});

test('validate: fill_blank is treated as multiple_choice', () => {
  const r = validate({ question: 'The ___ parted', answer: 'sea', type: 'fill_blank', options: ['sea', 'sky', 'road', 'wall'] }, 0);
  assert.equal(r.ok, true);
  assert.equal(r.row.type, 'multiple_choice');
});

test('validate: ordering requires exactly 4 distinct items', () => {
  assert.equal(validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C'] } }, 0).ok, false);
  assert.equal(validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'D', 'E'] } }, 0).ok, false);
  const dup = validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'A'] } }, 0);
  assert.equal(dup.ok, false);
  assert.match(dup.errors.join(' '), /distinct/);
  const good = validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'D'] } }, 0);
  assert.equal(good.ok, true);
  assert.deepEqual(good.row.payload, { items: ['A', 'B', 'C', 'D'] });
  assert.equal(good.row.answer, null);
});

test('validate: matching requires exactly 4 pairs with distinct left values', () => {
  const three = validate({ question: 'Match', type: 'matching', payload: { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }, { left: 'C', right: '3' }] } }, 0);
  assert.equal(three.ok, false);
  const dupLeft = validate({ question: 'Match', type: 'matching', payload: { pairs: [{ left: 'A', right: '1' }, { left: 'A', right: '2' }, { left: 'C', right: '3' }, { left: 'D', right: '4' }] } }, 0);
  assert.equal(dupLeft.ok, false);
  assert.match(dupLeft.errors.join(' '), /distinct/);
  const dupRight = validate({ question: 'Match', type: 'matching', payload: { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '1' }, { left: 'C', right: '3' }, { left: 'D', right: '4' }] } }, 0);
  assert.equal(dupRight.ok, true); // duplicate RIGHT is allowed
});

test('validate: unknown type is rejected', () => {
  const r = validate({ question: 'Q?', answer: 'A', type: 'not_a_real_type' }, 0);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /unknown type/);
});

test('validate: preserves a hint when present, null when absent', () => {
  const withHint = validate({ question: 'Q?', answer: 'A', options: ['A', 'B', 'C', 'D'], hint: '  a hint  ' }, 0);
  assert.equal(withHint.row.hint, 'a hint');
  const withoutHint = validate({ question: 'Q?', answer: 'A', options: ['A', 'B', 'C', 'D'] }, 0);
  assert.equal(withoutHint.row.hint, null);
  const ordering = validate({ question: 'Order', type: 'ordering', payload: { items: ['A', 'B', 'C', 'D'] }, hint: 'chronological' }, 0);
  assert.equal(ordering.row.hint, 'chronological');
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `node --test scripts/import-questions.test.js`
Expected: FAIL — several assertions (MC inference, exactly-4, distinct, "no playable type") do not hold yet.

- [ ] **Step 3: Rewrite `validate()` in `scripts/import-questions.js`**

Replace the function body (lines 43–107) with:

```javascript
function validate(raw, index) {
  const errors = [];

  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) errors.push('missing question');

  let difficulty = typeof raw.difficulty === 'string' ? raw.difficulty.toLowerCase() : 'medium';
  if (!DIFFICULTIES.includes(difficulty)) difficulty = 'medium';
  const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General';
  const reference = typeof raw.reference === 'string' && raw.reference.trim() ? raw.reference.trim() : null;
  const hint = typeof raw.hint === 'string' && raw.hint.trim() ? raw.hint.trim() : null;

  // Resolve type. Explicit type wins; fill_blank collapses to multiple_choice.
  // No type + a 4-entry options array => infer multiple_choice.
  let type = typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : null;
  if (type === 'fill_blank') type = 'multiple_choice';
  if (!type) {
    if (Array.isArray(raw.options) && raw.options.length === 4) type = 'multiple_choice';
    else {
      errors.push('no playable type: give a "type", or provide a 4-entry "options" array for multiple choice');
      return { ok: false, index, errors };
    }
  }
  if (!QUESTION_TYPES.includes(type)) {
    errors.push(`unknown type "${type}"`);
    return { ok: false, index, errors };
  }

  if (type === 'ordering' || type === 'matching') {
    const payload = raw.payload;
    let cleanPayload = null;
    if (type === 'ordering') {
      const items = payload && Array.isArray(payload.items) ? payload.items : null;
      if (!items || items.length !== 4) errors.push('ordering questions need a payload.items array of exactly 4 strings');
      else if (items.some((item) => typeof item !== 'string')) errors.push('every ordering item must be a string');
      else if (new Set(items).size !== 4) errors.push('ordering items must be distinct');
      else cleanPayload = { items: items.slice() };
    } else {
      const pairs = payload && Array.isArray(payload.pairs) ? payload.pairs : null;
      if (!pairs || pairs.length !== 4) errors.push('matching questions need a payload.pairs array of exactly 4 pairs');
      else if (pairs.some((p) => !p || typeof p.left !== 'string' || typeof p.right !== 'string')) errors.push('every matching pair needs a string "left" and "right"');
      else if (new Set(pairs.map((p) => p.left)).size !== 4) errors.push('matching "left" values must be distinct');
      else cleanPayload = { pairs: pairs.map((p) => ({ left: p.left, right: p.right })) };
    }
    if (errors.length) return { ok: false, index, errors };
    return {
      ok: true,
      row: { question, answer: null, options: null, payload: cleanPayload, category, difficulty, reference, hint, type, active: true },
    };
  }

  // multiple_choice
  const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  if (!answer) errors.push('missing answer');
  let options = Array.isArray(raw.options) ? raw.options.slice() : null;
  if (!options || options.length !== 4) errors.push('multiple_choice questions need exactly 4 options');
  else if (!options.includes(answer)) errors.push('options must include the answer');

  if (errors.length) return { ok: false, index, errors };
  options = shuffleOptions(options);
  return {
    ok: true,
    row: { question, answer, options, payload: null, category, difficulty, reference, hint, type, active: true },
  };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `node --test scripts/import-questions.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add scripts/import-questions.js scripts/import-questions.test.js
git commit -m "feat(import): infer multiple_choice, hard 4-caps, no silent free_text fallback"
```

---

## Task 2: Scoring — retune calcPartialCreditPoints

**Files:**
- Modify: `lib/gameLogic.ts` (lines 20–28)
- Test: `lib/gameLogic.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `calcPartialCreditPoints(correctCount: number, totalCount: number, secondsLeft: number): number` — signature unchanged; curve now floors at 0.5 and is computed against a 20s clock, capped at 1.0.

- [ ] **Step 1: Update the failing tests in `lib/gameLogic.test.ts`**

Replace the four `calcPartialCreditPoints` tests (lines 5–22) with:

```typescript
test('calcPartialCreditPoints: full accuracy, instant answer scores max 300', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 20), 300);
});

test('calcPartialCreditPoints: zero correct scores zero regardless of speed', () => {
  assert.equal(calcPartialCreditPoints(0, 4, 20), 0);
});

test('calcPartialCreditPoints: partial accuracy scores proportionally', () => {
  assert.equal(calcPartialCreditPoints(2, 4, 20), 150); // 0.5 * 300 * 1.0
});

test('calcPartialCreditPoints: slow answer applies the 0.5 speed floor', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 0), 150); // 1.0 * 300 * 0.5
});

test('calcPartialCreditPoints: mid-clock scales linearly between floor and 1.0', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 15), 225); // 1.0 * 300 * 0.75
  assert.equal(calcPartialCreditPoints(4, 4, 10), 150); // multiplier max(0.5, 0.5)
});

test('calcPartialCreditPoints: never exceeds 300 even if secondsLeft > 20', () => {
  assert.equal(calcPartialCreditPoints(4, 4, 30), 300);
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm run test:unit`
Expected: FAIL on the `calcPartialCreditPoints` cases (e.g. `(4,4,0)` returns 90, expected 150).

- [ ] **Step 3: Update `calcPartialCreditPoints` in `lib/gameLogic.ts`**

Replace lines 20–28 with:

```typescript
/** Points for a simultaneous-play question (ordering/matching), scaled by
 * accuracy and by how quickly the player submitted, against the 20s
 * simultaneous-question clock. Full accuracy + instant submit = 300; the
 * speed multiplier floors at 0.5 and is capped at 1.0. */
export function calcPartialCreditPoints(correctCount: number, totalCount: number, secondsLeft: number): number {
  if (totalCount <= 0) return 0;
  const accuracyFraction = correctCount / totalCount;
  const speedMultiplier = Math.min(1, Math.max(0.5, secondsLeft / 20));
  return Math.round(accuracyFraction * 300 * speedMultiplier);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm run test:unit`
Expected: PASS (all — `gameLogic.test.ts` and `questionTypes.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add lib/gameLogic.ts lib/gameLogic.test.ts
git commit -m "feat(scoring): retune partial-credit curve to 20s clock, 0.5 floor"
```

---

## Task 3: QuestionPhase — always render the 4-option grid

**Files:**
- Modify: `components/game/QuestionPhase.tsx`

**Interfaces:**
- Consumes: `Question` from `lib/gameTypes` (has `type`, `options?: string[]`, `answer`, `question`, `category`, `difficulty`, `hint?`)
- Produces: `<QuestionPhase>` props — REMOVE `answerInput`, `setAnswerInput`; `onSubmitAnswer` becomes `(chosenAnswer: string) => void` (no longer optional-arg). Everything else unchanged.

- [ ] **Step 1: Edit the component**

In `components/game/QuestionPhase.tsx`:

1. In the `react-native` import on line 2, remove `TextInput` only. Keep `ActivityIndicator` (still used by the "waiting for their answer" state) and `Animated`.
2. Change the props interface: delete `answerInput: string;` and `setAnswerInput: (v: string) => void;`. Change `onSubmitAnswer: (chosenAnswer?: string) => void;` to `onSubmitAnswer: (chosenAnswer: string) => void;`.
3. Delete `answerInput, setAnswerInput` from the destructured params (line 25–26).
4. Delete the `isMultipleChoice` const (line 32).
5. Replace the buzzed-in render block (lines 83–120, the `isBuzzedIn ? (...) : (...)` expression) with:

```tsx
          {isBuzzedIn ? (
            Array.isArray(question.options) && question.options.length >= 2 ? (
              <View style={styles.optionsGrid}>
                {question.options.map((option, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionBtn, selectedOption === option && styles.optionBtnSelected]}
                    onPress={() => handlePickOption(option)}
                    disabled={selectedOption !== null}
                  >
                    <Text style={styles.optionBtnText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.buzzedLabel}>Question unavailable — waiting for the round to advance.</Text>
            )
          ) : (
            <View style={styles.waitBuzzed}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.waitBuzzedText}>Waiting for their answer...</Text>
            </View>
          )}
```

6. `handlePickOption` (lines 34–39) stays as-is — it already calls `onSubmitAnswer(option)`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `app/game/[roomId].tsx` (it still passes the removed props / calls `onSubmitAnswer()` with no arg). Those are fixed in Task 5. No errors inside `QuestionPhase.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add components/game/QuestionPhase.tsx
git commit -m "feat(game): multiple-choice is the only race-question render path"
```

---

## Task 4: Timer — per-question-type duration

**Files:**
- Modify: `app/game/[roomId].tsx`

**Interfaces:**
- Consumes: `getInteractionMode` from `lib/questionTypes`, `Question` from `lib/gameTypes`
- Produces: `startTimer(durationSeconds?: number)` (default 30). `loadQuestion(qid): Promise<Question | null>` now returns the loaded question. Module consts `RACE_TIMER_SECONDS = 30`, `SIMULTANEOUS_TIMER_SECONDS = 20`.

- [ ] **Step 1: Add the constants**

Near the top of `app/game/[roomId].tsx`, after the imports, add:

```typescript
const RACE_TIMER_SECONDS = 30;
const SIMULTANEOUS_TIMER_SECONDS = 20;

function timerSecondsFor(q: { type?: string | null } | null): number {
  return getInteractionMode(q?.type) === 'simultaneous' ? SIMULTANEOUS_TIMER_SECONDS : RACE_TIMER_SECONDS;
}
```

- [ ] **Step 2: Make `startTimer` take a duration**

Replace `startTimer` (lines 226–237) with:

```typescript
  function startTimer(durationSeconds = RACE_TIMER_SECONDS) {
    stopTimer();
    timeLeftRef.current = durationSeconds;
    setTimeLeft(durationSeconds);
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        stopTimer();
      }
    }, 1000);
  }
```

- [ ] **Step 3: Return the question from `loadQuestion`**

Replace `loadQuestion` (lines 103–115) with:

```typescript
  async function loadQuestion(qid: string): Promise<Question | null> {
    const { data } = await supabase.from('questions').select('*').eq('id', qid).single();
    if (!data) return null;
    const q = data as Question;
    setQuestion(q);
    if (getInteractionMode(q.type) === 'simultaneous') {
      setPhase('arranging');
    }
    return q;
  }
```

- [ ] **Step 4: Update the three `startTimer()` call sites**

a) `loadRoom` active-game branch (lines 83–86): replace

```typescript
      setPhase('question');
      await loadQuestion(roomData.question_ids[roomData.current_question_index]);
      startTimer();
```

with

```typescript
      setPhase('question');
      const q = await loadQuestion(roomData.question_ids[roomData.current_question_index]);
      startTimer(timerSecondsFor(q));
```

b) `game_start` handler (lines 165–173): replace

```typescript
      case 'game_start':
        setPhase('question');
        const startQid = event.payload.question_id;
        loadQuestion(startQid);
        setQuestionIndex(event.payload.question_index ?? 0);
        setSequenceSubmissions({});
        advancedForIndexRef.current = null;
        startTimer();
        break;
```

with

```typescript
      case 'game_start': {
        setPhase('question');
        const startQid = event.payload.question_id;
        setQuestionIndex(event.payload.question_index ?? 0);
        setSequenceSubmissions({});
        advancedForIndexRef.current = null;
        loadQuestion(startQid).then((q) => startTimer(timerSecondsFor(q)));
        break;
      }
```

c) `next_question` handler (lines 202–215): replace

```typescript
      case 'next_question':
        const nextIdx = event.payload.question_index;
        setQuestionIndex(nextIdx);
        setQuestion(null);
        loadQuestion(event.payload.question_id);
        setBuzzedUserId(null);
        setAnswerInput('');
        setAnswerResult(null);
        setSequenceSubmissions({});
        setTimeLeft(30);
        setPhase('question');
        advancedForIndexRef.current = null;
        startTimer();
        break;
```

with

```typescript
      case 'next_question': {
        const nextIdx = event.payload.question_index;
        setQuestionIndex(nextIdx);
        setQuestion(null);
        setBuzzedUserId(null);
        setAnswerResult(null);
        setSequenceSubmissions({});
        setPhase('question');
        advancedForIndexRef.current = null;
        loadQuestion(event.payload.question_id).then((q) => startTimer(timerSecondsFor(q)));
        break;
      }
```

(Note: the `setAnswerInput('')` line is removed here — `answerInput` state is deleted in Task 5. If Task 5 is not yet done, temporarily keep `setAnswerInput('')`; the executor should do Task 5 immediately after.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: `answerInput`-related errors remain (fixed in Task 5); no NEW errors from the timer changes. `case` blocks now have braces so lexical decls are fine.

- [ ] **Step 6: Commit**

```bash
git add "app/game/[roomId].tsx"
git commit -m "feat(game): 20s timer for ordering/matching, 30s for race questions"
```

---

## Task 5: [roomId] — exact-match answer check, drop free-text state

**Files:**
- Modify: `app/game/[roomId].tsx`

**Interfaces:**
- Consumes: `<QuestionPhase>` new prop shape from Task 3 (`onSubmitAnswer: (chosenAnswer: string) => void`, no `answerInput`/`setAnswerInput`)
- Produces: nothing downstream

- [ ] **Step 1: Delete `answerInput` state**

Remove the `answerInput` / `setAnswerInput` `useState` line (search for `answerInput`). Remove any remaining `setAnswerInput(...)` calls (there is one left in the `buzz_in`/reset paths only if Task 4 note applied — remove it now).

- [ ] **Step 2: Rewrite `handleSubmitAnswer`**

Replace `handleSubmitAnswer` (lines 273–301) with:

```typescript
  async function handleSubmitAnswer(chosenAnswer: string) {
    if (!question || !profile || question.answer === null) return;
    const correct = chosenAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase();
    const points = correct ? calcBuzzPoints(timeLeft) : 0;

    if (points > 0 && myPlayer) {
      await supabase
        .from('game_players')
        .update({ score: myPlayer.score + points })
        .eq('room_id', roomId)
        .eq('user_id', profile.id);
    }

    await supabase.from('game_events').insert({
      room_id: roomId,
      event_type: 'answer',
      player_id: profile.id,
      payload: { correct, points, answer: chosenAnswer.trim() },
    });

    if (isHost) {
      setTimeout(() => advanceGame(), 3000);
    }
  }
```

- [ ] **Step 3: Update the `<QuestionPhase>` usage**

Find the `<QuestionPhase ... />` render (around line 470–490). Remove the `answerInput={answerInput}` and `setAnswerInput={setAnswerInput}` props. Leave `onSubmitAnswer={handleSubmitAnswer}` as-is.

- [ ] **Step 4: Typecheck the whole app**

Run: `npx tsc --noEmit`
Expected: PASS — zero errors.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test`
Expected: PASS — `test:unit` and `test:import` both green.

- [ ] **Step 6: Commit**

```bash
git add "app/game/[roomId].tsx"
git commit -m "feat(game): exact-match MC answers, remove free-text answer path"
```

---

## Task 6: Schema note + re-cap seed content

**Files:**
- Modify: `supabase/schema.sql` (near lines 56–60)
- Modify: `data/test-question-types.json`
- Rename: `data/insight-sequence-questions-batch1.json` → `data/insight-sequence-questions-batch1.RESLICE-IN-WS3.json.txt`

**Interfaces:** none

- [ ] **Step 1: Add the schema deprecation comment**

In `supabase/schema.sql`, immediately after the `add column if not exists type text ...` block (line 58), add a comment line:

```sql
-- NOTE: 'free_text' is deprecated and unplayable as of the Question Types v2
-- work (2026-08-31). It remains a legal constraint value only for historical
-- rows; the importer never writes it and the client has no render path for it.
-- Run scripts/migrate-free-text-to-mc.js to convert existing rows.
```

- [ ] **Step 2: Replace `data/test-question-types.json` with 4-capped questions**

```json
[
  {
    "question": "Put these events of the Genesis creation account in the order they are described.",
    "type": "ordering",
    "category": "Chronology",
    "difficulty": "medium",
    "reference": "Insight on the Scriptures, 'Creation'",
    "payload": {
      "items": [
        "Light",
        "An expanse separating the waters (sky)",
        "Dry land, seas, and vegetation",
        "Sun, moon, and stars made discernible"
      ]
    }
  },
  {
    "question": "Arrange these events from the early life of Moses from earliest to latest.",
    "type": "ordering",
    "category": "Chronology",
    "difficulty": "medium",
    "reference": "Insight on the Scriptures, 'Moses'",
    "payload": {
      "items": [
        "Placed in a basket on the Nile as a baby",
        "Flees Egypt to Midian",
        "Encounters the burning bush",
        "Confronts Pharaoh and the ten plagues follow"
      ]
    }
  },
  {
    "question": "Match each person to what they are best known for.",
    "type": "matching",
    "category": "Bible Basics",
    "difficulty": "medium",
    "reference": "Insight on the Scriptures",
    "payload": {
      "pairs": [
        { "left": "Noah", "right": "Built an ark to survive the Flood" },
        { "left": "Jonah", "right": "Was swallowed by a great fish" },
        { "left": "David", "right": "Killed the giant Goliath" },
        { "left": "Solomon", "right": "Built the first temple in Jerusalem" }
      ]
    }
  },
  {
    "question": "Match each location to the event associated with it.",
    "type": "matching",
    "category": "Places",
    "difficulty": "medium",
    "reference": "Insight on the Scriptures",
    "payload": {
      "pairs": [
        { "left": "Bethlehem", "right": "Jesus' birth" },
        { "left": "Jordan River", "right": "Jesus' baptism" },
        { "left": "Golgotha", "right": "Jesus' execution" },
        { "left": "Mount Sinai", "right": "Giving of the Law" }
      ]
    }
  }
]
```

- [ ] **Step 3: Move the non-conforming ordering batch aside**

```bash
git mv data/insight-sequence-questions-batch1.json data/insight-sequence-questions-batch1.RESLICE-IN-WS3.json.txt 2>/dev/null || mv data/insight-sequence-questions-batch1.json data/insight-sequence-questions-batch1.RESLICE-IN-WS3.json.txt
```

(`data/` is gitignored, so `git mv` will no-op with an error — the plain `mv` is what runs. The `.txt` suffix keeps `import-all.js` from reading it. Workstream 3 re-slices its 36 questions to the 4-cap.)

- [ ] **Step 4: Verify `validate()` accepts the new seed file**

Run:
```bash
node -e "const {validate}=require('./scripts/import-questions.js');const d=require('./data/test-question-types.json');d.forEach((q,i)=>{const r=validate(q,i);if(!r.ok)throw new Error('item '+i+': '+r.errors.join(', '));});console.log('all 4 seed questions valid');"
```
Expected: `all 4 seed questions valid`

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "docs(schema): mark free_text deprecated; re-cap seed test questions to 4"
```

(The `data/` files are gitignored — the commit is schema-only. Note the data changes in the commit body.)

---

## Task 7: Migration script — free_text → multiple_choice

> **REVISED DURING EXECUTION (2026-08-31):** the plan assumed live `free_text`
> rows carry a stored `options` array — they do not (`options` is null on all
> 730; the v1 importer discarded options for non-MC rows). The options live in
> the local `data/*.json` files. The migration therefore matches DB rows to
> local questions by normalized question text and writes the options from
> there. The 20 `schema.sql` seed questions had no options anywhere — 20
> hand-authored MC versions were added as `data/seed-questions-mc.json`, so
> all 730 rows now match. Approved by the user (option A).

**Files:**
- Create: `scripts/migrate-free-text-to-mc.js`
- Create: `data/seed-questions-mc.json` (20 hand-authored MC versions of the schema seed questions; `data/` is gitignored)

**Interfaces:**
- Consumes: `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Produces: a CLI script. `node scripts/migrate-free-text-to-mc.js` (dry run) / `--apply`.

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
/**
 * One-time migration: flip legacy `type = 'free_text'` rows to
 * `multiple_choice` when they carry a usable 4-entry `options` array that
 * includes the stored `answer`. Rows without usable options are reported,
 * never auto-changed.
 *
 * Usage:
 *   node scripts/migrate-free-text-to-mc.js            # dry run (default)
 *   node scripts/migrate-free-text-to-mc.js --apply    # perform the flip
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

function usableOptions(row) {
  return Array.isArray(row.options)
    && row.options.length === 4
    && typeof row.answer === 'string'
    && row.options.includes(row.answer);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  console.log('URL:', SUPABASE_URL);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, answer, options')
      .eq('type', 'free_text')
      .range(from, from + PAGE - 1);
    if (error) { console.error('Query failed:', error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const flippable = rows.filter(usableOptions);
  const needsWork = rows.filter((r) => !usableOptions(r));

  console.log(`\nfree_text rows total:        ${rows.length}`);
  console.log(`  -> flippable to MC:         ${flippable.length}`);
  console.log(`  -> need manual fix/delete:  ${needsWork.length}`);
  if (needsWork.length) {
    console.log('\nRows with no usable 4-option array (NOT changed):');
    needsWork.slice(0, 40).forEach((r) => console.log(`  ${r.id}  ${r.question.slice(0, 70)}`));
    if (needsWork.length > 40) console.log(`  ... and ${needsWork.length - 40} more`);
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to flip the flippable rows.');
    return;
  }

  let done = 0;
  for (let i = 0; i < flippable.length; i += 200) {
    const ids = flippable.slice(i, i + 200).map((r) => r.id);
    const { error } = await supabase.from('questions').update({ type: 'multiple_choice' }).in('id', ids);
    if (error) { console.error(`Update failed at ${i}:`, error.message); process.exit(1); }
    done += ids.length;
  }
  console.log(`\nApplied: flipped ${done} rows to multiple_choice.`);
}

main();
```

- [ ] **Step 2: Run the dry run against the live DB**

Run: `node scripts/migrate-free-text-to-mc.js`
Expected: prints the correct API URL, a `free_text rows total` count (~730 per project memory), a flippable count, and a list of any rows needing manual work. **Do not run `--apply` yet** — that happens in Task 8's verification step after the assertion is in place, and only with the human's go-ahead.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-free-text-to-mc.js
git commit -m "feat(scripts): add free_text -> multiple_choice migration (dry-run default)"
```

---

## Task 8: check-schema.js — post-migration assertion, then run the migration

**Files:**
- Modify: `scripts/check-schema.js`

**Interfaces:**
- Consumes: `.env`
- Produces: `check-schema.js` additionally reports the `free_text` row count and lists a sample.

- [ ] **Step 1: Read the current script**

Run: `cat scripts/check-schema.js` — note its structure (it already creates a `supabase` client and runs labelled probe blocks).

- [ ] **Step 2: Add a `free_text` count probe**

After the existing `[select type/options/payload/answer]` block, add:

```javascript
  console.log('\n[free_text row count — should be 0 after migration]');
  {
    const { count, error } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'free_text');
    if (error) console.log('ERROR:', error.message);
    else console.log(count === 0 ? 'OK — no free_text rows' : `WARNING — ${count} free_text rows remain`);
  }
```

- [ ] **Step 3: Run it (pre-migration baseline)**

Run: `node scripts/check-schema.js`
Expected: existing probes still OK; new probe prints `WARNING — N free_text rows remain`.

- [ ] **Step 4: Commit the script change**

```bash
git add scripts/check-schema.js
git commit -m "feat(scripts): check-schema asserts free_text row count"
```

- [ ] **Step 5: Run the migration (human checkpoint)**

Present the Task 7 dry-run output to the human. On their go-ahead:

Run: `node scripts/migrate-free-text-to-mc.js --apply`
Then: `node scripts/check-schema.js`
Expected: the new probe prints `OK — no free_text rows`, OR `WARNING — N` where N equals exactly the "need manual fix/delete" count from the dry run. Report that number to the human — those rows need hand-fixing or deletion (out of plan scope; log them).

No commit (DB-only change).

---

## Task 9: audit-mc-options.js — flag degenerate option sets

**Files:**
- Create: `scripts/audit-mc-options.js`

**Interfaces:**
- Consumes: `.env`
- Produces: a report-only CLI script. `node scripts/audit-mc-options.js`.

- [ ] **Step 1: Write the script**

```javascript
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
```

- [ ] **Step 2: Run it**

Run: `node scripts/audit-mc-options.js`
Expected: prints a count and a list of flagged questions. This is informational — no action required in this plan; save the output for the content-quality pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/audit-mc-options.js
git commit -m "feat(scripts): add report-only multiple-choice option-quality audit"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Unit + import tests**

Run: `npm run test`
Expected: PASS — `test:unit` (gameLogic + questionTypes) and `test:import` (validate) all green.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Re-seed and manually play one race + one simultaneous question on web**

```bash
node scripts/seed-test-room.js playtester   # from the 2026-08-31 playtest; recreates TESTTY
```
Then with the web dev server running (`BROWSER=none npx expo start --web --port 8081`), sign in as `playtester`, join `TESTTY`, Start (Solo Dev Test):
- The two ordering questions now show exactly 4 items each.
- The two matching questions show exactly 4 pairs each.
- The 20s timer is used (starts at 20, not 30).
- Submitting a perfect ordering answer with >10s left scores ≥ 225 (was 90 pre-retune).
- Then start any normal game / question from the main pool: a `multiple_choice` question shows the 4-option grid after buzz-in; there is no text input anywhere.

- [ ] **Step 4: Confirm the migration landed**

Run: `node scripts/check-schema.js`
Expected: `OK — no free_text rows` (or the known residual count from Task 8, already reported to the human).

- [ ] **Step 5: Final commit if any verification fixups were needed**

```bash
git add -A
git commit -m "chore: Workstream 1 verification fixups"
```

(Skip if nothing changed.)

---

## Self-Review

**Spec coverage (Workstream 1 section):**
- §1.1 MC-only, inference, no fallback, remove TextInput, remove fuzzy matcher → Tasks 1, 3, 5 ✓
- §1.1 schema `free_text` deprecation comment → Task 6 ✓
- §1.2 hard 4-caps, distinct-left → Task 1 ✓
- §1.2 regenerate seed data → Task 6 ✓
- §1.3 migration script + dry run + `check-schema` assertion → Tasks 7, 8 ✓
- §1.4 timer 30→20 simultaneous, scoring curve → Tasks 4, 2 ✓
- §1.5 advanceGame idempotency fix → **deferred to Workstream 2 per the spec** (the reveal-phase work touches the advance path); not in this plan by design ✓
- §3.4 audit-mc-options script → Task 9 ✓
- Testing section (unit list, migration dry-run, manual web + Expo Go) → Task 10 (web); Expo Go manual pass folded into Workstream 2's device testing since no interaction changed here ✓

**Placeholder scan:** no TBD/TODO; every code step has literal code; test code is spelled out.

**Type consistency:** `validate()` return shape unchanged across tasks. `startTimer(durationSeconds?)`, `loadQuestion(): Promise<Question|null>`, `timerSecondsFor(q)`, `onSubmitAnswer(chosenAnswer: string)` are used consistently in Tasks 3–5. `RACE_TIMER_SECONDS` / `SIMULTANEOUS_TIMER_SECONDS` named identically throughout.

**Known risk:** Task 4 touches the realtime `handleGameEvent` switch, which the 2026-08-30 reviews flagged as stale-closure-fragile. Mitigation: the changes are minimal (wrap two `case` blocks in braces, swap `startTimer()` for `loadQuestion(...).then(q => startTimer(...))`), the `next_question`/`game_start` handlers already call `loadQuestion` fire-and-forget, and Task 10 Step 3 exercises both a fresh game start and a question-to-question advance on web.
