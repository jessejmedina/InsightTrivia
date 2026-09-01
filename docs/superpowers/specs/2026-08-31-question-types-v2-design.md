# Question Types v2 — Design

## Goal

The question-type system from `2026-08-30-question-types-design.md` shipped
on branch `feature/question-type-system` (11 tasks + review + fix wave) and
was playtested end-to-end on 2026-08-31. This v2 design builds on that base
with three linked changes the playtest and product direction call for:

1. **Question model** — every race-mode question becomes `multiple_choice`
   (type-in free text is removed entirely). `ordering` and `matching` get a
   hard size cap of 4. Scoring/timer for simultaneous questions is retuned.
2. **Interaction redesign** — `ordering` becomes finger-drag reordering,
   `matching` becomes drag-to-connect ("draw a line" between a left item and
   its right match). A reveal screen is added after simultaneous questions.
3. **Content push** — 150+ four-item `ordering` and 150+ four-pair
   `matching` questions authored from Insight on the Scriptures, Vol. 2.

These are executed as three sequential workstreams (content runs parallel
to the interaction redesign once the model changes land). Each workstream
becomes its own implementation plan.

A **mascot with simple animations** is recorded here as a post-launch
Phase 4 — not built now, but the new reveal/results screens leave a slot
for it.

## Non-goals (v2)

- Changing the buzz-in race model for `multiple_choice` (a player still
  buzzes in, then picks from 4 options). "Everyone answers simultaneously"
  for MC was considered and explicitly deferred.
- Team-mode aggregated scoring (pre-existing gap, app-wide, larger than
  this work).
- The realtime-subscription stale-closure refactor. The per-phase
  fresh-render timeout `useEffect` (from the 2026-08-30 Task 9 fix) remains
  the workaround; a full refs-for-live-state rewrite of the realtime chain
  is a separate project.
- Reload-mid-question state recovery (pre-existing for every phase; needs
  event replay, not a patch).
- Distractor options for `matching` (4 left / 5 right, one unmatched) —
  noted as a future difficulty lever, not built.
- Accessibility: drag-only interactions have no keyboard / screen-reader
  reordering path. Logged as a known gap.
- Profile stat aggregation — the home "Points" stat showed 0 after the
  playtest despite points earned. Separate pre-existing bug, not in scope.
- `fill_blank` as a distinct type — folded into `multiple_choice` (the
  blank lives in the `question` text; it renders and scores as MC).

---

## Workstream 1 — Question model

### 1.1 Multiple choice is the only race format

`free_text` is removed as a playable type. All race-mode questions are
`multiple_choice` with a 4-entry `options` array that includes the correct
`answer`.

**Importer (`scripts/import-questions.js` `validate()`):**

- A question with no `type` and a valid 4-entry `options` array (array of
  4 strings, contains `answer` exactly once) is stamped
  `type: 'multiple_choice'`.
- `options` is shuffled at import before storage (already implemented in the
  2026-08-30 fix wave — keep; add a unit test if missing).
- A question with **neither** a recognized `type` **nor** a valid `options`
  array is a **hard import error** (non-zero exit, names the offending
  question). No question is ever silently downgraded to an unplayable
  `free_text` row.
- `ordering` / `matching` validation: see 1.2.
- `hint` parsing into both row objects is retained (regression guard — the
  2026-08-30 fix wave restored this after it was dropped).

**Schema (`supabase/schema.sql`):** the `type` check constraint keeps
`free_text` as a legal value (historical rows, and to avoid a
destructive constraint change), but nothing writes it going forward. Add a
comment noting `free_text` is deprecated and unplayable.

**Client (`components/game/QuestionPhase.tsx`):**

- Remove the `TextInput` answer branch entirely. When a player is buzzed
  in, they always see the 4-option grid.
- `isMultipleChoice` gate and the `question.answer === null` guard are no
  longer needed for the render path — every race question has `options`.
  Keep a defensive fallback: if `options` is somehow missing/short, show a
  "question unavailable" state and let the timer advance (do not crash).

**Game logic (`lib/gameLogic.ts`):**

- Remove the fuzzy free-text answer matcher (`checkAnswer` or equivalent)
  and its tests. MC correctness is exact string equality between the
  chosen option and `answer`.
- `lib/questionTypes.ts` `getInteractionMode`: `multiple_choice` stays
  `'race'`. No change needed.

### 1.2 Hard size caps

