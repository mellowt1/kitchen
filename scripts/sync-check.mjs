// Two phones on one kitchen, against a LOCAL Worker (wrangler dev with dev values):
//   1. a day planned on phone A shows on phone B within 15 seconds
//   2. A ticks offline while B ticks another line; A reconnects; both agree
//   3. A edits a day offline while B edits another day; nothing is lost
//   4. with the service worker, a first visit then a reload offline still opens, fonts included
//   KITCHEN_DEV_CODE=... ADMIN_DEV_TOKEN=... npm run sync-check
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed, CODE } from './dev-seed.mjs';

const APP = process.env.APP || 'http://localhost:8080/kitchen/';
const out = new URL('../verify-shots/', import.meta.url);
mkdirSync(out, { recursive: true });
const file = (n) => fileURLToPath(new URL(n + '.png', out));

const { week } = await seed();
const browser = await chromium.launch();
const errors = [];
async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP + '?c=' + CODE);
  await page.waitForSelector('.day .day-title:not(.empty)');
  return { ctx, page };
}
const A = await phone();
const B = await phone();
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' (' + detail + ')' : '')); };

const dayText = (p, d) => p.textContent(`.day[data-day="${week}:${d}"] .day-title`);
async function until(fn, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 250));
  }
  return -1;
}
async function write(p, d, text) {
  await p.click(`.day[data-day="${week}:${d}"]`);
  await p.fill('#writeInput', text);
  await p.click('#writeForm button[type="submit"]');
}
const ticks = (p) => p.$$eval('.stick', (els) => Object.fromEntries(els.map((e) => [e.dataset.tick, e.getAttribute('aria-checked') === 'true'])));

// 1. Plan a day on A, see it on B.
const soup = 'Tomato soup ' + Date.now() % 1000;
await write(A.page, 'thu', soup);
const took = await until(async () => (await dayText(B.page, 'thu')) === soup);
check('day planned on A shows on B within 15 s', took >= 0, took >= 0 ? `${(took / 1000).toFixed(1)} s` : 'not seen');
await B.page.screenshot({ path: file('sync-b-sees-a') });

// 2. Tick offline on A, tick another line on B, reconnect, both agree.
await A.page.click('.tab[data-tab="shop"]');
await B.page.click('.tab[data-tab="shop"]');
await A.ctx.setOffline(true);
await A.page.click('[data-tick="i:spinach"]');
await A.page.waitForTimeout(1500);
const pill = await A.page.textContent('#syncPill');
check('A shows it is offline with a change waiting', /Offline, 1 change waiting/.test(pill), pill);
await A.page.screenshot({ path: file('sync-a-offline') });
await B.page.click('[data-tick="i:onion"]');
await B.page.waitForTimeout(1500);
await A.ctx.setOffline(false);
const agreed = await until(async () => {
  const a = await ticks(A.page);
  const b = await ticks(B.page);
  return a['i:spinach'] && a['i:onion'] && b['i:spinach'] && b['i:onion'] && JSON.stringify(a) === JSON.stringify(b);
});
check('after reconnecting, both phones show both ticks', agreed >= 0, agreed >= 0 ? `${(agreed / 1000).toFixed(1)} s` : JSON.stringify([await ticks(A.page), await ticks(B.page)]));
await A.page.screenshot({ path: file('sync-a-after'), fullPage: true });
await B.page.screenshot({ path: file('sync-b-after'), fullPage: true });

// 3. A edits Friday offline, B edits Sunday online; nothing is lost.
await A.page.click('.tab[data-tab="week"]');
await B.page.click('.tab[data-tab="week"]');
await A.ctx.setOffline(true);
await write(A.page, 'fri', 'Takeaway');
await write(B.page, 'sun', 'Roast vegetables');
await B.page.waitForTimeout(2000);
await A.ctx.setOffline(false);
const both = await until(async () => {
  const x = [await dayText(A.page, 'fri'), await dayText(A.page, 'sun'), await dayText(B.page, 'fri'), await dayText(B.page, 'sun')];
  return x.join('|') === 'Takeaway|Roast vegetables|Takeaway|Roast vegetables';
});
check('edits on different days from both phones both survive', both >= 0, both >= 0 ? `${(both / 1000).toFixed(1)} s` : 'lost one');
await A.page.screenshot({ path: file('sync-a-week') });

// 4. Offline shell and fonts from the first visit (service worker on with &sw=1 on localhost).
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(APP + '?c=' + CODE + '&sw=1');
  await page.waitForSelector('.day .day-title:not(.empty)');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(3000); // the worker caches the Google Fonts the page loaded
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.day .day-title:not(.empty)');
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [document.fonts.check('36px "Young Serif"'), document.fonts.check('16px Figtree')]);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(','));
  check('offline reload opens with both typefaces', fonts.every(Boolean) && /Young Serif/.test(loaded) && /Figtree/.test(loaded), loaded);
  await page.screenshot({ path: file('offline-reload') });
  await ctx.close();
}

await browser.close();
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);
