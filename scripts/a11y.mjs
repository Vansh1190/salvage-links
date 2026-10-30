/**
 * Accessibility scan of the BUILT site, under the Pages base path, on every route, with a
 * populated library (the demo import) — empty states hide violations that real content shows.
 *
 * Usage: node scripts/a11y.mjs [--url http://127.0.0.1:4173/salvage-links/]
 * Exits 1 if axe reports any violation, so it can gate a release.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argUrl = process.argv.indexOf("--url");
const PORT = 4181;
const BASE = argUrl > -1 ? process.argv[argUrl + 1] : `http://127.0.0.1:${PORT}/salvage-links/`;

let server = null;
if (argUrl < 0) {
  server = spawn(process.execPath, [join(ROOT, "scripts", "serve-subpath.mjs"), String(PORT)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 900));
}

const ROUTES = ["deck", "queue", "library", "pulse", "import", "settings", "limits"];
const VIEWPORTS = [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

const browser = await chromium.launch();
let worst = 0;
const lines = [];

for (const [label, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector(".chip", { timeout: 20000 });

  const scan = async (phase) => {
    for (const route of ROUTES) {
      await page.evaluate((r) => {
        location.hash = "#/" + r;
      }, route);
      await page.waitForTimeout(350);
      const res = await new AxeBuilder({ page }).analyze();
      worst = Math.max(worst, res.violations.length);
      lines.push(label.padEnd(8) + " " + phase.padEnd(10) + " /" + route.padEnd(9) + " axe violations: " + res.violations.length + (res.violations.length ? "  " + res.violations.map((v) => v.id).join(",") : ""));
    }
  };

  await scan("empty");
  await page.evaluate(() => {
    location.hash = "#/import";
  });
  await page.getByTestId("demo-load").click();
  await page.waitForSelector("[data-testid='import-status']", { timeout: 30000 });
  await scan("populated");
  if (errors.length) lines.push(label + " pageerrors: " + errors.join(" | "));
  worst = Math.max(worst, errors.length);
  await ctx.close();
}

console.log(lines.join("\n"));
console.log(worst === 0 ? "\n0 violations across " + lines.length + " scans" : "\nVIOLATIONS PRESENT");
await browser.close();
if (server) server.kill();
process.exit(worst === 0 ? 0 : 1);
