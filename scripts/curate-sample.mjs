/**
 * Curation pass for the demo library. Takes every URL the research agents actually opened,
 * drops anything that is not a real page (example.com placeholders, dead-end notes, this
 * repo's own dev URLs), health-checks the rest, and writes research/sample-live.json
 * containing only URLs that answered 200 — with the date they were checked.
 *
 * Run explicitly (it needs the network and takes ~1 minute): npm run curate
 * `make-sample.mjs` then builds public/sample-bookmarks.html from that file, so normal
 * builds stay offline and deterministic.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "research")).filter((f) => f.endsWith(".md"));

const EXCLUDED_HOSTS = new Set(["example.com", "example.org", "b.example.com", "e.example.com", "docs.example", "a.example", "localhost", "127.0.0.1", "registry.npmjs.org", "api.github.com", "cdn.playwright.dev"]);
const EXCLUDED_PATTERNS = [/vansh1190\.github\.io/, /\/salvage-links\//, /dev\.to\/api\//, /chromium-dashboard/, /stateofjs\.com\/en-US\/libraries\/mobile-desktop/, /stackoverflow\.co\/2023\/technology/, /buttondown\.com\/humanloops/, /pragmaticengineer\.com\/archive/, /javascriptweekly\.com\/about/, /jvns\.ca\/blog\/$/, /blog\.omnivore\.app/, /hn\.algolia\.com\/api/, /gist\.github\.com\/cora-deleted-gist-20260101/];

function extract() {
  const urls = new Map();
  const deadEndLines = [];
  for (const f of files) {
    const text = readFileSync(join(root, "research", f), "utf8");
    const deadStart = text.search(/^#+.*(dead end|blocked)/im);
    const usable = deadStart === -1 ? text : text.slice(0, deadStart);
    if (deadStart !== -1) deadEndLines.push(text.slice(deadStart));
    for (const m of usable.matchAll(/https?:\/\/[^\s<>()`"'|\\]+/g)) {
      let u = m[0].replace(/[.,;:)\]]+$/, "");
      if (/\.(md|png|jpg|jpeg|svg|zip|log|txt|json|webm)$/.test(u)) continue;
      let host = "";
      try {
        host = new URL(u).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (EXCLUDED_HOSTS.has(host) || host.endsWith(".example")) continue;
      if (EXCLUDED_PATTERNS.some((re) => re.test(u))) continue;
      if (!urls.has(u)) urls.set(u, { url: u, from: f, host });
    }
  }
  return { list: [...urls.values()], deadEndExcluded: deadEndLines.join("\n").length };
}

const { list, deadEndExcluded } = extract();
const results = [];
let i = 0;
async function worker() {
  while (i < list.length) {
    const item = list[i++];
    const started = Date.now();
    try {
      const res = await fetch(item.url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; salvage-demo-curator/1.0)" } });
      results.push({ ...item, status: res.status, finalUrl: res.url, ms: Date.now() - started });
    } catch (e) {
      const status = e?.name === "TimeoutError" ? "timeout" : e?.cause?.code ?? e?.name ?? "error";
      results.push({ ...item, status: String(status), finalUrl: item.url, ms: Date.now() - started });
    }
    if (i % 25 === 0) console.log(`  checked ${i}/${list.length}`);
  }
}
await Promise.all(Array.from({ length: 10 }, worker));

const live = results.filter((r) => r.status === 200).sort((a, b) => a.ms - b.ms);
const checkedAt = new Date().toISOString().slice(0, 10);
const byHost = {};
for (const r of live) byHost[r.host] = (byHost[r.host] ?? 0) + 1;
writeFileSync(join(root, "research", "sample-live.json"), JSON.stringify({ checkedAt, tool: "scripts/curate-sample.mjs", candidates: results.length, live: live.length, byHost, urls: live.map((r) => ({ url: r.finalUrl, host: r.host, from: r.from })) }, null, 2) + "\n");

const buckets = { ok: live.length, blocked: results.filter((r) => [301, 302, 403].includes(r.status)).length, dead: results.filter((r) => ![200, 301, 302, 403].includes(r.status)).length };
mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(
  join(root, "docs", "SAMPLE-STATUS.md"),
  `# Demo library: how it was curated and what was checked\n\n
Command: \`npm run curate\` (\`scripts/curate-sample.mjs\`), run from this sandbox on **${checkedAt}**.\n\n
| step | count |\n| --- | --- |\n
| URLs found in research/*.md (dead-end sections excluded) | ${results.length} |
| answered HTTP 200 → kept in the demo | ${buckets.ok} |
| reachable but refused us (301/302/403 bot-block; a person would likely get through) | ${buckets.blocked} |
| dead, unresolvable or timed out → dropped | ${buckets.dead} |
\n
Also dropped before checking: \`example.com\`-style placeholders, this repo's own dev URLs,
raw API endpoints, and every line inside the research files' own "dead ends / blocked" sections.
\n
**Why this matters:** the UI claims the demo is made of real public pages. That claim is only
true because it is filtered to the ${buckets.ok} URLs that answered 200 on ${checkedAt}; it is
not a claim that they will live forever — link rot is the problem this product is about.\n\n
Hosts kept: ${Object.entries(byHost).map(([h, n]) => `${h} (${n})`).join(", ")}.\n`,
);
console.log(`candidates ${results.length} → live ${buckets.ok}, refused ${buckets.blocked}, dead ${buckets.dead}`);
console.log("wrote research/sample-live.json and docs/SAMPLE-STATUS.md");
