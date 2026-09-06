# Question Types v3 — Design

## Context

Question Types v1 (`2026-08-30-question-types-design.md`) shipped a pluggable
`multiple_choice / ordering / matching` system on branch
`feature/question-type-system`. v2 (`2026-08-31-question-types-v2-design.md`)
Workstream 1 tightened the question model (MC-only race, hard 4-caps, retuned
scoring) and is **DONE**. The Expo SDK 54→57 upgrade (a v2 WS2 prerequisite)
is **DONE**.

v2 Workstream 2 (drag-reorder ordering, draw-a-line matching) and Workstream 3
(ordering/matching content push) are **deferred** — superseded in priority by
this v3 work. Ordering and matching keep their current arrow-button UI for now.

v3 is driven by two product goals from the owner:

1. **More and more varied question types.** New: numerical estimation,
   progressive clue ("Smart Ass" style), swipe-to-categorize. Later (v3 Spec B):
   tap-the-map geography, Wits & Wagers style, typed fill-in-the-blank.
   Future: image identification, timed rush.
2. **Visual polish.** A mascot with simple animations, celebration moments,
   and a reveal/results screen redesign — pulled forward from v2's "Phase 4,
   post-launch" note and bundled into this work.

The game stays **head-to-head (1v1)**. Teams mode remains a pre-existing,
secondary, partially-working path — not a v3 focus.

## This document = v3 Spec A

Spec A delivers: the **Question Type Framework v3** generalization, the three
new types above, and the visual pass. Everything is one branch of work with
its own implementation plan.

**v3 Spec B** (separate document, later): tap-the-map, Wits & Wagers
(preceded by a rules-research pass — it strains the 1v1 model the most),
typed fill-in-the-blank with fuzzy matching.

## Non-goals (Spec A)

- v2 WS2 drag interactions (finger-drag ordering, draw-a-line matching). Not
  cancelled — deferred. Ordering/matching stay on arrow buttons.
- v2 WS3 ordering/matching content push. Deferred with WS2.
- Team-mode aggregated scoring (pre-existing app-wide gap).
- The realtime-subscription stale-closure refactor. The per-phase
  fresh-render timeout `useEffect` (v1 Task 9) stays the workaround. v3's
  host refactor slims `[roomId].tsx` but does **not** rewrite the realtime
  chain into refs-for-live-state.
- Reload-mid-question state recovery (pre-existing, needs event replay).
- Accessibility: swipe and slider interactions have no keyboard / screen-reader
  path. Logged as a known gap, same as v2 logged it for drag.
- Profile stat aggregation (home "Points" showed 0 post-game in the v1
  playtest). Separate pre-existing bug.
- Commissioned mascot art. Spec A ships placeholder art in a real
  animation system; the asset is swapped later.
- Lottie. Reanimated tweens only; Lottie noted as the upgrade path.
- Free-typed answers for progressive clue. It uses MC-after-buzz in Spec A
  (consistent with v2 WS1 removing the typed-answer path). Free-typed is a
  possible Spec B enhancement.

---

## 1 — Framework core

### 1.1 Type descriptor registry

`lib/questionTypes.ts` becomes a directory `lib/questionTypes/`:

```
lib/questionTypes/
  index.ts              registry: getDescriptor(type), getInteractionMode (kept for back-compat)
  types.ts              shared interfaces
  multipleChoice.ts     migrated
  ordering.ts           migrated
  matching.ts           migrated
  estimation.ts         new
  progressive.ts        new
  swipe.ts              new
```

Each type module exports a `QuestionTypeDescriptor`:

```ts
interface QuestionTypeDescriptor<TPayload, TSubmission> {
  id: QuestionType;

  // How a round plays out.
  //  'buzz'       — one player buzzes then answers; a wrong answer hands the
  //                 opponent a shot. (multiple_choice, progressive)
  //  'concurrent' — both players answer at once against the clock.
  //                 (ordering, matching, estimation, swipe)
  roundStyle: 'buzz' | 'concurrent';
  timerSeconds: number;

  // React components. PlayComponent renders the answer UI; RevealComponent
  // renders the per-type breakdown inside the shared RevealFrame (§3.4).
  PlayComponent: ComponentType<PlayProps<TPayload, TSubmission>>;
  RevealComponent: ComponentType<RevealProps<TPayload, TSubmission>>;

  // Pure logic — no React, no Supabase. Unit-tested.
  score(input: ScoreInput<TPayload, TSubmission>): RoundScore;
  isRoundComplete(state: RoundState<TSubmission>): boolean;

  // Importer validation (§4.1). Accepts the raw JSON payload, returns the
  // typed payload or a human-readable error.
  validatePayload(raw: unknown):
    | { ok: true; payload: TPayload }
    | { ok: false; error: string };
}
```

