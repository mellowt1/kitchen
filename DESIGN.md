---
name: Kitchen
description: The pass of a restaurant kitchen, light. The week is tickets on a steel rail, a recipe is the ticket you cook from, shopping is one receipt.
colors:
  ground: "#F1F2F0"
  paper: "#FFFFFF"
  ink: "#2A2E33"
  muted: "#565C62"
  muted2: "#62686E"
  faint: "#868D95"
  rule: "#DADDE0"
  row: "#EBEDEE"
  dash: "#CDD1D4"
  seg: "#E3E6E8"
  field-stroke: "#C3C8CD"
  rail: "#A9AFB5"
  rail-edge: "#7D848B"
  tomato: "#D23A2F"
  tomato-bg: "#FCEAE6"
  tomato-ink: "#9A3A2E"
  tomato-line: "#F0C2BB"
  basil: "#2F6B3A"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "96px"
    fontWeight: 800
    lineHeight: 0.8
    fontVariation: "'wdth' 75"
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 75"
  ticket:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.12
    fontVariation: "'wdth' 87.5"
  cook:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "27px"
    fontWeight: 500
    lineHeight: 1.35
  body:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
  body-small:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
  label:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 87.5"
  tag:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 87.5"
rounded:
  none: "0px"
  xs: "3px"
  sm: "4px"
  inner: "9px"
  field: "10px"
  md: "12px"
  sheet: "16px"
spacing:
  hair: "6px"
  tight: "10px"
  gap: "12px"
  stack: "16px"
  gutter: "18px"
  page: "22px"
components:
  button-primary:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "50px"
  button-line:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "50px"
  button-soft:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.tomato-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  button-round:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    size: "44px"
  button-round-red:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    size: "44px"
  ticket:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.ticket}"
    rounded: "{rounded.none}"
    padding: "16px 12px 17px"
  ticket-empty:
    backgroundColor: "transparent"
    textColor: "{colors.muted2}"
    rounded: "{rounded.none}"
    padding: "16px 12px 17px"
  ticket-total:
    backgroundColor: "{colors.tomato-bg}"
    textColor: "{colors.tomato-ink}"
    rounded: "{rounded.sm}"
    padding: "14px 12px"
  tag-tonight:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: "3px 5px 2px"
  receipt:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "18px 16px 27px"
  cook-page:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.cook}"
    rounded: "{rounded.none}"
    padding: "26px 20px 35px"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
    height: "44px"
  search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "46px"
  segmented:
    backgroundColor: "{colors.seg}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "3px"
  segmented-on:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.inner}"
    height: "42px"
  banner:
    backgroundColor: "{colors.tomato-bg}"
    textColor: "{colors.tomato-ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "20px 18px"
  tab-bar:
    backgroundColor: "#F4F5F6"
    textColor: "{colors.muted2}"
    typography: "{typography.label}"
    padding: "6px 8px 22px"
  tab-bar-active:
    textColor: "{colors.ink}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Kitchen

## Overview

**Creative North Star: "The Pass"**

Kitchen is the pass of a restaurant kitchen, wiped down and lit for daytime. A light steel counter holds white paper: the week is seven tickets clipped under a flat steel rail, a recipe is the prep ticket you cook from, shopping is one long receipt, and Cook mode deals each step as its own torn ticket on the counter. Everything readable is paper; everything you press is a rounded control on the counter. One warm ticket red says what is on tonight, what to press, and how many.

The voice is one condensed grotesque doing every job through its width axis: condensed 800 uppercase for heads and numbers, a semi-condensed cut for labels and quantities, full width for anything read in a sentence. Rules inside paper are dashed, like thermal printer tear lines. Density is calm: a two-column grid of tickets on the phone, side by side Week and Shopping from 900px, one step per screen when cooking at arm's length.

The world came from a concept-seed roll (seed `0e60e3f7`, candidate 1 of 7, "The Pass"). The first build was darker (near-black ink, a harder red, a dark total ticket); the owner said it was too dark, and the palette moved to the light counter, graphite ink and pale-red total recorded here. A finish review then replaced glyph chevrons and closes with drawn SVG, flattened a chrome-gradient rail into a plain bar, put each letter's recipes on their own torn strip, and made Cook pages paper tickets. Where the original direction prose and the build differ, the build is the record. Confirmed rejections: costume (aged paper, stains, handwriting, heirloom cookbook dress-up), a techy or dark dashboard, playful or cartoon styling, bare settings-screen minimalism.

**Key Characteristics:**
- Light steel counter, white paper with a torn bottom edge, graphite ink, one warm red.
- One family, Archivo, with the width axis as the hierarchy: condensed for heads and numbers, full width for reading.
- Tabular numbers in a hard right-hand column: servings, quantities, times, counts.
- Dashed rules inside paper; solid hairlines only on controls.
- Square-cornered paper, 12px-rounded controls, 3px tags.
- Depth from paper lifted off the counter, never from colour blocks.

