/* imagine-os portfolio catalogue — vanilla JS, no build step.
   Loads data/projects.json, renders cards / table / timeline, keeps control state in the URL hash. */
(() => {
  'use strict';

  // ---------- constants ----------
  const STATUS_ORDER = ['live', 'deployed-unverified', 'built-not-deployed', 'in-progress', 'placeholder', 'archived'];
  const STATUS_LABEL = {
    'live': 'Live',
    'deployed-unverified': 'Deployed · unverified',
    'built-not-deployed': 'Built · not deployed',
    'in-progress': 'In progress',
    'placeholder': 'Placeholder',
    'archived': 'Archived',
  };
  const TILE_LABEL = { 'live': 'Live', 'deployed-unverified': 'Unverified', 'built-not-deployed': 'Not deployed', 'in-progress': 'In progress', 'placeholder': 'Placeholders' };
  const TILE_STATUSES = ['live', 'deployed-unverified', 'built-not-deployed', 'in-progress', 'placeholder'];
  const CATEGORY_ORDER = ['Product', 'Prototype / Shell rebuild', 'Audit / Report', 'Tooling', 'Game', 'Design exploration', 'Placeholder', 'Other'];
  // Language -> fixed color slot (color follows the entity, never its rank).
  const LANG_SLOT = { JavaScript: 4, TypeScript: 1, HTML: 2, CSS: 7, SCSS: 5, Python: 3, Shell: 6, Markdown: 9, JSON: 9, SQL: 8, Go: 1, Rust: 2, Ruby: 8, Vue: 3, Svelte: 2, Astro: 2, PLpgSQL: 8, Dockerfile: 1 };

  const ICON = {
    check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 11 10.5H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 5v2.4M6 8.9v.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    box: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 10.5 4v4L6 10.5 1.5 8V4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M1.5 4 6 6.5 10.5 4M6 6.5v4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    dots: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="2.5" cy="6" r="1.3" fill="currentColor"/><circle cx="6" cy="6" r="1.3" fill="currentColor"/><circle cx="9.5" cy="6" r="1.3" fill="currentColor"/></svg>',
    dash: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6"/></svg>',
    archive: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="2" width="9" height="2.5" rx=".6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 4.5v5.5h7V4.5M4.8 7h2.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    ext: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5H3.5v9h9V9.5M9.5 3.5h3v3M12.5 3.5 7.5 8.5"/></svg>',
    eye: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
    gh: '<svg class="ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .8a7.2 7.2 0 0 0-2.3 14c.4.1.5-.2.5-.3v-1.3c-2 .4-2.4-1-2.4-1-.3-.8-.8-1-.8-1-.7-.5 0-.5 0-.5.7.1 1.1.8 1.1.8.6 1.1 1.7.8 2.1.6.1-.5.3-.8.5-1-1.6-.2-3.3-.8-3.3-3.6 0-.8.3-1.4.7-1.9 0-.2-.3-.9.1-1.9 0 0 .6-.2 2 .7a6.9 6.9 0 0 1 3.6 0c1.4-.9 2-.7 2-.7.4 1 .1 1.7.1 1.9.5.5.7 1.1.7 1.9 0 2.8-1.7 3.4-3.3 3.6.3.2.5.7.5 1.3v2c0 .2.1.4.5.3A7.2 7.2 0 0 0 8 .8z"/></svg>',
    x: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  };
  const STATUS_ICON = { 'live': ICON.check, 'deployed-unverified': ICON.warn, 'built-not-deployed': ICON.box, 'in-progress': ICON.dots, 'placeholder': ICON.dash, 'archived': ICON.archive };

  // ---------- DOM ----------
  const $ = (s, r = document) => r.querySelector(s);
  const el = {
    tiles: $('#tiles'), chips: $('#chips'), view: $('#view'), q: $('#q'), sort: $('#sort'), viewseg: $('#viewseg'),
    results: $('#results-line'), gen: $('#gen-time'), modal: $('#modal'), toasts: $('#toasts'),
    refresh: $('#btn-refresh'), theme: $('#btn-theme'), themeLabel: $('#theme-label'), fixture: $('#fixture-flag'),
  };

  const ORG = document.body.dataset.org || 'imagine-os';
  const PORTFOLIO_REPO = detectPortfolioRepo();

  // ---------- state ----------
  const DEFAULTS = { q: '', status: [], cat: [], stack: [], live: false, sales: false, demo: false, hideph: true, sort: 'pushed', view: 'cards', tl: 'created', tsort: 'pushed', tdir: 'desc' };
  let state = readHash();
  let data = null;         // full dataset
  let projects = [];       // data.projects (non-hidden)
  let liveOverlay = false;

  // ---------- boot ----------
  init();

  async function init() {
    bindControls();
    setThemeLabel();
    $('#lnk-org').href = `https://github.com/${ORG}`;
    $('#lnk-portfolio-repo').href = `https://github.com/${ORG}/${PORTFOLIO_REPO}`;
    $('#sub-org').textContent = `Every repository in the ${ORG} organization`;
    try {
      data = await loadData();
    } catch (err) {
      el.view.innerHTML = `<div class="empty"><h3>Could not load data/projects.json</h3><p>${esc(String(err.message || err))}</p><p>Run <code class="mono">node scripts/build-data.mjs</code> to generate it.</p></div>`;
      el.gen.textContent = 'no data';
      return;
    }
    projects = (data.projects || []).filter(p => !p.hidden);
    for (const p of projects) normalize(p);
    el.fixture.hidden = !data.fixture;
    renderGenTime();
    renderAll();
    window.addEventListener('hashchange', () => { state = readHash(); syncControls(); renderAll(); });
  }

  async function loadData() {
    let stamp = 'init';
    try { stamp = localStorage.getItem('portfolio-generated-at') || 'init'; } catch (e) {}
    const res = await fetch(`data/projects.json?v=${encodeURIComponent(stamp)}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    try { if (json.generated_at && json.generated_at !== stamp) localStorage.setItem('portfolio-generated-at', json.generated_at); } catch (e) {}
    return json;
  }

  function normalize(p) {
    p.display_name = p.display_name || p.name;
    p.links = p.links || {};
    p.pages = p.pages || {};
    p.stack = p.stack || [];
    p.tags = p.tags || [];
    p.branches = p.branches || [];
    p.languages = p.languages || {};
    p.readme_links = p.readme_links || [];
    p.workflow_files = p.workflow_files || [];
    p.contributors = p.contributors || [];
    p.status = STATUS_ORDER.includes(p.status) ? p.status : 'in-progress';
    p.category = p.category || 'Other';
    p.isLive = p.status === 'live' && !!(p.links.live || p.pages.url);
    p.liveUrl = p.links.live || p.pages.url || null;
  }

  // ---------- hash state ----------
  function readHash() {
    const s = { ...DEFAULTS, status: [], cat: [], stack: [] };
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return s;
    const sp = new URLSearchParams(h);
    if (sp.has('q')) s.q = sp.get('q');
    for (const k of ['status', 'cat', 'stack']) if (sp.has(k)) s[k] = sp.get(k).split(',').filter(Boolean);
    for (const k of ['live', 'sales', 'demo']) if (sp.has(k)) s[k] = sp.get(k) === '1';
    if (sp.has('ph')) s.hideph = sp.get('ph') !== '1';   // ph=1 means "show placeholders"
    if (sp.has('sort')) s.sort = sp.get('sort');
    if (sp.has('view') && ['cards', 'table', 'timeline'].includes(sp.get('view'))) s.view = sp.get('view');
    if (sp.has('tl')) s.tl = sp.get('tl') === 'pushed' ? 'pushed' : 'created';
    if (sp.has('tsort')) s.tsort = sp.get('tsort');
    if (sp.has('tdir')) s.tdir = sp.get('tdir') === 'asc' ? 'asc' : 'desc';
    if (sp.has('p')) s.open = sp.get('p');
    return s;
  }
  function writeHash() {
    const sp = new URLSearchParams();
    if (state.q) sp.set('q', state.q);
    for (const k of ['status', 'cat', 'stack']) if (state[k].length) sp.set(k, state[k].join(','));
    for (const k of ['live', 'sales', 'demo']) if (state[k]) sp.set(k, '1');
    if (!state.hideph) sp.set('ph', '1');
    if (state.sort !== DEFAULTS.sort) sp.set('sort', state.sort);
    if (state.view !== DEFAULTS.view) sp.set('view', state.view);
    if (state.tl !== DEFAULTS.tl) sp.set('tl', state.tl);
    if (state.tsort !== DEFAULTS.tsort) sp.set('tsort', state.tsort);
    if (state.tdir !== DEFAULTS.tdir) sp.set('tdir', state.tdir);
    if (state.open) sp.set('p', state.open);
    const str = sp.toString();
    const next = str ? '#' + str.replace(/%2C/g, ',') : '';
    if (next !== location.hash && !(next === '' && location.hash === '')) {
      history.replaceState(null, '', next || location.pathname + location.search);
    }
  }
  function update(patch) { Object.assign(state, patch); writeHash(); renderAll(); }

  // ---------- controls ----------
  function bindControls() {
    el.q.value = state.q;
    el.sort.value = state.sort;
    let t;
    el.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => update({ q: el.q.value.trim() }), 120); });
    el.sort.addEventListener('change', () => update({ sort: el.sort.value }));
    el.viewseg.addEventListener('click', e => {
      const b = e.target.closest('button[data-view]'); if (!b) return;
      update({ view: b.dataset.view });
    });
    el.refresh.addEventListener('click', refreshFromGitHub);
    el.theme.addEventListener('click', toggleTheme);
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) { e.preventDefault(); el.q.focus(); el.q.select(); }
      if (e.key === 'Escape') {
        if (el.modal.open) { el.modal.close(); }
        else if (document.activeElement === el.q && el.q.value) { el.q.value = ''; update({ q: '' }); }
      }
    });
    el.modal.addEventListener('close', () => { if (state.open) { state.open = null; writeHash(); } el.modal.innerHTML = ''; });
    el.modal.addEventListener('click', e => { if (e.target === el.modal) el.modal.close(); });
    syncControls();
  }
  function syncControls() {
    if (el.q.value !== state.q) el.q.value = state.q;
    el.sort.value = state.sort;
    for (const b of el.viewseg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  }
  function isTyping(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }

  // ---------- filtering & sorting ----------
  function filtered() {
    const q = state.q.toLowerCase();
    return projects.filter(p => {
      if (state.hideph && p.status === 'placeholder' && !state.status.includes('placeholder')) return false;
      if (state.status.length && !state.status.includes(p.status)) return false;
      if (state.cat.length && !state.cat.includes(p.category)) return false;
      if (state.stack.length && !state.stack.every(s => p.stack.includes(s))) return false;
      if (state.live && !p.isLive) return false;
      if (state.sales && !p.links.sales) return false;
      if (state.demo && !p.links.demo) return false;
      if (q) {
        const hay = [p.name, p.display_name, p.renamed_from, p.description, p.readme_title, p.readme_excerpt, p.notes, p.category, p.status, p.source_channel, ...p.stack, ...p.tags, ...(p.topics || [])].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function sorted(list, key = state.sort, dir) {
    const cmp = {
      'pushed': (a, b) => ts(b.pushed_at) - ts(a.pushed_at),
      'created-desc': (a, b) => ts(b.created_at) - ts(a.created_at),
      'created-asc': (a, b) => ts(a.created_at) - ts(b.created_at),
      'created': (a, b) => ts(b.created_at) - ts(a.created_at),
      'name': (a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }),
      'commits': (a, b) => (b.commit_count || 0) - (a.commit_count || 0),
      'status': (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || ts(b.pushed_at) - ts(a.pushed_at),
      'category': (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      'stack': (a, b) => a.stack.join().localeCompare(b.stack.join()),
      'live': (a, b) => Number(b.isLive) - Number(a.isLive),
      'demo': (a, b) => Number(!!b.links.demo) - Number(!!a.links.demo),
      'sales': (a, b) => Number(!!b.links.sales) - Number(!!a.links.sales),
      'repo': (a, b) => a.name.localeCompare(b.name),
    }[key] || ((a, b) => 0);
    const out = [...list].sort(cmp);
    if (dir === 'asc') out.reverse();
    // featured projects float to the top only for the default sort
    if (key === 'pushed' && !dir) out.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    return out;
  }
  const ts = d => d ? Date.parse(d) || 0 : 0;

  // ---------- render ----------
  function renderAll() {
    renderTiles();
    renderChips();
    const list = sorted(filtered());
    renderResultsLine(list.length);
    if (state.view === 'table') renderTable(list);
    else if (state.view === 'timeline') renderTimeline(list);
    else renderCards(list);
    if (state.open && !el.modal.open) {
      const p = projects.find(x => x.name === state.open);
      if (p) openModal(p, { preview: false });
    }
  }

  function renderGenTime() {
    const g = data.generated_at;
    if (!g) { el.gen.textContent = 'generated time unknown'; return; }
    el.gen.textContent = `data generated ${rel(g)}`;
    el.gen.title = abs(g);
    el.gen.dataset.abs = abs(g);
    if (data.api_reachable === false) el.gen.textContent += ' (API unreachable on last build)';
  }

  function renderTiles() {
    const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, 0]));
    for (const p of projects) counts[p.status]++;
    el.tiles.innerHTML = TILE_STATUSES.map(s => {
      const pressed = state.status.length === 1 && state.status[0] === s;
      return `<button type="button" class="tile t-${s}" data-status="${s}" aria-pressed="${pressed}" title="${pressed ? 'Show all statuses' : 'Show only ' + STATUS_LABEL[s]}">
        <span class="label">${TILE_LABEL[s]}</span>
        <span class="value">${counts[s]}</span>
      </button>`;
    }).join('');
    el.tiles.onclick = e => {
      const b = e.target.closest('.tile'); if (!b) return;
      const s = b.dataset.status;
      const pressed = state.status.length === 1 && state.status[0] === s;
      update({ status: pressed ? [] : [s] });
    };
  }

  function renderChips() {
    const counts = {};
    for (const p of projects) counts[p.status] = (counts[p.status] || 0) + 1;
    const cats = new Map();
    for (const p of projects) cats.set(p.category, (cats.get(p.category) || 0) + 1);
    const stacks = new Map();
    for (const p of projects) for (const s of p.stack) stacks.set(s, (stacks.get(s) || 0) + 1);
    const catList = [...cats.keys()].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
    const stackList = [...stacks.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const anyActive = state.status.length || state.cat.length || state.stack.length || state.live || state.sales || state.demo || state.q || !state.hideph;

    let h = `<span class="group-label">Status</span>`;
    h += STATUS_ORDER.filter(s => counts[s]).map(s =>
      `<button type="button" class="chip status ${s}" data-status="${s}" data-k="status" data-v="${s}" aria-pressed="${state.status.includes(s)}"><span class="sw"></span>${STATUS_LABEL[s]}<span class="cnt">${counts[s]}</span></button>`).join('');
    h += `<span class="sep"></span><span class="group-label">Category</span>`;
    h += catList.map(c => `<button type="button" class="chip" data-k="cat" data-v="${esc(c)}" aria-pressed="${state.cat.includes(c)}">${esc(c)}<span class="cnt">${cats.get(c)}</span></button>`).join('');
    h += `<span class="sep"></span>`;
    h += `<details><summary class="chip" aria-pressed="${state.stack.length > 0}" role="button">Stack${state.stack.length ? `: ${esc(state.stack.join(', '))}` : ''}<span class="cnt">▾</span></summary>
      <div class="stackpop">${stackList.length ? stackList.map(s => `<button type="button" class="chip" data-k="stack" data-v="${esc(s)}" aria-pressed="${state.stack.includes(s)}">${esc(s)}<span class="cnt">${stacks.get(s)}</span></button>`).join('') : '<span class="cnt">No stack data yet</span>'}</div></details>`;
    h += `<span class="sep"></span>`;
    h += `<button type="button" class="chip toggle" data-k="live" aria-pressed="${state.live}">Has live link</button>`;
    h += `<button type="button" class="chip toggle" data-k="sales" aria-pressed="${state.sales}">Has sales site</button>`;
    h += `<button type="button" class="chip toggle" data-k="demo" aria-pressed="${state.demo}">Has demo</button>`;
    h += `<button type="button" class="chip toggle" data-k="hideph" aria-pressed="${state.hideph}" title="Placeholder repos (empty shells) are hidden by default">Hide placeholders</button>`;
    if (anyActive) h += `<button type="button" class="chip clear" data-k="clear">Clear all</button>`;
    el.chips.innerHTML = h;
    el.chips.onclick = e => {
      const b = e.target.closest('button.chip'); if (!b) return;
      const k = b.dataset.k, v = b.dataset.v;
      if (k === 'clear') { el.q.value = ''; update({ ...DEFAULTS, status: [], cat: [], stack: [], view: state.view, sort: state.sort, tl: state.tl }); return; }
      if (k === 'status' || k === 'cat' || k === 'stack') {
        const arr = state[k].includes(v) ? state[k].filter(x => x !== v) : [...state[k], v];
        const patch = { [k]: arr };
        if (k === 'status' && v === 'placeholder' && arr.includes('placeholder')) patch.hideph = false;
        update(patch); return;
      }
      if (k in state) update({ [k]: !state[k] });
    };
  }

  function renderResultsLine(n) {
    const total = projects.length;
    const hiddenPh = state.hideph ? projects.filter(p => p.status === 'placeholder' && !state.status.includes('placeholder')).length : 0;
    let s = `<span><strong>${n}</strong> of ${total} projects</span>`;
    if (hiddenPh) s += `<span>${hiddenPh} placeholder${hiddenPh > 1 ? 's' : ''} hidden</span>`;
    if (liveOverlay) s += `<span>overlaid with live GitHub metadata</span>`;
    const changed = projects.filter(p => p._changed).length;
    if (changed) s += `<span class="pill changed">${changed} changed since last build</span>`;
    el.results.innerHTML = s;
  }

  // ----- cards -----
  function renderCards(list) {
    if (!list.length) { el.view.innerHTML = emptyState(); return; }
    el.view.innerHTML = `<div class="grid">${list.map(cardHTML).join('')}</div>`;
    bindProjectActions(el.view);
  }
  function cardHTML(p) {
    const cls = ['card', p.status, p.featured ? 'featured' : ''].join(' ');
    return `<article class="${cls}" data-status="${p.status}" data-name="${esc(p.name)}">
      ${shotHTML(p)}
      <div class="body">
        <div class="head">
          <h3><button type="button" data-act="open" data-name="${esc(p.name)}">${esc(p.display_name)}</button></h3>
          ${statusPill(p)}
        </div>
        <div class="pills">
          <span class="pill cat">${esc(p.category)}</span>
          ${p.featured ? '<span class="pill featured">Featured</span>' : ''}
          ${p._changed ? '<span class="pill changed" title="pushed_at is newer than the last data build">changed since last build</span>' : ''}
          ${p._new ? '<span class="pill changed" title="Repo exists on GitHub but is not in data/projects.json yet">new since last build</span>' : ''}
        </div>
        <p class="desc ${blurb(p) ? '' : 'empty'}">${esc(blurb(p) || (p.status === 'placeholder' ? 'Empty repository — no description, no files yet.' : 'No description on GitHub or README.'))}</p>
        ${p.stack.length ? `<div class="stack">${p.stack.slice(0, 6).map(s => `<span>${esc(s)}</span>`).join('')}${p.stack.length > 6 ? `<span>+${p.stack.length - 6}</span>` : ''}</div>` : ''}
        <div class="meta">
          <span title="${abs(p.created_at)}">created <b>${rel(p.created_at)}</b></span>
          <span title="${abs(p.pushed_at)}">pushed <b>${rel(p.pushed_at)}</b></span>
          <span class="num">${fmtInt(p.commit_count)} commit${p.commit_count === 1 ? '' : 's'}</span>
          ${p.open_todos ? `<span class="num" title="TODO / FIXME markers found in the repo">${p.open_todos} TODO</span>` : ''}
        </div>
      </div>
      <div class="foot">
        ${p.isLive
          ? `<a class="btn primary sm" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">${ICON.ext}Open live</a>`
          : `<span class="btn primary sm" aria-disabled="true" title="${esc(notLiveReason(p))}">${ICON.ext}Open live</span>`}
        ${p.links.demo ? `<a class="btn sm" href="${esc(p.links.demo)}" target="_blank" rel="noopener">Demo</a>` : ''}
        ${p.links.sales ? `<a class="btn sm" href="${esc(p.links.sales)}" target="_blank" rel="noopener">Sales site</a>` : ''}
        <a class="btn sm" href="${esc(p.html_url)}" target="_blank" rel="noopener" title="Open repository on GitHub">${ICON.gh}Repo</a>
        <span class="spacer"></span>
        <button type="button" class="btn sm ghost" data-act="preview" data-name="${esc(p.name)}" title="${p.isLive ? 'Embedded preview and full details' : 'Full details (no live URL to preview)'}">${ICON.eye}${p.isLive ? 'Preview' : 'Details'}</button>
      </div>
    </article>`;
  }
  function shotHTML(p, small = false) {
    const [a, b] = gradientFor(p.name);
    const src = p.screenshot && p.screenshot_source !== 'none' ? `${p.screenshot}?v=${encodeURIComponent(data.generated_at || '')}` : null;
    const thumb = src && small ? src.replace(/^screenshots\//, 'screenshots/thumbs/') : src;
    return `<div class="shot" style="--ph-a:${a};--ph-b:${b}">
      ${thumb
        ? `<img src="${esc(thumb)}" alt="Screenshot of ${esc(p.display_name)}" loading="lazy" decoding="async" onerror="this.remove()">
           <div class="ph" aria-hidden="true">${esc(initials(p.display_name))}<small>no screenshot</small></div>
           ${!small && p.screenshot_source === 'local-render' ? '<span class="tag-src" title="Rendered from the repo files, not the live site">local render</span>' : ''}`
        : `<div class="ph" aria-hidden="true">${esc(initials(p.display_name))}<small>no screenshot</small></div>`}
    </div>`;
  }
  function statusPill(p) {
    return `<span class="pill status ${p.status}" data-status="${p.status}" title="${esc(statusTitle(p))}">${STATUS_ICON[p.status]}${STATUS_LABEL[p.status]}</span>`;
  }
  function statusTitle(p) {
    switch (p.status) {
      case 'live': return `Live at ${p.liveUrl || 'its homepage'}${p.pages.checked_at ? ' · checked ' + rel(p.pages.checked_at) : ''}`;
      case 'deployed-unverified': return `A Pages branch/workflow exists but the live check ${p.pages.http_status ? 'returned HTTP ' + p.pages.http_status : 'did not pass'}`;
      case 'built-not-deployed': return 'Has an entry point or build script but no Pages deployment';
      case 'in-progress': return 'No deploy signal yet';
      case 'placeholder': return 'Empty repository';
      case 'archived': return 'Archived on GitHub';
    }
    return '';
  }
  function notLiveReason(p) {
    if (p.status === 'deployed-unverified') return `Not verified live${p.pages.http_status ? ' (HTTP ' + p.pages.http_status + ')' : ''}. ${p.liveUrl ? 'Expected at ' + p.liveUrl : ''}`;
    if (p.status === 'built-not-deployed') return 'Built but never deployed. Enable GitHub Pages for this repo.';
    if (p.status === 'placeholder') return 'Placeholder repository, nothing to open.';
    if (p.status === 'archived') return 'Archived repository.';
    return 'No live URL yet.';
  }

  // ----- table -----
  const COLS = [
    ['name', 'Name'], ['status', 'Status'], ['category', 'Category'], ['stack', 'Stack'], ['created', 'Created'], ['pushed', 'Pushed'],
    ['commits', 'Commits'], ['live', 'Live'], ['demo', 'Demo'], ['sales', 'Sales'], ['repo', 'Repo'],
  ];
  function renderTable(list) {
    if (!list.length) { el.view.innerHTML = emptyState(); return; }
    const key = state.tsort, dir = state.tdir;
    const rows = sorted(list, key, dir);
    el.view.innerHTML = `<div class="tablewrap"><table class="dense">
      <thead><tr>${COLS.map(([k, l]) => `<th scope="col" data-k="${k}" ${k === key ? `aria-sort="${dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${l}<span class="arrow">${k === key ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.map(p => `<tr data-status="${p.status}">
        <td class="name"><button type="button" data-act="open" data-name="${esc(p.name)}">${esc(p.display_name)}</button><small>${esc(p.name)}</small></td>
        <td>${statusPill(p)}</td>
        <td><span class="pill cat">${esc(p.category)}</span></td>
        <td><div class="stack">${p.stack.slice(0, 4).map(s => `<span>${esc(s)}</span>`).join('')}${p.stack.length > 4 ? `<span>+${p.stack.length - 4}</span>` : ''}</div></td>
        <td class="num" title="${abs(p.created_at)}">${shortDate(p.created_at)}</td>
        <td class="num" title="${abs(p.pushed_at)}">${shortDate(p.pushed_at)}</td>
        <td class="num">${fmtInt(p.commit_count)}</td>
        <td class="link">${p.isLive ? `<a href="${esc(p.liveUrl)}" target="_blank" rel="noopener">open</a>` : `<span class="live-no" title="${esc(notLiveReason(p))}">no</span>`}</td>
        <td class="link">${p.links.demo ? `<a href="${esc(p.links.demo)}" target="_blank" rel="noopener">demo</a>` : '<span class="no">—</span>'}</td>
        <td class="link">${p.links.sales ? `<a href="${esc(p.links.sales)}" target="_blank" rel="noopener">${esc(hostOf(p.links.sales))}</a>` : '<span class="no">—</span>'}</td>
        <td class="link"><a href="${esc(p.html_url)}" target="_blank" rel="noopener">github</a></td>
      </tr>`).join('')}</tbody></table></div>`;
    el.view.querySelector('thead').onclick = e => {
      const th = e.target.closest('th'); if (!th) return;
      const k = th.dataset.k;
      const defaultDir = ['name', 'category', 'stack', 'repo'].includes(k) ? 'asc' : 'desc';
      if (state.tsort === k) update({ tdir: state.tdir === 'asc' ? 'desc' : 'asc' });
      else update({ tsort: k, tdir: defaultDir });
    };
    bindProjectActions(el.view);
  }

  // ----- timeline -----
  function renderTimeline(list) {
    if (!list.length) { el.view.innerHTML = emptyState(); return; }
    const field = state.tl === 'pushed' ? 'pushed_at' : 'created_at';
    const rows = [...list].sort((a, b) => ts(b[field]) - ts(a[field]));
    const groups = new Map();
    for (const p of rows) {
      const d = new Date(p[field]);
      const k = isNaN(d) ? 'unknown' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    el.view.innerHTML = `<div class="tl-controls"><span>Group by</span>
      <div class="seg" role="group" aria-label="Timeline field">
        <button type="button" data-tl="created" aria-pressed="${state.tl === 'created'}">Created</button>
        <button type="button" data-tl="pushed" aria-pressed="${state.tl === 'pushed'}">Last pushed</button>
      </div></div>
      <div class="timeline">${[...groups.entries()].map(([k, ps]) => `
        <section class="tl-month">
          <h3>${monthLabel(k)}<small>${ps.length} project${ps.length > 1 ? 's' : ''}</small></h3>
          <div class="tl-items">${ps.map(p => `
            <button type="button" class="tl-item" data-status="${p.status}" data-act="open" data-name="${esc(p.name)}">
              ${shotHTML(p, true)}
              <div class="t">
                <div class="n">${esc(p.display_name)} ${statusPill(p)}</div>
                <div class="d"><span title="${abs(p[field])}">${state.tl === 'pushed' ? 'pushed' : 'created'} ${shortDate(p[field])}</span><span>${esc(p.category)}</span><span class="num">${fmtInt(p.commit_count)} commits</span></div>
              </div>
            </button>`).join('')}</div>
        </section>`).join('')}</div>`;
    el.view.querySelector('.tl-controls').onclick = e => { const b = e.target.closest('button[data-tl]'); if (b) update({ tl: b.dataset.tl }); };
    bindProjectActions(el.view);
  }
  function monthLabel(k) {
    if (k === 'unknown') return 'Unknown date';
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function emptyState() {
    return `<div class="empty">
      <h3>Nothing matches these filters</h3>
      <p>Try clearing the search or a filter chip.${state.hideph ? ' Placeholder repos are hidden; toggle “Hide placeholders” to include them.' : ''}</p>
      <button type="button" class="btn" id="empty-clear">Clear all filters</button>
    </div>`;
  }
  el.view.addEventListener('click', e => {
    if (e.target.id === 'empty-clear') { el.q.value = ''; update({ ...DEFAULTS, status: [], cat: [], stack: [], view: state.view }); }
  });

  function bindProjectActions(root) {
    root.onclick = e => {
      if (e.target.id === 'empty-clear') return;
      const b = e.target.closest('[data-act]'); if (!b) return;
      const p = projects.find(x => x.name === b.dataset.name); if (!p) return;
      openModal(p, { preview: b.dataset.act === 'preview' });
    };
  }

  // ---------- modal ----------
  function openModal(p, { preview }) {
    state.open = p.name; writeHash();
    const actionsUrl = `${p.html_url}/actions`;
    const editUrl = `https://github.com/${ORG}/${PORTFOLIO_REPO}/edit/main/data/overrides.json`;
    const langs = Object.entries(p.languages).sort((a, b) => b[1] - a[1]);
    const total = langs.reduce((s, [, v]) => s + v, 0);
    const [ga, gb] = gradientFor(p.name);

    el.modal.innerHTML = `
      <div class="mhead">
        <div>
          <h2 id="modal-title">${esc(p.display_name)}</h2>
          <div class="sub">${esc(p.full_name || p.name)}${p.source_channel ? ` · from ${esc(p.source_channel)}` : ''}</div>
          <div class="pills">${statusPill(p)}<span class="pill cat">${esc(p.category)}</span>${p.featured ? '<span class="pill featured">Featured</span>' : ''}${p._changed ? '<span class="pill changed">changed since last build</span>' : ''}${p.tags.map(t => `<span class="tagchip">#${esc(t)}</span>`).join('')}</div>
        </div>
        <button type="button" class="btn ghost x" data-close aria-label="Close">${ICON.x}</button>
      </div>
      <div class="mbody">
        ${p.isLive ? `
          <div>
            <div class="frame" id="frame" style="--ph-a:${ga};--ph-b:${gb}">
              ${preview
                ? `<iframe src="${esc(p.liveUrl)}" title="Live preview of ${esc(p.display_name)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`
                : `<div class="ph"><button type="button" class="btn" id="load-preview">${ICON.eye}Load live preview</button></div>`}
            </div>
            <p class="frame-note">Embedded from <a href="${esc(p.liveUrl)}" target="_blank" rel="noopener">${esc(p.liveUrl)}</a>. Some sites block embedding (X-Frame-Options / CSP); if the frame stays blank, use Open live.</p>
          </div>` : `
          <div>
            ${shotHTML(p)}
            <p class="frame-note">${esc(notLiveReason(p))}</p>
          </div>`}

        <div class="cols">
          <div class="block" style="gap:16px">
            <div class="block">
              <h4>Description</h4>
              <p class="excerpt">${esc(blurb(p) || 'No description on GitHub or README.')}</p>
              ${p.readme_excerpt && p.readme_excerpt !== blurb(p) ? `<h4 style="margin-top:8px">README${p.readme_title ? ` · ${esc(p.readme_title)}` : ''}</h4><p class="excerpt">${esc(p.readme_excerpt)}</p>` : ''}
            </div>
            ${p.notes ? `<div class="block"><h4>Builder notes (from overrides)</h4><div class="notes">${esc(p.notes)}</div></div>` : ''}
            <div class="block">
              <h4>Links</h4>
              <div class="links">
                ${p.isLive ? `<a class="btn primary sm" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">${ICON.ext}Open live</a>` : (p.liveUrl ? `<a class="btn sm" href="${esc(p.liveUrl)}" target="_blank" rel="noopener" title="Expected URL, not verified live">${ICON.ext}Expected live URL</a>` : '')}
                ${p.links.demo ? `<a class="btn sm" href="${esc(p.links.demo)}" target="_blank" rel="noopener">Demo</a>` : ''}
                ${p.links.sales ? `<a class="btn sm" href="${esc(p.links.sales)}" target="_blank" rel="noopener">Sales site · ${esc(hostOf(p.links.sales))}</a>` : ''}
                ${p.links.docs ? `<a class="btn sm" href="${esc(p.links.docs)}" target="_blank" rel="noopener">Docs</a>` : ''}
                ${otherLinks(p.links.other).map(u => `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${esc(hostOf(u))}</a>`).join('')}${(p.links.other || []).length > 8 ? `<span class="btn sm ghost" aria-disabled="true">+${p.links.other.length - otherLinks(p.links.other).length} more in README</span>` : ''}
              </div>
              ${p.readme_links.length ? `<ul class="plain" style="margin-top:6px">${p.readme_links.slice(0, 12).map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text || l.url)}</a> <span class="mono" style="color:var(--text-3)">${esc(hostOf(l.url))}</span></li>`).join('')}</ul>` : ''}
            </div>
            <div class="block">
              <h4>Languages</h4>
              ${langs.length ? langBar(langs, total) : '<span style="color:var(--text-3)">No language data</span>'}
            </div>
            ${p.stack.length ? `<div class="block"><h4>Stack</h4><div class="stack">${p.stack.map(s => `<span>${esc(s)}</span>`).join('')}</div></div>` : ''}
          </div>

          <div class="block" style="gap:16px">
            <div class="block">
              <h4>Repository</h4>
              <dl class="kv">
                ${p.renamed_from ? `<dt>Renamed</dt><dd>from <span class="mono">${esc(p.renamed_from)}</span></dd>` : ''}
                <dt>Created</dt><dd title="${abs(p.created_at)}">${abs(p.created_at)} <span style="color:var(--text-3)">(${rel(p.created_at)})</span></dd>
                <dt>Pushed</dt><dd title="${abs(p.pushed_at)}">${abs(p.pushed_at)} <span style="color:var(--text-3)">(${rel(p.pushed_at)})</span></dd>
                <dt>Commits</dt><dd class="num">${fmtInt(p.commit_count)}</dd>
                <dt>Size</dt><dd class="num">${fmtSize(p.size_kb)}</dd>
                <dt>Issues</dt><dd class="num ${p.open_issues == null ? 'muted' : ''}">${p.open_issues == null ? 'unknown' : p.open_issues + ' open'}</dd>
                <dt>TODOs</dt><dd class="num ${p.open_todos ? '' : 'muted'}">${p.open_todos || 0} in source</dd>
                <dt>Contributors</dt><dd>${p.contributors.length ? p.contributors.map(c => `<span class="mono">${esc(c)}</span>`).join(', ') : '<span class="muted">unknown</span>'}</dd>
                <dt>Topics</dt><dd class="${(p.topics || []).length ? '' : 'muted'}">${(p.topics || []).length ? p.topics.map(t => esc(t)).join(', ') : 'none'}</dd>
                <dt>README</dt><dd>${p.has_readme ? 'yes' : '<span style="color:var(--s-notdeployed)">missing</span>'}${p.has_license ? ' · license' : ' · no license'}</dd>
              </dl>
            </div>
            <div class="block">
              <h4>Branches</h4>
              <div class="branches">${p.branches.length ? p.branches.map(b => `<span class="${b === p.default_branch ? 'default' : ''} ${b === 'gh-pages' ? 'pages' : ''}" title="${b === p.default_branch ? 'default branch' : b === 'gh-pages' ? 'GitHub Pages branch' : ''}">${esc(b)}</span>`).join('') : '<span>unknown</span>'}</div>
            </div>
            <div class="block">
              <h4>Last commit</h4>
              ${p.last_commit && p.last_commit.sha ? `<div class="commit">
                <div class="msg">${esc(p.last_commit.message || '')}</div>
                <div class="who"><a class="mono" href="${esc(p.html_url)}/commit/${esc(p.last_commit.sha)}" target="_blank" rel="noopener">${esc(String(p.last_commit.sha).slice(0, 7))}</a> · ${esc(p.last_commit.author || 'unknown')} · <span title="${abs(p.last_commit.date)}">${rel(p.last_commit.date)}</span></div>
              </div>` : '<span style="color:var(--text-3)">unknown</span>'}
            </div>
            <div class="block">
              <h4>Build &amp; deploy</h4>
              <dl class="kv">
                <dt>Entry point</dt><dd class="${p.entry_point ? 'mono' : 'muted'}">${esc(p.entry_point || 'none detected')}</dd>
                <dt>Builds with</dt><dd class="${p.builds_with ? 'mono' : 'muted'}">${esc(p.builds_with || 'no build step')}</dd>
                <dt>Pages</dt><dd>${pagesSummary(p)}</dd>
                <dt>Workflows</dt><dd class="${p.workflow_files.length ? 'mono' : 'muted'}">${p.workflow_files.length ? p.workflow_files.map(esc).join(', ') : 'none'}${p.has_pages_workflow ? ' <span class="pill status live" data-status="live" style="font-size:10.5px">pages deploy</span>' : ''}</dd>
                <dt>Screenshot</dt><dd class="${p.screenshot ? '' : 'muted'}">${esc(p.screenshot_source || 'none')}${p.screenshot_note ? ` · <span style="color:var(--text-3)">${esc(p.screenshot_note)}</span>` : ''}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div class="mfoot">
          <a class="btn sm" href="${esc(p.html_url)}" target="_blank" rel="noopener">${ICON.gh}Open in GitHub</a>
          <a class="btn sm" href="${esc(actionsUrl)}" target="_blank" rel="noopener">View Actions</a>
          <span class="spacer"></span>
          <a class="btn sm" href="${esc(editUrl)}" target="_blank" rel="noopener" title="Edit data/overrides.json in the ${esc(PORTFOLIO_REPO)} repo">Edit overrides on GitHub</a>
        </div>
      </div>`;
    el.modal.querySelector('[data-close]').onclick = () => el.modal.close();
    const lp = el.modal.querySelector('#load-preview');
    if (lp) lp.onclick = () => {
      $('#frame', el.modal).innerHTML = `<iframe src="${esc(p.liveUrl)}" title="Live preview of ${esc(p.display_name)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
    };
    if (!el.modal.open) el.modal.showModal();
    el.modal.scrollTop = 0;
  }
  function pagesSummary(p) {
    const parts = [];
    if (p.pages.has_pages === true) parts.push('enabled');
    else if (p.pages.has_pages === false) parts.push('not enabled');
    else parts.push('unknown (needs token)');
    if (p.has_gh_pages_branch) parts.push('gh-pages branch');
    if (p.pages.checked_at) parts.push(`live check ${p.pages.live ? 'passed' : 'failed'}${p.pages.http_status ? ' · HTTP ' + p.pages.http_status : ''} · ${rel(p.pages.checked_at)}`);
    else parts.push('live check not run');
    return esc(parts.join(' · '));
  }
  // Stacked horizontal bar (dataviz): one scale, 2px gaps, direct labels in text ink; color follows the language.
  function langBar(langs, total) {
    const top = langs.slice(0, 6);
    const rest = langs.slice(6).reduce((s, [, v]) => s + v, 0);
    if (rest) top.push(['Other', rest]);
    const pct = v => Math.max(0.6, (v / total) * 100);
    return `<div class="langbar" role="img" aria-label="${esc(top.map(([k, v]) => `${k} ${Math.round(v / total * 100)}%`).join(', '))}">
      <div class="bar">${top.map(([k, v]) => `<span style="flex:${pct(v).toFixed(2)} 1 0;--lc:var(--l${langSlot(k)})" title="${esc(k)} · ${Math.round(v / total * 100)}% · ${fmtSize(v / 1024)}"></span>`).join('')}</div>
      <div class="legend">${top.map(([k, v]) => `<span style="--lc:var(--l${langSlot(k)})"><i></i><b>${esc(k)}</b><span class="pct">${Math.round(v / total * 100)}%</span></span>`).join('')}</div>
    </div>`;
  }
  function langSlot(name) {
    if (name === 'Other') return 9;
    if (LANG_SLOT[name]) return LANG_SLOT[name];
    return (hash(name) % 8) + 1;
  }

  // ---------- Refresh from GitHub ----------
  async function refreshFromGitHub() {
    if (!data) return;
    el.refresh.classList.add('busy'); el.refresh.disabled = true;
    try {
      const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100&sort=pushed`, { headers: { Accept: 'application/vnd.github+json' } });
      if (res.status === 403 || res.status === 429) {
        const reset = res.headers.get('X-RateLimit-Reset');
        const when = reset ? ` Resets ${rel(new Date(Number(reset) * 1000).toISOString())}.` : '';
        toast(`GitHub API rate limit reached (unauthenticated, 60/hour).${when} The built-in data is still shown.`, 'err');
        return;
      }
      if (res.status === 404) { toast(`Organization "${ORG}" not found or not public.`, 'err'); return; }
      if (!res.ok) { toast(`GitHub API returned HTTP ${res.status}.`, 'err'); return; }
      const repos = await res.json();
      const byName = new Map(projects.map(p => [p.name, p]));
      const gen = ts(data.generated_at);
      let changed = 0, added = 0;
      for (const r of repos) {
        let p = byName.get(r.name);
        if (!p) {
          if ((data.projects || []).some(x => x.name === r.name && x.hidden)) continue;
          p = {
            name: r.name, full_name: r.full_name, html_url: r.html_url, description: r.description, readme_excerpt: '',
            default_branch: r.default_branch, branches: [], created_at: r.created_at, updated_at: r.updated_at, pushed_at: r.pushed_at,
            last_commit: {}, commit_count: null, contributors: [], language: r.language, languages: r.language ? { [r.language]: 1 } : {}, stack: [],
            size_kb: r.size, links: { repo: r.html_url, live: r.has_pages ? `https://${ORG}.github.io/${r.name}/` : null, demo: null, sales: null, docs: null, other: [] },
            readme_links: [], is_placeholder: r.size === 0, topics: r.topics || [], open_issues: r.open_issues_count, stargazers: r.stargazers_count, archived: r.archived,
            has_readme: null, has_license: !!r.license, has_ci: null, workflow_files: [], open_todos: 0,
            pages: { has_pages: r.has_pages, url: r.has_pages ? `https://${ORG}.github.io/${r.name}/` : null, live: null, http_status: null, checked_at: null },
            screenshot: null, screenshot_source: 'none', screenshot_note: 'Not yet built into the dataset',
            category: r.size === 0 ? 'Placeholder' : 'Other', status: r.archived ? 'archived' : r.size === 0 ? 'placeholder' : r.has_pages ? 'deployed-unverified' : 'in-progress',
            tags: [], notes: '', display_name: r.name, featured: false, hidden: false, source_channel: null, _new: true,
          };
          normalize(p);
          projects.push(p);
          added++;
          continue;
        }
        const newer = ts(r.pushed_at) > Math.max(ts(p.pushed_at), 0);
        if (ts(r.pushed_at) > gen && newer) { p._changed = true; changed++; }
        p.pushed_at = r.pushed_at || p.pushed_at;
        p.updated_at = r.updated_at || p.updated_at;
        if (r.description) p.description = r.description;
        if (r.homepage && !/github\.io/i.test(r.homepage) && !p.links.sales) p.links.sales = r.homepage;
        if (typeof r.has_pages === 'boolean') {
          p.pages.has_pages = r.has_pages;
          if (r.has_pages && !p.liveUrl) { p.pages.url = `https://${ORG}.github.io/${r.name}/`; p.liveUrl = p.pages.url; if (p.status === 'in-progress' || p.status === 'built-not-deployed') p.status = 'deployed-unverified'; }
        }
        if (typeof r.archived === 'boolean') { p.archived = r.archived; if (r.archived) p.status = 'archived'; }
        if (typeof r.open_issues_count === 'number') p.open_issues = r.open_issues_count;
        if (typeof r.stargazers_count === 'number') p.stargazers = r.stargazers_count;
      }
      liveOverlay = true;
      renderAll();
      toast(`Refreshed from GitHub: ${repos.length} repos · ${changed} changed since last build${added ? ` · ${added} new` : ''}.`, 'ok');
    } catch (err) {
      toast(`Could not reach api.github.com (${err.message || 'network error'}).`, 'err');
    } finally {
      el.refresh.classList.remove('busy'); el.refresh.disabled = false;
    }
  }

  // ---------- theme ----------
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('portfolio-theme', next); } catch (e) {}
    setThemeLabel();
  }
  function setThemeLabel() {
    const current = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    el.themeLabel.textContent = current === 'dark' ? 'Light theme' : 'Dark theme';
  }

  // ---------- helpers ----------
  function detectPortfolioRepo() {
    const attr = document.body.dataset.repo;
    if (/github\.io$/i.test(location.hostname)) {
      const seg = location.pathname.split('/').filter(Boolean)[0];
      if (seg && !/\.html?$/i.test(seg)) return seg;
    }
    return attr || 'portfolio';
  }
  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`; t.textContent = msg;
    el.toasts.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 6000);
  }
  // description, else the README lead paragraph (GitHub descriptions are null for most repos)
  function blurb(p) { const d = (p.description || '').trim(); if (d) return d; const ex = (p.readme_excerpt || '').trim(); if (!ex) return ''; const cut = ex.length > 220 ? ex.slice(0, 220) : ex; const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; ')); return ex.length > 220 ? (end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…') : ex; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function rel(iso) {
    const t = ts(iso); if (!t) return 'unknown';
    const diff = (Date.now() - t) / 1000, abs_ = Math.abs(diff), f = diff >= 0 ? (n, u) => `${n} ${u} ago` : (n, u) => `in ${n} ${u}`;
    const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month']];
    if (abs_ < 45) return 'just now';
    for (let i = 1; i < steps.length; i++) if (abs_ < steps[i][0]) { const n = Math.round(abs_ / steps[i - 1][0]); return f(n, steps[i - 1][1] + (n === 1 ? '' : 's')); }
    const n = Math.round(abs_ / 31557600); return f(n, 'year' + (n === 1 ? '' : 's'));
  }
  function abs(iso) { const t = ts(iso); if (!t) return 'unknown'; return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function shortDate(iso) { const t = ts(iso); if (!t) return '—'; return new Date(t).toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }); }
  function fmtInt(n) { return (n == null) ? '—' : Number(n).toLocaleString(); }
  function fmtSize(kb) { if (kb == null) return '—'; if (kb < 1024) return `${Math.round(kb)} KB`; return `${(kb / 1024).toFixed(1)} MB`; }
  // one link per host, at most 8, so a README with 300 issue links does not become 300 buttons
  function otherLinks(list) { const seen = new Set(), out = []; for (const u of list || []) { const h = hostOf(u); if (seen.has(h)) continue; seen.add(h); out.push(u); if (out.length >= 8) break; } return out; }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function initials(name) {
    const parts = String(name).replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)).toUpperCase();
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h >>> 0); }
  function gradientFor(name) {
    const h = hash(name) % 360, h2 = (h + 40) % 360;
    return [`hsl(${h} 38% 30%)`, `hsl(${h2} 45% 44%)`];
  }
})();