Supporting shapes:

```ts
type ScoreInput<TPayload, TSubmission> = {
  question: { payload: TPayload; options?: string[]; answer?: string | null };
  // concurrent: both present (or null for a non-submitter).
  // buzz: `mine` is the answerer's submission; `opponent` is the opponent's
  //       shot submission if one happened.
  mine: TSubmission | null;
  opponent: TSubmission | null;
  mySecondsLeft: number | null;
  opponentSecondsLeft: number | null;
};

type RoundScore = {
  // Points to add for each player this round, keyed by a stable role.
  points: { mine: number; opponent: number };
  // Structured data the RevealComponent renders. Type-specific.
  breakdown: unknown;
};

type RoundState<TSubmission> = {
  roundStyle: 'buzz' | 'concurrent';
  submissions: Record<string /*playerId*/, { submission: TSubmission; secondsLeft: number }>;
  buzzedPlayerId: string | null;
  opponentShotTaken: boolean;
  playerIds: string[];        // exactly 2 in 1v1
  timedOut: boolean;
};
```

`getInteractionMode(type)` is kept as a thin wrapper over
`getDescriptor(type).roundStyle` (mapping `'buzz' → 'race'`,
`'concurrent' → 'simultaneous'`) so nothing outside the game screen breaks
during the migration. Unknown/missing type still defaults safely to
multiple_choice / buzz.

### 1.2 Scoring moves to round-complete time

Today each player writes their own score the instant they lock in
(`handleSubmitSequence`, `handleSubmitAnswer`). Winner-takes-the-pot for
estimation needs **both** answers in hand, so:

- **On submit:** the player emits a `round_submit` event carrying
  `{ submission, secondsLeft }`. **No score is written.**
- **On round complete** — `descriptor.isRoundComplete(state)` returns true
  (both submitted, or the timer expired, or a buzz round resolved) — the
  **host alone**:
  1. runs `descriptor.score(input)` once with both submissions,
  2. writes both players' `score` updates,
  3. emits `round_scored { points, breakdown, correctAnswer }`,
  4. after the reveal window, calls `advanceGame()`.

Single writer for scores → no score-write races (which is also what caused
the completion effect to re-fire in v1; see the long comment at
`[roomId].tsx:332`). Ordering and matching keep their exact
`calcPartialCreditPoints` formula — this is only a timing move onto the
shared path, graded per player, no head-to-head change for those two.

### 1.3 Phase machine

`Phase` collapses from
`waiting | question | buzzed | arranging | reveal | results` to:

```
waiting → playing → reveal → results
```

- `playing` covers what was `question` / `buzzed` / `arranging`. Buzz state
  (`buzzedUserId`, the pulse animation) becomes host state passed into the
  `PlayComponent` as props — a buzz-style component renders its buzz button
  or its answer UI based on those props. `buzz_in` stays a realtime event.
- `reveal` renders `descriptor.RevealComponent` inside `RevealFrame`,
  host-timed (~4 s), then advance.
- `[roomId].tsx` becomes a thin host: resolve `getDescriptor(question.type)`,
  render its components, feed it host state, delegate `score` /
  `isRoundComplete`. Target: well under 300 lines, with realtime
  subscription + timer + advance extracted into a `useGameRound` hook.

### 1.4 Realtime events

`game_events.event_type` is a free-form text column — no schema change, only
code.

| event | direction | change |
|---|---|---|
| `game_start`, `next_question`, `game_over` | host → all | unchanged |
| `buzz_in` | player → all | unchanged (buzz-style types) |
| `round_submit` | player → all | **new** — replaces `answer` and `sequence_submit`. `{ submission, secondsLeft }` |
| `round_scored` | host → all | **new** — `{ points: {playerId: n}, breakdown, correctAnswer }`. Drives the reveal. Replaces the score-carrying half of the old `answer` event |

The host resolves `descriptor.score()`'s role-relative `{ mine, opponent }`
into `{ playerId: n }` for the `round_scored` payload before emitting.

`answer` and `sequence_submit` are removed. The schema.sql comment listing
event types is updated.

### 1.5 Double-advance fix (DB-level idempotency)

