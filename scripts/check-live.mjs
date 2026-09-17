#!/usr/bin/env node
// Live check for candidate URLs. Zero deps, Node 20+.
// As a module: import { checkLive } from './check-live.mjs'
// As a CLI:    node scripts/check-live.mjs https://imagine-os.github.io/hoy/ [more urls]

const UA = 'imagine-os-portfolio-bot/1.0 (+https://github.com/imagine-os)';

/**
 * GET a URL with a timeout and decide whether it is "live" (2xx after redirects).
 * GitHub Pages returns a 404 HTML page for repos without Pages; that is reported as not live.
 * @returns {Promise<{url:string, live:boolean, status:number|null, final_url:string|null, error:string|null, checked_at:string}>}
 */
export async function checkLive(url, { timeoutMs = 15000 } = {}) {
  const checked_at = new Date().toISOString();
  if (!url) return { url, live: false, status: null, final_url: null, error: 'no url', checked_at };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
    // Drain a little of the body so keep-alive sockets are released, but never read the whole thing.
    try { const reader = res.body?.getReader(); if (reader) { await reader.read(); await reader.cancel(); } } catch {}
    return { url, live: res.status >= 200 && res.status < 300, status: res.status, final_url: res.url || url, error: null, checked_at };
  } catch (err) {
    const msg = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (err?.cause?.code || err?.message || String(err));
    return { url, live: false, status: null, final_url: null, error: msg, checked_at };
  } finally {
    clearTimeout(t);
  }
}

/** Check several URLs with limited concurrency. */
export async function checkMany(urls, { concurrency = 4, timeoutMs } = {}) {
  const out = new Array(urls.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) { const idx = i++; out[idx] = await checkLive(urls[idx], { timeoutMs }); }
  }));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const urls = process.argv.slice(2);
  if (!urls.length) { console.error('usage: node scripts/check-live.mjs <url> [url...]'); process.exit(2); }
  const results = await checkMany(urls);
  for (const r of results) console.log(`${r.live ? 'LIVE ' : 'DOWN '} ${r.status ?? '---'}  ${r.url}${r.error ? '  (' + r.error + ')' : ''}`);
  process.exit(results.every(r => r.live) ? 0 : 1);
}
