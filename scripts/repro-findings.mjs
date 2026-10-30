/**
 * Reproduces two code-review findings against the BUILT app, so they are not just my reading:
 *  A) the expired-trial sentence shown in Settings (is the link cap number present?)
 *  B) a link whose `id` contains a quote/bracket, as a hostile or corrupted export could
 *     deliver, reaching the CSS attribute selector used to restore focus after a re-render.
 * Run: node scripts/repro-findings.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 4341;
const BASE = `http://127.0.0.1:${PORT}/salvage-links/`;
const server = spawn(process.execPath, ["scripts/serve-subpath.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-route='import']");
await page.click("[data-route='import']");
await page.click("[data-testid='demo-load']");
await page.waitForFunction(() => /added/.test(document.querySelector("[data-testid='import-status']")?.textContent || ""), null, { timeout: 30000 });

/* ---- A) expired-trial copy ---- */
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
      const row = g.result;
      row.value = { ...row.value, firstRunAt: Date.now() - 45 * 86400000, deckSize: 12 };
      store.put(row);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  database.close();
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.click("[data-route='settings']");
await page.waitForSelector("#trial-h");
const trialText = await page.textContent("[aria-labelledby='trial-h'] p");
console.log("A) expired-trial sentence rendered as:\n   " + JSON.stringify(trialText));
console.log("   contains the number 300?  " + /\b300\b/.test(trialText || ""));
console.log("   contains a double space (missing interpolation)?  " + /  /.test(trialText || ""));

/* ---- B) hostile id reaching the focus selector ---- */
const evilId = 'a"], [data-focus-key^="b';
await page.evaluate(async (id) => {
  const database = await new Promise((resolve, reject) => {
    const r = indexedDB.open("salvage", 2);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const link = {
    id,
    url: "https://example.com/evil-id",
    title: "hostile id probe",
    folder: "Probe",
    domain: "example.com",
    dedupeKey: "https://example.com/evil-id",
    addDate: Date.now() - 400 * 86400000,
    importedAt: Date.now(),
    status: "queued",
    kept: true,
    note: "",
    openCount: 1,
    lastOpenedAt: Date.now(),
    deckCount: 0,
    lastDeckAt: null,
    snoozedUntil: null,
    tags: [],
  };
  await new Promise((resolve, reject) => {
    const t = database.transaction("links", "readwrite");
    t.objectStore("links").put(link);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  database.close();
}, evilId);

errors.length = 0;
await page.reload({ waitUntil: "domcontentloaded" });
let rendered = false;
try {
  await page.waitForSelector("[data-route='queue']", { timeout: 8000 });
  rendered = true;
} catch {}
await page.click("[data-route='queue']").catch(() => {});
await page.waitForTimeout(600);
const queueRows = await page.locator(".link-row").count().catch(() => -1);
console.log("\nB) after seeding a link with id " + JSON.stringify(evilId));
console.log("   app rendered shell:  " + rendered);
console.log("   queue rows visible:  " + queueRows);
console.log("   pageerrors:          " + (errors.length ? errors.slice(0, 2).join(" | ").slice(0, 200) : "none"));

/* direct probe of the selector the renderer builds */
const selectorProbe = await page.evaluate((id) => {
  const sel = `[data-focus-key="row:${id}:done"]`;
  try {
    document.querySelector(sel);
    return "selector accepted: " + sel.slice(0, 40);
  } catch (e) {
    return "THROWS " + e.name + ": " + e.message.slice(0, 80);
  }
}, evilId);
console.log("   selector probe:      " + selectorProbe);

await browser.close();
server.kill();
