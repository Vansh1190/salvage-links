# CI and Pages workflows

These are valid GitHub Actions workflows, but they are **not** in `.github/workflows/` because the
personal access token used to publish this repository has only the `repo` scope. GitHub rejects any
commit that touches `.github/workflows/**` without the `workflow` scope, so shipping them in place
was impossible.

To enable (one command, with any token that has `workflow` scope, or by hand in the web UI):

```bash
mkdir -p .github/workflows && git mv ci/ci.yml ci/deploy-pages.yml .github/workflows/ && git commit -m "ci: enable workflows" && git push
```

Note: the site is currently published from the `gh-pages` branch (`scripts/publish-via-api.mjs`),
which does not need Actions at all. If you move `deploy-pages.yml` in, switch Pages to
"GitHub Actions" in Settings → Pages first, or the two mechanisms will fight.
