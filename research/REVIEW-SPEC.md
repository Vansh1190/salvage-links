# REVIEW-SPEC.md — independent audit of operator claims vs reality

Auditor: second-pass hostile reviewer (not the operator, not the AUDIT.md author).
Date: 2026-10-27. Method: read-only file review + ran the repo's own commands (`npm test`,
`npm run e2e`) + browser probes against `scripts/serve-subpath.mjs` (scratch scripts in
`/tmp/cora/probe/`, no repo files edited except this report).
Every assertion below carries a file:line or a reproduced command output.

---

## 0. Headline

The research corpus survives re-audit (numbers are fetched, not recalled — my own API
re-checks match to the digit). The product core (data layer, resurfacer, deck, search,
exports, offline SW) is genuinely implemented, not stubbed. **The dishonesty is concentrated
in the commercial layer and the verification claims**: the e2e suite is RED at HEAD (4/14
fail) under a commit message claiming green; one settings control is dead with a lying
confirmation message; two Pro capabilities are phantoms; the 300-link free cap is bypassable
through the app's own JSON import; and two of the six "memory files" STATE.md references
(BLOCKERS.md, LOG.md) do not exist.

---

## 1. SPEC DRIFT — every v1 scope item and Pro capability

### 1.1 The seven vertical slices (SPEC.md:46-53)

| # | Slice | Verdict | Proof |
|---|---|---|---|
| 1 | IDB + bookmarks-HTML parser + normalisation/dedupe key | **implemented** | `src/db.ts:13-42` (4 stores, indexes), `src/bookmarks.ts:52-87` (token-scan parser, folder stack, entities), `src/normalize.ts:3-48`; 27 passing tests in `tests/io.test.ts` |
| 2 | Deck + Resurfacer (pure, unit-tested) + triage + daily seeding | **implemented, with 2 real bugs** | `src/resurfacer.ts:142-177` (pure, seeded), `src/state.ts:110-147` (ensureDeck). Bug A: `advance()` `src/state.ts:212-215` clamps at last index and `currentCard()` `src/state.ts:174-179` does not filter status ⇒ after tossing the FINAL card the tossed card stays on screen; "Deck cleared" empty state unreachable without reload. Probe output: `after tossing all: 10 of 10 \| heading: Today's deck`. Bug B: no timer/visibility listener anywhere (`grep setInterval\|visibilitychange src/` → empty); `ensureDeck` runs only at boot/import (`src/state.ts:91,269,304`) ⇒ a tab kept open (the installed-PWA case the app itself pushes) never rolls to tomorrow's deck |
| 3 | Import (file drop, merge/dedupe) + free export | **implemented** | `src/views.ts:250-308` (drop+paste+demo), `src/state.ts:248-272` (merge by dedupeKey); free JSON/HTML export `src/views.ts:320-325`; e2e "re-importing merges" test passes in my run |
| 4 | Queue + Library + local BM25 (`Intl.Segmenter` + inverted index) | **implemented, scale-shaky** | `src/search.ts:3-73` (real BM25, k1=1.4 b=0.75, Lucene-style idf); `src/views.ts:129-181`. Caveat: `runSearch()` rebuilds the whole index from all links on **every keystroke** (180 ms debounce, `src/views.ts:148-173`) — FEASIBILITY.md:269 promised a Web Worker + incremental updates; at 10k links this will stutter. Unmeasured |
| 5 | Pulse (stats + streak) + Pro features (dedupe, bulk cleanup, notes, CSV, .ics) | **partially implemented** | Pulse ✓ `src/stats.ts:25-81`, streak ✓ `:84-102`. Dedupe ✓, bulk rename ✓, notes ✓, CSV ✓, .ics ✓ (detail §2). **But SPEC.md:39's Pro row also promises "pulse history" and "multi-file merge": pulse history does not exist anywhere** (no per-week records; `has("pulse-history")` is never called — `grep has\( src/` shows only notes/bulk-cleanup/dedupe/export-csv/ics-reminder call sites); **multi-file merge is not gated at all** (file input is `multiple:true` unconditionally, `src/views.ts:260`, no cap check) — a "Pro" feature that is 100% free |
| 6 | Trial/entitlement seam + honest limits page | **mostly implemented, one false claim** | Seam ✓ `src/trial.ts:60-102` (single `getEntitlement`, re-evaluated every `emit()` `src/state.ts:79-83`); limits page ✓ `src/views.ts:367-382`. False: SPEC.md:41-42 says "today: local clock + **optional signed licence file**". No licence-file path exists — `verifyLicenceSignature()` always returns `{ok:false}` (`src/trial.ts:109-114`) and `proClaim` is written nowhere and read by nothing (`grep proClaim src/` → model.ts decl + trial.ts comment only) |
| 7 | Hardening: a11y, offline SW, empty/error states, mobile, Lighthouse | **partially done, claims overstate** | a11y plumbing real: skip link (index.html:18), aria-live announcer (`src/dom.ts:38-47`), roles/aria on chips/progressbar, focus management. Offline SW **verified working** (e2e offline test passes: controller=true, transferSize=0 in my run). Error/empty states ✓ (`src/views.ts:47-64,402-406`). BUT: screenshots are 390px (Pixel 7, `playwright.config.ts:22`), SPEC.md:73 says **360px**; Lighthouse was run against `#/import` on a **fresh profile with an empty library** (`scripts/audit.mjs:14`, `shots/lh.json` finalDisplayedUrl) — the 100/100/100/100 does not describe a populated app |

