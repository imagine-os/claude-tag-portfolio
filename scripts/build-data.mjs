#!/usr/bin/env node
// Builds data/projects.json from the GitHub REST API. Node 20+, ESM, zero npm deps.
//
// Env:
//   PORTFOLIO_TOKEN | GITHUB_TOKEN   optional bearer token (PORTFOLIO_TOKEN wins; needed for private repos and 5000 req/h)
//   PORTFOLIO_ORG                    default "imagine-os"
//   PORTFOLIO_USERS                  optional comma list of extra users whose repos to include
//   PORTFOLIO_EXTRA_REPOS            optional comma list of owner/repo to include
//   PORTFOLIO_SKIP_LIVE=1            skip HTTP live checks (faster local runs)
//   PORTFOLIO_SKIP_TODOS=1           skip the tarball TODO scan
//
// Any per-repo failure is recorded under `errors` and the previous entry from data/projects.json is kept,
// so a flaky run never loses data.
//
// `node scripts/build-data.mjs --help` prints this usage. The derivation helpers (deriveCategory, deriveStatus,
// normalizeStack, applyOverrides, finalizeProject, guessPagesUrl) are exported so scripts/merge-gathered.mjs
// can build the same dataset from locally gathered data without touching the API.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { checkLive } from './check-live.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'projects.json');
const OVERRIDES_FILE = path.join(ROOT, 'data', 'overrides.json');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');

const ORG = process.env.PORTFOLIO_ORG || 'imagine-os';
const USERS = (process.env.PORTFOLIO_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
const EXTRA = (process.env.PORTFOLIO_EXTRA_REPOS || '').split(',').map(s => s.trim()).filter(Boolean);
const TOKEN = process.env.PORTFOLIO_TOKEN || process.env.GITHUB_TOKEN || '';
const SKIP_LIVE = process.env.PORTFOLIO_SKIP_LIVE === '1';
const SKIP_TODOS = process.env.PORTFOLIO_SKIP_TODOS === '1';
const API = 'https://api.github.com';

const STATUSES = ['live', 'deployed-unverified', 'built-not-deployed', 'in-progress', 'placeholder', 'archived'];
const CATEGORIES = ['Product', 'Prototype / Shell rebuild', 'Audit / Report', 'Tooling', 'Game', 'Design exploration', 'Placeholder', 'Other'];
const ENTRY_CANDIDATES = ['index.html', 'public/index.html', 'site/index.html', 'dist/index.html', 'docs/index.html', 'app/index.html', 'src/index.html', 'www/index.html'];

// ---------------------------------------------------------------- GitHub client
let rateWaited = false;
let apiReachable = true;
const errors = [];

async function gh(pathname, { accept = 'application/vnd.github+json', raw = false, allow = [] } = {}) {
  const url = pathname.startsWith('http') ? pathname : API + pathname;
  const headers = { Accept: accept, 'User-Agent': 'imagine-os-portfolio-bot/1.0', 'X-GitHub-Api-Version': '2022-11-28' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers, redirect: 'follow' });
    } catch (err) {
      if (attempt === 2) throw new Error(`network: ${err?.cause?.code || err.message} (${pathname})`);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const remaining = res.headers.get('x-ratelimit-remaining');
    if ((res.status === 403 || res.status === 429) && remaining === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const waitMs = Math.min(Math.max(reset - Date.now() + 2000, 5000), 15 * 60 * 1000);
      if (!rateWaited) {
        rateWaited = true;
        console.warn(`! rate limited; sleeping ${Math.round(waitMs / 1000)}s until reset`);
        await sleep(waitMs);
        continue;
      }
      throw new Error(`rate limited (${pathname})`);
    }
    if (res.status >= 500 && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
    if (allow.includes(res.status)) return { status: res.status, json: null, text: null, headers: res.headers };
    if (!res.ok) throw new Error(`HTTP ${res.status} ${pathname}`);
    if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
    if (res.status === 204) return { status: 204, json: null, headers: res.headers };
    return { status: res.status, json: await res.json(), headers: res.headers };
  }
  throw new Error(`gave up (${pathname})`);
}

