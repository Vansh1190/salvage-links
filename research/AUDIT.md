# AUDIT.md — adversarial verification of research/*.md (pass 1)

Auditor: independent sub-agent. Date: 2026-10-27. Method: every sampled URL actually re-fetched
(HN via `hn.algolia.com/api/v1/items`, GitHub via `api.github.com` with token from `/root/.git-credentials`,
Stack Exchange via `api.stackexchange.com/2.3`, everything else via `curl -L -A "Mozilla/5.0"`).
Nothing here is taken on trust from the files' own claims.

## 0. Headline finding BEFORE any URL check

**The operator-facing claim of "~120 pain points each" is FALSE.** Actual numbered table rows:

| file | claimed | actual rows |
|---|---|---|
| hn.md | ~120 | **23** |
| github.md | ~120 | **18** |
| reddit.md | ~120 | **20** |
| stackexchange.md | ~120 | **21** |
| web.md | ~120 | **40** |
| **total** | ~600 | **122** |

122 rows exist across ALL five files combined — i.e. "~120" is the total, not per file. Whoever
summarised these files upward by 5x lied; the files themselves are not the liars, but nobody should
quote "600 pain points" anywhere.

## 1. Sampling method

Extracted every `http(s)` URL per file in document order (`grep -oE`). Counts (occurrences):
hn 23, github 23, reddit 20, stackexchange 23, web 71 → 160 total.
Deterministic sample: every Nth URL per file, N = round(occurrences/7..8) — hn/github/SE: N=3,
web: N=6, reddit: N=3 — with a different start offset per file (hn start 1, github start 2,
reddit start 2, stackexchange start 2, web start 1), plus the final URL of each file forced in to
cover the tail. **Sample size: 47** (hn 9, github 9, reddit 7, stackexchange 9, web 13).
Additionally (~45 non-sample bonus checks) were run against rows the sample missed — reported in §3.

## 2. Sampled-URL verification table

Status codes are live observations on 2026-10-27. "Match" = title + every numeric claim in the row
compared against the API/page response.

### hn.md (9 sampled)

| # | URL | Result | Verdict |
|---|---|---|---|
| 1 | news.ycombinator.com/item?id=31471127 (row 1) | Algolia 200; "Ask HN: How can I stop my inbox/wishlist/bookmarks/tabs/todos from growing?" pts 190, 2022-05-22 — exact | PASS |
| 4 | item?id=29239587 (rows 4,5) | "I hate password rules" 564, 2021-11-16 — exact | PASS |
| 7 | hn.algolia.com/api/v1/search?query=invoice... (row 7) | 200, 5,163 hits; cited item 31663682 "Google will not let me pay an invoice they sent me" 88, 2022-06-08 verified via items API — exact | PASS (WEAK: listing URL, thread not opened — self-declared) |
| 10 | item?id=32436316 (row 10) | "Ask HN: How do you work with Dependabot?" 43, 2022-08-12 — exact | PASS |
| 13 | item?id=31217300 (rows 12,13) | "Ask HN: What small library or tool do you want that doesn't exist?" 69, 2022-04-30 — exact | PASS |
| 16 | search?query=clipboard (row 16) | 200; cited 26377849 verified: title exact, 7 pts, 2021-03-07 | PASS (WEAK: listing) |
| 19 | search?query=screen%20recording (row 19) | cited 29727940 verified incl. the file's own typo "seemless" preserved in real title | PASS (WEAK: listing) |
| 22 | search?query=I%20hate (row 22) | 200; cited 31813957 "I fucking hate Jira" 971, 2022-06-20 — exact | PASS (WEAK: listing) |
| 23 | search?query=how%20do%20you%20keep%20track (row 23, tail) | cited 34448353 verified: 44, 2023-01-20 — exact | PASS (WEAK: listing) |

### github.md (9 sampled)

