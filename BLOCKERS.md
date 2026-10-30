# BLOCKERS.md — open problems, limits, and what is NOT verified

Anything here is a claim I could not prove with a tool call, or a defect I did not fix.

## Deploy-time findings (2026-10-27, all now resolved except where stated)

| What happened | Evidence | Status |
| --- | --- | --- |
| The fine-grained token in `~/.git-credentials` cannot create repositories | `POST /user/repos` → HTTP 403 `Resource not accessible by personal access token`; the same token gets 200 on `GET /user` | worked around with the classic PAT supplied in Phase 0 |
| `git push` over HTTPS is refused for every token available | classic PAT: `remote: Invalid username or token. Password authentication is not supported for Git operations`; fine-grained PAT on the new repo: `remote: Permission to Vansh1190/salvage-links.git denied` | worked around by publishing through the Git Data API (`scripts/publish-via-api.mjs`) |
| GitHub refused the **3rd** replayed commit's tree with a durable HTTP 404 across 9 escalating retries (2 s → 60 s) | log lines `POST /repos/…/git/trees -> HTTP 404, retry 1/9 … 9/9` | **OPEN DEVIATION:** `https://api.github.com/repos/Vansh1190/salvage-links/commits` reports **3 commits on remote `main`** — the first two per-slice commits plus one squashed commit holding the remaining 8 (local `git log` has 11). The later slice messages exist locally and in `LOG.md`; the squashed commit says so in its own body |
| First deploy was **broken while returning HTTP 200**: every file served as base64 text | live `index.html` body started `PCFkb2N0eXBlIGh0bWw+`; app never booted | fixed: `POST /git/blobs` now sends `encoding:"base64"`; re-verified in a browser |
| Workflows could not be committed in place | token lacks the `workflow` scope; GitHub rejects commits touching `.github/workflows/**` | **OPEN:** CI is not running. Valid YAML sits in `ci/` with a one-command `git mv` to enable it (`ci/README.md`) |

## Verified, and how

| Claim | Proof |
| --- | --- |
| 58 unit tests | `npx vitest run` → `Tests 58 passed (58)` |
| 18 browser tests, built site under a `/salvage-links/` base path | `npx playwright test` → `18 passed` |
| Live site works end to end | `node scripts/verify-live.mjs` → **15/15**, incl. "no third-party requests", "no console or page errors", offline reload, 390 px overflow 0 |
| Offline really comes from the service worker | test asserts `navigator.serviceWorker.controller` non-null **and** `transferSize === 0` on the offline reload, on the live origin |
| axe, populated library | `node scripts/verify.mjs` → 0 violations on all 7 routes, desktop and mobile |
| 10,000-link library is usable | same run: import 923 ms, triage 64 ms, pulse 98 ms, first search 419 ms → 16 ms cached, heap ~19–33 MB, IndexedDB 8.4 MB |
| Lighthouse, local build (desktop simulated) | 100 / 100 / 100 / 100 |
| Lighthouse, **live** URL (mobile simulated) | 98 / 100 / 100 / 100 — LCP 1.4 s, TBT 0 ms, CLS 0; `speed-index` 0.85 and `cache-insight` 0 are the only sub-0.9 audits |
| Nothing is collected | no request to any origin other than `vansh1190.github.io` in the live run |

## Design limits (deliberate, stated inside the product)

1. **The trial is soft.** A static site cannot enforce a clock; clearing site data resets it. The UI says so in Settings and `docs/PRO-TRIAL.md` repeats it.
2. **No article text.** CORS. A static page cannot fetch another origin's body without that origin's opt-in.
3. **No push notifications** with the tab closed (Periodic Background Sync is Chromium-only and engagement-gated; iOS needs a home-screen install ≥16.4). The `.ics` file is the honest substitute.
4. **No cross-device sync**, because that needs a server that stores user data.
5. **No dead-link scanning** of the whole library — it would mean handing users' URLs to a third-party proxy.
6. **Safari may evict the library after 7 days without a visit.** `persist()` + install + export reminders reduce documented risk; they are not a guarantee.

## UNVERIFIED

- **Safari and Firefox at all.** This sandbox has only Chromium (Chrome-for-Testing 156). Storage eviction, PWA install, notification support and `Intl.Segmenter` token differences are taken from MDN/WebKit documentation, never observed.
- **Real Firefox and Safari bookmark exports.** Verified against Chromium's own `bookmark_html_writer.cc` and hand-built dialects; I never downloaded an export from those browsers.
- **Retention and willingness to pay.** Nobody outside this sandbox has used it, and by design there is no analytics to measure it with. This is the central open question for the product, not a footnote.
- **Pages cache behaviour over time.** GitHub Pages sends `cache-control: max-age=600` for assets and I cannot set headers; the service worker owns freshness, which I verified for one reload cycle only.
- **The 40-day clock across a real 40 days.** I simulated day 41 by rewriting `firstRunAt` in IndexedDB in a browser test; I did not observe the passage of time.
- **Rate limits / abuse of the Actions-based curation scripts.** Not exercised.

## Still open (minor, accepted for v1)

- Search builds its index on the main thread: ~0.4 s for the first query after any change to a 10k library (measured). A worker would fix it.
- One library per browser; `libraryId` exists in the model but there is no multi-library UI.
- `main` is squashed (see above).
- CI does not run (see above).
- `docs/VERIFY.md` numbers move a few percent per run; they are measurements, not assertions.

### Added by the Phase 9 review

7. **The plan-trim and id-collision repairs are Chromium-observed only.** Both are exercised by
   browser tests against the built site and by `scripts/verify-live.mjs`, but only in Chromium.
   IndexedDB `getAll` ordering and `IDBTransaction.error` propagation are where engines differ,
   and both sit underneath these paths.

- **Lighthouse would like response headers we cannot set.** `cache-insight` (0 score) wants
  `Cache-Control` on hashed assets; GitHub Pages project sites cannot send it, so the cache token
  in the service-worker name is the workaround. Recorded, not fixed.

- **`render-blocking-insight`**: the single CSS file is ~8 kB and flagged anyway. Inlining it
  would fight the precache list in `sw.js`. Judged not worth it; the page scores 100 regardless.
