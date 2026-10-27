# RESEARCH.md — evidence base (Phase 1)

Collected 2026-10-27 by sub-agents. **Provenance rule:** every row in the raw files was
copied from an HTTP response the agent actually received. An independent auditor
re-opened a deterministic sample of 47 URLs: **40 strict PASS, 7 blocked-but-feed-verified,
0 fabricated** (see `research/AUDIT.md`). Numbers below are counts *of rows in these files*,
not recalled statistics.

## Raw evidence files

| File | Rows | Source type | Auditor grade | Known weakness |
|---|---|---|---|---|
| `research/hn.md` | 23 | Hacker News (Algolia API + item threads) | B | 10/23 rows cite an Algolia *search-listing* URL instead of the specific item |
| `research/github.md` | 18 | Open-source issue trackers (GitHub REST) | A | Discussions sampled, not ranked; `git/git` mirror has no tracker |
| `research/reddit.md` | 20 | Community forum (Reddit Atom RSS) | C | 429-blocked on 16 of 18 subs; **no upvote scores exist in RSS** → every count is UNVERIFIED |
| `research/stackexchange.md` | 21 | Stack Exchange API (SO/SuperUser/Money) | A | 3 rows had titles truncated by the fetcher (marked UNVERIFIED) |
| `research/web.md` | 40 | Surveys (Stack Overflow 2025/2026, State of JS/CSS), Discourse forums, blogs/newsletters | B- | 8 rows hang off one hub URL (survey root) → not independent |
| **Total distinct pain points** | **122** | **5 source types** (requirement was 30 / 5) | | |

Analysis layer: `research/CLUSTERS.md` (12 clusters, weighted scores, arithmetic shown),
`research/AUDIT.md` (URL verification + hostile review of the evidence itself),
`research/FEASIBILITY.md` (what a static site can honestly do, MDN/spec/npm-cited),
`research/pocket-evidence.md` (24 GitHub issues + HN threads for the shortlisted idea).

## Scoring rubric used (from CLUSTERS.md)

`TOTAL = 1.5*frequency + severity + audience + 1.5*github-pages-feasibility + 1.5*habit`
Feasibility is a **kill switch** (credentialed scraping / third-party auth / server storing
user data ⇒ 1–2 regardless of demand). Habit graded harshly: "useful when it hurts" caps at 3.

## Cluster ranking (verbatim totals from CLUSTERS.md)

| Rank | Cluster | Srcs | TOTAL | Status |
|---|---|---|---|---|
| 1 | Local document & media lab | 3 | 27.0 | top-4, **rejected** (see DECISIONS D4) |
| 2 | Convert & inspect workbench | 5 | 26.5 | top-4, rejected |
| 2 | Cron / timezone / date | 4 | 26.5 | top-4, rejected |
| 4 | Error decoder + dependency semantics | 4 | 26.0 | top-4, rejected |
| 5 | Merge conflicts & git reversibility | 3 | 24.5 | alternate |
| 6 | Page truth | 4 | 24.0 | alternate |
| 6 | **Knowledge archive & resurfacing** | 2 (thin) | 24.0 | killed in CLUSTERS.md on feasibility — **overturned**, see D4 |
| 8 | Ecosystem noise & stale cache | 4 | 21.0 | weak |
| 9 | Life-admin & work-money | 3 | 20.0 | killed (needs bank/email auth) |
| 9 | Local-LLM fit calculator | 1 | 20.0 | killed (data treadmill, 1 source) |
| 11 | Physical gauge monitoring | 1 | 15.5 | killed (hardware) |
| 12 | Citation upkeep | 1 | 14.0 | killed |

## Why the winning problem is real (frequency / recurrence)

**The pain:** people accumulate thousands of saved links that are never read, the tools that
held them die, and nothing ever brings an old save back at a useful moment.

Recurrence evidence, each line backed by a URL an agent opened:
- **Begged-for feature = automatic resurfacing of forgotten saves**, asked in all 5 sampled
  open-source reader ecosystems, 2016→2026 (10 issues). Examples:
  karakeep-app/karakeep#435 "Add 'Random Bookmarks View' to rediscover forgotten links"
  (https://github.com/karakeep-app/karakeep/issues/435),
  karakeep#705 "'Remind me of this' feature" (https://github.com/karakeep-app/karakeep/issues/705),
  wallabag/wallabag#2285 "The article on page 28 (on 42) will never be read… forgotten forever"
  (https://github.com/wallabag/wallabag/issues/2285),
  miniflux/v2#1493 digest view for "~120 per day" (https://github.com/miniflux/v2/issues/1493).
- **The pile is huge and the loss is real:** HN item 31471127 (190 pts) "10,000 items in
  Pocket… I never actually open the app" (https://news.ycombinator.com/item?id=31471127);
  HN 32505314 (271 pts) bookmarks lack tags/backup and are lost silently on device reset
  (https://news.ycombinator.com/item?id=32505314); HN 44063662 "Mozilla to shut down Pocket and
  Fakespot" — 1222 pts / 762 comments (https://news.ycombinator.com/item?id=44063662).
- **Link rot, verbatim:** "i gave up on using bookmarks a very long time ago after finding so
  many links no longer working" — HN item 44064255
  (https://news.ycombinator.com/item?id=44064255); "many links, other than the most recent ones,
  are dead" — HN item 44064682 (https://news.ycombinator.com/item?id=44064682).
- **Vendor death is confirmed at primary source:** `https://getpocket.com/home` fetched HTTP 200
  containing "we've made the difficult decision to phase out Pocket". Specific shutdown date
  **UNVERIFIED** (not present in the HTML we fetched). Omnivore's official notice is
  **UNVERIFIED** (blog.omnivore.app does not resolve); corroborated only by
  omnivore-app/omnivore#4459 (141 reactions / 45 comments,
  https://github.com/omnivore-app/omnivore/issues/4459) and HN.
- **Portability demand:** linkwarden/linkwarden#587 "Export links to HTML" (57 reactions,
  https://github.com/linkwarden/linkwarden/issues/587); miniflux/v2#797 "Deduplicate Feature"
  (62 reactions, https://github.com/miniflux/v2/issues/797).
- **A daily/weekly ritual already exists for this audience:** HN item 14919246 — "sends me 10
  articles from Unread every morning in a digest form" (https://news.ycombinator.com/item?id=14919246);
  dev.to/pahorton monthly-lab-check thread in `research/web.md` #27
  (https://dev.to/pahorton/i-got-tired-of-coming-into-my-lab-to-check-the-pressure-of-my-cryocooler-so-i-built-a-tool-to-do-it-4ob7).
- **Adjacent, cross-source corroboration:** 75% of 30,903 Stack Overflow 2026 respondents spend
  5+ hours searching for context they already had (https://survey.stackoverflow.co/2026/ — cited
  in `research/web.md`).

## Honest limits of this research
1. Reddit coverage is 2 of 18 subreddits, one month, no scores. It corroborates, it does not quantify.
2. No usage analytics exist for a product that does not exist yet — "habit potential" here is inference from other people's stated behaviour, not measured retention. Stated in SPEC.md as a risk.
3. Competitor names appearing in sub-agent prose (crontab.guru, ILovePDF, epochconverter…) were **not** all independently fetched; where an incumbent claim matters to a decision we fetched it, otherwise it is marked UNVERIFIED.
4. The "~120 pain points" figure in my own earlier prompts was sloppy phrasing by the orchestrator; the audited truth is **122 rows total**.
