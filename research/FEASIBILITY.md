# Technical Feasibility — Purely-Static "Saved Links" Tool on GitHub Pages

Author: TECH-FEASIBILITY sub-agent. Date of all fetches: **2026-10-27** (UTC).
Constraints examined: HTTPS static hosting (GitHub Pages), **no server, no third-party API keys**, local-first data.

Methodology notes (read first):
- Every claim below is tagged with the URL actually fetched. Direct quotes are in `"quotes"`.
- MDN "Browser compatibility" tables are rendered by JavaScript and do **not** appear in page HTML. For compat facts I therefore fetched the exact dataset MDN renders: `npm i @mdn/browser-compat-data` (fetched 2026-10-27), and pair it with the prose/status banners of the fetched MDN page itself. Where MDN prose itself shows a banner ("Limited availability", "Baseline"), that is quoted verbatim.
- Anything the fetched docs do not say is marked **UNVERIFIED**.

---

## 1. STORAGE DURABILITY (IndexedDB quotas + eviction)

### 1.1 The governing model: best-effort vs persistent

Source: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria (last modified Jan 5, 2026 per page footer)

> "Data for an origin can be stored in two ways in a browser, persistent and best-effort"
> "Best-effort: this is the way that data is stored by default. Best-effort data persists as long as the origin is below its quota, the device has enough storage space, and the user doesn't choose to delete the data via their browser's settings."
> "Persistent: an origin can opt-in to store its data in a persistent way. Data stored this way is only evicted, or deleted, if the user chooses to, by using their browser's settings."
> "When an origin's data is evicted by the browser, all of its data, not parts of it, is deleted at the same time. If the origin had stored data by using IndexedDB and the Cache API for example, then both types of data are deleted."

IndexedDB is explicitly one of the managed technologies ("IndexedDB is a Web API for storing large data structures in the browser").

### 1.2 Quota numbers (documented)

Chrome/Chromium — same MDN page:
> "In browsers based on the Chromium open-source project, including Chrome and Edge, an origin can store up to 60% of the total disk size in both persistent and best-effort modes."
> "Chrome currently uses at most 80% of the total disk size." (browser-wide cap over all origins)

web.dev (Google), https://web.dev/articles/storage-for-the-web:
> "Chrome allows the browser to use up to 80% of total disk space. An origin can use up to 60% of the total disk space."
> "In incognito mode, Chrome reduces the amount of storage an origin can use to approximately 5% of the total disk space."
> "If the user has enabled 'Clear cookies and site data when you close all windows' in Chrome, the storage quota is significantly reduced to a maximum of approximately 300MB."

Firefox — MDN eviction page:
> "the maximum storage space an origin can use in best-effort mode is whichever is the smaller of: 10% of the total disk size ... Or 10 GiB, which is the group limit that Firefox applies to all origins that are part of the same site."
> "Origins for which persistent storage has been granted can store up to 50% of the total disk size, capped at 8 TiB, and are not subject to the group limit."

Safari/WebKit — MDN eviction page + WebKit blog https://webkit.org/blog/14403/updates-to-storage-policy/ (Aug 10, 2023, by Sihui Liu):
> MDN: "Starting with macOS 14 and iOS 17: For WebKit-based browser apps, each origin can store up to around 60% of total disk. For other WebKit-based apps that embed web content, each origin can store up to around 15% of total disk. If the user has saved the site as a web app on the Home Screen or the Dock, it uses the same origin quota as the browser app (around 60% of disk space)."
> WebKit blog: "For a browser app, the origin quota is up to 60% of the total disk space. For other apps, the origin quota is up to 15%... the overall quota is up to 80% of the total disk space [browser apps] ... 20% [other apps]"
> MDN: "In earlier versions of Safari, an origin is given an initial 1 GiB quota. Once the origin reaches this limit, Safari asks the user for permission to let the origin store more data."
> Cross-origin iframes: "The quota is currently 10% of the main frame's origin quota." (WebKit blog)

localStorage (if used at all): MDN eviction page: "Web Storage ... is limited to 10 MiB of data maximum on all browsers."

