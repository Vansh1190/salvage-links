# Demo library: how it was curated and what was checked


Command: `npm run curate` (`scripts/curate-sample.mjs`), run from this sandbox on **2026-10-27**.


| step | count |
| --- | --- |

| URLs found in research/*.md (dead-end sections excluded) | 180 |
| answered HTTP 200 → kept in the demo | 136 |
| reachable but refused us (301/302/403 bot-block; a person would likely get through) | 21 |
| dead, unresolvable or timed out → dropped | 23 |


Also dropped before checking: `example.com`-style placeholders, this repo's own dev URLs,
raw API endpoints, and every line inside the research files' own "dead ends / blocked" sections.


**Why this matters:** the UI claims the demo is made of real public pages. That claim is only
true because it is filtered to the 136 URLs that answered 200 on 2026-10-27; it is
not a claim that they will live forever — link rot is the problem this product is about.


Hosts kept: developer.mozilla.org (10), getpocket.com (4), www.reddit.com (20), survey.stackoverflow.co (4), github.com (47), raw.githubusercontent.com (1), blog.bytebytego.com (1), support.apple.com (1), corsproxy.io (2), dev.to (3), api.npmjs.org (1), brennenputh.me (1), shittyscreenshare.com (1), support.mozilla.org (1), overreacted.io (2), hashnode.com (1), allorigins.win (1), doublememory.com (1), www.joelonsoftware.com (1), docs.github.com (3), youtu.be (1), 2024.stateofjs.com (2), x.com (2), www.smashingmagazine.com (2), news.ycombinator.com (4), maurycyz.com (1), javascriptweekly.com (1), 2024.stateofcss.com (1), web.dev (2), meta.discourse.org (1), discuss.python.org (4), omnivore.app (1), webkit.org (1), css-tricks.com (2), developer.chrome.com (1), internals.rust-lang.org (1), lobste.rs (1), codeandcake.dev (1), ziggit.dev (1).
