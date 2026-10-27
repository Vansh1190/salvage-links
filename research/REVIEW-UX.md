# REVIEW-UX — Salvage UI, screenshot-by-screenshot

Reviewer: product design + copy pass. Read-only review; no files changed.
Evidence: `shots/*.png` (measured in CSS px — desktop 1280×900 @1x, mobile 390×844 @2.626 DPR, per `playwright.config.ts:24-25`), `src/views.ts`, `src/styles.css`, `src/resurfacer.ts`, `src/state.ts`, `src/stats.ts`, `src/trial.ts`, `SPEC.md`, `shots/lh.json`.

Lighthouse on the import route: perf 1.00 / a11y 1.00 / bp 1.00 / seo 1.00. **The a11y 1.00 is misleading** — Lighthouse checks text contrast, not control-boundary contrast, and it never saw the deck's decision moment. Everything below is what the score cannot see.

Headline judgement: the bones are right (one card, four verbs, honest copy, deterministic deck). What is not right is that **the chrome currently out-shouts the content on every screen, and three of the four verbs hide their consequence.** A stranger can *look* at Salvage but cannot *predict* Salvage.

---

## 1. deck-desktop.png — first-run comprehension

**Where the eye actually goes (measured):** (1) `Salvage` wordmark, top-left, the only saturated thing above the fold; (2) the **Trial pill** top-right — it is the only outlined-green element in the header, so the product's least interesting fact is its loudest; (3) the 7-chip nav strip; (4) only then the card, whose green border (`styles.css:257-260`) is the intended magnet but is 35%-mixed and reads as "slightly warmer box".

**10-second test: fails, by ~3 seconds.** In 10 seconds a stranger learns the name, that it's a trial, and that there are 7 places. They do not learn *what a deck is*, because the page never says it. The one sentence that would (`SPEC.md:14-15` "a finite number of your own old saves every day, triage in ~3 seconds") exists only in `index.html`'s `<meta description>` — i.e. in Google, not on screen. `views.ts:81` labels the card `TODAY'S DECK`, which is a name, not an explanation. The `<title>`/`theme-color` do the explaining; the page does not.

**Single most confusing thing:** the **nav digit badges** (`views.ts:390`, styled `styles.css:191-205`). Seven pills each ending in a small boxed number — `Library 3`, `Pulse 4`, `Settings 6`. A boxed number on the right edge of a pill is, by universal convention, **a count of things waiting**. Users read "Pulse 4" as "4 new in Pulse" and go looking for a notification. They are keyboard hints. Nothing on screen says so, and the same badge treatment is used for real numbers elsewhere (`1 of 10`, `211 in pile`). This one detail manufactures fake work.

Runner-up confusions, in order:
- The **dashed URL box** (`styles.css:333-343`) looks like a code block or a pasted quote — the most "interactive-looking" thing in the card is the least useful one, and it restates the title verbatim (`reddit.com — i_now_have_definitive_proofs_that_my_q we` then the same slug in monospace). Three restatements of `reddit.com`: host chip, title, URL box. Then "Why now" says *you have never opened it*, which the amber chip already said.
- `1 of 10` next to `TODAY'S DECK` (`views.ts:81`) is the second-most-important number in a **finite-deck** product and it is a 15px muted afterthought in the corner. A deck of 10 begs for 10 dots; it gets a fraction.
- The demo title itself is a slug. Real bookmark decks are full of these. The design has no fallback for an ugly title, so the product's worst content is its biggest type.

**Layout void:** the card occupies y=204–675 of a 900px viewport; `main{flex:1}` (`styles.css:233-235`) pushes the footer to 810, leaving a ~135px dead band and making the card look *short* rather than *complete*. Either let the card breathe into the space (bigger `.why`, more air above `.actions`) or vertically centre it. Right now the eye exits the bottom of the card into nothing.

---

## 2. deck-mobile.png — is the card worth the scroll?

