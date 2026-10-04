/**
 * Renders every store image: app icons (and the Capacitor icon/splash
 * sources), captioned screenshots for the App Store and Google Play, and the
 * Play feature graphic.
 *
 *   npx vite --port 5173          # in another terminal: the game, for captures
 *   node store/src/render.mjs     # [--skip-captures] to reuse store/src/captures
 *
 * Needs Playwright with Chromium (the global install works) and `sharp`
 * (already installed with @capacitor/assets).
 */
import { mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE = resolve(HERE, '..');
const ROOT = resolve(STORE, '..');
const CAP = join(HERE, 'captures');
const BASE = process.env.GAME_URL ?? 'http://localhost:5173';
const skipCaptures = process.argv.includes('--skip-captures');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall back to the global install */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const out = (...p) => { const f = join(STORE, ...p); mkdirSync(dirname(f), { recursive: true }); return f; };
/** Store rules: no transparency on icons and screenshots. */
const flatten = (input, file, bg = '#1d1030') => sharp(input).flatten({ background: bg }).removeAlpha().png().toFile(file);

// ------------------------------------------------------------------ icons
async function icons() {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const shot = async (layer) => {
    await page.goto(pathToFileURL(join(HERE, 'icon.html')).href + (layer ? `?layer=${layer}` : ''));
    return page.screenshot({ omitBackground: !!layer });
  };
  const full = await shot('');
  const fg = await shot('fg');
  const bg = await shot('bg');
  await flatten(full, out('icon-1024.png'));
  await sharp(full).resize(512, 512).removeAlpha().png().toFile(out('play-icon-512.png'));
  mkdirSync(CAP, { recursive: true });
  await sharp(fg).png().toFile(join(CAP, 'icon-fg.png'));
  // Sources for `npx @capacitor/assets generate` (iOS AppIcon, Android adaptive icons, splash screens).
  const res = (f) => join(ROOT, 'resources', f);
  await flatten(full, res('icon-only.png'));
  await sharp(fg).png().toFile(res('icon-foreground.png'));
  await flatten(bg, res('icon-background.png'));
  for (const name of ['splash.png', 'splash-dark.png']) {
    const art = await sharp(full).resize(1100, 1100).png().toBuffer();
    const mask = Buffer.from('<svg width="1100" height="1100"><rect width="1100" height="1100" rx="240" fill="#fff"/></svg>');
    const rounded = await sharp(art).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    await sharp({ create: { width: 2732, height: 2732, channels: 3, background: '#1d1030' } })
      .composite([{ input: rounded, gravity: 'centre' }]).png().toFile(res(name));
  }
  await page.close();
}

// --------------------------------------------------------------- captures
const SHOTS = [
  { id: '01-title', headline: 'Build a <em>monster</em>, one claw at a time', bg: 'linear-gradient(170deg, #5a3a8a, #2c1a47)', accent: '#ffcf4a' },
  { id: '02-claw', headline: 'Steer the claw. Grab it <em>dead&nbsp;centre</em>', bg: 'linear-gradient(170deg, #ff9a52, #c2531c)', accent: '#ffe27a' },
  { id: '03-bells', headline: 'Every hatch has a <em>lock</em>', bg: 'linear-gradient(170deg, #4fb59a, #23614f)', accent: '#ffcf4a' },
  { id: '04-cauldron', headline: 'Brew the right <em>potion</em>', bg: 'linear-gradient(170deg, #7fd36f, #2f7a3a)', accent: '#ffe27a' },
  { id: '05-frankenstein', headline: 'Sneak the key past <em>Frankenstein</em>', bg: 'linear-gradient(170deg, #7ab8ff, #2f5aa8)', accent: '#ffcf4a' },
  { id: '06-piece', headline: 'Win a <em>body part</em> on every island', bg: 'linear-gradient(170deg, #ff7fb0, #b23a6e)', accent: '#ffe27a' },
  { id: '07-monster', headline: 'It’s alive! <em>Name it</em>, share it', bg: 'linear-gradient(170deg, #ffcf4a, #d98a1c)', accent: '#b48cff' },
  { id: '08-classic', headline: 'Plus the 10 <em>Classic</em> islands', bg: 'linear-gradient(170deg, #8fd8ff, #3f9fd6)', accent: '#ffcf4a' },
];

const DEVICES = {
  phone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2 },
};

