/**
 * Lighthouse audit against the built site served under a Pages-style base path.
 * Usage: node scripts/audit.mjs [url]   (needs CHROME_PATH or Playwright's chromium)
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[3] ?? 4325);
const url = process.argv[2] ?? `http://127.0.0.1:${port}/salvage-links/#/import`;

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = join(process.env.HOME ?? "/root", ".cache", "ms-playwright");
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith("chromium")) continue;
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-headless-shell-linux64/chrome-headless-shell"]) {
      const p = join(base, dir, sub);
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no chrome found; set CHROME_PATH");
}

const server = spawn(process.execPath, [join(root, "scripts", "serve-subpath.mjs"), String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

let chrome;
try {
  chrome = await chromeLauncher.launch({
    chromePath: findChrome(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0"],
  });
  const settings = {
    formFactor: "desktop",
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: "simulate",
    throttling: { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  };
  const runner = await lighthouse(url, { port: chrome.port, output: "json", settings });
  const report = runner.lhr;
  writeFileSync(join(root, "shots", "lh.json"), JSON.stringify(report, null, 2));
  console.log("finalUrl:", report.finalDisplayedUrl);
  for (const [k, v] of Object.entries(report.categories)) console.log(k.padEnd(14), v.score === null ? "n/a" : Math.round(v.score * 100));
  console.log("--- metrics ---");
  for (const k of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "interactive"]) {
    if (report.audits[k]) console.log(k.padEnd(24), report.audits[k].displayValue ?? "", "score", report.audits[k].score);
  }
  console.log("--- audits scoring below 0.95 ---");
  for (const [id, a] of Object.entries(report.audits)) {
    if (a.score !== null && a.score < 0.95) console.log(String(a.score).padEnd(6), id.padEnd(34), (a.displayValue ?? "").slice(0, 60));
  }
  console.log("--- items with details (why) ---");
  for (const [id, a] of Object.entries(report.audits)) {
    if (a.score !== null && a.score < 0.95 && a.details?.items?.length) {
      console.log(id + ":", a.details.items.slice(0, 4).map((i) => i.node?.snippet ?? i.selector ?? i.reason ?? i.url ?? JSON.stringify(i).slice(0, 90)).join(" | ").slice(0, 400));
    }
  }
} finally {
  await chrome?.kill();
  server.kill();
}
