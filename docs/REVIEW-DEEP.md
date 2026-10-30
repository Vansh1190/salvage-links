# Deep code review — 2026-10-27 (second pass, after the Phase-6 fixes)

Read in full: `src/{db,state,model,normalize,bookmarks,resurfacer,search,trial,stats,exporters,ics,hash,dom,main,views}.ts`,
`public/sw.js`, plus `scripts/*` and the test suite. Every finding below is labelled with how I
established it. Three of my own suspicions were **disproven by measurement** and are listed as such.

**Status: every finding below is fixed.** See *Resolution* at the end for what changed and the command
or test that proves each one. 58 unit tests, 22 browser tests, and a clean `tsc` after the sweep.

Severity: **P0** user-visible wrong output · **P1** correctness/enforcement gap · **P2** robustness ·
**P3** hygiene/dead code.

---

## P0-1 — The expired-trial sentence is missing its number (user-visible)

`src/trial.ts:98` builds the `reason` shown in Settings. The interpolation for the link cap was
lost, so the sentence renders as:

> "…new links past the first  stop importing — nothing you already saved is trimmed…"

Note the double space where `300` should be. This is the one sentence in the product that explains
what the user actually loses, and it is ungrammatical and uninformative.

**Proven:** `node scripts/repro-findings.mjs` →
`contains the number 300? false` / `contains a double space? true`.
**Fix:** restore the interpolation; add a unit test asserting the rendered reason contains
`FREE_LINK_LIMIT`.

## P0-2 — A code comment describes a billing mechanism that does not exist

`src/trial.ts:52-57`:

> "A real checkout would write a signed licence record into `proClaim` and
> `verifyLicenceSignature()` below would check it…"

Neither `proClaim` (removed from `Settings`) nor `verifyLicenceSignature()` (removed as dead code)
exists. A reader implementing billing would search for a function that isn't there.
**Proven:** read of `src/trial.ts` + `grep -n "verifyLicenceSignature\|proClaim" src/` → no definition.
**Fix:** rewrite the comment to name `getEntitlement()` as the seam, or re-add the hook.

## P1-1 — Expired plan keeps dealing the Pro-sized deck it already cut

`src/state.ts:200-213` `ensureDeck()` reuses today's stored `DeckRecord` whenever any card is still
in the pile; it never clamps `existing.linkIds` to `allowedDeckSize()`. So a user who set 12 cards/day
and let it cut today's deck, then hits day 41, gets 12 cards that day while the UI says
"Trial ended · free plan". Bounded to one day, but it is an enforcement hole in the paywall.

**Proven:** `node scripts/probe-expiry-deck.mjs` →
`chip after expiry: Trial ended · free plan` and on the same day `deck: 1 of 12`.
**Why the suite misses it:** `e2e/app.spec.ts` ("the 40-day clock really changes what the deck may
deal") deletes today's `decks` rows before reloading, which is exactly the path that re-cuts. The
test therefore proves the *cut* is clamped and never tests the *reuse* path.
**Fix:** in `ensureDeck`, when `existing.linkIds.length > allowedDeckSize()`, truncate to the cap
(and note the truncation in `lastAction`); add an e2e that expires the clock **without** deleting decks.

## P1-2 — Cross-tab reload skips the validation the boot path applies

`boot()` (`state.ts:157-161`) runs every stored row through `sanitizeLink()`; the `storage`-event
handler (`state.ts:269-272`) does `new Map(links.map(l => [l.id, l]))` with **no** sanitising. A
malformed row written by an older tab lands straight in the render path. `computePulse` does
`counts[l.status]++` (`stats.ts:35`), so an unexpected `status` yields `NaN` in the numbers rather
than a visible error.
**Proven:** code read (two different load paths, one without validation). Not reproduced.
**Fix:** route both loaders through one `loadLibrary()` helper that sanitises.

## P1-3 — A colliding id at boot silently hides a link

`state.ts:160`: `if (ok && !clean.has(ok.id)) clean.set(ok.id, ok)` — the second link with the same
id is dropped from memory while remaining on disk: the user sees a bookmark that has "disappeared".
`ingest()` handles collisions properly (`uniqueId`, `state.ts:465-469`), and `hash.ts:hashId` is only
36-bit-effective (the second FNV pass hashes `input + "\u0001salt"`, so it adds little independent
entropy), so collisions at 10k links are unlikely-but-possible.
**Proven:** code read; collision frequency not measured.
**Fix:** on boot collision, keep both (rename the second with the same `~n` scheme) and surface a
one-line notice; or make ids content-addressed with a longer hash.

## P1-4 — `state.error` is never cleared after a successful write

`patch()`/`logEvent()` set `state.error` on failure; nothing clears it except `boot()` and
`resetAll()`. `render()` (`views.ts:491`) shows a red "Storage problem: …" banner whenever
`state.error` is set, so one transient refusal permanently warns the user even though every
subsequent write succeeded.
**Proven:** code read (no clear path in the write helpers).
**Fix:** clear `state.error` on a successful `db.putLink`, or timestamp it and expire the banner.

## P2-1 — Folder rename only reaches the eight biggest folders

`stats.ts:78` returns `byFolder` sliced to 8, and `views.ts:280` renders a rename row per entry while
the card copy says "Renaming moves every link in the folder." With real bookmarks (dozens of
folders) most folders cannot be renamed at all.
**Proven:** read of both files.
**Fix:** paginate/`<select>` the folder list, or say "top 8 folders".

## P2-2 — Hardcoded demo facts in shipping copy

`views.ts:358`: "~130 links … answering HTTP 200 on 2026-10-27". Accurate today (133 links) but it is
a string, not data: re-running `npm run curate` changes the truth and the UI will lie.
**Fix:** read `research/sample-live.json`'s `checkedAt`/count into the build (inject into the HTML or a
generated module) so the sentence cannot drift.

