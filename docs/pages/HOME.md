# HOME — `index.html`

The only page. Live at https://imagine-os.github.io/claude-tag-portfolio/ ; locally `npm run serve` → http://127.0.0.1:8765/.
Vanilla JS (`assets/app.js`), vanilla CSS (`assets/styles.css`), no build step. Data: `data/projects.json?ts=…`.

## Purpose
Builder / PM catalogue first, public portfolio second: every repo with status, category, stack, deploy state, screenshot,
links and builder notes.

## Views
- **Cards** (default): screenshot, status pill, category pill, owner pill for repos outside the org, Featured pill, description,
  stack, created / pushed, commits, TODO count; footer: Open live, Demo, Sales site, Repo, Preview / Details.
- **Table**: dense sortable columns (click a header; `tsort` / `tdir` in the hash).
- **Timeline**: projects by month of creation or last push (`tl=created|pushed`).
- **Stat tiles** in the header count projects by status; clicking one filters.
- **Chips**: category, stack, Live / Demo / Sales toggles, Hide placeholders.

## URL-hash state (bookmarkable)
`q` search, `status[]`, `cat[]`, `stack[]`, `live`, `sales`, `demo`, `hideph` (default true), `sort`, `view=cards|table|timeline`,
`tl`, `tsort`, `tdir`, `open=<repo name>` (detail panel).

## Keyboard
`/` focuses search · `Esc` closes the detail panel · every control is a real button / link (tab order = DOM order).

## Theme
Follows the OS; the header button toggles and stores `portfolio-theme` in `localStorage`; `data-theme` on `<html>`.

## Detail panel (`<dialog>`)
Display name, `full_name` (owner/repo) and source channel, status / category / featured / tags, live preview iframe
(when live), README excerpt, README links, branches (gh-pages highlighted), last commit, contributors, size, language
breakdown, issues, TODOs, workflow files, entry point, build command, screenshot provenance, notes, buttons Open live /
Open in GitHub / Actions, and **Edit overrides on GitHub**.

## Actions (seed of the actions registry / WebMCP surface)
| id | intent phrase | permission |
| --- | --- | --- |
| `search` | "search projects for …" / focus search (`/`) | viewer |
| `switch_view` | "show cards / table / timeline" | viewer |
| `filter_status` | "show only live / unverified / …" (tiles) | viewer |
| `filter_category` / `filter_stack` | "filter by category … / stack …" (chips) | viewer |
| `sort` | "sort by pushed / created / name / status" | viewer |
| `open_detail` | "open <project>" (`#open=`) | viewer |
| `preview_live` | "preview <project>" (iframe in the panel) | viewer |
| `toggle_theme` | "switch to dark / light" | viewer |
| `toggle_placeholders` | "show / hide placeholders" | viewer |
| `refresh_from_github` | "refresh from GitHub now" (unauthenticated API, 60/h) | viewer |
| `edit_overrides` | "edit overrides" (link to `data/overrides.json` on GitHub) | GitHub write access |

## Not wired yet
Nothing on the page is a stub today; every button does what it says. Dev mode and the EN/ES toggle do not exist yet (kanban).