### 1.2 Pro capability table (SPEC.md:34-39) — line by line

| Promised | Reality | Proof |
|---|---|---|
| Free ≤ 300 links | **half-true.** Cap enforced only on new bookmarks-HTML/URL-paste imports. Browse/search/deck never restricted (arguably better than promised). **JSON re-import bypasses the cap entirely** — proven live in §5.3 | `src/state.ts:255-259` (cap in `ingest`) vs `src/state.ts:284-307` (`importSnapshot` — no limit check) |
| Free deck 5/day | implemented (post-expiry); during trial 10 | `src/trial.ts:99`, `src/state.ts:123` |
| Free search, open/keep/toss, JSON + bookmarks-HTML export | implemented, verified disabled-button state only locks paid caps | probe: expired plan → `Export JSON disabled: false`, `Export bookmarks.html disabled: false` |
| Pro: deck 10/day | implemented via entitlement | `src/trial.ts:72,87` |
| Pro: "snooze scheduling" | **not a Pro feature anywhere** — snooze action and the `snoozeDays` setting are free, ungated | `src/state.ts:199-202`, `src/views.ts:313,348`; no capability string for snooze in `src/trial.ts:9-33` |
| Pro: dedupe | implemented + gated | `src/views.ts:265,292-305` → `bulkTossDuplicates` `src/state.ts:309-321` |
| Pro: bulk folder cleanup | implemented + gated | `src/views.ts:230` → `renameFolder` `src/state.ts:323-332` |
| Pro: notes | implemented + gated (input disabled when locked, probe-verified) | `src/views.ts:104` |
| Pro: pulse history | **missing** — feature does not exist; cap is a label | §1.1 slice 5 |
| Pro: CSV export | implemented + gated | `src/exporters.ts:32-53`, `src/views.ts:326` |
| Pro: multi-file merge | ungated (multiple files import fine on free plan) | `src/views.ts:260` |
| Pro: `.ics` reminder | implemented + gated | `src/views.ts:327`, `src/ics.ts` |
| Day 41: "browse/search/deck/every export stay free" | **TRUE, verified live** (§5.2) | probe output |
| "Honesty notice shipped in Settings" | TRUE, verbatim at `src/views.ts:338` | §5.4 quotes it |