## Colors

A near-neutral cool-grey kitchen with one warm red and one green used only for meaning.

### Primary
- **Ticket Red** (tomato): tonight's day name and flag, the pizza-night title, primary buttons, the Add buttons, the active tab bar marker, the active thumb-index letter, recipe index letters, step numbers, receipt counts, the text caret. Small red text sits on paper, not on the counter.
- **Ticket Red Wash** (tomato-bg): the week's total ticket, banners and confirms, the current row in pickers, today's row in the plan sheet, the selection highlight.
- **Ticket Red Ink** (tomato-ink): text on the red wash, ingredient section names, form errors, soft-button text, the undo-style red link.
- **Red Hairline** (tomato-line): the underline of red text links and the border of the out-of-sync pill.

### Secondary
- **Basil** (basil): meaning only. The Vegetarian tag and leaf, a ticked shopping box, plain links. Never decoration.

### Neutral
- **Steel Counter** (ground): the page background, Cook mode's ground, field fills inside cards.
- **Ticket Paper** (paper): every ticket, the recipe, the receipt, the dough sheet, sheets, controls.
- **Graphite** (ink): all primary text, the focus ring, the toast. Soft graphite, never black.
- **Muted** (muted): secondary text, sentences under headings, unselected segment text.
- **Small Grey** (muted2): small labels, meal names, servings, empty-ticket text, inactive tabs (5:1 on the counter). The label colour token `steel-ink` in the stylesheet carries the same value.
- **Faint** (faint): ticked-off text, link underlines, empty thumb letters. Lines and boxes, not reading text.
- **Control Hairline** (rule): 1px outline of round buttons, search, add field, line buttons, tab bar top edge.
- **Row Dash** (row): 1.5px dashed rows inside paper (ingredients, receipt lines, recipe entries).
- **Section Dash** (dash): 2px dashed section breaks inside paper and the day-name rule on tickets.
- **Segment Track** (seg): segmented-control and stepper tracks, the laptop pill nav.
- **Field Stroke** (field-stroke): 1px border of form inputs.
- **Rail Steel** (rail) with **Rail Edge** (rail-edge): the flat ticket rail and its 2px bottom edge. Nothing else.

### Named Rules
**The One Red Rule.** Ticket red marks tonight, the thing to press, and the count. It fills only small things (a flag, a button, a tab marker, the thumb letter); large red areas are the pale wash, never solid red. The one solid red block is the dough's "Each ball" figure.

**The Light Counter Rule.** No black blocks and no dark panels. Ink is graphite, the total ticket is pale red, the rail is a mid-grey bar. The only dark surface is the transient toast.

**The Meaning-Only Green Rule.** Basil means vegetarian or done. If it is neither, it is not green.

## Typography

**Display Font:** Archivo at 75% width (with system-ui, -apple-system, Segoe UI)
**Body Font:** Archivo at 100% width (same stack)
**Label Font:** Archivo at 87.5% width

**Character:** One variable grotesque loaded with its width axis (62 to 125) and weights 400 to 800. Condensed 800 uppercase reads like a printed kitchen ticket; the full-width cut keeps steps and sentences easy at arm's length.

### Hierarchy
- **Display** (800, 96px, 0.8, condensed): the step number on a Cook ticket. The dough's big figures use the same voice at 52px.
- **Headline** (800, 46px, 0.92, condensed, uppercase): screen titles (THIS WEEK, RECIPES, SHOPPING). 40px under 360px wide and for a recipe's own title; 42px in the laptop plan; 34px for sheet titles and index letters.
- **Title** (800, 26px, 1, condensed, uppercase): receipt section heads (TO BUY, CHECK YOU HAVE) with their red count beside them. Ticket day names (MON 19) use the same voice at 18px.
- **Ticket** (700, 19px, 1.12, semi-condensed): the dinner on a day ticket. Breakfast and lunch drop to 15px 600 muted; pizza night goes condensed 800 uppercase red at 22px.
- **Cook** (500, 27px, 1.35): the one step on a Cook ticket.
- **Body** (400, 17px, 1.5): method steps, ingredients, recipe entries; tabular numerals throughout.
- **Body small** (400, 15px, 1.45, muted): sentences under headings, notes, banners, the receipt's summary.
- **Button** (700, 16px): button text; 15px on small and mid buttons.
- **Label** (700, 12px, 0.1em, uppercase, semi-condensed, small grey): aisle names and section labels inside cards, field labels. Under a screen title it is 13px at 0.06em.
- **Tag** (800, 11px, 0.06em, uppercase, semi-condensed): Tonight, Vegetarian, out-tonight tags.

