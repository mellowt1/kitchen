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
  const ui = Object.assign({ tab: 'week', vegOnly: false }, store.get('kitchen.ui') || {});
  const saveUi = () => store.set('kitchen.ui', ui);
  const saved = store.get(KEY);
  const st = saved && typeof saved === 'object'
    ? { server: saved.server || {}, rev: saved.rev || 0, queue: Array.isArray(saved.queue) ? saved.queue : [] }
    : { server: {}, rev: 0, queue: [] };
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
      if (r.type === 'day' && r.kind === 'pizza') {
        const date = L.dateOfDayId(r.id);
        if (date >= t) out.add(date);
      }
    }
    return [...out];
  }

  /* ---------- Rendering helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VEG = '<span class="pillv">Vegetarian</span>';

  function dayView(id) {
    const rec = dayRec(id);
    if (!rec) return { title: 'Add dinner', cls: 'empty', side: '' };
    if (rec.kind === 'pizza') {
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
    ui.tab = t;
    saveUi();
    renderTabs();
    window.scrollTo(0, 0);
  }

  /* ---------- Week ---------- */
  function renderWeek() {
    const week = weekAt(weekOffset);
    const t = today();
    $('weekLabel').innerHTML = `Week ${weekNum(week)}<span class="only-wide">, ${esc(L.weekRange(week))}</span>`;
    $('weekTitle').textContent = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : L.weekRange(week);
    $('thisWeek').hidden = weekOffset === 0;
    $('days').innerHTML = L.weekDays(week).map((d) => {
      const v = dayView(d.id);
      const isToday = d.date === t;
      return `<button type="button" class="day${isToday ? ' today' : ''}" data-day="${d.id}"${isToday ? ' aria-current="date"' : ''} aria-label="${esc(d.name + ' ' + d.dayNum + ': ' + v.title)}">`
        + `<span class="day-when"><b>${d.short}</b><span>${d.dayNum}</span></span>`
        + `<span class="day-what"><span class="day-title${v.cls ? ' ' + v.cls : ''}">${esc(v.title)}</span>${v.veg ? VEG : ''}</span>`
        + `<span class="day-side"><span class="srv">${esc(v.side)}</span>${v.veg ? VEG : ''}</span>`
        + '</button>';
    }).join('');
    const due = L.mixDueToday(pizzaNights(), dough().gf, t);
    $('mixBanner').hidden = !due;
    if (due) $('mixText').innerHTML = `<b>Mix the dough today</b> for ${esc(L.dayName(due))}'s pizza night.`;
  }

  /* ---------- Sheet ---------- */
  let sheet = null; // { kind, ... }
  let sheetOpener = null;

  function openSheet(state, html) {
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

  const sheetHead = (label, title) => `<div class="sheet-head"><div class="titles"><span class="label">${esc(label)}</span><h2 id="sheetTitle">${esc(title)}</h2></div><button type="button" class="round" data-close aria-label="Close">×</button></div>`;

  function pickListHtml(curId, q) {
    const all = recipes();
    const f = String(q || '').toLowerCase().trim();
    const list = f ? all.filter((r) => r.title.toLowerCase().includes(f)) : all;
    if (!list.length) return `<p class="empty-note">${all.length ? 'No recipe with that name.' : 'No recipes yet. Add them in Recipes.'}</p>`;
    return list.map((r) => `<button type="button" class="pick${r.id === curId ? ' cur' : ''}" data-pick="${r.id}"><span>${esc(r.title)}</span>${r.veg ? VEG : r.time ? `<small>${esc(r.time)}</small>` : ''}</button>`).join('');
  }

  function openDaySheet(id) {
    const rec = dayRec(id);
    const date = L.dateOfDayId(id);
    const r = rec && rec.kind === 'recipe' ? recipe(rec.recipeId) : null;
    const servings = (rec && rec.servings) || (r && r.servings) || (rec && rec.kind === 'pizza' ? dough().count : 2);
    const many = recipes().length;
    const html = sheetHead(L.dayName(date), L.dayMonth(date))
      + `<div class="set-row"><span id="srvLabel">${rec && rec.kind === 'pizza' ? 'Pizzas' : 'Servings'}</span><div class="stepper"><button type="button" data-srv="-1" aria-label="Fewer">−</button><span id="srvVal">${servings}</span><button type="button" data-srv="1" aria-label="More">+</button></div></div>`
      + '<span class="label">Write it</span>'
      + `<form class="write" id="writeForm" autocomplete="off"><label class="sr" for="writeInput">Dinner</label><input id="writeInput" maxlength="200" enterkeyhint="done" placeholder="Leftovers, dinner at friends" value="${rec && rec.kind === 'text' ? esc(rec.text) : ''}"><button type="submit" class="btn btn-red">Save</button></form>`
      + '<span class="label">Or pick a recipe</span>'
      + (many > 6 ? '<label class="sr" for="pickFind">Find a recipe</label><input id="pickFind" class="find" type="search" placeholder="Find a recipe" autocomplete="off">' : '')
      + `<div class="card picks" id="picks">${pickListHtml(r && r.id)}</div>`
      + `<div class="sheet-actions"><button type="button" class="btn btn-soft" data-act="pizza">Pizza night</button>${rec ? '<button type="button" class="btn btn-line" data-act="clear">Clear the day</button>' : ''}</div>`;
    openSheet({ kind: 'day', id, servings, touched: false }, html);
  }

  function saveDay(id, fields) {
    const prev = dayRec(id);
    put('day', Object.assign({ id, recipeId: null, text: '', servings: null }, fields));
    return prev;
  }

  function daySheetAction(e) {
    const s = sheet;
    const rec = dayRec(s.id);
    const srv = e.target.closest('[data-srv]');
    if (srv) {
      s.servings = Math.min(50, Math.max(1, s.servings + Number(srv.dataset.srv)));
      s.touched = true;
      $('srvVal').textContent = s.servings;
      if (rec) saveDay(s.id, { kind: rec.kind, recipeId: rec.recipeId || null, text: rec.text || '', servings: s.servings });
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
    if (act.dataset.act === 'pizza') {
      saveDay(s.id, { kind: 'pizza', servings: s.touched || (rec && rec.kind === 'pizza') ? s.servings : dough().count });
      closeSheet();
    } else if (act.dataset.act === 'clear') {
      const prev = rec;
      const id = s.id;
      drop('day', id);
      closeSheet();
      toast(`Cleared ${L.dayName(L.dateOfDayId(id))}.`, () => restore('day', id, prev));
    }
  }

  function daySheetWrite(e) {
    e.preventDefault();
    const s = sheet;
    const text = L.cleanLine($('writeInput').value, 200);
    if (!text) { $('writeInput').focus(); return; }
    const rec = dayRec(s.id);
    saveDay(s.id, { kind: 'text', text, servings: s.touched || (rec && rec.servings) ? s.servings : null });
    closeSheet();
  }

  /* Plan it: choose a day for a recipe. */
  function planSheetHtml() {
    const s = sheet;
    const r = recipe(s.recipeId);
    const week = weekAt(s.offset);
    const t = today();
    return sheetHead('Plan it', r ? r.title : '')
      + `<div class="head"><span class="label">Week ${weekNum(week)}, ${esc(L.weekRange(week))}</span><div class="arrows"><button type="button" class="round" data-pweek="-1" aria-label="Previous week">‹</button><button type="button" class="round" data-pweek="1" aria-label="Next week">›</button></div></div>`
      + '<div class="card">' + L.weekDays(week).map((d) => {
        const v = dayView(d.id);
        return `<button type="button" class="planday${d.date === t ? ' today' : ''}" data-plan="${d.id}"><span class="day-when"><b>${d.short}</b><span>${d.dayNum}</span></span><span class="now${v.cls === 'empty' ? ' empty' : ''}">${esc(v.cls === 'empty' ? 'Free' : v.title)}</span></button>`;
      }).join('') + '</div>';
  }

  function openPlanSheet(recipeId, servings) {
    openSheet({ kind: 'plan', recipeId, servings, offset: weekOffset }, '');
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
    const pd = e.target.closest('[data-plan]');
    if (!pd) return;
    const id = pd.dataset.plan;
    const prev = saveDay(id, { kind: 'recipe', recipeId: s.recipeId, servings: s.servings });
    closeSheet();
    toast(`Planned for ${L.longDate(L.dateOfDayId(id))}.`, () => restore('day', id, prev));
  }

  /* ---------- Shopping ---------- */
  function renderShop() {
    const week = weekAt(weekOffset);
    const list = L.shoppingList(week, db);
    $('shopWeek').textContent = 'Week ' + weekNum(week);
    $('shopLeft').textContent = list.total ? list.left + ' left' : '';
    $('shopLeftWide').textContent = list.total ? list.left + ' left' : 'Week ' + weekNum(week);
    $('untickAll').hidden = list.left === list.total;
    if (!list.total) {
      $('shopList').innerHTML = '<p class="empty-note">Nothing to buy yet. Plan a recipe in the week, or add an item above.</p>';
      return;
    }
    $('shopList').innerHTML = list.groups.map((g) => `<div class="aisle"><span class="label">${esc(g.name)}</span>`
      + g.lines.map((l) => `<div class="srow"><button type="button" class="stick" role="checkbox" aria-checked="${l.on}" data-tick="${esc(l.key)}"><span class="box">${l.on ? '✓' : ''}</span><span class="sname">${esc(l.name)}</span><span class="sqty">${esc(l.qty)}</span></button>`
        + (l.extraId ? `<button type="button" class="sdel" data-delx="${l.extraId}" aria-label="Remove ${esc(l.name)}">×</button>` : '') + '</div>').join('')
      + '</div>').join('');
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

  function recipeScreen(which) {
    $('recipesHome').hidden = which !== 'home';
    $('recipeView').hidden = which !== 'view';
    $('recipeForm').hidden = which !== 'form';
    window.scrollTo(0, 0);
  }

  function renderRecipes() {
    const all = recipes();
    $('recipeCount').textContent = all.length ? plural(all.length, 'recipe', 'recipes') : 'Your cookbook';
    $('vegOnly').setAttribute('aria-pressed', String(!!ui.vegOnly));
    const q = $('findRecipe').value.toLowerCase().trim();
    const list = all.filter((r) => (!ui.vegOnly || r.veg) && (!q || r.title.toLowerCase().includes(q)));
    $('recipeList').innerHTML = list.length
      ? list.map((r) => {
        const meta = [r.time, 'serves ' + r.servings].filter(Boolean).join(', ');
        return `<button type="button" class="rrow" data-recipe="${r.id}"><span class="rtitle">${esc(r.title)}</span><span class="rmeta">${esc(meta)}</span>${r.veg ? VEG : ''}</button>`;
      }).join('')
      : `<p class="empty-note" style="padding:16px">${all.length ? 'No recipes match.' : 'No recipes yet. Tap Add a recipe to type one in.'}</p>`;

    if (openRecipe !== null) {
      const r = recipe(openRecipe);
      if (!r) { openRecipe = null; if (editing === undefined) recipeScreen('home'); return; }
      renderRecipeView(r);
    }
  }

  function renderRecipeView(r) {
    const n = openServings || r.servings;
    const factor = n / r.servings;
    const ings = r.ingredients.map((g) => `<li><span class="q">${esc(L.amountText(L.scale(g.qty, factor), g.unit))}</span><span>${esc(g.item)}</span></li>`).join('');
    const steps = r.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('');
    $('recipeView').innerHTML = '<div class="detail">'
      + '<button type="button" class="round" data-back aria-label="Back to recipes" style="font-size:20px">‹</button>'
      + '<div class="rcard">'
      + (r.veg ? VEG : '')
      + `<h1>${esc(r.title)}</h1>`
      + `<div class="rmeta-row"><div class="stepper"><button type="button" data-rsrv="-1" aria-label="Fewer servings">−</button><span>${n}</span><button type="button" data-rsrv="1" aria-label="More servings">+</button></div><span>servings</span>${r.time ? `<span>${esc(r.time)}</span>` : ''}</div>`
      + (ings ? `<span class="label">Ingredients</span><ul class="ings">${ings}</ul>` : '')
      + (steps ? `<span class="label">Method</span><ol class="steps">${steps}</ol>` : '')
      + (r.notes ? `<span class="label">Notes</span><p class="notes">${esc(r.notes)}</p>` : '')
      + '</div>'
      + '<div class="actions"><button type="button" class="btn btn-red grow" data-planit>Plan it</button><button type="button" class="btn btn-line" data-edit>Edit</button></div>'
      + (confirmDelete
        ? `<div class="confirm" role="alert"><span>Delete ${esc(r.title)} for good? Days it is planned on keep its name.</span><div class="actions"><button type="button" class="btn btn-red grow" data-delyes>Delete</button><button type="button" class="btn btn-line" data-delno>Keep it</button></div></div>`
        : '<button type="button" class="link-red" data-del>Delete this recipe</button>')
      + '</div>';
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
    if (e.target.closest('[data-back]')) { openRecipe = null; recipeScreen('home'); return; }
    const s = e.target.closest('[data-rsrv]');
    if (s) {
      openServings = Math.min(50, Math.max(1, (openServings || r.servings) + Number(s.dataset.rsrv)));
      renderRecipeView(r);
      return;
    }
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
    const n = $('fIngredients').children.length + 1;
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
    for (const g of ings) ingRow(g);
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
    const title = L.cleanLine($('fTitle').value, 200);
    if (!title) return formError('Give it a title.', $('fTitle'));
    const servings = Number($('fServings').value);
    if (!Number.isInteger(servings) || servings < 1 || servings > 50) return formError('Servings is a whole number from 1 to 50.', $('fServings'));
    const ingredients = [];
    const rows = [...$('fIngredients').children];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const qtyEl = row.querySelector('.i-qty');
      const item = L.cleanLine(row.querySelector('.i-item').value, 120);
      const rawQty = qtyEl.value;
      const unit = L.cleanLine(row.querySelector('.i-unit').value, 20);
      if (!item && !rawQty.trim() && !unit) continue;
      if (!item) return formError(`Row ${i + 1} needs an item.`, row.querySelector('.i-item'));
      const qty = L.parseQty(rawQty);
      if (Number.isNaN(qty) || (qty !== null && qty > 100000)) return formError(`The amount on row ${i + 1} is not a number. Try 2, 1.5 or 1/2.`, qtyEl);
      ingredients.push({ qty: qty === null ? null : Math.round(qty * 1000) / 1000, unit, item, aisle: row.querySelector('.i-aisle').value });
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
    if (e.target.closest('[data-twreset]') && tweakOpen) {
      const tweaks = Object.assign({}, s.tweaks);
      delete tweaks[tweakOpen];
      setDough({ tweaks });
    }
  }

  function addNightToWeek() {
    const s = dough();
    if (!s.night) return;
    const id = L.dayIdOf(s.night);
    const prev = saveDay(id, { kind: 'pizza', servings: s.count });
    toast(`Pizza night is on ${L.longDate(s.night)}.`, () => restore('day', id, prev));
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
    }
    save();
    computeView();
    renderAll();
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
  $('days').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) openDaySheet(b.dataset.day);
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
    if (e.key === 'Escape' && sheet) { e.preventDefault(); closeSheet(); }
  });

  $('addForm').addEventListener('submit', addExtra);
  $('shopList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delx]');
    if (del) { removeExtra(del.dataset.delx); return; }
    const t = e.target.closest('[data-tick]');
    if (t) tick(t.dataset.tick);
  });
  $('untickAll').addEventListener('click', untickAll);

  $('vegOnly').addEventListener('click', () => { ui.vegOnly = !ui.vegOnly; saveUi(); renderRecipes(); });
  $('findRecipe').addEventListener('input', renderRecipes);
  $('recipeList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-recipe]');
    if (b) showRecipe(b.dataset.recipe);
  });
  $('recipeView').addEventListener('click', recipeViewAction);
  $('newRecipe').addEventListener('click', () => openForm(null));
  $('cancelForm').addEventListener('click', closeForm);
  $('recipeForm').addEventListener('submit', saveForm);
  $('addIng').addEventListener('click', () => ingRow(null).querySelector('.i-qty').focus());
  $('fIngredients').addEventListener('click', (e) => {
    const del = e.target.closest('.ing-del');
    if (del) del.closest('.ing').remove();
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
  renderAll();
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
