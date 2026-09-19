# Documentation rules

These rules are mandatory and are executed **in the same turn as the work**, never later. Adapted
from the `imagine-os/hoy` rules for a repo with one page and no in-app viewer.

## 1. Prompt log (`docs/prompts/`)
- Every prompt that changes the system is stored verbatim as `NNNN-slug.md`, with:
  - **Source** (Slack channel + thread time, or "direct"), date, requester role (never personal contact data).
  - **Prompt (verbatim)** — exact text, with Slack `<@U…>` mention tokens removed. Several messages from the
    same thread that were answered by one piece of work go in one file, each labelled with its time.
  - **Response** — what was actually built, what was found, what was deferred, the model that did the work,
    and a link to the changelog entry. The heading must be exactly `## Response`.
- Follow-up messages that change scope get their own numbered file.
- Numbering: 4 digits, zero-padded, starting at `0001`; take the next free number when you commit. Never renumber
  an existing file; if two workers collide on rebase, the later one takes the next free number.

## 2. Changelog (`docs/changelog/`, K-01 format)
Each change: `NNNN-slug.md` (same number as its prompt) with header lines, then optional markdown:
```
version: x.y.z          (package.json "version"; bump minor for a feature, patch for a fix)
date: YYYY-MM-DD
prompt: docs/prompts/NNNN-slug.md
intent: one line
decision: what was done and why
rejected: the alternative considered and why not
files: list of paths or globs
```
Body: a **Verification** section (what was run, exit codes, what was checked live) and, for visual changes, the
before / after captures.

## 3. Kanban (`docs/kanban.md`)
`## Backlog | Doing | Done | Blocked` at the top level form the *General* lane; add `## <Lane>` headings with
`### Backlog / Doing / Done` if a second team or module ever needs one. One `- ` line per card. Move cards in the
same turn as the work. On rebase conflicts keep both sides.

## 4. Decisions (`docs/decisions.md`)
One `### D-NNNN — title` block per decision: date, status (`accepted`, `superseded by D-NNNN`), context, decision,
alternative rejected. Append-only; a reversed decision gets a new number and the old one is marked superseded, so
an outdated rule is never mistaken for a current one.

## 5. Page docs (`docs/pages/<CODE>.md`)
One file per page (this site has one: `HOME` = `index.html`). It states purpose, URL, views, URL-hash state,
keyboard, theme, the detail panel, and the **actions list** (id, intent phrase, permission) that will become the
actions registry / WebMCP surface. Update it in the same turn as a UI change.

## 6. Surfaces (`docs/reference/surfaces.md`)
MCP / WebMCP, CLI and API abilities are re-checked and recorded every pass, even when the answer is "none yet".

## 7. Data files
- `data/projects.json` is generated; the only way to change it locally is `node scripts/build-data.mjs --recompute`
  (re-applies overrides offline). The GitHub Action regenerates it with live API data on every push.
- `data/overrides.json` (per-repo metadata) and `data/sources.json` (extra repos / users) are the hand-edited files.