**Vertical budget (measured, 390 CSS px wide, 844 tall, viewport-only shot):**
- 0–55: brand + trial pill
- **70–204: nav = 134 CSS px of pills in 3 rows** (row heights ≈40px each, `nav a` padding `styles.css:167-178` + the `max-width:480px` override at `styles.css:638-640`; `flex-wrap:wrap` at `styles.css:161` defeats the `overflow-x:auto` on the next line, so it wraps instead of scrolling)
- 210–240: progress row
- **243: the product finally starts.** 29% of the screen is spent before the user sees a link they saved.
- Card 243–790: eyebrow 30px, chips 2 rows, title 3 lines, URL box 4 lines, why 3 lines, actions 617–730, Undo 758–790.
- 790–844: card padding + footer clipped mid-sentence ("what it / cannot do" is cut).

**Verdict:** on a Pixel 7 the four decisions *just* fit — but there is zero headroom. Actions begin at y≈617; add one more line of title, or one more chip, or a 390×667 iPhone SE, and `Open`/`Toss` fall off-screen — i.e. **the deck can silently become unreadable on smaller phones**. And the trust footer (`your links never leave this browser`) — the entire differentiator — is below the fold for the primary audience. On the desktop shot it's the same, just invisible because there's more height.

**Waste inside the card:**
- The **h2 eyebrow is nearly as large as the content it labels.** `h2` = 1.06rem uppercase + 0.08em tracking, muted (`styles.css:117-122`) ≈ 16.5px caps; `.deck-title` = `clamp(1.3rem, 4.2vw, 2rem)` (`styles.css:319-323`) → **20px at 390px** (the `4.2vw` branch is 16.4px and loses to the 1.3rem floor). Chrome:content ratio of 0.8 is a hierarchy inversion.
- `.why` at 0.9rem muted, 3 wrapped lines, sits visually closer to the URL box than to the buttons. It should be the *second* thing you read; it reads as footnote.
- **`Undo` is a half-width orphan.** `@media (max-width:480px) .deck .actions { grid-template-columns: 1fr 1fr }` (`styles.css:623-627`) also matches the *second* actions row because it is `class="actions actions-sub"` (`views.ts:96`) — so Undo occupies the left cell and a ~180×48px void opens to its right, which reads as "a button that failed to render". At `opacity:.9` (`styles.css:363-366`) plus `btn-quiet` transparent background, Undo looks disabled — the control that protects you from your own mistakes is the one control that looks dead.
- The 2×2 grid puts **`Toss it` directly below `Keep for reading`**, i.e. the destructive verb one thumb-flick from the keeper verb, with the keyboard badge (`X`) pushed to the far right edge by `justify-content:space-between` (`styles.css:628-630`) so it looks like a *separate tap target*, not a hint.

**Nav: proposed alternative (do not implement — proposal only).**
Seven destinations is fine; *three rows of them* is not, and this app has one daily destination. Two viable shapes:
1. **Inertial strip (cheapest, keeps the DOM).** Under 480px: `nav { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x mandatory; padding-inline: var(--gap); }` + `nav a { flex: 0 0 auto; scroll-snap-align: start; min-height: 44px; }` + `nav kbd { display: none }`. Hiding the badges shrinks each pill ~28px, so the strip shows Deck/Queue/Library fully and *invites* the drag that reveals Pulse/Import/Settings/Limits — which is honest ordering, because those four are once-a-week places. Add an edge cue: `nav { mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 26px), transparent) }`. Keep `aria-label="Main"` and the current `aria-current="page"` (`views.ts:389`) — that part is already correct.
2. **Bottom tab bar (better ergonomics, more work).** `nav { position: sticky; bottom: 0; top: auto; }` with 4 items (Deck, Queue, Pulse, More→) `flex:1`, `min-height:48px`, `padding-bottom: env(safe-area-inset-bottom)`; header keeps only the brand + trial + pile bar; `#app { padding-bottom: calc(72px + env(safe-area-inset-bottom)) }` so the last action row is never under the bar. Rationale: triage is a one-hand, thumb-driven, 60-second loop (`SPEC.md:17`), and every decision currently lives in the top 40% of the screen.

Either way the win is the same: recover ~90 CSS px and put them into the card.

---

