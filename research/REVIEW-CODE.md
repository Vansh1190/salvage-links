# REVIEW-CODE.md — hostile read-only review of `src/`, `public/sw.js`, `scripts/`, `tests/`, `e2e/`

Reviewer stance: adversarial. No files were modified.
Method: full read of every file named in the brief, plus targeted runtime probes.

## How each claim is marked
- **[code]** — established by reading the source (file:line reasoning, no execution).
- **[run]** — executed and reproduced in this sandbox (commands/evidence summarised in §7).
- **[ship-red]** — reproduced by the repository's *own* committed Playwright test; evidence is the
  leftover `test-results/*/error-context.md` produced by the last `npm run e2e` (2026-10-27 20:20).
- **[unverified]** — plausible from code, could not be executed here.

Baseline state of the tree: `tsc --noEmit` clean **[run]**, `vitest run` 51/51 pass **[run]**,
`npm run e2e` **at least 2 tests failing** **[ship-red]** — therefore `npm run check` cannot pass and
the "success measures" in SPEC.md §"Success measures" are not currently met.

---

# 1. BLOCKERS

### BL-1 — `undo()` does not restore what it says it restored; shipped e2e test is red
`src/state.ts:217-225` (undo), `src/state.ts:187-210` (triage), `src/state.ts:154-168` (patch),
`src/views.ts:97` + `src/main.ts:58-60` (Undo button / `u`).

Three separate lies in one control:
1. **Position never rewinds.** `triage()` calls `advance()` (`state.ts:212-215`) which increments
   `deckIndex`; `undo()` decrements nothing. The card you just triaged stays off-screen while the
   app announces `Undid: tossed`. [ship-red] `app.spec.ts:107` expects `1 of N` after `x` then `u`;
   the recorded failure is literally `Received: "2 of 10"`.
2. **Only the fields in the last patch are snapshotted.** `triage("open")` records undo for
   `{openCount,lastOpenedAt}` only, then calls `patch(id,{status:"queued"})` **without** `recordUndo`
   (`state.ts:193-195`). Undo "opens" a card and it is still `queued`: it has left the deck forever,
   and `progressRow`/Pulse keep counting it.
3. **The event is never reversed.** `logEvent` for the original action stays in the log, so
   "Salvaged all time", "Salvaged this week" and the streak keep the action the user just cancelled
   (`state.ts:221` even adds a *second* event).

*User notices:* presses `x`, then `u`, hears "Undid: tossed", sees a different card; the tossed link
is nowhere to be found; tomorrow's Pulse still credits the toss.
*Minimal fix:* in `undo()`, also `if (entry.labelWasTriage) state.deckIndex = Math.max(0, state.deckIndex - 1)`;
better, store `deckIndex` in the undo entry at triage time and restore it. In `triage("open")` pass
`recordUndo` on the **status** patch too (or merge both patches into one `patch()` call so one
snapshot covers all three fields). Push a compensating `undo`-event *and* subtract the stats by
tagging the original events with `undone:true` (a `detail` flag is enough; `computePulse` can skip them).

### BL-2 — "Today's deck" is silently re-cut on every reload, and snoozed cards come back
`src/state.ts:110-122`.

The existing-deck branch re-filters the stored deck to `status === "pile"` and resets
`state.deckIndex = 0`. Consequences, all reproducible:
- The deck the user is working through **shrinks and renumbers** when they reload (cards already
  triaged vanish, so "6 of 10" becomes "1 of 6").
- The filter is **not** the same filter used to build candidates: `candidates` (state.ts:113) and
  `buildDeck` (`resurfacer.ts:147`) exclude links with `snoozedUntil > now`, but `live` does not —
  so a card you snoozed today is put straight back into today's deck by the next reload/import.
