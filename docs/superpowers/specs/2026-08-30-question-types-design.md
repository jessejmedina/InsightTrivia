# Question Type System — Design

## Goal

InsightTrivia currently supports exactly one question shape: a free-text
prompt judged by fuzzy string match, answered in a buzz-in race. The
question bank has grown to include multiple-choice `options` data that
isn't used anywhere, and the product direction is to support several
distinct question types — multiple choice, ordering ("put these in the
right order"), matching ("match X to Y" — scripture to text, date to
event, name to description, etc.), and fill-in-the-blank — selected
randomly per round from a mixed pool, scaling to thousands of questions
across multiple topics beyond the current Insight-on-the-Scriptures set.

This document designs a question-type system that:
1. Stores all types in one `questions` table without per-type schema sprawl.
2. Lets the game render the right UI and scoring for whatever type comes up.
3. Keeps the existing buzz-in race feel for the types that suit it, and
   introduces a simultaneous-play mode for the types that don't.
4. Stays cheap to extend with new types later (the user specifically wants
   more over time).

## Non-goals (v1)

- Admin-panel UI for authoring `ordering`/`matching` questions (JSON import
  is sufficient for the curated lists these types need — a few dozen
  hand-written questions, not bulk-extracted like the fact-based trivia).
- Category/type filtering when creating a game (all active questions of all
  types remain in one shuffled pool; filtering is a separate future feature).
- DB-side random sampling for banks over ~1000 active questions (Supabase's
  default query cap). Client-side shuffle-all-then-slice is fine until the
  bank approaches that size.
- A `fill_blank` type getting a payload of its own — it reuses the existing
  `question`/`answer`/`options` shape (the blank lives in the `question`
  text itself), so no schema or rendering work beyond treating it as a
  `race` mode type like `multiple_choice`.

## Data model

Extend the existing `questions` table (`supabase/schema.sql`) with two
additive, nullable-or-defaulted columns — no existing rows change shape:

```sql
alter table questions
  add column type text not null default 'free_text'
    check (type in ('free_text', 'multiple_choice', 'ordering', 'matching', 'fill_blank')),
  add column options text[],
  add column payload jsonb;
```

- `options`: used by `multiple_choice` and `fill_blank` (as distractors).
  `text[]` matches the existing convention in this schema
  (`profiles.owned_cosmetics text[]`). Always includes the correct answer
  (from the `answer` column) as one of the 4 entries.
- `payload`: used only by `ordering` and `matching`.
  - `ordering`: `{"items": ["Water turned to blood", "Frogs", "Gnats", ...]}`
    — the array's stored order **is** the correct order. The `question`
    column holds the prompt ("Put the ten plagues of Egypt in order").
    `answer`/`options` are unused (null) for this type.
  - `matching`: `{"pairs": [{"left": "Exodus", "right": "Israel leaves Egypt"}, ...]}`
    — `left`/`right` are deliberately generic so this one type covers
    scripture-to-text, date-to-event, name-to-description, etc. `answer`/
    `options` are unused (null) for this type.
- `free_text` and `multiple_choice` are unchanged from today except that
  `multiple_choice` now populates `options`.

Existing 195 questions default to `type = 'free_text'` with no migration
needed (their `options` data lives in the JSON files today but isn't
imported yet — importing them going forward will set `type =
'multiple_choice'` and populate the `options` column for those rows).

## Question type registry

A small client-side module, `lib/questionTypes.ts`, describes each type's
interaction mode and scoring function so the game screen doesn't hardcode
a type switch in five different places:

```ts
type InteractionMode = 'race' | 'simultaneous';

interface QuestionTypeDef {
  mode: InteractionMode;
  // race types: called with (correct: boolean, secondsLeft: number)
  // simultaneous types: called with (correctCount: number, totalCount: number, secondsLeft: number)
  scorePoints: (...args: number[]) => number;
}

const QUESTION_TYPES: Record<string, QuestionTypeDef> = {
  free_text: { mode: 'race', scorePoints: calcBuzzPoints },
  multiple_choice: { mode: 'race', scorePoints: calcBuzzPoints },
  fill_blank: { mode: 'race', scorePoints: calcBuzzPoints },
  ordering: { mode: 'simultaneous', scorePoints: calcPartialCreditPoints },
  matching: { mode: 'simultaneous', scorePoints: calcPartialCreditPoints },
};
```

