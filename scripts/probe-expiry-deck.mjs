/**
 * Does an expired plan really stop dealing Pro-sized decks?
 * Sets deck size to 12 during the trial, lets it cut today's deck, then rewinds the trial
 * clock 45 days and reloads — the way day 41 would actually find a returning user.
 * Run: node scripts/probe-expiry-deck.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "/root/workspace-agent-server/dailyscale/node_modules/playwright-core/index.mjs";

const PORT = 4369;
const BASE = "http://127.0.0.1:" + PORT + "/salvage-links/";
const srv = spawn("node", ["scripts/serve-subpath.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));

const b = await chromium.launch();
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));

await p.goto(BASE, { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-route='import']");
await p.click("[data-route='import']");
await p.click("[data-testid='demo-load']");
await p.waitForFunction(() => /added/.test(document.querySelector("[data-testid='import-status']")?.textContent || ""));

await p.click("[data-route='settings']");
await p.getByLabel("Cards per day").fill("12");
await p.getByTestId("save-deck").click();
await p.waitForSelector("[data-testid='settings-feedback']");
const saved = await p.textContent("[data-testid='settings-feedback']");

await p.click("[data-route='deck']");
await p.waitForSelector("[data-testid='deck-card']");
const during = await p.textContent("[data-testid='deck-pos']");

await p.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("salvage", 2);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const t = db.transaction("meta", "readwrite");
    const store = t.objectStore("meta");
    const g = store.get("settings");
    g.onsuccess = () => {
      const row = g.result;
      row.value = { ...row.value, firstRunAt: Date.now() - 45 * 86400000 };
      store.put(row);
    };
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  db.close();
});

await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-route='deck']");
await p.click("[data-route='deck']");
await p.waitForSelector("[data-testid='deck-card']");
const after = await p.textContent("[data-testid='deck-pos']");
const chip = await p.textContent(".chip-locked, .chip-trial, .head-right .chip");
const lockedCaps = await p.evaluate(async () => {
  const rows = [];
  return rows;
});

console.log("1) saved setting said:            " + (saved || "").trim());
console.log("2) deck while on trial:           " + during);
console.log("3) chip after expiry:             " + (chip || "").trim());
console.log("4) deck on the SAME DAY after the trial ended: " + after + "   <-- free plan should deal at most 5");
console.log("   pageerrors: " + (errors.length ? errors.join(" | ") : "none"));
await b.close();
srv.kill();
