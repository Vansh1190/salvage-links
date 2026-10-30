# Privacy

**Salvage collects nothing.** No analytics, no error reporting, no accounts, no cookies, no
fingerprinting, no fonts or scripts from other origins. After the first load, every network
request the page makes is for its own files on `vansh1190.github.io`. You can confirm this in
DevTools → Network, including while triaging cards.

## Where your data lives

| Data | Location | Why the app needs it |
| --- | --- | --- |
| Links, titles, folders, save dates | IndexedDB, this browser profile | the product |
| Your decisions (kept / tossed / read), notes, deck history, streak, trial clock | same IndexedDB | to deal tomorrow's deck and show progress |
| `salvage:sync` timestamp | localStorage | tells other tabs of the same browser to reload state |

Nothing is sent anywhere. Deleting the data is one click: **Settings → Delete everything**
(or clear site data, which also resets the trial clock — we accept that rather than identify you).

## Deliberate omissions

- No dead-link scanning of your library, because that would mean sending your URLs to a
  third-party proxy. You can open a card and toss it yourself.
- No article-text archiving, because a static page cannot fetch other origins without their
  opt-in; the workaround would be routing your links through someone else's server.
- No sync, no backup service, no "sign in with…". Cross-device sync is the natural paid
  feature later, and if it ever appears it must be opt-in with your own storage keys.

## When you click a card

`Open` runs `window.open` on the saved URL. That is a normal browser navigation: the destination
site sees your usual request (IP, user agent, referrer policy `no-referrer` is set on links).
We add nothing to it and set no cookies ourselves.

## Repository hygiene

No tokens, credentials or personal data are committed. The demo library is a generated file of
public URLs that answered HTTP 200 during curation (`docs/SAMPLE-STATUS.md`); its folders and
save dates are synthetic, and no real person's browser was used.
