// The page's pure logic: dough maths, pizza night, weeks, amounts, aisles, the shopping list.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// logic.js is a plain browser script that sets self.KitchenLogic; run it the way the page does.
const holder = {};
new Function('self', readFileSync(new URL('../app/logic.js', import.meta.url), 'utf8'))(holder);
const L = holder.KitchenLogic;

test('dough: 4 pizzas of 14 inch, regular, matches the old artifact', () => {
  const d = L.doughCalc({ size: 14, count: 4, thickness: 'regular', gf: false, tweaks: {} });
  assert.equal(L.ballGrams(d.ball), '368');
  assert.equal(Math.round(d.flour), 870);
  const g = Object.fromEntries(d.rows.map((r) => [r.key, L.grams(r.grams)]));
  assert.deepEqual(g, { flour: '870', water: '539', yeast: '3.5', salt: '22', sugar: '17', oil: '29' });
  assert.deepEqual(d.rows.map((r) => L.pctText(r.pct)), ['100%', '62%', '0.4%', '2.5%', '2%', '3.3%']);
});

test('dough: thickness, gluten free and tweaks', () => {
  const thin = L.doughCalc({ size: 14, count: 1, thickness: 'thin' });
  assert.equal(Math.round(thin.ball), Math.round(Math.PI * 49 * 2.0345));
  const reg = L.doughCalc({ size: 14, count: 2, thickness: 'regular', gf: false });
  const gf = L.doughCalc({ size: 14, count: 2, thickness: 'regular', gf: true });
  assert.ok(Math.abs(gf.ball - reg.ball * 1.1708) < 1e-9);
  assert.ok(Math.abs(gf.flour - reg.flour * 1.1717) < 1e-9);
  assert.equal(gf.rows[1].key, 'gfWater');
  assert.equal(gf.rows[1].pct, 80);
  assert.equal(gf.rows[0].label, 'Gluten free flour');
  const wet = L.doughCalc({ size: 14, count: 2, thickness: 'regular', tweaks: { water: 65 } });
  assert.equal(wet.rows[1].pct, 65);
  assert.ok(wet.flour < reg.flour); // more water, the same dough weight, so less flour
  assert.equal(L.doughCalc(null).settings.count, 2); // the artifact's settings: 2 of 14 inch, regular
  assert.match(L.bakeNote('thick'), /230 °C and bake 10 to 12 minutes/);
  assert.match(L.bakeNote('regular'), /6 to 8 minutes/);
  assert.match(L.bakeNote('thin'), /5 to 6 minutes/);
});

test('pizza night: mix 3 days before, the day before when gluten free', () => {
  assert.equal(L.mixDate('2026-09-26', false), '2026-09-23');
  assert.equal(L.mixDate('2026-09-26', true), '2026-09-25');
  const p = L.pizzaPlan('2026-09-26', false, '2026-09-23');
  assert.equal(p.title, 'Mix today, Wednesday 23 September');
  assert.equal(p.body, 'Pizza on Saturday 26 September. Anywhere from Tuesday to Thursday works.');
  assert.equal(L.pizzaPlan('2026-09-26', false, '2026-09-20').title, 'Mix on Wednesday 23 September');
  assert.equal(L.pizzaPlan('2026-09-26', false, '2026-09-26').title, 'Pizza tonight');
  assert.equal(L.pizzaPlan('2026-09-26', false, '2026-09-27').state, 'past');
  assert.equal(L.pizzaPlan(null, false, '2026-09-27').state, 'none');
  assert.equal(L.mixDueToday(['2026-09-26', '2026-10-03'], false, '2026-09-23'), '2026-09-26');
  assert.equal(L.mixDueToday(['2026-09-26'], true, '2026-09-23'), null);
});

test('weeks: ISO numbers, ranges and day ids', () => {
  assert.deepEqual(L.isoWeek('2026-09-23'), { week: '2026-W39', day: 'wed', num: 39 });
  assert.equal(L.weekRange('2026-W39'), '21 to 27 Sep');
  assert.equal(L.weekRange('2026-W40'), '28 Sep to 4 Oct');
  assert.equal(L.dateOfDayId('2026-W39:sat'), '2026-09-26');
  assert.equal(L.dayIdOf('2026-09-26'), '2026-W39:sat');
  assert.equal(L.weekDays('2026-W39')[0].date, '2026-09-21');
  assert.equal(L.isoWeek('2027-01-01').week, '2026-W53');
});

test('amounts: parse, print and scale', () => {
  assert.equal(L.parseQty('1,5'), 1.5);
  assert.equal(L.parseQty('1 1/2'), 1.5);
  assert.equal(L.parseQty('½'), 0.5);
  assert.equal(L.parseQty('1½'), 1.5);
  assert.equal(L.parseQty(''), null);
  assert.ok(Number.isNaN(L.parseQty('a bit')));
  assert.ok(Number.isNaN(L.parseQty('0')));
  assert.equal(L.amountText(2, 'tins'), '2 tins');
  assert.equal(L.amountText(1.5, 'tsp'), '1½ tsp');
  assert.equal(L.amountText(0.25, 'tsp'), '¼ tsp');
  assert.equal(L.amountText(1500, 'g'), '1.5 kg');
  assert.equal(L.amountText(3.48, 'g'), '3.5 g');
  assert.equal(L.amountText(null, 'pinch'), 'pinch');
  assert.equal(L.amountText(3, ''), '3');
  assert.equal(L.amountText(L.scale(200, 2 / 4), 'g'), '100 g');
});

