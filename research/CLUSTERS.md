# CLUSTERS.md — clustering + scoring of ~120 mined pain points

Inputs: `hn.md` (23 rows), `github.md` (18 rows), `stackexchange.md` (21 rows), `reddit.md` (20 rows), `web.md` (40 rows) = **122 pain points**.
Every row gets exactly one primary cluster (a few appear a second time, marked "dup", where the evidence genuinely spans two jobs); the rest are handled in KILLED or flagged as meta-evidence. Full row→cluster map at the bottom. Every URL below is **copied verbatim from its source file** — where a source printed only a short reference (e.g. ``rust-lang/rust#64650``), that short reference is reproduced, not a synthesized link.

**Constraints applied to every score:** static GitHub Pages only (no paid APIs, no keys, no server storing user data); free GitHub Actions allowed; devs primary, everyday people secondary; no video-generation product.

**TOTAL = freq×1.5 + sev×1.0 + aud×1.0 + feas×1.5 + habit×1.5.**

Self-imposed scoring rules (so numbers aren't vibes):
- **Cross-source corroboration is the primary frequency evidence.** Clusters on ≤2 source files are capped at FREQUENCY ≤ 4 and flagged **THIN SOURCE BASE**. Single-source clusters are marked ⚠.
- **FEASIBILITY is a kill switch.** Credentialed scraping, third-party auth, server-side secret storage, arbitrary cross-origin fetch of the modern web, or local disk/process access ⇒ 1–2 regardless of demand.
- **HABIT graded harshly.** "Useful whenever it hurts" = 3 max; weekly cadence or daily re-ask = 4; nothing in this corpus honestly earns 5.
- **Source caveats respected:** `reddit.md` = 1 month × 2 of 18 subreddits (its own note: recurrence beyond that is not established); `github.md` discussions sampled, not ranked (UNVERIFIED coverage); several `hn.md`/`web.md` rows are UNVERIFIED(quote) → demand counts only, no quote-level severity claims.

---

## Ranking

| Rank | Cluster | Srcs | F | S | A | Fe | H | TOTAL | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | C08 Local document & media lab | 3 | 4 | 4 | 5 | 4 | 4 | **27.0** | TOP-4 |
| 2 | C01 Convert & inspect workbench | 5 | 5 | 3 | 4 | 5 | 3 | **26.5** | TOP-4 |
| 2 | C02 Cron / timezone / date | 4 | 4 | 4 | 3 | 5 | 4 | **26.5** | TOP-4 |
| 4 | C03 Error decoder + dependency semantics | 4 | 4 | 4 | 4 | 4 | 4 | **26.0** | TOP-4 |
| 5 | C05 Merge conflicts & git reversibility | 3 | 4 | 4 | 4 | 3 | 4 | **24.5** | alive, first alternate |
| 6 | C04 Page truth | 4 | 4 | 4 | 5 | 3 | 3 | **24.0** | alive, second alternate |
| 6 | C06 Knowledge archive & resurfacing | 2 (thin) | 4 | 4 | 5 | 2 | 4 | **24.0** | **KILLED (K1)** |
| 8 | C09 Ecosystem noise & stale cache | 4 | 4 | 3 | 3 | 3 | 3 | **21.0** | alive, weak |
| 9 | C07 Life-admin & work-money | 3 | 4 | 3 | 5 | 2 | 2 | **20.0** | **KILLED (K2)** |
| 9 | C10 Local-LLM fit calculator | 1 (single) | 4 | 3 | 2 | 4 | 2 | **20.0** | mostly **KILLED (K4)** |
| 11 | C12 Physical gauge monitoring | 1 | 2 | 3 | 2 | 1 | 4 | **15.5** | **KILLED (K3)** |
| 12 | C11 Citation upkeep | 1 (single) | 2 | 2 | 3 | 2 | 2 | **14.0** | **KILLED (K6)** |

*Ties broken by cross-source breadth (C01 spans 5 sources vs C08's 3; C04 has 4 sources vs C06's thin 2). Recomputation note: a first draft of this file mis-added 9 of 12 totals; every line now reads total = 1.5F + S + A + 1.5Fe + 1.5H and the sums have been machine-verified.*

---

## C01 — CONVERT & INSPECT WORKBENCH (encodings, JSON/YAML/CSV, regex, semver math, browser support, small-tool trivia) — **26.5**

**Sources: 5 of 5 — the only cluster with full cross-source coverage.** Scale quotes are `github.md`'s own API counts: `utf-8 in:title` 15,980 open issues · `"confusing error" in:title` 2,752 · `"unhelpful error" in:title` 1,184.

| Pain | Source | URL / reference (verbatim from source) |
|---|---|---|
| base64 / URL / HTML-entity / hex / hash conversions need a REPL or a shady site | github.md #12 | https://github.com/zed-industries/zed/issues/14172 (row also cites ``derailed/k9s#1017`` and ``typora/typora-issues#88`` as short refs) |
| JSON⇄YAML refused by jq maintainer; milestone literally "The far future, part deux" | github.md #13 | https://github.com/jqlang/jq/issues/467 |
| Trailing-slash / URL-canonicalisation differs per framework, breaks SEO + OAuth ("here we go again") | github.md #14 | https://github.com/nuxt/nuxt/issues/15462 |
| Configs can't extend/merge → teams copy-paste and lose track of which layer wins (R1729, 10 yrs "Backlog") | github.md #15 | https://github.com/microsoft/vscode/issues/15909 |
| WCAG contrast pass/fail math distrusted → re-checked by hand | github.md #11 | https://github.com/w3c/wcag3/issues/192 |
| Unix timestamp ↔ human date = daily micro-friction, "simpler to go to an online tool than use time(1)" | hn.md #12 | https://news.ycombinator.com/item?id=31217300 |
| Regex write-only; `$` ≠ end-of-string; 400–600-pt repeats 2013→2024 | hn.md #20 | https://hn.algolia.com/api/v1/search?query=regex&tags=story&numericFilters=points%3E150 |
| JSON → CSV flattening re-implemented per project (1,004,569 views) | stackexchange.md #10 | https://stackoverflow.com/questions/1871524/how-can-i-convert-json-to-csv |
| bytes↔string / UnicodeDecodeError churn (5.4M + 3.0M + 2.0M views) | stackexchange.md #11 | https://stackoverflow.com/questions/606191/convert-bytes-to-a-string-in-python-3 |
| Clipboard history absent/capped/unsearchable (422,215 views) — inspect-side | stackexchange.md #6 | https://superuser.com/questions/17200/how-do-i-view-my-clipboard-history-on-os-x |
| Shell path/split/exists primitives rewritten every time (3.9M views) | stackexchange.md #12 | https://stackoverflow.com/questions/59895/how-do-i-get-the-directory-where-a-bash-script-is-located-from-within-the-script |
| "Tool/shortcut discovered embarrassingly late" ×2 threads in 20 days → indexable cheatsheet niche | reddit.md #12 | https://www.reddit.com/r/webdev/comments/1xccokx/what_is_a_tool_shortcut_or_feature_you_discovered/ |
| robots.txt for AI crawlers is guesswork; owners re-derive the same blocklist from blog posts (no canonical source) | reddit.md #13 | https://www.reddit.com/r/webdev/comments/1xavzcl/how_to_configure_robotstxt_for_modern_crawlers/ |
| GGUF header / tokenizer inspection "inside html" is "endless debug hell" | reddit.md #20 | https://www.reddit.com/r/LocalLLaMA/comments/1xdh57e/vibecoding_your_own_inference_engine_is_easy_they/ |
| JS pain #3 = managing dependencies, #7 = date management (14,015 respondents) | web.md #13 | https://2024.stateofjs.com/en-US/usage/ |
| 85% average of browser JS needs a build step | web.md #14 | https://2024.stateofjs.com/en-US/usage/ |
| Browser support = eternal CSS pain; known-good features you still can't ship; `position: sticky` (9,704 devs) | web.md #16, #17, #18 | https://2024.stateofcss.com/en-US/usage/ |
| Same console error copy-pasted across Angular/Bootstrap/Ionic/phpMyAdmin, every top fix wrong | web.md #26 | https://css-tricks.com/blocked-aria-hidden-fix/ |

- FREQUENCY **5** — 5/5 sources; multi-million-view canonical questions; 4–12-year-old open issues.
- SEVERITY **3** — minutes-to-hours per incident; death by a thousand cuts, no catastrophe (that's C05/C08's job).
- AUDIENCE **4** — every dev daily; JSON⇄CSV/base64/regex also pull analysts, writers, power users. Not "everyone".
- FEASIBILITY **5** — the canonical static fit: input is text the user already holds, nothing leaves the browser, WASM covers hashing/decoding, Actions regenerate lookup data (baselines, fixtures) on a schedule.
- HABIT **3** — per-task with genuinely daily members (timestamps), but brutally commoditized by Google; retention must come from shareable permalinks + correctness, not novelty.

**TOTAL = 5×1.5 + 3 + 4 + 5×1.5 + 3×1.5 = 7.5 + 3 + 4 + 7.5 + 4.5 = 26.5**

---

## C02 — CRON / TIMEZONE / DATE-TIME PAIN (schedules that lie, clocks that drift) — **26.5**

**Sources: 4 of 5.** `github.md` API counts: `cron in:title` → **19,399** open issues; `timezone in:title` → **14,990**.

| Pain | Source | URL (verbatim) |
|---|---|---|
| CDK: can't give a cron Schedule a timezone; DST silently shifts jobs; "effort/small", 4 yrs unshipped; console supports local TZ, SDK doesn't | github.md #5 | https://github.com/aws/aws-cdk/issues/21181 |
| Azure cron UTC-only → users maintain *extra cron jobs twice a year* just to rewrite cron strings | github.md #6 | https://github.com/microsoft/azure-container-apps/issues/1109 |
| ORM writes UTC into DATETIME while OS/DB are KST — "nobody can tell which layer lied" (R105/**C135**, open 6 yrs, a class of 14,990 issues) | github.md #10 | https://github.com/prisma/orm/issues/5051 |
| AWS Cron vs Linux Cron under DST | hn.md #13 | (hn.md #13 prints only the bare item id ``24979656`` in its "why it recurs" cell — no full URL given there) |
| Human date-range / timezone-name parsing ("today 17:00 Pacific in UTC") has no parser | hn.md #13 | https://news.ycombinator.com/item?id=31217300 |
| "How can I change the timestamp on a file?" (303,589 views) — mtime repair after sync/photo migration | stackexchange.md #18 | https://superuser.com/questions/292630/how-can-i-change-the-timestamp-on-a-file |
| "Date Management" = #7 JS pain (dup of C01 row) | web.md #13 | https://2024.stateofjs.com/en-US/usage/ |

- FREQUENCY **4** — 4/5 sources + the two largest open-issue title counts in the corpus; capped (not 5) because no everyday-person row exists.
- SEVERITY **4** — production incidents, corrupted rows, jobs firing at the wrong local hour for half the year; hours per triage.
- AUDIENCE **3** — every backend/infra/devops dev; ordinary humans only when scheduling across zones.
- FEASIBILITY **5** — pure `Intl`/JS math: expand any cron for any IANA zone over 12 months, show DST skips/repeats, compare UTC vs local vs zone-name. Zero server.
- HABIT **4** — every new scheduled job + the twice-yearly DST cliff (users literally pre-schedule cron rewrites for it, per github.md #6); the permalink is the natural PR-description proof artifact.

**TOTAL = 4×1.5 + 4 + 3 + 5×1.5 + 4×1.5 = 6 + 4 + 3 + 7.5 + 6 = 26.5**

---

## C03 — ERROR DECODER + DEPENDENCY/VERSION SEMANTICS (messages that don't explain themselves) — **26.0**

**Sources: 4 of 5.** `github.md` counts: `"confusing error"` 2,752 · `"unhelpful error"` 1,184 · `semver` 4,174 · `ERESOLVE` 165 open issues.

| Pain | Source | URL / reference (verbatim) |
|---|---|---|
| npm `ERESOLVE` unreadable; the recommended flag (`--legacy-peer-deps`) is itself wrong; untriaged 9 months | github.md #3 | https://github.com/npm/cli/issues/8059 |
| Semver ranges under-specified; devs "test by running installs" because nothing shows what a range resolves to (R128; dup of C01) | github.md #4 | https://github.com/nodejs/corepack/issues/95 |
| `Cannot read properties of undefined (reading 'inTable')` — reporter bisected plugin majors by hand (R49/C37) | github.md #9 | https://github.com/hashicorp/next-mdx-remote/issues/403 (row also cites short refs ``rust-lang/rust#64650``, ``pallets-eco/flask-jwt#66``) |
| 348-comment "check your credentials" thread with zero request-level diagnostics; auth/signature errors with nothing to replay | github.md #17 | https://github.com/home-assistant/core/issues/147122 (row also cites short refs ``home-assistant/core#178266``, ``#176836``) |
| Upgrade dread: "is my exact version stack still supported / what breaks" — no trustworthy answer (PHP 8.2 upgrade took a day) | reddit.md #11 | https://www.reddit.com/r/webdev/comments/1xg35l4/after_years_of_living_in_legacy_hell_we_finally/ |
| Same-month patch-day panic: critical PHP security release, both vulns "rated 9.2 on the CVSS v4.0 scale" (reddit.md prints only the in-file id for this sibling thread) | reddit.md #11 | (in-file short reference: ``1xb72td``) |
| Certificate/dependency security scares swamp a whole ecosystem at once — 167,515 views in 7 days | web.md #32 | https://discuss.python.org/t/information-for-python-users-regarding-emudhra-emsign-ca-certificate-security-incident/109576 |
| 77.3% of devs write small scripts/automations, re-implementing constantly (n=13,338) | web.md #6 | https://survey.stackoverflow.co/2026/ |
| venv discovery still needs a PEP (211 posts / 14,866 views) | web.md #30 | https://discuss.python.org/raw/106998 |
| `list.discard()` re-requested a year apart — "why isn't this in the stdlib" per developer per week | web.md #31 | https://discuss.python.org/t/pep-851-add-list-discard/109701 |

- FREQUENCY **4** — 4/5 sources; errors arrive unprompted many times a day; thousands of open issues prove non-resolution.
- SEVERITY **4** — the corpus's best hours-lost documentation: days-long upgrades, hand-bisected majors, 348-comment threads where nobody can say what's wrong.
- AUDIENCE **4** — every dev in every ecosystem; secondary: home-lab/power users stuck on opaque auth errors.
- FEASIBILITY **4** — client-side pattern DB (curated YAML → compiled JS, Actions-refreshed) + in-browser lockfile parsing is clean; skeptical hold-back: coverage is forever partial and the credentialed-cloud class (github.md #17) can *never* be diagnosed from a static page — only templated into a better bug report.
- HABIT **4** — the most reliable daily trigger that exists; loop = "paste → decoded permalink → paste that into the issue/chat".

**TOTAL = 4×1.5 + 4 + 4 + 4×1.5 + 4×1.5 = 6 + 4 + 4 + 6 + 6 = 26.0**

---

## C04 — PAGE TRUTH (trackers, paste-blocking, perf, accessibility, broken web clients, links & printing) — **24.0**

**Sources: 4 of 5.**

| Pain | Source | URL (verbatim) |
|---|---|---|
| One AP News story → **618 cookies from 163 companies**; "cookie" 7× in one month of r/webdev top-50 | reddit.md #1 | https://www.reddit.com/r/webdev/comments/1x1pewj/we_read_one_ap_news_story_and_our_browser_ended/ |
| Un-pastable fields, "bank websites are the worst"; non-devs hand-rolling DevTools tricks | reddit.md #2 | https://www.reddit.com/r/webdev/comments/1wz8has/what_is_your_most_used_hack_on_daytoday_websites/ |
| Password forms block paste → users deliberately weaken passwords | hn.md #4 | https://news.ycombinator.com/item?id=29239587 |
| Site JS doesn't see the password manager's autofill → refuses to submit | hn.md #5 | https://news.ycombinator.com/item?id=29239587 |
| Unsubscribe requires login / re-subscribes anyway (450 pts; 453-pt twin from 2013) (dup of C07) | hn.md #9 | https://news.ycombinator.com/item?id=30764757 |
| Copied links carry UTM/fbclid junk; want stripping at the clipboard | hn.md #16 | https://hn.algolia.com/api/v1/search?query=clipboard&tags=ask_hn |
| Bookmarks are second-class citizens (271 pts); bookmarked the fix, then a hard reset lost it (dup of C06) | hn.md #3 | https://news.ycombinator.com/item?id=32505314 |
| Contrast formula distrusted → hand re-checks (dup of C01) | github.md #11 | https://github.com/w3c/wcag3/issues/192 |
| Modern pages melt laptops; three perf threads in one month; "100/100/100/100 … for the site I've worked on **for weeks**" | reddit.md #5 | https://www.reddit.com/r/webdev/comments/1wyp7zs/have_modern_websites_become_bad_in_performance_my/ |
| Big-company web clients rotting: Instagram "barely works"; refresh or lose work | reddit.md #4 | https://www.reddit.com/r/webdev/comments/1wstisb/are_big_companies_just_not_interested_in_web/ |
| Session timeout destroys in-progress form work (~1.3B disabled, ~20% neurodivergent cited) | web.md #23 | https://www.smashingmagazine.com/2026/04/session-timeouts-accessibility-barrier-authentication-design/ |
| Hand-rolled UI kills link affordances: closed "the whole site" closing a popup; infinite scroll breaks ctrl-f/back | web.md #37 | https://maurycyz.com/misc/real_links/ |
| Nobody maintains print styles; printing any page is a gamble (dup of C08) | web.md #38 | https://brennenputh.me/blog/printable-websites/ |
| Front-page complaint week: "Please don't mess with links" 118, "Websites Should Be Printable" 80, "Shitty Screenshare" 62 | web.md #36 | https://lobste.rs/top/year |
| "Teams can generate UI faster than ever, but still have to guarantee it's usable, secure, maintainable" — operational checklist, not a feature | web.md #24 | https://www.smashingmagazine.com/categories/usability/ |
| Browser support = eternal CSS pain (dup of C01) | web.md #16 | https://2024.stateofcss.com/en-US/usage/ |

- FREQUENCY **4** — 4/5 sources; HN repeats span 2013→2026; survey rows are population-scale. (reddit leg = 1 month, its own caveat.)
- SEVERITY **4** — lost work (session timeouts), deliberately weakened security (paste blocking), weeks burned (perf), an accessibility tax on the largest minority in the corpus.
- AUDIENCE **5** — devs who build pages **and** every human who suffers them (printing, cancelling, pasting, popups).
- FEASIBILITY **3** — skeptical crux: a Pages origin **cannot fetch arbitrary third-party page HTML** (no CORS), so "paste a URL → get a report" is a mirage. What survives statically: a bookmarklet executing in the page's own context, pasted-HTML/HAR parsing, a contrast+baseline lab, a URL scrubber. Each 5-worthy; the *no-install for everyday users* promise is not.
- HABIT **3** — ship-time checks and monthly-ish baseline drift for devs; per-incident reactions for everyone else. No natural daily pull.

**TOTAL = 4×1.5 + 4 + 5 + 3×1.5 + 3×1.5 = 6 + 4 + 5 + 4.5 + 4.5 = 24.0**

---

## C05 — MERGE CONFLICTS & GIT REVERSIBILITY — **24.5**

**Sources: 3 of 5.** `github.md`: `"merge conflict" in:title` → **11,846** open issues. `stackexchange.md` row #1: the four git-undo questions carry **16.8M / 13.6M / 13.0M / 9.7M views** — the largest view counts in the entire corpus.

| Pain | Source | URL / reference (verbatim) |
|---|---|---|
| Editors make humans hand-edit `<<<<<<< / ======= / >>>>>>>`; "slower and more error-prone for larger conflicts" (R97) | github.md #7 | https://github.com/zed-industries/zed/issues/58974 |
| Same ask in Helix, 3.5 years of demand (R86) | github.md #8 | https://github.com/helix-editor/helix/issues/5132 (row also cites full URL https://github.com/isaacs/github/issues/224 — R131/C56, opened 2014 — and short ref ``golang/go#32485``) |
| "I hate Git" essays clear 417 pts; minimal-alternative appetite (same hn row #22 used by C09 for Jira) | hn.md #22 | https://hn.algolia.com/api/v1/search?query=I%20hate&tags=story&numericFilters=points%3E150 |
| "How do I undo the most recent local commits in Git?" — 16,812,054 views / 27,246 score | stackexchange.md #1 | https://stackoverflow.com/questions/927358/how-do-i-undo-the-most-recent-local-commits-in-git |
| "Force git pull to overwrite local files" — 9,669,496 views; same family, same source row/URL | stackexchange.md #1 | https://stackoverflow.com/questions/927358/how-do-i-undo-the-most-recent-local-commits-in-git |

- FREQUENCY **4** — 3/5 sources, but each source's *strongest single datapoint*.
- SEVERITY **4** — destroyed commits, lost work, fear-of-Git silencing juniors; mis-resolved conflicts ship as production bugs.
- AUDIENCE **4** — every team dev daily; plus the growing mass of non-devs whose agent now runs git for them and mangles their repo.
- FEASIBILITY **3** — split: pasting a conflict hunk into a client-side 3-way resolver = 5-worthy. The undo/recover half needs the user's repo: a static site can't clone private repos without tokens (banned); `git2wsasm` + File System Access picker works only on desktop Chromium, and a service worker can't sanely hold big repos.
- HABIT **4** — merges are daily on teams; recovery panics recur per user ("re-ask the same 6 recoveries forever", source's words).

**TOTAL = 4×1.5 + 4 + 4 + 3×1.5 + 4×1.5 = 6 + 4 + 4 + 4.5 + 6 = 24.5**

---

## C06 — KNOWLEDGE ARCHIVE & RESURFACING (things you saved / things your team knows) — **24.0 — KILLED (see K1)** ⚠ 2 sources only

**Sources: 2 of 5 (hn.md + web.md) — THIN SOURCE BASE flag applies; nothing in github/stackexchange/reddit corroborates it.** hn.md's own summary: the complaint is *never* "I can't save", always "I can't find it again / it makes me anxious"; its "keep track of X" family = "≥6 distinct high-point Ask HN threads 2018→2026".

| Pain | Source | URL (verbatim) |
|---|---|---|
| 10,000 items in Pocket, "I never actually open the app"; "Instapaper bankruptcy … never going to happen" | hn.md #1 | https://news.ycombinator.com/item?id=31471127 |
| Saves never re-surfaced; linking related finds again "is up to chance"; wants "Things Like This I've Saved" | hn.md #2 | https://news.ycombinator.com/item?id=34111127 |
| Bookmarks: no tags/fuzzy search/backup, lost silently on device reset (271 pts) (dup of C04) | hn.md #3 | https://news.ycombinator.com/item?id=32505314 |
| Planners capture but never say *what next* — "a Jarvis at work" | hn.md #17 | https://news.ycombinator.com/item?id=46345827 |
| Personal medical/admin history scattered and unretrievable (dup of C07) | hn.md #23 | https://hn.algolia.com/api/v1/search?query=how%20do%20you%20keep%20track&tags=ask_hn → item 34448353 |
| 75% of devs spend 5+ h/week searching for work context | web.md #1 | https://survey.stackoverflow.co/2026/ |
| 79% find needed context only *after the fact* (n=12,687) | web.md #2 | https://survey.stackoverflow.co/2026/ |
| "Important context lives in people's heads" 60.9%; outdated 56.5%; spread across tools 53.4%; "I do not know where to look" 30.8% | web.md #3 | https://survey.stackoverflow.co/2026/ |
| Docs bypassed: coworkers 71.9% vs official docs 30.5% (n=14,462) — humans are the index | web.md #4 | https://survey.stackoverflow.co/2026/ |
| 35% of SO visits now caused by AI damage → "find the answer again" is a live, repeating task | web.md #11 | https://survey.stackoverflow.co/2025/stack-overflow/ |
| Public Q&A habit collapsing ("visit less for simple questions" 64.1%) → vacancy for a new private/team loop | web.md #12 | https://survey.stackoverflow.co/2026/ |
| "It's harder to read code than to write it" → everyone has their own string-split (search failure at code scale) | web.md #20 | https://www.joelonsoftware.com/2000-04-06/things-you-should-never-do-part-i/ |
| Rewrites throw away accumulated bug knowledge; the source's own note: "a decision-log/why-file breaks it" | web.md #21 | https://www.joelonsoftware.com/2000-04-06/things-you-should-never-do-part-i/ |
| WET codebases: teams re-pay the cost of duplication forever | web.md #22 | https://overreacted.io/the-wet-codebase/ |
| "Search failure = repeated re-asks, the anti-habit" — even forum maintainers' search degraded | web.md #33 | https://meta.discourse.org/raw/414256 |

- FREQUENCY **4** — 2 sources (rule cap), but each source's loudest family: ≥6 high-point threads + a 30,903-response survey whose top recurring answers are all "can't find it".
- SEVERITY **4** — now quantified at source: 5+ hours/week for 75% of devs; "context after the damage is done"; hoarded-guilt anxiety.
- AUDIENCE **5** — every browser user and every team.
- FEASIBILITY **2** — the ask is sync + search across devices, sessions and years = server + account + storage, all banned; semantic recall over 10k+ items in-browser re-indexes on every visit. Full teardown in K1.
- HABIT **4** — the survey rows literally say "daily" / "weekly re-ask loop"; users describe the daily resurfacing ritual they wish existed.

**TOTAL = 4×1.5 + 4 + 5 + 2×1.5 + 4×1.5 = 6 + 4 + 5 + 3 + 6 = 24.0**

---

## C07 — LIFE-ADMIN & WORK-MONEY (subscriptions, cancel flows, invoices, receipts, career evidence) — **20.0 — KILLED (see K2)**

**Sources: 3 of 5.** hn.md's own verdict: "strongest *consumer* recurrence" in its file — 6+ stories >100 pts spanning 2013→2026 (1747-pt FTC thread). reddit legs are OP-asserted single threads (reddit.md's own notes).

| Pain | Source | URL (verbatim) |
|---|---|---|
| FTC "click-to-cancel": cancellation dark patterns recur because enforcement lags (2018 CA → 2026 enforcement) | hn.md #8 | https://hn.algolia.com/api/v1/search?query=cancel%20subscription&tags=story&numericFilters=points%3E100 |
| Ghosted invoices: "I spent 7 months chasing a tiny amount of money"; email reminders are "ignorable" | hn.md #6 | https://news.ycombinator.com/item?id=45537958 |
| The payer can't pay: "Google will not let me pay an invoice they sent me" (88 pts) | hn.md #7 | https://hn.algolia.com/api/v1/search?query=invoice&tags=ask_hn |
| Unsubscribe requires login / re-subscribes anyway (dup of C04) | hn.md #9 | https://news.ycombinator.com/item?id=30764757 |
| No place for receipts, warranties, service dates (OCR asked 2011/2018/2021/2026) | hn.md #21 | https://hn.algolia.com/api/v1/search?query=receipts&tags=ask_hn |
| Medical/admin history scattered (dup of C06) | hn.md #23 | https://hn.algolia.com/api/v1/search?query=how%20do%20you%20keep%20track&tags=ask_hn → item 34448353 |
| Auto-renew by default; fraudulent recurring charges forwarded to new cards; "fully unsubscribe from Facebook" — users want "one list with renewal dates and a cancel path" | stackexchange.md #17 | https://money.stackexchange.com/questions/100157/why-auto-renew-instead-of-canceling-the-subscription-after-free-trial |
| SaaS gates evaluation behind onboarding interrogation + demo call (single-thread hypothesis) | reddit.md #3 | https://www.reddit.com/r/webdev/comments/1x6lz7z/i_signed_up_for_a_saas_product_yesterday_because/ |
| "$300 clients demand 10x more than $3,000 clients" — no objective way to price client risk pre-signing (single-thread) | reddit.md #10 | https://www.reddit.com/r/webdev/comments/1x89u0m/why_do_300_clients_demand_10x_more_than_3000/ |
| Interview loops inflated to 5–6 rounds, no candidate-side standard; same-month layoff-anxiety cluster | reddit.md #14 | https://www.reddit.com/r/webdev/comments/1x4m79m/are_56_round_interviews_the_normal_now/ |
| AI subscription tier limits opaque and cut under subscribers (dup of C10) | reddit.md #18 | https://www.reddit.com/r/LocalLLaMA/comments/1wt5f4e/looks_like_the_era_of_subsidised_compute_is/ |

- FREQUENCY **4** — 3/5 sources, ten years of repeats.
- SEVERITY **3** — real money, but per-person amounts are tens-to-hundreds; anxiety diffuse (the acute 7-month-chase cases are anecdotes, and they're the K8 kill).
- AUDIENCE **5** — every adult with a card and every freelancer.
- FEASIBILITY **2** — (a) ledger value = automatic capture → Gmail/bank access = banned; manual entry competes with a notes-app list; (b) "how do I cancel X" is per-service legal prose that rots in weeks; rotting legal guidance is worse than none.
- HABIT **2** — checking a subscription ledger is monthly guilt-chores; interview loops are episodic; every prior tracker startup died in this valley.

**TOTAL = 4×1.5 + 3 + 5 + 2×1.5 + 2×1.5 = 6 + 3 + 5 + 3 + 3 = 20.0**

---

## C08 — LOCAL DOCUMENT & MEDIA LAB (PDF / HEIC / images / compare / print — files that never leave the device) — **27.0**

**Sources: 3 of 5.** Highest-volume *non-programming* questions in the corpus (203k–582k views each).

| Pain | Source | URL (verbatim) |
|---|---|---|
| PDF black box: remove security 582,164 views; merge 299k; repair 236k; PDF→PNG 203k — "every routine manipulation is a licensed desktop app or a CLI spell" | stackexchange.md #9 | https://superuser.com/questions/179064/how-to-remove-security-from-a-pdf-file |
| Compare two PDFs — "same or not, and where" (485,916 views); folders & audio compare in same row | stackexchange.md #8 | https://superuser.com/questions/46123/how-to-compare-the-differences-between-two-pdf-files-on-windows |
| HEIC→JPEG, oversized Game Bar recordings, video-size knobs "most users can't reason about" | stackexchange.md #14 | https://apple.stackexchange.com/questions/297134/how-to-convert-a-heif-heic-image-to-jpeg-in-macos |
| "What is this file?" — file type without extension (177,841 views, same row family) | stackexchange.md #15 | https://superuser.com/questions/284427/how-much-time-until-an-unused-hard-drive-loses-its-data |
| JSON⇄CSV for humans (dup of C01) | stackexchange.md #10 | https://stackoverflow.com/questions/1871524/how-can-i-convert-json-to-csv |
| Printing any page is a gamble; "Websites Should Be Printable" 80 pts (dup of C04) | web.md #38 | https://brennenputh.me/blog/printable-websites/ |
| "Shitty Screenshare": browser picks bitrate/codec you can't control (62 pts) — used here as *capture-diagnostic* evidence only; any recording product is banned (K9) | web.md #39 | https://shittyscreenshare.com |
| Prettier can't handle Helm template+yaml (R223/C46) — config-document mangling | github.md #13 | (github.md prints only the short ref ``prettier/prettier#6517`` inside its #13 row — no full URL given there) |

- FREQUENCY **4** — 3/5 sources; SE rows recur "with each document" per the source file; docs/photos are the most durable everyday computing chore in the corpus.
- SEVERITY **4** — a locked/corrupted PDF or a HEIC a government portal rejects blocks filings, applications, taxes; plus "data lost" adjacency (row #15 family).
- AUDIENCE **5** — everyday people primary (rare in this corpus) **and** devs on the config/JSON side; one engine serves both halves.
- FEASIBILITY **4** — pdf.js/pdf-lib, WASM libheif, canvas re-encode: real, zero-upload, service-worker-installable offline PWA; "0 bytes uploaded" is the moat vs ad-farm converters. Held to 4: ffmpeg.wasm video-shrink is ~100 MB and slow → video stays a one-preset corner, never a pitch.
- HABIT **4** — per-document and documents are continuous; installed-PWA + remembered presets make use #4 faster than #1 (commodity-search risk acknowledged).

**TOTAL = 4×1.5 + 4 + 5 + 4×1.5 + 4×1.5 = 6 + 4 + 5 + 6 + 6 = 27.0**

---

## C09 — ECOSYSTEM NOISE & STALE-CACHE ANXIETY (tooling that generates work / lies about state) — **21.0**

**Sources: 4 of 5.**

| Pain | Source | URL (verbatim) |
|---|---|---|
| Dependabot floods per-package PRs, no rollups → "I ignore everything it says, for me it's just noise" | hn.md #10 | https://news.ycombinator.com/item?id=32436316 |
| Compose YAML: "after some amount of reboots, YAML mangling, cursing… I just give up" | hn.md #14 | https://news.ycombinator.com/item?id=34225669 |
| Jira hate-essay 971 pts — heavyweight tools as noise generators (same hn row #22 used by C05 for Git) | hn.md #22 | https://hn.algolia.com/api/v1/search?query=I%20hate&tags=story&numericFilters=points%3E150 |
| Service worker silently serves stale builds; "a page reload will not reflect the changes"; open since 2018; class = 615 open issues | github.md #2 | https://github.com/react/create-react-app/issues/5316 |
| `npm audit` panic on every install: "found 5 vulnerabilities (3 moderate, 2 high)"… "99%+ false positive rate" | web.md #19 | https://overreacted.io/npm-audit-broken-by-design/ |
| "Docker is weird" (106 pts): "Docker requires root! pretty easy to miss" | web.md #40 | https://codeandcake.dev/posts/2026-10-22-docker-is-weird |
| Testing pain = setup/mocking/slowness; "flaky tests train people to ignore red" | web.md #15 | https://2024.stateofjs.com/en-US/libraries/testing/ |
| Cert expiries are knowable in advance yet unmonitored; after a fix, caches keep serving the old state ("why is it still showing the old thing") | stackexchange.md #16 | https://serverfault.com/questions/279984/how-do-i-clear-chromes-ssl-cache |
| Can't tell if your app or the platform is down; no honest vendor incident history (single-month evidence; also feeds K4) | reddit.md #7 | https://www.reddit.com/r/webdev/comments/1xbsssb/railway_hosting_is_deeply_unreliable/ |

- FREQUENCY **4** — 4/5 sources; per web.md the audit-noise variant fires "literally after every npm install" — but the cluster holds two weakly-joined jobs (dep triage vs cache-busting), which suppresses both habit and feasibility.
- SEVERITY **3** — hours lost to YAML/reboots + the corrosive kind of cost: people trained to ignore red.
- AUDIENCE **3** — devs/self-hosters only.
- FEASIBILITY **3** — noise-triage over pasted lockfiles + `npm audit --json` = a clean static fit (Actions can host curated advisory mirrors); live status boards / "which version runs where" need credentialed third-party polling from the browser → dead (K4). Split verdict = 3.
- HABIT **3** — daily triggers, but each sub-job is a one-screen utility, not a ritual.

**TOTAL = 4×1.5 + 3 + 3 + 3×1.5 + 3×1.5 = 6 + 3 + 3 + 4.5 + 4.5 = 21.0**

---

## C10 — LOCAL-LLM FIT & MODEL CHURN — **20.0 — main thrust KILLED (K4), calculator survives as a C01 tool** ⚠ 1 source

reddit.md's own verdict: "**Strongest recurrence signal in the whole sample**: VRAM appears 15× and GGUF 7× in one month of r/LocalLLaMA top-50" — one sub, one month; **no other source file has a single row about it**.

| Pain | Source | URL (verbatim) |
|---|---|---|
| "Will it run on MY GPU/RAM, at what quant, at what context" answered by hand-made ranked posts that go stale in days | reddit.md #15 | https://www.reddit.com/r/LocalLLaMA/comments/1x3gpyi/every_model_that_can_be_run_on_1016gb_vram_ranked/ |
| Models vanish mid-download, can't resume — hours of bandwidth silently lost | reddit.md #16 | https://www.reddit.com/r/LocalLLaMA/comments/1xd7ptj/models_disappearing_from_huggingface/ |
| Model IDs retired, replaced with absurd suggestions ("GPT-3 is discontinued today") | reddit.md #17 | https://www.reddit.com/r/LocalLLaMA/comments/1ws67x4/gpt3_is_discontinued_today/ |
| Tier limits opaque, cut under subscribers (dup of C07) | reddit.md #18 | https://www.reddit.com/r/LocalLLaMA/comments/1wt5f4e/looks_like_the_era_of_subsidised_compute_is/ |
| Can't tell if a local model phones home; accusation + rebuttal 24h apart, unresolved | reddit.md #19 | https://www.reddit.com/r/LocalLLaMA/comments/1xg78oq/i_now_have_definitive_proofs_that_my_qwen_flash/ |

- FREQUENCY **4** (rule-capped, ⚠ single source, single month).
- SEVERITY **3** — wasted download hours, wrong hardware purchases.
- AUDIENCE **2** — local-LLM hobbyists; ~zero everyday people; a thin slice of "devs".
- FEASIBILITY **4** — the fit *calculator* is pure arithmetic over a static table (Actions-refreshable) + WebGPU device-limit probing; but "is the repo still live" / "does it phone home" need cross-origin probes and packet capture the browser can't do.
- HABIT **2** — consulted at purchase/try decisions (monthly at best for most of the niche); a stale matrix actively repels.

**TOTAL = 4×1.5 + 3 + 2 + 4×1.5 + 2×1.5 = 6 + 3 + 2 + 6 + 3 = 20.0**

---

## C11 — CITATION / REFERENCE UPKEEP — **14.0 — KILLED (K6)** ⚠ 1 source

| Pain | Source | URL (verbatim) |
|---|---|---|
| "Sources change (repos update, names change, versions retire) while citations must stay frozen" — top question 42,572 views; source itself flags "modest view counts"; same row family covers repo-citing & name-change edge cases | stackexchange.md #21 | https://academia.stackexchange.com/questions/20358/how-should-i-reference-my-github-repository-with-materials-for-my-paper |

- FREQUENCY **2** (single source, single tag) · SEVERITY **2** · AUDIENCE **3** (writers/grad students — mostly non-devs, fails devs-primary) · FEASIBILITY **2** (re-fetching every cited URL on a schedule + snapshot diff = crawler + storage = banned) · HABIT **2** (episodic, revision-driven).

**TOTAL = 2×1.5 + 2 + 3 + 2×1.5 + 2×1.5 = 3 + 2 + 3 + 3 + 3 = 14.0**

---

## C12 — PHYSICAL / MANUAL MONITORING — **15.5 — KILLED (K3)**

| Pain | Source | URL (verbatim) |
|---|---|---|
| "Can you check the pressure on the cryocooler" — someone walks over to read a gauge; weekly rhythm solved by a DIY Raspberry Pi | web.md #27 | https://dev.to/pahorton/i-got-tired-of-coming-into-my-lab-to-check-the-pressure-of-my-cryocooler-so-i-built-a-tool-to-do-it-4ob7 |

- FREQUENCY **2** (one row) · SEVERITY **3** (spoiled samples/experiment loss in that one anecdote) · AUDIENCE **2** · FEASIBILITY **1** (needs always-on hardware with ingress = a server; Pages cannot receive anything) · HABIT **4** (the corpus's only *literal proven weekly ritual* — which is why it earns its 15.5 and its own KILL).

**TOTAL = 2×1.5 + 3 + 2 + 1×1.5 + 4×1.5 = 3 + 3 + 2 + 1.5 + 6 = 15.5**

---

# TOP 4 — PRODUCT SHAPES

## 1. C08 "Docbench" (27.0) — the document lab where files never leave the device
**What it does:** an installable service-worker PWA (fully offline after first load) that merges/splits/rotates/watermarks/repairs/compares PDFs, converts HEIC/RAW→JPG/WebP via WASM libheif, batch-compresses photos, sniffs unknown file types, and round-trips JSON⇄sheet — with a live "0 bytes uploaded" indicator as the headline differentiator against the ad-farm converters that the 203k–582k-view Superuser questions currently funnel everyone into; video-shrink stays a single "make it emailable" preset because ffmpeg.wasm weight fights the platform. **Habit loop:** per-document and continuous — tax season, rental applications, a phone full of HEICs, a scanned contract — with installed-PWA + remembered presets making the 4th run faster than the 1st, i.e. retention from personalization rather than accounts. **Hardest GitHub Pages risk:** **payload and memory ceilings on a static origin**: libheif + pdf.js cores push first-load into the tens of megabytes and large PDFs hit WASM memory limits on mobile browsers, while Pages offers no per-path compression/caching control — a naive build turns the privacy win into a "40 seconds to open" abandonment, and the audience is precisely mobile-first everyday people.

## 2. C01 "Workbench" (26.5) — the zero-upload conversion & inspection bench
**What it does:** one keyboard-first page (pinned as `/w`) where a dev pastes anything and gets the *explained* answer — unix↔human time per zone, base64/URL/hex/entities/hashes, JSON⇄YAML⇄CSV with the flattening decision made visible, regex anatomy + the `$`-anchor trap, semver-range → concrete resolution, contrast math with APCA beside the distrusted WCAG numbers, a URL scrubber, a robots.txt picker (reddit #13), a GGUF-header inspector (reddit #20) — every result encoded into a shareable permalink so *the artifact, not the site* travels; a free GitHub Action regenerates the static lookup tables (baselines, fixtures) and a service worker makes the bench work on a plane. **Habit loop:** per-task now (timestamps already read as daily), with the return-hook being past permalinks landing in tickets/PRs/Slack, plus an Actions-generated weekly "one new tool + one gotcha card" changelog — nothing login-shaped, nothing pushy. **Hardest GitHub Pages risk:** not compute — **distribution vs Google**: the highest-demand tools here are the most commoditized SERP pages on the internet, and with no paid channel the only bootstrap is other people's documents linking the permalink format, which is slow-burn and unguaranteeable.

## 3. C02 "CronPreview" (26.5) — see what your schedule will actually do before it fires
**What it does:** paste a cron expression (or the CDK/K8s/Azure snippet) + pick an IANA zone → a 12-month fire table with DST skips and repeats flagged inline, the "your UTC entry fires an hour off for half the year" banner, and the same expression rendered side-by-side under POSIX/Quartz/AWS dialects so framework mismatches (19,399 open `cron in:title` issues) show on one screen; tab two is the UTC-vs-local-vs-zone-name inspector for the `timezone in:title` class, showing which layer of a stack is lying. **Habit loop:** every new scheduled job (weekly for infra devs), the twice-yearly DST cliff when the whole timeline remembers this exists, and per-incident triage — the permalink (`?expr=…&tz=…`) is the proof artifact people paste into PR descriptions, which *is* the growth loop. **Hardest GitHub Pages risk:** **silent correctness**: zone rules come from the browser's own `Intl`/`Temporal` implementations, which differ subtly across engines/versions — one wrong preview on a March skip inverts the entire value proposition, and there is no server to catch it, so the mitigation is a generated conformance suite run in Actions against pinned browser channels, whose failure mode is exactly the silent kind.

## 4. C03 "WhyFailed" (26.0) — paste the red text, get the sentence a human would write
**What it does:** paste an `ERESOLVE`/peer-dep/"unhelpful error"/vendor-auth block (or drop `package.json` + lockfile) → plain-language diagnosis, why each conflicting semver range exists, the concrete fix path, an explicit "this npm-audit high is a dev-only false positive" verdict, and for the credentialed-cloud class nobody can diagnose from outside (the 348-comment home-assistant shape) a generated copy-paste diagnostic bundle that at least makes the issue answerable; the pattern DB is curated YAML compiled to static JS, Actions-refreshed, fully open. **Habit loop:** errors are the most reliable unprompted trigger in the corpus (many per day); the artifact is the decoded permalink pasted into the issue/team chat, plus a local-only "last 20 decodes" journal that becomes personal infrastructure on machine #1. **Hardest GitHub Pages risk:** **coverage cliff + pattern rot**: a decoder is judged by the one error it doesn't know, error texts reshape every release, and with no server there is no telemetry for what failed — the curation loop must be rebuilt from zero (on-purpose local queue → user-consented "I didn't know this" GitHub issue, Actions-triaged) or the DB freezes and the tool quietly becomes confidently wrong.

*(Alternates: C05 "Merge & undo" at 24.5 — its conflict half is a 5-worthy static tool, but its undo half cannot touch a private repo from Pages, so it needs a product decision before it earns a build; C04 "Page truth" at 24.0 — the biggest audience in the corpus, but the honest version is bookmarklet-only because Pages cannot fetch third-party HTML, hence Fe 3.)*

---
# KILLED

**K1 · C06 Knowledge archive & resurfacing — 24.0, the highest-scored kill of the analysis.** The most human pain in the corpus (10k unread Pocket items; 75% of 30,903 surveyed devs bleeding 5+ h/week on context search) and the joint-best audience score — killed twice over. (a) **Feasibility 2, structural:** the complaint is *retrieval across devices, browsers and years*; GitHub Pages gives localStorage, which dies with the browser profile, so the product would *reproduce the exact loss users are describing*; sync needs an account backend (banned: server storing user data) or the user pasting a third-party token into a static page (banned: keys/third-party auth); semantic "things like this" recall over 10k+ items in a browser is a re-indexing cost nobody tolerates on a laptop. (b) **Thin base:** 2 source files; zero rows in github/stackexchange/reddit. The survey numbers make this the cluster most worth a *non-static* company someday; under today's constraints it's a lesson, not a product. **Salvage:** stateless "Instapaper bankruptcy amnesty" one-shot (drop a Pocket/Instapaper HTML export → dedupe, cluster, keep/nuke, download a rebuilt file) — habit 1, kept as a C01 citizen that markets itself, not a product.

**K2 · C07 Life-admin & work-money — 20.0.** The strongest *consumer* recurrence in hn.md (1747-pt FTC thread, ten years of ghost-invoice threads), killed on both hard axes: (a) the ledger's whole value is automatic capture of charges/renewals → Gmail/bank OAuth or a server ingesting billing data — every option explicitly banned, and manual entry means competing with a notes-app list nobody updates, the graveyard of a dozen subscription trackers; (b) "how do I cancel X" is per-service legal prose that rots in weeks, and rotted legal guidance is worse than none; (c) habit 2 — monthly guilt-chores with no daily/weekly reason to return; the freelancer sub-legs (client-pricing, interview loops) are OP-asserted single threads per reddit.md's own notes. **Salvage:** none as product — the cancel-path FAQ is content, not software.

**K3 · C12 Physical gauge monitoring — 15.5.** The corpus's only *proven* weekly ritual (cryocooler checks, https://dev.to/pahorton/i-got-tired-of-coming-into-my-lab-to-check-the-pressure-of-my-cryocooler-so-i-built-a-tool-to-do-it-4ob7) — and definitionally not GitHub Pages: sensor loops need always-on hardware plus an ingress path, i.e. a server. Feasibility 1. The lesson to steal is the *ritual shape* (a weekly "things you own that decay" check-in), not the product.

**K4 · Data-treadmill matrices (model availability / runtime EOL / PaaS outage track records / live status) + C10's main thrust.** Evidence: reddit #15–#18 and #7 (https://www.reddit.com/r/LocalLLaMA/comments/1xd7ptj/models_disappearing_from_huggingface/, https://www.reddit.com/r/webdev/comments/1xbsssb/railway_hosting_is_deeply_unreliable/), hn #11 (https://hn.algolia.com/api/v1/search?query=how%20do%20you%20keep%20track&tags=ask_hn — same Ask HN twice, 142 and 108 pts). Three killers: (a) the content *is* live third-party state — a static origin cannot probe HF/status pages/registries (CORS, no keys, no server), so the JSON is hand-maintained, and a matrix that's wrong about "retired/EOL/down" causes the exact bad decisions it exists to prevent; (b) habit 2 — decision-moment usage, months apart; (c) the loudest specific ask ("downloads vanish and can't resume") is a bandwidth/resume problem no calculator touches. The **fit calculator** survives as a C01 tool because it's arithmetic over stable published specs, not status.

**K5 · CORS proxy (github #1's literal ask).** The angriest issue in the corpus (R384/C106: https://github.com/Rob--W/cors-anywhere/issues/301) begging for *a server*; the thread documents the free public escape hatch throttled from 200/hr to 50/hr **on purpose because of abuse** — any working free proxy instantly becomes the internet's SSRF box, on a host class (free dyno/PaaS) that's already dead. Infeasible by construction. **Salvage (already in C01/C04):** a preflight *explainer* — paste request/response headers, see which one is missing and why.

**K6 · C11 Citation upkeep — 14.0.** Single source (https://academia.stackexchange.com/questions/20358/how-should-i-reference-my-github-repository-with-materials-for-my-paper), 42k views = the corpus's floor, audience mostly non-devs (fails devs-primary), and the core loop — re-fetch every cited URL on a schedule and diff against what you claimed — is a crawler with snapshot storage = server. Killed on feasibility + audience.

**K7 · Portfolio-from-artifacts generator.** The highest-anxiety single row in the dataset (https://www.reddit.com/r/webdev/comments/1x9tnsf/laid_off_after_7_years_and_my_portfolio_is_a_2019/ — "by lunch about 40 of us were done"; "portfolio" 6× in a month) — and habit is structurally 1: built once during a job search, never returned to except to update; ingestion ("paste your Behance/GitHub/Drive") needs per-site scraping/OAuth (banned) or manual drag-drop that free GitHub Pages/README builders already do better-marketed. Severity does not rescue one-shot products.

**K8 · Invoice chasing / payment automation.** hn #6/#7. The kill sentence is *in the source*: "I would never pay for an automated service to email payment reminders. Because emails are ignorable." The accepted fix is calling the client the day it's late; send-on-your-behalf means our server storing client contact + billing data (banned); read-receipts is a tracking pixel every mail client strips. **Salvage:** a pasteable polite→firm escalation template page — content, habit 1.

**K9 · Screen recording / capture anything.** hn #19 (https://hn.algolia.com/api/v1/search?query=screen%20recording&tags=ask_hn — its own file marks it "weak points → drop") + the Shitty Screenshare wave (https://shittyscreenshare.com). Killed twice: browser capture can't reliably do system audio / DRM-blocked content (a real fix is a native app), and this is video territory — explicitly excluded by the brief. Only capture *diagnostics* (bitrate/resolution explainers) stay, in C08's shadow.

**K10 · "Verify the AI's output" products.** The biggest-volume cluster in web.md — 66% "almost right, but not quite", 45% debugging-AI-is-slower, 46% distrust, 81% privacy concerns, 35% of SO visits caused by AI damage, AI-PR flood (https://survey.stackoverflow.co/2026/, https://survey.stackoverflow.co/2025/, https://survey.stackoverflow.co/2025/ai/, https://survey.stackoverflow.co/2025/stack-overflow/, https://www.reddit.com/r/webdev/comments/1x8bqrp/if_ai_fatigue_has_hit_you_i_have_a_question/, https://dev.to/adamthedeveloper/dont-be-a-proxy-between-me-and-your-ai-mcn, https://dev.to/francistrdev/ai-fatigue-yea-i-know-f9). Demand is 5/5 real, killed by the constraint's own terms: verification needs the repository (tokens → banned) plus a working model; "run a local model in-browser" melts precisely the laptops the same research month was complaining about melting (https://www.reddit.com/r/webdev/comments/1wyp7zs/have_modern_websites_become_bad_in_performance_my/) — a self-refuting product. **Salvage:** the PR-size norm calculator (200–400-line review ceiling per the source's Cisco/Salesforce citation; reddit.md prints only the in-file id ``1x504mq`` for that thread) — one shareable screen inside C01.

**K11 · Everyday file & device operations.** The biggest *count* cluster in the corpus: ports, 5.2M views (https://stackoverflow.com/questions/3855127/find-and-kill-processes-listening-to-port-3000-on-mac) · disk safety (https://superuser.com/questions/707767/how-can-i-free-up-drive-space-from-the-windows-installer-folder-without-killing) · WSL2 disk-image shrink (https://superuser.com/questions/1606213/how-do-i-get-back-unused-disk-space-from-ubuntu-on-wsl2) · bulk rename (https://superuser.com/questions/65302/is-there-a-way-to-batch-rename-files-to-lowercase) · inotify limits (https://unix.stackexchange.com/questions/13751/kernel-inotify-watch-limit-reached) · container copy/exec (https://stackoverflow.com/questions/22907231/how-can-i-copy-files-from-a-host-to-a-docker-container) · recovery panic (https://superuser.com/questions/284427/how-much-time-until-an-unused-hard-drive-loses-its-data) · battery attribution (https://android.stackexchange.com/questions/17382/how-can-i-find-out-what-causes-android-os-to-consume-battery) · plus github #16, "can't tell which file a rendered style came from" (https://github.com/vitejs/vite/issues/2830). A web page cannot enumerate your disk, see PIDs, watch folders outside a user-picked handle, mount a `.vhd`, talk to a docker daemon, or attribute a wakelock; File System Access API is desktop-Chromium-only, which breaks the everyday-people half anyway. Feasibility 1. **Salvage:** the *recipes* — per-OS command cards for "who owns port 3000", bulk-rename one-liners, an ssh-config explorer (https://superuser.com/questions/247564/is-there-a-way-for-one-ssh-config-file-to-include-another-one) — as Actions-generated reference pages inside C01; take the traffic, skip the impossibility.

**K12 · Secrets managers & env-leak vaults.** hn #15 (https://hn.algolia.com/api/v1/search?query=secrets%20management&tags=ask_hn — "small teams want secrets management that is not Vault") + reddit #6 (https://www.reddit.com/r/webdev/comments/1xc3poo/railway_hacked_envs_leaked/, "Railway" 21× in one month). The *browser-only, nothing-uploaded `.env` scanner* (name provider + rotation URL per leaked key pattern) is buildable and good — but it's one screen, and its demand is **episodic**: it trends the day a vendor is breached and flatlines after (habit 1). The storage/management half needs a vault server (banned outright), and a static page that invites users to paste *live secrets* into it is a trust anti-pattern regardless of what the JS promises. Killed as a product; the scanner ships as a C01 tool precisely because it *doesn't* store anything.

---

# Coverage map (all 122 rows → cluster)

**hn.md:** 1→C06 · 2→C06 · 3→C04(dup C06) · 4→C04 · 5→C04 · 6→C07/K8 · 7→C07 · 8→C07 · 9→C04(dup C07) · 10→C09 · 11→K4 · 12→C01 · 13→C02 · 14→C09 · 15→K12 · 16→C04 · 17→C06 · **18→unclustered** · 19→K9 · 20→C01 · 21→C07 · 22→C05(dup C09) · 23→C06(dup C07)
**github.md:** 1→K5 · 2→C09 · 3→C03 · 4→C03(dup C01) · 5→C02 · 6→C02 · 7→C05 · 8→C05 · 9→C03 · 10→C02 · 11→C01(dup C04) · 12→C01 · 13→C01(dup C08) · 14→C01 · 15→C01 · 16→K11 · 17→C03 · **18→unclustered**
**stackexchange.md:** 1→C05 · 2→K11 · 3→K11 · 4→K11 · 5→K11 · 6→C01 · 7→K11 · 8→C08 · 9→C08 · 10→C01(dup C08) · 11→C01 · 12→C01 · 13→K11 · 14→C08 · 15→K11 · 16→C09 · 17→C07 · 18→C02 · 19→K11 · 20→K11(salvage→C01) · 21→C11
**reddit.md:** 1→C04 · 2→C04 · 3→C07 · 4→C04 · 5→C04 · 6→K12 · 7→C09(dup K4) · 8→K10 · 9→K7 · 10→C07 · 11→C03 · 12→C01 · 13→C01 · 14→C07 · 15→C10 · 16→C10 · 17→C10 · 18→C10(dup C07) · 19→C10 · 20→C01
**web.md:** 1,2,3,4→C06 · 5→K10 · 6→C03 · **7→meta** · 8,9,10→K10 · 11,12→C06 · 13→C01(dup C02) · 14→C01 · 15→C09 · 16,17,18→C01(16 dup C04) · 19→C09 · 20,21,22→C06 · 23→C04 · 24→C04 · **25→meta** · 26→C01 · 27→C12/K3 · 28,29→K10 · 30,31→C03 · 32→C03 · 33→C06 · **34,35→meta** · 36,37,38→C04(38 dup C08) · 39→C08(dup K9) · 40→C09

*meta* = the source files themselves label these as habit-loop/market signals rather than pain rows (web #7 satisfaction & freelance-shift, #25 retention plateau, #34 self-organised monthly ritual, #35 perpetual "everything we'd fix" threads) — used in the scoring narrative, not clustered. *unclustered* = hn #18 (bloated API clients) and github #18 (official Docker image / self-host docs): each is, per its own source file, a single-thread/duplicate-issue signal without a second corroborating row — under the thin-evidence rule, a 13th cluster built on them would be evidence-free hope; a static HTTP client stays a plausible C01 addition *if* a second source ever appears.

# Confidence notes
- `github.md` reaction/comment counts and API `total_count` figures are the hardest recurrence evidence in the corpus; they drove the C01/C02/C03/C05 frequency scores.
- `reddit.md` = 1 month × 2 subs; no reddit-only claim was allowed to lift a frequency uncapped (C10 capped+flagged; C04/C07 legs footnoted). UNVERIFIED(quote) rows in hn/web contributed demand counts only, never quote-level severity claims.
- Single/dual-source clusters C06 ⚠, C10 ⚠, C11 ⚠, C12 all die or survive exactly as marked; none was silently promoted.
