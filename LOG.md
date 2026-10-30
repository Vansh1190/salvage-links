# LOG.md — timestamped, from commands actually run (2026-10-27)

| time | action | result |
| --- | --- | --- |
| 13:50 | env probe (`node -v`, `tsc`, `ffmpeg`, `browser` tool) | node v24.21.0, ffmpeg present, **no chromium installed**, no docker/lighthouse |
| 17:5x | Phase-0 questions sent; user replied "1 ok 2 ok 3 ok, do everything on your own, spawn sub-agents, 5 yes" | defaults adopted, no approval gate |
| 18:0x | verified token identity + scopes | `login: Vansh1190`, `x-oauth-scopes: repo`, rate limit 4990/5000 |
| 18:1-18:4 | 5 research fan-out agents (HN Algolia, GitHub REST, Reddit RSS, Stack Exchange API, surveys/blogs/forums) | **122 pain points**, 5 source types, 139 unique URLs |
| 18:4x | clustering agent + adversarial URL auditor | 12 clusters scored; 47 sampled URLs: 40 strict pass, 7 reddit-blocked, **0 fabricated** |
| 19:0x | hostile review of the top 4 + evidence pass on "saved links graveyard" + static-feasibility pass | Pocket shutdown confirmed at primary source (`getpocket.com/home` HTTP 200, "phase out Pocket"); 24 GitHub issues; Safari 7-day eviction is the core risk |
| 19:1x | **product selected**, overturning my own feasibility kill | DECISIONS D4; SPEC.md written |
| 19:1x | `npm i -D vite@5 vitest @playwright/test` → real ERESOLVE | fixed with vite@8 + vitest@5 |
| 19:3x | `playwright install chromium` (background) stalled at 0% | ran in foreground instead: Chrome-for-Testing 156.0.8078.4, 681 MB, exit 0 |
| 19:4-20:0 | core modules + UI slices; `tsc --noEmit` loop | first build produced **no CSS** — styles.css was never imported; fixed, verified `dist/assets/*.css` + `<link>` |
| 20:0x | parser bug found by tests: multiple `<A>` per line dropped | rewrote `parseBookmarksHtml` as a token scanner |
| 20:1x | e2e run: 12 failed — app stuck at "Loading your library…" | root cause: `render()` was never subscribed to state changes. one-line fix, 12/12 then green |
| 20:2x | offline test passed but was weak | strengthened: asserts `serviceWorker.controller` and `transferSize === 0` |
| 20:1x | review army (3 parallel agents: code, spec/honesty, UX) | **6 blockers, 14 majors** → `research/REVIEW-CODE.md`, `REVIEW-SPEC.md`, `REVIEW-UX.md` |
| 20:2-21:0x | fixes: deck resume, honest undo, entitlement-aware deck, sanitised restores, collision-safe ids, cross-tab sync, index caching, URL canonicalisation, demo curation | each fix has a test |
| 21:0x | `node scripts/curate-sample.mjs` | 180 candidate URLs → **133 kept** because they answered HTTP 200 today; 21 refused us, 23 dead |
| 21:0x | `node scripts/verify.mjs` | **axe: 0 violations on all 7 routes** desktop and mobile, populated library; 10k-link run: import 923 ms, triage 64 ms, pulse 98 ms, search 419 ms → 16 ms cached |
| 21:0x | `npm run lighthouse` | perf **100**, a11y **100**, best-practices **100**, seo **100** (desktop simulated, site served under a `/salvage-links/` base path) |
| 21:1x | `vitest run` / `playwright test` | **58 unit tests passed** / **18 browser tests passed** |
| 21:2x | deploy attempt: `POST /user/repos` | **HTTP 403 "Resource not accessible by personal access token"** (tried minimal body and full body; other endpoints on the same token return 200, so the token is live) → **not deployed** |
| 21:2x | deploy rehearsal against a local bare repo | `main` + `gh-pages` branches push fine; artifact has `.nojekyll`, relative `./assets/...` refs, `sw.js` at root |


## Deploy + live verification (2026-10-27, 21:1x-21:3x)

