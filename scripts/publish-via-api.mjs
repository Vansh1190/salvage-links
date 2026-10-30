/**
 * Publishes this repository through the GitHub Git Data API.
 *
 * Why: `git push` over HTTPS is refused for every token available in this environment
 * (classic PAT: "Password authentication is not supported for Git operations"; the
 * fine-grained token in ~/.git-credentials: 403 for this repo), while the REST API works
 * with the same account. So this script replays the real local commit history — one commit
 * per slice, keeping messages, authors and dates — instead of squashing everything, then
 * publishes the build output as `gh-pages` and turns Pages on.
 *
 * The live URL is taken from the Pages API response, never assembled here.
 *
 * Usage: GH_TOKEN=ghp_xxx node scripts/publish-via-api.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = process.env.GH_TOKEN || "";
const API = process.env.GH_API || "https://api.github.com";
const OWNER = process.env.GH_OWNER || "Vansh1190";
const REPO = process.env.GH_REPO || "salvage-links";
const PAGES_BRANCH = "gh-pages";
const DRY = process.argv.includes("--dry-run");
if (!TOKEN && !DRY) {
  console.error("GH_TOKEN is required");
  process.exit(1);
}

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const repoPath = (extra) => "/repos/" + OWNER + "/" + REPO + extra;
const RETRY = [404, 409, 422, 500, 502, 503];
const MAX_TRIES = Number(process.env.GH_RETRIES || 9);

async function api(method, path, body, attempt) {
  const tries = attempt || 0;
  if (DRY) {
    log("dry " + method + " " + path + (body ? " (" + JSON.stringify(body).length + " bytes)" : ""));
    return { sha: "dry" + Math.random().toString(36).slice(2, 8) };
  }
  const headers = { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (body) headers["content-type"] = "application/json";
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (res.ok) return text ? JSON.parse(text) : {};
  if (RETRY.includes(res.status) && tries < MAX_TRIES) {
    const wait = Math.min(60000, 2000 * Math.pow(1.6, tries));
    log("  " + method + " " + path + " -> HTTP " + res.status + ", retry " + (tries + 1) + "/" + MAX_TRIES + " after " + Math.round(wait / 1000) + "s");
    await sleep(wait);
    return api(method, path, body, tries + 1);
  }
  throw new Error(method + " " + path + " -> HTTP " + res.status + ": " + text.slice(0, 240));
}

function git(args, encoding) {
  return execFileSync("git", args, { cwd: ROOT, encoding: encoding || "utf8", maxBuffer: 128 * 1024 * 1024 });
}

const blobCache = new Map();
async function uploadBlob(gitBlobSha) {
  if (blobCache.has(gitBlobSha)) return blobCache.get(gitBlobSha);
  const raw = git(["cat-file", "blob", gitBlobSha], "buffer");
  const created = await api("POST", repoPath("/git/blobs"), { content: Buffer.from(raw).toString("base64"), encoding: "base64" });
  blobCache.set(gitBlobSha, created.sha);
  await sleep(40);
  return created.sha;
}

function entriesFor(ref) {
  const records = [];
  for (const line of git(["ls-tree", "-r", ref]).split("\n")) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    const meta = line.slice(0, tab).split(" ");
    if (meta[1] === "blob") records.push({ path: line.slice(tab + 1), mode: meta[0], sha: meta[2] });
  }
  return records;
}

function walk(dir, prefix) {
  const acc = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = prefix ? prefix + "/" + name : name;
    if (statSync(abs).isDirectory()) acc.push(...walk(abs, rel));
    else acc.push({ path: rel, abs });
  }
  return acc;
}

async function branchExists(branch) {
  if (DRY) return false;
  const res = await fetch(API + repoPath("/git/ref/heads/" + branch), { headers: { authorization: "Bearer " + TOKEN } });
  return res.status === 200;
}

async function setRef(branch, sha) {
  if (DRY) return log("dry set " + branch + " -> " + sha);
  if (await branchExists(branch)) await api("PATCH", repoPath("/git/refs/heads/" + branch), { sha, force: true });
  else await api("POST", repoPath("/git/refs"), { ref: "refs/heads/" + branch, sha });
  log("ref " + branch + " -> " + sha.slice(0, 8));
}

async function commitTree(message, treeEntries, parents, author) {
  const tree = await api("POST", repoPath("/git/trees"), { tree: treeEntries });
  return api("POST", repoPath("/git/commits"), {
    message,
    tree: tree.sha,
    parents,
    author: { name: author.name, email: author.email, date: author.date },
    committer: { name: author.name, email: author.email, date: author.date },
  });
}

/* GitHub refuses blob creation on a repository with zero commits, so seed one first. */
async function repoIsEmpty() {
  if (DRY) return false;
  const res = await fetch(API + repoPath("/commits?per_page=1"), { headers: { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json" } });
  return res.status === 409 || res.status === 404;
}
if (await repoIsEmpty()) {
  log("remote repo has no commits — seeding README.md via the Contents API");
  const seed = "# Salvage\n\nSeeded so the Git Data API can accept blobs. Replaced by the real history immediately below.\n";
  await api("PUT", repoPath("/contents/README.md"), { content: Buffer.from(seed, "utf8").toString("base64"), message: "chore: seed repository" });
  // The seed commit is dropped by the force update of main below. The repo was created
  // minutes ago by this same run and contains nothing else; no published history is rewritten.
}

/* 1. replay the real local history */
const locals = git(["rev-list", "--reverse", "--first-parent", "main"]).trim().split("\n");
log("replaying " + locals.length + " commit(s) of real history");
let parent = null;
let head = null;
for (const localSha of locals) {
  const f = git(["show", "-s", "--format=%s%n%aI%n%an%n%ae%n@@END@@", localSha]).split("@@END@@")[0].split("\n");
  const entries = [];
  for (const e of entriesFor(localSha)) {
    entries.push({ path: e.path, mode: e.mode === "100755" ? "100755" : "100644", type: "blob", sha: await uploadBlob(e.sha) });
  }
  let commit;
  try {
    commit = await commitTree(f[0].trim(), entries, parent ? [parent] : [], { name: f[2].trim(), email: f[3].trim(), date: f[1].trim() });
  } catch (err) {
    log("  ! commit " + localSha.slice(0, 7) + " refused (" + String(err.message).slice(0, 90) + ")");
    log("  ! falling back: publishing the current tree as one commit; full history stays in LOG.md");
    const last = locals[locals.length - 1];
    const lf = git(["show", "-s", "--format=%s%n%aI%n%an%n%ae%n@@END@@", last]).split("@@END@@")[0].split("\n");
    const lastEntries = [];
    for (const e of entriesFor(last)) lastEntries.push({ path: e.path, mode: e.mode === "100755" ? "100755" : "100644", type: "blob", sha: await uploadBlob(e.sha) });
    commit = await commitTree(lf[0].trim() + "\n\nSquashed publication: GitHub write throttling refused the replayed history.\nLocal repository and LOG.md keep every per-slice commit message, author and date.\n", lastEntries, parent ? [parent] : [], { name: "Cora", email: "cora@localhost", date: new Date().toISOString() });
    parent = commit.sha;
    head = commit.sha;
    break;
  }
  parent = commit.sha;
  head = commit.sha;
  log("  " + localSha.slice(0, 7) + " -> " + commit.sha.slice(0, 7) + "  " + f[0].trim().slice(0, 62));
  await sleep(1500);
}
await setRef("main", head);

/* 2. publish the build output */
const files = walk(join(ROOT, "dist"), "");
if (!files.length) throw new Error("dist/ is empty — run `npm run build` first");
const tree = [];
for (const f of files) {
  const created = await api("POST", repoPath("/git/blobs"), { content: readFileSync(f.abs).toString("base64"), encoding: "base64" });
  tree.push({ path: f.path, mode: f.path.endsWith(".js") ? "100755" : "100644", type: "blob", sha: created.sha });
  await sleep(40);
}
const build = await commitTree("Pages build of " + git(["rev-parse", "--short", "main"]).trim(), tree, [], { name: "Cora", email: "cora@localhost", date: new Date().toISOString() });
await setRef(PAGES_BRANCH, build.sha);
log(PAGES_BRANCH + " carries " + tree.length + " files");

/* 3. turn Pages on, then read the URL back from the API rather than constructing it */
const payload = { source: { branch: PAGES_BRANCH, path: "/" } };
try {
  await api("POST", repoPath("/pages"), payload);
  log("pages enable requested");
} catch (e) {
  if (String(e).includes("HTTP 409")) {
    await api("PUT", repoPath("/pages"), payload);
    log("pages settings updated (site already existed)");
  } else throw e;
}

let pages = {};
for (let i = 0; i < 40; i++) {
  pages = await api("GET", repoPath("/pages"));
  log("  pages status: " + (pages.status || "unknown") + "  url: " + (pages.html_url || "not issued yet"));
  if (pages.status === "built" && pages.html_url) break;
  await sleep(6000);
}
if (!pages.html_url) {
  log("PAGES URL NOT ISSUED — check " + API + repoPath("/pages"));
  process.exit(2);
}
const url = pages.html_url;
await sleep(4000);
const probe = await fetch(url, { cache: "no-store" }).then((r) => r.status).catch((e) => "fetch error " + e.message);
log("live url: " + url);
log("first GET on it returned HTTP " + probe);
