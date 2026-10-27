# DECISIONS.md

## D1 — Phase 0 defaults (user answered "1 ok 2 ok 3 ok 5 yes", then handed over full autonomy)
| Topic | Decision | Source |
|---|---|---|
| Repo / Pages | New repo, Pages enabled over the API by me. Original default name `dailyscale`. | user "1 ok" |
| Deploy target | `https://vansh1190.github.io/<repo>/` | verified pattern: existing repo homepage `https://vansh1190.github.io/three-hello-world/` |
| Excluded domains | none, except no medical/legal/financial advice; **not** a video tool | user "2 ok" |
| Budget / APIs | $0, no keyed third-party APIs, all compute client-side or in GitHub Actions | user "3 ok" |
| Local tooling | project-local npm deps **including Playwright's Chromium** for screenshots/Lighthouse | user "3 ok" |
| Approval gate | **none** — run to deployment autonomously, use sub-agents for every review | user answer 4 |
| Audience | developers primary, everyday people secondary | user "5 yes" |
| Trial | honest **soft** 40-day trial, client-side, labelled as soft | user "5 yes" |
| Free backend | GitHub Actions + Issues in the *same* repo allowed if needed | user "5 yes" |

## D2 — Deviation from the Phase-0 repo name (must stay visible)
Phase 0 named the repo `dailyscale` as a placeholder and the user approved "ok". The shipped
product is not about "daily scale", so I will **rename the same repo** to `salvage-links` before
deploy, keeping the account and the single authorised deploy target intact.
- Why: the Pages URL is user-facing; a brand that contradicts the URL reads as thrown-together.
- Safety check: rename is inside the one repo I was authorised to use, same account, no other
  repo touched, no force-push, no history rewrite. GitHub keeps a redirect from the old name.
- If the user prefers the literal Phase-0 name, `git remote set-url` + rename back is one command.
  Flagged again in FINAL-REPORT as an explicit deviation.

## D3 — Toolchain
- **Vanilla TypeScript + Vite, no UI framework.** Alternatives: React (heavier payload, more deps,
  slower first paint on the mobile connections this audience uses), Svelte (build-time magic, more
  moving parts to debug on Pages). Chosen because the payload must stay small and the offline story
  must be inspectable by hand.
- **No Chromium existed in the sandbox** — the `browser` tool failed verbatim: *"No CDP browser on
  127.0.0.1:9222 and no Chromium-based browser is installed on this machine."* Fix = Playwright's
  Chromium into the project's own `node_modules`/cache (approved in D1). This is a
  local dev-only dependency, never shipped.
- Tests: Vitest (unit, runs headless without a browser) + Playwright (DOM/e2e/screenshots, real
  IndexedDB + service worker).

## D4 — PRODUCT CHOICE: overturn the "knowledge archive & resurfacing" kill
CLUSTERS.md scored the cluster 24.0 but **KILLED it on feasibility (Fe=2)** because the obvious
version of it (sync, crawl-and-cache article bodies, search across devices) wants a server that
stores user data. Three findings overturned that kill:
1. `research/pocket-evidence.md`: resurfacing is the single most-begged feature across all five
   reader ecosystems, 2016→2026, and the drivers are *tool death* (Pocket confirmed at
   primary source) and *portability* (linkwarden#587, 57 reactions).
2. `research/FEASIBILITY.md`: a **reduced** version is honestly static — import a bookmarks HTML
   file, store in IndexedDB, rank locally, resurface a finite daily deck on open. No network needed
   for the core loop at all.
3. The hostile review (`research/` reviewer pass) proved that all four top-scoring clusters fail
   the *accumulation* test — "none of the four accumulates anything a human would be sad to lose,
   so the 40-day free trial is theater". A link library is the one thing in this corpus that
   genuinely accrues for years and that users watched vanish once already.
Decision: build the **narrow, honest static version** and publish the cut list (no auto article
text, no guaranteed push, no server sync) inside the product UI, not just in these files.

## D5 — What is deliberately NOT built (v1)
Full text capture of arbitrary pages (CORS: publishers must opt in — MDN-cited in FEASIBILITY.md);
cross-device sync; login/accounts of any kind; dead-link scanning of the whole library from the
browser (same CORS wall); payments; mobile native apps; AI summarisation (would need a keyed API or
a ~10 MB+ model download — see FEASIBILITY.md on @huggingface/transformers); team features;
link shortening; browser extension.

## D6 — Trial design (soft, and labelled that way in the UI)
40 days from first run, stored as a timestamp in IndexedDB (not localStorage: survives less well,
and IDB is where the library already lives). Day 41 ⇒ Pro features lock; **import, browse, search,
deck and every export path stay free forever** so a lapsed trial can never hold a library hostage.
Billing plugs into one function, `entitlement.getEntitlement()`, plus `pro-trial.md` notes.
Honesty requirement printed in Settings: clearing site data resets the trial; we do not fingerprint
you, so we cannot prevent it.

## D7 — Sub-agent policy (user instruction, answer 4)
Every phase gets at least one independent hostile reviewer pass whose only brief is to find
problems, and its findings are recorded even when it finds none. Research fan-out, URL auditing,
feasibility probing, spec attack, code review, and deploy verification each got/bget their own
agent rather than self-grading.
