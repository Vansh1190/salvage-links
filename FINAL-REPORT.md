# FINAL REPORT — Salvage

**Live:** https://vansh1190.github.io/salvage-links/
**Repo:** https://github.com/Vansh1190/salvage-links (branch `main` = source, `gh-pages` = build)
**Status:** deployed and verified in a real browser against the live URL.

---

## 1. What shipped

**Salvage rescues the links you already saved but never read.** It deals you a *finite* deck of
your own forgotten saves each day — five by default — and you spend about four seconds on each:
open it, keep it for reading, "not now — back Nov 3", or toss it. The pile bar shrinks, a streak
builds, and every card says *why now* in plain words ("saved 3 years ago · never opened · you open
reddit.com a lot"). It is local-first: no account, no server, no analytics; the library lives in
IndexedDB and leaves only through an export you click.

Why this problem won (full evidence in `RESEARCH.md`, 122 pain points from 5 source types):

- Resurfacing forgotten saves is the most-requested feature across the read-later ecosystem,
  2016→2026 — karakeep#435 "Random Bookmarks View to rediscover forgotten links",
  wallabag#2285 "the article on page 28 will never be read… forgotten forever",
  miniflux#1493 digest for "~120 per day".
- Users simultaneously lost their libraries to vendor death: `getpocket.com/home` (HTTP 200,
  fetched) says "we've made the difficult decision to phase out Pocket"; HN 44063662 sits at
  1222 points / 761 comments.
- A hostile review of my own top-4 scored clusters killed all of them on one ground: *nothing they
  accumulate is worth losing*, so a 40-day trial would be theatre. A link library is the one thing
  in this corpus that accrues for years and that users watched a vendor delete.

**Built:** deck + explainable deterministic resurfacer, Netscape-format bookmarks import
(Chrome/Firefox/Safari dialects, token scanner), local BM25 search over an inverted index, reading
queue, pulse/streak, folder rename, duplicate detection and cleanup, notes, JSON + CSV +
bookmarks.html export, `.ics` reminder, 40-day Pro trial with capability gating, offline service
worker with build-generated precache, keyboard-first UI across 7 routes, honest Limits page.
**Not built, on purpose:** sync, article-text archiving, push notifications, dead-link scanning,
payments, AI summarisation, multi-device anything — each stated in the product, not just here.

## 2. What was verified, and by which command

| Check | Command | Result |
| --- | --- | --- |
| Unit logic (parser, canonical URLs, resurfacer, BM25, trial, stats, ics, exports) | `npx vitest run` | **58 passed** |
| Real user flow, built site served under a `/salvage-links/` base path, desktop + mobile | `npx playwright test` | **18 passed** (9 scenarios × 2 viewports) |
| **Live** site: boot, asset resolution, manifest, SW scope, import, triage, reload persistence, offline reload, privacy, 390 px | `node scripts/verify-live.mjs` | **15/15 passed**, incl. `no third-party requests`, `no console or page errors`, offline reload with `transferSize === 0` |
| Accessibility of a *populated* library (Lighthouse only sees the empty state) | `node scripts/verify.mjs` | **axe: 0 violations** on all 7 routes, desktop and mobile |
| Scale | same script, generated 10,000-link file | import 923 ms · triage 64 ms · pulse 98 ms · search 419 ms then 16 ms cached · heap ~19–33 MB |
| Lighthouse, local build (desktop simulated) | `npm run lighthouse` | 100 / 100 / 100 / 100 |
| Lighthouse, **live** URL (mobile simulated) | `npx lighthouse <live url>` | **98 / 100 / 100 / 100** — LCP 1.4 s, TBT 0 ms, CLS 0 |
| Payload | build output | 45.8 kB JS (16.4 kB gzip) + 8.8 kB CSS (2.6 kB gzip), zero runtime dependencies |

The 40-day trial is not a mock-up either: an e2e test rewrites `firstRunAt` 45 days into the past
*inside IndexedDB*, reloads, and asserts the chip flips to "Trial ended · free plan", a deck-size
setting of 12 is clamped to 5, Pro capabilities lock, and the soft-trial sentence is on screen.

## 3. What is unverified (say it before someone finds it)

- **Safari and Firefox were never run.** Only Chromium exists in this sandbox. All claims about
  iOS storage eviction, PWA install and notification support come from MDN/WebKit docs.
- **Real Firefox/Safari exports** were not downloaded; I verified Chromium's own exporter format
  from `bookmark_html_writer.cc` and hand-built the other dialects.
- **Retention.** The habit loop is implemented and tested; nobody outside this sandbox has used it,
  and there is deliberately no analytics to measure it with. This is the product's real risk.
- **Willingness to pay.** No pricing research was done; billing is a documented seam
  (`getEntitlement()`), not a flow.
- See `BLOCKERS.md` for the full list.

## 4. Known issues and deviations

1. **History is partially squashed.** `GET /repos/Vansh1190/salvage-links/commits` returns **3**
   commits on remote `main`: slice 1, slice 2, then one commit holding everything after them
   (local `git log` has 11). Cause: GitHub refused the 3rd replayed tree with a durable HTTP 404
   across 9 retries from 2 s to 60 s backoff. The squashed commit body says it is squashed, and
   `LOG.md`/`DECISIONS.md` retain every per-slice message, author and date.
2. **CI is not running.** The supplied token has `repo` but not `workflow` scope, so GitHub rejects
   any commit touching `.github/workflows/**`. Valid workflows sit in `ci/` with a one-command
   `git mv` in `ci/README.md`.
3. **No `git push` was possible at all** with either token; publication goes through the Git Data
   API (`scripts/publish-via-api.mjs`).
4. First deploy shipped **broken while answering HTTP 200** — every file was served as base64
   because I omitted `encoding:"base64"` on blob creation. A 200 meant nothing; the browser check
   caught it. Fixed and re-verified.
5. Free-plan cap is enforced on import but a *restored* JSON over the cap is silently truncated to
   the headroom, which is honest in the status line ("N over the free 300 link cap — not imported")
   but is a coarse edge.
6. `speed-index` 0.85 and `cache-insight` 0 on the live Lighthouse run: GitHub Pages sends
   `cache-control: max-age=600` for everything and I cannot set headers, so the service worker
   carries freshness.

## 5. Research honesty notes

The research corpus survived an adversarial re-fetch by a separate agent: 47 sampled URLs, **0
fabricated**, 40 strict passes, 7 Reddit links blocked-but-feed-verified. It also corrected me:
my own "~120 pain points each file" phrasing was wrong (122 rows *total*), Reddit covers 2 of 18
subreddits with no scores at all, and 10 of 23 HN rows cite a search-listing URL rather than the
specific item. Those corrections are in `RESEARCH.md` and `research/AUDIT.md` rather than quietly
edited away. The demo library was rebuilt after measurement showed it contained dead and synthetic
links: 180 candidates → **133 kept because they answered HTTP 200 today** (`docs/SAMPLE-STATUS.md`).

## 6. What I would build next, in order

1. **Export/import as a first-class ritual** (weekly nudge + one-tap restore). It converts the
   Safari eviction risk from a caveat into a habit, and it is the only honest durability answer a
   static site can give.
2. **BYO sync as the paid feature**: the user's own WebDAV/Dropbox/Google Drive file, encrypted
   client-side. That is what a 40-day trial would actually gate — not today's Pro toolset.
3. **Perception improvements on the deck**: a "same folder as things you kept" reason line is weak
   filler compared with "you open reddit.com a lot"; measure which reason makes people act.
4. **A worker for search** so the first query on a 10k library stops costing 0.4 s.
5. **Instrumented-but-private retention**: opt-in local counters the user can read (and export), so
   "is this a habit?" can be answered without analytics.
6. Fix the two deployment deviations: un-squash `main` and enable `ci/` once a token with the
   `workflow` scope is available.