The parked v1/v2 `advanceGame` bug ([[project-double-advance-bug]]): two
independent `next_question` inserts for one index, and the client-side
`advancedForIndexRef` guard was observed **failing** during the SDK 56
regression. Root cause was never pinned (two component instances vs a
double-fired UI event).

v3 fixes it at the database layer instead of relying on a client ref. The
advance becomes a conditional update:

```sql
update game_rooms
set current_question_index = :nextIdx
where id = :roomId and current_question_index = :expectedIdx
returning id;
```

The `next_question` (or `game_over`) event is emitted **only if a row was
returned**. Two concurrent `advanceGame()` calls: the first flips the index
and emits; the second's `where` matches nothing, returns no row, emits
nothing. The client `advancedForIndexRef` is removed. `game_over` uses the
same conditional guard on `status`.

---

## 2 — The three new types

Each adds a value to the `questions.type` CHECK constraint. The live
Supabase DB has drifted from `schema.sql` before and there is no migration
runner ([[project-schema-drift]]), so: update `schema.sql` **and** apply the
`ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT` to the live DB via a
one-off script (WS1 `migrate-*.js` pattern), verified with
`scripts/check-schema.js` before and after.

New constraint value set:
`multiple_choice, ordering, matching, estimation, progressive, swipe`
(plus `free_text`, `fill_blank` retained as deprecated/unused historical
values).

### 2.1 Numerical estimation — `estimation`

- **roundStyle:** `concurrent`. **timerSeconds:** 20.
- **Payload:**
  ```ts
  { value: number; unit: string; min: number; max: number;
    step?: number; log?: boolean }
  ```
  Author supplies `min`/`max` (auto-derived ranges produce poor sliders).
  `log: true` renders a log-scale slider for wide spans (years, populations).
  `validatePayload`: `value`/`min`/`max` finite numbers, `min < value < max`,
  `unit` non-empty, `step` (if present) positive.
- **PlayComponent:** full-width slider (`min`→`max`), large live numeric
  readout with `unit`, "Lock In" button. Reanimated-driven thumb; pointer
  drag works on web. `hasSubmittedRef` one-shot guard (unchanged pattern).
- **Submission:** `{ guess: number }`.
- **score (winner takes the pot):**
  - `dist(p) = |p.guess − value|` (on the log axis if `log`).
  - Closer player wins `round(300 × speedMult)`,
    `speedMult = min(1, max(0.5, winnerSecondsLeft / 20))`.
  - Other player: `0`.
  - Equal distance (incl. identical guesses): **both** get the full
    `round(300 × speedMult)` using the faster `secondsLeft`.
  - A non-submitter automatically loses. Neither submits → `0`/`0`.
- **breakdown:** `{ value, unit, min, max, log, marks: [{playerId, guess, dist}], winnerId }`.
- **RevealComponent:** horizontal number line, truth marker, both players'
  marks with distance labels, "Closer!" badge on the winner.

### 2.2 Progressive clue — `progressive`

- **roundStyle:** `buzz`. **timerSeconds:** 30.
- **Payload:** `{ clues: string[] }` (3–5). Uses the existing `options`
  column (exactly 4, includes `answer`) and `answer` column.
  `validatePayload`: 3 ≤ `clues.length` ≤ 5, each non-empty; `options`
  length 4 and contains `answer` exactly once.
- **PlayComponent:** clue 1 shown at round start; a new clue auto-reveals
  every ~6 s (`floor(30 / clues.length)` cadence, both clients driven by the
  shared host timer so they reveal in lockstep). A single "I Know It!" buzz
  button. On buzz → clock stops → 4-option grid (same MC grid component as
  `multiple_choice`).