### Named Rules
**The Width Is The Hierarchy Rule.** Change width before changing family: condensed for heads and numbers, semi for labels and quantities, full width for anything read as a sentence. No second typeface.

**The Hard Column Rule.** Numbers are tabular and right-aligned in their own column: servings on tickets, quantities on the receipt and ingredient list (a 5.6em right-aligned column), times in recipe entries.

**The Heading Leads Rule.** A small label sits under its heading (the week number under THIS WEEK, the recipe count under RECIPES), never above it.

## Layout

Phone first at a 390px canvas. Views stack with 16px between blocks inside an 18px side gutter, 22px top plus the safe area, and 110px bottom clearance for the fixed tab bar. The week is a two-column ticket grid (12px row gap, 10px column gap) hanging from a rail that runs 8px past the grid on each side; the first row tucks 5px under the rail. Seven day tickets fill seven slots and the eighth is the week's total, which opens Shopping. Recipes are an index: a 34px red letter over its own torn strip of entries, letters 22px apart, with a 34px sticky thumb index down the right edge.

Under 360px, ticket titles drop to 17px, headlines to 40px, and servings move under the dinner name. From 900px the app is a 1280px max container with 56px side padding: a top bar with the Kitchen wordmark and a pill nav replaces the bottom tabs, Week and Shopping sit side by side in two columns 40px apart (the total ticket hides, since Shopping is beside it), the receipt flows in two columns, Recipes narrow to 760px, Dough splits into two columns, and sheets become a centred 480px card.

Every pressable thing is at least 44px tall. Rows inside paper are 44 to 54px.

## Elevation & Depth

Depth is paper on a counter: white paper against the light grey ground does most of the work. Paper carries a soft two-layer drop shadow, applied to the grid that holds the tickets with `filter: drop-shadow` because the torn-edge mask would clip a box-shadow on the ticket itself. Controls are flat with a 1px hairline. Only overlays lift further.

### Shadow Vocabulary
- **Paper lift** (`filter: drop-shadow(0 1px 1px rgba(42,46,51,.12)) drop-shadow(0 3px 8px rgba(42,46,51,.06))`): tickets on the rail.
- **Selected segment** (`box-shadow: 0 1px 2px rgba(20,21,24,.18)`): the chosen option in a segmented control or laptop pill nav.
- **Sheet** (`box-shadow: 0 -8px 30px rgba(20,21,24,.18)`): the bottom sheet over a scrim of graphite at 32%.
- **Float** (`box-shadow: 0 6px 18px rgba(20,21,24,.25)` to `0 6px 20px`): the toast and the thumb-index letter bubble.

### Named Rules
**The Paper Lift Rule.** Paper lifts, controls do not. A shadow on paper goes on its container as a drop-shadow filter so the torn edge casts it too.

## Shapes

Two families of form. Paper (tickets, the recipe card, the receipt, the dough sheet, recipe strips, Cook tickets) is square-cornered with a torn bottom edge: a zigzag mask with a 10px tooth, and the paper adds half a tooth of bottom padding so text never sits in the tear. Controls on the counter are rounded: 12px for buttons, round icon buttons, search, the add field, segmented tracks and the toast; 9px for the inner pressed segment and the red add square; 10px for form fields; 16px for the sheet's top corners; 3px for tags and the Tonight flag; 4px for solid tinted blocks that are not paper (the total ticket, banners, confirms). An empty day is an empty clip: a 2px dashed outline on the counter with no paper and no tear.

**The Torn Edge Rule.** Paper you read from is square with a torn bottom; a control never tears and paper never gets a rounded corner.

**The Dashed Thermal Rule.** Divisions inside paper are dashed: 1.5px for rows, 2px for section breaks. Solid lines belong to controls.

## Components

### Buttons
Rounded, solid and plain; they sit on the counter, not on the paper.
- **Shape:** gently rounded (12px), 50px tall, 22px side padding; small and mid sizes are 44px.
- **Primary:** ticket red with white text, for the one action that commits (Save, Add to the week).
- **Line:** paper with a 1px hairline and graphite text, for the secondary choice (Cancel, Change, Add an ingredient).
- **Soft:** paper with a 1.5px red border and red-ink text, for a second positive action beside a primary (Add to shopping).
- **Round icon:** 44px square at 12px radius, paper with a hairline, holding a 20px drawn SVG (chevrons, close). The red variant (add a recipe) is solid ticket red.
- **Quiet link:** underlined muted text with a faint underline at 3px offset, for low actions (Back to this week, Untick all, Put back).
- **Focus:** a 2px graphite outline at 2px offset on everything; inside a ticket or row it moves inside (offset -3px).
- **Disabled:** half opacity, default cursor.