`navigator.storage.estimate()` — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate:
> "asks the Storage Manager for how much storage the current origin takes up (usage), and how much space is available (quota)"
> "The returned values are not exact: between compression, deduplication, and obfuscation for security reasons, they will be imprecise."
> "You may find that the quota varies from origin to origin. This variance is based on factors such as: How often the user visits / Public site popularity data / User engagement signals like bookmarking, adding to homescreen, or accepting push notifications"
Baseline banner: "It's been available across browsers since September 2023."

Practical read: for a links app (tens of MB at most even with cached article text), **quota is a non-issue on every browser**; *eviction* is the whole risk.

### 1.3 Eviction heuristics (documented)

MDN eviction page:

1. Storage pressure (device low on disk):
> "Browsers use a Least Recently Used (LRU) policy to deal with this scenario. The data from the least recently used origin is deleted."
> "This eviction mechanism only applies to origins that are not persistent and skips over origins that have been granted data persistence by using navigator.storage.persist()."

2. Browser-wide cap exceeded:
> "When this happens, the browser starts evicting best-effort origins as described in Storage pressure eviction."

3. **Safari-only proactive eviction (the killer issue)**:
> "Proactively, for origins that aren't used regularly, which happens only in Safari."
> "Safari proactively evicts data when cross-site tracking prevention is turned on. If an origin has no user interaction, such as click or tap, in the last seven days of browser use, its data created from script will be deleted. Cookies set by server are exempt from this eviction."

WebKit blog confirms eviction triggers: "Eviction ... It can happen under a few conditions: when exceeding the overall quota, when the system is under storage pressure, or when the site has not been interacted with by the user for some time (see Intelligent Tracking Prevention)." And LRU recency detail: "The last use time is the time of the last user interaction, or the time of the last storage operation." (note: a background storage write counts as "last use" per this sentence).

