# Decisions

Append-only. A reversed decision gets a new number; the old one is marked `superseded by D-NNNN`.

### D-0001 — External repos are added through `data/sources.json`
- **Date**: 2026-09-19 · **Status**: accepted · **Changelog**: 0001
- **Context**: the catalogue auto-discovers the `imagine-os` org; a repo from another owner could only be added with the
  `PORTFOLIO_EXTRA_REPOS` Actions variable, which cannot be set from git and leaves no trace in the repo.
- **Decision**: `data/sources.json` (`extra_repos: ["owner/repo"]`, `users: []`) is read by `scripts/build-data.mjs` and
  unioned with the env vars (de-duplicated, case-insensitive). The file's contribution is recorded under `sources.file`
  in `data/projects.json`. `data/projects.json` stays generated; nobody inserts entries by hand.
- **Rejected**: the Actions variable alone (unreachable by git, invisible in history); hand-editing the generated file.

### D-0002 — Overrides may be keyed by `full_name`
- **Date**: 2026-09-19 · **Status**: accepted · **Changelog**: 0001
- **Context**: both `imagine-os` and `arthovis-org` use `emptyN` placeholder names, so a bare-name override could apply to the
  wrong repo once a name exists in two orgs.
- **Decision**: `findOverride` checks `overrides[full_name]` first, then the bare name, then `renamed_from` both ways. Repos
  outside the org are overridden under `owner/repo`; org repos keep bare keys. Screenshots of external repos are stored as
  `owner--repo.png` for the same reason.
- **Rejected**: requiring full names for every key (would churn 20 existing overrides and the README examples).

### D-0003 — Proto3D is listed under its placeholder repo name until the rename
- **Date**: 2026-09-19 · **Status**: accepted · **Changelog**: 0001
- **Context**: `arthovis-org/empty1` is Proto3D (Three.js 3D project-management workspace); the repo has not been renamed yet
  and the org is not connected to Claude's GitHub app, so the rename is Justin's call.
- **Decision**: catalogue it as `arthovis-org/empty1` with `display_name: "Proto3D"`, links live / demo (Gateway Credits
  add-on) / docs (architecture), and a note saying the rename is pending. When it is renamed, the build's rename detection
  (last-commit sha) carries the entry and screenshots over; the override key must be updated to the new `owner/repo`.
- **Rejected**: waiting for the rename before listing it (Justin asked for it now); listing it as `proto3d` by hand in the
  generated file.