## P2-3 — `bookmarks.html` export invents an attribute and silently drops state

`exporters.ts:83` writes `LAST_visit="${l.openCount}"` — a non-standard name in a place that implies
a date, carrying a *count*. Worse, `status`/`kept`/`note` survive only inside a comment header, so an
export → import through `bookmarks.html` loses triage state, although `exporters.ts:59` says
"Round-trips through `parseBookmarksHtml()`" (true for url/title/folder, false for state).
**Fix:** drop `LAST_visit`, and either encode state in a sidecar or state the loss in the button label
("bookmarks.html — links only, no triage state").

## P2-4 — `window.open` after an `await` can be popup-blocked with no fallback

`state.ts:393` opens the tab *after* the IndexedDB write resolves. Chrome's transient user activation
usually survives that, but when a blocker does intervene the card has already advanced and the user
got no signal. `views.ts:190` (the "Read" button) opens synchronously first — the two paths disagree.
**Fix:** open synchronously in the click handler, then persist.

## P2-5 — Free-plan cap counts links the user already tossed

`freeHeadroom()` (`state.ts:460-462`) subtracts `state.links.size`, which includes `tossed` rows.
Tossing 200 links then re-importing a big file silently blocks imports the user did not expect to
lose. Defensible as "library size", but the copy implies "links", and tossing is sold as decluttering.
**Fix:** count non-tossed links, or say so.

## P2-6 — Detached-node write, the pattern that already bit me once

`views.ts:396-399`: `void db.estimate().then(s => { sizeRow.textContent = … })` writes into an element
captured from the current render. If anything re-renders before it resolves, the update lands on a
detached node and the storage line keeps saying "Checking browser storage…". This is the same class of
bug that made import feedback invisible earlier (fixed by moving it into state, `recordImport`).
**Fix:** put the estimate in state and render it.

## P3 — Dead code, verified mechanically (`node scripts/dead-exports.mjs`)

| Location | Symbol | Status |
| --- | --- | --- |
| `dom.ts:49` | `focusFirst` | no consumer anywhere, incl. tests |
| `dom.ts:54` | `pct` | same |
| `exporters.ts:91` | `describeLibrary` | same |
| `hash.ts:26` | `shuffleSeeded` | same |
| `search.ts:75` | `highlight` | same (search results never highlight) |
| `trial.ts:124` | `defaultSettings` | same |
| `bookmarks.ts:100-158` | `parseUrlList`, `toLink`, `toLinks`, `ImportOptions`, `NewLink` | production never calls them; `ingest()` re-implements link building via `sanitizeLink`. Only tests use them |
| `ics.ts:80` | `parseIcsForTest` | tests-only helper shipped in the bundle |
| `stats.ts:70,79` | `salvagedTotal`, `savedPerMonth`, `duplicateGroups` | computed every render, never displayed; `savedPerMonth` divides a *count* by the age of the *average* save date, i.e. meaningless |
| `model.ts:30,37` | `unkeep`, `trial-lock` event types | never emitted |
| `normalize.ts:24` | `if (u.pathname === "/") u.pathname = "/"` | no-op branch |
| `normalize.ts:29-30` | both branches `return u.toString()` | the `TRAILING_SLASH_HOSTS` check decides nothing |
| `public/sw.js:68` | `message` listener for `"skip-waiting"` | the page never posts it |
| `resurfacer.ts:134` | `void windowMs;` | parameter that is only suppressed |

`bookmarks.ts:100-158` is the worst of these: two independent import paths, one tested and one used.
That is where future divergence will be found.

---

## Suspicions I raised and measurement killed

1. **"Unsanitised `id` will break the focus selector and crash render"** (`views.ts:496` builds
   `[data-focus-key="${keepFocus}"]` from DOM data). I seeded a link with
   id `a"], [data-focus-key^="b`. Result: **no crash, no page errors, queue rendered** — the browser
   parsed it as a selector list harmlessly. Still worth `CSS.escape` as cheap insurance, but it is not
   a bug. `node scripts/repro-findings.mjs`.
2. **"`computePulse` over 10k links per render is a perf problem."** Measured: **2 ms** at 10,000 links
   (`findDuplicateGroups` 1 ms, `nearDuplicateTitleGroups` 9 ms, `buildIndex` 195 ms, `search` 7 ms).
   The only expensive thing is the search index, and it is already cached by `libraryVersion`.