| time | command | result |
| --- | --- | --- |
| 21:1x | `POST /user/repos` with the credential-file token | **403** "Resource not accessible by personal access token" (fine-grained PAT cannot create repos) |
| 21:1x | same call with the classic PAT from Phase 0 | **201** → `Vansh1190/salvage-links` |
| 21:1x | `git push` (both tokens, four auth forms) | refused: "Password authentication is not supported" / "Permission … denied" → wrote `scripts/publish-via-api.mjs` (Git Data API) |
| 21:2x | first publish run | `POST /git/blobs` → **409 "Git Repository is empty"** → added a Contents-API seed step |
| 21:2x | second publish run | commits 1-2 ok; commit 3 tree → **404 on 9/9 retries (2 s…60 s)** → fell back to one squashed commit, said so in the commit message; `gh-pages` + Pages enabled |
| 21:3x | `node scripts/verify-live.mjs` | **FAILED at boot**: served `index.html` began `PCFkb2N0eXBlIGh0bWw+` — every file was **base64 text**, because `POST /git/blobs` needs `encoding:"base64"` explicitly. HTTP 200 had told me nothing |
| 21:3x | fixed the blob encoding, republished | Pages `building → built`; live boot OK |
| 21:3x | `node scripts/verify-live.mjs` | **13/14**, one failure being my own check assuming Chromium fetches the manifest eagerly; changed to request it directly (200, `application/manifest+json`) |
| 21:3x | final live run | **15/15 passed** — SW scope `https://vansh1190.github.io/salvage-links/`, `controlled:true`, demo import "133 added", deck "2 of 5", reload keeps position, offline reload `transferSize 0`, **no third-party requests**, **no console/page errors**, 0 px overflow at 390 |
| 21:3x | `npx lighthouse <live url>` | perf **98**, a11y **100**, best-practices **100**, seo **100** (LCP 1.4 s, TBT 0 ms, CLS 0; speed-index 0.85 and cache-insight 0 are the only sub-0.9 audits — Pages sends `max-age=600` and I cannot set headers) |
| 21:3x | `.git/config` scrubbed of an embedded credential after a failed push; compared live vs local asset hashes → **IDENTICAL BUILD** |
| 21:4x | visual pass on `shots/live-deck-desktop.png` → demo titles said "www.reddit.com — …" while the card chip said "reddit.com"; fixed title generation + centred the deck on tall desktops, rebuilt, **18/18 e2e still green**, republished (`building → built`, HTTP 200) |

## 2026-10-27 — Phase 9: deep review, then fixed everything it found

Read all 14 source files, the service worker, the scripts and the tests without sub-agents, as
asked. Wrote `docs/REVIEW-DEEP.md` with a proof per finding, then fixed all of them:

- **P0** the expired-trial sentence had lost its `FREE_LINK_LIMIT` interpolation, so users read
  "past the first  stop importing"; a code comment described licence verification that does not exist.
- **P1** an expired plan kept dealing the 12-card deck it cut while Pro was on (now trimmed and
  explained); the cross-tab reload bypassed validation the boot path applies; an id collision at
  boot hid a link instead of keeping both; a one-off storage error haunted the header forever.
- **P2** folder rename reached only the 8 biggest folders; demo facts ("~130 links, 2026-10-27")
  were hardcoded instead of generated; the bookmarks export invented `LAST_visit` and dropped
  notes while claiming to round-trip; `window.open` after an await invited silent popup-blocking;
  the free cap counted tossed links; one async write still targeted a detached node.
- **P3** deleted the dead second import path and ~12 other unused exports, unused `Pulse` fields,
  never-emitted event types, no-op normalise branches and an unused service-worker listener.

Verification after the sweep: `tsc` clean, **58** unit tests, **22** browser tests (11 scenarios
× 2 viewports) against the built site, `node scripts/repro-findings.mjs` and
`node scripts/probe-expiry-deck.mjs` both now print the corrected output.

Method note for future passes: my reading of this environment's file output drops characters, so
"mangled identifier" panics were display artifacts twice. Every claim in the review is backed by
`tsc`, a test, or an in-browser probe, never by eyeballing source.