## 3. The "Why now" line — convincing, or noise?

Exact strings the code can emit (`resurfacer.ts`): `you open {domain} a lot` (L94), `same folder as things you kept ({folder})` (L100), `you have never opened it` (L104), `saved {n} days ago` / `saved {n} years ago` (`explainAge`, L66-73), `never surfaced before` (L116), `shown recently, pushed down` (L123), `you tossed {n} from {domain} — shown less` (L129), `the oldest thing you never opened` (L173), `snoozed` (L86). They are joined with `" · "` in `state.ts:134` and re-split in `state.ts:184` for display at `views.ts:85`.

The *idea* is the product's best idea (`SPEC.md:22-23` — no black box). The shipped line is **60% of the way there and then it leaks the machine**.

As shot: `Why now: you have never opened it · saved 6 years ago · never surfaced before`

Four concrete failures:
1. **Worst fragment first.** The one fact with any gut-punch ("6 years") is buried second, between two bookkeeping facts, and "you have never opened it" is a *third* saying of the amber `never opened` chip two lines above.
2. **The numbers disagree about the same link.** Chip: `saved 5.6y ago` (`humanAge`, `stats.ts:104-112`, one decimal under 10 years). Why-line: `saved 6 years ago` (`explainAge`, `resurfacer.ts:71-72`, rounds at ≥730 days). Pulse then calls a neighbouring save `6.1y ago`. Same save, two truths, one product. For a product whose currency is *time*, this is a credibility leak, not a rounding choice.
3. **Two fragments are about the algorithm, not the reader.** `never surfaced before` and `shown recently, pushed down` are ledger entries — and the second one is *self-contradictory printed under "Why now"* ("pushed down"… then shown). Also on day 1 every card has `deckCount === 0`, so **all 5 cards say `never surfaced before`**, and users pattern-match "the tail is boilerplate" within two cards — after which the whole line becomes decoration.
4. **No date, only duration.** "saved 6 years ago" is abstract; "Sep 2020" is a memory. The code already has the timestamp and `dateLabel()` is imported in `views.ts:1`. It's used everywhere *except* here.
5. Structural nit worth logging: reasons are joined *and* re-split on `" · "` (`state.ts:134` → `state.ts:184`), so a bookmark folder literally named `Work · Ideas` (extremely common) fractures one reason into two fake reasons.

**Three rewrites (same information the code already has, sharper):**

| Current emitted line | Sharper |
|---|---|
| `you have never opened it · saved 6 years ago · never surfaced before` | **"You saved this in Sep 2020. You have opened it 0 times. It has never come up before — today it did."** |
| `you open github.com a lot · saved 2 years ago` | **"You read github.com — 47 saves and 39 opens. This one has been under the pile for 2 years."** |
| `same folder as things you kept (Repos) · you have never opened it` | **"You kept 6 other things from Repos and never opened this one. Same folder, same regret."** |

Plus, as copy rules: `the oldest thing you never opened` → **"Your oldest unread save: 30 Sep 2020."** · `you tossed 3 from reddit.com — shown less` → **"You've said no to reddit.com 3 times — this is the only one I kept."** · and delete `shown recently, pushed down` from user-facing output entirely (`resurfacer.ts:123`): a demotion is not a reason. Keep the reason list to **at most 2 fragments, age-with-date first, affinity second** — one line, never wrapping past two on mobile.

---

## 4. Action affordance — Open / Keep for reading / Snooze 7d / Toss it

All four are 45px tall (measured), well-built, keyboard-labelled, and **three of the four lie about what happens.** Read against `state.ts:187-210`:

- **`Open`** (badge `O`) does *four* things: new tab, `openCount++`, **status → `queued`**, advance the card. So pressing the friendliest button in the UI quietly files the link in another screen, and the card you were looking at is gone. The loop then demands Library→Queue→`Read` to record that you actually read it — three steps, on a screen with no `Done` verb. The primary verb of a reading app does not let you finish reading.
  → Rename **"Open in new tab"** and, in the same actions row, stop treating it as terminal in copy terms: after the click, announce/mirror the destination (`Queued → Queue`) so the user learns the filing rule once, then trusts it.
