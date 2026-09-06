# Question Types v3 — Foundation Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the gesture/animation infrastructure, refactor the game screen from a 527-line god component into a thin host driven by a per-type descriptor registry (with existing types `multiple_choice` / `ordering` / `matching` migrated onto it at behavior parity), and build the shared visual system (`Mascot`, `Celebration`, `RevealFrame`).

**Architecture:** Each question type becomes a **descriptor**: a pure-logic module (`roundStyle`, `timerSeconds`, `score`, `isRoundComplete`, `validatePayload` — no React, unit-tested under `tsx --test`) plus a thin `.tsx` wrapper that pairs it with a `PlayComponent` and a `RevealComponent`. The game screen resolves the descriptor for the current question and delegates. Concurrent-round scoring moves from submit-time to round-complete-time with the **host as the single score writer**. Two new realtime events (`round_submit`, `round_scored`) replace `answer` + `sequence_submit`. The double-advance bug is fixed with a DB-level conditional update instead of a client-side ref.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript, `react-native-reanimated` v4 + `react-native-worklets`, `react-native-gesture-handler`, `react-native-svg`, Supabase (Postgres + Realtime), Zustand, `tsx --test` + `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-05-question-types-v3-design.md` (this plan implements spec sections 1 and 3, and the §7 execution-order steps 1–3). The three new types (estimation / progressive / swipe), the `ResultsPhase` redesign, and the importer `validatePayload` delegation are **Plan 2**.

## Global Constraints

- Expo SDK is **57** (`expo@^57.0.9`, RN `0.86.3`). Do not add SDK-54-era setup.
- `react-native-reanimated` on SDK 57: install with `npx expo install react-native-reanimated react-native-worklets` (worklets is a **separate package** now). **No `babel.config.js` is needed** — `babel-preset-expo` auto-configures the Reanimated plugin on SDK 57. If you find yourself creating `babel.config.js`, stop and re-read `https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/`.
- Always install native/Expo libraries with `npx expo install <pkg>`, never bare `npm install`, so versions resolve to the SDK 57 set.
- The game is **head-to-head (1v1)**. `playerIds` in round state is exactly 2. Teams mode is out of scope; keep its existing branches working but do not extend them.
- No schema migration runner exists and the live Supabase DB has drifted from `schema.sql` before. This plan touches **no table columns** — only a code-level change to which `event_type` strings are used, plus a comment in `schema.sql`. The `questions.type` CHECK constraint is **not** changed in Plan 1 (no new types yet).
- Pure descriptor logic lives under `lib/questionTypes/logic/` and must **never import React, react-native, or any `.tsx` file** — it has to run under plain `tsx --test`.
- Every task ends green: `npm run test` passes and `npx tsc --noEmit` shows no **new** errors (the 6 pre-existing `app/(tabs)/profile.tsx` null-guard errors are the accepted baseline).
- Manual verification for any task that changes runtime behavior: web (`npx expo start --web`) **and** Expo Go on a phone (`npx expo start --offline` to skip the sign-in requirement).
- Commit after every task with the message shown in its final step.
- Copyright/content rules do not apply in Plan 1 (no content authored here).

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `lib/questionTypes/logic/types.ts` | Pure TypeScript interfaces for descriptors, score I/O, round state. No runtime code. |
| `lib/questionTypes/logic/multipleChoice.ts` | Pure logic for `multiple_choice`: `score`, `isRoundComplete`, `validatePayload`, `roundStyle`, `timerSeconds`. |
| `lib/questionTypes/logic/ordering.ts` | Pure logic for `ordering`. |
| `lib/questionTypes/logic/matching.ts` | Pure logic for `matching`. |
| `lib/questionTypes/logic/index.ts` | Pure registry: `getTypeLogic(type)`, `getInteractionMode(type)` (moved here). |
| `lib/questionTypes/logic/multipleChoice.test.ts` | Unit tests for MC logic. |
| `lib/questionTypes/logic/ordering.test.ts` | Unit tests for ordering logic. |
| `lib/questionTypes/logic/matching.test.ts` | Unit tests for matching logic. |
| `lib/questionTypes/logic/index.test.ts` | Unit tests for the registry (replaces `lib/questionTypes.test.ts`). |
| `lib/questionTypes/index.tsx` | App-only descriptor registry: `getDescriptor(type)` = logic + `{ PlayComponent, RevealComponent }`. |
| `lib/roomAdvance.ts` | Pure `decideAdvance(...)` helper + `advanceRoom(...)` Supabase call with the DB-conditional guard. |
| `lib/roomAdvance.test.ts` | Unit tests for `decideAdvance`. |
| `app/game/useGameRound.ts` | Hook: realtime subscription + timer + phase state, extracted from `[roomId].tsx`. |
| `components/game/useItemLayout.ts` | Hook: `onLayout`→rect-map ref, keyed by stable index. |
| `components/game/useItemLayout.test.ts` | Unit tests for the pure rect-map merge helper. |
| `components/Mascot.tsx` | `<Mascot mood size />` — placeholder SVG character + Reanimated mood animations. |
| `components/game/Celebration.tsx` | Reanimated particle burst shown on a won/high-scoring round. |
| `components/game/RevealFrame.tsx` | Shared reveal shell: mascot slot / body slot / points footer, host-timed. |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add the 4 native deps; widen the `test:unit` glob. |
| `app/_layout.tsx` | Wrap `<Stack>` in `<GestureHandlerRootView>`. |
| `app/game/[roomId].tsx` | Reduce to a thin host: descriptor lookup, `useGameRound`, host-side scoring, `round_submit`/`round_scored`. |
| `components/game/QuestionPhase.tsx` | Adapt to the shared `PlayProps` shape; `onSubmit` emits a submission, not a scored answer. |
| `components/game/OrderingPhase.tsx` | Adapt to `PlayProps`. |
| `components/game/MatchingPhase.tsx` | Adapt to `PlayProps`. |
| `components/game/RevealPhase.tsx` | Becomes the `multiple_choice` `RevealComponent`, rendered inside `RevealFrame`. |
| `components/game/gameStyles.ts` | Add a shared visual-token block; styles for `RevealFrame`. |
| `lib/gameTypes.ts` | Widen `Question.payload` union; add submission/breakdown types as needed. |
| `supabase/schema.sql` | Update the `game_events` event-type comment. |
| `lib/questionTypes.ts` | **Deleted** — replaced by `lib/questionTypes/`. |
| `lib/questionTypes.test.ts` | **Deleted** — replaced by `lib/questionTypes/logic/index.test.ts`. |

---

## PART A — Infrastructure

### Task 1: Install gesture/animation dependencies and wrap the root

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `app/_layout.tsx`

**Interfaces:**
- Produces: `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-svg` available to import; `<GestureHandlerRootView>` at the app root.

- [ ] **Step 1: Read the current SDK 57 Reanimated doc**

Open `https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/` and confirm: install command is `npx expo install react-native-reanimated react-native-worklets`, and "No additional configuration is required. Reanimated Babel plugin is automatically configured in `babel-preset-expo`."

- [ ] **Step 2: Install the four libraries**

Run:
```bash
npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler react-native-svg
```
Expected: `package.json` gains all four at SDK-57-compatible versions; `package-lock.json` updates.

- [ ] **Step 3: Wrap the app root in GestureHandlerRootView**

In `app/_layout.tsx`, add the import and wrap the returned tree. Final `return`:
```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// ...
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="game/[roomId]" options={{ gestureEnabled: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
```
(The `<>...</>` fragment is replaced by `<GestureHandlerRootView>`.)

- [ ] **Step 4: Verify expo-doctor and typecheck**

Run:
```bash
npx expo-doctor
npx tsc --noEmit
```
Expected: `expo-doctor` all checks pass; `tsc` shows only the 6 pre-existing `app/(tabs)/profile.tsx` errors.

- [ ] **Step 5: Verify the web build compiles**

Run:
```bash
npx expo start --web
```
Wait for "Web Bundled" with no error. Open `http://localhost:8081`, confirm the home screen renders and there are no red-box errors or console exceptions. Stop the server (`Ctrl+C`).

- [ ] **Step 6: Verify on Expo Go**

Run `npx expo start --offline`, open on a phone via Expo Go, confirm the app loads to the home screen with no error banner. Stop the server.

- [ ] **Step 7: Run the test suite**

