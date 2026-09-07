# Tap-the-Map Geography — Design (v3 Spec B, part 1)

## Context

v3 Spec A (`2026-09-05-question-types-v3-design.md`) shipped the type-descriptor
framework plus `estimation / progressive / swipe` and a visual pass, and named
**v3 Spec B** as: tap-the-map geography, Wits & Wagers, typed fill-in-the-blank.
This document is the first of Spec B — the `taptarget` question type.

The owner wants map questions covering the biblical world: Israel and the wider
ancient Near East (Egypt/Sinai, Ur, Babylon, Nineveh), Asia Minor (Ephesus,
etc.), Greece and Macedonia (Corinth, Athens, Philippi, Berea), Italy (Rome),
and the western Mediterranean out toward Spain for the Pauline-journey material.

The game stays **head-to-head 1v1**.

## The question type: `taptarget`

A place name (or a "where did X happen?" prompt) is shown over a map of the
ancient world. Each player taps the spot they think it is. **Closest tap wins
the pot** — identical scoring to `estimation` (the owner's "winner takes the
pot" choice), just in 2-D normalized map space instead of on a 1-D slider.

- `roundStyle: 'concurrent'` (both play at once, like estimation/swipe).
- `timerSeconds: 20`.
- Distance metric: straight-line (Euclidean) distance between the tap and the
  target, both in normalized `[0,1] × [0,1]` map coordinates.
- Winner gets `round(300 * speedMult)` where `speedMult = clamp(secondsLeft/20,
  0.5, 1)`; loser gets 0; an exact-distance tie pays both the pot; a
  non-tapper's distance is `Infinity`.

**Status: the pure logic module is BUILT** — `lib/questionTypes/logic/taptarget.ts`
+ `taptarget.test.ts` (12 tests, green), registered in `logic/index.ts` as
`taptarget`. The rest (UI, map art, wiring, content) is below.

## Payload

```ts
interface TapTargetPayload {
  map: string;                     // which map image to render, e.g. 'near-east'
  target: { x: number; y: number } // correct spot, each coord in [0, 1]
  label: string;                   // place name, shown in the reveal
}
```

Submission: `{ x: number; y: number }` — the tap, in the same normalized space.

`validatePayload` (already implemented): `map` and `label` non-empty strings;
`target.x` / `target.y` finite numbers in `[0, 1]`.

### Coordinate convention

`x` = fraction from the **left** edge of the map image; `y` = fraction from the
**top** edge. The MapView renders the image at a known aspect ratio inside an
`onLayout`-measured box; the Play component converts a tap's `locationX/locationY`
to `[0,1]` by dividing by the measured box size, and the descriptor scores
purely in that space. No lat/long — the map key defines its own frame.

## The map image — placeholder now, real art later

This mirrors the **Mascot** pattern from Spec A: ship a placeholder that has the
real interaction wired, swap the art in later without touching game code.

- **`components/game/MapView.tsx`** renders a map by `key`. For now it draws a
  **stylized `react-native-svg` map** of the Mediterranean + Near East:
  simplified coastline paths, a parchment-tone fill, a few faint gridlines and
  a compass rose for period flavor. The SVG viewBox is `0 0 100 100` so screen
  taps map cleanly to `[0,1]` after dividing by the rendered size.
- One map key to start: **`'near-east'`** — frame spanning roughly Italy/Rome
  on the west to the Persian Gulf on the east, Asia Minor and the Black Sea
  coast on the north, the first cataract of the Nile on the south. This one
  frame holds every place in the planned content (Rome is near the left edge;
  add a `'west-med'` key later only if Spain questions need it).
- Real art swap-in: replace the SVG body with an `<Image>` of a commissioned or
  openly-licensed ancient-world map (bundled PNG via `require()`, or an
  `expo-image` asset). The `key → art` switch and the `[0,1]` contract stay put,
  so `target` coordinates authored against the placeholder must be re-checked
  against the final art (documented as a content caveat). Keep the placeholder
  and the real art at the **same frame** to avoid re-authoring coordinates.

CSP / offline note: the placeholder is pure SVG (no network). The real art must
be a bundled asset, never a remote tile source.

## UI components

- **`components/game/TapTargetPhase.tsx`** (`PlayProps`):
  - `TimerRing`, the `questionBox` (prompt + reference), then the `MapView` in
    a measured container.
  - A `Pressable`/`GestureDetector` over the map records the latest tap as a
    normalized `{x,y}` in local state and drops a pin marker there
    (`react-native-svg` circle or an absolutely-positioned dot). Re-tapping
    moves the pin.
  - A **"Lock In"** button (disabled until a pin exists) calls
    `onSubmit({ x, y })`. On `hasSubmitted` or `timeLeft <= 0`, auto-submit the
    current pin (or nothing → `Infinity` distance) using the
    `hasSubmittedRef` guard pattern from `EstimationPhase`.
  - Optional polish: pinch-to-zoom / pan on the map (Reanimated + gesture-
    handler, already installed). Not required for v1 — a fixed map is fine.
- **`components/game/TapTargetReveal.tsx`** (`RevealProps`, reads `breakdown`):
  - `MapView` with three pins: the **true location** (green, labelled with
    `breakdown.label`), **your tap** (accent), **their tap** (muted). Draw a
    thin line from each player's pin to the target.
  - A verdict line: "Closer! 🎯" / "Dead heat" / "They were closer" — same
    wording family as `EstimationReveal`.
  - Show each player's miss distance in a friendly unit (e.g. "you were about a
    thumb's width off" is too cute — just a small/medium/far band, or a
    percentage of the map).

