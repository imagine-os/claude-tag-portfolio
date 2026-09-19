# 0001 — Portfolio refresh and Proto3D (2026-09-19)

- **Source**: Justin Massion in Slack `#claute-tag-portfolio`, thread of 2026-09-19 16:29 UTC (two messages)
- **Date**: 2026-09-19
- **Requester**: Justin Massion (project lead) via Slack #claute-tag-portfolio
- **Changelog**: `docs/changelog/0001-portfolio-refresh-and-proto3d.md`

## Prompt (verbatim)

Message 1 (2026-09-19 16:29 UTC):

> please make sure the portfolio is up to date with the latest stuff. add this as well https://arthovis-org.github.io/empty1/
>
> you can also check if that repo has any other live links we can see and add to portfolio.  You have web access so you should be able to look even before i give official github connection to that organization

Message 2 (2026-09-19 19:15 UTC):

> try now.

## Response

**What was built**
- `data/sources.json`, a committed list of extra repos / users outside the `imagine-os` org, merged (union,
  de-duplicated) with the `PORTFOLIO_EXTRA_REPOS` / `PORTFOLIO_USERS` Actions variables by `scripts/build-data.mjs`;
  the file's contribution is recorded under `sources.file` in `data/projects.json`. First entry: `arthovis-org/empty1`.
- Cross-owner support end to end: an override may be keyed by `owner/repo` and wins over a bare-name key
  (`findOverride`); an override's `links.live` is still live-checked when the API gives no Pages URL (the Pages
  endpoint 404s for repos the token cannot administer, but the repo object's `has_pages` plus the
  `https://<owner>.github.io/<repo>/` guess already covered Proto3D); screenshots of repos from another owner are
  stored as `screenshots/<owner>--<repo>.png` so a same-named repo in two orgs can never overwrite a capture;
  the page shows an owner pill on external cards, counts them in the header line, and search matches `full_name`.
- Overrides refresh (`data/overrides.json`): Proto3D (live, demo = Gateway Credits add-on, docs = architecture),
  CTL OS and Petrock featured Products, Lead Magnet, paperos-template (`empty-11`), paperos-orchestrator
  (`empty12`), Hook Testers (`empty6`), Forge Engine, Llave OS, sendr-rebuild note; stale notes fixed for
  circle-shell, webflow-audit and hoy (Medellín, HOY Wellness Center, per the hoy README); orphan `empty10`
  override and screenshots removed.
- Docs scaffolding created (this folder), `CLAUDE.md`, README section on `data/sources.json`; `package.json` 1.0.0 → 1.1.0.

**What was found**
- `arthovis-org` has 2 public repos. `empty1` is **Proto3D** (Three.js 3D project-management workspace, 9 commits,
  Pages live) with one extra live surface, the **Gateway Credits** add-on at `/addons/gateway-credits/`, plus
  `README.md`, `docs/ARCHITECTURE.md` and three PNG shots served on Pages. `empty2` is README-only with a draft
  Blender add-on PR; no Pages site. No org-root site.
- Every one of the 23 `imagine-os` repos was already auto-discovered; nothing was missing, only metadata was off
  (raw slugs, two misderived categories, four stale notes, one orphan).
- `sendr-rebuild` has a Pages workflow but its site 404s; that is a fix in that repo, out of scope here (noted).

**Deferred / not done**
- The live `projects.json` gains the Proto3D entry only when the GitHub Action runs on this push (the API is
  proxy-gated in the sandbox, so the local recompute only re-applied overrides to the 23 existing entries).
- `PORTFOLIO_EXTRA_REPOS` as an Actions variable was not set (not reachable by git); the committed file replaces it.
- Graph view, EN/ES toggle, actions registry / WebMCP, dev-mode page specs: backlog (see `docs/kanban.md`).
- Renames (`arthovis-org/empty1` → proto3d, `imagine-os/empty-11`, `empty12`) are Justin's call.

Model: Fable 5.1 (research, shared-code change, docs); worker sub-tasks also Fable 5.1.
