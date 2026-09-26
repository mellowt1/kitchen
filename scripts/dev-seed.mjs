// Fills a LOCAL paul-hub Worker (wrangler dev) with made up recipes and a week like the
// design's, for screenshots and the sync check. Never point this at the real Worker.
//   KITCHEN_DEV_CODE=<dev kitchen code> ADMIN_DEV_TOKEN=<dev admin token> node scripts/dev-seed.mjs
export const WORKER = process.env.WORKER || 'http://localhost:8787';
export const CODE = process.env.KITCHEN_DEV_CODE || '';
const ADMIN = process.env.ADMIN_DEV_TOKEN || '';

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(WORKER)) throw new Error('dev-seed only talks to a local Worker');
if (!/^[a-z0-9]{16}$/.test(CODE) || !ADMIN) throw new Error('set KITCHEN_DEV_CODE and ADMIN_DEV_TOKEN (dev values only)');

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function isoWeek(date) {
  const d = new Date(date + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  const thu = new Date(d.getTime() + (3 - wd) * 864e5);
  const year = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mon1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5;
  const n = 1 + Math.round((d.getTime() - wd * 864e5 - mon1) / (7 * 864e5));
  return { week: `${year}-W${pad(n)}`, wd };
}

const RECIPES = [
  {
    id: 'devcurry0001', title: 'Chickpea and spinach curry', servings: 4, time: '35 min', veg: true,
    ingredients: [
      { qty: 2, unit: 'tins', item: 'chickpeas, drained', aisle: 'tins' },
      { qty: 400, unit: 'ml', item: 'coconut milk', aisle: 'tins' },
      { qty: 200, unit: 'g', item: 'spinach', aisle: 'produce' },
      { qty: 1, unit: '', item: 'onion, chopped', aisle: 'produce' },
      { qty: 3, unit: 'cloves', item: 'garlic', aisle: 'produce' },
      { qty: 1, unit: 'thumb', item: 'ginger, grated', aisle: 'produce' },
      { qty: 2, unit: 'tbsp', item: 'curry paste', aisle: 'tins' },
      { qty: 300, unit: 'g', item: 'basmati rice', aisle: 'pasta' },
    ],
    steps: ['Soften the onion in a little oil, 5 minutes.', 'Add garlic, ginger and curry paste, stir 1 minute.', 'Add chickpeas and coconut milk, simmer 15 minutes.', 'Stir in the spinach until it wilts.', 'Serve with rice.'],
    notes: '',
  },
  {
    id: 'devnorma0001', title: 'Pasta alla Norma', servings: 2, time: '40 min', veg: true,
    ingredients: [
      { qty: 2, unit: '', item: 'aubergines', aisle: 'produce' },
      { qty: 250, unit: 'g', item: 'rigatoni', aisle: 'pasta' },
      { qty: 350, unit: 'g', item: 'passata', aisle: 'tins' },
      { qty: 50, unit: 'g', item: 'ricotta salata', aisle: 'dairy' },
      { qty: 2, unit: 'cloves', item: 'garlic', aisle: 'produce' },
      { qty: null, unit: '', item: 'basil', aisle: 'produce' },
    ],
    steps: ['Fry the aubergine cubes in olive oil until golden.', 'Add garlic, then passata, simmer 15 minutes.', 'Toss with the rigatoni, top with ricotta salata and basil.'],
    notes: 'Salt the aubergine first if it is bitter.',
  },
  {
    id: 'devtray00001', title: 'Lemon chicken traybake', servings: 4, time: '50 min', veg: false,
    ingredients: [
      { qty: 8, unit: '', item: 'chicken thighs', aisle: 'meat' },
      { qty: 800, unit: 'g', item: 'potatoes', aisle: 'produce' },
      { qty: 2, unit: '', item: 'lemons', aisle: 'produce' },
      { qty: 3, unit: 'tbsp', item: 'olive oil', aisle: 'spices' },
    ],
    steps: ['Heat the oven to 200 °C.', 'Toss everything on a tray with salt.', 'Roast 45 minutes, turning once.'],
    notes: '',
  },
  {
    id: 'devshak00001', title: 'Shakshuka', servings: 2, time: '25 min', veg: true,
    ingredients: [
      { qty: 4, unit: '', item: 'eggs', aisle: 'dairy' },
      { qty: 1, unit: 'tin', item: 'chopped tomatoes', aisle: 'tins' },
      { qty: 1, unit: '', item: 'red pepper', aisle: 'produce' },
      { qty: 1, unit: 'tsp', item: 'cumin', aisle: 'spices' },
    ],
    steps: ['Soften the pepper.', 'Add tomatoes and cumin, simmer 10 minutes.', 'Crack in the eggs, cover until set.'],
    notes: '',
  },
];

export async function seed() {
  let r = await fetch(WORKER + '/api/admin/kitchen/recipes', {
    method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipes: RECIPES }),
  });
  if (!r.ok) throw new Error('admin route: ' + r.status + ' ' + (await r.text()));

  const today = localDate();
  const { week, wd } = isoWeek(today);
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const sat = new Date(Date.parse(today + 'T00:00:00Z') + (5 - wd) * 864e5).toISOString().slice(0, 10);
  const now = Date.now();
  const up = (type, item) => ({ op: 'upsert', type, item: { ...item, updatedAt: now } });
  const del = (type, id) => ({ op: 'delete', type, item: { id, updatedAt: now } });
  const ops = [
    // Monday is an old shared dinner, so the page's split is seen working.
    up('day', { id: `${week}:mon`, kind: 'recipe', recipeId: 'devnorma0001', servings: 2 }),
    ...['paul', 'olivia'].flatMap((p) => ['breakfast', 'lunch', 'dinner'].flatMap((m) => ['mon', 'thu', 'sun'].map((d) => del('day', `${week}:${d}:${p}:${m}`)))),
    ...['tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => del('day', `${week}:${d}`)),
    up('day', { id: `${week}:tue:paul:dinner`, kind: 'recipe', recipeId: 'devcurry0001', servings: 4 }),
    up('day', { id: `${week}:tue:olivia:dinner`, kind: 'recipe', recipeId: 'devcurry0001', servings: 4 }),
    up('day', { id: `${week}:wed:paul:breakfast`, kind: 'text', text: 'Overnight oats' }),
    up('day', { id: `${week}:wed:paul:lunch`, kind: 'text', text: 'Leftover curry' }),
    up('day', { id: `${week}:wed:paul:dinner`, kind: 'text', text: 'Leftover curry', servings: 2 }),
    up('day', { id: `${week}:wed:olivia:lunch`, kind: 'text', text: 'Salad at work' }),
    up('day', { id: `${week}:wed:olivia:dinner`, kind: 'text', text: 'Dinner with Anna' }),
    up('day', { id: `${week}:fri:paul:dinner`, kind: 'text', text: 'Dinner at friends' }),
    up('day', { id: `${week}:fri:olivia:dinner`, kind: 'text', text: 'Dinner at friends' }),
    up('day', { id: `${week}:sat:paul:dinner`, kind: 'pizza', servings: 4 }),
    up('day', { id: `${week}:sat:olivia:dinner`, kind: 'pizza', servings: 4 }),
    up('dough', { id: 'dough', size: 14, count: 4, thickness: 'regular', gf: false, night: sat, tweaks: {} }),
    up('extra', { id: 'devflour0001', week, text: 'Bread flour', qty: '870 g', aisle: 'baking' }),
    up('extra', { id: 'devyeast0001', week, text: 'Active dry yeast', qty: '3.5 g', aisle: 'baking' }),
    up('extra', { id: 'devmozza0001', week, text: 'Mozzarella', qty: '4 balls', aisle: 'dairy' }),
    up('tick', { id: `${week}|i:ginger`, on: true }),
    up('tick', { id: `${week}|i:passata`, on: true }),
    up('tick', { id: `${week}|i:spinach`, on: false }),
    up('tick', { id: `${week}|i:onion`, on: false }),
  ];
  r = await fetch(`${WORKER}/api/kitchen/${CODE}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }) });
  const b = await r.json();
  if (!r.ok || b.rejected.length) throw new Error('ops: ' + r.status + ' ' + JSON.stringify(b.rejected || b));
  return { week, today, days };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  seed().then((x) => console.log('seeded', x.week)).catch((e) => { console.error(e.message); process.exit(1); });
}