async function paginate(pathname) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const sep = pathname.includes('?') ? '&' : '?';
    const { json } = await gh(`${pathname}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(json) || !json.length) break;
    out.push(...json);
    if (json.length < 100) break;
  }
  return out;
}

// ---------------------------------------------------------------- repo discovery
async function discoverRepos() {
  const repos = new Map();
  const add = r => { if (r && !repos.has(r.full_name)) repos.set(r.full_name, r); };
  try {
    let list;
    try { list = await paginate(`/orgs/${ORG}/repos?type=all&sort=pushed`); }
    catch (err) {
      if (/HTTP 404/.test(err.message)) list = await paginate(`/users/${ORG}/repos?sort=pushed`); // ORG may be a user account
      else throw err;
    }
    list.forEach(add);
  } catch (err) {
    apiReachable = false;
    errors.push({ scope: 'org', error: err.message });
    console.error(`! could not list repos for ${ORG}: ${err.message}`);
  }
  for (const u of USERS) {
    try { (await paginate(`/users/${u}/repos?sort=pushed`)).forEach(add); }
    catch (err) { errors.push({ scope: `user:${u}`, error: err.message }); }
  }
  for (const full of EXTRA) {
    try { add((await gh(`/repos/${full}`)).json); }
    catch (err) { errors.push({ scope: `repo:${full}`, error: err.message }); }
  }
  return [...repos.values()];
}

// ---------------------------------------------------------------- enrichment
async function enrich(repo) {
  const o = repo.owner.login, r = repo.name, base = `/repos/${o}/${r}`;
  const p = {
    name: r, full_name: repo.full_name, html_url: repo.html_url, description: repo.description || null,
    readme_title: null, readme_excerpt: '', default_branch: repo.default_branch || 'main',
    branches: [], has_gh_pages_branch: false, has_pages_workflow: false,
    created_at: repo.created_at, updated_at: repo.updated_at, pushed_at: repo.pushed_at,
    last_commit: { sha: null, date: null, message: null, author: null }, commit_count: 0, contributors: [],
    language: repo.language || null, languages: {}, stack: [], size_kb: repo.size || 0,
    entry_point: null, builds_with: null,
    links: { repo: repo.html_url, live: null, demo: null, sales: null, docs: null, other: [] }, readme_links: [],
    is_placeholder: false, topics: repo.topics || [], open_issues: repo.open_issues_count ?? null, stargazers: repo.stargazers_count ?? null,
    archived: repo.archived ?? null, has_readme: false, has_license: !!repo.license, has_ci: false, workflow_files: [], open_todos: 0,
    pages: { has_pages: typeof repo.has_pages === 'boolean' ? repo.has_pages : null, url: null, live: null, http_status: null, checked_at: null },
    screenshot: null, screenshot_source: 'none', screenshot_note: '',
    category: 'Other', status: 'in-progress', tags: [], notes: '', display_name: r, featured: false, hidden: false, source_channel: null,
  };
  const warn = [];

  // Pages (403 -> null: needs a token with pages scope; 404 -> not enabled)
  try {
    const { status, json } = await gh(`${base}/pages`, { allow: [403, 404] });
    if (status === 200) { p.pages.has_pages = true; p.pages.url = json.html_url || null; }
    else if (status === 404) { p.pages.has_pages = p.pages.has_pages === true ? true : false; }
    else if (p.pages.has_pages === null) p.pages.has_pages = null;
  } catch (err) { warn.push(`pages: ${err.message}`); }

  // Languages
  try { p.languages = (await gh(`${base}/languages`)).json || {}; } catch (err) { warn.push(`languages: ${err.message}`); }

  // Branches
  try {
    const list = (await gh(`${base}/branches?per_page=100`)).json || [];
    p.branches = list.map(b => b.name);
    p.has_gh_pages_branch = p.branches.includes('gh-pages');
  } catch (err) { warn.push(`branches: ${err.message}`); }

  // Last commit + count via Link header trick
  try {
    const { status, json, headers } = await gh(`${base}/commits?per_page=1`, { allow: [409] }); // 409 = empty repo
    if (status === 200 && Array.isArray(json) && json.length) {
      const c = json[0];
      p.last_commit = { sha: c.sha, date: c.commit?.committer?.date || c.commit?.author?.date || null, message: (c.commit?.message || '').split('\n')[0].slice(0, 200), author: c.commit?.author?.name || c.author?.login || null };
      const link = headers.get('link') || '';
      const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
      p.commit_count = m ? Number(m[1]) : json.length;
    }
  } catch (err) { warn.push(`commits: ${err.message}`); }

  // Contributors
  try {
    const { status, json } = await gh(`${base}/contributors?per_page=10`, { allow: [204, 403] });
    if (status === 200 && Array.isArray(json)) p.contributors = json.map(c => c.login).filter(Boolean);
  } catch (err) { warn.push(`contributors: ${err.message}`); }

  // README
  let readmeText = '';
  try {
    const { status, json } = await gh(`${base}/readme`, { allow: [404] });
    if (status === 200 && json?.content) {
      readmeText = Buffer.from(json.content, 'base64').toString('utf8');
      p.has_readme = true;
      Object.assign(p, parseReadme(readmeText));
    }
  } catch (err) { warn.push(`readme: ${err.message}`); }

  // Workflows
  try {
    const { status, json } = await gh(`${base}/contents/.github/workflows`, { allow: [404] });
    if (status === 200 && Array.isArray(json)) {
      p.workflow_files = json.filter(f => /\.ya?ml$/i.test(f.name)).map(f => f.name);
      p.has_ci = p.workflow_files.length > 0;
      for (const f of json.filter(f => /\.ya?ml$/i.test(f.name)).slice(0, 8)) {
        try {
          const { json: file } = await gh(`${base}/contents/${encodeURI(f.path)}`);
          const text = file?.content ? Buffer.from(file.content, 'base64').toString('utf8') : '';
          if (/deploy-pages|upload-pages-artifact|actions-gh-pages|peaceiris\/|gh-pages|configure-pages/i.test(text)) p.has_pages_workflow = true;
        } catch (err) { warn.push(`workflow ${f.name}: ${err.message}`); }
      }
    }
  } catch (err) { warn.push(`workflows: ${err.message}`); }

  // Entry point candidates
  for (const cand of ENTRY_CANDIDATES) {
    try {
      const { status } = await gh(`${base}/contents/${cand}`, { allow: [404] });
      if (status === 200) { p.entry_point = cand; break; }
    } catch (err) { warn.push(`entry ${cand}: ${err.message}`); break; }
  }

  // package.json -> build command + stack hints
  let pkg = null;
  try {
    const { status, json } = await gh(`${base}/contents/package.json`, { allow: [404] });
    if (status === 200 && json?.content) { try { pkg = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8')); } catch { warn.push('package.json: invalid JSON'); } }
  } catch (err) { warn.push(`package.json: ${err.message}`); }
  if (pkg) {
    const scripts = pkg.scripts || {};
    if (scripts.build) p.builds_with = 'npm run build';
    else if (scripts.export) p.builds_with = 'npm run export';
    else if (scripts.dev || scripts.start) p.builds_with = null;
  }
  if (!p.builds_with) {
    for (const [file, cmd] of [['build-single.js', 'node build-single.js'], ['build.js', 'node build.js'], ['build.mjs', 'node build.mjs'], ['Makefile', 'make'], ['build.sh', 'sh build.sh']]) {
      try {
        const { status } = await gh(`${base}/contents/${file}`, { allow: [404] });
        if (status === 200) { p.builds_with = cmd; break; }
      } catch { break; }
    }
  }
  p.stack = deriveStack(p, pkg, readmeText);

  // TODO / FIXME count from the tarball (one request, redirects to codeload which is not rate limited)
  if (!SKIP_TODOS && p.commit_count > 0 && (p.size_kb || 0) < 60_000) {
    try { p.open_todos = await countTodos(`${base}/tarball/${encodeURIComponent(p.default_branch)}`); }
    catch (err) { warn.push(`todos: ${err.message}`); }
  }

  // Links
  const home = (repo.homepage || '').trim();
  const guessPages = guessPagesUrl(o, r);
  if (p.pages.url) p.links.live = p.pages.url;
  else if (p.pages.has_pages || p.has_gh_pages_branch || p.has_pages_workflow) p.links.live = guessPages;
  else if (/github\.io/i.test(home)) p.links.live = home;
  if (home && !/github\.io/i.test(home)) p.links.sales = home;
  if (!p.pages.url && p.links.live) p.pages.url = p.links.live;
  for (const l of p.readme_links) {
    if (!p.links.demo && /demo|playground|try it|play/i.test(l.text) && /^https?:/.test(l.url) && !/github\.com/.test(l.url)) p.links.demo = l.url;
    if (!p.links.docs && /docs|documentation|manual|guide/i.test(l.text) && /^https?:/.test(l.url) && !/github\.com\/.*\/(blob|tree)\//.test(l.url)) p.links.docs = l.url;
  }

  // Live check
  if (p.links.live && !SKIP_LIVE) {
    const res = await checkLive(p.links.live);
    p.pages.live = res.live; p.pages.http_status = res.status; p.pages.checked_at = res.checked_at;
    if (!res.live && res.error) warn.push(`live: ${res.error}`);
  }

  // Placeholder detection
  p.is_placeholder = /^empty\d*$/i.test(r) || p.size_kb === 0 || (p.commit_count <= 1 && !p.has_readme && !p.entry_point && !Object.keys(p.languages).length);

  if (warn.length) errors.push({ scope: `repo:${p.full_name}`, error: warn.join('; ') });
  return p;
}

function parseReadme(md) {
  const out = { readme_title: null, readme_excerpt: '', readme_links: [] };
  const lines = md.split(/\r?\n/);
  const paras = [];
  let cur = [], inCode = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const h = line.match(/^#\s+(.+)/);
    if (h && !out.readme_title) { out.readme_title = stripMd(h[1]).slice(0, 120); continue; }
    if (/^#{1,6}\s/.test(line) || /^(\||<|!\[|\[!\[|---|\* \* \*)/.test(line.trim())) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } continue; }
    if (!line.trim()) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } continue; }
    cur.push(line.trim());
  }
  if (cur.length) paras.push(cur.join(' '));
  const text = paras.map(stripMd).filter(t => t.length > 20).slice(0, 3).join(' ');
  out.readme_excerpt = text.length > 600 ? text.slice(0, 597).replace(/\s+\S*$/, '') + '…' : text;
  const seen = new Set();
  for (const m of md.matchAll(/\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (seen.has(m[2])) continue; seen.add(m[2]);
    out.readme_links.push({ text: stripMd(m[1]), url: m[2] });
    if (out.readme_links.length >= 30) break;
  }
  for (const m of md.matchAll(/(?<![("\]])\bhttps?:\/\/[^\s)<>"']+/g)) {
    const u = m[0].replace(/[.,;:]+$/, '');
    if (seen.has(u) || out.readme_links.length >= 30) continue; seen.add(u);
    out.readme_links.push({ text: u.replace(/^https?:\/\//, '').slice(0, 60), url: u });
  }
  return out;
}
function stripMd(s) {
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_>#]/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function deriveStack(p, pkg, readme) {
  const s = new Set();
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = n => n in deps;
  if (has('next')) s.add('Next.js'); else if (has('react')) s.add('React');
  if (has('vue')) s.add('Vue'); if (has('svelte') || has('@sveltejs/kit')) s.add('Svelte'); if (has('astro')) s.add('Astro');
  if (has('vite')) s.add('Vite'); if (has('tailwindcss')) s.add('Tailwind'); if (has('typescript')) s.add('TypeScript');
  if (has('@supabase/supabase-js') || /supabase/i.test(readme)) s.add('Supabase');
  if (has('playwright') || has('@playwright/test')) s.add('Playwright'); if (has('vitest') || has('jest')) s.add('Tests');
  if (has('express') || has('fastify') || has('hono')) s.add('Node server');
  if (has('electron')) s.add('Electron'); if (has('three')) s.add('Three.js'); if (has('d3')) s.add('D3');
  const langs = Object.entries(p.languages).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (!s.has('TypeScript') && langs.includes('TypeScript')) s.add('TypeScript');
  if (!pkg && langs.includes('JavaScript') && langs.includes('HTML')) s.add('Vanilla JS');
  if (langs.includes('Python')) s.add('Python');
  if (langs.includes('HTML') && !s.has('Next.js') && !s.has('React') && !s.has('Vue') && !s.has('Svelte') && !s.has('Astro')) s.add(pkg ? 'HTML' : 'Static HTML');
  if (langs.includes('CSS') || langs.includes('SCSS')) s.add('CSS');
  if (langs.includes('Shell')) s.add('Shell');
  if (p.pages.has_pages || p.has_gh_pages_branch || p.has_pages_workflow) s.add('GitHub Pages');
  if (/vercel/i.test(p.links.sales || '') || /vercel\.app/i.test(readme)) s.add('Vercel');
  if (/webflow/i.test(readme) && /webflow/i.test(p.name)) s.add('Webflow');
  return normalizeStack([...s]);
}

// Canonical stack labels shared by the API build and the gathered-data merge.
const STACK_ALIAS = { 'vanilla html': 'Static HTML', 'static html': 'Static HTML', 'html': 'Static HTML', 'vanilla js': 'Vanilla JS', 'vanilla javascript': 'Vanilla JS', 'nextjs': 'Next.js', 'next': 'Next.js', 'github pages': 'GitHub Pages', 'gh-pages': 'GitHub Pages', 'typescript': 'TypeScript', 'tailwindcss': 'Tailwind', 'python': 'Python', 'nodejs': 'Node' };
const STACK_DROP = new Set(['google fonts', 'importmap', 'es modules', 'node']);
export function normalizeStack(list) {
  const out = [];
  for (const raw of list || []) {
    if (!raw) continue;
    const key = String(raw).trim().toLowerCase();
    if (STACK_DROP.has(key)) continue;
    const v = STACK_ALIAS[key] || String(raw).trim();
    if (!out.includes(v)) out.push(v);
  }
  // Static HTML is implied when a framework is present
  if (out.some(v => ['React', 'Next.js', 'Vue', 'Svelte', 'Astro', 'Vite'].includes(v))) { const i = out.indexOf('Static HTML'); if (i >= 0) out.splice(i, 1); }
  return out.slice(0, 10);
}

export function guessPagesUrl(owner, repo) {
  return repo.toLowerCase() === `${owner}.github.io`.toLowerCase() ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

// Count TODO/FIXME/HACK/XXX markers across text files inside the repo tarball. Zero deps: gunzip + minimal tar reader.
async function countTodos(tarPath) {
  const headers = { 'User-Agent': 'imagine-os-portfolio-bot/1.0', Accept: 'application/vnd.github+json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(API + tarPath, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`tarball HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 80 * 1024 * 1024) throw new Error('tarball too large');
  const tar = gunzipSync(buf);
  const TEXT = /\.(html?|css|scss|js|mjs|cjs|ts|tsx|jsx|json|md|txt|py|sh|ya?ml|toml|sql|vue|svelte|astro|rs|go|rb)$/i;
  const SKIP = /(^|\/)(node_modules|dist|build|\.git|vendor|\.next|out|coverage)\//i;
  let off = 0, count = 0, longName = null;
  while (off + 512 <= tar.length) {
    const hdr = tar.subarray(off, off + 512);
    if (hdr.every(b => b === 0)) break;
    let name = cstr(hdr, 0, 100);
    const prefix = cstr(hdr, 345, 155);
    if (prefix) name = prefix + '/' + name;
    const size = parseInt(cstr(hdr, 124, 12).trim() || '0', 8) || 0;
    const type = String.fromCharCode(hdr[156]);
    const dataStart = off + 512, dataEnd = dataStart + size;
    if (type === 'L') { longName = tar.subarray(dataStart, dataEnd).toString('utf8').replace(/\0+$/, ''); }
    else {
      if (longName) { name = longName; longName = null; }
      const rel = name.split('/').slice(1).join('/');
      if ((type === '0' || type === '\0' || type === '') && TEXT.test(rel) && !SKIP.test(rel) && size < 512 * 1024 && !/(\.min\.|-lock\.json$|lock\.yaml$)/.test(rel)) {
        const text = tar.subarray(dataStart, dataEnd).toString('utf8');
        const m = text.match(/\b(TODO|FIXME|HACK|XXX)\b/g);
        if (m) count += m.length;
      }
    }
    off = dataEnd + ((512 - (size % 512)) % 512);
  }
  return count;
}
const cstr = (b, s, l) => b.subarray(s, s + l).toString('utf8').replace(/\0.*$/s, '');

