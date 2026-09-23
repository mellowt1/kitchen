# Kitchen: spec

A shared kitchen app for Paul and his girlfriend: the week's dinners, recipes, a shopping list and Paul's pizza dough calculator. It replaces the "Kitchen Notebook" artifact, which needed a Claude login and lived inside claude.ai. Approved by Paul 23 Sept 2026.

## Who and where
- Paul and his girlfriend, both with the same rights. She has no Claude account and needs none.
- iPhone home screen first, and it also works in a laptop browser.
- English.

## Day one, it must
1. **Plan the week together:** a dinner on each day, picked from recipes or typed freely, and either of them can move it. Changes show on the other phone within about 10 seconds.
2. **Keep one shopping list:** ingredients from the week's recipes, added up and grouped by aisle, plus free items. Tick items off in the shop, even without signal; ticks sync when back online.
3. **Make NY pizza dough right:** the calculator and pizza-night planner from the artifact, tuned for a home oven with a stone or steel.

## It must not
- Need a Claude account, or cost anything to run (GitHub Pages and the Cloudflare free tier only).
- Use paid AI inside the app. Recipes are cleaned up for free: Paul sends a recipe or link to Claude Code, and it is added through an admin route. Either of them can also type a recipe by hand in the app.
- Give access to Paul's to-do list or Morning Screen. The kitchen has its **own** private link and code.

## Tabs
| Tab | What |
|---|---|
| Week | Mon to Sun, one dinner each: a recipe or free text, plus servings. Week arrows. Pizza night shows as its own kind. |
| Recipes | List with a vegetarian label on each recipe and a "Vegetarian only" filter. A recipe has title, servings, time, ingredients (amount, unit, item, aisle), steps and notes. Servings scale the amounts. "Plan it" puts it on a day. Add or edit by hand. |
| Shopping | This week's list: recipe ingredients combined per item, plus extras. Grouped in a general supermarket order (vegetables and fruit, bread, dairy and eggs, meat and fish, vegetarian, pasta and rice, tins and jars, baking, spices and oils, frozen, drinks, household, other). Tick, untick all, remove extras. |
| Dough | New York style. Size, number of pizzas, thin, regular or thick, gluten free. Grams per ingredient with baker's percentages, which can be adjusted. Pizza night date gives "mix on Sunday" (3 days before, 2 to 4 is fine), and buttons add it to the week and the flour to shopping. Bake notes for a home oven with stone or steel: the oven at its highest (about 250 °C), stone or steel preheated 45 to 60 minutes, about 6 to 8 minutes for regular. |

The dough base comes from the old artifact: 62% water, 0.4% active dry yeast, 2.5% salt, 2% sugar, 3.3% olive oil, with the Dough Guy thickness factors. Paul confirmed this base.

## How it works
- **Page:** a static PWA on GitHub Pages at `mellowt1.github.io/kitchen/`, in a new public repo `mellowt1/kitchen` (code only). Repo created 23 Sept 2026.
- **Worker:** paul-hub gets a `kitchen` module with its own Durable Object, one per kitchen code: recipes, weeks, shopping ticks and extras, and dough settings. Writes are merged per item, like the to-do, so two phones never overwrite each other. The new secret is `KITCHEN_CODE`.
- **Admin route:** `POST /api/admin/kitchen/recipes` with the admin token, so Claude Code can add cleaned-up recipes.
- **Offline:** the app shell and the last copy are cached. Changes queue and sync when back online.
- **Morning Screen bonus:** a small "Tonight" line showing the dinner, plus "Mix the dough today" on mix day. It is read inside the Worker, so the codes stay separate.
- **Moving over:** the artifact's dough settings (2 pizzas of 14 inch, regular) and its one planned week are copied in. It has no recipes yet.

## Look
- Warm kitchen: a flour-paper ground, tomato and basil colours, and a friendly serif like a cookbook, with a clean sans for amounts and lists.
- Phone first, one column; on the laptop the week and the shopping list sit side by side.
- It gets its own look, unlike the to-do and Morning Screen.
- No dashes used as punctuation in any text.
- The design is made on a Claude Design canvas, and Paul approves it before the build starts.

## Open
- How the girlfriend gets the link: Paul sends it to her himself (a QR and the link go in a gitignored local file).