## Wiring checklist (parallels the Spec A new-type tasks)

1. `lib/questionTypes/logic/types.ts` — `TapTargetPayload` **(done)**.
2. `lib/questionTypes/logic/taptarget.ts` + `.test.ts` **(done)**.
3. `lib/questionTypes/logic/index.ts` — export + `TYPE_LOGICS.taptarget` **(done)**.
4. `lib/gameTypes.ts` — add `TapTargetPayload` to the `Question.payload` union.
5. `lib/questionTypes/index.tsx` — `UI.taptarget = { Play: TapTargetPhase, Reveal: TapTargetReveal }`.
6. `components/game/MapView.tsx`, `TapTargetPhase.tsx`, `TapTargetReveal.tsx` — new.
7. `components/game/gameStyles.ts` — map/pin styles.
8. `supabase/schema.sql` + `scripts/migrate-add-question-types.js` — add
   `'taptarget'` to the `questions_type_check` list. **Owner runs the ALTER
   SQL** in the Supabase SQL editor (no `exec_sql` RPC), then
   `node scripts/check-schema.js` should accept `type='taptarget'`.
9. `scripts/import-questions.js` — add `taptarget` to `PLAYABLE_TYPES` and
   `NEEDS_PAYLOAD`; `validate()` already delegates to
   `getTypeLogic(type).validatePayload`.
10. `scripts/check-schema.js` — add a `type='taptarget'` insert probe.
11. `data/test-new-types.json` (or a new `data/test-taptarget.json`) — a couple
    of hand-placed questions for the phone playtest; reseed `NEWTYP`.
12. `docs/superpowers/plans/2026-09-06-tap-the-map-geography.md` — the bite-sized
    implementation plan for tasks 4–11.

## Content plan

Author against the `'near-east'` frame. Each question:

```json
{
  "question": "Tap the location of Nineveh, the great Assyrian capital.",
  "type": "taptarget",
  "category": "Places",
  "difficulty": "medium",
  "reference": "cross-check: Insight on the Scriptures, Vol. 2, 'Nineveh'",
  "payload": { "map": "near-east", "label": "Nineveh", "target": { "x": 0.63, "y": 0.30 } }
}
```

Batch 1 targets (~20): Jerusalem, Bethlehem, Nazareth, the Sea of Galilee,
Jericho, Samaria, Hebron, Beersheba, Dan, Mount Sinai, the Nile delta / Goshen,
Ur, Haran, Babylon, Nineveh, Damascus, Tyre, Antioch (Syria), Tarsus, Ephesus,
Athens, Corinth, Philippi, Patmos, Malta, Rome. `x/y` are eyeballed against the
placeholder SVG and **must be re-verified when real map art lands**.

Coordinates are the fragile part: keep them in the gitignored `data/` files with
the rest of the content, and add a `data/covered_entries.md` note that the
`taptarget` `x/y` values are placeholder-frame-specific.

## Open questions

- **Map frame vs. Spain.** The planned content tops out at Rome. If the owner
  wants "tap where Paul hoped to go (Spain)" or western-Mediterranean naval
  questions, add a second `'west-med'` map key rather than zooming the one
  frame out so far that Israel becomes a few pixels. Decision deferred until
  there's Spain content.
- **Zoom/pan.** Skip for v1 (fixed map). Revisit if playtesters find the
  targets too cramped on a phone.
- **Real map art sourcing.** Commissioned vs. an openly-licensed PD historical
  map vs. a cleaned-up SVG. Same "next steps, not now" bucket as the mascot art.
- **Absolute-accuracy floor.** Currently pure closest-wins (parity with
  estimation): two wild taps still hand someone 300 points. If that feels bad
  in playtest, add "if the winner's tap is > 0.4 of the map away, halve the
  pot" — but only after seeing it.
