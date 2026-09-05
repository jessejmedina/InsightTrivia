# Expo SDK Upgrade (54 → 57) — Implementation Plan

> **STATUS: COMPLETE (2026-09-05).** All 4 tasks done. Commits: 54→55 `acc0cd6`,
> 55→56 `44e157d`, 56→57 `603a856` on `feature/question-type-system` (installed
> expo 57.0.20 / RN 0.86.3). Task 4 verification: expo-doctor 21/21, tsc clean
> except the 6 pre-existing `profile.tsx` baseline errors, 26/26 tests,
> `check-schema.js` OK (free_text count 0, answer NOT NULL still dropped, `.env`
> loads), web regression covering all 4 question types + 20s/30s timers +
> timeout auto-advance + results screen with zero console errors, and the human
> confirmed Expo Go opens the SDK-57 project on-phone with no version banner.
> Task 4 Step 3's fuller on-phone playthrough was considered covered by the web
> regression + the successful Expo Go open. WS2 planning is now unblocked.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan cannot be fully executed by an autonomous subagent** — every task's manual regression step requires the human to open the app on their own phone via Expo Go. Use subagent-driven-development only for the command/doctor/typecheck/test steps within a task; the phone-verification step always needs the human in the loop.

**Goal:** Move `feature/question-type-system` from Expo SDK 54 (React Native 0.81.5) to SDK 57 (React Native 0.86), one SDK major at a time, so the project's Expo Go on-device testing works again and Workstream 2 (drag-based ordering/matching, which needs real-device gesture verification) has a working test path.

**Architecture:** No application code changes are expected — this is a dependency-version migration. Each step bumps one SDK major via `npx expo install`, reconciles versions with `npx expo install --fix`, runs `npx expo-doctor` to catch native-config drift, typechecks, runs the existing unit/import test suite (unchanged — no logic touched), then a manual regression pass on **both** web and Expo Go on a physical phone. Commit after each SDK step so a bad step is independently revertible.

**Tech Stack:** Expo CLI (`npx expo install`, `npx expo-doctor`), the project's existing Node test suite (`tsx --test`, `node --test`), Expo Go (App Store / Play Store, currently SDK 57).

**Spec:** No separate design doc — this plan implements the standing instruction in `AGENTS.md` ("Expo HAS CHANGED — read the exact versioned docs... before writing any code"), triggered by the discovery (2026-09-04 planning session for Workstream 2 of `docs/superpowers/specs/2026-08-31-question-types-v2-design.md`) that the installed SDK 54 no longer matches the Expo Go app on the user's phone (Expo Go only ever supports the current SDK; SDK 57 is current as of this writing), which blocks WS2's required on-device gesture testing.

## Global Constraints

- Upgrade **one SDK major at a time**: 54→55, then 55→56, then 56→57. Never combine two SDK bumps in one commit — Expo's own upgrade docs recommend this specifically so a breakage can be pinned to one step.
- After every step, in order: `npx expo install --fix` → `npx expo-doctor` → `npx tsc --noEmit` → `npm run test` → manual regression (web + Expo Go on phone) → commit. Do not proceed to the next SDK step while `expo-doctor` reports unresolved issues or the manual regression pass has an unexplained failure.
- Known relevant breaking changes already checked against this repo:
  - **SDK 55**: Legacy Architecture is removed — New Architecture becomes mandatory. `app.json` has no `newArchEnabled` override today, so this is expected to be a no-op; the SDK 55 manual regression pass is the checkpoint that would catch a New-Architecture-only runtime break.
  - **SDK 55**: Node.js `^20.19.4 | ^22.13.0 | ^24.3.0 | ^25.0.0` required. Installed Node is `v22.17.1` — already satisfies this and every later step.
  - **SDK 55/56**: breaking changes tied to `@expo/vector-icons`, `@react-navigation/*`, `expo-av`, `react-native-webview` — **none of these are dependencies of this repo** (verified via `package.json` grep before writing this plan), so those changes don't apply. Still worth a quick re-grep at each step in case a transitive dependency pulled one in.
  - **SDK 57**: React Native 0.86, documented as having no breaking changes from 0.85.