### 1.3 Things the UI does that SPEC never mentions (drift in the other direction)
- Demo library loader (`src/views.ts:286`) — honestly labelled synthetic (folders/dates "assigned by hash").
- Hash routing (good Pages decision, prevents 404s).
- Streak credits a mere app open (`deck-shown` and `open` events count, `src/stats.ts:87`), so "the streak is at stake" (SPEC.md:26) is softer than it sounds — you can keep a streak without triaging anything; a snooze-only day does NOT count (quirk).

---

## 2. FAKE WORK — feature-by-feature probe results

| Feature | Verdict | Evidence |
|---|---|---|
| Dedupe + bulk toss | **REAL** | `findDuplicateGroups` (bookmarks.ts:160-169) → UI "Toss N copies" (views.ts:300-304) → `bulkTossDuplicates` writes tossed status + events per link (state.ts:309-321). Not a stub. Nit: only exact canonical-URL groups act; `nearDuplicateTitleGroups` result is shown as a count only, with no action (views.ts:295) |
| Folder rename | **REAL** | input + button per folder (views.ts:216-234) → `renameFolder` mutates every link and persists via IDB (state.ts:323-332). O(n) sequential writes — fine at this scale |
| Notes | **REAL** | per-link input, persisted (state.ts:243-246), flows into JSON+CSV export, Pro-gated by disabling the input (verified `note input disabled: true` on expired plan) |
| CSV export | **REAL** | proper RFC-style quoting (`csvCell`, exporters.ts:27-30) with unit test for embedded quotes/commas (io.test.ts:167-172); gated button (views.ts:326) |
| .ics reminder | **REAL, spec-clean, client-untested** | CRLF line endings, 75-octet folding with continuation-space (ics.ts:1-14), escaped `,;\` in text, weekly RRULE rolling to next requested weekday, VALARM. Tests check all of it (io.test.ts:185-209). Caveat: DTSTART is floating local time (no TZID — defensible for a downloaded file); **never opened in a real calendar app** |
| JSON / HTML export round-trip | **REAL + unit-covered** | exporters.ts:14-25 + 60-89; io.test.ts:160-165 ("lossless") and :173-182 (HTML → parser → toLinks). One wart: HTML export emits a nonstandard attribute `LAST_visit="N"` (exporters.ts:83) that no browser defines — harmless but parroted from nowhere; will be ignored by importers |
| Streak | **REAL (lenient)** | recomputed from event log over local date keys (stats.ts:84-102), shown in header + pulse; unit-tested incl. gap-reset (logic.test.ts:214-225). Lenient by design: opening the app alone (deck-shown) preserves it |
| BM25 search | **REAL algorithm, naive wiring** | textbook BM25 (idf = ln(1+(N−df+.5)/(df+.5))), Intl.Segmenter with regex fallback (search.ts:6-16), title-vs-note ranking unit-tested. Perf claim unverified at scale; index rebuilt per keystroke in the view (views.ts:148-173) |
| Offline service worker | **REAL, e2e-proven** | my `npm run e2e` run: the offline test PASSED both projects (controller true, navigation transferSize 0). Cache-first navigate + stale-while-revalidate assets (public/sw.js:31-66); build-token cache rotation (scripts/make-sw.mjs:22-27) |
| 40-day trial gate | **REAL logic, SOVEREIGNLY bypassable (by design, partly disclosed)** | see §5 |
| 300-link free cap | **HALF-REAL** | Live on expired plan: paste 120 distinct URLs into a 211-link free library → `pasted urls: 89 added, … 31 over the free 300 link cap — not imported.` (exact cap math ✓). Then feed a hand-made Salvage JSON export with 60 fresh links → `salvage json: 60 added` → IDB count 360. The cap is a speed bump that the app's own export format walks under |
| Settings "Cards per day" | **FAKE CONTROL** | input + Save exists (views.ts:312,347-349) and prints `Saved: 2 cards/day, snooze 7 days (tomorrow's deck).` — but deck construction reads `state.entitlement.deckSize` (state.ts:123), never `settings.deckSize`. The saved value changes nothing for anyone (5 or 10 regardless). The confirmation message is false |
| verifyLicenceSignature / proClaim | **documented stub** | trial.ts:109-114 returns "not-shipped" — that part is honest in code comments; the dishonesty is SPEC.md:41 calling it "today:" |
| `search.ts highlight()` | dead code (never imported by views) |

Also: `src/state.ts:212-215` + `:174-179` produce the last-tossed-card ghost card (§1.1 slice 2). This is not a stub, it's a plain bug, and the committed e2e suite disagrees with the shipped behavior on it and on undo (below).

---

## 3. CLAIMS AUDIT (research corpus)

### 3.1 URL sample — 12 URLs from research/*.md, fetched by me just now
(`curl -sL -o /dev/null -w "%{http_code}" -A "Mozilla/5.0"`)

| # | URL | Code | Notes |
|---|---|---|---|
| 1 | github.com/karakeep-app/karakeep/issues/435 | 200 | |
| 2 | github.com/wallabag/wallabag/issues/2285 | 200 | |
| 3 | github.com/miniflux/v2/issues/797 | 200 | |
| 4 | news.ycombinator.com/item?id=32505314 | 200 | |
| 5 | news.ycombinator.com/item?id=44063662 | 200 | |
| 6 | news.ycombinator.com/item?id=31471127 | 200 | |
| 7 | stackoverflow.com/questions/927358/… | **403** | Cloudflare bot-wall on datacenter IP; the research used api.stackexchange.com, which I re-queried: title exact, **score 27,246 exact**, views 16,812,101 vs recorded 16,812,054 (+47 = natural drift) → PASS via documented endpoint |
| 8 | survey.stackoverflow.co/2026/ | 200 | |
| 9 | developer.mozilla.org …/Storage_quotas_and_eviction_criteria | 200 | |
| 10 | webkit.org/blog/14403/updates-to-storage-policy/ | 200 | |
| 11 | reddit.com/r/webdev/comments/1x1pewj/… | 200 | JS shell — content not curl-verifiable; the file itself marks every score UNVERIFIED (consistent) |
| 12 | reddit.com/r/LocalLLaMA/comments/1x3gpyi/… | 200 | same |

**Score: 12/12 resolvable (11 direct + 1 API-substituted), 0 dead, 0 fabricated.** Consistent with AUDIT.md's 40+7/47.

### 3.2 Numeric spot re-verification (live APIs vs RESEARCH.md / pocket-evidence.md)
- HN 44063662 = "Mozilla to shut down Pocket and Fakespot", **1222 pts** ✓ (Algolia).
- HN 32505314 = **271 pts** ✓; HN 31471127 = **190 pts** ✓.
- karakeep#435 reactions 11 / comments 4 ✓; miniflux#797 **62** ✓; linkwarden#587 **57** ✓; omnivore#4459 **141/45** ✓; wallabag#2285 1/3 ✓ — all bit-exact.
- Pocket "phase out" quote: **still live today** on getpocket.com/home (first grep failed only because of a U+2019 apostrophe) ✓.
- SO 2026: "30,903" present ✓; "79% … only after the fact" + "12,687" present ✓.

### 3.3 Problems found (blunt, small list)
1. **"asked in all 5 sampled open-source reader ecosystems" (RESEARCH.md:54-55, pocket-evidence.md:154, echoed in DECISIONS D4) is 4, not 5.** Section A (resurfacing) issues come from karakeep, wallabag, miniflux, omnivore only — **linkwarden contributes zero resurfacing issues** in the operator's own table. (Linkwarden is evidenced for export/dedupe instead.) SPEC.md:11 "across five reader ecosystems" repeats the inflation.
2. **"Distinct GitHub issues captured verbatim … 24" (pocket-evidence.md:78, RESEARCH.md:23) — the tables actually hold 27 rows** (10+5+3+3+3+3). Understated, so not self-aggrandizing, but it means nobody counted their own table.
3. **HN "762 comments" (RESEARCH.md:66) is 761 per Algolia today** — trivial drift or tree-count methodology; the "points" figures are exact, so nothing here looks recalled.
4. **Paraphrase drift:** RESEARCH.md:84 "75% … spend 5+ hours **searching for context they already had**" — the page says "75% spent five plus hours **searching for answers**" (Context Challenges section). Directionally supported, wording embellished.
5. No statistic-without-URL found in RESEARCH.md; reddit scores are unverifiable **and self-flagged as such** — the labelling discipline is unusually good.
6. Row counts claimed vs actual: hn 23 ✓, github 18 ✓, stackexchange 21 ✓, web 40 ✓, reddit 20 ✓ (my line-greps; reddit's file also has a 12-row method table — don't count those).
7. AUDIT.md internal arithmetic checks out: sample 9+9+7+9+13 = 47 ✓, blocked = the 7 reddit ones ✓.

**Verdict on the corpus: fetched, not recalled. The overstatements are at the summary layer
("all 5 ecosystems", "24"), exactly where readers look — same failure mode AUDIT.md itself
caught ("~120 per file") but the operator did not re-apply to the new documents.**

---

## 4. THE HABIT ARGUMENT — is "daily finite deck" real in code?

Mechanism trace:
- `dateKeyOf(now)` = **local calendar day** `YYYY-MM-DD` (resurfacer.ts:33-39; unit-tested across month boundary, logic.test.ts:97-100).
- Decks are persisted per-day (`db.ts:31` store `decks`, keyPath `date`).
- On boot, `ensureDeck()` (state.ts:110-147): today's record exists → reuse it (minus triaged cards); else `buildDeck` **seeded with `hash(dateKey|libraryId|candidateCount)`** (resurfacer.ts:150) — tomorrow's jitter draw differs from today's by construction, and determinism holds within a day.
- Rotation pressure is real: `recentDeckPenalty = −3 × recency(lastDeckAt over 30d)` (resurfacer.ts:121-123) plus `deckCount` decay on `unshown` (':114-119) push yesterday's faces down; toss/keep/queue remove cards from the candidate pool entirely (':147).
- Streak rewards daily return (open or triage), header + pulse display it (views.ts:43).

**So yes: a deep pile produces a materially different deck every day, plus an emptying-pile
progress bar and a streak. This is a genuine daily loop, not a midnight-locked gimmick.**
Honest caveats:
1. **The loop needs a reload.** Nothing re-seeds when the clock passes midnight in an open tab (§1.1 slice 2, no setInterval/visibilitychange anywhere). The PWA-install flow the app recommends is exactly the usage pattern where the deck sits frozen on "Deck cleared"/the ghost last-card all morning.
2. Small piles (< deckSize) replay the same cards daily until triaged — fine, arguably correct.
3. Streak can be kept by opening the app and doing nothing (`deck-shown` counts, stats.ts:87) — the "streak is at stake" drug is weaker than advertised.

---

## 5. HONESTY OF THE TRIAL

### 5.1 What day 41 is in code
`getEntitlement(settings, now)` (trial.ts:60-102): clock starts at **first import** (`ensureTrialStarted` in `ingest`, state.ts:262-266; before that Pro is granted unlimited — reason string: *"Trial has not started yet — it starts the moment you import your first link."*). At `now ≥ start + 40×86400000`:
plan=`pro-expired` → every `emit()` (i.e. every interaction) recomputes it →
- `has()` returns false for all 8 Pro caps → buttons **disabled** (CSV, .ics, notes, rename, dupes) — probe-verified: `Export CSV disabled: true`, `weekly reminder disabled: true`, `note input disabled: true`;
- `linkLimit=300` applied in `ingest()` only → new HTML/URL imports partially refused — probe-verified (`31 over the free 300 link cap — not imported`);
- `deckSize=5` for **tomorrow's** deck; today's stored 10-card deck plays out untouched — probe-verified `deck after expiry: 1 of 10`;
- library, search, deck, JSON/HTML export keep working; nothing is hidden, locked-away or deleted.

### 5.2 What a user can do to keep Pro for free
1. **Clear site data / new browser / new profile** — the trial clock is an IDB timestamp (D6); fully resets. **Disclosed in UI** (§5.4).
2. **Edit IndexedDB via DevTools**: set `meta/settings.value.firstRunAt = now` or `trialLengthDays = 9999`. Nothing is validated; `proClaim` is dead. Not disclosed (arguably fine — it's the same threat class as #1).
3. **The app's own JSON export→import path**: export everything on day 40 (free), re-import on day 41 — `importSnapshot` has **no cap check** (state.ts:284-307). Probe: free-plan library grew 300 → **360** through the JSON path. Not disclosed; and it makes the ≤300 free row (SPEC.md:36) unenforceable for anyone who had a trial. This is also, charitably, the implementation of "never hold a library hostage" — but nobody told the SPEC.
4. Never import at all → Pro entitlement forever (empty library ⇒ moot).

### 5.3 Is the UI text accurate? Verbatim quotes
- `src/views.ts:338`: *"This is a soft trial: the site is static, so clearing site data resets it. We could fingerprint you to stop that and we would rather not."* — **accurate and unusually honest.**
- `src/trial.ts:100` (shown in Settings + as chip *"Trial ended · free plan"*): *"Trial ended. Browse, search, deck and every export stay free; Pro tools are locked. **Links beyond the first 300 are kept on disk and released again if you subscribe.**"* — first sentence verified true. Second sentence is **inaccurate in both directions**: overstates the lock (links beyond 300 were never hidden — browse/search/deck see the whole library, which the app itself promises at views.ts:341 *"browsing your whole library"* is always free) and understates the escape (JSON re-import adds unlimited links at any plan, and nothing is "kept on disk" specially — it was never locked).
- Chip during trial (views.ts:29): *"Trial day X of 40 · Y left"* — matches entitlement arithmetic (logic.test.ts:139-146).
- views.ts:341: *"Always free: the daily deck, search, import, JSON and bookmarks.html export, browsing your whole library."* — true as executed; **contradicts SPEC.md:36 ("≤ 300 links" free)** and contradicts the very next paragraph's "released if you subscribe" framing.

**Net: the trial is honest about being soft, honest about what unlocks, and sloppy about what the cap actually means. The billing seam exists exactly once (getEntitlement) as promised.**

---

## 6. UNVERIFIED ITEMS — and whether the repo says so

**BLOCKERS.md does not exist. LOG.md does not exist.** STATE.md:8 lists both among "Memory
files", and STATE.md:25 sends the next reader to "LOG.md for the exact curl" — a pointer into
a void. So formally: *nothing* is tracked as a blocker today; the answer to "does BLOCKERS.md
already list each one" is **no, it lists none, because it was never written**. Coverage
elsewhere:

| Item | Covered anywhere? | Where / gap |
|---|---|---|
| Real-user retention = inference | YES | STATE.md:40, RESEARCH.md:90 |
| iOS Safari 7-day eviction behaviour on *.github.io | YES (as unverified) | FEASIBILITY.md §1.4, §UNVERIFIED 1/8/10 |
| Chrome/FF/Safari bookmark-export dialects beyond Chrome's verified exporter source | YES | FEASIBILITY.md:180-182 ("Firefox dialect: UNVERIFIED at source level") |
| Lighthouse on a **populated** library | **NO** | shots/lh.json is empty-library `#/import`; SPEC.md:73's own ≥500-link criterion unmet (demo library = 211 links, my count of sample-bookmarks.html; no 14-deck-cycle test anywhere) |
| BM25 at 5–10k links (index rebuild per keystroke) | **NO** | FEASIBILITY.md:269 promised worker+incremental; shipped naive; nobody flagged the delta |
| .ics in real calendar clients (Apple/Google/Outlook) | **NO** | io.test.ts tests self-emitted syntax only |
| persist() grant behaviour on github.io origins | YES (unverified) | FEASIBILITY UNVERIFIED 2 |
| Live Pages deploy verification "in Chromium" (SPEC.md:73) | **NOT DONE, but repo is honest about pending** | `git remote -v` → empty; no repo rename (D2 pending); STATE.md next-actions 7-8 unexecuted. Final-REPORT.md absent |
| e2e suite green at HEAD | **NO — and the repo implicitly claims green** | my `npm run e2e`: **4 failed, 10 passed** (both "end to end" and "keyboard-only triage" tests, desktop+mobile). `test-results/.last-run.json` said `passed` before I ran it — stale artifact (dir is gitignored). Commit message d952dd6 claims "51 unit / 12 browser tests": unit 51 ✓ (I ran: 51 passed); browser tests are **14** at HEAD (7×2 projects), 4 failing, and even the count "12" cannot describe the committed suite |
| Playwright/Chromium works here | YES (resolved, was in STATE risks) | my run executed both projects |

Missing-blocker list to write into a real BLOCKERS.md: populated-Lighthouse, populated-search-perf,
.ics-client interop, JSON-import cap bypass, undo/last-card e2e failures, live deploy,
deckSize dead control, phantom Pro caps.

---

## 7. DEPLOY-READINESS — Pages base path forensics

Chain of evidence:
- `vite.config.ts:4` → `base: "./"` ⇒ built `dist/index.html` references `./assets/index-*.js|css` (confirmed in dist output). Relative → any subpath OK.
- `index.html:10-12`: manifest/icon hrefs are `./…` (relative).
- `main.ts:77`: SW registered at `new URL("sw.js", document.baseURI)` ⇒ `https://vansh1190.github.io/salvage-links/sw.js`; same-directory scope covers `/salvage-links/` incl. the bare `/salvage-links/` navigation. No `Service-Worker-Allowed` needed.
- `manifest.webmanifest:5-6`: `start_url:"./"`, `scope:"./"` — resolved against the manifest URL ⇒ `/salvage-links/`. Shortcuts `./#/deck` fine.
- `scripts/make-sw.mjs` rewrites the PRECACHE list to real hashed asset names + build-token cache name, all relative.
- Routing is **hash-based** (`#/library` etc., main.ts:9-12) ⇒ no deep-link 404s on Pages, no SPA fallback needed.
- e2e already runs against `http://127.0.0.1:4173/salvage-links/` (playwright.config.ts:15,26) served by serve-subpath.mjs — the base path pattern is genuinely rehearsed locally, which most projects skip.

**Prediction for `https://vansh1190.github.io/salvage-links/`: the base path itself will work.**
Residual, in severity order:
1. **The URL does not exist yet.** No git remote, repo not renamed (D2), Pages not enabled, and LOG.md (which STATE.md says holds the deploy recipe) is missing. Every "verified in Chromium on the live URL" promise in SPEC.md:73 is still pending.
2. **No `.nojekyll` in `dist/`.** Benign today (no leading-underscore files; and an Actions-based Pages build skips Jekyll entirely), but if Pages is enabled in "deploy from branch (legacy)" mode the file set is safe only by luck; one `src/_partials/`-style asset in the future silently 404s. One `touch` fixes it.
3. **Update latency, by design**: navigation requests are pure cache-first (`sw.js:37-52` — the `hit || refresh` short-circuit means a cached shell is never revalidated), and Pages' undocumented ~600 s html TTL plus the browser's ~24 h sw-update check bound how fast a deploy reaches users; `make-sw`'s cache-name rotation then heals it. FEASIBILITY.md:295 states this honestly; just don't promise "instant updates" in copy.
4. **serve-subpath ≠ Pages headers**: the local server sends `no-cache` html; Pages is more aggressive — see #3; nothing else observed to differ (MIME types for .webmanifest/.svg/.js all match).
5. Cosmetic: no `og:image` (link previews will be bare).

How to verify (cheap, ordered): `curl -sI` the live `/salvage-links/`, `./assets/*`, `sw.js`, `manifest.webmanifest` (expect 200 + correct content-types); run the repo's own suite against it (`npx playwright test` with `baseURL` pointed at the live URL, or clone and edit playwright.config temporarily in /tmp); in Chromium DevTools check Application→Service Workers scope = `/salvage-links/`, manifest parsed from that scope, offline hard-reload; compare a fresh-import session's IndexedDB dump against the local build (SPEC.md:73's own acceptance step).

---

## 8. Summary of misstatements found (research + product, one line each)

1. Commit d952dd6 "…+ 51 unit / 12 browser tests": 51 unit ✓, but suite is 14 tests and **4 fail at HEAD** (my run).
2. "all 5 sampled reader ecosystems" begging for resurfacing → own evidence table shows **4** (linkwarden zero).
3. "24 GitHub issues captured verbatim" → tables contain **27** rows.
4. SPEC "≤ 300 links" free → **enforced on new HTML/URL imports only; JSON re-import adds unlimited links (360 proven); browse never restricted**.
5. SPEC Pro row "pulse history" → **feature absent; cap enforced nowhere** (Settings still lists it as a Pro perk).
6. SPEC Pro row "multi-file merge" → free-for-all (no gate exists).
7. SPEC Pro row "snooze scheduling" → snooze is free and ungated.
8. SPEC "today: … optional signed licence file" → **stub that always fails**; `proClaim` dead code.
9. Settings "Cards per day" → **dead control** with a false success message ("…(tomorrow's deck)").
10. Trial-locked copy "Links beyond the first 300 … released again if you subscribe" → contradicts the app's actual "browsing your whole library is always free" line.
11. STATE.md:8/25 references BLOCKERS.md, LOG.md → **neither file exists** (and STATE.md's e2e risk is resolved, its counts otherwise accurate).
12. HN "762 comments" → 761 today; SO views drift +47 (natural); "75% … context they already had" → page says "searching for answers" — minor paraphrase drift.
13. Lighthouse 100s → measured on an **empty** library at `#/import`; SPEC's own ≥500-link / 14-cycle / 360px acceptance criteria unmet (demo = 211 links, mobile shots at 390px).

What held up under attack: all 51 unit tests; 10 of 14 e2e incl. real offline SW reload;
every re-fetched URL; every re-fetched number (points/reactions/views to the digit);
the soft-trial honesty notice; the "nothing leaves the browser" claim (zero external fetches
or resources in src/ + styles.css; only same-origin fetch is the demo loader);
BM25/CSV/ICS/export round-trip quality; the base-path discipline (e2e rehearses the exact
Pages URL shape locally); daily-deck determinism and rotation mechanics.

---

## 9. Verdict

**Honest core, dishonest edge, premature green.** This is not vaporware and not a research
fraud: the loop, the data layer, the limits page, the offline story and the evidence corpus
are real and verifiable. But the repo currently ships (a) a **red test suite under a green
label**, (b) a settings control that lies, (c) a Pro tier whose feature list includes
phantoms, and (d) a paid cap that its own free export format bypasses — and it has deleted
its own accountability scaffolding (BLOCKERS.md/LOG.md cited but absent). Deploy as-is would
put a UI in front of users that overstates what was verified. Fix the 13 items in §8
(most are an hour's work or a copy edit), write the missing BLOCKERS.md, and the remaining
story — soft trial, disclosed limits, local-first — is more honest than most commercial
software ships. Then deploy and re-verify against the live URL before claiming SPEC.md:73.