- `ordering`: `payload.items` must be **exactly 4** strings, all distinct.
- `matching`: `payload.pairs` must be **exactly 4** `{left,right}` objects.
  `left` values must be distinct (duplicate-left is mis-scored by
  `checkMatchingCorrectness` — enforce at import rather than fix the
  scorer). Duplicate `right` values remain allowed (index-based identity
  handles them).
- `validate()` rejects any other count with a clear message.
- `data/insight-sequence-questions-batch1.json` and
  `data/test-question-types.json` are regenerated to the 4-cap (see
  Workstream 3). Longer real sequences are sliced into multiple questions.

### 1.3 Migration of existing rows

New script `scripts/migrate-free-text-to-mc.js`:

- Dry-run mode (default): reports counts — rows that are `free_text` with a
  valid stored `options` array (→ will flip to `multiple_choice`), and rows
  that are `free_text` with no usable `options` (→ listed for manual
  fix/delete, NOT auto-changed).
- `--apply` performs the flip for the first group only.
- Uses the service-role key from `.env` — note `EXPO_PUBLIC_SUPABASE_URL`
  must be the `https://<ref>.supabase.co` API URL, not the dashboard URL
  (this broke signup + all scripts on 2026-08-31).

`scripts/check-schema.js` gains an assertion: after migration, zero rows
have `type = 'free_text'`. Run before and after `--apply`.

### 1.4 Scoring & timer

Observed in the 2026-08-31 playtest: a perfect ordering answer scored only
90 / 300 because `calcPartialCreditPoints`' speed multiplier floors at 0.3
and the 30 s clock made it easy to fall below that.

- Simultaneous-question timer: **30 s → 20 s** (`app/game/[roomId].tsx`
  timer setup for `arranging`).
- `calcPartialCreditPoints(correctCount, totalCount, secondsLeft)`:
  - speed floor `0.3 → 0.5`
  - `speedMultiplier = max(0.5, secondsLeft / 20)` (was `/ 30`)
  - formula otherwise unchanged: `round(accuracyFraction * 300 * speedMultiplier)`
  - result: perfect + slow floors at 150; perfect + instant still 300;
    2/4 correct + slow = 75.
- Update `lib/gameLogic.test.ts` cases for the new curve.

### 1.5 advanceGame idempotency (parked fix, pulled in here)

The 2026-08-30 final review parked a bounded `advanceGame` stale-closure
bug (a submission landing in the round-trip window after a
timeout-advance can re-fire `next_question` for the same index and restart
the question). The 3-line fix is written out at the end of
`.superpowers/sdd/2026-08-30-question-types/progress.md`:

- `const questionIndexRef = useRef(questionIndex)` kept in sync wherever
  `setQuestionIndex` is called
- `if (questionIndex !== questionIndexRef.current) return;` as the first
  line of `advanceGame`

Apply it as part of Workstream 2 (the reveal-phase work touches the advance
path anyway).

---

## Workstream 2 — Interaction redesign

### 2.1 Gesture infrastructure

Add via `npx expo install` (locks to SDK 54-compatible versions):

- `react-native-reanimated` — add its Babel plugin **last** in
  `babel.config.js`; verify Metro web build.
- `react-native-gesture-handler` — wrap the app root.

`app/_layout.tsx`: wrap `<Stack>` in
`<GestureHandlerRootView style={{ flex: 1 }}>`. Inert until a gesture
component mounts.

**Web:** Reanimated 3 + gesture-handler run on react-native-web but
pointer-drag has rough edges. Mitigations built into the components:

- Ordering drag activates on press + small movement (no long-press
  requirement) so mouse-drag works.
- Matching supports tap-source-then-tap-target as a fallback to
  drag-to-connect.
- Each interaction component gets a manual test pass on web **and** Expo Go
  (iOS or Android) before its task closes.

**Shared primitive** `components/game/useItemLayout.ts`: a hook that
records each row/item's on-screen rect via `onLayout` into a ref map keyed
by stable index. Consumed by both the ordering drop-target math and the
matching cord anchor math. Unit-tested where logic is pure; the
measurement itself is manual.

### 2.2 Ordering redesign

`components/game/OrderingPhase.tsx` rewritten. **Unchanged contract:**
props (`items`, `questionId`, `timeLeft`, `hasSubmitted`, `onSubmit`) and
`onSubmit(string[])`. `app/game/[roomId].tsx` and the scoring path do not
change.

- Working order still `seededShuffle(items, questionId)` (both players see
  the same start).
