/**
 * Verifies the DEPLOYED site, not the local build. Checks the things that only break in
 * production: sub-path asset URLs, service-worker scope, offline reload, MIME types that
 * GitHub Pages picks for us, and the privacy claim that nothing leaves the browser.
 *
 * Usage: node scripts/verify-live.mjs [url]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = process.argv[2] || "https://vansh1190.github.io/salvage-links/";
const SITE_ORIGIN = new URL(TARGET).host;
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log((pass ? "PASS  " : "FAIL  ") + name + (detail ? "  — " + detail : ""));
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const errors = [];
const external = [];
const responses = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.host !== SITE_ORIGIN) external.push(u.host + u.pathname);
});
page.on("response", (r) => responses.push({ url: r.url(), status: r.status(), type: r.headers()["content-type"] || "" }));

console.log("verifying " + TARGET);
await page.goto(TARGET, { waitUntil: "load", timeout: 45000 });

/* 1. shell + assets resolved under the project sub-path */
await page.waitForSelector("[data-route='deck']", { timeout: 20000 });
record("app boots on the live URL", true, await page.title());
const cssHref = await page.evaluate(() => document.querySelector('link[rel="stylesheet"]')?.href ?? "");
const jsSrc = await page.evaluate(() => document.querySelector('script[type="module"]')?.src ?? "");
const cssLoaded = responses.some((r) => r.url === cssHref && r.status === 200);
const jsLoaded = responses.some((r) => r.url === jsSrc && r.status === 200);
record("stylesheet linked and 200 under the sub-path", cssLoaded, cssHref);
record("module script 200 under the sub-path", jsLoaded, jsSrc);
const styled = await page.evaluate(() => getComputedStyle(document.querySelector(".brand a")).color);
record("CSS actually applied (brand colour not default black)", styled !== "rgb(0, 0, 0)", styled);

/* 2. manifest + service worker at the right scope, with the MIME Pages chose */
// Chromium only fetches the manifest lazily, so request it the way a browser would.
const manifestUrl = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href ?? "");
const manifestProbe = manifestUrl ? await page.request.get(manifestUrl) : null;
record("manifest linked and served", !!manifestProbe && manifestProbe.ok(), manifestUrl + (manifestProbe ? " -> " + manifestProbe.status() + " " + (manifestProbe.headers()["content-type"] || "") : " -> no link element"));
const iconProbe = await page.request.get(new URL("icon-192.png", manifestUrl || TARGET).href);
record("manifest icon served (installability)", iconProbe.ok(), "icon-192.png -> " + iconProbe.status());
await page.waitForFunction(() => "serviceWorker" in navigator, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(3500);
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { controlled: !!navigator.serviceWorker.controller, scope: reg?.scope ?? null, state: reg?.active?.state ?? reg?.installing?.state ?? null };
});
record("service worker registered on the live origin", !!sw.scope, JSON.stringify(sw));

/* 3. real user flow on production data */
await page.click("[data-route='import']");
await page.click("[data-testid='demo-load']");
await page.waitForFunction(() => /added/.test(document.querySelector("[data-testid='import-status']")?.textContent || ""), null, { timeout: 40000 });
const status = await page.textContent("[data-testid='import-status']");
const added = Number(/(\d+) added/.exec(status || "")?.[1] || 0);
record("demo import works live", added > 100, status);
await page.click("[data-route='deck']");
await page.waitForSelector("[data-testid='deck-card']", { timeout: 20000 });
const cardTitle = await page.textContent(".deck-title");
record("deck deals a card live", (cardTitle || "").trim().length > 3, cardTitle);
await page.click("[data-action='keep']");
await page.waitForTimeout(700);
const pos = await page.textContent("[data-testid='deck-pos']");
record("triage advances the deck", /2 of/.test(pos || ""), pos);
await page.screenshot({ path: join(ROOT, "shots", "live-deck-desktop.png"), fullPage: true });

