# STATE.md — read me first after a restart

**Phase:** 2 SELECT done → 3 PROTOTYPE in progress
**Updated:** 2026-10-27

## What exists
- `/root/workspace-agent-server/dailyscale` (git repo, no remote yet).
- Memory files: `STATE.md DECISIONS.md RESEARCH.md SPEC.md BLOCKERS.md LOG.md`.
- `research/`: hn.md(23) github.md(18) reddit.md(20) stackexchange.md(21) web.md(40) = **122 pain points, 5 source types**;
  CLUSTERS.md (12 clusters, weighted); AUDIT.md (47 URLs re-opened: 40 pass, 7 blocked, 0 fabricated);
  FEASIBILITY.md (static-hosting truth, MDN/npm-cited); pocket-evidence.md (24 GitHub issues + HN threads).

## The product (SPEC.md)
Salvage — local-first bookmark-graveyard rescue. Daily finite deck of your own old links, 3-second triage
(open/keep/snooze/toss), queue, weekly pulse, IndexedDB only, no account, no upload. 40-day soft Pro trial.
Repo will be renamed `dailyscale` → `salvage-links` before deploy (DECISIONS D2, deliberate deviation).

## How to resume
```
cd /root/workspace-agent-server/dailyscale
npm run dev      # vite
npm test         # vitest (pure logic, no browser)
npm run e2e      # playwright (needs ./node_modules/.bin/playwright install chromium)
```
Deploy = build to `dist/`, push to `main`, enable Pages via API (see LOG.md for the exact curl).

## Next actions, in order
1. Scaffold Vite+TS, Playwright Chromium install (dev-only), vitest wired.
2. Slice 1 data layer (IDB + bookmarks parser + dedupe key) with tests → commit.
3. Slice 2 deck + resurfacer pure fn + tests → commit → **Chromium screenshots at 1280px and 360px**.
4. Slices 3-6 per SPEC.
5. Phase 5 hardening (a11y, offline SW, empty/error states, Lighthouse).
6. Phase 6 hostile review pass by sub-agents; fix; re-test.
7. Phase 7 rename repo + push + enable Pages + verify live URL in Chromium.
8. FINAL-REPORT.md.

## Open risks right now
- Playwright Chromium download not yet proven to work in this sandbox (Phase 0 `browser` tool failed: no browser installed).
- Safari 7-day storage eviction is a real product risk, mitigated but not solved (research/FEASIBILITY.md).
- No analytics ⇒ retention claims are inference, not measurement.