// ---------------------------------------------------------------- derive + overrides
export function deriveCategory(p) {
  const n = p.name.toLowerCase(), d = `${p.description || ''} ${p.readme_title || ''} ${(p.topics || []).join(' ')}`.toLowerCase();
  if (p.is_placeholder || /^empty\d*$/.test(n)) return 'Placeholder';
  if (/-audit$|audit|report/.test(n) || /\baudit\b|\breport\b/.test(d)) return 'Audit / Report';
  if (/shell|rebuild|recreation|clone/.test(n) || /pixel-faithful|recreation of|rebuild of|shell/.test(d)) return 'Prototype / Shell rebuild';
  if (/game|engine|play/.test(n) || /\bgame\b/.test(d)) return 'Game';
  if (/design|mock|explor|concept/.test(n) || /design exploration|mockups?|concepts?/.test(d)) return 'Design exploration';
  if (/tool|cli|script|builder|generator|bot|structure|template|starter/.test(n) || /\bcli\b|command[- ]line|tooling|internal tool|scaffold/.test(d)) return 'Tooling';
  return 'Product';
}
export function deriveStatus(p) {
  if (p.is_placeholder) return 'placeholder';
  if (p.archived) return 'archived';
  if (p.pages?.live === true) return 'live';
  if (p.pages?.has_pages || p.has_gh_pages_branch || p.has_pages_workflow || p.links?.live) return 'deployed-unverified';
  if (p.entry_point || p.builds_with) return 'built-not-deployed';
  return 'in-progress';
}
export function applyOverrides(p, o) {
  if (!o || typeof o !== 'object') return p;
  const out = { ...p };
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('_')) continue;
    if (k === 'links' && v && typeof v === 'object') out.links = { ...p.links, ...v };
    else out[k] = v;
  }
  if (out.status && !STATUSES.includes(out.status)) { console.warn(`! override for ${p.name}: unknown status "${out.status}"`); out.status = p.status; }
  if (out.category && !CATEGORIES.includes(out.category)) console.warn(`! override for ${p.name}: category "${out.category}" is not one of the standard categories`);
  return out;
}