async function capture(kind) {
  const dir = join(CAP, kind);
  mkdirSync(dir, { recursive: true });
  const open = async (campaign) => {
    const ctx = await browser.newContext({ ...DEVICES[kind], hasTouch: true, isMobile: kind === 'phone' });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      localStorage.setItem('clawisland.halloween.progress', '9');
      localStorage.setItem('clawisland.progress', '9');
      localStorage.setItem('clawisland.debug', '0');
    });
    await p.goto(`${BASE}/?campaign=${campaign}`);
    await p.waitForFunction(() => window.__game);
    return p;
  };
  const waitT = (p, dt) => p.evaluate(async (d) => {
    const t0 = window.__game.time;
    while (window.__game.time < t0 + d) await new Promise((r) => setTimeout(r, 100));
  }, dt);
  const clean = (p) => p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const play = async (p, lvl) => {
    await p.evaluate(() => { const g = window.__game; g.reset(undefined, 'card'); g.startRun(); });
    await p.waitForFunction(() => window.__game.phase === 'PHASE_WEIGHT', null, { timeout: 120000 });
    if (lvl) {
      await p.evaluate((l) => window.__game.jumpTo(l), lvl);
      await p.waitForFunction(() => window.__game.phase === 'PHASE_WEIGHT', null, { timeout: 120000 });
    }
    await waitT(p, 1.5);
    await clean(p);
  };
  const snap = async (p, id) => { await clean(p); await p.screenshot({ path: join(dir, `${id}.png`) }); };

  let p = await open('halloween');
  await p.waitForSelector('.title-screen');
  await p.waitForTimeout(2000);
  await snap(p, '01-title');
  await play(p, 0); await snap(p, '02-claw');
  await play(p, 1); await snap(p, '03-bells');
  await play(p, 4); await snap(p, '04-cauldron');
  await play(p, 3); await snap(p, '05-frankenstein');
  await play(p, 2);
  await p.evaluate(() => window.__game.debugComplete());
  await p.waitForFunction(() => window.__game.phase === 'RESULTS', null, { timeout: 120000 });
  await p.waitForTimeout(2500);
  await snap(p, '06-piece');
  await play(p, 9);
  await p.evaluate(() => window.__game.debugComplete());
  await p.waitForFunction(() => window.__game.phase === 'RESULTS', null, { timeout: 120000 });
  await p.waitForTimeout(800);
  await p.evaluate(() => window.__game.continueFromResults());
  await p.waitForSelector('.monster-final');
  await p.waitForTimeout(2500);
  await p.locator('.name-input').fill('Grumbleboo');
  await p.waitForTimeout(500);
  await snap(p, '07-monster');
  await p.context().close();

  p = await open('classic');
  await play(p, 0); await snap(p, '08-classic');
  await p.context().close();
}

/** The island scene behind the feature graphic: the title screen with the logo taken away. */
async function captureFeatureScene() {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?campaign=halloween`);
  await p.waitForSelector('.title-screen');
  await p.waitForTimeout(2500);
  await p.evaluate(() => { document.querySelector('.title-screen').style.visibility = 'hidden'; document.getElementById('overlay').style.background = 'none'; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAP, 'feature-scene.png') });
  await ctx.close();
}

// ----------------------------------------------------------------- frames
const TARGETS = [
  { dir: 'appstore/iphone-6.9', W: 1290, H: 2796, from: 'phone' },
  { dir: 'appstore/ipad-13', W: 2064, H: 2752, from: 'ipad' },
  { dir: 'play/phone', W: 1080, H: 1920, from: 'phone' },
  { dir: 'play/tablet', W: 1600, H: 2560, from: 'ipad' },
];

async function frames() {
  const page = await browser.newPage();
  for (const t of TARGETS) {
    const { width, height } = DEVICES[t.from].viewport;
    await page.setViewportSize({ width: t.W, height: t.H });
    for (const s of SHOTS) {
      await page.goto(pathToFileURL(join(HERE, 'frame.html')).href);
      await page.evaluate((o) => window.layout(o), {
        W: t.W, H: t.H, headline: s.headline, bg: s.bg, accent: s.accent,
        shot: pathToFileURL(join(CAP, t.from, `${s.id}.png`)).href, aspect: width / height,
      });
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: t.W, height: t.H } });
      await flatten(buf, out(t.dir, `${s.id}.png`));
    }
  }
  await page.close();
}

async function feature() {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.goto(pathToFileURL(join(HERE, 'feature.html')).href);
  await page.evaluate((o) => window.layout(o), {
    scene: pathToFileURL(join(CAP, 'feature-scene.png')).href,
    art: pathToFileURL(join(CAP, 'icon-fg.png')).href,
  });
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 500 } });
  await flatten(buf, out('play', 'feature-graphic.png'));
  await page.close();
}

await icons();
if (!skipCaptures || !existsSync(join(CAP, 'phone'))) {
  await capture('phone');
  await capture('ipad');
  await captureFeatureScene();
}
await frames();
await feature();
await browser.close();
console.log('Store images written to', STORE);