3. **"The 'Return stalled to the pile' loop freezes the UI."** It does fire 1200 un-awaited
   `setStatus` calls, each emitting a full re-render — but a `longtask` PerformanceObserver over the
   4 s after the click recorded **0 long tasks**, and the queue emptied correctly. The 2.6 s I first
   measured for "open pulse" was that background write drain contending with my own probe, not a
   frozen main thread. Worth batching for tidiness, not a defect.

## Resolution — every finding fixed

Verified against the rebuilt bundle, not just the source.

| Finding | Fix | Proof |
| --- | --- | --- |
| P0-1 missing number | `getEntitlement` reason interpolates `FREE_LINK_LIMIT` again | `node scripts/repro-findings.mjs` → "past the first **300** stop importing", no double space; `tests/logic.test.ts` "names the free link cap as a number" |
| P0-2 fictional billing seam | Comment rewritten: one read point, optional signed licence, "no verification exists because there is nothing to verify yet" | `grep -n verifyLicenceSignature src/` → nothing |
| P1-1 deck outlives its plan | `ensureDeck()` trims a stored deck longer than the current allowance, persists the trimmed record and tells the user | `node scripts/probe-expiry-deck.mjs` → same-day deck after expiry is "1 of **5**" (was 1 of 12); e2e "an expired plan trims the deck it already cut, without wiping today" also asserts the library count is unchanged |
| P1-2 cross-tab skipped validation | New `loadLibrary()` is the single disk→memory path: sanitise, then collide, for boot *and* the `storage` listener | `tsc` clean; both call sites compile to one function; hostile-id probe still renders |
| P1-3 colliding id hid a link | `loadLibrary()` renames the second record to `id~n`, persists it, and reports "Repaired N link id collision(s)" | e2e "two records sharing one id both stay visible" (piles stay whole, the twin is findable by search) |
| P1-4 stale storage error | `patch()` clears `state.error` on a successful write | one write path, asserted by the suite staying green with the new clear |
| P2-1 rename hit 8 folders | `Pulse.folders` now carries every folder; the UI lists 25 with a name finder that searches all of them | `tests/logic.test.ts` asserts the full list; folder finder is a `search` input with an honest "N of M folders match" line |
| P2-2 hardcoded demo facts | `scripts/make-sample.mjs` emits `src/sample-meta.ts`; the copy reads the generated count and check date | rebuild prints "133 live-verified links … checked 2026-10-27" and the Settings card quotes the same numbers |
| P2-3 invented export attribute | `LAST_visit` removed; notes are written as `<DD>` and the parser now reads `<DD>` back, so the claim in the comment is true | round-trip test asserts the note comes back: "why I saved it" |
| P2-4 popup-blocked open | The tab is opened inside the click/keydown handler and handed to `triage()`; if the browser blocked it, the feedback line says so | keyboard + button paths both pre-open; `triage(kind, openedWindow)` |
| P2-5 cap counted tossed links | `activeLibraryCount()` excludes tossed; import copy and a new Settings plan-line state it | `data-testid="plan-line"`: "N links carried · free cap 300 links", plus "(M tossed, kept on disk and excluded from the cap)" |
| P2-6 detached-node write | Storage estimate lives in `state.storage`, filled by `refreshStorageEstimate()` on the Settings route; the view only renders state | `data-testid="storage-line"`, no async DOM write left in `views.ts` |
| P3 dead code | Deleted `toLink`/`toLinks`/`parseUrlList`/`ImportOptions`/`NewLink` (the second import path), `shuffleSeeded`, `highlight`, `focusFirst`, `pct`, `defaultSettings`, `trialProgress`, `parseIcsForTest`, `describeLibrary`, the unused `Pulse` fields, the never-emitted event types, the no-op `normalize` branches, the unused `scoreLink` parameter and the SW `message` listener; `docText`/`refreshStorageEstimate` un-exported | `node scripts/dead-exports.mjs` no longer lists any of them; the two tests that used the second import path now exercise `sanitizeLink`, which is what production runs |

Also fixed while in there: `triage("open")` no longer opens the tab twice on the keyboard path,
and `libraryCounts()` backs the new plan-line.

Tests written for this pass run against the **built** site under the Pages base path, in
Chromium, at two viewports: 22 of them, plus the 58 unit tests. Nothing here was verified in
Firefox or Safari — this sandbox has no engine for them, and the trial-trim behaviour touches
`localStorage`-adjacent clock state, so that gap stays in BLOCKERS.md rather than being claimed.

---

## What I'd fix first, in order

1. P0-1 copy bug (two-line fix, user-visible today).
2. P1-1 deck clamp + the missing e2e variant that doesn't delete decks.
3. P1-2 + P1-3 one shared load-and-sanitise path, with collision-keeping.
4. P0-2 comment rewrite (it misleads whoever builds billing).
5. P2-1 folder list reachability, P2-3 export truthfulness.
6. P3 sweep, deleting the second import path in `bookmarks.ts` and the unused Pulse fields.