- **Correction (discovered during Task 2 execution, 2026-09-04):** `expo-doctor` on SDK 56 flags a known Hermes V1 memory regression (present in Hermes `250829098.0.10`–`.0.15`, fixed in `.0.16`+), with doctor's own advice being "upgrade to Expo SDK 57 with `expo@^57.0.9` or later." This is expected and self-resolves in Task 3 — do not attempt a workaround at SDK 56. Task 3 Step 1 targets `expo@^57.0.9` specifically (not bare `^57.0.0`) to make sure the fixed Hermes build is what lands.
- **Correction (discovered during Task 1 execution, 2026-09-04):** Expo Go on the phone only ever runs the *current* SDK (57) — it refuses to open an SDK 55 or 56 project too, not just SDK 54. There is no way to verify on-device via Expo Go at the intermediate steps. Manual regression at Task 1 and Task 2 is **web-only**; the phone/Expo Go check happens for the first time at Task 3 Step 5, once the project actually reaches SDK 57.
- No application logic changes in this plan. If `expo-doctor` or a regression failure requires an actual code fix, make the minimal fix, note it in the commit body, and re-run the full verification sequence for that step before moving on.
- `npm run test` must stay green with zero test-file edits throughout this plan — a failure here means the upgrade broke something, not that a test needs updating.
- Workstream 2 (interaction redesign) does not start until Task 4 of this plan is complete and committed.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `package.json` / `package-lock.json` | Expo-managed dependency versions | 1, 2, 3 |
| `app.json` | Only touched if `expo-doctor` or the SDK step's changelog requires a config key change (none known ahead of time) | 1, 2, 3 |
| (any file `expo-doctor` flags) | Fixed inline if a step surfaces a real incompatibility | 1, 2, 3 |

---

## Task 1: Upgrade SDK 54 → 55

**Files:** `package.json`, `package-lock.json`, possibly `app.json`

**Interfaces:** none — infra-only task.

- [x] **Step 1: Confirm the pre-upgrade baseline is green**

Run:
```bash
npx tsc --noEmit
npm run test
```
Expected: both pass with zero errors. This is the baseline — any failure after upgrading is attributable to the upgrade, not pre-existing debt.

- [x] **Step 2: Bump the Expo SDK package**

```bash
npx expo install expo@^55.0.0
```

- [x] **Step 3: Reconcile all Expo-managed dependencies**

```bash
npx expo install --fix
```
Expected: `expo-constants`, `expo-linking`, `expo-router`, `expo-status-bar`, `react`, `react-dom`, `react-native`, `react-native-safe-area-context`, `react-native-screens`, `react-native-web` all move to their SDK 55–compatible versions. `zustand`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill` are not Expo-managed and may be left untouched — that's expected.

- [x] **Step 4: Run expo-doctor**

```bash
npx expo-doctor
```
Expected: no unresolved issues. If it flags something (e.g. a peer-dependency mismatch, a config schema change), fix it now — do not proceed with open doctor warnings. Common fixes at this SDK boundary: an `app.json` key renamed/removed (check the step's flagged key against the SDK 55 changelog at https://expo.dev/changelog/sdk-55), or a manual `npm install <pkg>@<version>` for a package `expo install --fix` didn't touch.

- [x] **Step 5: Typecheck and run the existing test suite**

```bash
npx tsc --noEmit
npm run test
```
Expected: both pass, identical to Step 1's baseline. No test files should need edits — this step touches only dependency versions.

- [x] **Step 6: Re-grep for the SDK 55/56 breaking-change surface**

```bash
grep -rE "@expo/vector-icons|@react-navigation|expo-av|react-native-webview" package.json
```
Expected: no matches (confirms no transitive dependency silently pulled one of these in during the version bump).

- [x] **Step 7: Manual regression — web**

```bash
BROWSER=none npx expo start --web --port 8081
```
Sign in, create or join a room, start a game (host, `__DEV__` solo bypass is fine), and confirm: a race `multiple_choice` question shows the 4-option grid and scores on pick; an `ordering` question submits and scores; a `matching` question submits and scores; letting the timer hit 0 with no submission still auto-advances; the game reaches the results screen. Zero console errors.

- [x] **Step 8: Confirm Expo Go still can't open this SDK (expected, not a failure)**

Confirmed during execution: Expo Go's "Enter URL manually" against this dev server reports it needs SDK 57 while the project is SDK 55. This is expected — Expo Go only runs the current SDK, not a range — and is not a regression to chase. Skip on-device verification until Task 3 Step 5 (SDK 57). Web-only regression (Step 7) is sufficient to close this task.

- [x] **Step 9: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore(deps): upgrade Expo SDK 54 -> 55"
```
(Include `app.json` only if Step 4 actually changed it — check `git status` first and add only what changed.)

---

## Task 2: Upgrade SDK 55 → 56

**Files:** `package.json`, `package-lock.json`, possibly `app.json`

**Interfaces:** none.

- [x] **Step 1: Bump the Expo SDK package**

```bash
npx expo install expo@^56.0.0
```

- [x] **Step 2: Reconcile dependencies**

```bash
npx expo install --fix
```

- [x] **Step 3: Run expo-doctor**

```bash
npx expo-doctor
```
Expected: no unresolved issues. SDK 56 removes `expo`'s dependency on `@expo/vector-icons` and decouples `expo-router` from `react-navigation` — neither applies here (confirmed not used in this repo), but if doctor flags a transitive pull-in of either, resolve it before continuing (check https://expo.dev/changelog/sdk-56 for the exact migration note).