- **Submission:** `{ chosen: string; cluesShownAtBuzz: number }`.
- **score:**
  - Point ladder by `cluesShownAtBuzz`: `[300, 220, 150, 90, 50]` (index =
    clues shown − 1; clamp to the last entry).
  - Correct buzz → answerer gets the ladder value, opponent `0`, round
    complete.
  - Wrong buzz → answerer `0`; opponent gets a shot at the **current**
    clue level (whatever's revealed when their grid opens). Opponent
    correct → ladder value for their level. Opponent wrong / no shot → `0`.
  - Nobody buzzes before all clues shown + timer expiry → `0`/`0`.
- **isRoundComplete:** true when the buzzed player answered correctly, OR
  both players have had a turn, OR timed out.
- **breakdown:** `{ answer, cluesTotal, perPlayer: [{playerId, cluesShownAtBuzz, chosen, correct}] }`.
- **RevealComponent:** the answer, each player's buzz clue-level and
  correctness, points.

### 2.3 Swipe-categorize — `swipe`

- **roundStyle:** `concurrent`. **timerSeconds:** 20.
- **Payload:**
  ```ts
  { categoryLeft: string; categoryRight: string;
    cards: { text: string; side: 'left' | 'right' }[] }
  ```
  Handles two-category ("Old Testament" / "New Testament") and yes-no
  ("Is this a book of the Bible?" → No / Yes). `validatePayload`:
  `categoryLeft`/`categoryRight` non-empty and distinct; 4 ≤ `cards.length`
  ≤ 8; every card `text` non-empty and `side ∈ {left,right}`; at least one
  card per side.
- **PlayComponent:** card stack (top card active), swipe left/right via
  `Gesture.Pan()`; L/R buttons underneath as the web/accessibility fallback.
  Committed on release past a threshold, card animates off, next advances.
  No undo. Card order is `seededShuffle(cards, questionId)` so both players
  see the same sequence. Clearing all cards before the timer ends the
  player's round early. `hasSubmittedRef`-style guard: the whole set is
  submitted once (on last card or on timeout).
- **Submission:** `{ swipes: Record<number /*card index*/, 'left' | 'right'> }`
  (unswiped indices absent).
- **score (graded partial credit, NOT winner-takes-pot):**
  - `correct = count(cards where swipes[i] === cards[i].side)`.
  - `round((correct / cards.length) × 300 × speedMult)`,
    `speedMult = min(1, max(0.5, secondsLeft / 20))`.
  - Each player scored independently. Unswiped cards count as wrong.
- **breakdown:** `{ cards: [{text, correctSide, perPlayer: {playerId: swipedSide|null}}], perPlayerCorrect: {playerId: n} }`.
- **RevealComponent:** each card row with the player's swipe vs the correct
  side, ✓/✗, count, points.

### 2.4 Shared PlayComponent / RevealComponent props

```ts
type PlayProps<TPayload, TSubmission> = {
  question: Question & { payload: TPayload };
  questionId: string;
  timeLeft: number;
  hasSubmitted: boolean;
  buzzedByMe: boolean;
  buzzedByOpponent: boolean;
  onBuzz?: () => void;               // buzz-style only
  onSubmit: (submission: TSubmission) => void;
};

type RevealProps<TPayload, TSubmission> = {
  question: Question & { payload: TPayload };
  breakdown: unknown;               // the descriptor's own breakdown shape
  myPointsThisRound: number;
  myRunningTotal: number;
};
```

The existing `OrderingPhase` / `MatchingPhase` / MC-grid components are
adapted to this prop shape during the framework migration (step 2 of the
execution order) — same internal logic, new signature, `onSubmit` now emits
`round_submit` instead of scoring inline.

---

## 3 — Visual pass

### 3.1 Gesture / animation infrastructure

`npx expo install react-native-reanimated react-native-gesture-handler
react-native-svg` — resolves the SDK 57 versions (Reanimated ~4.x, which
depends on `react-native-worklets`).

- **Babel:** verify against the v57 docs
  (`https://docs.expo.dev/versions/v57.0.0/`) whether `babel-preset-expo`
  now wires the worklets plugin automatically or a `babel.config.js` with
  `react-native-worklets/plugin` (plugin **last**) is still required. Do
  whichever the docs say, then confirm the Metro **web** build compiles.
- `app/_layout.tsx`: wrap `<Stack>` in
  `<GestureHandlerRootView style={{ flex: 1 }}>`. Inert until a gesture
  component mounts.
- `components/game/useItemLayout.ts` (new): a hook recording each
  row/card's on-screen rect via `onLayout` into a ref map keyed by stable
  index. Used by the swipe stack now; by tap-the-map in Spec B. Pure parts
  unit-tested, measurement manual.
- **Web posture:** swipe activates on press + small movement (no
  long-press) so mouse drag works; L/R buttons are always present as the
  fallback. Slider works with pointer natively. Each new interaction gets a
  manual pass on web **and** Expo Go before its task closes.

### 3.2 Mascot — `components/Mascot.tsx`

`<Mascot mood="idle" | "cheer" | "sad" | "think" | "taunt" size={n} />`.

- Ships in Spec A with **placeholder art**: a simple self-contained SVG
  character (via `react-native-svg`). Commissioned art later swaps the
  asset without touching call sites.
- Reanimated tweens: idle vertical bob loop; one-shot cheer (bounce +
  scale-pop), sad (droop + desaturate), think (slow tilt). `taunt` reserved,
  can alias to `cheer` initially.
- Rendered in: `RevealFrame` (mood from your round result), `ResultsPhase`
  (win → cheer, loss → sad), `WaitingPhase` (idle, gives the lobby life).

### 3.3 Celebration — `components/game/Celebration.tsx`

On `round_scored`, if the local player won the round (buzz/estimation) or
scored ≥ ~60 % (swipe/ordering/matching): a Reanimated particle burst
(no external lib) + the reveal's points number counting up + mascot `cheer`.
Zero / clearly-lost → mascot `sad`, no burst. ~1.5 s, cut short if the
reveal advances.

### 3.4 RevealFrame + reveal/results redesign

- `components/game/RevealFrame.tsx` (new): shared reveal layout — mascot
  slot (top-right), the type's `RevealComponent` in the middle, "points this
  round + running total" at the bottom. Host-timed auto-advance. The v2
  spec's `SequenceRevealPhase` idea is **superseded** — every type now owns
  its `RevealComponent`; `RevealFrame` is the common shell.
- The existing race `RevealPhase.tsx` is refactored into the
  `multiple_choice` descriptor's `RevealComponent` + `RevealFrame`.
- `ResultsPhase.tsx` redesign (currently 40 lines, plain): winner banner,
  mascot, per-player animated score bars, an accuracy/round summary if
  cheap to assemble from `round_scored` history, "Back to Home".
- `components/game/gameStyles.ts` gains a shared visual-token block
  (spacing scale, timer-ring treatment, card shadow, palette handles) that
  all new components consume.

### 3.5 Cheap transitions (folded into 3.1's task)

Phase cross-fade; score-bar values animating with `withTiming` instead of
snapping; timer ring pulsing under 5 s.

---

## 4 — Content pipeline

### 4.1 Importer

`scripts/import-questions.js` `validate()` delegates per-type payload
validation to `getDescriptor(type).validatePayload(raw)`. The importer keeps
its existing responsibilities (shuffle `options` at import, retain `hint`,
skip exact-duplicate `question` text, hard-error on an unrecognized type or
an invalid payload — never silently downgrade).

### 4.2 Content files & workflow

- New local files: `data/insight-estimation-batchN.json`,
  `data/insight-progressive-batchN.json`, `data/insight-swipe-batchN.json`.
  `data/` stays gitignored — content lives local.
- `scripts/import-all.js` gets the new file globs.
- `data/covered_entries.md` gets a section per new type for dedup tracking.
- Source: `data/it2_full.txt` (Insight on the Scriptures, Vol. 2) per
  `data/HANDOFF.md` — read the entry, extract facts, write original prompts,
  **never quote or closely paraphrase**. Vol. 1 gap uses the existing
  cross-reference convention in `reference`.
- `data/test-new-types.json` (1–2 of each new type) + a seed script
  (`scripts/seed-new-types-room.js` or an extension of `seed-test-room.js`)
  for deterministic playtesting, like the existing `TESTTY` room.

### 4.3 Checkpoint

Author ~15–20 questions of each new type → import → playtest against the
real UI on web and phone → quality review → then scale up. A type's content
authoring starts as soon as that type's payload schema is frozen (i.e. its
descriptor has landed), running parallel to later build steps.

