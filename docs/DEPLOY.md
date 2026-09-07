# Deploying the web build to Cloudflare Pages

The Expo app has a working web target (used for playtesting). Cloudflare Pages
can host it for free and redeploy on every push — no CLI, no server.

## One-time setup (Cloudflare dashboard)

1. **dash.cloudflare.com** → *Workers & Pages* → *Create* → *Pages* →
   *Connect to Git* → pick the `InsightTrivia` repo.
2. **Production branch:** `feature/question-type-system` (the v3 work isn't on
   `master` yet — change this to `master` after the branch merges).
3. **Build settings:**
   - Framework preset: *None*
   - Build command: `npx expo export --platform web`
   - Build output directory: `dist`
4. **Environment variables** (add under both *Production* and *Preview*):
   - `EXPO_PUBLIC_SUPABASE_URL` — copy from your local `.env`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — copy from your local `.env`
   - `NODE_VERSION` — `22` (or rely on the committed `.nvmrc`)
   - **Do NOT add `SUPABASE_SERVICE_ROLE_KEY`.** It bypasses all database
     security and would be baked into the public JS bundle. It is only for the
     local `scripts/import-questions.js` / `update-questions.js` tools.
5. Save & Deploy. You get a permanent URL like
   `https://insight-trivia.pages.dev` plus a unique URL per deploy.

After that, every `git push` to the production branch rebuilds and republishes
to the same URL. Pushes to other branches get their own preview URL.

## What's in the repo for this

- `public/_redirects` — `/*  /index.html  200`. Expo copies `public/` into
  `dist/` on export; Cloudflare reads `dist/_redirects` and serves the SPA so
  deep links (e.g. `/game/ABC123`) don't 404.
- `.nvmrc` — pins the build to Node 22 (Expo SDK 57 needs Node ≥ 20.19).

## Verifying the build locally

```
npx expo export --platform web
npx serve dist        # or: python -m http.server -d dist 8080
```

Open the printed URL. If Supabase calls fail, your local shell is missing the
`EXPO_PUBLIC_*` vars — `expo export` reads them from `.env`, so a normal local
run picks them up automatically.

## Notes

- The web build talks to the same live Supabase project as everything else, so
  hosted playtests share the real question bank and rooms.
- Realtime multiplayer works from the hosted build with no extra config.
- `dist/` is gitignored — Cloudflare builds it fresh each time.
- If you later want per-route static HTML instead of an SPA, set
  `web.output: "static"` in `app.json` and drop `public/_redirects`.
