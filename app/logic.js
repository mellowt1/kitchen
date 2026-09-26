/* Kitchen logic: pure functions, no DOM. Used by app.js in the browser and by the tests
 * in Node (test/logic.test.mjs), so the maths is checked without a browser.
 *
 *   dough      the New York dough calculator (Dough Guy thickness factors, Paul's base)
 *   pizza      when to mix for a pizza night
 *   weeks      ISO weeks, Monday first, like the Worker
 *   amounts    parse, scale and print ingredient amounts
 *   shopping   the week's list: planned recipes scaled by servings, combined per item, plus extras
 *   aisles     the shop's order and a guess from the item's name
 */
(function (root) {
  'use strict';

  /* ---------- Aisles, in the shop's order (worker/src/kitchen.js has the same keys) ---------- */
  const AISLES = [
    ['produce', 'Vegetables and fruit'],
    ['bread', 'Bread'],
    ['dairy', 'Dairy and eggs'],
    ['meat', 'Meat and fish'],
    ['vegetarian', 'Vegetarian'],
    ['pasta', 'Pasta and rice'],
    ['tins', 'Tins and jars'],
    ['baking', 'Baking'],
    ['spices', 'Spices and oils'],
    ['frozen', 'Frozen'],
    ['drinks', 'Drinks'],
    ['household', 'Household'],
    ['other', 'Other'],
  ];
  const AISLE_KEYS = AISLES.map((a) => a[0]);
  const AISLE_NAME = Object.fromEntries(AISLES);

  // Checked in this order, so "olive oil" is an oil before olives are a jar, "coconut milk"
  // is a tin before it is dairy and "black pepper" is a spice before it is a vegetable.
  // Words match whole, with an optional plural.
  const GUESS = [
    ['frozen', ['frozen', 'ice cream', 'ice cubes', 'frozen peas', 'fish fingers']],
    ['household', ['toilet paper', 'kitchen roll', 'paper towels', 'soap', 'detergent', 'bin bag', 'foil', 'cling film', 'baking paper', 'sponge', 'washing up liquid', 'dishwasher tablet', 'napkin', 'candle']],
    ['spices', ['salt', 'black pepper', 'peppercorn', 'white pepper', 'cumin', 'paprika', 'turmeric', 'curry powder', 'garam masala', 'cinnamon', 'dried oregano', 'oregano', 'dried thyme', 'chilli flakes', 'chili flakes', 'spice', 'olive oil', 'oil', 'vinegar', 'soy sauce', 'mustard', 'ketchup', 'mayonnaise', 'mayo', 'sesame', 'nutmeg', 'bay leaf', 'bay leaves', 'stock cube', 'fish sauce', 'sriracha', 'coriander seed', 'cardamom', 'fennel seed', 'ras el hanout', 'za\'atar', 'sumac', 'smoked paprika']],
    ['tins', ['tin', 'tinned', 'canned', 'can', 'jar', 'passata', 'tomato paste', 'tomato puree', 'chopped tomatoes', 'plum tomatoes', 'coconut milk', 'coconut cream', 'chickpea', 'kidney bean', 'black bean', 'cannellini', 'butter bean', 'borlotti', 'baked bean', 'lentil', 'stock', 'broth', 'pesto', 'olive', 'caper', 'tuna', 'sweetcorn', 'curry paste', 'peanut butter', 'jam', 'tahini', 'harissa', 'gherkin', 'sun dried tomato', 'soup']],
    ['baking', ['flour', 'bread flour', 'yeast', 'sugar', 'baking powder', 'baking soda', 'bicarbonate', 'vanilla', 'cocoa', 'chocolate', 'semolina', 'cornflour', 'cornstarch', 'oats', 'honey', 'maple syrup', 'icing sugar', 'almond', 'walnut', 'pine nut', 'raisin', 'nut']],
    ['vegetarian', ['tofu', 'tempeh', 'seitan', 'falafel', 'vegetarian', 'vegan', 'quorn', 'plant based', 'veggie burger', 'vegetarian mince']],
    ['meat', ['chicken', 'beef', 'pork', 'lamb', 'mince', 'bacon', 'sausage', 'ham', 'chorizo', 'salami', 'pancetta', 'prosciutto', 'turkey', 'fish', 'salmon', 'cod', 'prawn', 'shrimp', 'mussel', 'anchovy', 'anchovies', 'steak', 'duck', 'guanciale']],
    ['dairy', ['milk', 'butter', 'cheese', 'mozzarella', 'parmesan', 'parmigiano', 'cheddar', 'feta', 'ricotta', 'ricotta salata', 'yoghurt', 'yogurt', 'cream', 'creme fraiche', 'crème fraîche', 'sour cream', 'egg', 'mascarpone', 'halloumi', 'pecorino', 'gruyere', 'gruyère', 'burrata', 'gouda', 'goat cheese', 'paneer', 'quark']],
    ['pasta', ['pasta', 'spaghetti', 'penne', 'rigatoni', 'fusilli', 'linguine', 'tagliatelle', 'lasagne', 'lasagna', 'noodle', 'rice', 'basmati', 'risotto', 'arborio', 'couscous', 'quinoa', 'bulgur', 'orzo', 'gnocchi', 'macaroni', 'farfalle', 'pappardelle', 'udon', 'ramen']],
    ['bread', ['bread', 'baguette', 'roll', 'pita', 'pitta', 'tortilla', 'wrap', 'naan', 'bun', 'sourdough', 'ciabatta', 'croissant', 'focaccia', 'bagel', 'breadcrumbs', 'panko']],
    ['produce', ['onion', 'red onion', 'spring onion', 'shallot', 'garlic', 'ginger', 'tomato', 'cherry tomato', 'potato', 'sweet potato', 'carrot', 'pepper', 'bell pepper', 'spinach', 'lettuce', 'salad', 'rocket', 'cucumber', 'courgette', 'zucchini', 'aubergine', 'eggplant', 'mushroom', 'broccoli', 'cauliflower', 'cabbage', 'kale', 'leek', 'celery', 'lemon', 'lime', 'orange', 'apple', 'pear', 'banana', 'berry', 'berries', 'strawberry', 'strawberries', 'grape', 'avocado', 'chilli', 'chili', 'jalapeño', 'jalapeno', 'basil', 'parsley', 'coriander', 'cilantro', 'mint', 'dill', 'chives', 'rosemary', 'thyme', 'sage', 'green bean', 'pumpkin', 'squash', 'beetroot', 'fennel', 'asparagus', 'peas', 'pea', 'corn', 'radish', 'pak choi', 'bok choy', 'herb', 'fruit', 'vegetable', 'veg', 'mango', 'melon', 'sprout']],
    ['drinks', ['sparkling water', 'mineral water', 'juice', 'wine', 'beer', 'coffee', 'tea', 'soda', 'cola', 'lemonade', 'tonic', 'prosecco', 'oat milk drink']],
  ];
  const LETTER = 'a-z\\u00c0-\\u024f';
  const GUESS_RE = GUESS.map(([aisle, words]) => [aisle, words.map((w) => new RegExp(`(^|[^${LETTER}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?(?=$|[^${LETTER}])`))]);

  function guessAisle(item) {
    const t = String(item || '').toLowerCase();
    if (!t.trim()) return 'other';
    for (const [aisle, res] of GUESS_RE) if (res.some((re) => re.test(t))) return aisle;
    return 'other';
  }

  /* ---------- Text (the same rules as the Worker) ---------- */
  function cleanLine(v, max) {
    const t = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return max && t.length > max ? t.slice(0, max).trim() : t;
  }

  /* ---------- Weeks (ISO, Monday first) ---------- */
  const DAY_MS = 86400000;
  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const pad = (n) => String(n).padStart(2, '0');
  function localDate(d) {
    d = d || new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function addDays(date, n) {
    return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
  }
  function weekdayIndex(date) { // 0 Monday
    return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  }
  function isoWeek(date) {
    const d = new Date(date + 'T00:00:00Z');
    const wd = (d.getUTCDay() + 6) % 7;
    const thu = new Date(d.getTime() + (3 - wd) * DAY_MS);
    const year = thu.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const mon1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
    const n = 1 + Math.round((d.getTime() - wd * DAY_MS - mon1) / (7 * DAY_MS));
    return { week: `${year}-W${pad(n)}`, day: WEEKDAYS[wd], num: n };
  }
  function weekStart(week) {
    const m = /^(\d{4})-W(\d{2})$/.exec(week);
    const jan4 = new Date(Date.UTC(+m[1], 0, 4));
    const mon1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
    return new Date(mon1 + (+m[2] - 1) * 7 * DAY_MS).toISOString().slice(0, 10);
  }
  /* The seven days of a week: [{ id, date, day, name, dayNum }] */
  function weekDays(week) {
    const mon = weekStart(week);
    return WEEKDAYS.map((d, i) => {
      const date = addDays(mon, i);
      return { id: week + ':' + d, date, day: d, short: DAY_NAMES[i].slice(0, 3), name: DAY_NAMES[i], dayNum: +date.slice(8) };
    });
  }
  const dayName = (date) => DAY_NAMES[weekdayIndex(date)];
  const dayMonth = (date) => `${+date.slice(8)} ${MONTHS[+date.slice(5, 7) - 1]}`;
  const longDate = (date) => `${dayName(date)} ${dayMonth(date)}`;
  function weekRange(week) {
    const a = weekStart(week);
    const b = addDays(a, 6);
    const ma = MONTHS[+a.slice(5, 7) - 1].slice(0, 3);
    const mb = MONTHS[+b.slice(5, 7) - 1].slice(0, 3);
    return ma === mb ? `${+a.slice(8)} to ${+b.slice(8)} ${mb}` : `${+a.slice(8)} ${ma} to ${+b.slice(8)} ${mb}`;
  }
  function dateOfDayId(id) {
    const [week, d] = id.split(':');
    return addDays(weekStart(week), WEEKDAYS.indexOf(d));
  }
  function dayIdOf(date) {
    const w = isoWeek(date);
    return w.week + ':' + w.day;
  }

  /* ---------- Whose plan, which meal (the Worker has the same keys) ---------- */
  // A day record is one meal of one person: '<YYYY-Www>:<mon..sun>:<person>:<meal>'.
  // The old '<YYYY-Www>:<mon..sun>' was a dinner for both; the page turns it into two.
  const PEOPLE = ['paul', 'olivia'];
  const PERSON_NAME = { paul: 'Paul', olivia: 'Olivia' };
  const MEALS = ['breakfast', 'lunch', 'dinner'];
  const MEAL_NAME = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
  const mealId = (dayId, who, meal) => dayId + ':' + who + ':' + meal;
  const isOldDayId = (id) => id.split(':').length === 2;

  /* ---------- Dough ---------- */
  const TF = { thin: 2.0345, regular: 2.3873, thick: 3.1135 }; // grams per square inch
  const BASE = { water: 62, yeast: 0.4, salt: 2.5, sugar: 2, oil: 3.3 }; // baker's percentages
  const GF = { ball: 1.1708, flour: 1.1717, water: 80 };
  const RES = 1.0075; // a little extra for what sticks to the bowl
  const DOUGH_DEFAULT = { size: 14, count: 2, thickness: 'regular', gf: false, night: null, tweaks: {} };
  const TWEAK_STEP = { water: 1, yeast: 0.1, salt: 0.1, sugar: 0.5, oil: 0.1, gfWater: 1 };
  const TWEAK_RANGE = { water: [40, 100], yeast: [0, 5], salt: [0, 6], sugar: [0, 10], oil: [0, 15], gfWater: [40, 110] };

  function pct(settings, k) {
    const t = (settings && settings.tweaks) || {};
    return typeof t[k] === 'number' ? t[k] : BASE[k];
  }

  function doughCalc(s) {
    s = Object.assign({}, DOUGH_DEFAULT, s || {});
    const p = { water: pct(s, 'water'), yeast: pct(s, 'yeast'), salt: pct(s, 'salt'), sugar: pct(s, 'sugar'), oil: pct(s, 'oil') };
    let ball = Math.PI * Math.pow(s.size / 2, 2) * TF[s.thickness];
    const sum = 100 + p.water + p.yeast + p.salt + p.sugar + p.oil;
    let flour = (s.count * ball) / (sum / 100) * RES;
    let waterPct = p.water;
    let waterKey = 'water';
    if (s.gf) {
      ball *= GF.ball;
      flour *= GF.flour;
      const t = (s.tweaks || {}).gfWater;
      waterPct = typeof t === 'number' ? t : GF.water;
      waterKey = 'gfWater';
    }
    const g = (x) => flour * x / 100;
    const rows = [
      { key: 'flour', label: s.gf ? 'Gluten free flour' : 'Bread flour', grams: flour, pct: 100 },
      { key: waterKey, label: s.gf ? 'Water, cold' : 'Water, under 15 °C', grams: g(waterPct), pct: waterPct, base: s.gf ? GF.water : BASE.water },
      { key: 'yeast', label: 'Active dry yeast', grams: g(p.yeast), pct: p.yeast, base: BASE.yeast },
      { key: 'salt', label: 'Salt', grams: g(p.salt), pct: p.salt, base: BASE.salt },
      { key: 'sugar', label: 'Sugar', grams: g(p.sugar), pct: p.sugar, base: BASE.sugar },
      { key: 'oil', label: 'Olive oil', grams: g(p.oil), pct: p.oil, base: BASE.oil },
    ];
    return { ball, flour, rows, settings: s };
  }

  // Grams as the page shows them: one decimal under 10 g, whole grams above.
  function grams(x) {
    return x < 10 ? String(Math.round(x * 10) / 10) : String(Math.round(x));
  }
  // The ball weight as the old artifact showed it: rounded to a tenth first, then to the gram
  // (4 of 14 inch regular: 367.496 g, shown as 368 g, as in the approved design).
  function ballGrams(x) {
    return String(Math.round(Math.round(x * 10) / 10));
  }
  function pctText(x) {
    return String(Math.round(x * 100) / 100) + '%';
  }

  const STEPS_NY = [
    'Chill the water to under 15 °C.',
    'Stir in the yeast.',
    'Add the flour and the oil, mix for 2 minutes.',
    'Add the sugar and the salt on low speed.',
    'Mix for 10 more minutes.',
    'Cover and rest for 1 to 3 hours.',
    'Shape into balls and seal the seam underneath.',
    'Refrigerate for 2 to 4 days, 3 is ideal.',
    'Bring to room temperature before shaping.',
  ];
  const STEPS_GF = [
    'Stir the yeast into cold water.',
    'Add the gluten free flour and the oil, mix for 2 minutes.',
    'Add the sugar and the salt, mix for 3 to 4 minutes.',
    'Refrigerate for 15 minutes.',
    'Oil your hands and shape the balls.',
    'Refrigerate for up to 48 hours.',
    'Bring to room temperature before use.',
  ];

  function bakeNote(thickness) {
    const start = 'oven at its highest, about 250 °C, preheat 45 to 60 minutes, ';
    if (thickness === 'thin') return start + 'bake 5 to 6 minutes.';
    if (thickness === 'thick') return start + 'then drop to 230 °C and bake 10 to 12 minutes.';
    return start + 'bake 6 to 8 minutes.';
  }

  /* ---------- Pizza night: when to mix ---------- */
  const MIX_DAYS = { regular: 3, gf: 1 }; // the Worker has the same

  function mixDate(night, gf) {
    return addDays(night, -(gf ? MIX_DAYS.gf : MIX_DAYS.regular));
  }

  /* What the pizza night card says. { title, body } */
  function pizzaPlan(night, gf, today) {
    if (!night) return { title: 'When is pizza night?', body: 'Pick the day and this tells you when to mix.', state: 'none' };
    const mix = mixDate(night, gf);
    const on = `Pizza on ${longDate(night)}.`;
    const toNight = daysBetween(today, night);
    if (toNight < 0) return { title: 'When is the next pizza night?', body: `The last one was ${longDate(night)}. Pick the next day.`, state: 'past' };
    if (toNight === 0) return { title: 'Pizza tonight', body: 'Take the dough out so it reaches room temperature before shaping.', state: 'tonight' };
    const range = gf
      ? 'Gluten free dough keeps up to 48 hours, so the day before is best.'
      : `Anywhere from ${dayName(addDays(night, -4))} to ${dayName(addDays(night, -2))} works.`;
    const toMix = daysBetween(today, mix);
    if (toMix > 0) return { title: `Mix on ${longDate(mix)}`, body: `${on} ${range}`, state: 'ahead' };
    if (toMix === 0) return { title: `Mix today, ${longDate(mix)}`, body: `${on} ${range}`, state: 'today' };
    if (!gf && toNight >= 2) return { title: `Mix today at the latest`, body: `${on} The best day was ${dayName(mix)}, two days ahead still works.`, state: 'late' };
    return { title: `Pizza on ${longDate(night)}`, body: 'Hope the dough is resting in the fridge. If not, mix it now: it still works, with less flavour.', state: 'late' };
  }

  /* Pizza nights the week needs to mix for today: the dough's date and pizza days. */
  function mixDueToday(nights, gf, today) {
    return nights.filter((n) => mixDate(n, gf) === today).sort()[0] || null;
  }

  /* ---------- Amounts ---------- */
  const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

  /* "1.5", "1,5", "1/2", "1 1/2", "½", "1½" -> number. "" -> null. Anything else -> NaN. */
  function parseQty(v) {
    let t = String(v == null ? '' : v).trim().replace(',', '.');
    if (!t) return null;
    let n = 0;
    const g = t.match(/^(\d*)\s*([½⅓⅔¼¾⅛])$/);
    if (g) return (g[1] ? +g[1] : 0) + FRACTIONS[g[2]];
    const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return +mixed[3] ? +mixed[1] + +mixed[2] / +mixed[3] : NaN;
    const frac = t.match(/^(\d+)\/(\d+)$/);
    if (frac) return +frac[2] ? +frac[1] / +frac[2] : NaN;
    if (!/^\d*\.?\d+$/.test(t)) return NaN;
    n = parseFloat(t);
    return n > 0 ? n : NaN;
  }

  const UNIT_SYNONYMS = {
    g: ['g', 'gr', 'gram', 'grams', 'gramme', 'grammes', 'gm'], kg: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
    ml: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'], l: ['l', 'litre', 'litres', 'liter', 'liters', 'ltr'],
    cl: ['cl'], dl: ['dl'],
    tbsp: ['tbsp', 'tbs', 'tablespoon', 'tablespoons', 'el'], tsp: ['tsp', 'teaspoon', 'teaspoons', 'tl'],
  };
  const UNIT_OF = {};
  for (const [u, list] of Object.entries(UNIT_SYNONYMS)) for (const s of list) UNIT_OF[s] = u;
  function normUnit(u) {
    const t = String(u || '').trim().toLowerCase().replace(/\.$/, '');
    return UNIT_OF[t] || t;
  }
  const METRIC = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000], cl: ['ml', 10], dl: ['ml', 100] };

  function num(n, metric) {
    if (!(n > 0)) return '';
    if (metric) return n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n));
    const whole = Math.floor(n + 1e-9);
    const rest = n - whole;
    if (rest < 0.03) return String(whole);
    for (const [glyph, v] of Object.entries(FRACTIONS)) {
      if (Math.abs(rest - v) < 0.03) return (whole ? whole : '') + glyph;
    }
    return String(n >= 10 ? Math.round(n) : Math.round(n * 100) / 100);
  }

  /* An amount with its unit, as a recipe shows it: "2 tins", "400 ml", "1½ tsp", "3". */
  function amountText(qty, unit) {
    if (qty == null) return String(unit || '').trim();
    const u = String(unit || '').trim();
    const n = normUnit(u);
    if (n === 'g' && qty >= 1000) return num(qty / 1000, true) + ' kg';
    if (n === 'ml' && qty >= 1000) return num(qty / 1000, true) + ' l';
    const q = num(qty, !!METRIC[n]);
    return u ? q + ' ' + u : q;
  }

  function scale(qty, factor) {
    return qty == null ? null : qty * factor;
  }

  /* ---------- Shopping ---------- */
  // The key a line is ticked under: the item's name before any comma or bracket, lower case.
  function itemKey(item) {
    const t = String(item || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(',')[0].replace(/[|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return (t || String(item || '').toLowerCase().replace(/[|\s]+/g, ' ').trim()).slice(0, 100);
  }
  function itemName(item) {
    const t = String(item || '').replace(/\(.*?\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim() || String(item || '').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* Add up amounts that share a unit: grams with kilos, millilitres with litres. */
  function sumText(parts) {
    const buckets = new Map(); // base unit -> { qty, label }
    let bare = false;
    for (const { qty, unit } of parts) {
      if (qty == null) { bare = true; continue; }
      const n = normUnit(unit);
      const m = METRIC[n];
      const base = m ? m[0] : n.replace(/(es|s)$/, '');
      const add = m ? qty * m[1] : qty;
      const b = buckets.get(base);
      if (b) b.qty += add;
      else buckets.set(base, { qty: add, label: m ? m[0] : String(unit || '').trim() });
    }
    const out = [...buckets.values()].map((b) => amountText(b.qty, b.label));
    if (!out.length && bare) return '';
    return out.join(' + ');
  }

  /* The week's shopping list.
   *   week     'YYYY-Www'
   *   byKey    { 'recipe:<id>': recipe, 'day:<id>': day, 'extra:<id>': extra, 'tick:<id>': tick }
   * -> { groups: [{ aisle, name, lines: [{ key, name, qty, on, extraId }] }], left, total } */
  // Every planned recipe of the week, both plans, every meal. The same recipe for the same
  // meal in both plans is one pot, cooked once, at the larger of the two servings.
  function plannedRecipes(week, byKey) {
    const out = [];
    for (const d of weekDays(week)) {
      for (const meal of MEALS) {
        const pots = new Map(); // recipeId -> servings (null: the recipe's own)
        for (const who of PEOPLE) {
          const rec = byKey['day:' + mealId(d.id, who, meal)];
          if (!rec || rec.kind !== 'recipe') continue;
          const r = byKey['recipe:' + rec.recipeId];
          if (!r) continue;
          const srv = rec.servings || r.servings;
          pots.set(r.id, Math.max(pots.get(r.id) || 0, srv));
        }
        for (const [id, servings] of pots) out.push({ recipe: byKey['recipe:' + id], servings });
      }
    }
    return out;
  }

  function shoppingList(week, byKey) {
    const lines = new Map();
    for (const { recipe: r, servings } of plannedRecipes(week, byKey)) {
      const factor = servings && r.servings ? servings / r.servings : 1;
      for (const g of r.ingredients || []) {
        const key = 'i:' + itemKey(g.item);
        let l = lines.get(key);
        if (!l) {
          l = { key, name: itemName(g.item), aisle: AISLE_KEYS.includes(g.aisle) ? g.aisle : 'other', parts: [] };
          lines.set(key, l);
        }
        l.parts.push({ qty: scale(g.qty, factor), unit: g.unit });
      }
    }
    for (const [k, x] of Object.entries(byKey)) {
      if (!k.startsWith('extra:') || x.week !== week) continue;
      lines.set('x:' + x.id, { key: 'x:' + x.id, name: x.text, aisle: AISLE_KEYS.includes(x.aisle) ? x.aisle : 'other', qtyText: x.qty || '', extraId: x.id, at: x.updatedAt || 0 });
    }
    const groups = [];
    let left = 0;
    let total = 0;
    for (const [aisle, name] of AISLES) {
      const ls = [...lines.values()].filter((l) => l.aisle === aisle).map((l) => {
        const t = byKey['tick:' + week + '|' + l.key];
        const on = !!(t && t.on);
        total++;
        if (!on) left++;
        return { key: l.key, name: l.name, qty: l.extraId ? l.qtyText : sumText(l.parts), on, extraId: l.extraId || null };
      }).sort((a, b) => a.name.localeCompare(b.name));
      if (ls.length) groups.push({ aisle, name, lines: ls });
    }
    return { groups, left, total };
  }

  const api = {
    AISLES, AISLE_KEYS, AISLE_NAME, guessAisle, cleanLine,
    WEEKDAYS, DAY_NAMES, MONTHS, localDate, addDays, daysBetween, isoWeek, weekStart, weekDays, dayName, dayMonth, longDate, weekRange, dateOfDayId, dayIdOf,
    PEOPLE, PERSON_NAME, MEALS, MEAL_NAME, mealId, isOldDayId, plannedRecipes,
    TF, BASE, GF, RES, DOUGH_DEFAULT, TWEAK_STEP, TWEAK_RANGE, doughCalc, grams, ballGrams, pctText, STEPS_NY, STEPS_GF, bakeNote,
    MIX_DAYS, mixDate, pizzaPlan, mixDueToday,
    parseQty, normUnit, amountText, scale, itemKey, itemName, sumText, shoppingList,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenLogic = api;
})(typeof self !== 'undefined' ? self : this);
