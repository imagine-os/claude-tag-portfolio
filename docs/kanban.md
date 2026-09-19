# Kanban

General lane. One `- ` line per card; move cards in the same turn as the work.

## Backlog
- Graph view of projects (nodes: repos; edges: `renamed_from`, shared stack, `source_channel`, category) — reference `imagine-os/graph-gallery`
- EN / ES language toggle for the page (strings table, `?lang=` in the hash)
- Actions registry (id, intent phrase, permission) exposed as the WebMCP surface; seed list in `docs/pages/HOME.md`
- Dev-mode toggle with per-page specs (HOME spec chip, data provenance panel)
- 360 → 3840 px pass with 10-foot legibility and 44 px targets audit
- In-product annotations / bug filing on the catalogue itself
- sendr-rebuild: Pages source or workflow broken in that repo (site 404s) — fix lives in `imagine-os/sendr-rebuild`
- Rename `arthovis-org/empty1` → `proto3d` (Justin), then move the override key
- Rename `imagine-os/empty-11` (paperos-template) and `imagine-os/empty12` (paperos-orchestrator) (Justin)
- Name-collision hardening beyond overrides and screenshots: `prevByName`, `#open=` hash and the in-browser refresh still key by bare `name`
- Refresh-from-GitHub button: also refresh `data/sources.json` repos (today it lists the org only)

## Doing

## Done
- 0001 · `data/sources.json` + cross-owner support (full_name overrides, override live link checked, `owner--repo` screenshots, owner pill) — Fable 5.1
- 0001 · Overrides refresh: Proto3D, CTL OS, Petrock, Lead Magnet, paperos-template, paperos-orchestrator, Hook Testers, Forge Engine, Llave OS, sendr-rebuild note; stale notes fixed; empty10 orphan removed — Fable 5.1
- 0001 · Docs scaffolding (README map, rules, prompt/changelog 0001, decisions, kanban, surfaces, HOME page doc, CLAUDE.md) — Fable 5.1

## Blocked
- Proto3D entry in the live `data/projects.json` — appears when the GitHub Action runs on the push (API proxy-gated locally)