| # | URL | Result | Verdict |
|---|---|---|---|
| 2 | github.com/react/create-react-app/issues/5316 (row 2) | API: "Service Worker weird caching", R25/C71, 2018-10-05, open, labels `tag: documentation,issue: question > PWA` — every field exact | PASS (flag: URL uses legacy owner `react/`, table says `facebook/`) |
| 5 | aws/aws-cdk/issues/21181 (row 5) | "Events: cannot specify timezone for Schedule cron" R46/C20, 2022-07-16, labels `p1,feature-request,...effort/small` — exact | PASS |
| 8 | helix-editor/helix/issues/5132 (row 8) | "In-editor resolution of merge conflicts" R86/C9, 2022-12-12 — exact | PASS |
| 11 | prisma/orm/issues/5051 (row 10) | "Improve Timezone Support..." R105/C135, 2020-06-20, open — exact (note: it DOES have milestone `2.24.0`; row doesn't claim otherwise) | PASS |
| 14 | jqlang/jq/issues/467 (row 13) | "support yaml input/output in addition to json" R365/C65, 2014-07-07; milestone literally **"The far future, part deux"** as claimed | PASS |
| 17 | vitejs/vite/issues/2830 (row 16) | "CSS sourcemaps" R116/C27, 2021-04-02, labels match — exact | PASS |
| 19 | OpenCut-app/OpenCut/issues/333 (row 18) | "[FEATURE] Official Docker Image" R8/C0, 2025-07-17 — exact (thin evidence, honestly flagged in row) | PASS |
| 20 | docs.github.com/rest/search/... | 200 — but this is a documentation URL quoted in the anomaly log, NOT row evidence | PASS (non-evidence, sampling contamination) |
| 23 | github.com/prisma/orm/issues/5051 (tail) | identical to #11 | PASS + **duplicate-URL flag** |

### reddit.md (7 sampled)

| # | URL | Result | Verdict |
|---|---|---|---|
| 2 | r/webdev/comments/1wz8has/... | Direct page: HTTP **200 but an 8.5 KB JS shell** (`<title>Reddit</title>`, zero post content); `.json` → **403**. Content verified instead via live `r/webdev/top/.rss?t=month`: post present, title exact ("What is your most used "hack" on day-to-day websites?"), body text "Bank websites are the worst" present | BLOCKED (page) / VERIFIED (feed) |
| 5 | 1wyp7zs (performance) | same; title exact incl. author's typo "sweatting" which the file's quote preserves | BLOCKED / VERIFIED (feed) |
| 8 | 1x8bqrp (AI fatigue) | same; title exact | BLOCKED / VERIFIED (feed) |
| 11 | 1xg35l4 (PHP legacy) | same; title exact | BLOCKED / VERIFIED (feed) |
| 14 | 1x4m79m (interviews) | same; title exact | BLOCKED / VERIFIED (feed) |
| 17 | r/LocalLLaMA 1ws67x4 (GPT-3) | feed initially **429**, 200 after 90 s backoff; post present, title matches | BLOCKED→feed VERIFIED |
| 20 | r/LocalLLaMA 1xdh57e (inference engine) | present in same feed, title matches | BLOCKED→feed VERIFIED |

Every "upvotes/ratio" cell is `UNVERIFIED` — by the file's own admission, and I could not verify a
single one either. All recurrence multipliers ("cookie 7×", "Railway 21×", "VRAM 15×", "portfolio 6×")
are self-reported greps of raw XML. I confirmed the XML artifacts exist on disk (`/tmp/cora/reddit/`:
113,481 B webdev + 146,512 B LocalLLaMA feeds, `429` code files matching the file's 12-call log,
probe.html exactly **166,458 B** = the byte count claimed in row 1 of its method table).

### stackexchange.md (9 sampled)

Verified via live `api.stackexchange.com/2.3/questions/{ids}` — not just HTTP status:

| # | URL | Claimed → Observed | Verdict |
|---|---|---|---|
| 2 | so/q/927358 | 16,812,054 views / 105 ans / 27246 score → 16,812,063 / 105 / 27246, 2009-05-29, title exact | PASS (+9 views natural drift) |
| 5 | superuser/q/707767 | 1,082,447 / 8 / 488 → 1,082,448 / 8 / 488 | PASS |
| 8 | unix/q/13751 | 228,176 / 2 / 283 → identical | PASS |
| 11 | so/q/1871524 | 1,004,569 / 26 / 332 → identical | PASS |
| 14 | superuser/q/1606213 | 369,473 / 15 / 185 → 369,476 / 15 / 185 | PASS |
| 17 | serverfault/q/279984 | 481,217 / 8 → 481,218 / 8 | PASS |
| 20 | android/q/17382 | 84,719 / 3 → identical | PASS |
| 22 | academia/q/20358 | 42,572 / 5 → identical | PASS |
| 23 | api probe `?filter=!nNPvSNdWme` (non-row, disclosed anomaly) | claimed HTTP 400 → observed **400** | PASS (non-evidence) |

### web.md (13 sampled)

| # | URL | Result | Verdict |
|---|---|---|---|
| 1 | survey.stackoverflow.co/2026/ (row 1) | 200; "30,903" present on page | PASS (WEAK: one homepage-style URL backs 8 rows / ~20 stats) |
| 7 | survey.stackoverflow.co/2026/ (row 7) | 200; row's figures "10,304", "77.3%" present in fetched HTML | PASS (WEAK: duplicate URL) |
| 13 | 2024.stateofjs.com/en-US/usage/ (row 13) | 200; "Code Architecture" present | PASS |
| 19 | overreacted.io/npm-audit-broken-by-design/ (row 19) | 200; "false positive" present | PASS |
| 25 | smashingmagazine.com/categories/usability/ (row 25) | 200; "Toxboe" present | PASS (WEAK: **category listing page**, not the article) |
| 31 | discuss.python.org/t/pep-851-add-list-discard/109701 (row 31) | 200; topic real, "discard" present | PASS |
| 37 | lobste.rs/top/year (row 36) | 200 but page renders "Top Stories of the Past **Week**" — URL says `year` | PASS (WEAK + mislabeled window; file self-admits) |
| 43 | javascriptweekly.com/latest (cross-cutting) | 200; "Sentry" quote present | PASS |
| 49 | dev.to/api/articles/top?period=year... (dead-end claim) | claimed 404 → observed **404** | PASS (non-row, claim accurate) |
| 55 | jvns.ca/blog/ (dead-end claim) | claimed 404 → observed **404** | PASS (non-row, claim accurate) |
| 61 | hashnode.com/ (disclosed "product mock") | 200; "1.3M" string present | PASS (WEAK: homepage, self-disclosed as non-evidence) |
| 67 | news.ycombinator.com/best (non-row note) | 200 as claimed | PASS (non-evidence) |
| 71 | github.com/orgs/community/discussions (listed "not attempted") | 200; consistent with never being used | PASS (non-evidence) |

## 3. Bonus coverage beyond the sample (all consistent)

- **All 10 HN "opened" item IDs** (incl. un-sampled 34111127/32505314/45537958/30764757/34225669): titles/points/dates exact.
- **14 HN corroborating IDs from "why it recurs" columns** (26872904, 16166645, 47713839, 48184635, 46614558, 46719363, 45997568, 44533982, 35274519, 22105561, 34176035, 18401481, 31663682, 31813957): ALL resolve, points/dates exact to the digit — including the 2026-dated ones (they are real, today is 2026-10-27).
- **Verbatim comment quotes** re-extracted from full thread JSONs: 9/9 found character-for-character ("10,000 items in Pocket", "instapaper bankruptcy", "disable the ability to paste", "developer console and manually set the field", "raising multiple PRs... rollups", "just noise", "harder than clicking", "regulated industry like banking", "wistfully imagining").
- **All 21 stackexchange row questions** (not just sampled ones) API-verified: zero contradictions; max drift +9 views.
- **4 URL-less github corroborations** (golang/go#32485 R49/C10, rust-lang/rust#64650 R32/C9, OpenCut#745 R8/C0, k9s#1017 R45/C27): all exact — these have NO URL in the file, only `repo#num`, and still checked out.
- **github.md "Cross-checks" aggregate counts**: CORS 15,626→15,625, timezone 14,990→14,985, "merge conflict" 11,846→11,846, semver 4,174→4,174. Micro-drift = real fetch today, not recalled.
- **Raw artifacts**: /tmp/cora/se/*.json, /tmp/cora/web/*.html (61 files), /tmp/cora/reddit/* exist and match the files' method claims.

## 4. Problems found (blunt)

1. **The "~120 per file" claim is fabricated/upstream inflation: real total is 122 rows across all five files** (23/18/20/21/40). This is the only outright-lie-grade discrepancy found, and it's in the summary, not the sources.
2. **reddit.md engagement is 100% unverified**: no upvote number in any of its 20 rows can be checked (RSS carries none), direct post pages are JS shells / .json 403 from datacenter IPs, and all recurrence counts (7×, 21×, 15×, 6×) are self-reported greps whose inputs I could only partially reproduce. Coverage is 2 of 18 subs, which the file honestly screams about — but its "scores" column must never be quoted as data.
3. **hn.md's URL column header — "URL (real, opened by you)" — is false for 10 of its 23 rows** (43%). Those rows cite `hn.algolia.com/api/v1/search?...` *listing queries*, and the rows themselves say "thread not opened". Self-disclosed via the legend, but the column header still overstates. Every such URL resolves and every cited item ID verifies, so this is a labeling violation, not fabrication.
4. **web.md evidence concentration**: one URL (`survey.stackoverflow.co/2026/`, a root/hub page) props up 8 rows and ~20 statistics; rows 24–25 cite a *category listing page* instead of the articles; row 36 cites `lobste.rs/top/year` which demonstrably renders "Past Week"; 3 rows share one State of CSS page; 2 rows share one 2000 Joel Spolsky post. Rows are NOT independent sources — treat those blocks as 1 source each, not 8.
5. **Orphan artifacts contradict web.md's completeness**: `/tmp/cora/web/` contains `blog.luitjes.it_posts_i-want-my-wednesday-back_.html` and `survey...2025_work_.html` — fetched pages cited NOWHERE in web.md. Rows were silently dropped (or lost) after fetching; "every quote below came from something I retrieved" is true, but "everything I retrieved is represented" is false.
6. **github.md sloppiness**: row 2 URL uses retired owner `react/create-react-app` while the table names `facebook/...` (redirects, but a lazy reader gets 404-ish confusion); ~15 corroborating references carry `repo#num` but no URL (all 4 I spot-checked were accurate); self-declared ~70 requests vs its own ~50 budget.
7. **Duplicate URLs within files**: hn.md: 29239587 (rows 4,5), 31217300 (rows 12,13), 46345827 (rows 17,18), keep-track search query twice; github.md: prisma URL twice; web.md: survey2026 ×8, stateofcss ×3, joel ×2, smashing ×2, lobsters ×2, bytebytego ×2, hashnode ×2. Cross-file: none (clean).
8. **Invented-looking numbers: NOT found — the opposite.** Every checked figure is non-round and bit-exact against live APIs (R1729/C161, R365/C65, 27246 score, 228,176 views, verbatim milestone strings). These were fetched, not recalled. Reddit row 1 even preserves two source typos ("from163 companies", "sweatting") that I independently confirmed in the live feed — hard to fake by accident.
9. **No statistic-with-no-source at all was found** — the worst case is URL-less-but-resolvable `repo#num` / HN item ID citations, which all verified when I resolved them by hand.

## 5. Per-file credibility grades

| file | grade | justification |
|---|---|---|
| github.md | **A** | 100% of sampled rows bit-exact (titles, R/C counts, dates, labels, milestone strings); aggregates reproduce within live drift; deductions: legacy-owner URL in row 2, URL-less corroborations, self-admitted request-budget overrun. |
| stackexchange.md | **A** | all 21 rows API-verified this audit; view/answer/score/date match to single units; truncations and empty-set anomalies disclosed accurately (400 probe reproduced exactly). Cleanest file. |
| hn.md | **B** | every opened item and 14 corroborating IDs exact; 9/9 verbatim quotes genuinely in thread JSON; but 43% of rows are listing-backed "UNVERIFIED(quote)" under a column header that claims opened URLs. Content trustworthy, framing dishonest-by-label. |
| web.md | **B−** | 100% of sampled URLs resolve and contain the quoted strings; but severe same-URL concentration (8 rows / 1 hub URL), category-page citations, one mislabeled listing (`top/year` = weekly), and dropped rows contradicted by its own /tmp artifacts. |
| reddit.md | **C** | existence, titles and quoted text all independently confirmed via live feeds (file is truthful); but zero verifiable engagement numbers, 2/18 subs covered, and every "recurrence" multiplier rests on raw files only partially re-checkable. Its rows are hypotheses with real anchors, not measurements. |

## 6. Pass rate

Sampled URLs: **47**.
- PASS (resolved AND content consistent with the row): **40**
- PASS after feed-level verification (reddit: page BLOCKED at 200-shell/403, content verified via live .rss): **7**
- FAIL (dead link, wrong content, contradiction): **0**

**Strict page-level pass: 40/47 = 85.1%. Full-coverage pass (any live endpoint): 47/47 = 100%.**
Bonus non-sample checks (~45): 0 contradictions.

## 7. Bottom line

The URLs are real; the numbers were fetched, not remembered. What is NOT trustworthy: (1) the "~120 each" summary, (2) every Reddit upvote/recurrence figure, (3) the independence of web.md rows that share one survey page, (4) hn.md's "opened by you" header for 10 listing-backed rows. Fix the labels, re-fetch Reddit scores via `by_id` JSON from a residential IP, and never let a downstream doc multiply 122 into 600.
