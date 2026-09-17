#!/usr/bin/env node
// Screenshots every project's live URL with Playwright Chromium. Node 20+.
// Writes screenshots/<name>.png (1440x900) and screenshots/thumbs/<name>.png (640x400),
// then updates screenshot / screenshot_source / screenshot_note in data/projects.json.
// A project whose URL is not live keeps whatever file it already has. A single failure never aborts the run.
//
// Env: PORTFOLIO_SHOT_CONCURRENCY (default 3), PORTFOLIO_CHROMIUM_PATH (optional executablePath), PORTFOLIO_SHOT_ONLY=name1,name2

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLive } from './check-live.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'projects.json');
const OUT = path.join(ROOT, 'screenshots');
const THUMBS = path.join(OUT, 'thumbs');
const CONCURRENCY = Math.max(1, Number(process.env.PORTFOLIO_SHOT_CONCURRENCY) || 3);
const ONLY = (process.env.PORTFOLIO_SHOT_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  await mkdir(THUMBS, { recursive: true });

  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { console.error('playwright is not installed. Run: npm i && npx playwright install --with-deps chromium'); process.exit(1); }

  const launchOpts = { headless: true };
  if (process.env.PORTFOLIO_CHROMIUM_PATH) launchOpts.executablePath = process.env.PORTFOLIO_CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);

  const targets = data.projects.filter(p => !p.hidden && (!ONLY.length || ONLY.includes(p.name))).map(p => ({ p, url: candidateUrl(p) })).filter(t => t.url);
  console.log(`screenshot: ${targets.length} candidate URLs, concurrency ${CONCURRENCY}`);
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    while (i < targets.length) {
      const t = targets[i++];
      results.push(await shoot(browser, t.p, t.url));
    }
  }));
  await browser.close();

  for (const r of results) {
    const p = data.projects.find(x => x.name === r.name);
    if (!p) continue;
    if (r.ok) { p.screenshot = `screenshots/${p.name}.png`; p.screenshot_source = 'live'; p.screenshot_note = `Captured from ${r.url} at 1440x900 on ${r.at.slice(0, 16).replace('T', ' ')} UTC`; }
    else if (existsSync(path.join(OUT, `${p.name}.png`))) { p.screenshot = `screenshots/${p.name}.png`; if (!p.screenshot_source || p.screenshot_source === 'none') p.screenshot_source = 'live'; p.screenshot_note = `Kept previous screenshot; ${r.reason}`; }
    else { p.screenshot = null; p.screenshot_source = 'none'; p.screenshot_note = r.reason; }
  }
  // Projects with no candidate URL: keep any existing file, otherwise make the note explicit.
  for (const p of data.projects) {
    if (targets.some(t => t.p === p) || p.hidden) continue;
    if (existsSync(path.join(OUT, `${p.name}.png`))) { p.screenshot = `screenshots/${p.name}.png`; if (!p.screenshot_source || p.screenshot_source === 'none') p.screenshot_source = 'local-render'; }
    else { p.screenshot = null; p.screenshot_source = 'none'; p.screenshot_note = p.screenshot_note || 'No live URL; nothing to capture'; }
  }
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
  const ok = results.filter(r => r.ok).length;
  console.log(`done: ${ok} captured, ${results.length - ok} skipped/failed`);
  for (const r of results.filter(r => !r.ok)) console.log(`  - ${r.name}: ${r.reason}`);
}

function candidateUrl(p) {
  if (p.pages?.live === true) return p.links?.live || p.pages?.url || null;
  return p.links?.live || p.links?.demo || null;
}

async function shoot(browser, p, url) {
  const at = new Date().toISOString();
  const live = await checkLive(url, { timeoutMs: 15000 });
  if (!live.live) return { name: p.name, url, ok: false, at, reason: `URL not live (${live.status ?? live.error})` };
  let ctx;
  try {
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 imagine-os-portfolio-bot' });
    const page = await ctx.newPage();
    await gotoSettled(page, url);
    await page.screenshot({ path: path.join(OUT, `${p.name}.png`), type: 'png' });
    // Thumb: 1280x800 viewport at 0.5 device scale -> 640x400 PNG, no image library needed.
    const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5, colorScheme: 'light', reducedMotion: 'reduce' });
    try {
      const tpage = await tctx.newPage();
      await gotoSettled(tpage, url);
      await tpage.screenshot({ path: path.join(THUMBS, `${p.name}.png`), type: 'png' });
    } finally { await tctx.close(); }
    console.log(`  ✓ ${p.name} ← ${url}`);
    return { name: p.name, url, ok: true, at };
  } catch (err) {
    console.log(`  ✗ ${p.name}: ${err.message.split('\n')[0]}`);
    return { name: p.name, url, ok: false, at, reason: `capture failed: ${err.message.split('\n')[0].slice(0, 160)}` };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

async function gotoSettled(page, url) {
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }); }
  catch { await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {}); }
  await page.waitForTimeout(1500);
}

main().catch(err => { console.error(err); process.exit(1); });