// ---------------------------------------------------------------- main
async function main() {
  const started = Date.now();
  console.log(`build-data: org=${ORG}${USERS.length ? ' users=' + USERS.join(',') : ''}${EXTRA.length ? ' extra=' + EXTRA.join(',') : ''} token=${TOKEN ? 'yes' : 'no'}`);
  const previous = await readJson(DATA_FILE, null);
  const prevByName = new Map((previous?.projects || []).map(p => [p.name, p]));
  const overrides = await readJson(OVERRIDES_FILE, {});

  const repos = await discoverRepos();
  console.log(`found ${repos.length} repos`);

  const projects = [];
  for (const repo of repos) {
    process.stdout.write(`  ${repo.full_name} … `);
    let p;
    try {
      p = await enrich(repo);
      console.log(`ok (${p.commit_count} commits${p.links.live ? ', live=' + (p.pages.live ? 'yes' : 'no') : ''})`);
    } catch (err) {
      const prev = prevByName.get(repo.name);
      errors.push({ scope: `repo:${repo.full_name}`, error: err.message, kept_previous: !!prev });
      console.log(`FAILED: ${err.message}${prev ? ' (kept previous data)' : ''}`);
      p = prev ? { ...prev } : null;
      if (!p) continue;
      p.pushed_at = repo.pushed_at || p.pushed_at; p.updated_at = repo.updated_at || p.updated_at; p.description = repo.description ?? p.description;
    }
    finalizeProject(p, prevByName.get(p.name), overrides[p.name], { screenshotDir: SCREENSHOT_DIR });
    projects.push(p);
  }
  // Repos we could not list this run but had before: keep them (never lose data on a flaky run).
  if (!apiReachable && previous?.projects) {
    for (const prev of previous.projects) if (!projects.some(p => p.name === prev.name)) { finalizeProject(prev, prev, overrides[prev.name], { screenshotDir: SCREENSHOT_DIR }); projects.push(prev); }
  }

  projects.sort((a, b) => (Date.parse(b.pushed_at) || 0) - (Date.parse(a.pushed_at) || 0));
  const out = { generated_at: new Date().toISOString(), org: ORG, api_reachable: apiReachable, sources: { org: ORG, users: USERS, extra_repos: EXTRA }, errors, projects };
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(out, null, 2) + '\n');
  printSummary(projects);
  console.log(`\nwrote ${path.relative(ROOT, DATA_FILE)} · ${projects.length} projects · ${errors.length} warnings · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!apiReachable && !projects.length) process.exitCode = 1;
}

/** Derive category/status, resolve the screenshot on disk, then apply overrides. Shared with merge-gathered.mjs. */
export function finalizeProject(p, prev, override, { screenshotDir = SCREENSHOT_DIR } = {}) {
  p.stack = normalizeStack(p.stack);
  p.category = deriveCategory(p);
  p.status = deriveStatus(p);
  p.display_name = p.display_name || p.name;
  // screenshots: keep what is on disk
  const file = path.join(screenshotDir, `${p.name}.png`);
  if (existsSync(file)) {
    p.screenshot = `screenshots/${p.name}.png`;
    const own = p.screenshot_source && p.screenshot_source !== 'none' ? p.screenshot_source : null;
    p.screenshot_source = own || (prev?.screenshot_source && prev.screenshot_source !== 'none' ? prev.screenshot_source : 'live');
    p.screenshot_note = (own && p.screenshot_note) || prev?.screenshot_note || 'Existing screenshot kept';
  } else {
    p.screenshot = null; p.screenshot_source = 'none';
    p.screenshot_note = p.links?.live ? (p.pages?.live ? 'Not captured yet; run scripts/screenshot.mjs' : 'Live check failed; nothing captured') : 'No live URL; nothing to capture';
  }
  Object.assign(p, applyOverrides(p, override));
  return p;
}

const USAGE = `usage: node scripts/build-data.mjs [--help]

Queries the GitHub REST API for every repo in $PORTFOLIO_ORG (default imagine-os), enriches each one,
merges data/overrides.json and writes data/projects.json.

env: PORTFOLIO_TOKEN | GITHUB_TOKEN, PORTFOLIO_ORG, PORTFOLIO_USERS, PORTFOLIO_EXTRA_REPOS,
     PORTFOLIO_SKIP_LIVE=1, PORTFOLIO_SKIP_TODOS=1
see also: node scripts/merge-gathered.mjs --from <gathered.json>   (offline first-run path)`;

function printSummary(projects) {
  const cols = [['name', 26], ['status', 22], ['category', 26], ['commits', 8], ['pushed', 11], ['live', 5], ['todos', 6]];
  const row = vals => vals.map((v, i) => String(v ?? '').slice(0, cols[i][1]).padEnd(cols[i][1])).join(' ');
  console.log('\n' + row(cols.map(c => c[0])));
  console.log(row(cols.map(c => '-'.repeat(c[1]))));
  for (const p of projects) console.log(row([p.name, p.status, p.category, p.commit_count, (p.pushed_at || '').slice(0, 10), p.pages?.live === true ? 'yes' : p.links?.live ? 'no' : '-', p.open_todos]));
}

async function readJson(file, fallback) {
  try { await access(file); return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); }
  main().catch(err => { console.error(err); process.exit(1); });
}
