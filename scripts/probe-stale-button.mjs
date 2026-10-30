/**
 * Measures the "Return stalled to the pile" button on a realistic junk library, because the
 * handler loops N un-awaited state changes and every one of them re-renders the whole app.
 * Run: node scripts/probe-stale-button.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 4347;
const BASE = `http://127.0.0.1:${PORT}/salvage-links/`;
const STALE = Number(process.argv[2] || 1200);
const server = spawn(process.execPath, ["scripts/serve-subpath.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-route='import']");
await page.click("[data-route='import']");
await page.click("[data-testid='demo-load']");
await page.waitForFunction(() => /added/.test(document.querySelector("[data-testid='import-status']")?.textContent || ""), null, { timeout: 30000 });

const seeded = await page.evaluate(async (n) => {
  const database = await new Promise((resolve, reject) => {
    const r = indexedDB.open("salvage", 2);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const old = Date.now() - 90 * 86400000;
  const links = [];
  for (let i = 0; i < n; i++) {
    links.push({
      id: "stale-" + i,
      url: "https://stale.example/" + i,
      title: "stale queue item " + i,
      folder: "Stale",
      domain: "stale.example",
      dedupeKey: "https://stale.example/" + i,
      addDate: old - i * 86400000,
      importedAt: old,
      status: "queued",
      kept: false,
      note: "",
      openCount: 1,
      lastOpenedAt: old,
      deckCount: 0,
      lastDeckAt: null,
      snoozedUntil: null,
      tags: [],
    });
  }
  await new Promise((resolve, reject) => {
    const t = database.transaction("links", "readwrite");
    for (const l of links) t.objectStore("links").put(l);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  database.close();
  return links.length;
}, STALE);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-route='queue']");
const t0 = Date.now();
await page.click("[data-route='queue']");
await page.waitForSelector("text=/waiting/", { timeout: 20000 });
const label = await page.textContent("[data-testid='queue-count']");
const btn = page.locator("text=Return stalled to the pile");
const hasBtn = (await btn.count()) > 0;
const tRender = Date.now() - t0;

let clickMs = -1;
let pileAfter = "n/a";
if (hasBtn) {
  const t1 = Date.now();
  await btn.click();
  await page.waitForTimeout(120);
  clickMs = Date.now() - t1;
  pileAfter = (await page.textContent(".progress-text")) || "n/a";
}

const t2 = Date.now();
await page.click("[data-route='pulse']");
await page.waitForSelector("[data-testid='pulse-title']");
const pulseMs = Date.now() - t2;

console.log(`library: ${seeded} stale queued links seeded on top of the demo set`);
console.log(`queue label: ${label}`);
console.log(`open queue + render: ${tRender} ms`);
console.log(`"Return stalled" click blocked the main thread for ~${clickMs} ms (button present: ${hasBtn})`);
console.log(`progress line right after the click: ${pileAfter}`);
console.log(`open pulse afterwards: ${pulseMs} ms`);
console.log(`pageerrors: ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`);
await browser.close();
server.kill();