- 4 fixed-height rows, non-scrolling container.
- Each row has a Reanimated `translateY` shared value. `Gesture.Pan()` on
  the row:
  - start: lift the card (scale ~1.04, shadow), drop its number badge
  - update: follow the finger; shift passed-over cards by one row-height
  - end: snap all cards to final slots, commit the new `order` array
- Number badges (`1 2 3 4`) are a separate layer pinned to slot
  Y-positions; they never move. The dragged card shows no number while in
  motion.
- **No arrow buttons.**
- "Lock In Order" button + `hasSubmittedRef` one-shot guard: unchanged.
- Pure helper `reorder(list, from, to)` extracted to `lib/gameLogic.ts`
  and unit-tested. The gesture is manual-tested.

### 2.3 Matching redesign (draw-a-line)

`components/game/MatchingPhase.tsx` rewritten. **Unchanged contract:**
props and `onSubmit(MatchPair[])`. `checkMatchingCorrectness` and
`[roomId].tsx` do not change.

- Two columns of 4: left = `pairs` in order, right =
  `seededShuffle(pairs.map(p => p.right), questionId)`. Both non-scrolling.
- An absolutely-positioned `<Svg>` overlay spans the gap.
- Identity is index-based: `pairing: Record<number, number>` (left index →
  right index) — keeps the 2026-08-30 `94c547c` fix; duplicate left/right
  text stays safe.
- `Gesture.Pan()` over the whole board:
  - start: hit-test touch against measured rects. On a left item, or on an
    existing cord's endpoint → begin a drag from that left index.
  - update: draw a live cord from the source anchor to the finger.
  - end: hit-test release against right-column rects. Hit → commit
    `pairing[leftIdx] = rightIdx`, replacing any existing cord from that
    left index and removing that right index from any other left it was
    tied to (one-to-one, last-wins — same rule as the tap version).
    Miss → cord springs back, no commit.
- Tap (no drag) on a cord midpoint or either endpoint → cut that cord.
- Web fallback: tap left then tap right connects.
- Cord color: stable per left index from a 4-color palette, so the same
  pairing is the same color for both players and on the reveal screen.
- "Lock In Matches" enabled only when all 4 cords exist; `hasSubmittedRef`
  one-shot guard unchanged; `MatchPair[]` reconstructed from
  `pairs[leftIdx].left` / `pairs[rightIdx].right` exactly as now.
- Pure helper `applyPairing(pairing, leftIdx, rightIdx)` (add / replace /
  steal logic) extracted to `lib/gameLogic.ts` and unit-tested.
  Hit-testing and the gesture are manual-tested.

### 2.4 Reveal phase for simultaneous questions

New component `components/game/SequenceRevealPhase.tsx`.
`app/game/[roomId].tsx` flow becomes `arranging → reveal (~4 s) →
advanceGame` instead of `arranging → advanceGame`. The `reveal` value
already exists in the `Phase` type (currently race-only) — extend the
existing machinery.

**Shows:**

- The correct order (numbered list) or correct pairing (two columns joined
  by green cords).
- The player's own result overlaid: each position / pair marked ✓ or ✗
  against their submission. Non-submitters see the correct answer plus
  "No answer — 0 points".
- Points earned this question + running total.
- An empty **mascot slot** (top-right) for Phase 4.

**Advance:** driven by the same fresh-closure timeout `useEffect` that
already handles `arranging` (2026-08-30 Task 9 fix), with a `reveal`
branch. The `advanceGame` idempotency fix (1.5) lands here.

**Non-submitters / timeout:** still scored 0 for the question (no partial
credit on a non-submission — unchanged from v1; the reveal screen now at
least tells them why).

---

## Workstream 3 — Content push

### 3.1 Source & citation

- `data/it2_full.txt` — Insight on the Scriptures, Vol. 2 (headwords
  ~J–Z), already in the repo. Supporting scripts: `data/extract_headwords.py`,
  `data/build_page_index.py`, `data/page_index.tsv`, `data/covered_entries.md`.
- **Vol. 1 is not available.** Sequences centered on A–I headwords
  (Abraham, Adam, etc.) use the biblical chronology with a Vol. 2
  cross-reference, flagged in `reference` with the existing stopgap
  convention (`"General Bible chronology (cross-check: Insight …, '<name>')"`).
- **Copyright:** never quote or closely paraphrase Insight's sentences —
  read the entry, extract facts, write original prompts (per
  `data/HANDOFF.md` Step 4).

