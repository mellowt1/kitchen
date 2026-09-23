// Screenshots of every tab on the phone (390 x 844) and the laptop (1280 x 820), against a
// LOCAL Worker filled by dev-seed.mjs. Saved into verify-shots/ (gitignored).
//   npm run serve   (and wrangler dev with dev values, see README)
//   KITCHEN_DEV_CODE=... ADMIN_DEV_TOKEN=... npm run shots
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed, CODE } from './dev-seed.mjs';

const APP = process.env.APP || 'http://localhost:8080/kitchen/';
const out = new URL('../verify-shots/', import.meta.url);
mkdirSync(out, { recursive: true });
const file = (n) => fileURLToPath(new URL(n + '.png', out));

await seed();
const browser = await chromium.launch();
const errors = [];

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP + '?c=' + CODE);
  await page.waitForSelector('.day .day-title:not(.empty)');
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
const shot = async (page, name, full = true) => {
  await page.waitForTimeout(350); // let the sheet's rise animation finish
  // A full page shot would paint the fixed tab bar in the middle; park it at the end instead.
  const long = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 4);
  const undo = full && long ? await page.addStyleTag({ content: '.tabs{position:static !important}' }) : null;
  await page.screenshot({ path: file(name), fullPage: full });
  if (undo) await undo.evaluate((el) => el.remove());
};

// Phone
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  await shot(page, 'phone-week', false);
  await page.click('.day[data-day$=":thu"]');
  await page.waitForSelector('#sheet:not([hidden])');
  await shot(page, 'phone-day-sheet', false);
  await page.click('[data-close].round');

  await page.click('.tab[data-tab="recipes"]');
  await shot(page, 'phone-recipes');
  await page.click('#vegOnly');
  await shot(page, 'phone-recipes-veg-only');
  await page.click('#vegOnly');
  await page.click('[data-recipe="devcurry0001"]');
  await shot(page, 'phone-recipe');
  await page.click('[data-rsrv="1"]');
  await page.click('[data-rsrv="1"]');
  await shot(page, 'phone-recipe-6-servings');
  await page.click('[data-del]');
  await shot(page, 'phone-recipe-delete-confirm');
  await page.click('[data-delno]');
  await page.click('[data-planit]');
  await shot(page, 'phone-plan-it', false);
  await page.click('[data-close].round');
  await page.click('[data-edit]');
  await shot(page, 'phone-recipe-edit');
  await page.click('#cancelForm');
  await page.click('[data-back]');
  await page.click('#newRecipe');
  await page.fill('.ing:nth-child(1) .i-item', 'Frozen peas');
  await page.fill('.ing:nth-child(1) .i-qty', '1/2');
  await page.fill('.ing:nth-child(1) .i-unit', 'bag');
  await shot(page, 'phone-recipe-new');
  await page.click('#cancelForm');

  await page.click('.tab[data-tab="shop"]');
  await shot(page, 'phone-shopping');
  await page.click('.tab[data-tab="dough"]');
  await shot(page, 'phone-dough');
  await page.click('[data-tweak="water"]');
  await shot(page, 'phone-dough-tweak');
  await page.click('[data-tweak="water"]');
  await ctx.close();
}

// Laptop
{
  const { ctx, page } = await open({ width: 1280, height: 820 });
  await page.click('.pill-tab[data-tab="week"]');
  await shot(page, 'laptop-week-and-shopping', false);
  await page.click('.pill-tab[data-tab="recipes"]');
  await page.click('[data-recipe="devnorma0001"]');
  await shot(page, 'laptop-recipe', false);
  await page.click('[data-back]');
  await shot(page, 'laptop-recipes', false);
  await page.click('.pill-tab[data-tab="dough"]');
  await shot(page, 'laptop-dough', false);
  await page.click('.pill-tab[data-tab="week"]');
  await page.click('.day[data-day$=":sun"]');
  await shot(page, 'laptop-day-sheet', false);
  await ctx.close();
}

// Without a code
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(APP);
  await page.waitForSelector('#nocode:not([hidden])');
  await shot(page, 'phone-no-code', false);
  await ctx.close();
}

await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
console.log('screenshots in verify-shots/');
