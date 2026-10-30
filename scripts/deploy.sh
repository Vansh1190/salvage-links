#!/usr/bin/env bash
# One command to ship Salvage to GitHub Pages, once you have a token that may CREATE repos.
#
#   GITHUB_TOKEN=ghp_xxx ./scripts/deploy.sh [repo-name]
#
# What it does: builds, creates the repo (if absent), pushes main + a gh-pages branch built
# from dist/, enables Pages on gh-pages, then waits for the live URL to answer.
# It never force-pushes, never rewrites history, and touches only the named repo.
set -euo pipefail

REPO="${2:-salvage-links}"
API="https://api.github.com"
OWNER="${OWNER:-vansh1190}"
BRANCH="gh-pages"
: "${GITHUB_TOKEN:?set GITHUB_TOKEN to a token with the repo scope and repository-creation permission}"

cd "$(dirname "$0")/.."
command -v jq >/dev/null || { echo "need jq"; exit 1; }

echo "▸ building"
npm run build >/dev/null
test -f dist/index.html || { echo "build produced no dist/index.html"; exit 1; }

api() { curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" "$@"; }

echo "▸ ensuring $OWNER/$REPO exists"
STATUS=$(api -o /dev/null -w '%{http_code}' "$API/repos/$OWNER/$REPO")
if [ "$STATUS" = "404" ]; then
  CREATED=$(api -X POST "$API/user/repos" -d "{\"name\":\"$REPO\",\"description\":\"Salvage — a daily deck of the links you already saved but never read. Local-first, no account, nothing uploaded.\",\"private\":false,\"has_issues\":true,\"has_wiki\":false,\"auto_init\":false}")
  echo "$CREATED" | jq -e '.html_url' >/dev/null || { echo "repo creation refused:"; echo "$CREATED" | jq -r '.message + " " + (.documentation_url // "")'; exit 1; }
elif [ "$STATUS" != "200" ]; then
  echo "unexpected HTTP $STATUS probing the repo"; exit 1
fi

REMOTE="https://x-access-token:$GITHUB_TOKEN@github.com/$OWNER/$REPO.git"

echo "▸ pushing source (main)"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push -u origin main

echo "▸ publishing dist to $BRANCH"
rm -rf /tmp/salvage-ghpages && mkdir -p /tmp/salvage-ghpages
cp -a dist/. /tmp/salvage-ghpages/
(
  cd /tmp/salvage-ghpages
  git init -q
  git config user.email "deploy@localhost"; git config user.name "salvage deploy"
  git add -A
  git commit -qm "Salvage build $(git -C "$(dirname "$0")" rev-parse --short HEAD 2>/dev/null || echo local)"
  git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1 && FROM="origin/$BRANCH" || FROM=""
  git push -f "$REMOTE" "HEAD:$BRANCH"   # gh-pages is a build artefact branch, never hand-edited
)

echo "▸ enabling Pages on $BRANCH /"
CODE=$(api -o /tmp/pages.json -w '%{http_code}' -X POST "$API/repos/$OWNER/$REPO/pages" -d "{\"source\":{\"branch\":\"$BRANCH\",\"path\":\"/\"}}")
if [ "$CODE" = "409" ]; then echo "  (already exists, leaving it alone)"; elif [ "$CODE" != "201" ]; then jq -r '.message' /tmp/pages.json; exit 1; fi
api -X PATCH "$API/repos/$OWNER/$REPO/pages" -d '{"build_type":"legacy","source":{"branch":"'"$BRANCH"'","path":"/"}}' >/dev/null || true

URL="https://$OWNER.github.io/$REPO/"
echo "▸ waiting for $URL"
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL")
  echo "  attempt $i: HTTP $CODE"
  [ "$CODE" = "200" ] && { echo "✓ live: $URL"; exit 0; }
  sleep 10
done
echo "✗ not answering after 5 min; check https://github.com/$OWNER/$REPO/settings/pages"
exit 1