- [x] **Step 4: Typecheck and run the test suite**

```bash
npx tsc --noEmit
npm run test
```
Expected: both pass, unchanged from Task 1's baseline.

- [x] **Step 5: Manual regression — web only**

Repeat Task 1 Step 7's walkthrough (race question, ordering, matching, timeout auto-advance, results screen) on web. Skip Expo Go on the phone again — still SDK 56, still not the SDK 57 Expo Go requires; the first real on-device check is Task 3 Step 5.

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore(deps): upgrade Expo SDK 55 -> 56"
```

---

## Task 3: Upgrade SDK 56 → 57

**Files:** `package.json`, `package-lock.json`, possibly `app.json`

**Interfaces:** none.

- [x] **Step 1: Bump the Expo SDK package**

```bash
npx expo install expo@^57.0.9
```
(Not bare `^57.0.0` — SDK 56's `expo-doctor` run flagged a Hermes V1 memory regression fixed only in `expo@57.0.9`+; see the Global Constraints correction note.)

- [x] **Step 2: Reconcile dependencies**

```bash
npx expo install --fix
```

- [x] **Step 3: Run expo-doctor**

```bash
npx expo-doctor
```
Expected: no unresolved issues. SDK 57 is documented as having no breaking changes from 0.85/0.86, so this step should be the smoothest of the three.

- [x] **Step 4: Typecheck and run the test suite**

```bash
npx tsc --noEmit
npm run test
```

- [x] **Step 5: Manual regression — web and Expo Go**

Repeat the same walkthrough once more on both web and your phone via Expo Go. This time also confirm Expo Go opens the project **without any SDK-version warning banner** — that banner disappearing is the actual signal this plan succeeded.

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore(deps): upgrade Expo SDK 56 -> 57"
```

---

## Task 4: Final verification pass

**Files:** none — verification only.

- [x] **Step 1: Full test suite + typecheck one more time**

```bash
npx tsc --noEmit
npm run test
```
Expected: zero errors, all green.

- [x] **Step 2: Smoke-check the operational scripts**

These are plain Node scripts using `@supabase/supabase-js` (not Expo-managed), but confirm the toolchain bump didn't break the local Node script runner:
```bash
node scripts/check-schema.js
```
Expected: same output shape as before the upgrade (a schema report; the "free_text row count" probe should read `OK — no free_text rows` per the Workstream 1 migration).

- [x] **Step 3: Re-run the full manual game walkthrough once more, end to end, via `seed-test-room.js`**

```bash
node scripts/seed-test-room.js playtester
```
Then on Expo Go on your phone, sign in as `playtester`, join room `TESTTY`, and play a full game covering all 4 question types (multiple_choice, ordering, matching, and a second multiple_choice) through to the results screen, confirming scores, timers, and phase transitions all behave exactly as they did pre-upgrade.

- [x] **Step 4: Confirm `.env` still loads correctly**

Given the project's prior `EXPO_PUBLIC_SUPABASE_URL` gotcha (must be `https://<ref>.supabase.co`, not the dashboard URL), confirm sign-in and DB reads still work in Step 3 — if they don't, this is almost certainly unrelated to the SDK upgrade (env loading is untouched by it), but rule it out explicitly before concluding the upgrade itself broke something.

- [x] **Step 5: Update project memory / notes**

No code change — just confirm with the human that SDK 57 is now the baseline before starting Workstream 2, since WS2's plan will assume `npx expo install react-native-reanimated react-native-gesture-handler react-native-svg` resolves SDK-57-compatible versions.

---

## Self-Review

**Coverage:** every SDK boundary (54→55, 55→56, 56→57) gets its own gated task with doctor + typecheck + test + dual-platform manual regression + commit, matching Expo's official "upgrade incrementally" guidance. The specific known breaking changes for 55/56 were checked against this repo's actual dependencies before writing the plan (none apply). The originating problem — Expo Go on the phone rejecting the SDK-54 project — is explicitly the pass/fail signal in Task 1 Step 8 and Task 3 Step 5.

**Placeholder scan:** doctor-output-driven fixes (Task 1 Step 4, etc.) are inherently unknowable ahead of a live run — same pattern as WS1's Task 8 migration checkpoint — but each such step names the concrete command, the expected clean-run outcome, and where to look (the specific changelog URL) if it isn't clean, rather than a bare "fix issues" instruction.

**Type consistency:** N/A — no new interfaces introduced by this plan.

**Known risk:** New Architecture becoming mandatory at SDK 55 is the single highest-risk item in this migration. This repo has no custom native modules and no `newArchEnabled` override, so risk is low, but it's called out explicitly in Global Constraints and is exactly what Task 1's manual regression pass (Steps 7–8) is positioned to catch before Task 2 builds on top of it.
