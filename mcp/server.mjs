#!/usr/bin/env node
/* Kitchen tools for Claude Desktop (a local MCP server over stdio).
 *
 * Claude Desktop starts this on Paul's PC. It talks to the paul-hub Worker with the
 * kitchen code, exactly like the Kitchen app on the phones, so it can only touch the
 * kitchen: recipes, the week and the shopping list. Never the to-do or anything else.
 *
 * The code is read from a local, gitignored secrets file (KITCHEN_SECRETS, a
 * KEY=value file with a KITCHEN_CODE line). It is never logged and never returned.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = (process.env.KITCHEN_API || 'https://paul-hub.paul-o-a04.workers.dev').replace(/\/$/, '');
const AISLES = ['produce', 'bread', 'dairy', 'meat', 'vegetarian', 'pasta', 'tins', 'baking', 'spices', 'frozen', 'drinks', 'household', 'other'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_MS = 24 * 3600 * 1000;

function kitchenCode() {
  const file = process.env.KITCHEN_SECRETS;
  if (!file) throw new Error('KITCHEN_SECRETS is not set in the Claude Desktop config.');
  const m = readFileSync(file, 'utf8').match(/^KITCHEN_CODE=(.+)$/m);
  const code = m && m[1].trim();
  if (!code || !/^[a-z0-9]{16,64}$/.test(code)) throw new Error('No valid KITCHEN_CODE in the secrets file.');
  return code;
}

/* ---------- Worker ---------- */