Counterweight (Chrome's own research, quoted twice):
> MDN: "research from the Chrome team shows that data is very rarely deleted by the browser. If a user visits a website regularly, there is very little chance that its stored data, even in best-effort mode, will get evicted by the browser."
> web.dev persistent-storage: "It is far more common for users to manually clear storage."

### 1.4 What is UNVERIFIED on durability
- Actual byte quotas on a specific iOS device (quotas are disk-relative and padded for anti-fingerprinting — both MDN and WebKit blog say values are approximate/variable).
- Chrome's numeric site-engagement thresholds for auto-granting persistence ("about://site-engagement/" referenced in Chrome docs but thresholds not published on the fetched pages).
- Whether a Home-Screen-installed Safari web app is *categorically* exempt from the 7-day ITP script-storage eviction: **not stated** in either fetched page (see §2 for what IS stated). Treat as UNVERIFIED and design around it.
- Whether the 7-day eviction deletes the Service Worker registration itself: the fetched pages say "its data created from script will be deleted" (IndexedDB/Cache/localStorage covered as script-created); SW-specific exclusion is UNVERIFIED.

---

## 2. PERSISTENCE: does `navigator.storage.persist()` reduce eviction risk?

**Yes per docs — with big caveats on who grants it.**

MDN https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist:
> "The persist() method ... requests permission to use persistent storage, and returns a Promise that resolves to true if permission is granted and bucket mode is persistent, and false otherwise. The browser may or may not honor the request, depending on browser-specific rules."
> Baseline banner: "It's been available across browsers since December 2021."

Effect (MDN eviction page, quoted in §1.3): persistent origins are **skipped by LRU/storage-pressure eviction** and (per the persist/evict model) deleted only by explicit user action.

Granting behavior (MDN eviction page):
> "In Firefox, when a site chooses to use persistent storage, the user is notified with a UI popup that their permission is requested."
> "Safari and most Chromium-based browsers, such as Chrome or Edge, automatically approve or deny the request based on the user's history of interaction with the site and do not show any prompts to the user."

Chrome heuristics — web.dev https://web.dev/articles/persistent-storage:
> "Chrome, and most other Chromium-based browsers automatically handle the permission request, and do not show any prompts to the user. Instead, if a site is considered important, the persistent storage permission is automatically granted, otherwise it is silently denied."
> "The heuristics to determine if a site is important include: How high is the level of site engagement? Has the site been installed or bookmarked? Has the site been granted permission to show notifications?"
Protected list when granted: "Cache API, Cookies, DOM Storage (Local Storage), File System API, IndexedDB, Service workers".
> "At this time, there is no programmatic way to tell the browser you no longer need persistent storage."

WebKit — storage-policy blog:
> "Origin might be excluded from eviction if it has active page at the time of eviction, or its storage is in persistent mode. By default, all origins use a best-effort mode."
> "An origin can check whether storage is in persistent mode with StorageManager.persisted() and request to change the mode to be persistent with StorageManager.persist(). **WebKit currently grants a request based on heuristics like whether the website is opened as a Home Screen Web App.**"

**Does PWA install change it?** Documented effects of install (Home Screen / dock):
- WebKit: install is an explicit persist-granting heuristic (quote above), and standalone web apps get browser-app quotas (§1.2).
- Chrome: "Has the site been installed or bookmarked?" is an explicit grant heuristic (web.dev quote).
- NOT documented anywhere fetched: install ⇒ immunity from Safari's 7-day ITP proactive eviction. Chain of *documented* facts is: install → persist() more likely granted → persistent origins skipped by eviction. The last step is quoted; the exemption of *ITP* eviction specifically from persistence is only implied ("or its storage is in persistent mode" is listed generally against all eviction). State honestly in product copy: "installing + persistent mode dramatically reduces, but is not documented to eliminate, Safari eviction risk."

Compat (BCD `api.StorageManager.persist`, rendered by the MDN page above): chrome 55, edge 79, firefox 57, **safari 15.2, safari_ios 15.2**. Also web.dev badge line "55 79 57 15.2". So persist() is safe to feature-detect and call everywhere ≥ end-of-2021.

---

## 3. NOTIFICATIONS & RECALL

### 3.1 Notification API

MDN https://developer.mozilla.org/en-US/docs/Web/API/Notification (page last modified Oct 23, 2026):
> "**Limited availability** — This feature is not Baseline because it does not work in some of the most widely-used browsers."
> "Secure context: This feature is available only in secure contexts (HTTPS)" / "Note: This feature is available in Web Workers."
> "going forward browsers will explicitly disallow notifications not triggered in response to a user gesture. Firefox is already doing this from version 72"

MDN https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API:
> "This is fine for desktop, but on most mobile browsers this will throw a TypeError. If you are targeting mobile devices, you should register a service worker and use ServiceWorkerRegistration.showNotification() instead."

Compat table data (BCD `api.Notification` — the dataset the MDN page renders; JS-rendered tables don't appear in page HTML):
- chrome: `version_added: "20"`
- **chrome_android: `version_added: "42"`, `partial_implementation: true`**, note: "A notification can only be sent from a service worker. To show a notification, see ServiceWorkerRegistration.showNotification()."
- safari (macOS): `version_added: "7"`
- **safari_ios: `version_added: "16.4"`, `partial_implementation: true`**, notes: "The Notification interface is undefined, unless the page is a web app saved to the home screen. The app's manifest must have a non-default display value." + "A notification can only be sent from a service worker."
- firefox: 22, firefox_android: 22; webview_android: `false` (impl pending, crbug.com/40443309)

So: **Android Chrome: yes (service-worker-originated). iOS Safari: only since 16.4, only for a Home-Screen-installed web app with a non-default `display` in the manifest, and only from a service worker.** On plain `*.github.io` opened in a normal tab on iOS, `Notification` is `undefined`.

Push API (for server-initiated wake) — BCD `api.PushManager`: safari 16 with note "Notifications are supported on macOS Ventura and later."; safari_ios "16.4" with note "Notifications are supported in web apps saved to the home screen." BUT push requires a server holding VAPID keys to send to the push endpoint — impossible under the no-server constraint. (The no-server conclusion is definitional, not a doc claim.)

### 3.2 Periodic Background Sync

MDN https://developer.mozilla.org/en-US/docs/Web/API/PeriodicSyncManager:
> "**Limited availability** — This feature is not Baseline because it does not work in some of the most widely-used browsers."
> "**Experimental**: This is an experimental technology — Check the Browser compatibility table carefully before using this in production."
> "The PeriodicSyncManager interface ... provides a way to register tasks to be run in a service worker at periodic intervals with network connectivity." Register with `registration.periodicSync.register("get-latest-news", { minInterval: 24 * 60 * 60 * 1000 })`.

Compat (BCD `api.PeriodicSyncManager` / `api.PeriodicSyncEvent`): chrome 80, chrome_android 80, edge 80; **safari: `false`, safari_ios: `false`, firefox: `false`, firefox_android: `false`, webview_android: `false`.** (One-off Background Sync `api.SyncManager` likewise: safari `false` with impl bug webkit.org/b/182565, firefox `false`.)

Chrome docs https://developer.chrome.com/docs/capabilities/periodic-background-sync — even where supported, it is earned and throttled:
> "Chrome is using a site engagement score ( about://site-engagement/ ) to determine if and how often periodic background syncs can happen for a given web app. In other words, a periodicsync event won't be fired at all unless the engagement score is greater than zero, and its value affects the frequency at which the periodicsync event fires."
> "The timing of synchronizations are not controlled by developers."
> "If the person stops frequently interacting with the app, periodic background sync will stop triggering."
> "The background sync activity only occurs on a network that the device has previously connected to."

### 3.3 Fallback (explicit)
Since Safari/Firefox have zero periodic background wake and iOS notifications require an installed PWA: **the only universal recall channel is the on-open digest** — every app launch (tab or installed) renders a locally-computed "what you saved this week / backlog to read" view. Notifications + PBA are an **enhancement tier** for (a) installed PWAs on iOS ≥16.4 and (b) Chrome/Edge (incl. Android) where engagement permits — engagement itself is boosted by exactly the notification-permission signal Chrome docs list (§2 quote).

---

## 4. IMPORT

### 4.1 Netscape Bookmark File Format (what Chrome actually writes — verified from Chromium source)

Fetched: https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/bookmarks/bookmark_html_writer.cc (Chrome's actual exporter; browser-vendor source):

```
"<!DOCTYPE NETSCAPE-Bookmark-file-1>\r\n"
"<!-- This is an automatically generated file.\r\n     It will be read and overwritten.\r\n     DO NOT EDIT! -->\r\n"
"<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\r\n"
"<TITLE>Bookmarks</TITLE>\r\n"
"<H1>Bookmarks</H1>\r\n"
"<DL><p>\r\n"
```
Per-bookmark: `kBookmarkStart = "<DT><A HREF=\""`, then `"\" ADD_DATE=\""`, `"\" ICON=\""`, `" "\">"`, text, `"</A>"`.
Per-folder: `"<DT><H3 ADD_DATE=\""`, `"\" LAST_MODIFIED=\""`, plus `"\" PERSONAL_TOOLBAR_FOLDER=\"true\">"`, `"</H3>"`, children wrapped in `"<DL><p>" ... "</DL><p>"`.
Timestamps: written via `base::Time::FromInternalValue(internal_value).ToTimeT()` (i.e., **Unix epoch seconds**); text passes through `base::EscapeForHTML` (HTML entities).

So a parser must accept: DOCTYPE `NETSCAPE-Bookmark-file-1`; nested `<DL><p>`; `<A HREF>` with `ADD_DATE`, `ICON` (Chrome), and in the wild also `LAST_MODIFIED`, `TAGS` (Firefox dialect), `PERSONAL_TOOLBAR_FOLDER="true"`. Dates are epoch seconds (Chrome; Firefox dialect from memory of docs not fetched → treat TAGS/FAVICONHREF variants as **UNVERIFIED**, parse leniently).

Firefox side: exporter source could not be located this session (attempted `hg.mozilla.org` raw paths and `raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/.../BookmarksHTML.jsm` — all 404; searchfox is a JS app). **Firefox dialect: UNVERIFIED at source level.** Safari dialect (File > Export Bookmarks as HTML): Apple's Safari User Guide page fetched (https://support.apple.com/guide/safari/import-and-export-bookmarks-brwv35554/mac) is a JS-rendered shell — export existence known from Safari UI, exact dialect **UNVERIFIED**. All three browsers demonstrably interoperate with this dialect (it's why any bookmark-importing tool parses it; flagged as inference).

Parsing client-side is trivial with platform features: file drop (`<input type=file>`/Drag-data) + `DOMParser`. No library needed to parse; no CORS involved (local file).

### 4.2 Does Pocket still offer an HTML export? (live check, verbatim)

```
$ curl -s -o /dev/null -w "%{http_code} %{url_effective} redirect:%{redirect_url}" https://getpocket.com/export
302 https://getpocket.com/export redirect:https://getpocket.com/home

$ curl -sIL https://getpocket.com/export
HTTP/2 302
location: /home
...
HTTP/2 200            (for https://getpocket.com/home — a Next.js page, x-powered-by: Next.js)
```
Reported status: **`HTTP/2 302` → `location: /home`** (then 200 on the target). As of fetch time, `getpocket.com/export` no longer serves an export page. No documentation was fetched about Pocket's product status; **whether Pocket offers exports at all now: UNVERIFIED** — but the historically famous export URL does not deliver a file. Plan: accept Pocket *only if* the user already has an HTML file; do not advertise "import from Pocket".

---

## 5. CLIENT-SIDE CONTENT EXTRACTION — npm reality (registry + downloads API, fetched 2026-10-27)

`https://registry.npmjs.org/<pkg>` + `https://api.npmjs.org/downloads/point/last-week/<pkg>` (window 2026-10-20 → 2026-10-26). `unpackedSize` = npm tarball unpacked size, **not** shipped/minified JS size.

| package | latest | published | weekly downloads | unpackedSize |
|---|---|---|---|---|
| @mozilla/readability | 0.6.0 | 2025-03-03 | 2,470,012 | 154,574 B |
| linkedom | 0.18.14 | 2026-10-21 | 5,188,991 | 1,092,231 B |
| cheerio | 1.2.0 | 2026-01-23 | 23,091,274 | 1,011,246 B |
| turndown | 7.2.4 | 2026-04-03 | 9,913,121 | 191,636 B |
| fflate | 0.8.3 | 2026-05-16 | 91,993,419 | 796,742 B |
| idb | 8.0.4 | 2026-10-06 | 23,102,412 | 82,588 B |
| dexie | 4.4.7 | 2026-10-19 | 2,307,388 | 3,242,014 B |
| @huggingface/transformers | 4.3.2 | 2026-10-27T18:15:37.302Z | 3,118,178 | 9,990,867 B |

All healthy and actively maintained. Min-gzipped browser sizes were not in registry fields → **UNVERIFIED** per-package wire size.

Key one — @mozilla/readability README (from registry doc, same URL family):
> "A standalone version of the readability library used for Firefox Reader View."
> "You can then `require()` it, or for web-based projects, load the `Readability.js` script from your webpage."
> "If you use Readability in a web browser, you will likely be able to use a `document` reference from elsewhere (e.g. fetched via XMLHttpRequest, **in a same-origin `<iframe>` you have access to**, etc.)."
> Options include `charThreshold` ("the number of characters an article must have in order to return a result", default 500).

Note the readme's own phrasing "same-origin `<iframe>` you have access to" — the DOM-input requirement is only half the problem; §6 (CORS) is the binding constraint. In a browser, `DOMParser().parseFromString(htmlText, "text/html")` supplies the required Document, so linkedom/cheerio are only needed if you receive raw HTML *text* and want cheaper parsing than DOMParser (which is native) — for v1, DOMParser + readability ≈ 155 KB unpacked, zero DOM libs.
idb (82 KB unpacked) is enough for IndexedDB; dexie is heavier (3.2 MB unpacked, includes all builds). fflate for zip (if ever importing/exporting bundles), turndown for HTML→Markdown of extracted content.

---

## 6. CORS REALITY CHECK — can a static page fetch arbitrary article HTML? **No.**

MDN https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS (Baseline "available across browsers since July 2015"):
> "For security reasons, browsers restrict cross-origin HTTP requests initiated from scripts. For example, `fetch()` and `XMLHttpRequest` follow the same-origin policy. This means that a web application using those APIs can only request resources from the same origin the application was loaded from **unless the response from other origins includes the right CORS headers**."
> "the server still must opt-in using `Access-Control-Allow-Origin` to share the response with the script."
> "In response, the server returns an `Access-Control-Allow-Origin` header with `Access-Control-Allow-Origin: *`, which means that the resource can be accessed by any origin."

Mechanically: the browser *may* perform the request, but without the target's `Access-Control-Allow-Origin` response header naming our origin (or `*`), the response body is withheld from JS. Most publishers/news sites do not set ACAO on article pages (they are HTML documents, not APIs — inference from the mechanism, which is fully documented above). A static Pages site cannot change this; `<meta>` tags, service-worker intercepts (same fetch rules apply to the client request) and everything else client-side are powerless.

The workaround ecosystem, with fetched primary text:

- **allOrigins** — README https://raw.githubusercontent.com/gnuns/allOrigins/master/README.md and https://allorigins.win/ :
  > "Pull contents from any page via API (as JSON/P or raw) and avoid Same-origin policy problems."
  > "A free and open source javascript clone of AnyOrigin ... but with support to gzipped pages."
  > Self-host path: "Clone the repo ... npm install ... npm start # the default port is 1458".
  No rate limits stated on README or homepage → their public service limits are **UNVERIFIED**; free public endpoints imply no SLA, availability or privacy guarantees (they see every URL the user saves — a privacy consideration for a "local-first" pitch).
- **corsproxy.io** — fetched https://corsproxy.io/ :
  > "Stop being blocked by Access-Control-Allow-Origin errors. Proxy any API or domain in seconds — no config needed."
  > "Free tier: up to 10,000 requests and 1 GB/month." / usage requires `https://corsproxy.io/?key=YOUR_API_KEY&url=...`
  An API key in client JS = public key = quota abuse risk, and it violates the stated "no third-party API keys" constraint.
- A self-hosted proxy is not "static" (rule out; it's the server we said we wouldn't have).
- Bookmarklet idea (runs script in the target page's own origin, extracts there, returns text) — mechanism follows from ordinary same-origin script execution, but I fetched no doc this session: flag **UNVERIFIED** here; worth a spike.

**Honest v1 ingestion options (no hand-waving):**
1. **User drops an exported bookmarks HTML file** (Chrome/Edge verified in §4; parse offline — no CORS at all). Captures URL+title+date; no body text.
2. **User pastes article text** (or the page's selection). 100% reliable, zero infra; one extra step in the loop.
3. **User opens the link, reads on the publisher's site** — v1 is a link manager with titles/notes/tags; content snapshot is deferred.
4. **Optional, clearly-labeled user-supplied CORS proxy** (their own deployment, e.g. allOrigins self-host commands in README) — with an explicit in-UI warning: third-party sees your URLs, breaks when their limit/uptime breaks, never enabled by default.
5. (Deferred/spike) bookmarklet-based capture; (deferred) browser extension.

---

## 7. SEARCH/RANKING WITHOUT SERVERS

Platform-only full-text approach (all names cited):

- Tokenization: **Intl.Segmenter** — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter: "The Intl.Segmenter object enables locale-sensitive text segmentation, enabling you to get meaningful items (graphemes, words or sentences) from a string." Banner: "Baseline Widely available ... available across browsers since April 2024." BCD: chrome/chrome_android 87, safari 14.1, safari_ios 14.5, **firefox 125, firefox_android 125** (word granularity). Good enough: pre-FF-125 fallback = `/\p{L}+/gu` regex tokens.
- Normalization: `String.prototype.normalize`/`toLocaleLowerCase` and **Intl.Collator** — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator: "enables language-sensitive string comparison", Baseline "since September 2017".
- URL canonicalization: **URL** constructor — https://developer.mozilla.org/en-US/docs/Web/API/URL, Baseline "since July 2015" (with "* Some parts of this feature may have varying levels of support" caveat visible on page).
- Index: `Map<token, Set<docId>>` + per-doc token counts, built in a Web Worker at first save and incrementally updated; scoring = BM25/TF-IDF hand-rolled (~80 LOC) + recency boost + domain/tag boosts; fuzzy fallback = Levenshtein/subsequence over the dictionary keys (dictionary is small: unique tokens only). BM25 is a textbook IR formula — no web doc fetched; flagged as algorithm choice, not a browser-support claim.
- Storage layer for the index: `idb` (§5 data) — IndexedDB itself is fully durable-capable (§1) and "is a Web API for storing large data structures in the browser and indexing them for high-performance searching" (MDN eviction page, technology table).

Scale sanity (inference, not a doc claim): 5k saved links × ~2KB text ≈ 10 MB text, index in a few MBs → far below any quota; whole index fits in memory.

**transformers.js embeddings — payload realism.** Registry (fetched): `@huggingface/transformers` latest **4.3.2**, published **2026-10-27T18:15:37.302Z** (i.e., today), npm unpacked **9,990,867 B (~10 MB)**, 3.1M weekly downloads. README (registry):
> "Run 🤗 Transformers directly in your browser, with no need for a server! ... By default, when running in the browser, the model will be run on your CPU (via WASM). If you would like to run the model on your GPU (via WebGPU), you can set `device: 'webgpu'`".
The ~10 MB is the JS package only; model weights (multi-MB to tens-of-MB per model) download at runtime from the Hugging Face CDN — weight sizes and HF-CDN CORS behavior were **UNVERIFIED** (not on the pages fetched). Verdict: **not in the default payload** (a static site's first paint must not pull 10 MB + weights on a mobile network); acceptable only as an opt-in "semantic search pack" lazily imported and cached, and even then it adds a third-party runtime dependency that cuts against the pure-static story. Classic inverted index + BM25 carries v1.

---

## 8. OFFLINE on GitHub Pages

Service worker itself (client-side, independent of host): BCD `api.ServiceWorkerGlobalScope`: chrome 40, safari 11.1, **safari_ios 11.3**, firefox 44, edge 17. MDN persist() page shows SW-era Baseline features fine. An app-shell + cached links DB can serve offline from `*.github.io` like any HTTPS origin.

GitHub Pages is static — https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages:
> "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository on GitHub, optionally runs the files through a build process, and publishes a website."

Limits — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits:
> "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)."
> "GitHub Pages sites shouldn't be used for sensitive transactions like sending passwords or credit card numbers."
> "Published GitHub Pages sites may be no larger than 1 GB."
> "GitHub Pages sites have a soft bandwidth limit of 100 GB per month."
> "GitHub Pages sites have a soft limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow."
> "If your request triggers rate limiting, you will receive an appropriate response with an HTTP status code of 429, along with an informative HTML body."

**Custom cache-control / response headers:** I fetched the two docs pages above and searched them for "header"/"cache-control" — **absent**; the REST "Pages" docs section (cache invalidation endpoint) renders via JS and could not be text-extracted, and the GitHub Community search endpoint returned non-JSON. Conclusion stated honestly: **GitHub's docs found this session offer no way to configure HTTP response headers (including `Cache-Control`) or redirects for Pages** — the only redirect mechanism documented is build-tooling (Jekyll) front-matter 404/redirect pages, not headers. Default TTL behavior on Pages: **UNVERIFIED** (not documented in fetched pages; folk knowledge of "max-age=600" not relied upon). Practical impact: (a) you cannot force long immutable caching nor `no-store` per asset; (b) your service worker — not server headers — is the only freshness control you own; (c) SW updates then rely on browser default heuristics for the registered `sw.js` — acceptable, but "instant updates" must not be promised.

Does "works offline" survive first contact with iOS? The offline copy lives in SW Cache/IndexedDB, which on Safari is exactly the "data created from script" subject to §1.3 7-day proactive eviction ("Cookies set by server are exempt from this eviction" — our data is not cookies). So: offline works for an engaged user (daily/weekly opens), and **persistence + install materially improve but are not documented to guarantee it**.

---

## UNVERIFIED register (consolidated)
1. Install-on-iOS ⇒ categorical immunity from 7-day ITP storage eviction — not stated on any fetched page.
2. Exact Chrome engagement thresholds for auto-granting persist(); existence of persist grant for `*.github.io` in practice.
3. Firefox/Safari Netscape-dialect attributes beyond Chrome's verified set (TAGS, FAVICONHREF, epoch-seconds in FF dialect).
4. Pocket's current export availability as a product feature (URL 302s to /home; no doc fetched).
5. Public CORS-proxy rate limits (allOrigins), and corsproxy.io behavior beyond the quoted homepage.
6. Shipped min-gzip wire sizes of all §5 packages; transformers.js model weight sizes + HF CDN CORS behavior.
7. GitHub Pages default `Cache-Control` TTLs; any hidden headers feature.
8. Whether ITP 7-day eviction removes the SW registration itself (only "data created from script" is quoted).
9. Bookmarklet capture mechanism (no doc fetched this session).
10. Any real-world measured Safari github.io-origin eviction (would require device testing — recommend a spike before launch copy).