/* 4. reload keeps state (IndexedDB on the real origin) */
await page.reload({ waitUntil: "load" });
await page.waitForSelector("[data-route='deck']", { timeout: 20000 });
await page.click("[data-route='deck']");
await page.waitForSelector("[data-testid='deck-card']", { timeout: 20000 });
const posAfter = await page.textContent("[data-testid='deck-pos']");
record("library and progress survive a reload", /2 of/.test(posAfter || ""), posAfter);

/* 5. offline reload, served by the deployed service worker */
await page.waitForTimeout(2500);
await ctx.setOffline(true);
let offlineOk = false;
let offlineDetail = "";
try {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForSelector("[data-route='pulse']", { timeout: 20000 });
  await page.click("[data-route='pulse']");
  await page.waitForSelector("[data-testid='pulse-title']", { timeout: 15000 });
  const pile = await page.textContent(".stats dd");
  offlineOk = Number((pile || "0").replace(/,/g, "")) >= added - 5;
  offlineDetail = "pile " + pile;
} catch (e) {
  offlineDetail = String(e.message).split("\n")[0];
}
await ctx.setOffline(false);
record("works with the network off (deployed SW)", offlineOk, offlineDetail);

/* 6. privacy: no request left the Pages origin */
/* 6b. the lapsed-trial copy states a real number, and the deck shrinks to the free size */
await page.evaluate(async () => {
  const database = await new Promise((resolve, reject) => {
    const r = indexedDB.open("salvage", 2);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise((resolve, reject) => {
    const t = database.transaction("meta", "readwrite");
    const store = t.objectStore("meta");
    const g = store.get("settings");
    g.onsuccess = () => {
      g.result.value = { ...g.result.value, firstRunAt: Date.now() - 45 * 86400000, deckSize: 12 };
      store.put(g.result);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  database.close();
});
await page.goto(TARGET + "#/deck", { waitUntil: "load" });
await page.reload({ waitUntil: "load" });
await page.waitForSelector('[data-testid="deck-pos"]', { timeout: 20000 });
const chip = await page.evaluate(() => document.querySelector(".chip")?.textContent ?? "");
const deckPos = await page.evaluate(() => document.querySelector('[data-testid="deck-pos"]')?.textContent ?? "");
record("lapsed plan shrinks the deck it already cut", /of 5$/.test(deckPos.trim()) && !/of (6|7|8|9|1[0-9])$/.test(deckPos.trim()), chip + " | deck: " + deckPos);
await page.evaluate(() => { location.hash = "#/settings"; });
await page.waitForSelector('[data-testid="plan-line"]', { timeout: 20000 });
const trialCopy = await page.evaluate(() => [...document.querySelectorAll("section.card p")].map((x) => x.textContent || "").find((t) => t.includes("Trial ended")) ?? "");
record("lapsed-trial copy names the link cap", trialCopy.includes("first 300") && !/ {2}/.test(trialCopy), trialCopy.slice(0, 90) + (trialCopy.length > 90 ? "..." : ""));
const planLine = await page.evaluate(() => document.querySelector('[data-testid="plan-line"]')?.textContent ?? "");
record("settings reports carried links vs cap", /carried/.test(planLine) && /free cap 300/.test(planLine), planLine);

record("no third-party requests", external.length === 0, external.slice(0, 4).join(", "));
record("no console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

/* 7. mobile viewport on production */
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mpage = await mob.newPage();
await mpage.goto(TARGET, { waitUntil: "load", timeout: 45000 });
await mpage.waitForSelector("[data-route='deck']", { timeout: 20000 });
const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
record("no horizontal overflow at 390px", overflow <= 1, overflow + "px");
mkdirSync(join(ROOT, "shots"), { recursive: true });
await mpage.screenshot({ path: join(ROOT, "shots", "live-mobile.png") });

const passed = results.filter((r) => r.pass).length;
console.log("\n" + passed + "/" + results.length + " live checks passed");
await browser.close();
process.exit(passed === results.length ? 0 : 1);