## Game flow changes

Current phase machine (`app/game/[roomId].tsx`):
`waiting → question → buzzed → reveal → results`

New phase machine, branching on the current question's interaction mode:
`waiting → question → (buzzed | arranging) → reveal → results`

- **Race types** (`free_text`, `multiple_choice`, `fill_blank`): unchanged
  `buzzed` phase. `multiple_choice` reuses `QuestionPhase`'s answer area but
  renders 4 tappable option buttons instead of a `TextInput`.
- **Simultaneous types** (`ordering`, `matching`): new `arranging` phase.
  In **1v1 mode**, both players receive the same shuffled `items`/`pairs`
  at question start (no buzz race — the buzz button doesn't render for
  these types). Each player arranges/matches independently on their own
  screen and submits via a new `game_events` event type
  (`sequence_submit`), carrying their submitted order/pairing and time
  taken. The phase advances to `reveal` once both players have submitted,
  or when the 30-second timer expires (whoever hasn't submitted is scored
  on their in-progress state).
  In **teams mode**, one submission per team: whichever teammate submits
  first locks in that team's answer for scoring (mirroring how a buzz
  today represents the whole team) — other teammates' screens show
  "your team already answered" once that happens, rather than letting
  multiple submissions per team race each other.

## Scoring

Race types: unchanged, `calcBuzzPoints(secondsLeft)` (existing function).

Simultaneous types — new `calcPartialCreditPoints`:
```ts
function calcPartialCreditPoints(correctCount: number, totalCount: number, secondsLeft: number): number {
  const accuracyFraction = correctCount / totalCount;
  const speedMultiplier = Math.max(0.3, secondsLeft / 30); // mirrors calcBuzzPoints' shape
  return Math.round(accuracyFraction * 300 * speedMultiplier);
}
```
`ordering` correctness: item-by-item position match against `payload.items`.
`matching` correctness: pair-by-pair match against `payload.pairs`.

## Content authoring

`scripts/import-questions.js` `validate()` extended to:
- Accept `type` (default `'free_text'` if omitted, for backward compatibility
  with existing JSON files).
- For `multiple_choice`/`fill_blank`: validate `options` is an array of 4
  strings including the `answer`.
- For `ordering`: validate `payload.items` is an array of 3+ strings, and
  that `answer`/`options` are absent.
- For `matching`: validate `payload.pairs` is an array of 3+ `{left,
  right}` objects, and that `answer`/`options` are absent.

New ordering/matching content ships as new JSON files (e.g.
`data/insight-ordering-questions.json`) through the same import path,
hand-curated rather than extracted from the Insight PDF text.

## UI components

- `app/game/[roomId].tsx`: add the `arranging` phase branch; extend
  `QuestionPhase` to render options buttons for `multiple_choice`.
- New `OrderingPhase` component: draggable/tappable list reorder UI.
- New `MatchingPhase` component: two-column tap-to-pair UI (left column
  fixed order, right column shuffled; tapping a left item then a right
  item creates a pairing; tap again to unpair).
- Both new phase components submit through a shared `onSubmitSequence`
  callback wired into the existing `game_events` insert pattern.

## Testing

- Unit-level: `calcPartialCreditPoints` and the ordering/matching
  correctness-checking functions (pure functions, easy to test with a few
  hand-picked cases: 0/N correct, N/N correct, partial, edge case N=1).
- Manual: run the app (`npx expo start --web`), seed a small mixed-type
  question set (a couple of `ordering` + `matching` alongside existing
  `free_text`/`multiple_choice`), play a 1v1 game through all phases for
  both types, confirm scoring matches the formula and both players' views
  update correctly via realtime.

## Open questions for a future pass (not blocking this spec)

- Should `matching` pair counts be capped (e.g. max 6) for mobile screen
  real estate, or allowed to scale with question difficulty?
- Admin-panel authoring UI for `ordering`/`matching` (deferred, see
  Non-goals).
- DB-side random sampling once the active bank exceeds ~1000 rows.
