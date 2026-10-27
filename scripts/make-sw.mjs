/**
 * Runs after `vite build`. The service worker must precache the real hashed asset
 * names, and Pages cannot send cache-control headers — so the cache name carries a
 * build token and new assets land in a new cache instead of waiting for a TTL.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const index = readFileSync(join(dist, "index.html"), "utf8");
const assets = new Set(readdirSync(join(dist, "assets")).map((f) => "./assets/" + f));
for (const m of index.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
  if (!m[1].startsWith("assets/")) assets.add("./" + m[1]);
}
for (const fixed of ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"]) assets.add(fixed);

const list = [...assets].sort();
const token = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 10);
const swPath = join(dist, "sw.js");
let sw = readFileSync(swPath, "utf8");
if (!sw.includes("/*PRECACHE*/")) throw new Error("public/sw.js lost its /*PRECACHE*/ markers");

sw = sw.replace(/\/\*VERSION\*\/\s*"[^"]*"\s*\/\*VERSION\*\//, `"salvage-${token}"`);
sw = sw.replace(/\/\*PRECACHE\*\/[^]*?\/\*PRECACHE\*\//, "/*PRECACHE*/\n  " + list.map((u) => JSON.stringify(u)).join(",\n  ") + "\n  /*PRECACHE*/");
writeFileSync(swPath, sw);
console.log(`sw.js precaches ${list.length} files, cache name salvage-${token}`);
for (const u of list) console.log("  " + u);
