# imagine-os portfolio

A self-updating catalogue of every repository in the **imagine-os** GitHub organization, built for Justin as builder / project manager first and as a public portfolio second. It is a static site (one HTML page, vanilla JS and CSS, no build step) served by GitHub Pages, refreshed every six hours by a GitHub Actions workflow.

Live: `https://imagine-os.github.io/claude-tag-portfolio/`  ·  Repo: `imagine-os/claude-tag-portfolio`

## What you see

- **Cards** – screenshot, status pill, category, description, stack, created / pushed dates, commit count, and quick actions (Open live, Demo, Sales site, Repo, Preview).
- **Table** – dense sortable columns; rows that are not live are tinted.
- **Timeline** – projects by month of creation or last push.
- **Detail panel** – everything builder-facing: README excerpt, all README links, branches (gh-pages highlighted), last commit, contributors, size, language breakdown, open issues, TODO count, workflow files, entry point, build command, screenshot provenance, notes from overrides, and an **Edit overrides on GitHub** link.
- **Stat tiles** in the header count projects by status; clicking one filters.
- **Refresh from GitHub now** pulls fresher `pushed_at` / description / homepage / `has_pages` straight from the public API in the browser and flags anything that changed since the last data build.
- All control state (search, filters, sort, view, open project) lives in the URL hash, so any view is bookmarkable.
- Keyboard: `/` focuses search, `Esc` closes the panel. Dark and light themes (follows the OS, toggle to override).

### Status meanings

| Status | Meaning |
|---|---|
| **Live** | The Pages / homepage URL answered 2xx on the last check |
| **Deployed · unverified** | A Pages branch, workflow or Pages setting exists but the live check failed or was not run |
| **Built · not deployed** | Has an `index.html` or build script but no Pages signal at all — enable Pages |
| **In progress** | No deploy signal yet |
| **Placeholder** | Empty repository: no commits, or a lone commit holding only README/.gitignore/LICENSE. Never judged by name or by GitHub's size field (a real project can live in an `emptyN` repo). Hidden by default |
| **Archived** | Archived on GitHub |

Categories are derived from the name / description / topics (`-audit` → Audit / Report, `shell` or `rebuild` → Prototype / Shell rebuild, `game` → Game, `designs` → Design exploration, `emptyN` → Placeholder, otherwise Product) and can be overridden.

## Layout

```
index.html                 the catalogue
assets/app.js              rendering, filtering, URL-hash state, GitHub refresh
assets/styles.css          design tokens (dark-first) and components
data/projects.json         GENERATED dataset – do not edit by hand
data/overrides.json        hand-maintained per-repo overrides (edit this one)
data/sources.json          committed extra repos / users outside the org (unioned with the Actions variables)
docs/                      working memory: rules, prompt log, changelog, decisions, kanban, page docs, surfaces (start at docs/README.md)
screenshots/<name>.png     1440x900 captures of live sites
screenshots/thumbs/<name>.png  640x400 thumbnails
scripts/build-data.mjs     queries the GitHub REST API, enriches, merges overrides, writes data/projects.json
scripts/screenshot.mjs     Playwright captures of every live URL
scripts/check-live.mjs     HTTP live check (module + CLI)
scripts/merge-gathered.mjs first-run path: turns a locally gathered JSON (git clones, no API) into data/projects.json with the same derivation
.github/workflows/update.yml   cron every 6h + manual + on push: refresh data, commit, deploy Pages
```

## Overrides

`data/overrides.json` is keyed by repo name. Any field you set wins over what the build derives:

```json
{
  "hoy": {
    "display_name": "HoyOS",
    "featured": true,
    "category": "Product",
    "status": "live",
    "tags": ["client", "flagship"],
    "notes": "Teacher app still on a branch; merge before the next demo.",
    "source_channel": "#hoy-build",
    "links": { "sales": "https://hoy.co", "demo": "https://imagine-os.github.io/hoy/#/dev/specs" },
    "hidden": false
  }
}
```