- **`Keep for reading`** reads as "keep it" (i.e. do nothing / it stays). Actually: status → `queued`, `kept = true`, it **leaves the pile** (which is why `211 in pile` drops) and lands in Queue, where `queueView` (`views.ts:129-143`) warns it will "rejoin the deck if you toss them". The verb hides the destination.
  → **"Send to Queue"** (or `Keep → Queue`). Naming the place teaches the model.
- **`Snooze 7d`** is the clearest of the four — but the promise is a duration where the user needs a **date**, and the app already knows it (`state.ts:200`). Elsewhere the library chip does it right: `snoozed to {dateLabel}` (`views.ts:108`). Two formats for one concept again.
  → **"Back on Nov 3"**.
- **`Toss it`** is red-text-with-red-border (`styles.css:403-406`) which the entire industry reads as **delete**. It does not delete: it sets `status: 'tossed'`, it stays in Library, and `Restore` exists (`views.ts:114`). Because red scares people, they will under-toss — and under-tossing kills the loop speed that `SPEC.md:15` ("triage each in ~3 seconds") depends on. Meanwhile the *actual* irreversible thing, `Delete all local data` (`views.ts:357`), is the only button with a confirm.
  → **"Never show again"** (accurate, matches what the resurfacer really does via `tossPenalty`) — or "Archive". Reserve red for the nuclear button.
- **Badges read as counts.** `Open` + boxed `O` in a monospace face (`styles.css:191-199`) is *visually* `Open 0`; in the mobile 2×2 grid, `justify-content:space-between` strands the badge at the far edge so it looks like a separate control showing "0". Same glyph collision on `Snooze 7d [S]` vs `Toss it [X]`.
- **Undo is not discoverable, and is silent when clicked.** `views.ts:94-99`: it is `btn-quiet` (transparent), 90% opacity, no `kbd` hint even though all four siblings have one (`U` is bound at `main.ts:58-60`), it is **always enabled**, and its only feedback is `announce()` — an `sr-only` live region (`dom.ts:38-47`). A sighted user who clicks Undo with an empty stack gets **literally nothing on screen**; `Nothing to undo.` never becomes visible. And when it does work, the message (`Undid: tossed`) appears nowhere sighted either. On a product whose whole pitch is 3-second reversible triage, the safety net is invisible, looks disabled, and doesn't answer.
- Undocumented keys: `/` search, `Esc` back to deck, `←/→` revisit cards (`main.ts:26-67`). `←/→` in particular matters — after an auto-advance, a user who wants the previous card has no visible way back and no hint that cards are revisitable.

---

## 5. pulse-desktop.png / pulse-mobile.png — numbers

**The 2-column grid is wrong, but not for the reason you'd guess.** `.stats` is `repeat(auto-fit, minmax(9.5rem,1fr))` (`styles.css:524-529`) — at 1280 the `78ch` container resolves to exactly 2 columns, at 390 it collapses to **1 column of 10 rows**. So it isn't a designed 2-column layout; it's an accident of the container width, and it produces these failures visible in the shots:

- **Left/right pairing is meaningless.** `Links / In the pile` sit side by side as *211 and 211* — identical numbers, no explanation of why two labels exist. `Salvaged this week / Triaged` = `0 / 0%`. Half the grid is restating one number.
- **`Shared site roots` is the worst cell in the product.** It renders `github.com (47), news.ycombinator.com (26), reddit.com (20)` as **8 wrapped lines of 1.25rem bold** (`styles.css:536-541`), and it is *literally the first three rows of the "Where your links live" bar chart immediately below it* (`views.ts:197` vs `views.ts:203-210`) — the same data twice, the second time as a chart. On mobile the blob pushes the entire Pulse page ~3 viewports long.
- **`Triaged 0%` is a third restatement** — the header bar already shows `0% triaged` on every screen (`views.ts:43`).
- **`Exact duplicates 0`** is a nothing-sentence, and its tool lives on Import (`views.ts:288-306`), so it leads nowhere. Also two competing definitions of "duplicate" exist in the code (`stats.ts:57-62` counts extra links into `pulse.duplicateGroups`, unused; `views.ts:186/196` re-computes groups with `findDuplicateGroups`). One of them is dead and the other can drift.