### Day ticket (signature)
A white torn ticket under the rail. Day name in condensed 800 uppercase (red when it is today, with a solid red TONIGHT flag pushed right), a dashed rule, then one line per meal: the dinner in the ticket voice with servings ("× 2") right-aligned. An empty day is a dashed clip reading "Add dinner". The eighth slot is the total ticket: pale red wash, 4px radius, a 38px condensed red count, a small uppercase caption and a "things to buy" line with a drawn chevron. Tickets drop in from under the rail on load (340ms, 30ms stagger).

### Receipt (Shopping)
One long torn sheet. A summary head (dinners planned, which dishes) over a 2px dashed break, then condensed section heads with a red count, aisle labels, and rows: a 22px box (basil fill when ticked), the item with the dish it is for underneath, the quantity in the hard column. Ticked items go faint and struck through. "Check you have" is a disclosure whose drawn chevron turns 90° over 220ms.

### Chips / tags
- **Style:** 11px uppercase semi-condensed tags. Tonight is solid red with white text at 3px; Vegetarian (basil) and out-tonight (red) are 1.5px outlined in their own colour.
- **Rule:** tags label state; they are never pressable.

### Cards / Containers
- **Corner Style:** square for paper (torn bottom); 4px for tinted blocks (total ticket, banner, confirm, bake note).
- **Background:** paper on the counter; the red wash for anything that is an alert or the week's total.
- **Shadow Strategy:** see Elevation; only the ticket grid lifts.
- **Border:** none on paper; dashed rules inside.
- **Internal Padding:** 12 to 20px, plus half a tooth at the bottom of torn paper.

### Inputs / Fields
- **Style:** paper fill, 1px field-stroke border, 10px radius, 44px tall, 16px text (prevents iOS zoom). Search and the add field are 12px-radius bars with a hairline and an inline icon or red add square.
- **Focus:** the 2px graphite outline at 2px offset, on the whole bar for search.
- **Caret and selection:** red caret; selection in the red wash with red-ink text.
- **Error:** a red-ink 15px 600 line under the form.

### Segmented control and stepper
A seg-grey track at 12px radius with 3px padding; the chosen option is a paper pill at 9px radius with 800 graphite text and the selected-segment shadow. Steppers use the same track with 42px buttons and a condensed 800 count between them.

### Navigation
- **Phone:** a fixed bottom bar of four tabs (Week, Recipes, Shopping, Dough), near-white with a hairline top. Each tab is a 24px drawn icon (1.7 stroke, round caps) over a 12px label; inactive small grey 600, active graphite 800 with a 3px red marker on the bar's top edge.
- **Laptop:** the Kitchen wordmark in condensed 800 uppercase at 34px, and a pill nav on the seg track (Week and shopping, Recipes, Dough) styled like the segmented control.

### Cook ticket
Full screen over the counter. A top bar with a round close button, the recipe name in condensed uppercase and "Step N of M" in red ink (tomato-ink, for contrast on the counter); below, one torn paper ticket per step, scroll-snapped vertically: a 96px red step number over a 2px dashed break, the step at 27px, and a muted "Next:" preview pinned to the bottom. The first ticket is Get ready with the scaled ingredients.

### Sheet
A bottom sheet on the phone (16px top corners, rises 28px over 220ms), a centred 480px card on the laptop (scales in from 98% over 160ms). Its head is a condensed 34px title with its label under it and a round close button.

## Do's and Don'ts

### Do:
- **Do** put everything readable on white torn paper and everything pressable on rounded counter controls (12px).
- **Do** keep red to tonight, the action and the count; use the pale red wash for any larger area.
- **Do** set heads and numbers in condensed Archivo 800 uppercase, and reading text at full width.
- **Do** right-align every quantity, serving and time in a tabular column.
- **Do** divide inside paper with dashed rules (1.5px rows, 2px sections).
- **Do** draw icons as SVG on a 24px grid, 1.7 stroke, round caps, `currentColor`.
- **Do** keep small red text on paper; the counter is slightly too grey for red under 18px.
- **Do** put a screen's small label under its heading.
- **Do** keep every target at least 44px, and animate only on load or open, honouring reduced motion.

### Don't:
- **Don't** use black, near-black blocks or dark panels; the owner found the darker first version too dark.
- **Don't** dress it up as costume: no aged paper, stains, handwriting or heirloom-cookbook styling.
- **Don't** make it a techy or dark dashboard, playful or cartoon, or bare settings-screen minimal.
- **Don't** give paper rounded corners or a control a torn edge.
- **Don't** give the rail a chrome gradient or highlights; it is a flat grey bar with a darker bottom edge.
- **Don't** use Unicode glyphs or emoji as icons.
- **Don't** put a kicker or eyebrow above a heading.
- **Don't** add a second typeface or a second accent colour; green is reserved for vegetarian and done.
- **Don't** put a coloured border-left or border-right on a card, row or banner.
- **Don't** show a photo of a dish; none exist.