### 3.2 Targets & shape

- **150+ `ordering`** — exactly 4 items each. Longer sequences sliced
  ("first four kings of Judah", "next four…"). Veins: kings of Judah /
  Israel in succession, Paul's journeys leg by leg, the plagues, Israelite
  feasts through the year, Passion week, life-events of Joseph / Moses /
  Samuel / Saul / David / Solomon / Elijah / Elisha, exile → return.
- **150+ `matching`** — exactly 4 pairs each, distinct `left` values.
  Veins: person → known-for, prophet → book, king → reign detail, place →
  event, Hebrew month → feast, apostle → detail.

### 3.3 Format & workflow

- Schema per `insight-sequence-questions-batch1.json`, capped at 4:
  `{question, type, category, difficulty, reference, payload:{items|pairs}}`.
- New files `data/insight-sequence-batchN.json`,
  `data/insight-matching-batchN.json`. `data/` stays gitignored.
- Import via `node scripts/import-all.js`.
- **Dedup:** add an ordering/matching section to `data/covered_entries.md`;
  the importer already skips exact-duplicate `question` text.
- **Checkpoint:** author ~40 of each type, import, playtest against the new
  UIs, quality-review, *then* continue to 150+. Runs parallel to
  Workstream 2. Best executed as a batched sub-task loop, not one sitting.

### 3.4 Existing MC content audit

New script `scripts/audit-mc-options.js`: flags rows whose 4 `options` are
degenerate (answer is the only plausible / longest by far, near-duplicate
distractors) for hand review. Report only — not a migration, not a blocker.

---

## Phase 4 (post-launch, noted only) — Mascot

Not built in this work. Recommended path: static poses (idle / cheer /
sad / think) animated with Reanimated tweens (dependency already present
after Workstream 2), or Lottie (`lottie-react-native`) if an animator is
commissioned. `SequenceRevealPhase` and the results screen are built with
a mascot slot so it drops in as `<Mascot mood={…} />` later. Art
commissioned separately (~$150–600 for a character + a handful of poses).

---

## Testing

- **Unit (`tsx --test`, `npm run test`):**
  - `reorder(list, from, to)`
  - `applyPairing(pairing, l, r)`
  - `calcPartialCreditPoints` — new curve (floor 0.5, /20 clock)
  - importer `validate()` — 4-caps, MC inference, no-format-no-import,
    distinct-left, `hint` retention, `options` shuffle
  - the removed free-text matcher's tests are deleted
  - existing 21 tests stay green otherwise
- **Migration:** dry-run reviewed against live DB before `--apply`;
  `check-schema.js` asserts no `free_text` rows remain after.
- **Manual, before each Workstream 2 task closes:** full playtest on web
  **and** Expo Go — drag reorder, drag-connect, cord cut, reveal screen,
  timeout with no submission, submit at T-1 s (the race the 2026-08-31
  playtest exposed), MC race still plays (buzz → pick → score).

---

## File-touch summary

| Area | Files |
|---|---|
| Model | `scripts/import-questions.js`, `scripts/migrate-free-text-to-mc.js` (new), `scripts/check-schema.js`, `scripts/audit-mc-options.js` (new), `supabase/schema.sql`, `lib/gameLogic.ts`, `lib/gameLogic.test.ts`, `components/game/QuestionPhase.tsx` |
| Gesture infra | `package.json`, `babel.config.js`, `app/_layout.tsx`, `components/game/useItemLayout.ts` (new) |
| Ordering | `components/game/OrderingPhase.tsx`, `lib/gameLogic.ts` (`reorder`) |
| Matching | `components/game/MatchingPhase.tsx`, `lib/gameLogic.ts` (`applyPairing`) |
| Reveal | `components/game/SequenceRevealPhase.tsx` (new), `app/game/[roomId].tsx`, `components/game/gameStyles.ts` |
| Content | `data/insight-sequence-batch*.json`, `data/insight-matching-batch*.json`, `data/insight-sequence-questions-batch1.json` (regen), `data/test-question-types.json` (regen), `data/covered_entries.md` |

## Execution order

1. Workstream 1 (model) — plan, build, migrate, verify.
2. Workstream 2 (interaction) — plan, build. Depends on 1's schema/caps.
3. Workstream 3 (content) — starts after 1; 40-each checkpoint; runs
   parallel to 2; completes independently.

Each workstream gets its own implementation plan via the writing-plans
skill.