Run: `npm run test`
Expected: all tests pass (unchanged — no logic touched).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json app/_layout.tsx
git commit -m "feat(infra): add reanimated/worklets/gesture-handler/svg, wrap root in GestureHandlerRootView"
```

---

### Task 2: `useItemLayout` hook

**Files:**
- Create: `components/game/useItemLayout.ts`
- Create: `components/game/useItemLayout.test.ts`

**Interfaces:**
- Produces:
  - `mergeRect(map: RectMap, index: number, rect: Rect): RectMap` — pure, returns a new map with `index`'s rect replaced.
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `type RectMap = Record<number, Rect>`
  - `useItemLayout(): { rects: React.MutableRefObject<RectMap>; onItemLayout: (index: number) => (e: LayoutChangeEvent) => void }`

- [ ] **Step 1: Write the failing test for `mergeRect`**

Create `components/game/useItemLayout.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRect } from './useItemLayout';

test('mergeRect adds a rect at a new index', () => {
  const out = mergeRect({}, 2, { x: 0, y: 10, width: 100, height: 40 });
  assert.deepEqual(out, { 2: { x: 0, y: 10, width: 100, height: 40 } });
});

test('mergeRect replaces an existing index without mutating the input', () => {
  const input = { 1: { x: 0, y: 0, width: 10, height: 10 } };
  const out = mergeRect(input, 1, { x: 5, y: 5, width: 20, height: 20 });
  assert.deepEqual(out, { 1: { x: 5, y: 5, width: 20, height: 20 } });
  assert.deepEqual(input, { 1: { x: 0, y: 0, width: 10, height: 10 } });
});

