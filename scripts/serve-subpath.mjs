/**
 * Serves dist/ under a /<name>/ base path, exactly like a GitHub Pages project site,
 * so base-path and asset-URL bugs are caught locally instead of in production.
 * Usage: node scripts/serve-subpath.mjs [port] [repoName]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 4173);
const base = "/" + (process.argv[3] ?? "salvage-links").replace(/^\/|\/$/g, "");
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  let rel = decoded.startsWith(base + "/") ? decoded.slice(base.length) : decoded === base ? "/" : null;
  if (rel === null) return { status: 404, file: null, cache: "no-store" };
  if (rel.endsWith("/")) rel += "index.html";
  const abs = normalize(join(dist, rel));
  if (!abs.startsWith(dist)) return { status: 403, file: null, cache: "no-store" };
  try {
    const info = await stat(abs);
    if (info.isDirectory()) return resolveFile(decoded + "/index.html");
    return { status: 200, file: abs, cache: abs.endsWith(".html") ? "no-cache" : "public, max-age=0, must-revalidate" };
  } catch {
    return { status: 404, file: null, cache: "no-store" };
  }
}

createServer(async (req, res) => {
  const { status, file, cache } = await resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(status, { "content-type": "text/plain" });
    res.end(`${status} ${req.url}`);
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": cache,
    "content-length": body.length,
  });
  res.end(body);
}).listen(port, "127.0.0.1", () => {
  console.log(`serving ${dist} at http://127.0.0.1:${port}${base}/`);
});
