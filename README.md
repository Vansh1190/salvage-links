# Salvage — rescue the links you already saved

**Live: https://vansh1190.github.io/salvage-links/**

Verified in a real browser against the deployed URL: 15/15 checks, axe 0 violations on
all 7 routes with a populated library, Lighthouse 98/100/100/100. How it was checked and what
is still unverified: [`BLOCKERS.md`](BLOCKERS.md), [`FINAL-REPORT.md`](FINAL-REPORT.md).

You have thousands of saved links. You never open them again, and the service that held
them may die next year (Pocket did). Salvage deals you a **finite deck of your own forgotten
links each day**; you spend about 4 seconds on each — open, keep, not now, or toss — and the
pile visibly shrinks.

Everything runs in your browser. There is no account, no server, and no analytics. Your links
are stored in IndexedDB on this device and you can export them any time, on every plan, forever.

## Why it exists

Mined from 122 sourced pain points across Hacker News, open-source issue trackers, Reddit,
Stack Exchange and developer surveys ([`RESEARCH.md`](RESEARCH.md)). The shortlist reason:
resurfacing forgotten saves is the most-requested feature in five read-later ecosystems
(2016→2026), while Pocket and Omnivore users were simultaneously losing their libraries.

## Keyboard

| | |
| --- | --- |
| `O` | open the card in a new tab (it moves to your queue) |
| `K` | keep for reading |
| `S` | not now — comes back after the snooze window |
| `X` | toss it (it leaves the pile for good, and you can undo) |
| `U` | undo the last thing you did |
| `←` `→` | step through today's cut |
| `1`–`7` | jump between sections, `/` to search, `Esc` back to the deck |

## The 40-day trial

| Free, forever | Pro (40-day trial, then locked) |
| --- | --- |
| daily deck up to 5 cards, search, import, browsing your whole library, JSON export, bookmarks.html export | unlimited library, deck size up to 20, duplicate cleanup, bulk folder rename, notes, CSV export, `.ics` reminder |

It is a **soft trial and the app says so**: this is a static site, so clearing site data resets
the clock, and we deliberately do not fingerprint you to prevent that. Day 41 locks the Pro
toolset; browsing, the deck and every export stay free, so a lapsed trial can never hold a
library hostage. Billing would plug into exactly one function — `getEntitlement()` in
[`src/trial.ts`](src/trial.ts) — and nothing else needs to change.

## What it cannot do (and why)

- It cannot fetch the text of an arbitrary page for you. Publishers must opt in with CORS
  headers and they do not; GitHub Pages cannot fix that. So you read cards by opening them.
- It cannot promise you a morning push notification. Push needs a server and Periodic
  Background Sync is Chromium-only and engagement-gated. Settings offers a `.ics` reminder you own.
- It cannot guarantee your library survives forever on iOS Safari, which may clear
  script-created storage after 7 days without a visit. Install it, ask for persistent storage,
  and export monthly.
- It cannot sync between devices yet — that is the paid feature that would need a server.

The full list, in the app: press `7` or open **Limits**.

## Working on it

```bash
npm install
npx playwright install chromium   # dev-only, ~190 MB, never shipped
npm run dev                       # http://localhost:5175
npm test                          # 58 unit tests, no browser needed
npm run e2e                       # 18 browser tests (9 scenarios × desktop + mobile)
npm run build                     # gen + typecheck + vite build + service-worker precache injection
npm run lighthouse                # audits the built site under a /salvage-links/ base path
npm run audit                     # axe on all 7 routes populated, plus a 10,000-link stress run
npm run curate                    # rebuilds the demo library from URLs that answer 200 (network)
```

Stack: Vite + TypeScript, no framework, no runtime dependencies. `dist/` is about 17 kB of
gzip JavaScript and 2.6 kB of CSS.

## Verification

`docs/VERIFY.md` (axe + 10k-link stress numbers), `docs/SAMPLE-STATUS.md` (how the demo library
was health-checked), `docs/PRIVACY.md`, `docs/PRO-TRIAL.md`. Known gaps and unverified claims are
listed in [`BLOCKERS.md`](BLOCKERS.md) — read that before trusting my summaries.
