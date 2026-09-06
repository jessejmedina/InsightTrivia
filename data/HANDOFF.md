# Insight on the Scriptures — Trivia Extraction Handoff

This documents the workflow used in a Claude.ai chat session to generate
Insight-sourced trivia questions for the app, so it can continue inside
Claude Code / VS Code with direct repo access.

## Source material

- `it-2_E.pdf` — Insight on the Scriptures, Volume 2 (Watchtower Bible and
  Tract Society). Covers headwords roughly from "Jehovah" through "Z".
- Volume 1 (A through the "Jehovah" boundary) has **not** been supplied yet.
  A handful of Vol. 1 facts (Gideon, Ephod) were sourced via web search of
  jw.org rather than the PDF itself — treat those as lower-confidence than
  the PDF-verified ones until Vol. 1 is uploaded and re-verified directly.

## Step 1 — Extract text

```bash
pdftotext -layout it-2_E.pdf it2_full.txt
```

`-layout` preserves the two-column page layout as best it can, which keeps
each dictionary-style entry roughly readable. The PDF has embedded text
(not scanned images), so this works cleanly — no OCR needed.

## Step 2 — Build a headword index

Entries in Insight look like:
```
MOSES     [Drawn Out; or, Rescuer]. Hebrew prophet, leader...
```
Because of the two-column layout, some headwords land at the start of a
line and some get glued onto the end of the previous column's last line.
`extract_headwords.py` catches both cases with a regex that looks for an
ALL-CAPS word/phrase immediately followed by whitespace and then `(` or `[`
(the pronunciation/definition bracket that begins almost every entry).

Run it once per volume to get a searchable list of every entry name:
```bash
python3 extract_headwords.py it2_full.txt > headwords.txt
```

Use that list to find famous names worth covering, then locate the full
entry with:
```bash
grep -n "^SOLOMON  *(\|^SOLOMON  *\[" it2_full.txt
```
(Adjust spacing/pattern as needed — some entries are mid-line, see script
comments.)

## Step 3 — Get real page numbers for citations

`build_page_index.py` scans the extracted text for the running
page-number headers/footers pdftotext preserves (e.g. a lone line like
`435` near a headword, or `MOSES    436`), builds a sorted index of
(line_number → page_number), and gives you `nearest_page(line_number)` to
look up the actual printed page for any entry you found in Step 2. This is
what produced citations like:
```
"Insight on the Scriptures, Vol. 2, 'Moses', p. 434"
```

## Step 4 — Read the entry, write questions in your own words

**Copyright constraint: never quote or closely paraphrase Insight's actual
sentences.** Read the entry, extract the facts, and write original
question/answer pairs. This is what all 62 questions produced so far do.

## Output schema (matches `scripts/import-questions.js` / Supabase `questions` table)

**The question-type system shipped (v1 → v2 → v3). The importer runs under
`tsx` now (`npx tsx scripts/import-questions.js …`) and delegates payload
validation to the descriptor logic in `lib/questionTypes/logic/`.** Every
playable type and its exact shape:

```jsonc
// multiple_choice — the only "race" (buzz-in) type. options ARE stored now.
{ "question": "…?", "type": "multiple_choice", "answer": "Rehoboam",
  "options": ["Rehoboam", "Solomon", "Asa", "Uzziah"],   // exactly 4, must include answer
  "category": "People", "difficulty": "medium",
  "reference": "…", "hint": "optional" }

// ordering — arrange exactly 4 distinct items
{ "question": "Put these in order.", "type": "ordering",
  "payload": { "items": ["First", "Second", "Third", "Fourth"] },   // exactly 4, distinct
  "category": "Chronology", "difficulty": "medium", "reference": "…" }

// matching — exactly 4 pairs, distinct left values (duplicate right is OK)
{ "question": "Match each …", "type": "matching",
  "payload": { "pairs": [ {"left":"A","right":"1"}, {"left":"B","right":"2"},
                          {"left":"C","right":"3"}, {"left":"D","right":"4"} ] },
  "category": "People", "difficulty": "medium", "reference": "…" }

// estimation (v3) — closest slider guess wins the pot. answer stays null.
{ "question": "How many …?", "type": "estimation",
  "payload": { "value": 40, "unit": "years", "min": 0, "max": 120,
               "step": 1,        // optional
               "log": true },    // optional — log-scale slider for wide ranges; needs min > 0
  "category": "Chronology", "difficulty": "medium", "reference": "…" }
// bounds rule: put the true value in the middle third; neither extreme absurd.

// progressive (v3) — "Which X am I?"; clues auto-reveal, buzz, pick from 4. Uses options + answer.
{ "question": "Which prophet am I?", "type": "progressive", "answer": "Elijah",
  "options": ["Elijah", "Elisha", "Samuel", "Nathan"],   // exactly 4, must include answer
  "payload": { "clues": ["vague clue", "…", "specific clue"] },   // 3 to 5, vague → specific
  "category": "Prophets", "difficulty": "medium", "reference": "…" }

// swipe (v3) — sort 4-8 cards between two categories. answer stays null.
{ "question": "Old Testament or New Testament book?", "type": "swipe",
  "payload": { "categoryLeft": "Old Testament", "categoryRight": "New Testament",
               "cards": [ {"text":"Nahum","side":"left"}, {"text":"Jude","side":"right"}, … ] },
  // 4-8 cards, categories distinct, ≥1 card per side
  "category": "Scriptures", "difficulty": "easy", "reference": "…" }
```

Conventions:
- **category**: free text. In use: `People`, `Places`, `Chronology`,
  `Prophets`, `Apostles`, `Jesus`, `Scriptures`, `Tabernacle`, `History`,
  `Creation`, `Bible Basics`, `JW History`. Unrecognized → `General`.
- **difficulty**: `easy` (well-known) / `medium` (needs the specific
  account) / `hard` (obscure specifics — reign years, minor names, exact
  numbers).
- **reference**: full citation naming volume + headword. Stopgap for
  facts not individually PDF-verified:
  `"<scripture verse> (cross-check: Insight on the Scriptures, Vol. N, '<headword>')"`.
  Upgrade to real page numbers on a later pass (see `covered_entries.md`).
- **hint**: optional; MC/progressive only. Omit the key if none.

## What's already covered — don't duplicate

See `covered_entries.md` for the full list of headwords already turned
into questions, and a starter list of famous entries **not yet covered**
worth doing next. The import script already skips exact duplicate question
text, but re-covering the same entry with different phrasing wastes an
extraction pass, so check this list first.

## Files in this handoff

- `HANDOFF.md` — this file
- `extract_headwords.py` — pulls all entry headwords from extracted text
- `build_page_index.py` — page-number lookup for citations (`nearest_page`)
- `covered_entries.md` — what's done, what's famous-but-not-done
- `it2_full.txt` — Insight Vol. 2 text dump (J–Z headwords); Vol. 1 not
  supplied
- `insight-vol2-questions*.json`, `insight-vol2-newmine-*.json` — the
  Bible-content MC / ordering / matching batches
- `jw-history-*.json` — a separate category from the *Proclaimers* book
- `insight-{estimation,progressive,swipe}-batch*.json` — the v3 new-type
  batches (2026-09-06; 60 / 48 / 47 questions)

To import a batch (needs the `questions.type` CHECK constraint to allow
the type — see `covered_entries.md` for the v3 ALTER TABLE):
```
npx tsx scripts/import-questions.js data/<file>.json    # single file
npx tsx scripts/import-all.js                           # every data/*.json, one dedupe+insert
```
`validate()` reports malformed rows without inserting; the insert skips
exact-duplicate question text. Quick client-side check of a file:
`npx tsx -e "const{validate}=require('./scripts/import-questions.js');JSON.parse(require('fs').readFileSync(process.argv[1])).forEach((r,i)=>{const v=validate(r,i);if(!v.ok)console.log(i,v.errors)})" data/<file>.json`