- `state.deck` is rewritten in memory while the DB row keeps the old `linkIds` → the two disagree,
  and the deterministic-deck claim in `resurfacer.ts:138-141` ("That is what makes 'today's deck'
  honest") is false in the only path that runs daily.

[ship-red] `app.spec.ts:69` expects `6 of 10` after reload, recorded `Received: "1 of 6"`
(= 5 unseen cards + 1 snoozed card).
*User notices:* "I'm halfway through 10 cards, refresh, now I'm on card 1 of 6 and the thing I
snoozed is in my face again."
*Minimal fix:* in the existing branch keep `existing.linkIds` as-is (do not re-filter), only drop ids
that no longer exist in `state.links`, and re-apply the same snooze predicate used for candidates:
`live = existing.linkIds.filter(id => { const l = state.links.get(id); return l && l.status === "pile" && !(l.snoozedUntil !== null && l.snoozedUntil > state.now); })`. Persist position separately if you want it to survive.

### BL-3 — The deck is built with a stale entitlement: expired free users get a 10-card Pro deck every day
`src/state.ts:49` (`entitlement` initialised from `DEFAULT_SETTINGS` at module load),
`src/state.ts:85-98` (`boot()` loads settings but never recomputes the entitlement),
`src/state.ts:123` (`ensureDeck` reads `state.entitlement.deckSize`), `src/state.ts:80` (only `emit()` refreshes it).

`boot()` order is `getSettings → allLinks → allEvents → refreshStreak → ensureDeck → … → emit()`.
Everything before that final `emit()` therefore runs against
`getEntitlement(DEFAULT_SETTINGS, Date.now())`, i.e. `firstRunAt:null` → `proActive:true,
deckSize:PRO_DECK_SIZE(10), linkLimit:null`. `ensureDeck()` **persists** the 10-card deck and
bumps `deckCount`/`lastDeckAt` on 10 links.
[run] With `meta/settings.firstRunAt = now − 60d`, the UI correctly shows
`Trial ended · free plan` while the deck that gets built and saved is `1 of 10` (entitlement says 5).
Same mechanism makes the first import after boot see `linkLimit === null`.
*User notices:* the paywall is decorative — free users get the Pro deck every single morning; and
"5/day" in SPEC.md:36 is not what ships.
*Minimal fix:* one line in `boot()` immediately after the settings load:
`state.entitlement = getEntitlement(state.settings, state.now);` (before `refreshStreak`/`ensureDeck`).

### BL-4 — Restoring an old/incomplete Salvage JSON permanently bricks the app (no recovery path)
`src/exporters.ts:19-25` (`fromJson` blind-casts `parsed.links as SalvageLink[]`),
`src/state.ts:284-307` (`importSnapshot` validates nothing, `bulkPutLinks` persists it),
then `src/search.ts:27` (`l.tags.join`) / `src/views.ts:104-117` (`l.note`, `l.status`).

A restored record missing `tags` (or `note`, `status`, `openCount`, `importedAt`) makes
`render()` throw. Because `render` is the subscriber for *every* state change
(`src/main.ts:95`) the whole UI stops updating — not just the library. And the bad row is in
IndexedDB, so **every subsequent boot re-bricks it**. There is no error boundary in `render`
(`views.ts:384-414`) and no way to reach Settings → Delete.
[run] Importing a 2-link "salvage json" where the links lack `tags`/`status`:
`pageerror: Cannot read properties of undefined (reading 'join')`, after which
`getByLabel('Search library')` never appears again and the route does not render.
*User notices:* they restore a backup (the app's own stated survival strategy: "export monthly")
and the app dies permanently.
*Minimal fix:* a `sanitizeLink(raw): SalvageLink | null` in `exporters.ts` (type-check the 8 required
fields, default the rest, re-derive `id = hashId(dedupeKey)`), drop non-conforming rows into the
`invalid` counter; plus a `try/catch` around the view body in `render()` that falls back to the error card.

### BL-5 — "Delete all local data" reports success, deletes nothing in the session, and wedges storage so later edits are silently lost
`src/db.ts:105-113` (`wipeEverything` nulls `dbPromise` but never `close()`s the live connection, and
`req.onblocked = () => resolve()`), `src/state.ts:339-348` (`resetAll` has no `try/catch`, does not
reset `lastImport`/`lastImportError`/`error`), `src/views.ts:357` (`void resetAll().then(...)`).

`deleteDatabase` is queued behind the app's own open connection → `onblocked` fires → we *resolve*
"deleted". The in-memory state is cleared and the user is told `Library deleted`, while all rows are
still on disk. Because `dbPromise` was nulled, the next operation calls `openDb()` again, which now
queues behind the pending delete → **hangs forever** (no timeout anywhere). Every later `putLink` is
an unsettled promise behind `void`-called handlers → silent loss of the whole rest of the session.
[run] After demo import (211 links) → click Delete → accept: `indexedDB.databases()` still lists
`salvage@1`, an open attempt times out with no response ("OPEN HUNG"), and the Import view still
displays the stale `211 added` status. The rows only disappear on the *next* page load.
*User notices:* they delete, then re-import or triage; the app looks fine, nothing is saved;
or they delete on an iPhone, reopen, and everything is back.
*Minimal fix:* in `wipeEverything`, keep the handle and close it first:
`const db = await openDb(); db.close(); dbPromise = null;` and make `onblocked` **reject**
(`new Error("Another tab is holding this library open — close it and try again")`) instead of
resolving; add `.catch(e => state.error = …)` in `resetAll` and clear `lastImport`.

### BL-6 — Import silently destroys links: URL canonicalisation collapses genuinely different pages
`src/normalize.ts:15` (`u.hash = ""`), `src/normalize.ts:21`
(`/^(utm_|mc_|fbclid|gclid|ref|ref_src|igshid|spm|si$|t$)/`), consumed by
`src/bookmarks.ts:117-124` (`id = hashId(dedupeKey)`) and `src/bookmarks.ts:150-153` (drop + count as "skipped").

The fragment is erased for everyone, so all of these become **one** link and the second copy is
thrown away and unrecoverable (it is never written to IndexedDB, so no undo, no "trash"):
[run] verified against the shipped `canonicalUrl`/`dedupeKey`:
```
COLLAPSE https://github.com/<org>/<repo>/blob/main/x.ts#L40  ==  ...x.ts#L88
COLLAPSE https://docs.example/install#install               ==  ...#configure
COLLAPSE https://youtu.be/VIDEO?t=30                        ==  ...?t=200
COLLAPSE https://x.com/p                                    ==  https://x.com/p?referrer=twitter
```
The stated primary user (SPEC.md:4-5, "developers who have 1,000–10,000 saved links … issue
threads") is precisely the population whose GitHub permalinks, docs anchors and video timestamps
collapse. `?t` and the `ref` prefix also strip semantically-loaded params.
*User notices:* a 5,000-link Chrome export imports as e.g. 4,300 with "700 duplicates in that file"
— the user knows they did not save 700 duplicates and cannot see or recover them.
*Minimal fix:* keep the fragment in `dedupeKey` only (`return \`…${qs}${u.hash}\``) and remove `t$`
and bare `ref` from the strip list (keep `utm_`, `mc_`, `fbclid`, `gclid`, `igshid`, `spm`, `si$`).
Do **not** touch `canonicalUrl`'s display form — the one-line change is in the key only.

---

# 2. MAJORS

### MJ-1 — The free-plan 300-link cap is fully bypassable through restore-from-export
`src/state.ts:284-307` — `importSnapshot` never mentions `state.entitlement` and hardcodes
`blockedByPlan: 0`.
[run] On an **expired** plan: paste-import correctly reports
`89 added … 311 over the free 300 link cap — not imported` (cap enforced), then restoring a 500-link
Salvage JSON lands `links in IDB: 800`. Export → wipe → restore = unlimited library for free; the
JSON export is explicitly an "always free" capability (`trial.ts:35`).
*Fix:* reuse the same block in `ingest` — compute `room` before `bulkPutLinks` in `importSnapshot`
and report `blockedByPlan`.

### MJ-2 — Trust-rule violation: the UI claims blocked links are recoverable; they are never stored
`src/trial.ts:100` (`reason` shown verbatim on the Settings screen):
"Links beyond the first 300 are **kept on disk and released again if you subscribe**."
`src/state.ts:255-261` computes `accepted = fresh.slice(0, room)` and writes **only** `accepted`; the
blocked objects are garbage-collected. [run] 400 URLs pasted → status line says 311 blocked → hard
reload → `links in IDB: 300`. Subscribing later releases nothing; the user must re-import and pray
their file is unchanged. (The import status line itself, `views.ts:246`, *is* honest — the two
messages contradict each other.)
*Fix:* one sentence in `trial.ts:100` — "…beyond the first 300 are not imported; export keeps the
whole file and you can re-import after subscribing." Or actually stash them (a `blocked` store).

### MJ-3 — Event store is keyed by `ts` alone → the activity log overwrites itself
`src/db.ts:27` (`createObjectStore(STORE_EVENTS, { keyPath: "ts" })`) + `src/state.ts:149-152`
(`logEvent` puts with `ts: state.now`, and `state.now` only changes inside `emit()`).
Any two events in the same millisecond collapse into one row. Guaranteed cases:
`ingest` logs `trial-start` **and** `import` with the same `state.now`, and `ensureDeck` logs
`deck-shown` with the same value; `bulkTossDuplicates` (`state.ts:309-321`) logs N events with one
timestamp, so tossing 50 duplicates writes **one** row.
[run] after the demo import the events store holds **1** row where the app called `logEvent` 3 times.
Also: `state.events.push` (memory) keeps all of them, so the in-memory Map and the DB disagree until
reload, i.e. Pulse numbers quietly drop when you refresh.
*Fix:* give events a real key — add `id: \`${ts}-${seq++}\`` (or use `autoIncrement`) and key the
store on it, keeping `ts` as an index; make `logEvent` stamp `ts` at call time rather than reuse
`state.now`.

### MJ-4 — `hashId` has ~32 bits of entropy, not 64 → silent link overwrite proportional to library size
`src/hash.ts:10-14`: `b = hashString(input + "\u0001salt")`. FNV-1a is a plain iterated hash, so if two
inputs collide after the common prefix, appending the **same constant suffix** keeps them collided —
the "second hash" contributes no independent bits. The two base-36 halves are also concatenated with
no separator and a `padStart(13)` that is a no-op for real inputs (measured id lengths: 13 and 14).
[run] 8 collisions among 300,000 *distinct* dedupe keys (≈ the 32-bit birthday rate, n²/2³³), e.g.
`https://b.example.com/p/85471/xx` and `https://e.example.com/p/89904/xxxxx…` both hash to
`6pl4hj1aubzi6`. Expected collisions: ≈1.2 % of 10k-link libraries, ≈10 % at 30k.
`ingest` only compares `dedupeKey`s (`state.ts:249-251`), so the pair passes the dedupe filter and
`bulkPutLinks`' `s.put(l)` (`db.ts:100-102`) silently **replaces** the other user's link while the UI
says "N added".
*Fix:* make the halves fixed-width and non-degenerate —
`hashString(input).toString(36).padStart(7,"0") + hashString([...input].reverse().join("")).toString(36).padStart(7,"0")`;
and in `bulkPutLinks`, `get` each id first and skip/flag when an existing row has a different `dedupeKey`.

### MJ-5 — "Cards per day" is a fake control: it saves, reports success, and is never read
`src/views.ts:312` (input seeded from `state.settings.deckSize`), `src/views.ts:349` (writes it and
announces `Saved: 12 cards/day, snooze 7 days (tomorrow's deck).`).
Grep of the whole tree: the only consumer of a deck size is `src/state.ts:123`
(`const deckSize = state.entitlement.deckSize`) — `Settings.deckSize` (`model.ts:52,63`) is read by
nothing but the input that wrote it.
[run] saved `12`, cleared today's deck row, reloaded → deck is `1 of 10` (Pro entitlement),
and on an expired plan it is 10 as well (see BL-3).
*Fix:* either honour it — `const deckSize = Math.min(state.settings.deckSize, state.entitlement.deckSize)`
— or delete the field and the control. Do not leave the confirmation sentence as-is.

### MJ-6 — Search index is rebuilt from scratch on every render (measured 182 ms per render at 10k links)
`src/views.ts:145-181`: `libraryView()` defines `runSearch()` and calls it during construction
(`views.ts:173`). `libraryView` runs inside `render()`, and `render()` is the subscriber for every
`emit()` — every triage, undo, `setStatus`, `markDone`, `setNote`, route change. Each keystroke in the
search box also rebuilds the whole index after the 180 ms debounce (`views.ts:167-171`).
[run] `buildIndex()` with 10,000 realistic links = **182 ms** synchronous main-thread work per render
(the SPEC's own target size is 1k–10k links). `computePulse` per render is fine by comparison (2.7 ms).
Secondary offenders, both recompute over the whole library on every render of the Import route:
`findDuplicateGroups(linkList())` + `nearDuplicateTitleGroups(linkList())` (`views.ts:263-264`), where
the duplicate result may not even be displayed (Pro-locked branch).
*Fix:* keep one module-level `SearchIndex` plus a `linksVersion` counter bumped in `patch`/`ingest`, and
rebuild only when it changed; hoist the two duplicate-group calls into the non-locked branch only.

### MJ-7 — `patch()` mutates memory before persistence and nobody handles the failure → the UI asserts writes that never happened
`src/state.ts:165-167`: `state.links.set(id, next)` happens **before** `await db.putLink(next)`; every
caller is `void`-fired (`views.ts:89-97`, `112-114`, `139`, `230`, `303`, `315`, `327`) with no `.catch`,
and `state.error` is only ever assigned in `boot()` (`state.ts:93`). A rejected/never-settling write
(quota, the BL-5 wedge, an invalid record from BL-4) leaves the deck showing the card as tossed while
IndexedDB still has it as `pile`. That is exactly "a state mutation that does not persist", and it is
silent.
*Fix:* move `state.links.set` after `await db.putLink(next)`, or wrap: on failure restore `link` and set
`state.error = "Could not save — your change was not stored."`.

### MJ-8 — One boot failure is a permanent, unexitable error screen
`src/state.ts:92-97` sets `state.error`; nothing in the app ever clears it (only assignment in the
codebase is line 93). `src/views.ts:402-406` gives that branch priority over every route, and the
screen contains no retry button. Because `dbPromise` also caches the *rejected* promise
(`db.ts:13-16` — no `dbPromise = null` on failure), the app can never recover in that tab.
*User notices:* one private-window stumble and every later visit to that origin shows
"Could not open your local library" with no way to reach Import/Settings/Delete.
*Fix:* `dbPromise = null` inside `req.onerror`/`onblocked`, and add a "Try again" button that calls
`boot()` after clearing `state.error`.

### MJ-9 — No cross-tab coordination: two tabs hold private copies of the library and overwrite each other
`src/db.ts:13-42` keeps one connection with no `onversionchange` handler; `src/state.ts:45-60` keeps a
full `Map` copy; there is no BroadcastChannel/storage event. Two tabs both `getAll()` at boot; each
triage writes the whole link object (`putLink`, `db.ts:70`), so the last writer wins and discards the
other tab's changes for that link. `db.ts:39` additionally treats a blocked open as a fatal error
("blocked by another open tab") → combined with BL-5 that message is the app's only hint that anything
is wrong. [code/unverified — requires two live tabs; the code path is unambiguous]
*Fix:* register `req.result.onversionchange = () => { db.close(); dbPromise = null; }` in `openDb`, and
either refuse to boot a second tab or broadcast `patch` ids to refresh the other copy.

### MJ-10 — Restore path performs no URL-scheme validation → `javascript:`/`data:` URLs become live links and `window.open` targets
The bookmark path is careful: `toLink` rejects anything not http/https
(`bookmarks.ts:115-116`, and `canonicalUrl` deliberately returns `javascript:` untouched for that check
— tested at `tests/io.test.ts:48-52`). `importSnapshot` skips `toLink` entirely and persists
`fromJson` output verbatim (`state.ts:285-299`), which is then rendered as
`h("a", { href: l.url })` (`views.ts:84`, `views.ts:108`) and passed to `window.open(l.url, …)`
(`views.ts:112`). A "bookmarks backup" file handed to a user (the app invites exactly this behaviour)
can therefore execute script in the app's origin — where the whole IndexedDB library lives.
[code]; not reproduced at runtime because BL-4 crashed the render first.
*Fix:* in `importSnapshot` run every restored link through
`if (!isHttpish(canonicalUrl(l.url))) { invalid++; continue; }`.

### MJ-11 — The bundled demo library is not "real public pages": all 211 shipped URLs point at non-existent hosts
`src/views.ts:285` promises: "Loads a demo library built from the URLs our own research pass verified
— **every link is a real public page**." `public/sample-bookmarks.html` (and `dist/`) actually contains
[run]:
```
47 × https://github.com/…      26 × https://news.ycombinator.com/…
20 × https://www.reddit.com/…  10 × https://hn.algolia.com/…   7 × https://dev.to/…
```
— i.e. `.com`→`.com` (and `dev.to`→`dev.to`) for every domain; none of these resolve. The corruption is
inherited from `research/*.md` (67 × `github.com`, 44 × `www.reddit.com` there), which `scripts/make-sample.mjs:11-13`
scrapes wholesale; `research/AUDIT.md` only re-opened 47 URLs, so most of the 211 were never fetched
in any form. This also breaks the product's own core loop during the demo (the `Open` button and the
`.deck-url` href go nowhere).
*Fix:* regenerate the sample from a hand-checked URL list, or change the sentence to say the demo's
URLs are illustrative and may not resolve. (Do not let `AUDIT.md`'s "0 fabricated" line stand next to
this file.)

### MJ-12 — Multi-file import races: the drop handler never awaits, so entitlement headroom and every counter are computed from a stale snapshot
`src/views.ts:261`: `ondrop: … for (const f of Array.from(files)) void readFile(f)` — N concurrent
`ingest()` calls. Each one captures `existingKeys` (`state.ts:249`) and `room = linkLimit - state.links.size`
(`state.ts:256`) **before** the others write, so a 2-file drop can import up to 2× the cap and reports
`added` twice for links that were written once. `ensureTrialStarted` (`state.ts:262-266`) can be applied
twice and `ensureDeck()` races on `getDeck/putDeck` for the same date key. (The `<input type=file>`
handler at `views.ts:260` *does* `await` per file, so only the drop path races.) [code]
*Fix:* serialize — make one module-level `ingestChain: Promise` and do
`ingestChain = ingestChain.then(() => readFile(f))` in both handlers.

### MJ-13 — Focus is destroyed or hijacked on every render; keyboard-only triage loses its place
`src/views.ts:407` (`clear(root)` + rebuild) and `src/views.ts:413`
(`if (state.route === "deck") focusFirst(root, "[data-action='open']")`).
- On Queue / Library / Pulse / Import / Settings the focused element is deleted on every `emit()`, so
  focus falls to `<body>` and tab order restarts at the skip link after every Done/Toss/Rename click.
- On the deck route the opposite happens: focus is *forced* to the Open button on every render —
  including after `undo()` and after clicking the sub-action row — so a keyboard user cannot stay on
  Undo.
- After a triage there is a focus fight: `render()` focuses `[data-action=open]` (`views.ts:413`) and
  then `afterTriage()` moves it to `.deck-title` (`views.ts:70-71`) — two focus moves per keystroke.
- When the last card is triaged, `deckView()` returns `emptyDeck()`: the `.deck-title` selector is gone
  and `[data-action=open]` is gone → focus silently drops to the document start.
SPEC.md:21 claims "Keyboard-only is a first-class path". [code; the e2e test that was meant to catch
this ("focus stays on the deck", `app.spec.ts:94`) is itself red from BL-1]
*Fix:* in `render()`, capture `document.activeElement`'s `data-focus-key` before `clear()` and restore
it after; make `focusFirst` run only when the route changed or focus is outside `#app`; add a
`[data-focus-key]` target to the empty state.

### MJ-14 — `role="status"` regions are re-created on each render, so the statuses they advertise are never announced
`src/views.ts:29/31/32` (trial chip), `views.ts:243-247` (`import-status`), `views.ts:315`
(`settings-status`). All live inside `#app`, which `render()` tears down and rebuilds on every emit.
A live region only announces *changes to a node that is already in the a11y tree*; a freshly inserted
node carrying its final text is generally read as content, not as an announcement. The only working
channel is the detached `#live` region in `src/dom.ts:38-47`, and its
`textContent = ""` + 30 ms `setTimeout` (dom.ts:43-46) drops messages when two announcements overlap
(which triage + afterTriage do constantly). Additionally the settings trial bar hardcodes a 40-day
scale (`views.ts:336`: `aria-valuemax="40"`, `40 - daysLeft`) while the length is
`settings.trialLengthDays`. [code]
*Fix:* keep one persistent `#live` node (already done) and use it for these three statuses; or hoist
the status nodes out of the re-rendered subtree. Set `aria-valuemax` from `state.settings.trialLengthDays`.

---

# 3. MINORS

mi-1 `src/state.ts:123` + `model.ts:52,63`: `Settings.deckSize` is dead config (see MJ-5). Same for
`Settings.proClaim` (`model.ts:54`) — never read; and `DEFAULT_SETTINGS.streakDays` is only ever a cache.
mi-2 Dead exports (verified by exhaustive grep of `src/`, `tests/`, `e2e/`, `scripts/`):
`dom.pct`, `dom.relTime`, `hash.shuffleSeeded`, `bookmarks.parseUrlList` (re-implemented inline at
`state.ts:277`), `exporters.describeLibrary`, `trial.defaultSettings`, `trial.verifyLicenceSignature`
(never called — it is at least honestly documented), `trial.hoursLeft` (computed, never displayed),
`db.getLink`, `db.deleteLink`, `db.allDecks`, `db.countLinks`, `db.countEvents`,
`helpers.linkIdMap`, `Pulse.savedPerMonth`, `Pulse.duplicateGroups` (Pulse recomputes dupes via
`findDuplicateGroups` at `views.ts:186` and never uses the field). Empty directory `src/ui/`.
`void windowMs` (`resurfacer.ts:134`), `void token` (`bookmarks.ts:59`), `WEIGHTS.snooze` declared and
never used (`resurfacer.ts:29` vs the hardcoded `-Infinity` at line 86), `NewLink extends SalvageLink`
empty interface (`bookmarks.ts:112`), and event types `unkeep`/`trial-lock`/`export` in
`model.ts:29,36,37` that no code ever emits.
*User notices:* none directly — but 31 KiB of it is shipped (Lighthouse `unused-javascript` score 0,
`shots/lh.json`), which contradicts DECISIONS D3's "payload must stay small".
mi-3 `stats.ts:79` `savedPerMonth` is mathematically wrong: it divides the link count by the months
between *now and the **average** addDate*, so 500 links all saved yesterday report "500 saved/month".
Currently undisplayed — do not wire it up as-is.
mi-4 `stats.ts:57-62` `duplicateGroups` counts surplus copies, not groups (3 copies → 2). Label says
"Exact duplicates"; `computePulse`'s number and the Pulse view's number for the same library differ.
mi-5 `views.ts:139` always announces `"20 stale queue items moved back to the pile"` while performing
`stale.slice(0, 20)` — with 3 stale items the app says 20; the button label promises all of them.
mi-6 `views.ts:112` the row's `Read` button calls `markDone` but never bumps `openCount`/`lastOpenedAt`,
unlike `triage("open")` (`state.ts:193`). Library rows then read "opened 0×" for things the user read,
and the Resurfacer's domain-affinity signal (`resurfacer.ts:47-51`) under-weights exactly the links the
user is actively working through.
mi-7 `main.ts:28-32`: Escape is captured globally, *before* the `isTypingTarget` guard at line 40 — so
Escape inside the search box or a note field jumps to the Deck route instead of clearing the field.
mi-8 `views.ts:240-248`: `state.lastImport` is never cleared, so the Import screen keeps showing
"bookmarks.html: 211 added" for the rest of the session (and re-shows it after "Delete everything",
see BL-5).
mi-9 Timezone/date audit — **verified correct, no bug found**: `dateKeyOf` is local-calendar-day and
`recomputeStreak`'s noon-anchored `cursor -= DAY` walk survives DST and month/leap boundaries
(6 scenarios run under `TZ=America/New_York` and `TZ=Pacific/Auckland`: spring-forward 4/4, fall-back
3/3, month-end 3/3, Feb→Mar 3/3, leap 3/3, a 365-day run across two DST shifts 365/365).
Residual: `dateKeyOf` is local, so flying west across midnight yields a second deck row for the
"earlier" date and `settings.lastSeenDate` can sit ahead of today; and `state.now` only advances in
`emit()`, so a tab left open past midnight keeps yesterday's key until the next action.
mi-10 `stats.ts:104-112` `humanAge` says "12mo ago" at 349 and 364 days, then "1.0y ago" at 365;
`explainAge` (`resurfacer.ts:66-73`) stays silent for saves younger than 45 days while the deck chip
still shows an age — two different "how old is this" stories on one card.
mi-11 Streak semantics: `recomputeStreak` counts `deck-shown` (`stats.ts:87`) and `ensureDeck` writes
that event *by itself at boot* (`state.ts:139-140`), so merely opening the tab keeps "Nd streak"
alive (`views.ts:43`) even with zero triage. The code matches its own comment; the *label* oversells.
mi-12 `views.ts:373` contains the no-op interpolation `${state.entitlement.trialStart ? "" : ""}`
inside a user-facing privacy sentence — a stub that renders nothing, left in a "honesty" paragraph.
mi-13 `exporters.toBookmarksHtml` is documented as "Round-trips through parseBookmarksHtml()"
(`exporters.ts:59`) but drops `status`, `kept`, `note` (it writes `DESCRIPTION=`, which
`parseBookmarksHtml` never reads), tags are flattened, and folder nesting is faked from a `" / "`
string; `LAST_visit=` (line 83) is not a real Netscape attribute. The round-trip test
(`tests/io.test.ts:173-182`) only asserts url+title, so it cannot catch this.
mi-14 `exporters.toCsv` embeds `humanAge(l.addDate, Date.now())` (line 43) — a *relative* string in a
supposedly stable export column.
mi-15 `ics.ts:24-28,51-53` emits a floating local `DTSTART` with no `TZID`/`X-WR-TZ`, picks the
weekday by advancing from `now` (so if the hour already passed today it can still be today/yesterday
in the user's calendar), and `TRIGGER:PT0M` (line 70) without a sign is rejected by some clients.
mi-16 `public/sw.js:37-53` is cache-first for navigations (background refresh does happen at line 42),
so users serve the *previous* app version for one extra load after every deploy and there is no
"update available" affordance; the `message: "skip-waiting"` handler (`sw.js:68-70`) has no sender in
`src/` — dead branch.
mi-17 `views.ts:12` `searchTimer` is module-global and its closure captures the previous render's
`all`/`resultsWrap`, so a keystroke followed by a route change fires `buildIndex` against a detached
node 180 ms later.
mi-18 `bookmarks.ts:89-98` `parseAddDate`: 14-digit **microsecond** timestamps (older Safari/Firefox
exports) hit the `length >= 14` branch, `new Date("1600000000000000")` → `Invalid Date` → `null`
("no save date"), losing the strongest ranking signal for old bookmarks. `attr()` (`bookmarks.ts:39-44`)
matches `data-href`/`HREF` by first occurrence, so an attribute order change can pick the wrong URL.
mi-19 `state.ts:309-332` `bulkTossDuplicates`/`renameFolder` issue one transaction **per link** (N
round-trips, no atomicity: a reload mid-rename leaves a half-renamed folder) and `renameFolder`
records no undo entry.
mi-20 `db.ts:13-42`: `dbPromise` caches rejections permanently (see MJ-8); `tx()` (line 44) never
listens for `abort` — harmless for the readonly uses that exist today but a trap for future writes.
mi-21 The event log is never pruned or capped (`db.ts:26-29`, `state.ts:89` loads **all** events with
`getAll()` and sorts them at boot; `views.ts:37`/`185` walk them on every render). Slow growth, and it
is the one store with no size limit or compaction story.
mi-22 `views.ts:230,326,340` disabled Pro controls (Rename / Export CSV / reminder) carry no
`title`/`aria-describedby` reason; a screen-reader user hears only "Rename, dimmed". Also
`has("bulk-cleanup")`-gated folder rename and `dedupe`-gated cleanup are *disabled buttons that are the
only path* to those features — with the explanation living in a different card.
mi-23 SPEC.md:36-39 lists "snooze scheduling" as Pro; `views.ts:91` gives Snooze to everyone and
`trial.ts:24-33` has no capability for it. `PRO_CAPABILITIES.pulse-history` likewise has no gate
anywhere — `views.ts:183` renders Pulse for expired users, while the Settings list ticks it as a Pro
capability they are missing.
mi-24 Test quality (asserts the implementation, or asserts nothing):
- `e2e/app.spec.ts:108` `expect(page.locator(".link-row", { hasText: "Toss it" })).toHaveCount(0)` —
  there is never a `.link-row` on the deck route, so this passes unconditionally.
- `e2e/app.spec.ts:187` is titled "…reachable and pro-gated honestly" but never disables the trial or
  asserts a locked state; it renames a folder and asserts only that *some* `.link-row` is visible.
- `tests/logic.test.ts:16` "…different for another day" never compares the two decks — it asserts
  `new Set(otherDay).size === 5`, i.e. within-deck uniqueness only.
- `tests/logic.test.ts:81` "never puts the same link in a deck twice, **on any day**" only checks each
  day's deck for internal uniqueness; cross-day repetition is never tested.
- `tests/logic.test.ts:57` calls `scoreLink(..., ctx as never, …)` — the context type is not exported,
  so the test type-checks by coercion.
- `tests/io.test.ts:8-35` re-implements `makeLink`/`NOW` instead of importing `tests/helpers.ts`, and
  the two fixture builders generate `id` differently (`url.length + checksum` vs `hashId(dedupeKey)`),
  so they will silently diverge.
- **No test file touches `src/state.ts` or `src/db.ts` at all** — persistence, undo, ingest, cap
  enforcement, `resetAll`, and the import races (BL-1/2/3/5, MJ-1/3/4/5/7/12) are entirely untested.
mi-25 `scripts/audit.mjs` is the only Lighthouse harness, is **not** declared in `package.json`
scripts (so it is not in `npm run check`), imports `chrome-launcher` which is not a declared
dependency (works only via hoisting), and never exits non-zero on a bad score. The retained
`shots/lh.json` was collected against `#/import` only (perf/a11y/bp/seo = 100) — the deck, library,
queue and settings routes have never been audited, so the SPEC's "Lighthouse (perf/a11y/bp)" success
measure covers one screen.

---

# 4. Honesty audit vs the trust rules (explicit)

| UI claim | Where | Verdict |
|---|---|---|
| "Links beyond the first 300 are kept on disk and released again if you subscribe" | `trial.ts:100` | **FALSE** [run] — blocked links are never written (MJ-2) |
| "Trial ended · free plan" + 5 cards/day | `views.ts:31`, `trial.ts:99` | **FALSE in practice** [run] — 10 cards are dealt at boot (BL-3); 300 cap bypassable via restore [run] (MJ-1) |
| "Saved: 12 cards/day (tomorrow's deck)" | `views.ts:349` | **FALSE** [run] — the value is never read (MJ-5) |
| "every link is a real public page" | `views.ts:285` | **FALSE** [run] — non-existent hosts (MJ-11) |
| "Undid: tossed" | `state.ts:224` | **FALSE** [ship-red] — position and, for `open`, status are not restored (BL-1) |
| "N reversible actions" next to Undo | `views.ts:98` | **Overstates** — the stack is memory-only and partial (BL-1) |
| "salvage json … 0 not a web link" | `views.ts:245` | **FALSE for restores** — no validation at all on that path (BL-4, MJ-10) |
| "Nothing leaves this device … only requests are for this site's own files" | `views.ts:369` | Consistent with code [code] — no analytics/fetch except same-origin `sample-bookmarks.html` (`views.ts:286`); verified no cross-origin URL in `src/`, `index.html`, `public/manifest.webmanifest` |
| "This is a soft trial: clearing site data resets it" | `views.ts:338` | **Honest** — and confirmed trivially bypassable: edit `meta/settings` (`firstRunAt`, or `trialLengthDays` to any number you like — `trial.ts:62` trusts it), roll the system clock back (`getEntitlement` uses the client `now`), another browser/incognito, or `wipeEverything`. No UI control exposes `trialLengthDays`, so at least it is not self-serve. |
| "We cannot fetch page text / scan dead links / push-notify" | `views.ts:371-374` | Honest, matches DECISIONS + absence of code |
| `verifyLicenceSignature` "no licence verification ships" | `trial.ts:109-114` | Honest stub, clearly labelled; never called |
| `resurfacer.ts:138-141` "deterministic … that is what makes 'today's deck' honest" | doc comment | **FALSE as shipped** — the deck row is re-cut at reload (BL-2); the seed also ignores library contents (`resurfacer.ts:150` uses `candidates.length` only) so identical libraries in a different insertion order shuffle [code] |

---

# 5. Categories where I found **nothing** wrong (stated to avoid inventing problems)

- **DST / calendar arithmetic** in `dateKeyOf`, `recomputeStreak`, `humanAge`: correct under two
  timezones and 6 boundary scenarios [run] (see mi-9). No off-by-one found.
- **In-import duplicate handling within one file**: `toLinks` (`bookmarks.ts:139-158`) is correct,
  counted, and re-import is idempotent — confirmed by the shipped e2e ("0 added, 211 already had")
  and by probe (211 → 211).
- **Bulk-write atomicity on partial failure**: `bulkPutLinks` is one `readwrite` transaction
  (`db.ts:98-103`) resolved on `oncomplete`, and `state.links` is only mutated *after* it resolves
  (`state.ts:260-261`) → a 10k import either fully lands or not at all, with no memory/DB split. Good.
- **No XSS via rendered text**: `dom.h` uses `createTextNode` for children (`dom.ts:25-31`); every
  exported HTML string is `esc()`d (`exporters.ts:55-57`).
- **CSV/ICS formatting**: RFC-ish quoting and 75-octet folding hold (tests pass [run]).
- **Base-path/deploy plumbing**: `make-sw.mjs` rewrites `/*VERSION*/`+`/*PRECACHE*/` correctly and
  fails loudly if the markers move; `serve-subpath.mjs` normalises and confines paths.
- **Colour-only signalling**: I looked for it specifically — status chips, "never opened", capability
  lists and the bar chart all carry text; `:focus-visible`, `.sr-only`, the skip link and
  `prefers-reduced-motion` all exist in `src/styles.css`. **No colour-only defect found**; heading
  order (h1 → h2 → h3) is correct in every view.

---

# 6. What I could NOT verify

- Multi-tab lost updates (MJ-9) and the `javascript:`-href render (MJ-10) — reasoned from code only;
  the second was blocked in practice by BL-4 crashing the view first.
- A real end-to-end *user-visible* loss from an `hashId` collision (MJ-4): I measured the collision
  rate and read the `put`-overwrite path; I did not manufacture one inside the running app.
- Everything Safari/iOS-storage-related (`views.ts:373`, `db.requestPersistence`) — no Safari here.
- Lighthouse for deck/library/queue/settings (mi-25) and any claim about the deployed Pages URL
  (DECISIONS D1/D2, STATE.md "Next actions") — no deploy present in this tree.
- *Why* the research URLs are `.com`-mangled (fabrication vs an anonymising proxy in the research
  sandbox). The shipped artefact is wrong either way; I am not asserting intent.
- Whether `npm run e2e` failures BL-1/BL-2 are 100 % reproducible today (I did not re-run the suite);
  they come from the repo's own last run at 20:20, and I confirmed both mechanisms by reading code
  plus reproducing the deck rebuild in probe3.

---

# 7. Evidence commands (all read-only against the repo; probes live in /tmp/cora)

```
node_modules/.bin/tsc --noEmit                                   -> exit 0
npx vitest run                                                   -> 51 passed
node --experimental-strip-types /tmp/cora/t.mjs                  -> canonicalUrl/dedupeKey COLLAPSE cases (BL-6)
TZ=America/New_York|Pacific/Auckland node … /tmp/cora/t2.mjs     -> streak 6/6 OK, humanAge rounding (mi-9, mi-10)
node … /tmp/cora/t5.mjs                                          -> hashId: 8 collisions / 300k keys, shared-prefix proof (MJ-4)
node … /tmp/cora/perf.mjs 10000                                  -> buildIndex 182 ms, computePulse 2.7 ms (MJ-6)
node … /tmp/cora/probe3.mjs  (dist served by scripts/serve-subpath.mjs)
    A: 211 links, events rows = 1 for 3 logEvent calls           (MJ-3)
    B: expired plan text shown                                    (BL-3 setup)
    C: deck "1 of 10" while settings.deckSize=12, expired         (BL-3, MJ-5)
    D: "89 added … 311 over the free 300 link cap"; after reload IDB has 300  (MJ-2)
    E: restore 500-link JSON on expired plan -> IDB 800           (MJ-1)
    F: malformed JSON -> pageerror "…reading 'join'", UI dead     (BL-4)
node … /tmp/cora/probe6.mjs                                      -> Delete: salvage@1 still present, next open HUNG (BL-5)
test-results/*/error-context.md                                  -> the two red shipped e2e tests (BL-1, BL-2)
node -e "…hosts of dist/sample-bookmarks.html"                   -> 47× github.com, 26× news.ycombinator.com … (MJ-11)
```

## Suggested fix order (smallest diff, highest value)
1. `boot()`: recompute `state.entitlement` right after the settings load (BL-3) — 1 line.
2. `ensureDeck()`: keep the stored `linkIds`, apply the snooze predicate, don't reset the index (BL-2) — 3 lines.
3. `undo()`: restore the saved `deckIndex` and record undo on the `open`-status patch (BL-1) — 4 lines.
4. `wipeEverything()`: `close()` then delete, and reject on `blocked` (BL-5) — 3 lines.
5. `sanitizeLink()` in `fromJson` + `isHttpish` gate in `importSnapshot` + entitlement cap (BL-4, MJ-1, MJ-10) — ~15 lines.
6. `dedupeKey`: keep the fragment, drop `t$`/`ref` from the strip list (BL-6) — 2 lines + a migration note for existing libraries.
7. Fix the trial sentence in `trial.ts:100` and either honour or remove `Settings.deckSize` (MJ-2, MJ-5).
8. `hashId` width/separator + collision guard in `bulkPutLinks`; events store key (MJ-4, MJ-3).
9. Memoise the search index; restore focus across `render()`; clear `state.error` (MJ-6, MJ-13, MJ-8).
10. Re-run `npm run check` — it is red right now, and it is the only thing standing between these
    bugs and "verified end-to-end in Chromium" in SPEC.md.