### 4.4 Estimation content notes

Estimation questions need a real, citable number and sensible slider
bounds. Good veins from Insight Vol. 2: reign lengths, ages at death,
distances between places, dimensions of structures (temple, ark, walls),
counts (tribes, cities of refuge, years in exile/wandering), populations
where Insight gives them. Bounds set so the truth sits roughly in the
middle third and neither extreme is absurd.

---

## 5 — Testing

**Unit (`tsx --test`, `npm run test`):**

- `estimation.score` — winner-takes-pot, exact-distance tie (both win),
  non-submitter auto-loss, neither-submits zero, speed multiplier, log axis.
- `progressive.score` — ladder value per clue level, clamp past the last
  entry, wrong-buzz → opponent shot at current level, nobody buzzes zero.
- `swipe.score` — partial credit fraction, unswiped-as-wrong, speed
  multiplier, per-player independence.
- Each descriptor's `isRoundComplete` — both-submitted, timeout,
  buzz-resolved, opponent-shot-pending.
- Each descriptor's `validatePayload` — one accept + each documented
  reject.
- The DB-conditional advance guard logic (pure part).
- Migrated MC / ordering / matching score tests — same expected numbers,
  new descriptor shape, stay green. Existing `calcPartialCreditPoints`,
  `checkOrderingCorrectness`, `checkMatchingCorrectness`,
  `calcBuzzPoints` tests unchanged.