test('aisles: a sensible guess in the right order', () => {
  const cases = {
    'coconut milk': 'tins', milk: 'dairy', 'black pepper': 'spices', 'red pepper': 'produce', chickpeas: 'tins', eggs: 'dairy',
    aubergine: 'produce', eggplant: 'produce', 'bread flour': 'baking', 'basmati rice': 'pasta', 'olive oil': 'spices', tofu: 'vegetarian',
    'frozen peas': 'frozen', 'toilet paper': 'household', 'chicken thighs': 'meat', 'ricotta salata': 'dairy', 'onion, chopped': 'produce',
    'garlic cloves': 'produce', mystery: 'other', spinach: 'produce', 'crème fraîche': 'dairy',
  };
  for (const [item, aisle] of Object.entries(cases)) assert.equal(L.guessAisle(item), aisle, item);
});

test('shopping: recipes scaled by servings, combined per item, extras, ticks, aisle order', () => {
  const byKey = {
    'recipe:curry': { id: 'curry', servings: 4, ingredients: [
      { qty: 2, unit: 'tins', item: 'chickpeas, drained', aisle: 'tins' },
      { qty: 200, unit: 'g', item: 'spinach', aisle: 'produce' },
      { qty: 1, unit: '', item: 'onion, chopped', aisle: 'produce' },
      { qty: null, unit: '', item: 'salt', aisle: 'spices' },
    ] },
    'recipe:norma': { id: 'norma', servings: 2, ingredients: [
      { qty: 1, unit: '', item: 'Onion', aisle: 'produce' },
      { qty: 0.8, unit: 'kg', item: 'spinach', aisle: 'produce' },
    ] },
    // the same pot in both plans counts once
    'day:2026-W39:mon:paul:dinner': { kind: 'recipe', recipeId: 'norma', servings: 2 },
    'day:2026-W39:mon:olivia:dinner': { kind: 'recipe', recipeId: 'norma', servings: 2 },
    'day:2026-W39:tue:olivia:lunch': { kind: 'recipe', recipeId: 'curry', servings: 2 },
    'day:2026-W39:wed:paul:dinner': { kind: 'text', text: 'Leftovers' },
    'day:2026-W40:mon:paul:dinner': { kind: 'recipe', recipeId: 'curry', servings: 4 },
    'extra:x1': { id: 'x1', week: '2026-W39', text: 'Bread flour', qty: '870 g', aisle: 'baking' },
    'extra:x2': { id: 'x2', week: '2026-W40', text: 'Milk', qty: '', aisle: 'dairy' },
    'tick:2026-W39|i:onion': { on: true },
  };
  const s = L.shoppingList('2026-W39', byKey);
  assert.deepEqual(s.groups.map((g) => g.aisle), ['produce', 'tins', 'baking', 'spices']);
  assert.deepEqual(s.groups[0].lines.map((l) => [l.name, l.qty, l.on]), [['Onion', '1½', true], ['Spinach', '900 g', false]]);
  assert.equal(s.groups[1].lines[0].name, 'Chickpeas');
  assert.equal(s.groups[1].lines[0].qty, '1 tins');
  assert.equal(s.groups[2].lines[0].extraId, 'x1');
  assert.equal(s.groups[2].lines[0].qty, '870 g');
  assert.equal(s.groups[3].lines[0].qty, '');
  assert.equal(s.total, 5);
  assert.equal(s.left, 4);
  assert.equal(L.shoppingList('2026-W41', byKey).total, 0);
  assert.equal(L.sumText([{ qty: 1, unit: 'tin' }, { qty: 2, unit: 'tins' }, { qty: 100, unit: 'g' }]), '3 tin + 100 g');
  // the larger servings of the two wins; a different meal or a different day is its own pot
  const more = Object.assign({}, byKey, { 'day:2026-W39:mon:olivia:dinner': { kind: 'recipe', recipeId: 'norma', servings: 4 } });
  assert.equal(L.shoppingList('2026-W39', more).groups[0].lines.find((l) => l.name === 'Spinach').qty, '1.7 kg');
  const lunch = Object.assign({}, byKey, { 'day:2026-W39:mon:paul:lunch': { kind: 'recipe', recipeId: 'norma', servings: 2 } });
  assert.equal(L.shoppingList('2026-W39', lunch).groups[0].lines.find((l) => l.name === 'Spinach').qty, '1.7 kg');
  // an old shared day is not read any more (the page splits it first)
  assert.equal(L.shoppingList('2026-W39', { 'recipe:norma': byKey['recipe:norma'], 'day:2026-W39:mon': { kind: 'recipe', recipeId: 'norma' } }).total, 0);
  assert.equal(L.mealId('2026-W39:mon', 'olivia', 'lunch'), '2026-W39:mon:olivia:lunch');
  assert.equal(L.isOldDayId('2026-W39:mon'), true);
  assert.equal(L.isOldDayId('2026-W39:mon:paul:dinner'), false);
  assert.equal(L.dateOfDayId('2026-W39:sat:olivia:dinner'), '2026-09-26');
});
