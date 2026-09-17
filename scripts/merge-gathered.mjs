#!/usr/bin/env node
// Offline first-run path: turn a locally gathered dataset (built from git clones when the GitHub API
// was unreachable) into data/projects.json using the SAME derivation as scripts/build-data.mjs.
//
//   node scripts/merge-gathered.mjs --from ../gathered/projects.json [--screenshots ../gathered/screenshots]
//                                   [--confirm-live repoA,repoB] [--org imagine-os] [--out data/projects.json]
//
// --confirm-live marks repos whose live site the owner has verified by hand (pages.live=true, HTTP 200, checked now).
// Everything else with a Pages signal stays "deployed-unverified" until the Actions run checks it.

import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeProject, normalizeStack, guessPagesUrl } from './build-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
if (args.help || !args.from) {
  console.log('usage: node scripts/merge-gathered.mjs --from <gathered.json> [--screenshots <dir>] [--confirm-live a,b] [--org imagine-os] [--out data/projects.json]');
  process.exit(args.help ? 0 : 2);
}
const ORG = args.org || process.env.PORTFOLIO_ORG || 'imagine-os';
const OUT = path.resolve(ROOT, args.out || 'data/projects.json');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');
const CONFIRM_LIVE = new Set((args['confirm-live'] || '').split(',').map(s => s.trim()).filter(Boolean));
const NOW = new Date().toISOString();

// file-extension -> language name (the gatherer counts files by extension)
const EXT_LANG = { html: 'HTML', htm: 'HTML', js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', css: 'CSS', scss: 'SCSS', py: 'Python', sql: 'SQL', sh: 'Shell', md: 'Markdown', yml: 'YAML', yaml: 'YAML', json: 'JSON', toml: 'TOML', vue: 'Vue', svelte: 'Svelte', astro: 'Astro', rs: 'Rust', go: 'Go', rb: 'Ruby' };
const EXT_SKIP = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'lock', 'example', 'txt', 'map', 'pdf', 'mp4', 'webm']);

const gathered = JSON.parse(await readFile(path.resolve(args.from), 'utf8'));
const overrides = existsSync(path.join(ROOT, 'data', 'overrides.json')) ? JSON.parse(await readFile(path.join(ROOT, 'data', 'overrides.json'), 'utf8')) : {};
const previous = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
const prevByName = new Map((previous?.projects || []).filter(p => !previous?.fixture).map(p => [p.name, p]));

// copy screenshots (all PNGs, including extra renders like circle-shell--gh-pages.png)
if (args.screenshots) {
  const src = path.resolve(args.screenshots);
  await mkdir(path.join(SCREENSHOT_DIR, 'thumbs'), { recursive: true });
  for (const f of await readdir(src)) if (f.endsWith('.png')) await copyFile(path.join(src, f), path.join(SCREENSHOT_DIR, f));
  if (existsSync(path.join(src, 'thumbs'))) for (const f of await readdir(path.join(src, 'thumbs'))) if (f.endsWith('.png')) await copyFile(path.join(src, 'thumbs', f), path.join(SCREENSHOT_DIR, 'thumbs', f));
}

const projects = [];
for (const g of gathered.projects) {
  const p = { ...g };
  // drop gatherer-only fields
  for (const k of ['screenshot_thumb', 'screenshot_blank', 'screenshot_gh_pages']) delete p[k];
  p.links = { repo: g.html_url, live: null, demo: null, sales: null, docs: null, other: [], ...(g.links || {}) };
  delete p.links.live_readme;
  p.links.other = (p.links.other || []).filter(u => /^https?:\/\//.test(u));
  p.languages = normalizeLanguages(g.languages);
  p.language = p.language || Object.keys(p.languages)[0] || null;
  p.stack = normalizeStack(g.stack);
  p.topics = g.topics || [];
  p.tags = g.tags || []; p.notes = g.notes || ''; p.featured = !!g.featured; p.hidden = !!g.hidden; p.source_channel = g.source_channel || null;
  p.display_name = g.display_name || g.name;
  p.is_placeholder = !!g.is_placeholder;
  // live URL guess: gh-pages branch or a pages workflow -> https://<org>.github.io/<name>/
  if (!p.links.live && (p.has_gh_pages_branch || p.has_pages_workflow)) p.links.live = guessPagesUrl(ORG, p.name);
  const confirmed = CONFIRM_LIVE.has(p.name);
  p.pages = {
    has_pages: confirmed ? true : null,
    url: p.links.live || null,
    live: confirmed ? true : null,
    http_status: confirmed ? 200 : null,
    checked_at: confirmed ? NOW : null,
  };
  if (confirmed && !p.links.live) p.links.live = guessPagesUrl(ORG, p.name), p.pages.url = p.links.live;
  // screenshots: every gathered render is a local render, keep the gatherer's note
  if (p.screenshot && existsSync(path.join(SCREENSHOT_DIR, `${p.name}.png`))) {
    p.screenshot_source = 'local-render';
    p.screenshot_note = g.screenshot_note || 'Local render of the repository files';
    const extra = path.join(SCREENSHOT_DIR, `${p.name}--gh-pages.png`);
    if (existsSync(extra) && !p.screenshot_note.includes(`${p.name}--gh-pages.png`)) p.screenshot_note += ` Second render of the gh-pages branch kept at screenshots/${p.name}--gh-pages.png.`;
  } else { p.screenshot = null; p.screenshot_source = 'none'; }
  finalizeProject(p, prevByName.get(p.name), overrides[p.name], { screenshotDir: SCREENSHOT_DIR });
  if (confirmed && p.status !== 'live' && !overrides[p.name]?.status) p.status = 'live';
  projects.push(p);
}
projects.sort((a, b) => (Date.parse(b.pushed_at) || 0) - (Date.parse(a.pushed_at) || 0));

const out = {
  generated_at: NOW,
  org: ORG,
  api_reachable: gathered.api_reachable === true,
  data_source: 'local-clones',
  gathered_at: gathered.gathered_at || null,
  owner_confirmed_live: [...CONFIRM_LIVE],
  errors: [],
  projects,
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');

const counts = {};
for (const p of projects) counts[p.status] = (counts[p.status] || 0) + 1;
console.log(`wrote ${path.relative(ROOT, OUT)} · ${projects.length} projects`);
console.log('status counts:', counts);
for (const p of projects) console.log(`  ${p.name.padEnd(22)} ${p.status.padEnd(22)} ${p.category.padEnd(26)} ${String(p.commit_count).padStart(3)}  ${p.screenshot ? 'shot' : '----'}  ${p.display_name}`);

function normalizeLanguages(langs) {
  const out = {};
  for (const [k, v] of Object.entries(langs || {})) {
    const key = k.toLowerCase();
    if (EXT_SKIP.has(key)) continue;
    const name = EXT_LANG[key] || (k.length <= 5 && k === key ? null : k);
    if (!name) continue;
    out[name] = (out[name] || 0) + v;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; o[k] = v; }
  }
  return o;
}