**Manual, before each type's task closes** — web **and** Expo Go:

- The type's interaction (slider drag / buzz + clue reveal cadence / card
  swipe + button fallback), its reveal, the celebration, timeout with no
  submission, submit at T−1 s.
- Regression each time: MC race still plays (buzz → pick → score),
  ordering and matching still play and score, results screen reached, no
  console errors.

---

## 6 — File-touch summary

| Area | Files |
|---|---|
| Framework | `lib/questionTypes/` (was `lib/questionTypes.ts` — now index + types + one module per type), `lib/gameLogic.ts` (score helpers stay; `calcBuzzPoints` etc. reused by descriptors), `lib/gameLogic.test.ts` |
| Host | `app/game/[roomId].tsx` (slimmed), `app/game/useGameRound.ts` (new — realtime sub + timer + advance), `supabase/schema.sql` (event-type comment, `type` CHECK constraint), one-off `scripts/migrate-add-question-types.js` (new), `scripts/check-schema.js` |
| Infra | `package.json`, `babel.config.js` (only if v57 docs require it), `app/_layout.tsx`, `components/game/useItemLayout.ts` (new) |
| New types | `components/game/EstimationPhase.tsx`, `ProgressivePhase.tsx`, `SwipePhase.tsx` (new); their reveal components |
| Migrated components | `components/game/QuestionPhase.tsx`, `OrderingPhase.tsx`, `MatchingPhase.tsx`, `RevealPhase.tsx` (→ MC descriptor pieces) |
| Visual | `components/Mascot.tsx` (new), `components/game/Celebration.tsx` (new), `components/game/RevealFrame.tsx` (new), `components/game/ResultsPhase.tsx`, `components/game/gameStyles.ts`, `assets/` (placeholder mascot SVG) |
| Content | `scripts/import-questions.js`, `scripts/import-all.js`, `scripts/seed-new-types-room.js` (new or extend `seed-test-room.js`), `data/insight-{estimation,progressive,swipe}-batch*.json`, `data/test-new-types.json`, `data/covered_entries.md` |

## 7 — Execution order (Spec A)

1. **Infra** — deps, `GestureHandlerRootView`, babel verify + web-build
   check, `useItemLayout`, the §3.5 cheap transitions.
2. **Framework core** — descriptor interface + registry; `useGameRound`
   hook; `[roomId].tsx` slim-down; `round_submit` / `round_scored`;
   host-side round-complete scoring; DB-conditional advance (double-advance
   fix). Migrate `multiple_choice`, `ordering`, `matching` onto descriptors.
   All existing tests green; playtest parity with today's behavior.
3. **Visual system** — `RevealFrame`, `Mascot` (placeholder art),
   `Celebration`. Wire into the migrated reveal path.
4. **Numerical estimation** — descriptor + `EstimationPhase` + reveal +
   tests. Freeze payload schema → estimation content authoring can start.
5. **Progressive clue** — descriptor + `ProgressivePhase` + clue-cadence +
   reveal + tests. Freeze schema → content authoring can start.
6. **Swipe-categorize** — descriptor + `SwipePhase` card stack + reveal +
   tests. Freeze schema → content authoring can start.
7. **`ResultsPhase` redesign.**
8. **Content checkpoint** — ~15–20 of each type, import, playtest, quality
   review, then scale up.

Steps 4–6 are independent of each other once step 2 lands. Content
authoring (parallel track) begins per type as each schema freezes.

## 8 — Open questions for the implementation plan

- Exact Reanimated 4 / worklets babel setup on Expo SDK 57 — resolved by
  reading `https://docs.expo.dev/versions/v57.0.0/` in step 1, not assumed
  here.
- Whether `useGameRound` can cleanly own the timer without reintroducing
  the v1 stale-closure bug the per-phase `useEffect` was added to dodge.
  The plan should treat this as a risk and keep the fresh-render timeout
  pattern if extraction proves fragile.
- Progressive-clue reveal cadence when `clues.length` doesn't divide the
  30 s clock evenly — pick a rule (front-load or trail the remainder) in
  the plan.
- `handleSubmitAnswer` currently compares MC answers case-insensitively
  (`.toLowerCase()`), despite v2 WS1's "exact-match" commit. The framework
  migration should settle this — recommend exact equality against the
  shuffled `options` entry, matching WS1's stated intent.