Keys are bare repo names, or `owner/repo` for a repo outside the org (a full-name key wins over a bare one, so a name that exists in two orgs cannot mis-apply). Supported keys: `display_name`, `category`, `status`, `tags`, `notes`, `hidden`, `featured`, `source_channel`, `links` (partial: `live`, `demo`, `sales`, `docs`) and `renamed_from` (the repo's previous name, so an override keyed either way keeps applying after a rename; the build also detects renames by matching the last commit sha and carries screenshots over). Keys beginning with `_` are ignored. Edit the file directly on GitHub (the detail panel has a shortcut); the push triggers a rebuild and redeploy within a couple of minutes.

## How it updates

`.github/workflows/update.yml` runs on a cron (`17 */6 * * *`), on manual dispatch, and on every push to `main` that does not only touch `data/` or `screenshots/`.

1. **refresh** – `node scripts/build-data.mjs` talks to the GitHub API (repo metadata, Pages, languages, branches, last commit and count, contributors, README, workflows, entry-point probes, package.json, a tarball scan for TODO/FIXME markers, and an HTTP live check of each candidate URL). Then `node scripts/screenshot.mjs` captures every live URL with Chromium. If anything changed, it commits `data/` and `screenshots/` as `github-actions[bot]` with `[skip ci]` and pushes to `main`.
2. **deploy** – checks out the fresh `main` and publishes the whole repo to GitHub Pages with `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages`.

A flaky run never loses data: any repo that fails enrichment keeps its previous entry from `data/projects.json`, with the error recorded under `errors`.

## First run

1. **Enable Pages once by hand:** `imagine-os/claude-tag-portfolio` → Settings → Pages → *Build and deployment* → Source: **GitHub Actions**. Nothing deploys until this is done.
2. The *Refresh portfolio data and deploy* workflow runs on the push that created the repo and then every 6 hours (also on demand from the Actions tab).
3. The committed `data/projects.json` is **first-run data derived from git clones** (dates from commit history, no GitHub API: topics, issues, stars and Pages settings are empty, live checks were not run, and every screenshot is a local render of the repo). The first successful Actions run replaces it with full API data and swaps the local renders for real screenshots of the live sites. Until then the header shows "API unreachable on last build".

The site reads its own repo name from the Pages URL (falling back to `data-repo` on `<body>`), so the *Edit overrides* link keeps working if the repo is renamed.

### Optional: `PORTFOLIO_TOKEN` secret

The default `GITHUB_TOKEN` can read public repos in the org and has a generous rate limit, but it cannot see **private** repos or the Pages settings of repos it does not own. To include those, create a fine-grained personal access token with *Contents: read*, *Metadata: read* and *Pages: read* on the org's repositories, add it as a repository secret named `PORTFOLIO_TOKEN`, and the build prefers it automatically.

### Adding repos outside the org: `data/sources.json`

Commit the repo to `data/sources.json` and push; the workflow picks it up on that push:

```json
{ "extra_repos": ["arthovis-org/empty1"], "users": [] }
```

`extra_repos` are `owner/repo` entries, `users` are extra GitHub accounts whose public repos to include. The file is unioned (de-duplicated) with the `PORTFOLIO_EXTRA_REPOS` / `PORTFOLIO_USERS` variables below, and its contribution is recorded under `sources.file` in `data/projects.json`. Override such a repo in `data/overrides.json` under its `owner/repo` key; its screenshot is stored as `screenshots/<owner>--<repo>.png`. The Pages API answers 404 for repos the token cannot administer, so the live URL is derived from the repo's `has_pages` flag (`https://<owner>.github.io/<repo>/`) or from the override's `links.live`, and live-checked as usual.

### Pointing it at more orgs or users

Set repository **variables** on `imagine-os/claude-tag-portfolio` (Settings → Secrets and variables → Actions → Variables):

- `PORTFOLIO_ORG` – the organization (or user) to catalogue; default `imagine-os`
- `PORTFOLIO_USERS` – comma-separated extra user accounts whose repos to include, e.g. `jmassion`
- `PORTFOLIO_EXTRA_REPOS` – comma-separated `owner/repo` entries to add individually

Also update `data-org` on `<body>` in `index.html` so the header and the in-browser refresh point at the right organization.

## Running locally

```sh
npm i                                  # installs playwright (only dev dependency)
npx playwright install chromium        # once
npm run data                           # -> data/projects.json  (set GITHUB_TOKEN to avoid the 60 req/h limit)
npm run shots                          # -> screenshots/*.png
npm run serve                          # http://127.0.0.1:8765/
```

Useful env flags for `npm run data`: `PORTFOLIO_SKIP_LIVE=1` (no HTTP checks), `PORTFOLIO_SKIP_TODOS=1` (no tarball scan). `node scripts/build-data.mjs --recompute` re-derives status, category, stack, placeholder flag and overrides from the existing `data/projects.json` without any API call (handy to test a rule or an override offline); `--self owner/repo` names the portfolio repo to exclude (default `$GITHUB_REPOSITORY` or `imagine-os/claude-tag-portfolio`). For `npm run shots`: `PORTFOLIO_SHOT_ONLY=hoy,paperos`, `PORTFOLIO_SHOT_CONCURRENCY=2`, `PORTFOLIO_CHROMIUM_PATH=/path/to/chrome`.

## Docs and rules

`docs/README.md` is the start-here map (rules, prompt log, changelog, decisions, kanban, page doc, surfaces); `CLAUDE.md` is the short rule sheet for anyone editing the repo.

## Notes

- The page fetches `data/projects.json` relatively with a cache-busting query, so it works from `python3 -m http.server`, from a Pages sub-path, or from any static host.
- Screenshots are taken only from URLs that answer 2xx; if a site goes down the previous capture is kept and the note says so.
- The in-browser **Refresh from GitHub now** button is unauthenticated (60 requests per hour per IP). On a 403 it shows a toast and keeps the built-in data.
- The single external resource is the Bricolage Grotesque font from Google Fonts; the page falls back to the system sans when offline.
