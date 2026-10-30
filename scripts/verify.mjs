/**
 * Two things Lighthouse could not see: the accessibility tree with a populated library,
 * and how the app behaves at the size of a real bookmark export.
 * Writes docs/VERIFY.md.  Usage: node scripts/verify.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = 4291;
const base = `http://127.0.0.1:${port}/salvage-links/`;
const out = [];
const log = (s) => {
  out.push(s);
  console.log(s);
};

function bookmarksHtml(n) {
  const hosts = ["github.com", "news.ycombinator.com", "developer.mozilla.org", "stackoverflow.com", "arxiv.org", "youtube.com", "reddit.com", "example.org"];
  const folders = ["dev", "read later", "work", "watch", "old tabs"];
  const per = Math.ceil(n / folders.length);
  let s = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  for (const f of folders) {
    s += `    <DT><H3>${f}</H3>\n    <DL><p>\n`;
    for (let i = 0; i < per; i++) {
      const host = hosts[i % hosts.length];
      const ts = 1480000000 + ((i * 7919) % 250000000);
      s += `        <DT><A HREF="https://${host}/p/${f.replace(/\s/g, "")}/${i}?utm_source=bookmarks" ADD_DATE="${ts}">${f} item ${i} on ${host} with a reasonably long title for indexing</A>\n`;
    }
    s += "    </DL><p>\n";
  }
  return s + "</DL><p>\n";
}

const server = spawn(process.execPath, [join(root, "scripts", "serve-subpath.mjs"), String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch();
const errors = [];

async function seed(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => new Promise((res) => indexedDB.deleteDatabase("salvage").onsuccess = res));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('[data-route="import"]');
  await page.click("[data-testid=demo-load]");
  await page.waitForFunction(() => /added/.test(document.querySelector('[data-testid="import-status"]')?.textContent ?? ""), null, { timeout: 30000 });
}

const ROUTES = ["deck", "queue", "library", "pulse", "import", "settings", "limits"];

const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const desk = await deskCtx.newPage();
desk.on("pageerror", (e) => errors.push(`desktop pageerror: ${e.message}`));
desk.on("console", (m) => m.type() === "error" && errors.push(`desktop console: ${m.text()}`));
await seed(desk);
for (const route of ROUTES) {
  await desk.click(`[data-route="${route}"]`);
  await desk.waitForTimeout(400);
  const res = await new AxeBuilder({ page: desk }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const detail = res.violations.map((v) => `${v.id}(${v.impact}×${v.nodes.length})`).join(", ");
  log(`desktop /${route.padEnd(8)} axe violations: ${res.violations.length}${detail ? " → " + detail : ""}`);
  if (res.violations.length) {
    for (const v of res.violations.slice(0, 3)) log(`    ${v.id}: ${v.help} | ${v.nodes[0]?.target?.join(" ") ?? ""} | ${v.nodes[0]?.failureSummary?.replace(/\s+/g, " ").slice(0, 160) ?? ""}`);
  }
}
await deskCtx.close();

const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mob = await mobCtx.newPage();
mob.on("pageerror", (e) => errors.push(`mobile pageerror: ${e.message}`));
await seed(mob);
for (const route of ["deck", "pulse", "library", "settings"]) {
  await mob.click(`[data-route="${route}"]`);
  await mob.waitForTimeout(350);
  const res = await new AxeBuilder({ page: mob }).withTags(["wcag2a", "wcag2aa"]).analyze();
  log(`mobile  /${route.padEnd(8)} axe violations: ${res.violations.length}${res.violations.length ? " → " + res.violations.map((v) => `${v.id}(${v.impact})`).join(", ") : ""}`);
}
const overflowX = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
log(`mobile 390px horizontal overflow: ${overflowX}px`);
await mob.screenshot({ path: join(root, "shots", "verify-mobile-deck.png") });
await mobCtx.close();

const bigCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const big = await bigCtx.newPage();
big.on("pageerror", (e) => errors.push(`10k pageerror: ${e.message}`));
await big.goto(base, { waitUntil: "domcontentloaded" });
await big.evaluate(() => new Promise((res) => indexedDB.deleteDatabase("salvage").onsuccess = res));
await big.reload({ waitUntil: "domcontentloaded" });
await big.click('[data-route="import"]');
const t0 = Date.now();
await big.setInputFiles("#file", { name: "bookmarks.html", mimeType: "text/html", buffer: Buffer.from(bookmarksHtml(10000), "utf8") });
await big.waitForFunction(() => /added/.test(document.querySelector('[data-testid="import-status"]')?.textContent ?? ""), null, { timeout: 180000 });
const importMs = Date.now() - t0;
const stored = await big.evaluate(() => (document.querySelector(".progress-text")?.textContent ?? "").trim());
await big.click('[data-route="deck"]');
await big.waitForSelector("[data-testid=deck-card]");
const t1 = Date.now();
await big.click("[data-action=toss]");
await big.waitForSelector('[data-testid="deck-pos"]:has-text("2 of")');
const triageMs = Date.now() - t1;
const t2 = Date.now();
await big.click('[data-route="pulse"]');
await big.waitForSelector('[data-testid="pulse-title"]');
const pulseMs = Date.now() - t2;
await big.click('[data-route="library"]');
const t3 = Date.now();
await big.fill("#search-box", "mozilla");
await big.waitForFunction(() => /matches for/.test(document.querySelector('[data-testid="library-count"]')?.textContent ?? ""), null, { timeout: 120000 });
const searchMs = Date.now() - t3;
const t4 = Date.now();
await big.fill("#search-box", "read later item 4");
await big.waitForFunction(() => /matches for/.test(document.querySelector('[data-testid="library-count"]')?.textContent ?? ""), null, { timeout: 120000 });
const search2Ms = Date.now() - t4;
const heap = await big.evaluate(() => (performance).memory?.usedJSHeapSize ?? 0);
const quota = await big.evaluate(async () => (await navigator.storage.estimate()));
log(`10k links: import ${importMs} ms (${stored})`);
log(`10k links: triage ${triageMs} ms · pulse ${pulseMs} ms · first search ${searchMs} ms · second search ${search2Ms} ms (index is reused until the library changes)`);
log(`10k links: js heap ${(heap / 1e6).toFixed(0)} MB · idb ${(quota.usage / 1e6).toFixed(1)} MB of ${(quota.quota / 1e9).toFixed(1)} GB`);
await big.screenshot({ path: join(root, "shots", "verify-10k-pulse.png"), fullPage: true });
await bigCtx.close();

log(`console/page errors across the whole run: ${errors.length ? errors.slice(0, 5).join(" | ") : "none"}`);
await browser.close();
server.kill();
mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs", "VERIFY.md"), `# Verification beyond unit tests\n\nGenerated by \`node scripts/verify.mjs\` on ${new Date().toISOString()} against the production build served under a /salvage-links/ base path.\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
log("wrote docs/VERIFY.md");