async function call(path, body) {
  const url = `${API}/api/kitchen/${kitchenCode()}${path}`;
  const init = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Kitchen answered ${r.status}${data.error ? ': ' + data.error : ''}`);
  return data;
}

async function records() {
  const { items = [] } = await call('');
  return items.filter((i) => !i.deletedAt);
}

async function send(ops) {
  const out = await call('/ops', { ops });
  if (out.rejected && out.rejected.length) throw new Error(`Kitchen refused ${out.rejected.length} of ${ops.length} changes. Check the fields against the tool description.`);
  return out;
}

const newId = () => {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (const b of randomBytes(24)) { if (b < 252) s += a[b % 36]; if (s.length === 12) break; }
  return s;
};

/* ---------- Dates: Europe/Amsterdam, ISO weeks with Monday first ---------- */

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function isoWeek(date) {
  const d = new Date(date + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  const thu = new Date(d.getTime() + (3 - wd) * DAY_MS);
  const year = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mon1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
  const n = 1 + Math.round((d.getTime() - wd * DAY_MS - mon1) / (7 * DAY_MS));
  return { week: `${year}-W${String(n).padStart(2, '0')}`, day: WEEKDAYS[wd], wd };
}
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD. Leave out for today (Amsterdam time).');

/* ---------- Tools ---------- */

const ok = (text) => ({ content: [{ type: 'text', text }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] });
const safe = (fn) => async (args) => { try { return await fn(args); } catch (e) { return fail(e); } };

const server = new McpServer({ name: 'kitchen', version: '1.0.0' });

server.registerTool('list_recipes', {
  title: 'List recipes',
  description: "List the recipes in Paul's shared Kitchen app (with his girlfriend, who is vegetarian): id, title, servings, time and whether it is vegetarian.",
  inputSchema: {},
}, safe(async () => {
  const list = (await records()).filter((r) => r.type === 'recipe').sort((a, b) => a.title.localeCompare(b.title));
  if (!list.length) return ok('No recipes yet.');
  return ok(list.map((r) => `${r.id}  ${r.title} (${r.servings} servings${r.time ? ', ' + r.time : ''}${r.veg ? ', vegetarian' : ''})`).join('\n'));
}));

server.registerTool('get_recipe', {
  title: 'Get a recipe',
  description: 'Get one recipe in full, as JSON, by its id (from list_recipes).',
  inputSchema: { id: z.string() },
}, safe(async ({ id }) => {
  const r = (await records()).find((x) => x.type === 'recipe' && x.id === id);
  if (!r) return fail(new Error('No recipe with that id.'));
  const { type, updatedAt, ...rest } = r;
  return ok(JSON.stringify(rest, null, 2));
}));

server.registerTool('save_recipe', {
  title: 'Save a recipe',
  description: [
    "Add a new recipe to Paul's Kitchen app, or replace one (give its id). It shows on both phones within about 10 seconds.",
    'Write it cleaned up: English, metric units (g, ml, tbsp, tsp, pieces), short plain steps, one action each.',
    'Keep what the source gives; do not invent. Where the source gives no amount, pick a sensible one and say so in notes.',
    'veg must be true only if the whole recipe is vegetarian (no meat or fish; his girlfriend is vegetarian). If meat is optional, keep it out of the ingredients, set veg true and mention the meat option in notes.',
    'aisle is where the item is in a supermarket: ' + AISLES.join(', ') + '.',
    'Never use em dashes or en dashes; use commas, colons or "to".',
  ].join(' '),
  inputSchema: {
    id: z.string().regex(/^[a-z0-9]{8,32}$/).optional().describe('Only to replace an existing recipe.'),
    title: z.string().min(1).max(200),
    servings: z.number().int().min(1).max(50),
    time: z.string().max(40).optional().describe('Like "35 min".'),
    veg: z.boolean(),
    ingredients: z.array(z.object({
      qty: z.number().positive().max(100000).nullable().describe('A number, or null for "to taste".'),
      unit: z.string().max(20).optional(),
      item: z.string().min(1).max(120),
      aisle: z.enum(AISLES),
    })).max(80),
    steps: z.array(z.string().min(1).max(1000)).max(40),
    notes: z.string().max(4000).optional(),
  },
}, safe(async (a) => {
  const all = await records();
  const stored = a.id ? all.find((x) => x.type === 'recipe' && x.id === a.id) : null;
  if (a.id && !stored) return fail(new Error('No recipe with that id to replace. Leave id out to add a new one.'));
  const id = a.id || newId();
  const updatedAt = Math.max(Date.now(), stored ? stored.updatedAt + 1 : 0);
  const item = { id, title: a.title, servings: a.servings, time: a.time || '', veg: a.veg,
    ingredients: a.ingredients.map((g) => ({ qty: g.qty, unit: g.unit || '', item: g.item, aisle: g.aisle })),
    steps: a.steps, notes: a.notes || '', updatedAt };
  await send([{ op: 'upsert', type: 'recipe', item }]);
  return ok(`${stored ? 'Replaced' : 'Saved'} "${a.title}" (id ${id}).`);
}));

server.registerTool('delete_recipe', {
  title: 'Delete a recipe',
  description: 'Delete a recipe by id. Only when Paul clearly asks for it.',
  inputSchema: { id: z.string().regex(/^[a-z0-9]{8,32}$/) },
}, safe(async ({ id }) => {
  const r = (await records()).find((x) => x.type === 'recipe' && x.id === id);
  if (!r) return fail(new Error('No recipe with that id.'));
  await send([{ op: 'delete', type: 'recipe', item: { id, updatedAt: Math.max(Date.now(), r.updatedAt + 1) } }]);
  return ok(`Deleted "${r.title}".`);
}));

server.registerTool('get_week', {
  title: 'Get the week',
  description: "Show the dinners planned for a week (Monday to Sunday) and that week's extra shopping items.",
  inputSchema: { date: dateArg },
}, safe(async ({ date }) => {
  const d = date || today();
  const { week, wd } = isoWeek(d);
  const monday = addDays(d, -wd);
  const all = await records();
  const recipes = Object.fromEntries(all.filter((x) => x.type === 'recipe').map((r) => [r.id, r]));
  const lines = WEEKDAYS.map((k, i) => {
    const day = all.find((x) => x.type === 'day' && x.id === `${week}:${k}`);
    const when = `${k[0].toUpperCase() + k.slice(1)} ${addDays(monday, i)}`;
    if (!day) return `${when}: nothing planned`;
    const what = day.kind === 'recipe' ? (recipes[day.recipeId]?.title || 'a deleted recipe') : day.kind === 'pizza' ? (day.text || 'Pizza night') : day.text;
    return `${when}: ${what}${day.servings ? ` (${day.servings})` : ''}`;
  });
  const extras = all.filter((x) => x.type === 'extra' && x.week === week);
  return ok(`${week}\n${lines.join('\n')}\n\nExtra shopping items: ${extras.length ? extras.map((e) => e.text + (e.qty ? ` (${e.qty})` : '')).join(', ') : 'none'}`);
}));

server.registerTool('plan_day', {
  title: 'Plan a dinner',
  description: 'Put a dinner on a day: a saved recipe (kind recipe with recipeId), free text (kind text, like "Leftovers" or "Out"), or a pizza night (kind pizza). Replaces what was planned that day.',
  inputSchema: {
    date: dateArg,
    kind: z.enum(['recipe', 'text', 'pizza']),
    recipeId: z.string().regex(/^[a-z0-9]{8,32}$/).optional(),
    text: z.string().max(200).optional(),
    servings: z.number().int().min(1).max(50).optional().describe('People, or pizzas for a pizza night.'),
  },
}, safe(async (a) => {
  const d = a.date || today();
  const { week, day } = isoWeek(d);
  const all = await records();
  if (a.kind === 'recipe' && !all.some((x) => x.type === 'recipe' && x.id === a.recipeId)) return fail(new Error('recipeId must be a saved recipe (see list_recipes).'));
  if (a.kind === 'text' && !(a.text || '').trim()) return fail(new Error('text is needed for kind text.'));
  const id = `${week}:${day}`;
  const stored = all.find((x) => x.type === 'day' && x.id === id);
  const item = { id, kind: a.kind, recipeId: a.kind === 'recipe' ? a.recipeId : null,
    text: a.kind === 'recipe' ? '' : (a.text || (a.kind === 'pizza' ? 'Pizza night' : '')),
    servings: a.servings ?? null, updatedAt: Math.max(Date.now(), stored ? stored.updatedAt + 1 : 0) };
  await send([{ op: 'upsert', type: 'day', item }]);
  return ok(`Planned ${d}.`);
}));

server.registerTool('clear_day', {
  title: 'Clear a day',
  description: 'Remove the dinner planned on a day.',
  inputSchema: { date: dateArg },
}, safe(async ({ date }) => {
  const d = date || today();
  const { week, day } = isoWeek(d);
  const id = `${week}:${day}`;
  const stored = (await records()).find((x) => x.type === 'day' && x.id === id);
  if (!stored) return ok(`Nothing was planned on ${d}.`);
  await send([{ op: 'delete', type: 'day', item: { id, updatedAt: Math.max(Date.now(), stored.updatedAt + 1) } }]);
  return ok(`Cleared ${d}.`);
}));

server.registerTool('add_shopping_item', {
  title: 'Add to the shopping list',
  description: "Add a free item to a week's shopping list (items from planned recipes are added automatically; do not add those). aisle is one of: " + AISLES.join(', ') + '.',
  inputSchema: {
    text: z.string().min(1).max(200),
    qty: z.string().max(40).optional().describe('Like "2" or "500 g".'),
    aisle: z.enum(AISLES),
    date: dateArg.describe('Any day in the week the list is for. Leave out for this week.'),
  },
}, safe(async (a) => {
  const { week } = isoWeek(a.date || today());
  await send([{ op: 'upsert', type: 'extra', item: { id: newId(), week, text: a.text, qty: a.qty || '', aisle: a.aisle, updatedAt: Date.now() } }]);
  return ok(`Added "${a.text}" to the ${week} list.`);
}));

await server.connect(new StdioServerTransport());
