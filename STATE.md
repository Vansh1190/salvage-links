# STATE.md — resume here

**Phase:** 8 DONE, shipped and verified live · **Phase 9:** deep code review done and all 14 findings fixed
**Updated:** 2026-10-27 · **Live:** https://vansh1190.github.io/salvage-links/ · repo `Vansh1190/salvage-links`

## Product
**Salvage** deals you a **finite deck of your own forgotten saved links each day** (5 by default);
~4 s per card — Open / Keep for reading / Not now (dated) / Toss, all undoable. Queue, local BM25
search, pulse + streak, folder rename, duplicate cleanup, notes, JSON/CSV/bookmarks.html export,
`.ics` reminder, 40-day soft Pro trial, offline service worker, keyboard-first, 7 routes.
No account, no server, no analytics; library lives in IndexedDB.
Spec `SPEC.md` · choice rationale `DECISIONS.md` (D4) · evidence `RESEARCH.md` + `research/`
User docs `README.md`, `docs/PRIVACY.md`, `docs/PRO-TRIAL.md` · honesty `BLOCKERS.md` · outcome `FINAL-REPORT.md`

## Phase 9 — deep review + fixes (2026-10-27)

`docs/REVIEW-DEEP.md` is the record: 2 P0, 4 P1, 6 P2, a P3 sweep, and **three of my own
suspicions disproven by measurement** (hostile-id selector crash, `computePulse` slowness,
"Return stalled" render storm). Every finding is fixed; the resolution table at the end names
the command or test that proves each one. Two new e2e scenarios exist only because of this pass
(deck trimmed by a lapsed plan without deleting today's decks; two records sharing one id both
stay visible), and the two tests that leaned on a second, unshipped import path now exercise
`sanitizeLink`, the code production actually runs.

## Gate status (all green)
- `npx vitest run` → **58 passed**
- `npx playwright test` → **22 passed** (11 scenarios × desktop + mobile), run against the **built**
  site served under a `/salvage-links/` base path
- `node scripts/verify-live.mjs` → **18/18** against the live URL (assets, manifest, SW scope,
  import, triage, reload persistence, offline with `transferSize===0`, no third-party requests,
  no console errors, 0 px overflow at 390)
- `node scripts/verify.mjs` → **axe 0 violations on all 7 routes** (populated library, both
  viewports); 10k-link run: import 923 ms, triage 64 ms, pulse 98 ms, search 419→16 ms
- Lighthouse: local build **100/100/100/100** (desktop simulated); **live URL 98/100/100/100**
  (mobile simulated, LCP 1.4 s, TBT 0 ms, CLS 0)

## Open deviations (do not "fix" by asserting they are fine)
1. Remote `main` has **3 commits** (slice 1, slice 2, one squashed remainder of 8 slices) — GitHub
   refused the 3rd replayed tree with a durable 404 (9 retries, 2 s→60 s). Local `git log` = 11;
   `LOG.md` keeps every slice.
2. **CI does not run** — token lacks `workflow` scope; valid workflows sit in `ci/` (see `ci/README.md`).
3. No `git push` works with either available token; publish path is `scripts/publish-via-api.mjs`
   (Git Data API), which also force-updates `gh-pages` and rebuilds Pages.
4. Everything about Safari/Firefox is documented, never observed — only Chromium exists here.

## Commands
```bash
cd /root/workspace-agent-server/dailyscale
npm run dev | npm test | npm run build | npm run e2e
npm run lighthouse        # scripts/audit.mjs (builds + serves under the Pages base path)
npm run audit             # scripts/verify.mjs (axe + 10k stress)
node scripts/verify-live.mjs          # checks the DEPLOYED site
node scripts/publish-via-api.mjs      # needs GH_TOKEN; rebuilds main + gh-pages + Pages
npm run curate            # rebuilds the demo library from URLs answering 200 today
```

## If resuming, next useful work
`FINAL-REPORT.md` §6 — export-as-ritual nudge, BYO encrypted sync as the real paid feature,
search in a worker, better "why now" reason ranking, private opt-in retention counters.
