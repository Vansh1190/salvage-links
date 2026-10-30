# The 40-day trial, and where billing would attach

## What ships
First import starts a 40-day Pro trial. The clock is a timestamp (`firstRunAt`) written into the
app's own IndexedDB settings row; `getEntitlement()` in `src/trial.ts` derives everything from it.

| | Free, forever | Pro (trial, then locked) |
| --- | --- | --- |
| daily deck | up to 5 cards | choose up to 20 |
| library | up to 300 links | unlimited |
| search, queue, pulse, browsing everything you own | yes | yes |
| import, JSON export, bookmarks.html export | yes | yes |
| duplicate cleanup, bulk folder rename, notes, CSV export, .ics reminder | locked | yes |

Enforcement points, all in one place:
- `freeHeadroom()` → every import path (bookmarks file, pasted links, restored JSON)
- `allowedDeckFor()` → the deck cut, clamped by plan
- `has(capability, entitlement)` → Pro UI affordances

## What is deliberately NOT done
- **No lock-in.** After day 41 you can still browse, search, deck and export everything. A product
  about link rot will not become a dead link itself. Links beyond the cap are simply not *imported*
  while on the free plan — nothing already in your library is trimmed, hidden or deleted.
- **No fingerprinting** to stop a reset. The UI says the trial is soft and that clearing site data
  resets it. That sentence is the honest trade for having no server.

## Where a payment provider plugs in
1. `getEntitlement(settings, now)` is the single read point. It already returns
   `{ plan, proActive, linkLimit, deckSize, reason }`.
2. Add a `licence` record (email + provider subscription id + expiry) into the same settings row,
   and have `getEntitlement()` prefer a **signed** licence over `firstRunAt` maths.
   Verification is where a public key check belongs — deliberately absent in v1, since there is
   nothing to verify without a payment provider.
3. Checkout cannot happen on GitHub Pages: it needs a server or a provider-hosted page
   (Stripe/Paddle/LemonSqueezy payment links or a customer portal). Keep the button linking out to
   that hosted page; the return path can be a licence key the user pastes in, which keeps the site static.
4. Day-35 and day-40 prompts belong in `views.ts` next to the existing trial chip — the copy is
   already written there; do not make it darker than "you lose the Pro tools, not your links".

## Trial-expiry behaviour is tested
`e2e/app.spec.ts` → "the 40-day clock really changes what the deck may deal" rewrites `firstRunAt`
to 45 days ago **inside IndexedDB**, reloads, and asserts: chip says trial ended, a deck-size
setting of 12 yields `1 of 5`, the soft-trial sentence is visible, and Pro capabilities are locked.
