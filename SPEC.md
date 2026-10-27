# SPEC — Salvage (repo `salvage-links`) · one page

## User
Primary: developers who have 1,000–10,000 saved links (bookmarks/READMEs/issue threads) across
Chrome/Firefox/Safari, and who have watched a read-later service die under them (Pocket, Omnivore).
Secondary: everyday people whose browser bookmarks folder is where links go to disappear.

## Problem (sourced — full evidence + URLs in RESEARCH.md)
Saved links accumulate and rot: never re-surfaced (karakeep#435, wallabag#2285), lost silently on
device reset (HN 32505314, 271 pts), dead once the vendor dies (HN 44063662, 1222 pts), and duplicate.
The most-requested feature across five reader ecosystems is *automatic resurfacing of forgotten saves*.

## Product in one line
A local-first deck that resurfaces a **finite** number of your own old saves every day, you triage
each in ~3 seconds, and the pile visibly shrinks. Nothing is uploaded; there is no account.

## Core loop (target: < 60 seconds)
1. **Import** `bookmarks.html` (drag-drop, Chrome/Firefox dialect) or paste URLs. Parse + store in IndexedDB.
2. **Deck** — today's 5 (Pro: 10) cards, chosen by the deterministic Resurfacer. One card on screen.
   Actions: `Open` (new tab + log) · `Keep` (pin, keep for later reading) · `Snooze` (return later)
   · `Toss` (archive). Keyboard-only is a first-class path (O/K/S/X, ←/→).
3. **Explainability** — every card states *why now* ("saved 3 yr ago, never opened · you open github.com
   weekly"). No black box.
4. **Queue / Pulse** — "sent to read" list with age; weekly pulse = salvaged count, pile size, streak,
   oldest save, duplicates. Progress is the retention drug.
5. Come back tomorrow because the deck is **finite and daily**, the streak is at stake, and the pile bar moved.

## Why people return
Daily (deck + streak + one-tap triage) and weekly (pulse). The library is the accumulation: entries are
years deep and re-import in one drag — the one thing in this corpus that users demonstrably watched a
vendor delete and could not get back.

## The 40-day trial (soft — the UI says so)
| | Free forever | Pro (40-day trial, then locked) |
|---|---|---|
| library size | ≤ 300 links | unlimited |
| deck | 5/day | 10/day, snooze scheduling |
| search, open/keep/toss, JSON + bookmarks-HTML export | ✅ | ✅ |
| dedupe, bulk folder cleanup, notes, pulse history, CSV export, multi-file merge, `.ics` reminder | — | ✅ |
Day 41: Pro locks, **browse/search/deck/every export stay free** — a lapsed trial can never hold a
library hostage. Billing would plug into exactly one seam, `entitlement.getEntitlement()` (today: local
clock + optional signed licence file; later: provider checkout → licence record). No payment UI in v1.
Honesty notice shipped in Settings: this is a static site, so clearing site data resets the trial; we
deliberately do not fingerprint you to prevent that.

## v1 scope cut (vertical slices, each committed with tests)
1. Data layer: IDB store + bookmarks-HTML parser + link normalisation/dedupe key.
2. Deck + Resurfacer (pure function, fully unit-tested) + triage actions + daily seeding.
3. Import (file drop, merge/dedupe) + free export.
4. Queue + Library with local BM25 search (`Intl.Segmenter` + inverted index).
5. Pulse (stats + streak) + Pro features (dedupe, bulk cleanup, notes, CSV, `.ics`).
6. Trial/entitlement seam + honest limits page.
7. Hardening: a11y, offline service worker, empty/error states, mobile, Lighthouse.

## Deliberately NOT building (and why — CORS/spec-cited in research/FEASIBILITY.md)
Full-text archive of arbitrary pages (publishers must opt into CORS; they don't) · cross-device sync ·
accounts/login · whole-library dead-link scanning (same CORS wall) · payments · AI summarisation
(keyed API banned; in-browser model ≈10 MB + ) · push notifications as a promise (Periodic Background
Sync is Chromium-only and engagement-gated; iOS notifications need a home-screen install ≥16.4) → we
ship an `.ics` reminder instead, which is honest · browser extension · native apps.

## Three claims I refuse to make
1. "Your saves are safe forever even if you never open the app" — Safari deletes script-created storage
   after 7 days of no interaction (MDN, cited). Mitigations (request `persist()`, install-to-home-screen,
   export reminders) reduce documented risk; they are not a guarantee.
2. "We'll notify you every morning" — impossible statically with the tab closed on Safari/Firefox.
3. "Paste any link and we keep a readable offline copy" — false; only user-supplied text can be stored.

## Success measures I will actually check
Import a ≥500-link real bookmarks file and run 14 deck cycles end-to-end in Chromium; keyboard-only
triage works; deck is deterministic per date; zero network requests after first load except same-origin;
Lighthouse (perf/a11y/bp) and mobile 360px screenshots reviewed by eye; live Pages URL loaded in
Chromium and verified against local build.