**Which 3 earn the space** (a pulse should only answer *am I winning, and what's next*):
1. **In the pile** — the number that must shrink. Needs a delta (`211 → was 216 on Monday`) because a level number motivates nobody.
2. **Triaged** — but *split*, see honesty below.
3. **Streak** — the daily hook (`SPEC.md:26-27`), and right now `0 days` is demoralising on day 1: the same screen that says `Trial day 1 of 40` also says `0 days`. Streak belongs at the top, framed as day-1 progress, not as a zero.
Then a small second tier: *Salvaged this week* and *Oldest unread (Sep 30 2020)* — the latter is a lovely, human fact; as a 1.25rem bold stat cell it's a trophy with no meaning, better as one sentence that *links* to that card.
**Filler:** `Links` (≡ In the pile during day 1), `Salvaged all time` (≡ this week, forever, for a solo local tool), `Never opened` (≡ the pile at day 1 and it's already a chip on every card), `Exact duplicates`, `Shared site roots`.

**Is the progress bar honest? No.** `progressPct = (done + tossed) / total` (`stats.ts:56, 72`). Toss 200 links, read none, and the header bar crawls to 95% `triaged` and the streak survives — **the metric pays you for deleting**, which is precisely the failure mode of every read-later app this product exists to fix (`SPEC.md:8-11`). The words "triaged" and "salvaged" also drift: `salvagedTotal` counts `keep`, `toss` and `queue-done` (`stats.ts:48`) while `progressPct` counts `done`+`tossed` and ignores `queued`. Nothing on screen distinguishes *I read it* from *I threw it away* — the one distinction the user cares about on day 30.
Second dishonesty, visible in **both deck shots**: `width:${Math.max(1, pct)}%` (`views.ts:42`) forces a green nub at exactly 0% — the bar lies by ~1% before the user has done anything, and the role=progressbar exposes `aria-valuenow="0"` while showing fill. Third: no `aria-valuetext`, so the accessible announcement is a bare "0%".

---

## 6. Empty / error states (from code; library shots are the zero-result state — `e2e/app.spec.ts:162`)

**Good, genuinely:** `Nothing here yet` + a single `Import bookmarks` primary (`views.ts:47-64`); the storage-failure card is named like a human and offers a cause (`views.ts:405`); the `<noscript>` and `#sw-note` copy in `index.html` is the best writing in the repo.

**Where it costs users:**
- **Search zero-results is a dead end, twice-said.** `views.ts:156-157` prints `0 matches for "cron" · ranked locally with BM25, nothing sent anywhere` and then `No match for "cron". Try one word, or the site name.` Both muted, both wrapping to 2 lines on mobile (as shot), zero affordances. The BM25 flex is nice once and is *noise* at the exact moment someone is disappointed. There's no `Show all 211`, no "did you mean a domain?", no `Clear` — and the crucial context `showing newest 200` (`views.ts:156`) disappears the instant you type, so someone with 10k links can't tell "no match" from "not loaded". **This is the highest-churn screen in the product**: the user did the one thing the app promised to be good at (find my old save) and got a shrug. Fix shape: one sentence + two exits (`Clear search` , `Browse all 211`).
- **Import failure borrows the paywall's clothes.** `views.ts:243` renders `Could not import: ${err}` with `class="locked"` — the *amber Pro-gate colour* (`styles.css:601-604`) — and `err` is a raw exception message (`views.ts:257`, `state.ts` → `recordImportError(e.message)`). A parse crash looks like "you hit a plan limit", and the sentence can read `Could not import: Unexpected token < in JSON at position 0`. No retry, no "which file", no link to paste-URLs as the fallback that already exists 20 lines below.
- **The 300-link cap is buried in prose.** `views.ts:246`: `…23 over the free 300 link cap — not imported` is the *last clause of a five-item comma sentence* in muted text. That's the paywall moment and it has no verb. It should be its own line with the free-forever reassurance (`SPEC.md:40-42`: a lapsed trial can never hold a library hostage — that promise is currently *only* on Settings/Limits).
- **`Library is empty.`** (`views.ts:157`) — period, no CTA, for a brand-new user who typed the nav digit `3`.
- **`Deck cleared` is a missed reward.** `views.ts:50-63` fires at the single best moment in the loop and responds with… two grey buttons and, at most, `2 snoozed`. The streak ticks (state.ts → `refreshStreak`) and nothing celebrates it; `0d streak → 1d streak` is invisible. Retention is authored at moments like this, not in the pulse.
- **The documented data-loss risk never meets the user.** `SPEC.md:63-65` / `views.ts:373` (Safari purges script storage after 7 days) lives on Limits and in a Settings button's `onclick` text (`views.ts:314`). Nothing after a successful import says "you have 211 links in this browser only — export or install now". A first-time iOS user's second visit can be an empty app with no explanation. That is the churn that ends the relationship, and the copy already knows it.

---

## 7. Trust copy

**Verdict: the honesty is real and unusually good, and it is under-edited.** The repo says things vendors never say (`views.ts:338`: *"We could fingerprint you to stop that and we would rather not"*; `views.ts:369`: *"Check the Network tab"*). That is a *product* asset, not legal hedging. Two problems: (a) it's styled like fine print, and (b) the flagship sentence over-promises a word the Limits page then walks back.

- `your links never leave this browser` is **true and verifiable** — but "never" is an absolute a careful reader will test against `views.ts:373` ("Safari deletes script-created storage after 7 days") and against `views.ts:314` ("persistence not granted", visible in the settings shot). The claim that *nothing is uploaded* and the fact that *the browser may delete it* are both true; the footer only tells half, so the Limits page feels like a correction rather than a continuation.
- `what it cannot do` as a link is **excellent** — curiosity + candour. Don't change it. Change what it points to: `Limits & privacy, plainly` (`views.ts:379`) is a *category* headline. The page should open with a claim you can check in 20 seconds, then the caveats.
- The best trust line in the product — the soft-trial/no-fingerprinting paragraph — is rendered `class="locked"`, i.e. amber warning text, under a trial bar, next to a list of paid features (`views.ts:338`, `styles.css:601-604`). Amber = "problem / paywall". It should be **plain `text`**, given a heading ("Why the trial is soft"), because it is a promise *to* the user, not a restriction *on* them. Same for the `✓` list: `cap-on` green text at 0.86rem (`styles.css:585-587`) plus a `✓` glyph is 4.5:1 on `--bg-elev-2` (measured) — the faintest text on the page is the sales pitch.

**Rewrite — footer (`views.ts:411`):**
> `Salvage runs in this browser. Nothing you save is uploaded — check your Network tab. · what it cannot do`

(one removable claim, one falsifiable claim, one invitation. Drop the brand word; it's already the h1 700px above.)

**Rewrite — limits headline + first line (`views.ts:367-380`):**
> **H2:** `What Salvage does, and what it refuses to do`
> **First `dt`:** `Proof, not a promise` — `dd:` `There is no account, no analytics script and no server. Load this page, open DevTools → Network, then use the app for ten minutes: the only requests are Salvage's own files. Now the part vendors skip: your library lives in this browser's storage, which means *you* own it and *you* can lose it — Safari can purge it after 7 days without a visit. So export monthly (Settings → Export, free forever), or install to your Home Screen.`

Also: rename `Limits & privacy` in the nav (`views.ts:21`) to `Limits` or `Honest limits` — "privacy" is the least interesting word for this audience and it's a 6th pill in a strip that's already too long.

---

## 8. Accessibility, as a designer (measured, light theme values from `styles.css:18-32`)

Text contrast is **fine** — someone actually measured it: muted on card 6.56:1, muted on bg 6.16:1, chip text on chip fill 5.83:1, danger 5.84:1, links 5.72:1. The real risks are elsewhere:

1. **Control boundaries fail non-text contrast (1.4.11).** `--line #d6dee7` on `--bg-elev #ffffff` = **1.36:1** (3:1 needed for an interactive-control boundary). Every `nav a` and every `.btn` is identified *only* by that hairline plus a fill 1.06:1 away from the page. `--bg #f6f8fa` vs `--bg-elev #ffffff` cards = **1.09:1**: card groupings are essentially invisible without the shadow (which only `.deck` has). Dark theme: `--line #2a3340` on `#151b23` ≈ 1.4:1 — same failure. This is the one place the 1.00 Lighthouse score is actively uninformative.
2. **Marginal by design:** `--accent #1a7f37` green *text* = 4.77:1 on `--bg`, **4.51:1 on `--bg-elev-2`** — i.e. `.cap-on`, `.chip-done`, `.chip-trial` clear AA by 0.01 on the surface they actually sit on, at 13px. Any contrast flip (dark scheme uses `#7ee787` on dark, 12.3:1, fine) or a future tinted row will fail it. Nudge light `--accent` to ≈`#166b30` or stop using it as body text.
3. **Tiny text everywhere it matters:** chips 0.76rem ≈ **11.9px**, `.stats dt` 0.74rem ≈ 11.6px, `.progress-text` 0.78rem ≈ 12.2px, and `kbd` = 0.72em of 0.88rem ≈ **9.9px**. The `kbd` badges are the app's entire keyboard documentation and they are ~10px muted-on-tinted — the worst ratio of size-to-importance in the CSS.
4. **Status is carried by colour + shape-not.** `.chip-tossed` / `.chip-done` / `.chip-queued` (`styles.css:309-317`) are the *same* pill shape, same 11.9px size, same background, differing only by text colour (red/green/blue). For the ~8% of male users with colour vision deficiency, `done` and `queued` are the same object; `tossed` is distinguishable only because the *word* is there. Cheap fix: keep the word, drop the colour-carrying duty — `tossed` → strikethrough + `--muted`, `done` → weight 600 + `--text`, `queued` → filled `--bg-elev-2` vs outline.
5. **`never opened` is amber-only too:** `.chip-warn` (`styles.css:305-308`) differs from a normal chip by a 60%-mixed border (≈1.5:1) and coloured text — for the single most important fact on the card. Same for `cap-on` vs `cap-off`, which differ by `✓` vs `·` (a 4px glyph) *and* green vs muted.
6. **Tap targets at 390px:** nav pills **≈40px tall with 6px gutters** (measured; `styles.css:160`, `638-640`) — clears WCAG 2.5.8's 24px, misses the 44px recommendation, and 6px gutters between 40px pills means a mis-tap is a route change. `.btn-tiny` (Library/Queue `Read · Done · Toss · Restore`, `styles.css:410-413`) ≈ **31px tall**, and on mobile they wrap into `flex-wrap:wrap` rows (`styles.css:452-457`, `635-637`) where **`Toss` sits 6px from `Done` and 6px from an always-present text `note` input** — a destructive verb in the smallest target on the page. The deck's four real buttons are ≈45px (good) but sit in a 2×2 with `space-between` badges that read as their own 24px targets.
7. **Live-region spam by construction:** `render()` (`views.ts:407-412`) rebuilds the whole tree on *every* state change, and `trialChip()` is `role="status"` (`views.ts:29-32`) — a new implicit live node is inserted after every triage keypress, so screen-reader users get "Trial day 1 of 40 · 40 left" re-announced each card, on top of the deliberate `announce()` call (`state.ts` → `afterTriage`, `views.ts:69`). Put `role="status"` on a stable wrapper, or drop it (it's not a status *change*).
8. **Focus theatre on the deck:** `render` focuses `[data-action='open']` (`views.ts:413`) and then `afterTriage` re-focuses the `.deck-title` (`views.ts:70-72`) — two focus moves per card, last one wins, and keyboard users get a **3px outline jumping onto a 3-line heading** each card (`.deck-title:focus-visible`, `styles.css:327-331`). Also `.progress-track` exposes no `aria-valuetext` (`views.ts:42`) while showing a non-zero fill, and `Delete all local data` uses `window.confirm` (`views.ts:357`) — fine for v1, but the confirm text and the button now disagree about reversibility ("Not reversible" vs "Export first if you might want it back").
9. **Colour-scheme default:** `:root` is dark and light only arrives via `prefers-color-scheme` (`styles.css:1-32`); `<meta name="theme-color" content="#0e1116">` is dark-only (`index.html:8`), so light-scheme Android Chrome paints a dark browser chrome around a light app — first-frame mismatch on the mobile first run.

---

## 9. Prioritised polish list (8, ranked by user impact ÷ effort)

1. **Make `Undo` visible, honest and hinted** — `views.ts:94-99`: disable it when `state.undoStack.length === 0`, print the result in a visible `.muted small` line next to it (today `announce()` is `sr-only`, so a click shows nothing), drop the `opacity:.9` in `styles.css:363-366`, and give it a `kbd` hint like its siblings. The safety net of a 3-second destructive loop is currently invisible.
2. **Rename the three lying verbs** — `views.ts:89-92`: `Keep for reading` → `Send to Queue`, `Snooze 7d` → `Back on {dateLabel}`, `Toss it` → `Never show again` (keep red *only* on `Delete all local data`, `views.ts:357`), and label `Open` → `Open in new tab` so its hidden `queued`+advance side effect (`state.ts:191-195`) isn't a surprise.
3. **"Why now": age-with-date first, max 2 fragments, and stop the number contradiction** — `resurfacer.ts:116` + `:123` (drop `never surfaced before` on a library's first deck; never print `shown recently, pushed down`), `resurfacer.ts:66-73` (reuse `humanAge`/`dateLabel` so one link isn't `5.6y` in the chip and `6 years` in the line), `views.ts:85` (render it above the actions at `--text`, not muted — `styles.css:348-354`).
4. **Nav: one inertial strip under 480px and no number-looking shortcut badges** — `styles.css:157-164` (`flex-wrap:nowrap` + `overflow-x:auto` + `scroll-snap` + `min-height:44px` on `nav a`), `styles.css:638-640` (hide `nav kbd` on mobile), `views.ts:390` (badge only as a tooltip/`title` on desktop). Recovers **134 CSS px** of a 844px screen and kills the "Pulse 4 = 4 new" misread.
5. **Stop the Settings deck-size control lying** — `views.ts:347`: it shows `settings.deckSize` (5) while `state.ts:123` builds every deck from `entitlement.deckSize` (10), so the deck says `1 of 10` and Settings says `Cards per day 5` at the same time and "Save" confirms a number nothing reads. Show the effective value with its reason (`10 — during your Pro trial`).
6. **Make the progress bar tell the truth** — `stats.ts:56,72`: report `read` and `tossed` separately instead of one `triaged` that pays you for deleting; `views.ts:42`: remove `Math.max(1, …)` (0% must show 0) and add `aria-valuetext`; `views.ts:43` + `styles.css:227-231`: put the two numbers on the bar and let it wrap on mobile instead of collapsing the track to a nub at 390px.
7. **Cut Pulse from 10 stats to 4 + delete the duplicated `Shared site roots` cell** — `views.ts:187-198` (drop `Links` ≡ `In the pile`, `Salvaged all time`, `Exact duplicates`, and `Shared site roots`, which is the bar chart at `views.ts:203-210` restated as an 8-line bold blob); add a `done` vs `tossed` split and a week-over-week delta on `In the pile`; tighten `styles.css:524-529` from `minmax(9.5rem,1fr)` so the grid stops depending on a 78ch accident.
8. **Two contrast/target fixes Lighthouse cannot see** — `styles.css:5-6,23`: `--line` at 1.36:1 fails non-text contrast for every button and nav pill boundary (and `--bg-elev` cards are 1.09:1 off the page), so raise the border/fill separation; and `styles.css:309-317,410-413,635-637`: give `.chip-tossed/-done/-queued` a non-colour cue (strikethrough / weight / fill) and take `.btn-tiny` from ≈31px to ≥44px with `Toss` separated from `Done` on mobile.