test('mergeRect keeps other indices intact', () => {
  const input = { 0: { x: 1, y: 1, width: 1, height: 1 } };
  const out = mergeRect(input, 3, { x: 2, y: 2, width: 2, height: 2 });
  assert.deepEqual(Object.keys(out).sort(), ['0', '3']);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx --test components/game/useItemLayout.test.ts`
Expected: FAIL — `mergeRect` is not exported / module not found.

- [ ] **Step 3: Implement `useItemLayout.ts`**

Create `components/game/useItemLayout.ts`:
```ts
import { useRef, useCallback } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface Rect { x: number; y: number; width: number; height: number }
export type RectMap = Record<number, Rect>;

/** Returns a new RectMap with `index` set to `rect`. Does not mutate `map`. */
export function mergeRect(map: RectMap, index: number, rect: Rect): RectMap {
  return { ...map, [index]: rect };
}

/**
 * Records each item's on-screen rect (relative to its layout parent) into a
 * ref map keyed by a stable index. The ref does not trigger re-renders —
 * consumers read `rects.current` inside gesture callbacks.
 */
export function useItemLayout() {
  const rects = useRef<RectMap>({});
  const onItemLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      rects.current = mergeRect(rects.current, index, { x, y, width, height });
    },
    []
  );
  return { rects, onItemLayout };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx tsx --test components/game/useItemLayout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Widen the unit-test glob and run the full suite**

In `package.json`, change:
```json
"test:unit": "tsx --test lib/gameLogic.test.ts lib/questionTypes.test.ts",
```
to:
```json
"test:unit": "tsx --test \"lib/**/*.test.ts\" \"components/**/*.test.ts\"",
```
(Node 22 — already the project's version — supports glob patterns in `--test`.)

Run: `npm run test`
Expected: all existing tests plus the 3 new `useItemLayout` tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/game/useItemLayout.ts components/game/useItemLayout.test.ts package.json
git commit -m "feat(game): add useItemLayout hook for rect measurement"
```

---

## PART B — Framework Core

### Task 3: Descriptor type definitions

**Files:**
- Create: `lib/questionTypes/logic/types.ts`

**Interfaces:**
- Produces (all consumed by Tasks 4–10):
  - `type RoundStyle = 'buzz' | 'concurrent'`
  - `interface OrderingPayload { items: string[] }`
  - `interface MatchingPayload { pairs: { left: string; right: string }[] }`
  - `interface DescriptorScoreInput<TP, TS>` — `{ question: { payload: TP | null; options: string[] | null; answer: string | null }; mine: TS | null; opponent: TS | null; mySecondsLeft: number | null; opponentSecondsLeft: number | null }`
  - `interface RoundScoreResult` — `{ points: { mine: number; opponent: number }; breakdown: unknown }`
  - `interface DescriptorRoundState<TS>` — `{ roundStyle: RoundStyle; submissions: Record<string, { submission: TS; secondsLeft: number }>; buzzedPlayerId: string | null; opponentShotTaken: boolean; playerIds: string[]; timedOut: boolean }`
  - `type PayloadValidation<TP> = { ok: true; payload: TP } | { ok: false; error: string }`
  - `interface TypeLogic<TP, TS>` — `{ id: string; roundStyle: RoundStyle; timerSeconds: number; score(i: DescriptorScoreInput<TP, TS>): RoundScoreResult; isRoundComplete(s: DescriptorRoundState<TS>): boolean; validatePayload(raw: unknown): PayloadValidation<TP> }`

- [ ] **Step 1: Write `types.ts`**

Create `lib/questionTypes/logic/types.ts` with exactly the interfaces listed above. No runtime code, no imports. Example of the two central ones:
```ts
export type RoundStyle = 'buzz' | 'concurrent';

export interface DescriptorScoreInput<TPayload = unknown, TSubmission = unknown> {
  question: { payload: TPayload | null; options: string[] | null; answer: string | null };
  /** buzz: the answerer's submission. concurrent: this player's submission. */
  mine: TSubmission | null;
  /** buzz: the opponent's shot submission if one happened. concurrent: the other player's submission. */
  opponent: TSubmission | null;
  mySecondsLeft: number | null;
  opponentSecondsLeft: number | null;
}

export interface RoundScoreResult {
  points: { mine: number; opponent: number };
  breakdown: unknown;
}

export interface TypeLogic<TPayload = unknown, TSubmission = unknown> {
  id: string;
  roundStyle: RoundStyle;
  timerSeconds: number;
  score(input: DescriptorScoreInput<TPayload, TSubmission>): RoundScoreResult;
  isRoundComplete(state: DescriptorRoundState<TSubmission>): boolean;
  validatePayload(raw: unknown): PayloadValidation<TPayload>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 6 baseline `profile.tsx` errors.

- [ ] **Step 3: Commit**

```bash
git add lib/questionTypes/logic/types.ts
git commit -m "feat(questionTypes): add descriptor logic type definitions"
```

---

### Task 4: `multiple_choice` descriptor logic

**Files:**
- Create: `lib/questionTypes/logic/multipleChoice.ts`
- Create: `lib/questionTypes/logic/multipleChoice.test.ts`

**Interfaces:**
- Consumes: `TypeLogic`, `DescriptorScoreInput`, `DescriptorRoundState` from `./types`; `calcBuzzPoints`, `OPPONENT_MISS_POINTS` from `../../gameLogic`.
- Produces: `multipleChoiceLogic: TypeLogic<null, MultipleChoiceSubmission>` where `interface MultipleChoiceSubmission { chosen: string }`.
- Scoring rule (from spec §1.2, and the current `[roomId].tsx:274` behavior, made exact):
  - `mine.chosen === question.answer` (exact string equality, no `toLowerCase`) → answerer gets `calcBuzzPoints(mySecondsLeft ?? 0)`, opponent 0.
  - answerer wrong, `opponent` present and `opponent.chosen === question.answer` → opponent gets `OPPONENT_MISS_POINTS` (100), answerer 0.
  - both wrong / no opponent shot → 0 / 0.
- `isRoundComplete`: true if the buzzed player answered correctly, OR `opponentShotTaken` is true, OR `timedOut` is true.
- `validatePayload`: MC has no `payload` — always `{ ok: true, payload: null }` (options/answer are validated by the importer already). Keep it trivial but present for interface uniformity.

- [ ] **Step 1: Write the failing tests**

Create `lib/questionTypes/logic/multipleChoice.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multipleChoiceLogic } from './multipleChoice';

const q = { payload: null, options: ['A', 'B', 'C', 'D'], answer: 'B' };

test('correct buzz scores calcBuzzPoints for the answerer', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'B' }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 200); // calcBuzzPoints(20) = round(20*10)
  assert.equal(r.points.opponent, 0);
});

test('wrong buzz then correct opponent shot scores the opponent 100', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'A' }, opponent: { chosen: 'B' },
    mySecondsLeft: 12, opponentSecondsLeft: 5,
  });
  assert.equal(r.points.mine, 0);
  assert.equal(r.points.opponent, 100);
});

test('both wrong scores nobody', () => {
  const r = multipleChoiceLogic.score({
    question: q, mine: { chosen: 'A' }, opponent: { chosen: 'C' },
    mySecondsLeft: 12, opponentSecondsLeft: 5,
  });
  assert.deepEqual(r.points, { mine: 0, opponent: 0 });
});

test('isRoundComplete: correct answer ends the round', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    roundStyle: 'buzz',
    submissions: { p1: { submission: { chosen: 'B' }, secondsLeft: 20 } },
    buzzedPlayerId: 'p1', opponentShotTaken: false, playerIds: ['p1', 'p2'], timedOut: false,
  }), true);
});

test('isRoundComplete: wrong answer, no opponent shot yet, not timed out -> false', () => {
  assert.equal(multipleChoiceLogic.isRoundComplete({
    roundStyle: 'buzz',
    submissions: { p1: { submission: { chosen: 'A' }, secondsLeft: 20 } },
    buzzedPlayerId: 'p1', opponentShotTaken: false, playerIds: ['p1', 'p2'], timedOut: false,
  }), false);
});

test('validatePayload is trivially ok for MC', () => {
  assert.deepEqual(multipleChoiceLogic.validatePayload(undefined), { ok: true, payload: null });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx tsx --test lib/questionTypes/logic/multipleChoice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `multipleChoice.ts`**

```ts
import type { TypeLogic, DescriptorScoreInput, DescriptorRoundState } from './types';
import { calcBuzzPoints, OPPONENT_MISS_POINTS } from '../../gameLogic';

export interface MultipleChoiceSubmission { chosen: string }

function score(input: DescriptorScoreInput<null, MultipleChoiceSubmission>) {
  const { question, mine, opponent, mySecondsLeft } = input;
  const answer = question.answer ?? '';
  const mineCorrect = !!mine && mine.chosen === answer;
  if (mineCorrect) {
    return { points: { mine: calcBuzzPoints(mySecondsLeft ?? 0), opponent: 0 }, breakdown: { winner: 'mine' as const } };
  }
  const oppCorrect = !!opponent && opponent.chosen === answer;
  if (oppCorrect) {
    return { points: { mine: 0, opponent: OPPONENT_MISS_POINTS }, breakdown: { winner: 'opponent' as const } };
  }
  return { points: { mine: 0, opponent: 0 }, breakdown: { winner: 'none' as const } };
}

function isRoundComplete(state: DescriptorRoundState<MultipleChoiceSubmission>): boolean {
  if (state.timedOut) return true;
  if (state.opponentShotTaken) return true;
  const buzzed = state.buzzedPlayerId ? state.submissions[state.buzzedPlayerId] : undefined;
  return !!buzzed; // once the buzzed player has answered, the host resolves correct/wrong
}

export const multipleChoiceLogic: TypeLogic<null, MultipleChoiceSubmission> = {
  id: 'multiple_choice',
  roundStyle: 'buzz',
  timerSeconds: 30,
  score,
  isRoundComplete,
  validatePayload: () => ({ ok: true, payload: null }),
};
```

Note on `isRoundComplete`: for a `buzz` round the host still applies the "wrong → opponent shot" branch itself (see Task 10). `isRoundComplete` returning `true` here means "the host may now score and reveal" — the host only reaches that check after it has decided no opponent shot is pending.

- [ ] **Step 4: Run, verify pass**

Run: `npx tsx --test lib/questionTypes/logic/multipleChoice.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: green; baseline tsc errors only.

- [ ] **Step 6: Commit**

```bash
git add lib/questionTypes/logic/multipleChoice.ts lib/questionTypes/logic/multipleChoice.test.ts
git commit -m "feat(questionTypes): multiple_choice descriptor logic"
```

---

### Task 5: `ordering` descriptor logic

**Files:**
- Create: `lib/questionTypes/logic/ordering.ts`
- Create: `lib/questionTypes/logic/ordering.test.ts`

**Interfaces:**
- Consumes: `TypeLogic`, `OrderingPayload` from `./types`; `calcPartialCreditPoints`, `checkOrderingCorrectness` from `../../gameLogic`.
- Produces: `orderingLogic: TypeLogic<OrderingPayload, OrderingSubmission>` where `interface OrderingSubmission { order: string[] }`.
- Scoring (unchanged formula, now per-player, both scored): for each player `p` with a submission, `points = calcPartialCreditPoints(checkOrderingCorrectness(p.order, payload.items), payload.items.length, p.secondsLeft)`. A player with no submission scores 0. Result maps `mine`/`opponent` from `input.mine`/`input.opponent`.
- `isRoundComplete`: `state.timedOut`, OR every id in `playerIds` has a submission.
- `validatePayload`: `payload.items` is an array of exactly 4 distinct strings (mirrors `import-questions.js:74-79`).

- [ ] **Step 1: Write failing tests**

Create `lib/questionTypes/logic/ordering.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderingLogic } from './ordering';

const payload = { items: ['a', 'b', 'c', 'd'] };

test('both players scored independently by partial credit', () => {
  const r = orderingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { order: ['a', 'b', 'c', 'd'] },       // 4/4
    opponent: { order: ['b', 'a', 'c', 'd'] },   // 2/4
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 150);
});

test('a non-submitter scores 0', () => {
  const r = orderingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { order: ['a', 'b', 'c', 'd'] }, opponent: null,
    mySecondsLeft: 20, opponentSecondsLeft: null,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 0);
});

test('isRoundComplete when both submitted', () => {
  assert.equal(orderingLogic.isRoundComplete({
    roundStyle: 'concurrent',
    submissions: { p1: { submission: { order: [] }, secondsLeft: 5 }, p2: { submission: { order: [] }, secondsLeft: 3 } },
    buzzedPlayerId: null, opponentShotTaken: false, playerIds: ['p1', 'p2'], timedOut: false,
  }), true);
});

test('isRoundComplete false when only one submitted and not timed out', () => {
  assert.equal(orderingLogic.isRoundComplete({
    roundStyle: 'concurrent',
    submissions: { p1: { submission: { order: [] }, secondsLeft: 5 } },
    buzzedPlayerId: null, opponentShotTaken: false, playerIds: ['p1', 'p2'], timedOut: false,
  }), false);
});

test('validatePayload rejects non-distinct items', () => {
  assert.equal(orderingLogic.validatePayload({ items: ['a', 'a', 'c', 'd'] }).ok, false);
});

test('validatePayload rejects wrong count', () => {
  assert.equal(orderingLogic.validatePayload({ items: ['a', 'b', 'c'] }).ok, false);
});

test('validatePayload accepts 4 distinct strings', () => {
  const v = orderingLogic.validatePayload({ items: ['a', 'b', 'c', 'd'] });
  assert.equal(v.ok, true);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx tsx --test lib/questionTypes/logic/ordering.test.ts` — FAIL, module not found.

- [ ] **Step 3: Implement `ordering.ts`**

```ts
import type { TypeLogic, OrderingPayload, DescriptorScoreInput, DescriptorRoundState } from './types';
import { calcPartialCreditPoints, checkOrderingCorrectness } from '../../gameLogic';

export interface OrderingSubmission { order: string[] }

function scoreOne(sub: OrderingSubmission | null, items: string[], secondsLeft: number | null): number {
  if (!sub || secondsLeft == null) return 0;
  return calcPartialCreditPoints(checkOrderingCorrectness(sub.order, items), items.length, secondsLeft);
}

function score(input: DescriptorScoreInput<OrderingPayload, OrderingSubmission>) {
  const items = input.question.payload?.items ?? [];
  return {
    points: {
      mine: scoreOne(input.mine, items, input.mySecondsLeft),
      opponent: scoreOne(input.opponent, items, input.opponentSecondsLeft),
    },
    breakdown: { items },
  };
}

function isRoundComplete(state: DescriptorRoundState<OrderingSubmission>): boolean {
  if (state.timedOut) return true;
  return state.playerIds.every((id) => state.submissions[id] !== undefined);
}

function validatePayload(raw: unknown) {
  const items = (raw as any)?.items;
  if (!Array.isArray(items) || items.length !== 4) return { ok: false as const, error: 'ordering payload.items must be an array of exactly 4 strings' };
  if (items.some((i) => typeof i !== 'string' || !i.trim())) return { ok: false as const, error: 'every ordering item must be a non-empty string' };
  if (new Set(items).size !== 4) return { ok: false as const, error: 'ordering items must be distinct' };
  return { ok: true as const, payload: { items: items.slice() } };
}

export const orderingLogic: TypeLogic<OrderingPayload, OrderingSubmission> = {
  id: 'ordering', roundStyle: 'concurrent', timerSeconds: 20, score, isRoundComplete, validatePayload,
};
```

- [ ] **Step 4: Run, verify pass** — `npx tsx --test lib/questionTypes/logic/ordering.test.ts` → PASS (7).

- [ ] **Step 5: Full suite + typecheck** — `npm run test && npx tsc --noEmit` → green.

- [ ] **Step 6: Commit**

```bash
git add lib/questionTypes/logic/ordering.ts lib/questionTypes/logic/ordering.test.ts
git commit -m "feat(questionTypes): ordering descriptor logic"
```

---

### Task 6: `matching` descriptor logic

**Files:**
- Create: `lib/questionTypes/logic/matching.ts`
- Create: `lib/questionTypes/logic/matching.test.ts`

**Interfaces:**
- Consumes: `TypeLogic`, `MatchingPayload` from `./types`; `calcPartialCreditPoints`, `checkMatchingCorrectness`, `MatchPair` from `../../gameLogic`.
- Produces: `matchingLogic: TypeLogic<MatchingPayload, MatchingSubmission>` where `interface MatchingSubmission { pairs: MatchPair[] }`.
- Scoring: same shape as ordering — `calcPartialCreditPoints(checkMatchingCorrectness(sub.pairs, payload.pairs), payload.pairs.length, secondsLeft)` per player.
- `isRoundComplete`: identical to ordering.
- `validatePayload`: `payload.pairs` is exactly 4 `{left,right}` string objects with distinct `left` values (mirrors `import-questions.js:81-85`).

- [ ] **Step 1: Write failing tests** — analogous to Task 5; include:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingLogic } from './matching';

const payload = { pairs: [
  { left: 'Noah', right: 'Ark' }, { left: 'Jonah', right: 'Fish' },
  { left: 'David', right: 'Goliath' }, { left: 'Moses', right: 'Exodus' },
]};

test('matching scored per player by partial credit', () => {
  const r = matchingLogic.score({
    question: { payload, options: null, answer: null },
    mine: { pairs: payload.pairs },                                  // 4/4
    opponent: { pairs: [{ left: 'Noah', right: 'Fish' }, { left: 'Jonah', right: 'Ark' },
                        { left: 'David', right: 'Goliath' }, { left: 'Moses', right: 'Exodus' }] }, // 2/4
    mySecondsLeft: 20, opponentSecondsLeft: 20,
  });
  assert.equal(r.points.mine, 300);
  assert.equal(r.points.opponent, 150);
});

test('validatePayload rejects duplicate left values', () => {
  assert.equal(matchingLogic.validatePayload({ pairs: [
    { left: 'A', right: '1' }, { left: 'A', right: '2' },
    { left: 'C', right: '3' }, { left: 'D', right: '4' },
  ]}).ok, false);
});

test('validatePayload accepts 4 pairs with distinct lefts', () => {
  assert.equal(matchingLogic.validatePayload(payload).ok, true);
});
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement `matching.ts`** — structurally identical to `ordering.ts`, substituting `checkMatchingCorrectness`, `payload.pairs`, and the pair-shape validation:
```ts
function validatePayload(raw: unknown) {
  const pairs = (raw as any)?.pairs;
  if (!Array.isArray(pairs) || pairs.length !== 4) return { ok: false as const, error: 'matching payload.pairs must be an array of exactly 4 pairs' };
  if (pairs.some((p) => !p || typeof p.left !== 'string' || typeof p.right !== 'string' || !p.left.trim() || !p.right.trim()))
    return { ok: false as const, error: 'every matching pair needs a non-empty string "left" and "right"' };
  if (new Set(pairs.map((p) => p.left)).size !== 4) return { ok: false as const, error: 'matching "left" values must be distinct' };
  return { ok: true as const, payload: { pairs: pairs.map((p) => ({ left: p.left, right: p.right })) } };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Full suite + typecheck** → green.

- [ ] **Step 6: Commit**

```bash
git add lib/questionTypes/logic/matching.ts lib/questionTypes/logic/matching.test.ts
git commit -m "feat(questionTypes): matching descriptor logic"
```

---

### Task 7: Pure logic registry (replaces `lib/questionTypes.ts`)

**Files:**
- Create: `lib/questionTypes/logic/index.ts`
- Create: `lib/questionTypes/logic/index.test.ts`
- Delete: `lib/questionTypes.ts`, `lib/questionTypes.test.ts`

**Interfaces:**
- Consumes: the three `*Logic` objects.
- Produces:
  - `getTypeLogic(type: string | null | undefined): TypeLogic` — returns the matching logic, or `multipleChoiceLogic` for unknown/missing (safe default).
  - `getInteractionMode(type): 'race' | 'simultaneous'` — `getTypeLogic(type).roundStyle === 'buzz' ? 'race' : 'simultaneous'`. Kept for back-compat with any remaining callers.
  - `TYPE_LOGICS: Record<string, TypeLogic>`

- [ ] **Step 1: Write `lib/questionTypes/logic/index.test.ts`**

Port the six cases from `lib/questionTypes.test.ts` (they still pass because unknown → MC → `'race'`), and add:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTypeLogic, getInteractionMode } from './index';

test('getTypeLogic returns the ordering logic for "ordering"', () => {
  assert.equal(getTypeLogic('ordering').id, 'ordering');
});

test('getTypeLogic falls back to multiple_choice for unknown', () => {
  assert.equal(getTypeLogic('nope').id, 'multiple_choice');
  assert.equal(getTypeLogic(null).id, 'multiple_choice');
});

test('getInteractionMode: ordering -> simultaneous, multiple_choice -> race', () => {
  assert.equal(getInteractionMode('ordering'), 'simultaneous');
  assert.equal(getInteractionMode('matching'), 'simultaneous');
  assert.equal(getInteractionMode('multiple_choice'), 'race');
  assert.equal(getInteractionMode('free_text'), 'race');
  assert.equal(getInteractionMode(undefined), 'race');
});
```

- [ ] **Step 2: Run, verify failure** — `npx tsx --test lib/questionTypes/logic/index.test.ts`.

- [ ] **Step 3: Implement `lib/questionTypes/logic/index.ts`**

```ts
import type { TypeLogic } from './types';
import { multipleChoiceLogic } from './multipleChoice';
import { orderingLogic } from './ordering';
import { matchingLogic } from './matching';

export * from './types';
export { multipleChoiceLogic } from './multipleChoice';
export { orderingLogic } from './ordering';
export { matchingLogic } from './matching';

export const TYPE_LOGICS: Record<string, TypeLogic<any, any>> = {
  multiple_choice: multipleChoiceLogic,
  ordering: orderingLogic,
  matching: matchingLogic,
};

/** Returns the logic for `type`, or the multiple_choice logic for any
 *  unknown/missing type so new content fails safe into buzz-in play. */
export function getTypeLogic(type: string | null | undefined): TypeLogic<any, any> {
  return (type && TYPE_LOGICS[type]) || multipleChoiceLogic;
}

export type InteractionMode = 'race' | 'simultaneous';

/** Back-compat wrapper. Prefer getTypeLogic(...).roundStyle in new code. */
export function getInteractionMode(type: string | null | undefined): InteractionMode {
  return getTypeLogic(type).roundStyle === 'buzz' ? 'race' : 'simultaneous';
}
```

- [ ] **Step 4: Delete the old files and repoint the only non-host caller**

```bash
git rm lib/questionTypes.ts lib/questionTypes.test.ts
```
`grep -rn "from '.*questionTypes'" --include=*.ts --include=*.tsx .` — the only hits are `app/game/[roomId].tsx` (handled in Task 10) and now-deleted files. If any other file imports `getInteractionMode`, repoint it to `../lib/questionTypes/logic` (adjust depth). Leave `[roomId].tsx` for Task 10.

- [ ] **Step 5: Run, verify pass + full suite**

Run: `npm run test`
Expected: `[roomId].tsx` still imports the deleted path — **this is expected and fixed in Task 10**. If `npm run test` fails only because of a TS resolution error in `[roomId].tsx`, that's acceptable for this task's commit *only if* `npx tsx --test "lib/**/*.test.ts"` is green on its own. Run that explicitly:
```bash
npx tsx --test "lib/**/*.test.ts" "components/**/*.test.ts"
```
Expected: PASS. (Unit tests don't import `[roomId].tsx`.)

> If you prefer not to leave a broken import between tasks, do Task 10 in the same working session and commit them together — but the plan keeps them separate so the host refactor gets its own review gate.

- [ ] **Step 6: Commit**

```bash
git add lib/questionTypes/
git commit -m "feat(questionTypes): pure logic registry; remove flat questionTypes module"
```

---

### Task 8: DB-conditional room advance

**Files:**
- Create: `lib/roomAdvance.ts`
- Create: `lib/roomAdvance.test.ts`

**Interfaces:**
- Produces:
  - `interface AdvanceDecision { kind: 'next'; nextIndex: number; nextQuestionId: string } | { kind: 'game_over' }`
  - `decideAdvance(currentIndex: number, questionIds: string[]): AdvanceDecision` — pure.
  - `async advanceRoom(supabase, roomId, currentIndex, questionIds, hostId): Promise<'advanced' | 'noop'>` — performs the conditional update + event insert; returns `'noop'` if another call already advanced past `currentIndex`.

- [ ] **Step 1: Write failing tests for `decideAdvance`**

Create `lib/roomAdvance.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAdvance } from './roomAdvance';

test('advances to the next question when more remain', () => {
  assert.deepEqual(decideAdvance(0, ['q0', 'q1', 'q2']), { kind: 'next', nextIndex: 1, nextQuestionId: 'q1' });
});

test('reports game_over on the last question', () => {
  assert.deepEqual(decideAdvance(2, ['q0', 'q1', 'q2']), { kind: 'game_over' });
});

test('reports game_over when currentIndex is already past the end', () => {
  assert.deepEqual(decideAdvance(5, ['q0', 'q1']), { kind: 'game_over' });
});
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement `lib/roomAdvance.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type AdvanceDecision =
  | { kind: 'next'; nextIndex: number; nextQuestionId: string }
  | { kind: 'game_over' };

export function decideAdvance(currentIndex: number, questionIds: string[]): AdvanceDecision {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= questionIds.length) return { kind: 'game_over' };
  return { kind: 'next', nextIndex, nextQuestionId: questionIds[nextIndex] };
}

/**
 * Advances the room past `currentIndex` exactly once, no matter how many
 * callers fire for the same index. The guard is the WHERE clause on the
 * UPDATE: the first call flips current_question_index and its `.select()`
 * returns the row; a concurrent second call matches no row (index already
 * moved) and returns nothing, so it emits no event.
 */
export async function advanceRoom(
  supabase: SupabaseClient,
  roomId: string,
  currentIndex: number,
  questionIds: string[],
  hostId: string
): Promise<'advanced' | 'noop'> {
  const decision = decideAdvance(currentIndex, questionIds);

  if (decision.kind === 'game_over') {
    const { data } = await supabase
      .from('game_rooms')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('status', 'active')
      .select('id');
    if (!data || data.length === 0) return 'noop';
    await supabase.from('game_events').insert({
      room_id: roomId, event_type: 'game_over', player_id: hostId, payload: {},
    });
    return 'advanced';
  }

  const { data } = await supabase
    .from('game_rooms')
    .update({ current_question_index: decision.nextIndex })
    .eq('id', roomId)
    .eq('current_question_index', currentIndex)
    .select('id');
  if (!data || data.length === 0) return 'noop';

  await supabase.from('game_events').insert({
    room_id: roomId,
    event_type: 'next_question',
    player_id: hostId,
    payload: { question_id: decision.nextQuestionId, question_index: decision.nextIndex },
  });
  return 'advanced';
}
```

- [ ] **Step 4: Run, verify pass** — `npx tsx --test lib/roomAdvance.test.ts` → PASS (3).

- [ ] **Step 5: Full unit suite + typecheck**

Run: `npx tsx --test "lib/**/*.test.ts" "components/**/*.test.ts" && npx tsc --noEmit`
Expected: green (the `[roomId].tsx` import from Task 7 may still error under `tsc` — acceptable until Task 10; note it and continue).

- [ ] **Step 6: Commit**

```bash
git add lib/roomAdvance.ts lib/roomAdvance.test.ts
git commit -m "feat(game): DB-conditional room advance (fixes double-advance)"
```

---

### Task 9: `useGameRound` hook

**Files:**
- Create: `app/game/useGameRound.ts`
- Modify: `lib/gameTypes.ts` (add shared types this hook and the host exchange)

**Interfaces:**
- Consumes: `supabase`, `getTypeLogic`, `advanceRoom`, `decideAdvance`.
- Produces a hook the host calls:
  ```ts
  useGameRound(roomId: string, profileId: string | undefined): {
    phase: 'waiting' | 'playing' | 'reveal' | 'results';
    room: RoomRow | null;
    players: PlayerRow[];
    question: Question | null;
    questionIndex: number;
    questionIds: string[];
    timeLeft: number;
    buzzedUserId: string | null;
    submissions: Record<string, { submission: unknown; secondsLeft: number }>;
    roundScore: RoundScoredPayload | null;   // set once round_scored arrives
    isHost: boolean;
    actions: {
      startGame(): Promise<void>;
      buzzIn(): Promise<void>;
      submitRound(submission: unknown): Promise<void>;
      leave(): void;
    };
  }
  ```
- `RoundScoredPayload = { points: Record<string, number>; breakdown: unknown; correctAnswer: string | null }`.

**This task is a mechanical extraction, not new behavior.** It moves the following out of `[roomId].tsx` verbatim (adjusting names): `loadRoom`, `loadPlayers`, `loadQuestion`, both realtime `useEffect`s, `startTimer`/`stopTimer` + the two timer refs, `handleStartGame`, `handleBuzzIn`, and the two advance `useEffect`s. The host keeps only rendering + the score-writing logic (Task 10).

- [ ] **Step 1: Add shared types to `lib/gameTypes.ts`**

Append:
```ts
export interface RoomRow {
  id: string; code: string; host_id: string; mode: '1v1' | 'teams';
  status: 'waiting' | 'active' | 'finished';
  current_question_index: number; question_ids: string[];
}

export type GamePhaseV3 = 'waiting' | 'playing' | 'reveal' | 'results';

export interface RoundScoredPayload {
  points: Record<string, number>;
  breakdown: unknown;
  correctAnswer: string | null;
}
```
Also widen `Question.payload` to `| { items: string[] } | { pairs: MatchPair[] } | Record<string, unknown> | null` so future payloads typecheck (Plan 2 narrows per-type).

- [ ] **Step 2: Create `app/game/useGameRound.ts` by extraction**

Move the listed functions/effects from `[roomId].tsx`. Key adaptations:
- Phase names: `question`/`buzzed`/`arranging` all collapse to `'playing'`; keep `buzzedUserId` as returned state (not a phase).
- `loadQuestion` no longer calls `setPhase('arranging')` — the host renders by descriptor, not by a per-type phase.
- The timer duration comes from `getTypeLogic(q.type).timerSeconds` (replaces `timerSecondsFor`).
- The realtime `handleGameEvent` switch handles `game_start`, `buzz_in`, `next_question`, `game_over` as before; **`round_submit`** appends to `submissions`; **`round_scored`** sets `roundScore` and moves `phase` to `'reveal'`. `answer` and `sequence_submit` cases are **removed**.
- The "advance on completion" and "advance on timeout" effects stay in the hook but call a host-provided callback `onRoundComplete()` instead of `advanceGame()` directly — the host owns scoring (Task 10). Expose `timedOut: boolean` and `submissions` so the host can react. Simplest split: the hook exposes `timeLeft`, `submissions`, `phase`, `isHost`, `buzzedUserId`; the **host** runs the completion `useEffect` (it needs the descriptor + player scores). Move only the realtime subscription, `loadRoom/loadPlayers/loadQuestion`, and the timer into the hook. Leave the completion/timeout effects in the host.

  > Decision for the implementer: keep the hook to **data + timer + realtime plumbing**. The completion/scoring/advance effects live in the host (Task 10) because they need descriptor logic and the players array. This keeps the hook free of game-rule knowledge.

- [ ] **Step 3: Typecheck the hook in isolation**

Run: `npx tsc --noEmit`
Expected: `useGameRound.ts` has no errors of its own (the host still does until Task 10).

- [ ] **Step 4: Commit**

```bash
git add app/game/useGameRound.ts lib/gameTypes.ts
git commit -m "feat(game): extract useGameRound hook (data + timer + realtime)"
```

---

### Task 10: Refactor `[roomId].tsx` into a thin host

**Files:**
- Modify: `app/game/[roomId].tsx` (major reduction — target < 200 lines)
- Create: `lib/questionTypes/index.tsx` (app descriptor registry)
- Modify: `components/game/QuestionPhase.tsx`, `OrderingPhase.tsx`, `MatchingPhase.tsx` (adapt to `PlayProps`)
- Modify: `components/game/RevealPhase.tsx` (becomes MC `RevealComponent`)

**Interfaces:**
- Consumes: `useGameRound` (Task 9), `getTypeLogic` (Task 7), `advanceRoom` (Task 8).
- Produces: `getDescriptor(type)` from `lib/questionTypes/index.tsx`:
  ```ts
  interface QuestionDescriptor {
    logic: TypeLogic;
    PlayComponent: React.ComponentType<PlayProps>;
    RevealComponent: React.ComponentType<RevealProps>;
  }
  getDescriptor(type: string | null | undefined): QuestionDescriptor
  ```
- `PlayProps` (spec §2.4):
  ```ts
  interface PlayProps {
    question: Question;
    questionId: string;
    timeLeft: number;
    hasSubmitted: boolean;
    buzzedByMe: boolean;
    buzzedByOpponent: boolean;
    onBuzz?: () => void;
    onSubmit: (submission: unknown) => void;
  }
  ```
- `RevealProps`:
  ```ts
  interface RevealProps {
    question: Question;
    breakdown: unknown;
    myPointsThisRound: number;
    myRunningTotal: number;
  }
  ```

- [ ] **Step 1: Create `lib/questionTypes/index.tsx`**

```tsx
import type { TypeLogic } from './logic';
import { getTypeLogic } from './logic';
import { QuestionPhase } from '../../components/game/QuestionPhase';
import { OrderingPhase } from '../../components/game/OrderingPhase';
import { MatchingPhase } from '../../components/game/MatchingPhase';
import { RevealPhase } from '../../components/game/RevealPhase';
import type { PlayProps, RevealProps } from './uiTypes';

export interface QuestionDescriptor {
  logic: TypeLogic<any, any>;
  PlayComponent: React.ComponentType<PlayProps>;
  RevealComponent: React.ComponentType<RevealProps>;
}

const UI: Record<string, { Play: React.ComponentType<PlayProps>; Reveal: React.ComponentType<RevealProps> }> = {
  multiple_choice: { Play: QuestionPhase, Reveal: RevealPhase },
  ordering: { Play: OrderingPhase, Reveal: RevealPhase },   // Reveal reused until Plan 2 gives ordering its own
  matching: { Play: MatchingPhase, Reveal: RevealPhase },
};

export function getDescriptor(type: string | null | undefined): QuestionDescriptor {
  const logic = getTypeLogic(type);
  const ui = UI[logic.id] ?? UI.multiple_choice;
  return { logic, PlayComponent: ui.Play, RevealComponent: ui.Reveal };
}
```
Create `lib/questionTypes/uiTypes.ts` holding `PlayProps` / `RevealProps` (pure types, importable by components without a cycle).

- [ ] **Step 2: Adapt `QuestionPhase.tsx` to `PlayProps`**

- Replace the props interface with `PlayProps`.
- `phase === 'question'` → `!buzzedByMe && !buzzedByOpponent`; `phase === 'buzzed'` → `buzzedByMe || buzzedByOpponent`.
- `isBuzzedIn` → `buzzedByMe`.
- `handlePickOption` calls `onSubmit({ chosen: option })` (a `MultipleChoiceSubmission`), not `onSubmitAnswer(option)`.
- `onBuzzIn` → `onBuzz`.
- The buzz pulse `Animated.Value` currently comes from the host as `buzzScale`; move it **inside** `QuestionPhase` (local `useRef(new Animated.Value(1))`, pulse on mount when `buzzedByMe || buzzedByOpponent` flips true).
- Keep the "options missing → question unavailable" defensive branch.

- [ ] **Step 3: Adapt `OrderingPhase.tsx` and `MatchingPhase.tsx` to `PlayProps`**

- Props interface → `PlayProps`. Read `items` / `pairs` from `question.payload`.
- `onSubmit(order)` → `onSubmit({ order })`; `onSubmit(submittedPairs)` → `onSubmit({ pairs: submittedPairs })`.
- Everything else (arrow reorder, tap-pair, `hasSubmittedRef`, `Lock In` button) is unchanged.

- [ ] **Step 4: Adapt `RevealPhase.tsx` to `RevealProps`**

- Props → `RevealProps`. Derive `correct` from `breakdown` (`(breakdown as any)?.winner === 'mine'`) for MC, else fall back to comparing points.
- Drop `onNext` / `onOpponentAnswer` / `isHost` buttons — advance is now host-timed (the host calls `advanceRoom` after the reveal window; see Step 6). Show "The answer was: {question.answer}" + points this round + running total. The host wraps this in `RevealFrame` in Task 14; for now render plain.

- [ ] **Step 5: Rewrite `[roomId].tsx` as the thin host**

Target structure:
```tsx
export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { profile } = useAuthStore();
  const round = useGameRound(roomId!, profile?.id);
  const { phase, room, players, question, questionIndex, questionIds,
          timeLeft, buzzedUserId, submissions, roundScore, isHost, actions } = round;

  const descriptor = question ? getDescriptor(question.type) : null;
  const myPlayer = players.find((p) => p.user_id === profile?.id);
  const opponent = players.find((p) => p.user_id !== profile?.id);

  // ── Host: resolve a completed round exactly once ──────────────
  const scoredForIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHost || !descriptor || phase !== 'playing' || !room) return;
    const state = buildRoundState(descriptor.logic, submissions, buzzedUserId,
                                  players.map((p) => p.user_id), timeLeft <= 0);
    // buzz style: wrong answer + opponent hasn't shot yet -> emit opponent_shot instead of scoring
    if (descriptor.logic.roundStyle === 'buzz' && needsOpponentShot(state, question, descriptor.logic)) {
      maybeEmitOpponentShot(...);   // see Step 5c
      return;
    }
    if (!descriptor.logic.isRoundComplete(state)) return;
    if (scoredForIndexRef.current === questionIndex) return;
    scoredForIndexRef.current = questionIndex;
    resolveAndScoreRound({ descriptor, question, submissions, players, profile, roomId, isHost });
  }, [isHost, descriptor, phase, submissions, buzzedUserId, timeLeft, players, room]);

  // ── Host: advance after the reveal window ────────────────────
  useEffect(() => {
    if (!isHost || phase !== 'reveal' || !room) return;
    const t = setTimeout(() => {
      advanceRoom(supabase, roomId!, questionIndex, questionIds, profile!.id);
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [isHost, phase, questionIndex, room]);

  // render: topBar + scoreBar + one of:
  //   phase 'waiting'  -> <WaitingPhase .../>
  //   phase 'playing'  -> <descriptor.PlayComponent {...playProps}/>
  //   phase 'reveal'   -> <descriptor.RevealComponent {...revealProps}/>
  //   phase 'results'  -> <ResultsPhase .../>
}
```

- **5a — `buildRoundState`** (put in `lib/questionTypes/logic/roundState.ts`, pure, unit-tested):
  ```ts
  export function buildRoundState(logic, submissions, buzzedPlayerId, playerIds, timedOut): DescriptorRoundState {
    return { roundStyle: logic.roundStyle, submissions, buzzedPlayerId,
             opponentShotTaken: /* derived: both playerIds have a submission on a buzz round */,
             playerIds, timedOut };
  }
  ```
  Add 3 tests: concurrent both-submitted, buzz one-submitted, timeout.

- **5b — `resolveAndScoreRound`** (host helper, in `app/game/scoreRound.ts`):
  builds `DescriptorScoreInput` (mapping this-host's `profile.id` → `mine`, the other player → `opponent`), calls `descriptor.logic.score(input)`, then:
  1. `update game_players set score = score + points` for each player (two writes),
  2. `insert game_events { event_type: 'round_scored', payload: { points: {playerId: n}, breakdown, correctAnswer: question.answer } }`.
  The `round_scored` handler in `useGameRound` sets `roundScore` and flips `phase` to `'reveal'` for **all** clients.

- **5c — opponent shot for buzz rounds:** keep the current behavior — after the buzzed player submits a wrong `chosen`, the host awards the opponent a shot. Reuse the existing `handleOpponentAnswer` flow but drive it from the effect: emit a `buzz_in`-like `opponent_shot` event that flips the opponent to `buzzedByMe` on their client and opens their option grid. When they submit (another `round_submit`), `opponentShotTaken` becomes true and the next effect run scores. Keep this minimal — MC is the only buzz type in Plan 1.

  > If 5c proves fiddly, an acceptable Plan-1 simplification: on a wrong buzz, the host immediately scores the round (opponent gets 0) and reveals — i.e. no opponent shot. This is a **behavior regression** from today, so only take it with the owner's sign-off. Note it in the commit and the plan's open-questions list. Default: implement the shot.

- [ ] **Step 6: Repoint the `getInteractionMode` import**

`[roomId].tsx` no longer imports from `../../lib/questionTypes`. Any lingering reference → `../../lib/questionTypes/logic`. Confirm with `grep -rn questionTypes app/`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: back to only the 6 baseline `profile.tsx` errors. Fix any new error in the files this task touched.

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: all green.

- [ ] **Step 9: Manual parity playtest — web**

`npx expo start --web`, then with the seeded rooms (`node scripts/seed-test-room.js playtester` for `TESTTY`; a fresh `Create Game` for a race game). Verify against today's behavior:
- MC race: buzz → 4-option grid → pick correct → reveal shows "Correct!" + points → auto-advances after the reveal window (no "Next Question" button needed) → next question loads.
- MC race wrong answer → opponent gets a shot → opponent correct scores 100 → advance.
- Ordering (`TESTTY` Q1): arrows reorder, Lock In → both-submitted or timeout → reveal → advance. Score matches the old partial-credit numbers.
- Matching (`TESTTY` Q3): tap-pair, Lock In → reveal → advance.
- Let a question's timer hit 0 with no submission → auto-advance, no hang.
- Reach the results screen after the last question; "Back to Home" works.
- Zero console errors.

- [ ] **Step 10: Manual parity playtest — Expo Go**

`npx expo start --offline`, repeat the MC race + one ordering + one matching flow on a phone. Confirm no regressions and no red box.

- [ ] **Step 11: Commit**

```bash
git add app/game/ lib/questionTypes/ components/game/QuestionPhase.tsx components/game/OrderingPhase.tsx components/game/MatchingPhase.tsx components/game/RevealPhase.tsx
git commit -m "refactor(game): thin descriptor-driven host; round_submit/round_scored; host-side scoring"
```

---

### Task 11: Update `schema.sql` event comment + defensive cleanup

**Files:**
- Modify: `supabase/schema.sql:107`

- [ ] **Step 1: Update the event-type comment**

Change line 107 from:
```
  event_type text not null, -- 'game_start' | 'buzz_in' | 'answer' | 'sequence_submit' | 'next_question' | 'game_over'
```
to:
```
  event_type text not null, -- 'game_start' | 'buzz_in' | 'opponent_shot' | 'round_submit' | 'round_scored' | 'next_question' | 'game_over'
```

- [ ] **Step 2: Confirm no code still emits the old event types**

Run: `grep -rn "'answer'\|'sequence_submit'" app/ lib/ components/`
Expected: no matches (both removed in Task 10). If any remain, remove them.

- [ ] **Step 3: Full suite + typecheck + commit**

```bash
npm run test && npx tsc --noEmit
git add supabase/schema.sql
git commit -m "docs(schema): update game_events event-type comment for v3 events"
```

---

## PART C — Visual System

### Task 12: `Mascot` component

**Files:**
- Create: `components/Mascot.tsx`
- Create: `assets/mascot-placeholder.txt` (a note pointing at where real art goes — the SVG is inline in the component for now)

**Interfaces:**
- Produces: `<Mascot mood="idle" | "cheer" | "sad" | "think" | "taunt" size={number} />` (default `size={96}`).

- [ ] **Step 1: Implement `Mascot.tsx`**

A self-contained SVG character (`react-native-svg`) — a simple round face with eyes and a mouth is fine — animated with Reanimated:
```tsx
import { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withSpring, Easing } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

export type MascotMood = 'idle' | 'cheer' | 'sad' | 'think' | 'taunt';

export function Mascot({ mood = 'idle', size = 96 }: { mood?: MascotMood; size?: number }) {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    // idle bob always runs
    translateY.value = withRepeat(withTiming(-6, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);

  useEffect(() => {
    if (mood === 'cheer' || mood === 'taunt') {
      scale.value = withSequence(withSpring(1.15), withSpring(1));
      translateY.value = withSequence(withTiming(-18, { duration: 160 }), withSpring(0));
    } else if (mood === 'sad') {
      translateY.value = withTiming(6, { duration: 300 });
      rotate.value = withTiming(0.05, { duration: 300 });
    } else if (mood === 'think') {
      rotate.value = withRepeat(withTiming(-0.08, { duration: 700 }), -1, true);
    }
  }, [mood]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}rad` },
      { scale: scale.value },
    ],
  }));

  const mouth = mood === 'sad'
    ? 'M 30 62 Q 48 50 66 62'
    : mood === 'cheer' || mood === 'taunt'
    ? 'M 28 54 Q 48 78 68 54'
    : 'M 32 58 Q 48 66 64 58';

  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Circle cx="48" cy="48" r="40" fill="#8B5CF6" />
        <Circle cx="36" cy="42" r="5" fill="#FFF" />
        <Circle cx="60" cy="42" r="5" fill="#FFF" />
        <Path d={mouth} stroke="#FFF" strokeWidth={4} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}
```

- [ ] **Step 2: Smoke-render it**

Temporarily drop `<Mascot mood="cheer" />` into `WaitingPhase.tsx`, run `npx expo start --web`, confirm it renders and bobs, then move it to a permanent spot: the `WaitingPhase` lobby (mood `"idle"`). Remove the temporary usage.

- [ ] **Step 3: Typecheck + test + commit**

```bash
npm run test && npx tsc --noEmit
git add components/Mascot.tsx assets/mascot-placeholder.txt components/game/WaitingPhase.tsx
git commit -m "feat(visual): Mascot component with placeholder art + Reanimated moods"
```

---

### Task 13: `Celebration` component

**Files:**
- Create: `components/game/Celebration.tsx`

**Interfaces:**
- Produces: `<Celebration play={boolean} />` — when `play` flips to `true`, emits a one-shot particle burst (~12 particles, Reanimated `withTiming` outward + fade, ~1.5 s), then renders nothing.

- [ ] **Step 1: Implement `Celebration.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

const COLORS = ['#8B5CF6', '#2ECC71', '#FBBF24', '#FB7185', '#3DA5F5'];
const N = 12;

function Particle({ angle, play }: { angle: number; play: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => { if (play) p.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }); }, [play]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * 120 * p.value },
      { translateY: Math.sin(angle) * 120 * p.value },
      { scale: 0.6 + 0.6 * (1 - p.value) },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS[Math.floor(angle * 10) % COLORS.length] }, style]} />;
}

export function Celebration({ play }: { play: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (play) { setArmed(true); const t = setTimeout(() => setArmed(false), 1600); return () => clearTimeout(t); } }, [play]);
  if (!armed) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: '40%', left: '50%' }}>
      {Array.from({ length: N }, (_, i) => (
        <Particle key={i} angle={(i / N) * Math.PI * 2} play={armed} />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Smoke-render** — temporarily wire `<Celebration play={true} />` into a screen, verify on web, remove the temp wiring.

- [ ] **Step 3: Typecheck + test + commit**

```bash
npm run test && npx tsc --noEmit
git add components/game/Celebration.tsx
git commit -m "feat(visual): Celebration particle burst"
```

---

### Task 14: `RevealFrame` and wire the MC reveal through it

**Files:**
- Create: `components/game/RevealFrame.tsx`
- Modify: `components/game/RevealPhase.tsx` (render inside the frame's body slot)
- Modify: `app/game/[roomId].tsx` (render `RevealFrame` in the `reveal` phase)
- Modify: `components/game/gameStyles.ts` (frame styles)

**Interfaces:**
- Produces:
  ```tsx
  <RevealFrame
    mascotMood={MascotMood}
    pointsThisRound={number}
    runningTotal={number}
    celebrate={boolean}
  >
    {/* type-specific breakdown body */}
  </RevealFrame>
  ```

- [ ] **Step 1: Implement `RevealFrame.tsx`**

```tsx
import { View, Text } from 'react-native';
import { Mascot, type MascotMood } from '../Mascot';
import { Celebration } from './Celebration';
import { gameStyles as styles } from './gameStyles';

export function RevealFrame({
  mascotMood, pointsThisRound, runningTotal, celebrate, children,
}: {
  mascotMood: MascotMood; pointsThisRound: number; runningTotal: number;
  celebrate: boolean; children: React.ReactNode;
}) {
  return (
    <View style={styles.revealFrame}>
      <View style={styles.revealMascotSlot}><Mascot mood={mascotMood} size={72} /></View>
      <View style={styles.revealBody}>{children}</View>
      <View style={styles.revealFooter}>
        <Text style={styles.revealPoints}>
          {pointsThisRound > 0 ? `+${pointsThisRound}` : '—'} this round
        </Text>
        <Text style={styles.revealTotal}>{runningTotal} total</Text>
      </View>
      <Celebration play={celebrate} />
    </View>
  );
}
```

- [ ] **Step 2: Add `gameStyles` entries**

Add `revealFrame`, `revealMascotSlot` (alignSelf flex-end), `revealBody`, `revealFooter` (row, space-between), `revealPoints`, `revealTotal` to `components/game/gameStyles.ts`, matching the existing visual language (see `CardShadow`, `Colors`).

- [ ] **Step 3: Render `RevealFrame` from the host**

In `[roomId].tsx` `phase === 'reveal'` branch:
```tsx
{phase === 'reveal' && descriptor && roundScore && (
  <RevealFrame
    mascotMood={myPoints > 0 ? 'cheer' : 'sad'}
    pointsThisRound={myPoints}
    runningTotal={myPlayer?.score ?? 0}
    celebrate={myPoints >= 150}
  >
    <descriptor.RevealComponent
      question={question!}
      breakdown={roundScore.breakdown}
      myPointsThisRound={myPoints}
      myRunningTotal={myPlayer?.score ?? 0}
    />
  </RevealFrame>
)}
```
where `myPoints = roundScore.points[profile!.id] ?? 0`.

- [ ] **Step 4: Trim `RevealPhase.tsx` to the body only**

Remove its own banner/footer duplication — it now renders just the "answer was X" + (for MC) the correct/wrong marker. `RevealFrame` owns points + mascot + celebration.

- [ ] **Step 5: Manual check — web + Expo Go**

Play a race game: on the reveal screen the mascot appears, cheers on a correct answer with a particle burst, droops on a wrong one; points + running total show; auto-advances. Repeat one ordering round (`TESTTY`). No console errors.

- [ ] **Step 6: Typecheck + test + commit**

```bash
npm run test && npx tsc --noEmit
git add components/game/RevealFrame.tsx components/game/RevealPhase.tsx components/game/gameStyles.ts app/game/[roomId].tsx
git commit -m "feat(visual): RevealFrame shell; MC reveal renders through it with mascot + celebration"
```

---

### Task 15: Cheap transitions + shared visual tokens

**Files:**
- Modify: `components/game/gameStyles.ts` (token block)
- Modify: `app/game/[roomId].tsx` (score bar) or a small `ScoreBar` extraction
- Modify: whichever component renders the timer ring (`QuestionPhase`, `OrderingPhase`, `MatchingPhase` all inline it — extract to `components/game/TimerRing.tsx`)

- [ ] **Step 1: Add a visual-token block to `gameStyles.ts`**

```ts
export const tokens = {
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  timerRingSize: 96,
};
```
Refactor a handful of the most-repeated magic numbers in `gameStyles` to reference `tokens` (do not rewrite the whole file — just the timer ring + card padding).

- [ ] **Step 2: Extract `TimerRing.tsx`**

```tsx
import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { gameStyles as styles } from './gameStyles';
import { Colors } from '../../constants/colors';

export function TimerRing({ timeLeft }: { timeLeft: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (timeLeft <= 5 && timeLeft > 0) {
      pulse.value = withRepeat(withTiming(1.08, { duration: 500 }), -1, true);
    } else {
      cancelAnimation(pulse); pulse.value = 1;
    }
  }, [timeLeft]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const color = timeLeft > 10 ? Colors.success : Colors.danger;
  return (
    <Animated.View style={[styles.timerRing, { borderColor: color }, style]}>
      <Text style={[styles.timerNumber, { color }]}>{timeLeft}</Text>
      <Text style={styles.timerLabel}>sec</Text>
    </Animated.View>
  );
}
```
Replace the inline timer-ring `<View>` in `QuestionPhase`, `OrderingPhase`, `MatchingPhase` with `<TimerRing timeLeft={timeLeft} />`.

- [ ] **Step 3: Animate the score bar values**

In the score bar (host render), wrap each player's displayed score in a small component that eases to the new value with `withTiming` over ~400 ms instead of snapping. Keep it minimal — a `useSharedValue` + `useAnimatedProps` on an `Animated.Text`, or a simple counting `useEffect`.

- [ ] **Step 4: Manual check — web + Expo Go**

Timer ring pulses under 5 s; score bar counts up smoothly after a `round_scored`; no layout jank. Play one full race game + one `TESTTY` round.

- [ ] **Step 5: Typecheck + test + commit**

```bash
npm run test && npx tsc --noEmit
git add components/game/ app/game/[roomId].tsx
git commit -m "feat(visual): TimerRing pulse, score-bar easing, shared style tokens"
```

---

## Self-Review

**1. Spec coverage (spec §1 + §3, execution steps 1–3):**

| Spec item | Task |
|---|---|
| §1.1 descriptor registry, `lib/questionTypes/` directory | 3–7, 10 |
| §1.1 `getInteractionMode` back-compat wrapper | 7 |
| §1.2 scoring at round-complete, host single writer | 10 (5b) |
| §1.2 `round_submit` no score | 9, 10 |
| §1.3 phase machine `waiting→playing→reveal→results` | 9, 10 |
| §1.3 buzz state as host state not a phase | 9, 10 (Step 2) |
| §1.3 `[roomId].tsx` < 300 lines + `useGameRound` | 9, 10 |
| §1.4 `round_submit`/`round_scored` replace `answer`/`sequence_submit` | 10, 11 |
| §1.5 DB-conditional advance, remove `advancedForIndexRef` | 8, 10 |
| §3.1 install reanimated/worklets/gesture-handler/svg | 1 |
| §3.1 no babel.config.js on SDK 57 | 1 (Global Constraints) |
| §3.1 `GestureHandlerRootView` at root | 1 |
| §3.1 `useItemLayout` | 2 |
| §3.2 `Mascot` placeholder art + moods | 12 |
| §3.3 `Celebration` | 13 |
| §3.4 `RevealFrame` supersedes `SequenceRevealPhase`; MC reveal through it | 14 |
| §3.4 `gameStyles` token block | 15 |
| §3.5 phase cross-fade / score-bar easing / timer pulse | 15 |
| MC exact-match (drop `toLowerCase`) — spec §8 | 4 |

**Gaps / deferred to Plan 2 (intentional):** `ResultsPhase` redesign (spec §3.4, execution step 7); importer `validatePayload` delegation (spec §4.1) — the descriptor `validatePayload` functions exist and are tested here, wiring them into `scripts/import-questions.js` waits for Plan 2 when the new types need it; phase cross-fade is the softest §3.5 item — if `expo-router` screen options make it awkward, ship score-bar + timer pulse and note it.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The two places that say "if X proves fiddly, fall back to Y with owner sign-off" (Task 9 Step 2 hook boundary, Task 10 Step 5c opponent shot) are explicit, bounded fallbacks with a default choice stated — not placeholders.

**3. Type consistency:** `TypeLogic` / `DescriptorScoreInput` / `RoundScoreResult` / `DescriptorRoundState` defined in Task 3, used unchanged in 4–10. `PlayProps` / `RevealProps` defined in Task 10 Step 1 (`lib/questionTypes/uiTypes.ts`), consumed by the component adaptations in the same task. `RoundScoredPayload` defined in Task 9 Step 1, consumed in Task 10 Step 5b and Task 14. `advanceRoom` signature identical in Task 8 and its call sites in Task 10.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-05-question-types-v3-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration. Best for this plan because Tasks 3–8 are cleanly isolated and Tasks 9–10 need a careful review gate.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints.

Which approach?
