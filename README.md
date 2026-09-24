# Kitchen

The week's dinners, the recipes, one shopping list and Paul's New York pizza dough, shared by Paul and his girlfriend. Plan a dinner on one phone and it shows on the other within about ten seconds. Tick things off in the shop without signal; the ticks sync when you are back online.

**No recipes or plans live in this repo.** The page ships empty and loads everything from the `paul-hub` Worker with the code in the link, so the repo can be public.

## The link

```
https://mellowt1.github.io/kitchen/?c=<kitchen code>
```

The kitchen has its **own** code (`KITCHEN_CODE` in the Worker), not the to-do's. It never opens the to-do list or the Morning Screen, and their code never opens the kitchen. The code is remembered after the first visit. Without it the page only says to ask Paul for the link.

## On the iPhone

Open the link in Safari, tap Share, then **Add to Home Screen**. It opens full screen with the pizza icon and works offline: the last copy and any changes are kept on the phone.

**Sharing with your girlfriend:** send her the same link (a message or a QR). She needs no account. Keep your own copy of the link and QR in a `my-link.local.txt` / `.png` next to this README; `*.local.*` files are never committed.

## The four tabs

* **Week**: Monday to Sunday. Tap a day to pick a recipe, write something ("Dinner at friends"), set servings, make it pizza night, or clear it. On mix day a banner says "Mix the dough today".
* **Recipes**: the cookbook, with a Vegetarian label and a "Vegetarian only" filter. The servings stepper scales the amounts. Plan it puts it on a day. Add or edit by hand; the aisle is guessed from the item's name.
* **Shopping**: this week's planned recipes, added up per item and scaled by servings, plus your own items, in supermarket order. Tick, untick all, remove your own items.
* **Dough**: size, pizzas, thin, regular or thick, gluten free; grams with baker's percentages (tap a percentage to change it). Pick the pizza night and it says when to mix (3 days before, the day before for gluten free), and adds the night to the week and the flour and yeast to shopping.

On the laptop, Week and Shopping sit side by side.

## Adding recipes with Claude Code

Send Claude Code a recipe or a link and ask it to add it to the kitchen. It cleans it up (amounts, units, aisles, a vegetarian flag, short steps) and posts it to `POST /api/admin/kitchen/recipes` with the admin token. The recipe format and a curl example are in the todo repo's README, under Kitchen. No AI runs inside the app, so it costs nothing.

## Backup

```powershell
curl.exe -s -H "Authorization: Bearer $($s.ADMIN_TOKEN)" https://paul-hub.paul-o-a04.workers.dev/api/admin/kitchen/export > kitchen-backup.json
```

## Going live (once)

1. In the todo repo: merge the `kitchen` branch, `cd worker; npx wrangler deploy` (this creates the kitchen's storage), then add `KITCHEN_CODE=<16 characters a-z0-9>` to `secrets.local.txt` and upload it with the temp JSON file and `npx wrangler secret bulk`, as that README shows. Never pipe it into `wrangler secret put` on Windows.
2. Here:

```powershell
git push -u origin main
gh api -X POST repos/mellowt1/kitchen/pages -f build_type=workflow
gh workflow run pages.yml -R mellowt1/kitchen
```

After that, every push to `main` that touches `app/` publishes, and phones pick up the new version on the next launch.

## Local

```powershell
npm install
npm test                          # dough maths, pizza night, weeks, amounts, aisles, shopping list
cd ..\todo\worker; npx wrangler dev --persist-to C:\wdk --env-file <a temp file with dev values>
npm run serve                     # page on http://localhost:8080/kitchen/?c=<dev code>
$env:KITCHEN_DEV_CODE='<dev code>'; $env:ADMIN_DEV_TOKEN='<dev token>'
npm run shots                     # every tab, phone and laptop, into verify-shots/
npm run sync-check                # two phones: sync within 15 s, offline ticks, offline shell and fonts
npm run icons                     # redraws app/icons/
```

On localhost the page talks to `http://localhost:8787` and skips the service worker (add `&sw=1` to test it). Only ever use made up dev values locally.

## Claude Desktop (recipes by chat, on the PC)

`mcp/server.mjs` gives Claude Desktop eight kitchen tools: list, get, save and delete recipes, see the week, plan or clear a day, and add to the shopping list. It uses the kitchen code, like the app, so it can only touch the kitchen.

Set up once: `cd mcp; npm install`, then add this to Claude Desktop's config (Settings, Developer, Edit Config) and restart Claude Desktop:

```json
"kitchen": {
  "command": "node",
  "args": ["C:/Users/Admin/Desktop/PAUL AGENTS/kitchen/mcp/server.mjs"],
  "env": { "KITCHEN_SECRETS": "C:/Users/Admin/Desktop/PAUL AGENTS/todo/secrets.local.txt" }
}
```

The code is read from that gitignored secrets file (its `KITCHEN_CODE` line) and never goes into the config. Then just say "Add this recipe: ..." with a link or notes.
