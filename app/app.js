/* Kitchen. The week's dinners, recipes, one shopping list and the pizza dough.
 * Vanilla, no build step. The maths lives in logic.js.
 *
 * Data flow (the same as the to-do app)
 *   Every record (a recipe, a day, a shopping extra, a tick, the dough settings) lives in
 *   localStorage and is shown at once. A change is an op on one record, kept in a queue
 *   (one op per record, the latest wins) and sent in a debounced batch. The screen shows
 *   the last server copy with the queue laid on top, so offline changes show at once and
 *   survive a reload. While visible the page polls with ?since=<rev>, which costs nothing
 *   when nothing moved. The Worker merges per record, newest updatedAt wins, so two
 *   phones editing different things never lose each other's work.
 */
(() => {
  'use strict';

  const L = self.KitchenLogic;
  const DEBOUNCE = 1000;
  const POLL = 10000;
  const MAX_BATCH = 200;
  const MAX_BODY = 150000;
  const TOAST_MS = 4000;
  const CODE_RE = /^[a-z0-9]{16}$/;

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const apiParam = params.get('api') || '';
  const API = (/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)/.test(apiParam)
    ? apiParam
    : isLocal ? 'http://localhost:8787' : 'https://paul-hub.paul-o-a04.workers.dev').replace(/\/+$/, '');
  const wide = matchMedia('(min-width: 900px)');

  /* ---------- Storage (every access guarded; private mode can throw) ---------- */
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  };

  /* ---------- The code in the link (the kitchen's own; never the to-do's) ---------- */
  let code = (params.get('c') || '').trim().toLowerCase();
  if (CODE_RE.test(code)) {
    store.set('kitchen.code', code);
  } else {
    code = store.get('kitchen.code') || '';
    if (CODE_RE.test(code)) {
      // Put it back in the address, so Add to Home Screen keeps it.
      params.set('c', code);
      history.replaceState(null, '', location.pathname + '?' + params.toString());
    }
  }
  if (!CODE_RE.test(code)) {
    $('nocode').hidden = false;
    return;
  }
  $('app').hidden = false;

  const KEY = 'kitchen.v1.' + code;
  const ui = Object.assign({ tab: 'week', who: 'paul' }, store.get('kitchen.ui') || {});
  delete ui.vegOnly; // the old "Vegetarian only" filter; the list is two groups now
  const saveUi = () => store.set('kitchen.ui', ui);
  // Whose plan the Week shows. Olivia's link carries &p=olivia, so her phone opens on hers.
  const askedWho = params.get('p');
  if (L.PEOPLE.includes(askedWho)) { ui.who = askedWho; saveUi(); }
  if (!L.PEOPLE.includes(ui.who)) ui.who = 'paul';
  const saved = store.get(KEY);
  const st = saved && typeof saved === 'object'
    ? { server: saved.server || {}, rev: saved.rev || 0, queue: Array.isArray(saved.queue) ? saved.queue : [], away: Array.isArray(saved.away) ? saved.away : [] }
    : { server: {}, rev: 0, queue: [], away: [] };
  const save = () => store.set(KEY, st);

  /* ---------- Model ---------- */
  let db = {}; // 'type:id' -> record, the server copy with the queue on top
  const keyOf = (type, id) => type + ':' + id;
  const opKey = (o) => keyOf(o.type, o.item.id);

  function computeView() {
    const m = Object.assign({}, st.server);
    for (const o of st.queue) {
      if (o.op === 'delete') delete m[opKey(o)];
      else m[opKey(o)] = o.item;
    }
    db = m;
  }

  let lastStamp = 0;
  const MIN_TIME = Date.UTC(2020, 0, 1) + 1;
  function stamp() {
    lastStamp = Math.max(Date.now(), MIN_TIME, lastStamp + 1);
    return lastStamp;
  }

  function newId() {
    const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (const x of crypto.getRandomValues(new Uint8Array(16))) s += a[x % 36];
    return s;
  }

  const upsertOp = (type, item) => ({ op: 'upsert', type, item: Object.assign({}, item, { type, updatedAt: stamp() }) });
  const deleteOp = (type, id) => ({ op: 'delete', type, item: { id, updatedAt: stamp() } });

  function enqueue(ops) {
    for (const op of ops) {
      st.queue = st.queue.filter((o) => opKey(o) !== opKey(op));
      st.queue.push(op);
    }
    save();
    computeView();
    renderAll();
    scheduleFlush();
  }
  const put = (type, item) => enqueue([upsertOp(type, item)]);
  const drop = (type, id) => enqueue([deleteOp(type, id)]);

  const recipe = (id) => db[keyOf('recipe', id)];
  const dayRec = (id) => db[keyOf('day', id)];
  const dough = () => Object.assign({}, L.DOUGH_DEFAULT, db['dough:dough'] || {}, { id: 'dough' });
  const recipes = () => Object.values(db).filter((r) => r.type === 'recipe').sort((a, b) => a.title.localeCompare(b.title));

  // Restore a record as it was (for Undo), or remove it if it did not exist.
  function restore(type, id, prev) {
    if (prev) put(type, prev);
    else drop(type, id);
  }

  /* ---------- Dates ---------- */
  let weekOffset = 0;
  const today = () => L.localDate();
  const weekAt = (offset) => L.isoWeek(L.addDays(today(), offset * 7)).week;
  const weekNum = (week) => +week.slice(6);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function pizzaNights() {
    const t = today();
    const out = new Set();
    const d = dough();
    if (d.night && d.night >= t) out.add(d.night);
    for (const r of Object.values(db)) {
      if (r.type === 'day' && L.isPizzaNight(r)) {
        const date = L.dateOfDayId(r.id);
        if (date >= t) out.add(date);
      }
    }
    return [...out];
  }

  /* ---------- Rendering helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VEG = '<span class="pillv">Vegetarian</span>';

  // One meal of one person: '<week>:<day>:<who>:<meal>'.
  function dayView(id) {
    const rec = dayRec(id);
    if (!rec) return { title: 'Add ' + id.split(':')[3], cls: 'empty', side: '' };
    if (L.isPizzaNight(rec)) {
      const n = rec.servings || dough().count;
      return { title: 'Pizza night', cls: 'pizza', side: plural(n, 'pizza', 'pizzas') };
    }
    if (rec.kind === 'text') return { title: rec.text, cls: '', side: rec.servings ? String(rec.servings) : '' };
    const r = recipe(rec.recipeId);
    if (!r) return { title: 'Recipe removed', cls: 'gone', side: '' };
    return { title: r.title, cls: '', veg: !!r.veg, side: String(rec.servings || r.servings) };
  }

  /* ---------- Tabs ---------- */
  function renderTabs() {
    const planTab = ui.tab === 'week' || ui.tab === 'shop';
    const w = wide.matches;
    document.querySelector('.plan').classList.toggle('on', planTab);
    $('v-week').classList.toggle('on', ui.tab === 'week' || (w && planTab));
    $('v-shop').classList.toggle('on', ui.tab === 'shop' || (w && planTab));
    $('v-recipes').classList.toggle('on', ui.tab === 'recipes');
    $('v-dough').classList.toggle('on', ui.tab === 'dough');
    for (const b of document.querySelectorAll('.tab')) {
      const on = b.dataset.tab === ui.tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    for (const b of document.querySelectorAll('.pill-tab')) {
      const on = b.dataset.tab === 'week' ? planTab : b.dataset.tab === ui.tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
  }

  function setTab(t) {
    if (ui.tab === t) return;
    if (t !== 'recipes' && dayRecipeOpen()) { fromDay = null; openRecipe = null; recipeScreen('home'); }
    ui.tab = t;
    saveUi();
    renderTabs();
    window.scrollTo(0, 0);
    holdSpy = 0; // a glide still under way ends here
    spy(); // back on Recipes at the top: the index marks the first page
  }

  /* ---------- Week ---------- */
  let railWeek = ''; // the week whose tickets are on the rail; a new one drops them in again
  // What a ticket says on its right: "× 2" for servings, "2 pizzas" as it is.
  const sideText = (side) => (/^d+$/.test(side) ? '× ' + side : side);
  function renderWeek() {
    const week = weekAt(weekOffset);
    const t = today();
    $('weekLabel').innerHTML = `Week ${weekNum(week)}<span class="only-wide">, ${esc(L.weekRange(week))}</span>`;
    $('weekTitle').textContent = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : L.weekRange(week);
    $('thisWeek').hidden = weekOffset === 0;
    for (const b of document.querySelectorAll('[data-who]')) b.setAttribute('aria-checked', String(b.dataset.who === ui.who));
    // Dinner always shows; breakfast and lunch only once one is planned.
    $('days').innerHTML = L.weekDays(week).map((d) => {
      const isToday = d.date === t;
      const meals = L.MEALS.filter((m) => m === 'dinner' || dayRec(L.mealId(d.id, ui.who, m)));
      // A day with only dinner reads like before; the names show once there is more.
      const named = meals.length > 1;
      // His calendar has something over dinner that day (set by the hub; no title reaches here).
      const out = st.away.includes(d.date) ? L.PERSON_NAME.paul + ' out' : '';
      const views = meals.map((m) => dayView(L.mealId(d.id, ui.who, m)));
      // A ticket on the rail: the meal's name over what it is once there is more than dinner;
      // recipe titles without their bracket, so they fit half the width.
      const lines = meals.map((m, i) => {
        const v = views[i];
        const title = v.cls ? v.title : L.shortTitle(v.title);
        return `<span class="meal meal-${m}${named ? '' : ' solo'}" data-m="${m}">${named ? `<span class="meal-name">${L.MEAL_NAME[m]}</span>` : ''}`
          + `<span class="meal-what"><span class="day-title${v.cls ? ' ' + v.cls : ''}">${esc(title)}</span>${v.veg ? VEG : ''}`
          + `${m === 'dinner' && out ? `<span class="away">${esc(out)}</span>` : ''}</span>`
          + `<span class="day-side"><span class="srv">${esc(sideText(v.side))}</span></span></span>`;
      });
      const empty = views.every((v) => v.cls === 'empty');
      const said = meals.map((m, i) => L.MEAL_NAME[m] + ' ' + views[i].title).join(', ') + (out ? ', ' + out : '');
      return `<button type="button" class="day${isToday ? ' today' : ''}${empty ? ' empty' : ''}" data-day="${d.id}"${isToday ? ' aria-current="date"' : ''} aria-label="${esc(d.name + ' ' + d.dayNum + ': ' + said)}">`
        + `<span class="day-when"><b>${d.short}</b><span>${d.dayNum}</span>${isToday ? '<span class="tk-flag" aria-hidden="true">Tonight</span>' : ''}</span>`
        + `<span class="day-what">${lines.join('')}</span>`
        + '</button>';
    }).join('')
      + totalTicket(week);
    if (railWeek !== week + ui.who) {
      railWeek = week + ui.who;
      $('days').classList.remove('drop');
      void $('days').offsetWidth; // start the drop again
      $('days').classList.add('drop');
    }
    const due = L.mixDueToday(pizzaNights(), dough().gf, t);
    $('mixBanner').hidden = !due;
    if (due) $('mixText').innerHTML = `<b>Mix the dough today</b> for ${esc(L.dayName(due))}'s pizza night.`;
  }

  // The eighth slot on the rail: the week's total, which opens Shopping (on a laptop the list
  // is beside the week, so it hides there).
  function totalTicket(week) {
    const list = L.shoppingList(week, db);
    const n = L.weekDays(week).filter((d) => L.PEOPLE.some((p) => dayRec(L.mealId(d.id, p, 'dinner')))).length;
    const buy = list.total ? (list.toBuy ? plural(list.toBuy, 'thing', 'things') + ' to buy' : 'All bought') : 'Shopping';
    return `<button type="button" class="tk-total" data-goshop><span><b>${n}</b><small>${n === 1 ? 'dinner' : 'dinners'} planned</small></span><span class="tk-go">${esc(buy)}</span></button>`;
  }

  /* ---------- Sheet ---------- */
  let sheet = null; // { kind, ... }
  let sheetOpener = null;

  function openSheet(state, html) {
    if (!undoFn) hideToast(); // a plain note would sit over the sheet; one with Undo stays
    sheet = state;
    sheetOpener = document.activeElement;
    $('sheetBody').innerHTML = html;
    $('sheet').hidden = false;
    document.querySelector('.sheet').focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!sheet) return;
    sheet = null;
    $('sheet').hidden = true;
    $('sheetBody').innerHTML = '';
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
  }

  const sheetHead = (label, title) => `<div class="sheet-head"><div class="titles"><h2 id="sheetTitle">${esc(title)}</h2><span class="label">${esc(label)}</span></div><button type="button" class="round" data-close aria-label="Close">×</button></div>`;

  // The recipes planned most (any week, either plan), the latest first among equals; the one on
  // the meal now leads. A week is planned from about ten recipes, so these come before the A to Z.
  function oftenPicked(curId, n) {
    const seen = new Map(); // recipeId -> [times, last]
    for (const r of Object.values(db)) {
      if (r.type !== 'day' || r.kind !== 'recipe' || !recipe(r.recipeId)) continue;
      const x = seen.get(r.recipeId) || [0, 0];
      seen.set(r.recipeId, [x[0] + 1, Math.max(x[1], r.updatedAt || 0)]);
    }
    const ids = [...seen].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).map(([id]) => id);
    if (curId && recipe(curId)) ids.unshift(curId);
    return [...new Set(ids)].slice(0, n).map(recipe);
  }

  // Under seven recipes, all of them; otherwise the often planned ones and "All N recipes",
  // and the whole list once asked for or searched.
  function pickListHtml(curId, q, full) {
    const all = recipes();
    const f = String(q || '').toLowerCase().trim();
    const often = !f && !full && all.length > 6 ? oftenPicked(curId, 5) : [];
    const list = f ? all.filter((r) => r.title.toLowerCase().includes(f)) : often.length ? often : all;
    if (!list.length) return `<p class="empty-note">${all.length ? 'No recipe with that name.' : 'No recipes yet. Add them in Recipes.'}</p>`;
    return list.map((r) => `<button type="button" class="pick${r.id === curId ? ' cur' : ''}" data-pick="${r.id}"><span>${esc(r.title)}</span>${r.veg ? VEG : r.time ? `<small>${esc(r.time)}</small>` : ''}</button>`).join('')
      + (often.length ? `<button type="button" class="pick pick-all" data-allpicks>All ${all.length} recipes<span aria-hidden="true">›</span></button>` : '');
  }

  const PLACEHOLDER = { breakfast: 'Overnight oats, toast', lunch: 'Leftovers, a sandwich', dinner: 'Leftovers, dinner at friends' };
  const otherOf = (who) => L.PEOPLE.find((p) => p !== who);

  // The sheet for one meal of the person whose plan is on screen; the meal row switches meals.
  // Dinner only, unless asked: the meal row shows once breakfast or lunch is planned that day,
  // the sheet is for one of them, or "Breakfast or lunch" is tapped.
  function daySheetHtml(day, meal, meals) {
    const who = ui.who;
    const showMeals = meals || meal !== 'dinner' || L.MEALS.some((m) => m !== 'dinner' && dayRec(L.mealId(day, who, m)));
    const id = L.mealId(day, who, meal);
    const rec = dayRec(id);
    const date = L.dateOfDayId(day);
    const r = rec && rec.kind === 'recipe' ? recipe(rec.recipeId) : null;
    const servings = (rec && rec.servings) || (r && r.servings) || (L.isPizzaNight(rec) ? dough().count : meal === 'dinner' ? 2 : 1);
    const many = recipes().length;
    const other = otherOf(who);
    const html = sheetHead(`${L.PERSON_NAME[who]}, ${L.dayName(date)}`, L.dayMonth(date))
      + (showMeals ? `<div class="seg meals" role="radiogroup" aria-label="Meal">${L.MEALS.map((m) => `<button type="button" role="radio" data-meal="${m}" aria-checked="${m === meal}">${L.MEAL_NAME[m]}${m !== meal && dayRec(L.mealId(day, who, m)) ? '<span class="dot" aria-label=", planned"></span>' : ''}</button>`).join('')}</div>` : '')
      + `<div class="set-row"><span id="srvLabel">${L.isPizzaNight(rec) ? 'Pizzas' : 'Servings'}</span><div class="stepper"><button type="button" data-srv="-1" aria-label="Fewer">−</button><span id="srvVal">${servings}</span><button type="button" data-srv="1" aria-label="More">+</button></div></div>`
      + '<span class="label">Write it</span>'
      + `<form class="write" id="writeForm" autocomplete="off"><label class="sr" for="writeInput">${L.MEAL_NAME[meal]}</label><input id="writeInput" maxlength="200" enterkeyhint="done" placeholder="${PLACEHOLDER[meal]}" value="${rec && rec.kind === 'text' && !L.isPizzaText(rec.text) ? esc(rec.text) : ''}"><button type="submit" class="btn btn-red">Save</button></form>`
      // Pizza night is a dinner they plan most weeks: one tap, above the recipes.
      + (meal === 'dinner' ? '<button type="button" class="btn btn-soft btn-mid quick" data-act="pizza">Pizza night</button>' : '')
      + '<span class="label">Or pick a recipe</span>'
      + (many > 6 ? '<label class="sr" for="pickFind">Find a recipe</label><input id="pickFind" class="find" type="search" placeholder="Find a recipe" autocomplete="off">' : '')
      + `<div class="card picks" id="picks">${pickListHtml(r && r.id)}</div>`
      + (rec ? '<div class="sheet-actions">'
        + `<button type="button" class="btn btn-line" data-act="copy">Same for ${L.PERSON_NAME[other]}</button>`
        + `<button type="button" class="btn btn-line" data-act="clear">Clear ${meal}</button>`
        + '</div>' : '')
      + (showMeals ? '' : '<button type="button" class="quiet" data-act="meals">Breakfast or lunch</button>');
    return { html, state: { kind: 'day', day, meal, id, servings, touched: false, meals: showMeals } };
  }

  function openDaySheet(day, meal = 'dinner') {
    const v = daySheetHtml(day, meal);
    openSheet(v.state, v.html);
  }

  function switchMeal(meal) {
    const v = daySheetHtml(sheet.day, meal, sheet.meals);
    sheet = v.state;
    $('sheetBody').innerHTML = v.html;
    const b = $('sheetBody').querySelector(`[data-meal="${meal}"]`);
    if (b) b.focus({ preventScroll: true });
  }

  function saveDay(id, fields) {
    const prev = dayRec(id);
    put('day', Object.assign({ id, recipeId: null, text: '', servings: null }, fields));
    return prev;
  }

  function daySheetAction(e) {
    const s = sheet;
    const rec = dayRec(s.id);
    const mealBtn = e.target.closest('[data-meal]');
    if (mealBtn) { if (mealBtn.dataset.meal !== s.meal) switchMeal(mealBtn.dataset.meal); return; }
    const srv = e.target.closest('[data-srv]');
    if (srv) {
      s.servings = Math.min(50, Math.max(1, s.servings + Number(srv.dataset.srv)));
      s.touched = true;
      $('srvVal').textContent = s.servings;
      if (rec) saveDay(s.id, { kind: rec.kind, recipeId: rec.recipeId || null, text: rec.text || '', servings: s.servings });
      return;
    }
    if (e.target.closest('[data-allpicks]')) {
      const first = recipes().length > 5 ? 5 : 0; // the first recipe that was not on show
      $('picks').innerHTML = pickListHtml(rec && rec.recipeId, '', true);
      const b = $('picks').querySelectorAll('.pick')[first];
      if (b) b.focus({ preventScroll: true });
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      saveDay(s.id, { kind: 'recipe', recipeId: pick.dataset.pick, servings: s.servings });
      closeSheet();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'meals') {
      const v = daySheetHtml(s.day, s.meal, true);
      sheet = Object.assign(v.state, { servings: s.servings, touched: s.touched });
      $('sheetBody').innerHTML = v.html;
      const b = $('sheetBody').querySelector('[data-meal="breakfast"]');
      if (b) b.focus({ preventScroll: true });
      return;
    }
    if (act.dataset.act === 'pizza') {
      saveDay(s.id, { kind: 'pizza', servings: s.touched || L.isPizzaNight(rec) ? s.servings : dough().count });
      closeSheet();
    } else if (act.dataset.act === 'copy' && rec) {
      const other = otherOf(ui.who);
      const id = L.mealId(s.day, other, s.meal);
      const prev = saveDay(id, { kind: rec.kind, recipeId: rec.recipeId || null, text: rec.text || '', servings: rec.servings || null });
      closeSheet();
      toast(`Copied to ${L.PERSON_NAME[other]}'s ${s.meal}.`, () => restore('day', id, prev));
    } else if (act.dataset.act === 'clear') {
      const prev = rec;
      const id = s.id;
      drop('day', id);
      closeSheet();
      toast(`Cleared ${L.dayName(L.dateOfDayId(id))}'s ${s.meal}.`, () => restore('day', id, prev));
    }
  }

  function daySheetWrite(e) {
    e.preventDefault();
    const s = sheet;
    const text = L.cleanLine($('writeInput').value, 200);
    if (!text) { $('writeInput').focus(); return; }
    const rec = dayRec(s.id);
    // Just "pizza" is a pizza night: the dough's reminder and the toppings follow it.
    if (L.isPizzaText(text)) saveDay(s.id, { kind: 'pizza', servings: s.touched || L.isPizzaNight(rec) ? s.servings : dough().count });
    else saveDay(s.id, { kind: 'text', text, servings: s.touched || (rec && rec.servings) ? s.servings : null });
    closeSheet();
  }

  /* Plan it: choose a day for a recipe. */
  function planSheetHtml() {
    const s = sheet;
    const r = recipe(s.recipeId);
    const week = weekAt(s.offset);
    const t = today();
    const whoList = ['both', ...L.PEOPLE];
    const shown = s.who === 'both' ? ui.who : s.who; // whose plan the free or taken days show
    return sheetHead('Plan it', r ? r.title : '')
      + `<div class="seg" role="radiogroup" aria-label="For">${whoList.map((w) => `<button type="button" role="radio" data-pwho="${w}" aria-checked="${w === s.who}">${w === 'both' ? 'Both' : L.PERSON_NAME[w]}</button>`).join('')}</div>`
      + (s.meals || s.meal !== 'dinner' ? `<div class="seg meals" role="radiogroup" aria-label="Meal">${L.MEALS.map((m) => `<button type="button" role="radio" data-pmeal="${m}" aria-checked="${m === s.meal}">${L.MEAL_NAME[m]}</button>`).join('')}</div>` : '')
      + `<div class="head"><span class="label">Week ${weekNum(week)}, ${esc(L.weekRange(week))}</span><div class="arrows"><button type="button" class="round" data-pweek="-1" aria-label="Previous week">‹</button><button type="button" class="round" data-pweek="1" aria-label="Next week">›</button></div></div>`
      + '<div class="card">' + L.weekDays(week).map((d) => {
        const v = dayView(L.mealId(d.id, shown, s.meal));
        return `<button type="button" class="planday${d.date === t ? ' today' : ''}" data-plan="${d.id}"><span class="day-when"><b>${d.short}</b><span>${d.dayNum}</span></span><span class="now${v.cls === 'empty' ? ' empty' : ''}">${esc(v.cls === 'empty' ? 'Free' : v.title)}</span></button>`;
      }).join('') + '</div>'
      + (s.meals || s.meal !== 'dinner' ? '' : '<button type="button" class="quiet" data-pmeals>Breakfast or lunch</button>');
  }

  function openPlanSheet(recipeId, servings) {
    openSheet({ kind: 'plan', recipeId, servings, offset: weekOffset, who: 'both', meal: 'dinner' }, '');
    $('sheetBody').innerHTML = planSheetHtml();
  }

  function planSheetAction(e) {
    const s = sheet;
    const pw = e.target.closest('[data-pweek]');
    if (pw) {
      s.offset += Number(pw.dataset.pweek);
      $('sheetBody').innerHTML = planSheetHtml();
      return;
    }
    if (e.target.closest('[data-pmeals]')) {
      s.meals = true;
      $('sheetBody').innerHTML = planSheetHtml();
      return;
    }
    const pick = e.target.closest('[data-pwho], [data-pmeal]');
    if (pick) {
      if (pick.dataset.pwho) s.who = pick.dataset.pwho;
      else s.meal = pick.dataset.pmeal;
      $('sheetBody').innerHTML = planSheetHtml();
      return;
    }
    const pd = e.target.closest('[data-plan]');
    if (!pd) return;
    const day = pd.dataset.plan;
    closeSheet();
    planFor(day, s.who === 'both' ? L.PEOPLE : [s.who], s.meal, { kind: 'recipe', recipeId: s.recipeId, servings: s.servings },
      `Planned for ${L.longDate(L.dateOfDayId(day))}.`);
  }

  // Put the same meal in one or both plans, with one Undo for all of it.
  function planFor(day, people, meal, fields, said) {
    const prev = people.map((p) => [L.mealId(day, p, meal), dayRec(L.mealId(day, p, meal))]);
    enqueue(prev.map(([id]) => upsertOp('day', Object.assign({ id, recipeId: null, text: '', servings: null }, fields))));
    toast(said, () => enqueue(prev.map(([id, was]) => was ? upsertOp('day', was) : deleteOp('day', id))));
  }

  /* ---------- Shopping ---------- */
  const andList = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

  // To buy lines carry the dish they are for; Check you have lines carry "Always have" instead
  // (a staple stops being listed every week), away from the tick on the lines bought every week.
  function shopLineHtml(l, withDishes) {
    const dishes = withDishes && l.dishes.length ? `<small class="sfor">${esc(l.dishes.join(' · '))}</small>` : '';
    return `<div class="srow"><button type="button" class="stick" role="checkbox" aria-checked="${l.on}" data-tick="${esc(l.key)}"><span class="box">${l.on ? '✓' : ''}</span><span class="sname">${esc(l.name)}${dishes}</span><span class="sqty">${esc(l.qty)}</span></button>`
      + (l.extraId
        ? `<button type="button" class="sdel" data-delx="${l.extraId}" aria-label="Remove ${esc(l.name)}">×</button>`
        : withDishes ? ''
        : `<button type="button" class="always" data-staple="${esc(l.key)}" data-name="${esc(l.name)}" aria-label="Always have ${esc(l.name)}: stop listing it">Always have</button>`)
      + '</div>';
  }
  const aislesHtml = (groups, withDishes) => groups.map((g) => `<div class="aisle"><span class="label">${esc(g.name)}</span>`
    + g.lines.map((l) => shopLineHtml(l, withDishes)).join('') + '</div>').join('');
  const countLeft = (groups) => groups.reduce((n, g) => n + g.lines.filter((l) => !l.on).length, 0);

  // To buy on top, with the dish each item is for; Check you have folded below it (rice, tins,
  // spices: look at home first); the staples last, by name only, each with Put back.
  function renderShop() {
    const week = weekAt(weekOffset);
    const list = L.shoppingList(week, db);
    $('shopWeek').textContent = 'Week ' + weekNum(week) + (weekOffset === 1 ? ', next week' : weekOffset === -1 ? ', last week' : '');
    const said = list.total ? (list.toBuy ? list.toBuy + ' to buy' : 'All bought') : '';
    $('shopLeft').textContent = said;
    $('shopLeftWide').textContent = said || 'Week ' + weekNum(week);
    $('untickAll').hidden = list.left === list.total;
    if (!list.total && !list.staples.length) {
      $('shopList').innerHTML = '<p class="empty-note">Nothing to buy yet. Plan a recipe in the week, or add an item above.</p>';
      return;
    }
    const sum = list.dishes.length
      ? `<p class="shop-sum"><span class="sum-n">${plural(list.dinners, 'dinner', 'dinners')} planned</span>For ${andList(list.dishes.map((d) => `<b>${esc(d)}</b>`))}.</p>`
      : '';
    const buyLeft = countLeft(list.buy);
    const checkLeft = countLeft(list.check);
    const buy = list.buy.length
      ? `<section class="sec"><h2 class="sec-h">To buy<span class="sec-n">${buyLeft || 'Done'}</span></h2>${aislesHtml(list.buy, true)}</section>`
      : '';
    const staples = list.staples.length
      ? `<div class="staples"><span class="label">Always in the house</span>${list.staples.map((x) => `<div class="staple"><span>${esc(x.name)}</span><button type="button" class="quiet" data-unstaple="${esc(x.key)}" data-name="${esc(x.name)}">Put back</button></div>`).join('')}</div>`
      : '';
    const check = list.check.length || staples
      ? `<details class="sec sec-check" id="checkSec"${ui.checkOpen ? ' open' : ''}><summary class="sec-h">Check you have<span class="sec-n">${list.check.length ? checkLeft || 'Done' : ''}</span></summary>`
        + (list.check.length ? '<p class="sec-note">Rice, tins, spices and sauces. Tick what is already at home; Always have stops listing it every week.</p>' : '')
        + aislesHtml(list.check, false) + staples + '</details>'
      : '';
    $('shopList').innerHTML = sum + buy + check;
  }

  function tick(key) {
    const week = weekAt(weekOffset);
    const id = week + '|' + key;
    const cur = db[keyOf('tick', id)];
    put('tick', { id, on: !(cur && cur.on) });
  }

  function untickAll() {
    const week = weekAt(weekOffset);
    const list = L.shoppingList(week, db);
    const ops = [];
    for (const g of list.groups) for (const l of g.lines) if (l.on) ops.push(upsertOp('tick', { id: week + '|' + l.key, on: false }));
    if (ops.length) enqueue(ops);
  }

  function addExtra(e) {
    e.preventDefault();
    const input = $('addInput');
    const text = L.cleanLine(input.value, 200);
    if (!text) return;
    put('extra', { id: newId(), week: weekAt(weekOffset), text, qty: '', aisle: L.guessAisle(text) });
    input.value = '';
    input.focus();
  }

  // In the house as a rule: off the list in every week, until put back.
  function setStaple(key, name, on) {
    const prev = db[keyOf('staple', key)];
    put('staple', { id: key, on });
    toast(on ? `${name} is under Always in the house.` : `${name} is back on the list.`, () => restore('staple', key, prev));
  }

  function removeExtra(id) {
    const prev = db[keyOf('extra', id)];
    if (!prev) return;
    drop('extra', id);
    toast(`Removed ${prev.text}.`, () => restore('extra', id, prev));
  }

  /* ---------- Recipes ---------- */
  let openRecipe = null; // id of the recipe on screen
  let openServings = 0;
  let confirmDelete = false;
  let editing = undefined; // undefined: no form; null: a new recipe; id: editing that one
  // A recipe opened from the Week tab: { day, meal, recipeId }. Back goes to the week, Change to its sheet.
  let fromDay = null;
  let weekY = 0;
  const dayRecipeOpen = () => !!fromDay && openRecipe === fromDay.recipeId;

  function openDayRecipe(day, meal, rec) {
    weekY = window.scrollY;
    fromDay = { day, meal, recipeId: rec.recipeId };
    openRecipe = rec.recipeId;
    openServings = rec.servings || 0;
    confirmDelete = false;
    renderRecipes();
    recipeScreen('view');
    setTab('recipes');
  }

  function backToWeek() {
    fromDay = null;
    openRecipe = null;
    recipeScreen('home');
    setTab('week');
    window.scrollTo(0, weekY);
  }

  // Leaving the list keeps its place, so Back comes to the same spot in the book.
  let listY = 0;
  function recipeScreen(which) {
    if (!$('recipesHome').hidden && which !== 'home') listY = window.scrollY;
    $('recipesHome').hidden = which !== 'home';
    $('recipeView').hidden = which !== 'view';
    $('recipeForm').hidden = which !== 'form';
    // Back on the list at the same spot: the index keeps the letter it had, not a fresh guess.
    if (which === 'home') holdSpy = Date.now() + 300;
    window.scrollTo(0, which === 'home' ? listY : 0);
  }

  // The list is an index you scroll through: each letter over its own card of recipes, one
  // after another, with a thumb index down the right edge. Tap or drag the index to jump to a letter; the index
  // follows along as you scroll. Searching shows every match on one page.
  const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
  const COUNT_WORDS = ['no recipes', 'one recipe', 'two recipes', 'three recipes', 'four recipes', 'five recipes', 'six recipes', 'seven recipes', 'eight recipes', 'nine recipes', 'ten recipes'];
  const LEAF = '<svg class="leaf" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19C5 11 10 6 19 5c-1 9-6 14-14 14z"/><path d="M5 19l8-8"/></svg><span class="sr">, vegetarian</span>';
  let bookAt = null; // the letter whose section is at the top of the screen
  let holdSpy = 0; // while a jump scrolls, the index keeps the letter jumped to
  // What was last written, since the browser reads markup back in its own spelling.
  let drawnPages = '';
  let drawnThumbs = '';

  const countWords = (n) => COUNT_WORDS[n] || n + ' recipes';
  const letterName = (x) => (x === '#' ? 'Other' : x);
  const pageId = (x) => 'page-' + (x === '#' ? 'num' : x);
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Accents fold to their letter (Ñ is N); a title that starts with a digit goes on the # page.
  function letterOf(title) {
    const c = title.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase();
    return LETTERS.includes(c) ? c : '#';
  }
  function bookOf(all) {
    const by = {};
    for (const r of all) (by[letterOf(r.title)] ||= []).push(r);
    return { by, used: LETTERS.filter((x) => by[x]) };
  }
  // That letter, or the next one that has recipes, or the last one.
  function landOn(x, used) {
    if (used.includes(x)) return x;
    const i = LETTERS.indexOf(x);
    return used.find((u) => LETTERS.indexOf(u) > i) || used[used.length - 1];
  }

  function entryHtml(r) {
    return `<button type="button" class="entry" data-recipe="${r.id}"><span class="e-title">${esc(r.title)}${r.veg ? LEAF : ''}</span>`
      + (r.time ? `<span class="e-time">${esc(r.time)}</span>` : '')
      + '</button>';
  }

  function pageHtml(x, book) {
    const list = book.by[x];
    return `<section class="idx" id="${pageId(x)}" data-letter="${x}">`
      + `<h2 class="idx-letter"><span aria-hidden="true">${x}</span><span class="sr">${letterName(x)}, ${countWords(list.length)}</span></h2>`
      + `<div class="card">${list.map(entryHtml).join('')}</div>`
      + '</section>';
  }

  function drawThumbs(book) {
    const html = LETTERS.filter((x) => x !== '#' || book.by['#']).map((x) => (book.by[x]
      ? `<button type="button" class="thumb" data-letter="${x}" aria-label="${letterName(x)}, ${countWords(book.by[x].length)}">${x}</button>`
      : `<span class="thumb empty" data-letter="${x}" aria-hidden="true">${x}</span>`)).join('');
    // Sync redraws every few seconds: leave the index alone when nothing changed, and keep
    // the focus on its letter when it is drawn anew.
    const box = $('thumbs');
    if (drawnThumbs !== html) {
      drawnThumbs = html;
      const had = box.contains(document.activeElement) ? document.activeElement.dataset.letter : null;
      box.innerHTML = html;
      const again = had && box.querySelector(`button[data-letter="${had}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    markThumb();
  }
  function markThumb() {
    for (const t of $('thumbs').children) {
      const on = t.dataset.letter === bookAt;
      t.classList.toggle('on', on);
      if (t.tagName !== 'BUTTON') continue;
      if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    }
  }

  function drawBook(all) {
    const book = bookOf(all);
    const html = book.used.map((x) => pageHtml(x, book)).join('');
    if (drawnPages !== html) { drawnPages = html; $('bookPages').innerHTML = html; }
    bookAt = landOn(bookAt || book.used[0], book.used);
    drawThumbs(book);
    spy();
  }

  // Where a page sits once jumped to: just under the top of the screen, like the index.
  const topGap = () => parseFloat(getComputedStyle($('thumbs')).top) || 10;

  // As the list scrolls, the index marks the letter whose page is at the top of the screen,
  // or the last one once the end of the list is reached.
  function spy() {
    if (Date.now() < holdSpy || openRecipe !== null || $('recipeBook').hidden || $('recipesHome').hidden || !$('v-recipes').classList.contains('on')) return;
    const pages = $('bookPages').children;
    if (!pages.length) return;
    let at = pages[0].dataset.letter;
    // The line a section has to pass to count. Over the last screen of scrolling it slides down
    // to the bottom, so the short sections at the end, which never reach the top, still get
    // their turn, one after another.
    const top = topGap() + 60;
    const bottom = innerHeight - document.querySelector('.tabs').offsetHeight - 24;
    const left = document.documentElement.scrollHeight - innerHeight - scrollY;
    const tail = innerHeight * 0.8;
    const line = left < tail ? top + (bottom - top) * (1 - Math.max(0, left) / tail) : top;
    for (const p of pages) {
      if (p.getBoundingClientRect().top > line) break;
      at = p.dataset.letter;
    }
    if (at !== bookAt) { bookAt = at; markThumb(); }
  }

  function jumpTo(x, smooth) {
    const book = bookOf(recipes());
    if (!book.used.length) return;
    x = landOn(x, book.used);
    const el = document.getElementById(pageId(x));
    if (!el) return;
    bookAt = x;
    markThumb();
    const glide = smooth && !calm();
    holdSpy = Date.now() + (glide ? 900 : 150);
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - topGap()), behavior: glide ? 'smooth' : 'auto' });
    $('bookSays').textContent = `${letterName(x)}, ${countWords(book.by[x].length)}`;
  }

  // The thumb index: tap a letter to glide to its page, or drag along it with a bubble
  // showing the letter and the list follows the finger. An empty letter goes to the next one.
  let scrub = null;
  let scrubMoved = false;
  function scrubTo(y) {
    const kids = [...$('thumbs').children];
    if (!kids.length) return;
    const el = kids.find((k) => y < k.getBoundingClientRect().bottom) || kids[kids.length - 1];
    const was = scrub;
    scrub = el.dataset.letter;
    const b = el.getBoundingClientRect();
    const bubble = $('thumbBubble');
    bubble.textContent = scrub;
    bubble.classList.toggle('dim', el.classList.contains('empty'));
    bubble.style.top = Math.round(b.top + b.height / 2 - 32) + 'px';
    bubble.style.left = Math.round(b.left - 76) + 'px';
    bubble.hidden = false;
    if (was !== null && was !== scrub) { scrubMoved = true; jumpTo(scrub, false); }
  }
  function endScrub(jump) {
    if (scrub === null) return;
    const x = scrub;
    scrub = null;
    $('thumbBubble').hidden = true;
    if (jump && !scrubMoved) jumpTo(x, true);
    scrubMoved = false;
  }

  function renderRecipes() {
    const all = recipes();
    $('recipeCount').textContent = all.length ? plural(all.length, 'recipe', 'recipes') : 'Your cookbook';
    const q = $('findRecipe').value.toLowerCase().trim();
    const searching = !!q || !all.length;
    $('recipeBook').hidden = searching;
    $('recipeFound').hidden = !searching;
    if (searching) {
      endScrub(false);
      const hits = all.filter((r) => r.title.toLowerCase().includes(q));
      $('recipeFound').innerHTML = hits.length
        ? `<div class="idx"><p class="label found-n">${plural(hits.length, 'match', 'matches')}</p><div class="card">${hits.map(entryHtml).join('')}</div></div>`
        : `<p class="empty-note">${all.length ? 'No recipes match.' : 'No recipes yet. Tap + to add one.'}</p>`;
    } else {
      $('recipeFound').innerHTML = '';
      drawBook(all);
    }

    if (openRecipe !== null) {
      const r = recipe(openRecipe);
      if (!r) { openRecipe = null; if (editing === undefined) recipeScreen('home'); return; }
      renderRecipeView(r);
    }
  }

  // Each section ("For the marinade") under its own small heading, in the order written.
  const ingsHtml = (r, factor) => L.ingredientGroups(r.ingredients).map((sec) => (sec.group ? `<h3 class="ing-sub">${esc(sec.group)}</h3>` : '')
    + '<ul class="ings">' + sec.items.map((g) => `<li><span class="q">${esc(L.amountText(L.scale(g.qty, factor), g.unit))}</span><span>${esc(g.item)}</span></li>`).join('') + '</ul>').join('');

  function renderRecipeView(r) {
    const n = openServings || r.servings;
    const factor = n / r.servings;
    const ings = ingsHtml(r, factor);
    const steps = r.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('');
    const fd = dayRecipeOpen() ? fromDay : null;
    $('recipeView').innerHTML = '<div class="detail">'
      + (fd
        ? `<div class="day-bar"><button type="button" class="round" data-back aria-label="Back to the week" style="font-size:20px">‹</button><span class="day-bar-what">${esc(L.dayName(L.dateOfDayId(fd.day)))}'s ${fd.meal}</span><button type="button" class="btn btn-line btn-mid" data-change>Change</button></div>`
        : '<button type="button" class="round" data-back aria-label="Back to recipes" style="font-size:20px">‹</button>')
      + '<div class="rcard">'
      + (r.veg ? VEG : '')
      // The name in big letters; what is in its brackets ("Peruvian Beef Stir-Fry") under it.
      + `<h1>${esc(L.shortTitle(r.title))}</h1>${/\((.+?)\)/.test(r.title) ? `<p class="h1-sub">${esc(r.title.match(/\((.+?)\)/)[1])}</p>` : ''}`
      + `<div class="rmeta-row"><div class="stepper"><button type="button" data-rsrv="-1" aria-label="Fewer servings">−</button><span>${n}</span><button type="button" data-rsrv="1" aria-label="More servings">+</button></div><span>servings</span>${r.time ? `<span>${esc(r.time)}</span>` : ''}</div>`
      + (ings ? `<span class="label">Ingredients</span>${ings}` : '')
      + (steps ? `<span class="label">Method</span><ol class="steps">${steps}</ol>` : '')
      + (r.notes ? `<span class="label">Notes</span><p class="notes">${esc(r.notes)}</p>` : '')
      + '</div>'
      + '<div class="actions">'
      + (r.steps.length ? '<button type="button" class="btn btn-ink grow" data-cook>Cook</button>' : '')
      + '<button type="button" class="btn btn-red grow" data-planit>Plan it</button><button type="button" class="btn btn-line" data-edit>Edit</button></div>'
      + (confirmDelete
        ? `<div class="confirm" role="alert"><span>Delete ${esc(r.title)} for good? Days it is planned on keep its name.</span><div class="actions"><button type="button" class="btn btn-red grow" data-delyes>Delete</button><button type="button" class="btn btn-line" data-delno>Keep it</button></div></div>`
        : '<button type="button" class="link-red" data-del>Delete this recipe</button>')
      + '</div>';
  }

  /* ---------- Cook ---------- */
  // The recipe at arm's length: what to get out first, then one step per screen, swiped up.
  // The screen stays awake while it is open (where the browser allows it).
  let cookOpener = null;
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
      else if (!on && wake) { await wake.release(); wake = null; }
    } catch (err) { wake = null; }
  }
  function openCook(r, n) {
    const steps = r.steps;
    const next = (i) => (i < steps.length ? `<p class="cook-next">Next: ${i + 1}. ${esc(steps[i].length > 70 ? steps[i].slice(0, 68).trim() + '…' : steps[i])}</p>` : '');
    $('cook').innerHTML = '<div class="cook-top">'
      + `<button type="button" class="round" data-cookx aria-label="Close">×</button><span class="cook-title" id="cookTitle">${esc(L.shortTitle(r.title))}</span><span class="cook-at" id="cookAt">Get ready</span></div>`
      + '<div class="cook-pages" id="cookPages">'
      + `<section class="cook-page"><span class="label">Get ready · ${plural(n, 'serving', 'servings')}</span>${ingsHtml(r, n / r.servings) || '<p class="cook-text">No ingredients written down.</p>'}${next(0)}</section>`
      + steps.map((t, i) => `<section class="cook-page"><span class="cook-n" aria-hidden="true">${i + 1}</span><p class="cook-text"><span class="sr">Step ${i + 1} of ${steps.length}: </span>${esc(t)}</p>`
        + (i === steps.length - 1 ? '<button type="button" class="btn btn-ink cook-done" data-cookx>Done</button>' : next(i + 1)) + '</section>').join('')
      + '</div>';
    cookOpener = document.activeElement;
    $('cook').hidden = false;
    $('cook').focus({ preventScroll: true });
    keepAwake(true);
  }
  function closeCook() {
    if ($('cook').hidden) return;
    $('cook').hidden = true;
    $('cook').innerHTML = '';
    keepAwake(false);
    if (cookOpener && document.contains(cookOpener)) cookOpener.focus({ preventScroll: true });
  }
  function cookSpot() {
    const box = $('cookPages');
    if (!box) return;
    let at = 0;
    [...box.children].forEach((p, i) => { if (p.offsetTop - box.offsetTop <= box.scrollTop + 20) at = i; });
    const total = box.children.length - 1;
    $('cookAt').textContent = at ? `Step ${at} of ${total}` : 'Get ready';
  }

  function showRecipe(id) {
    openRecipe = id;
    openServings = 0;
    confirmDelete = false;
    renderRecipes();
    recipeScreen('view');
  }

  function recipeViewAction(e) {
    const r = recipe(openRecipe);
    if (!r) return;
    if (e.target.closest('[data-back]')) {
      if (dayRecipeOpen()) backToWeek();
      else { openRecipe = null; recipeScreen('home'); }
      return;
    }
    if (e.target.closest('[data-change]') && dayRecipeOpen()) {
      const { day, meal } = fromDay;
      backToWeek();
      openDaySheet(day, meal);
      return;
    }
    const s = e.target.closest('[data-rsrv]');
    if (s) {
      openServings = Math.min(50, Math.max(1, (openServings || r.servings) + Number(s.dataset.rsrv)));
      renderRecipeView(r);
      return;
    }
    if (e.target.closest('[data-cook]')) { openCook(r, openServings || r.servings); return; }
    if (e.target.closest('[data-planit]')) { openPlanSheet(r.id, openServings || r.servings); return; }
    if (e.target.closest('[data-edit]')) { openForm(r.id); return; }
    if (e.target.closest('[data-del]')) { confirmDelete = true; renderRecipeView(r); return; }
    if (e.target.closest('[data-delno]')) { confirmDelete = false; renderRecipeView(r); return; }
    if (e.target.closest('[data-delyes]')) deleteRecipe(r);
  }

  function deleteRecipe(r) {
    // Days it is planned on keep its name as text, so the week still reads right.
    const ops = [];
    for (const d of Object.values(db)) {
      if (d.type === 'day' && d.kind === 'recipe' && d.recipeId === r.id) {
        ops.push(upsertOp('day', { id: d.id, kind: 'text', recipeId: null, text: r.title.slice(0, 200), servings: d.servings || null }));
      }
    }
    ops.push(deleteOp('recipe', r.id));
    openRecipe = null;
    confirmDelete = false;
    enqueue(ops);
    recipeScreen('home');
    toast(`Deleted ${r.title}.`);
  }

  /* ---------- Recipe form ---------- */
  function ingRow(g) {
    const row = document.createElement('div');
    row.className = 'ing';
    const n = $('fIngredients').querySelectorAll('.ing').length + 1;
    row.innerHTML = `<input class="i-qty" inputmode="decimal" placeholder="2" aria-label="Amount, row ${n}">`
      + `<input class="i-unit" list="units" placeholder="g" maxlength="20" aria-label="Unit, row ${n}" autocapitalize="off">`
      + `<input class="i-item" placeholder="Item" maxlength="120" aria-label="Item, row ${n}">`
      + `<button type="button" class="ing-del" aria-label="Remove row ${n}">×</button>`
      + `<select class="i-aisle" aria-label="Aisle, row ${n}">${L.AISLES.map(([k, name]) => `<option value="${k}">${esc(name)}</option>`).join('')}</select>`;
    row.querySelector('.i-qty').value = g && g.qty != null ? String(Math.round(g.qty * 1000) / 1000) : '';
    row.querySelector('.i-unit').value = (g && g.unit) || '';
    row.querySelector('.i-item').value = (g && g.item) || '';
    row.querySelector('.i-aisle').value = (g && g.aisle) || 'other';
    if (g && g.item) row.dataset.manual = '1';
    $('fIngredients').appendChild(row);
    return row;
  }

  // A section heading in the form: the ingredient rows below it, up to the next heading, are
  // saved with its name as their group. An empty name ends the section above it.
  function secRow(name) {
    const row = document.createElement('div');
    row.className = 'ing-sec';
    row.innerHTML = '<input class="s-name" placeholder="For the marinade" maxlength="60" aria-label="Section name">'
      + '<button type="button" class="ing-del" aria-label="Remove this section heading">×</button>';
    row.querySelector('.s-name').value = name || '';
    $('fIngredients').appendChild(row);
    return row;
  }

  function openForm(id) {
    editing = id || null;
    const r = id ? recipe(id) : null;
    $('formLabel').textContent = r ? 'Edit' : 'New recipe';
    $('formTitle').textContent = r ? r.title : 'Add a recipe';
    $('fTitle').value = r ? r.title : '';
    $('fServings').value = r ? r.servings : 2;
    $('fTime').value = r ? r.time : '';
    $('fVeg').checked = r ? !!r.veg : false;
    $('fSteps').value = r ? r.steps.join('\n') : '';
    $('fNotes').value = r ? r.notes : '';
    $('formError').hidden = true;
    $('fIngredients').innerHTML = '';
    const ings = r && r.ingredients.length ? r.ingredients : [null, null, null];
    let group = '';
    for (const g of ings) {
      const name = (g && g.group) || '';
      if (name !== group) { secRow(name); group = name; }
      ingRow(g);
    }
    recipeScreen('form');
    if (!r) $('fTitle').focus({ preventScroll: true });
  }

  function closeForm() {
    const back = editing;
    editing = undefined;
    if (back && recipe(back)) showRecipe(back);
    else { openRecipe = null; recipeScreen('home'); }
  }

  function formError(msg, focusEl) {
    $('formError').textContent = msg;
    $('formError').hidden = false;
    if (focusEl) focusEl.focus();
  }

  function saveForm(e) {
    e.preventDefault();
    // "seco de pollo" is saved as "Seco de Pollo", as the Worker stores it.
    const typed = L.cleanLine($('fTitle').value, 200);
    const cased = L.titleCase(typed);
    const title = cased.length > 200 ? typed : cased;
    if (!title) return formError('Give it a title.', $('fTitle'));
    const servings = Number($('fServings').value);
    if (!Number.isInteger(servings) || servings < 1 || servings > 50) return formError('Servings is a whole number from 1 to 50.', $('fServings'));
    const ingredients = [];
    // Rows in order: a heading sets the section for the ingredient rows below it.
    let group = '';
    let i = -1;
    for (const row of $('fIngredients').children) {
      if (row.classList.contains('ing-sec')) {
        const name = L.cleanLine(row.querySelector('.s-name').value, 60);
        group = name.charAt(0).toUpperCase() + name.slice(1); // "for the marinade" reads "For the marinade"
        continue;
      }
      i++;
      const qtyEl = row.querySelector('.i-qty');
      const item = L.cleanLine(row.querySelector('.i-item').value, 120);
      const rawQty = qtyEl.value;
      const unit = L.cleanLine(row.querySelector('.i-unit').value, 20);
      if (!item && !rawQty.trim() && !unit) continue;
      if (!item) return formError(`Row ${i + 1} needs an item.`, row.querySelector('.i-item'));
      const qty = L.parseQty(rawQty);
      if (Number.isNaN(qty) || (qty !== null && qty > 100000)) return formError(`The amount on row ${i + 1} is not a number. Try 2, 1.5 or 1/2.`, qtyEl);
      const g = { qty: qty === null ? null : Math.round(qty * 1000) / 1000, unit, item, aisle: row.querySelector('.i-aisle').value };
      if (group) g.group = group;
      ingredients.push(g);
    }
    if (ingredients.length > 80) return formError('At most 80 ingredients.');
    const steps = $('fSteps').value.split(/\r?\n/).map((s) => L.cleanLine(s, 1000)).filter(Boolean);
    if (steps.length > 40) return formError('At most 40 steps. Join a few lines together.', $('fSteps'));
    const notes = $('fNotes').value.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
    const id = editing || newId();
    put('recipe', { id, title, servings, time: L.cleanLine($('fTime').value, 40), veg: $('fVeg').checked, ingredients, steps, notes });
    editing = undefined;
    showRecipe(id);
    toast('Saved.');
  }

  /* ---------- Dough ---------- */
  let tweakOpen = null;

  function setDough(patch) {
    put('dough', Object.assign(dough(), patch));
  }

  function renderDough() {
    const s = dough();
    const d = L.doughCalc(s);
    $('dSize').textContent = s.size + '″';
    $('dCount').textContent = s.count;
    for (const b of document.querySelectorAll('[data-thick]')) b.setAttribute('aria-checked', String(b.dataset.thick === s.thickness));
    $('dGf').checked = !!s.gf;
    $('dBall').textContent = L.ballGrams(d.ball) + ' g';
    $('dFlour').textContent = L.grams(d.flour) + ' g';
    $('dRows').innerHTML = d.rows.map((r) => {
      if (r.key === 'flour') return `<li class="drow"><span>${esc(r.label)}</span><b>${L.grams(r.grams)} g</b><span class="pct fixed">100%</span></li>`;
      const tweaked = Math.abs(r.pct - r.base) > 1e-9;
      let html = `<li class="drow"><span>${esc(r.label)}</span><b>${L.grams(r.grams)} g</b><button type="button" class="pct${tweaked ? ' tweaked' : ''}" data-tweak="${r.key}" aria-expanded="${tweakOpen === r.key}" aria-label="${esc(r.label)}: ${L.pctText(r.pct)}. Change">${L.pctText(r.pct)}</button></li>`;
      if (tweakOpen === r.key) {
        html += `<li class="tweak"><span>Baker's percentage</span><div class="stepper"><button type="button" data-tw="-1" aria-label="Less">−</button><span>${L.pctText(r.pct)}</span><button type="button" data-tw="1" aria-label="More">+</button></div>`
          + (tweaked ? `<button type="button" class="quiet" data-twreset>Back to ${L.pctText(r.base)}</button>` : '<span></span>') + '</li>';
      }
      return html;
    }).join('');
    const t = today();
    const plan = L.pizzaPlan(s.night, s.gf, t);
    $('nTitle').textContent = plan.title;
    $('nBody').textContent = plan.body;
    if (document.activeElement !== $('nDate')) $('nDate').value = s.night || '';
    const usable = !!s.night && s.night >= t;
    $('nWeek').disabled = !usable;
    $('nShop').disabled = !usable;
    $('bakeNote').textContent = L.bakeNote(s.thickness);
    renderToppings(s);
    $('dSteps').innerHTML = (s.gf ? L.STEPS_GF : L.STEPS_NY).map((x, i) => `<li><span class="n">${i + 1}</span><span>${esc(x)}</span></li>`).join('');
  }

  function doughAction(e) {
    const step = e.target.closest('[data-step]');
    const s = dough();
    if (step) {
      const k = step.dataset.step;
      const lim = k === 'size' ? [8, 20] : [1, 12];
      const v = Math.min(lim[1], Math.max(lim[0], s[k] + Number(step.dataset.by)));
      if (v !== s[k]) setDough({ [k]: v });
      return;
    }
    const th = e.target.closest('[data-thick]');
    if (th) { if (th.dataset.thick !== s.thickness) setDough({ thickness: th.dataset.thick }); return; }
    const tw = e.target.closest('[data-tweak]');
    if (tw) { tweakOpen = tweakOpen === tw.dataset.tweak ? null : tw.dataset.tweak; renderDough(); return; }
    const by = e.target.closest('[data-tw]');
    if (by && tweakOpen) {
      const k = tweakOpen;
      const row = L.doughCalc(s).rows.find((r) => r.key === k);
      const [lo, hi] = L.TWEAK_RANGE[k];
      const v = Math.round(Math.min(hi, Math.max(lo, row.pct + Number(by.dataset.tw) * L.TWEAK_STEP[k])) * 100) / 100;
      const tweaks = Object.assign({}, s.tweaks);
      if (Math.abs(v - row.base) < 1e-9) delete tweaks[k]; else tweaks[k] = v;
      setDough({ tweaks });
      return;
    }
    const tk = e.target.closest('[data-topk]');
    if (tk) { if (tk.dataset.topk !== topKind()) { ui.topKind = tk.dataset.topk; saveUi(); renderDough(); } return; }
    const dt = e.target.closest('[data-deltop]');
    if (dt) { removeTopping(Number(dt.dataset.deltop)); return; }
    if (e.target.closest('[data-twreset]') && tweakOpen) {
      const tweaks = Object.assign({}, s.tweaks);
      delete tweaks[tweakOpen];
      setDough({ tweaks });
    }
  }

  // Toppings: one list for pizza nights and one for flammkuchen, on the shopping list every such night.
  const topKind = () => (L.TOPPING_NIGHTS.includes(ui.topKind) ? ui.topKind : 'pizza');
  const toppingsOf = (s) => Object.assign({ pizza: [], flammkuchen: [] }, s.toppings || {});
  function renderToppings(s) {
    const k = topKind();
    for (const b of document.querySelectorAll('[data-topk]')) b.setAttribute('aria-checked', String(b.dataset.topk === k));
    $('topNote').textContent = k === 'pizza' ? 'On the shopping list every pizza night.' : 'On the shopping list every night with Flammkuchen in the week.';
    $('topInput').placeholder = k === 'pizza' ? '250 g mozzarella' : '200 g crème fraîche';
    const list = toppingsOf(s)[k];
    $('topList').innerHTML = list.length
      ? list.map((g, i) => `<div class="trow"><span class="tname">${esc(g.item)}</span><span class="tqty">${esc(L.amountText(g.qty, g.unit))}</span><button type="button" class="sdel" data-deltop="${i}" aria-label="Remove ${esc(g.item)}">×</button></div>`).join('')
      : `<p class="empty-note top-empty">No toppings yet.</p>`;
  }
  function addTopping(e) {
    e.preventDefault();
    const input = $('topInput');
    const p = L.parseItemLine(input.value);
    if (!p.item) return;
    const item = (p.item.charAt(0).toUpperCase() + p.item.slice(1)).slice(0, 120);
    const k = topKind();
    const all = toppingsOf(dough());
    if (all[k].length >= 30) { toast('That is 30 toppings, the most a list can hold.'); return; }
    setDough({ toppings: Object.assign({}, all, { [k]: all[k].concat([{ qty: p.qty === null ? null : Math.round(p.qty * 1000) / 1000, unit: p.unit.slice(0, 20), item, aisle: L.guessAisle(item) }]) }) });
    input.value = '';
    input.focus();
  }
  function removeTopping(i) {
    const k = topKind();
    const all = toppingsOf(dough());
    const g = all[k][i];
    if (!g) return;
    const before = all[k];
    setDough({ toppings: Object.assign({}, all, { [k]: before.filter((_, j) => j !== i) }) });
    toast(`Removed ${g.item}.`, () => setDough({ toppings: Object.assign({}, toppingsOf(dough()), { [k]: before }) }));
  }

  function addNightToWeek() {
    const s = dough();
    if (!s.night) return;
    planFor(L.dayIdOf(s.night), L.PEOPLE, 'dinner', { kind: 'pizza', servings: s.count }, `Pizza night is on ${L.longDate(s.night)}.`);
  }

  function addNightToShopping() {
    const s = dough();
    if (!s.night) return;
    const d = L.doughCalc(s);
    const week = L.isoWeek(s.night).week;
    const want = [
      { text: s.gf ? 'Gluten free flour' : 'Bread flour', qty: L.grams(d.flour) + ' g' },
      { text: 'Active dry yeast', qty: L.grams(d.rows.find((r) => r.key === 'yeast').grams) + ' g' },
    ];
    const extras = Object.values(db).filter((x) => x.type === 'extra' && x.week === week);
    const ops = want.map((w) => {
      const same = extras.find((x) => x.text.toLowerCase() === w.text.toLowerCase());
      return upsertOp('extra', { id: same ? same.id : newId(), week, text: w.text, qty: w.qty, aisle: 'baking' });
    });
    enqueue(ops);
    toast(`Flour and yeast are on the list for week ${weekNum(week)}.`);
  }

  /* ---------- Toast ---------- */
  let toastTimer = 0;
  let undoFn = null;
  function toast(text, undo) {
    $('toastText').textContent = text;
    undoFn = undo || null;
    $('toastUndo').hidden = !undo;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? TOAST_MS + 1500 : TOAST_MS);
  }
  function hideToast() { $('toast').hidden = true; undoFn = null; }

  /* ---------- Render all ---------- */
  function renderAll() {
    renderTabs();
    renderWeek();
    renderShop();
    renderRecipes();
    renderDough();
  }

  /* ---------- Sync ---------- */
  let flushTimer = 0;
  let inflight = false;
  let polling = false;
  let net = 'idle';
  let trouble = false;
  let rejectNote = false;

  function scheduleFlush(ms = DEBOUNCE) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, ms);
    if (!navigator.onLine) setNet('offline');
  }

  const refused = (status, body) => status === 404 || (status === 400 && body && body.error === 'bad code');

  function nextBatch(limit) {
    const out = [];
    let size = 20;
    for (const o of st.queue) {
      const n = JSON.stringify(o).length + 1;
      if (out.length && (out.length >= MAX_BATCH || size + n > limit)) break;
      out.push(o);
      size += n;
    }
    return out;
  }

  async function flush(keepalive = false) {
    clearTimeout(flushTimer);
    if (inflight || !st.queue.length) return;
    if (!navigator.onLine) { setNet('offline'); return; }
    inflight = true;
    const sent = nextBatch(keepalive ? 60000 : MAX_BODY);
    let again = false;
    try {
      const r = await fetch(API + '/api/kitchen/' + code + '/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: sent }),
        keepalive,
      });
      const d = await r.json().catch(() => null);
      if (refused(r.status, d)) return showNoCode();
      if (!r.ok || !d) throw new Error('status ' + r.status);
      const rejected = Array.isArray(d.rejected) ? d.rejected.filter((i) => sent[i]) : [];
      st.queue = st.queue.filter((o) => !sent.some((s) => opKey(s) === opKey(o) && s.item.updatedAt === o.item.updatedAt));
      applyServer(d);
      rejectNote = rejected.length > 0;
      if (rejectNote) setNet('error');
      else if (st.queue.length) again = true;
      else settle();
    } catch (e) {
      setNet(navigator.onLine ? 'error' : 'offline');
    } finally {
      inflight = false;
    }
    if (again) flush();
  }

  // Take the server's copy, unless it is older than the one we have (a late answer).
  function applyServer(d) {
    if (d && Array.isArray(d.items) && !(typeof d.rev === 'number' && d.rev < st.rev)) {
      const m = {};
      for (const i of d.items) m[keyOf(i.type, i.id)] = i;
      st.server = m;
      st.rev = d.rev || 0;
      if (Array.isArray(d.away)) st.away = d.away.filter((x) => typeof x === 'string');
    }
    save();
    computeView();
    // Either one queues its fixes and draws the screen; with nothing to fix, draw it here.
    // When old days were split, the titles wait for the next answer, so it is drawn once.
    if (!splitOldDays() && !fixTitles()) renderAll();
  }

  // Before each had a plan, a day was one dinner for both ('<week>:<day>'). Give each of
  // them that dinner, unless they already planned their own, and remove the old record.
  // A phone still on the old page may write one more; the next sync splits that too.
  function splitOldDays() {
    const ops = [];
    for (const r of Object.values(db)) {
      if (r.type !== 'day' || !L.isOldDayId(r.id)) continue;
      for (const p of L.PEOPLE) {
        const id = L.mealId(r.id, p, 'dinner');
        const mine = dayRec(id);
        if (!mine || (mine.updatedAt || 0) < (r.updatedAt || 0)) {
          ops.push(upsertOp('day', { id, kind: r.kind, recipeId: r.recipeId || null, text: r.text || '', servings: r.servings || null }));
        }
      }
      ops.push(deleteOp('day', r.id));
    }
    if (ops.length) enqueue(ops);
    return ops.length > 0;
  }

  // Titles have capitals on the words that need them ("Seco de Pollo"). A recipe saved before
  // that, or by a phone still on the old page, gets its title fixed here, only from the server's
  // copy and never over a change still waiting to be sent. The fix is stamped just after the
  // server's version, so an edit made meanwhile on the other phone still wins. Each recipe is
  // fixed at most once per visit, so a Worker that stores a title another way can never loop.
  const fixedTitles = new Set();
  function fixTitles() {
    const ops = [];
    const waiting = new Set(st.queue.map(opKey));
    for (const r of Object.values(st.server)) {
      if (r.type !== 'recipe' || fixedTitles.has(r.id) || waiting.has(keyOf('recipe', r.id))) continue;
      const title = L.titleCase(r.title);
      if (!title || title === r.title || title.length > 200) continue;
      fixedTitles.add(r.id);
      ops.push({ op: 'upsert', type: 'recipe', item: Object.assign({}, r, { title, type: 'recipe', updatedAt: (r.updatedAt || 0) + 1 }) });
    }
    if (ops.length) enqueue(ops);
    return ops.length > 0;
  }

  async function poll() {
    if (document.hidden || polling) return;
    if (st.queue.length && !inflight) flush();
    polling = true;
    try {
      const r = await fetch(API + '/api/kitchen/' + code + '?since=' + st.rev, { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (refused(r.status, d)) return showNoCode();
      if (!r.ok || !d) throw new Error('status ' + r.status);
      if (!d.unchanged) applyServer(d);
      else fixTitles(); // the copy here is the server's latest
      if (!st.queue.length) settle();
    } catch (e) {
      setNet(navigator.onLine ? 'error' : 'offline');
    } finally {
      polling = false;
    }
  }

  function settle() {
    if (rejectNote) return;
    if (trouble) setNet('synced');
    else setNet('idle');
  }

  let pillTimer = 0;
  function setNet(s) {
    net = s;
    const pill = $('syncPill');
    clearTimeout(pillTimer);
    pill.classList.toggle('bad', s === 'error');
    if (s === 'offline' || s === 'error') trouble = true;
    if (s === 'offline') {
      const n = st.queue.length;
      pill.textContent = n ? `Offline, ${plural(n, 'change', 'changes')} waiting` : 'Offline';
      pill.hidden = false;
    } else if (s === 'error') {
      pill.textContent = rejectNote ? 'Something did not save. Tap to try again' : 'Not synced yet. Tap to try again';
      pill.hidden = false;
    } else if (s === 'synced') {
      trouble = false;
      pill.textContent = 'Synced';
      pill.hidden = false;
      pillTimer = setTimeout(() => { pill.hidden = true; net = 'idle'; }, 1800);
    } else {
      pill.hidden = true;
    }
  }

  function showNoCode() {
    $('app').hidden = true;
    $('nocode').hidden = false;
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
  });
  $('prevWeek').addEventListener('click', () => { weekOffset--; renderWeek(); renderShop(); });
  $('nextWeek').addEventListener('click', () => { weekOffset++; renderWeek(); renderShop(); });
  $('thisWeek').addEventListener('click', () => { weekOffset = 0; renderWeek(); renderShop(); });
  // The shopping list follows the same week as the Week tab.
  $('shopPrev').addEventListener('click', () => { weekOffset--; renderWeek(); renderShop(); });
  $('shopNext').addEventListener('click', () => { weekOffset++; renderWeek(); renderShop(); });
  $('whoSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-who]');
    if (!b || b.dataset.who === ui.who) return;
    ui.who = b.dataset.who;
    saveUi();
    renderWeek();
  });
  // A meal with a recipe opens the recipe; anything else opens the sheet to plan it.
  $('days').addEventListener('click', (e) => {
    if (e.target.closest('[data-goshop]')) { setTab('shop'); return; }
    const b = e.target.closest('[data-day]');
    if (!b) return;
    const line = e.target.closest('[data-m]');
    const meal = line ? line.dataset.m : 'dinner';
    const rec = dayRec(L.mealId(b.dataset.day, ui.who, meal));
    if (rec && rec.kind === 'recipe' && recipe(rec.recipeId)) openDayRecipe(b.dataset.day, meal, rec);
    else openDaySheet(b.dataset.day, meal);
  });

  $('sheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeSheet(); return; }
    if (!sheet) return;
    if (sheet.kind === 'day') daySheetAction(e);
    else if (sheet.kind === 'plan') planSheetAction(e);
  });
  $('sheet').addEventListener('submit', (e) => {
    if (sheet && sheet.kind === 'day' && e.target.id === 'writeForm') daySheetWrite(e);
  });
  $('sheet').addEventListener('input', (e) => {
    if (e.target.id === 'pickFind' && sheet && sheet.kind === 'day') {
      const rec = dayRec(sheet.id);
      $('picks').innerHTML = pickListHtml(rec && rec.recipeId, e.target.value);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('cook').hidden) { e.preventDefault(); closeCook(); return; }
    if (e.key === 'Escape' && sheet) { e.preventDefault(); closeSheet(); }
  });
  $('cook').addEventListener('click', (e) => { if (e.target.closest('[data-cookx]')) closeCook(); });
  $('cook').addEventListener('scroll', cookSpot, true);
  // The lock lapses when the phone locks or the app goes to the background; take it again.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('cook').hidden) keepAwake(true); });

  $('addForm').addEventListener('submit', addExtra);
  $('shopList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delx]');
    if (del) { removeExtra(del.dataset.delx); return; }
    const st1 = e.target.closest('[data-staple]');
    if (st1) { setStaple(st1.dataset.staple, st1.dataset.name, true); return; }
    const st0 = e.target.closest('[data-unstaple]');
    if (st0) { setStaple(st0.dataset.unstaple, st0.dataset.name, false); return; }
    const t = e.target.closest('[data-tick]');
    if (t) tick(t.dataset.tick);
  });
  $('untickAll').addEventListener('click', untickAll);
  // The list is drawn anew on every sync, so Check you have remembers whether it is open.
  $('shopList').addEventListener('toggle', (e) => {
    if (e.target.id !== 'checkSec') return;
    ui.checkOpen = e.target.open;
    saveUi();
  }, true);

  $('findRecipe').addEventListener('input', renderRecipes);
  for (const id of ['bookPages', 'recipeFound']) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('[data-recipe]');
      if (b) showRecipe(b.dataset.recipe);
    });
  }
  let spying = false;
  window.addEventListener('scroll', () => {
    if (spying) return;
    spying = true;
    requestAnimationFrame(() => { spying = false; spy(); });
  }, { passive: true });
  const thumbs = $('thumbs');
  thumbs.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault(); // no text selection or focus ring while dragging
    thumbs.setPointerCapture(e.pointerId);
    scrubMoved = false;
    scrubTo(e.clientY);
  });
  thumbs.addEventListener('pointermove', (e) => { if (scrub !== null) scrubTo(e.clientY); });
  thumbs.addEventListener('pointerup', () => endScrub(true));
  thumbs.addEventListener('pointercancel', () => endScrub(false));
  thumbs.addEventListener('click', (e) => { // the keyboard; a tap has already jumped on pointerup
    const b = e.target.closest('button[data-letter]');
    if (b && e.detail === 0) jumpTo(b.dataset.letter, true);
  });
  $('recipeView').addEventListener('click', recipeViewAction);
  $('newRecipe').addEventListener('click', () => openForm(null));
  $('cancelForm').addEventListener('click', closeForm);
  $('recipeForm').addEventListener('submit', saveForm);
  // The empty ingredient rows at the end of the form (a new recipe starts with three).
  function emptyTail() {
    const out = [];
    for (let r = $('fIngredients').lastElementChild; r && r.classList.contains('ing'); r = r.previousElementSibling) {
      if ([...r.querySelectorAll('input')].some((x) => x.value.trim())) break;
      out.unshift(r);
    }
    return out;
  }
  // Both use an empty row at the end before making a new one, so no blank rows pile up.
  $('addIng').addEventListener('click', () => (emptyTail()[0] || ingRow(null)).querySelector('.i-qty').focus());
  $('addSec').addEventListener('click', () => {
    const tail = emptyTail();
    const h = secRow('');
    if (tail.length) $('fIngredients').insertBefore(h, tail[0]);
    else ingRow(null);
    h.querySelector('.s-name').focus();
  });
  $('fIngredients').addEventListener('click', (e) => {
    const del = e.target.closest('.ing-del');
    if (del) del.closest('.ing, .ing-sec').remove();
  });
  $('fIngredients').addEventListener('input', (e) => {
    const row = e.target.closest('.ing');
    if (!row) return;
    if (e.target.classList.contains('i-item') && !row.dataset.manual) row.querySelector('.i-aisle').value = L.guessAisle(e.target.value);
  });
  $('fIngredients').addEventListener('change', (e) => {
    if (e.target.classList.contains('i-aisle')) e.target.closest('.ing').dataset.manual = '1';
  });

  $('v-dough').addEventListener('click', doughAction);
  $('dGf').addEventListener('change', (e) => setDough({ gf: e.target.checked }));
  $('nDate').addEventListener('change', (e) => {
    const v = e.target.value;
    setDough({ night: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null });
  });
  $('nWeek').addEventListener('click', addNightToWeek);
  $('nShop').addEventListener('click', addNightToShopping);
  $('topForm').addEventListener('submit', addTopping);

  $('toastUndo').addEventListener('click', () => { const f = undoFn; hideToast(); if (f) f(); });
  $('syncPill').addEventListener('click', () => { rejectNote = false; flush(); poll(); });
  wide.addEventListener('change', renderTabs);

  /* ---------- Life cycle ---------- */
  let pollTimer = 0;
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(pollTimer);
      if (st.queue.length) flush(true); // send before iOS freezes the page
    } else {
      renderAll(); // the day may have changed
      poll();
      startPolling();
    }
  });
  window.addEventListener('online', () => { flush(); poll(); });
  window.addEventListener('offline', () => setNet('offline'));

  computeView();
  if (!splitOldDays()) renderAll();
  if (!navigator.onLine) setNet('offline');
  poll();
  if (st.queue.length) scheduleFlush(300);
  startPolling();

  if ('serviceWorker' in navigator && (!isLocal || params.get('sw') === '1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // On the first visit the page is not yet controlled, so the service worker never saw
    // the Google Fonts requests. Hand it the URLs the page loaded, to keep them offline.
    Promise.all([navigator.serviceWorker.ready, document.fonts ? document.fonts.ready : null]).then(([reg]) => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name)
        .filter((u) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
      const sw = reg.active || navigator.serviceWorker.controller;
      if (sw && urls.length) sw.postMessage({ type: 'cache-fonts', urls });
    }).catch(() => {});
  }
})();
