# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people who share a kitchen and a home. The owner plans and cooks; the partner mostly writes her own dinners as short text ("pizza", "dinner with a friend"). The look is tuned to the owner's taste first. Both use it as an installed PWA on iPhone; the owner also opens it on a laptop.

## Product Purpose

Plan the week's dinners for both people, cook from their own recipe book, and turn the plan into one shopping list. Success: the week gets planned in one sitting, and cooking from a recipe on the counter is easy to follow.

## Positioning

A private kitchen for two, not a recipe platform: two plans side by side (each person's dinners can differ), the owner's calendar marks nights he is out, pizza nights drive a dough schedule (when to mix) and their own toppings on the list, and every shopping item says which dish it is for.

## Operating Context

- Main moments (confirmed): planning the week in one sitting, and cooking from a recipe with the phone on the counter.
- Less used: glancing at tonight, the shopping list (ticked in short bursts at home on pantry items). Breakfast and lunch are almost never planned.
- About 36 recipes, roughly 10 of them planned regularly (Ecuadorian stews and soups, Korean dishes, pizza).
- Dough tab: New York style pizza dough calculator (baker's percentages), pizza-night date, mixing reminder, toppings per pizza / flammkuchen night.

## Capabilities and Constraints

- Static page on GitHub Pages (`app/`: index.html, app.css, app.js, logic.js, sw.js); data in a Cloudflare Worker; offline queue; laptop layout from 900px puts Week and Shopping side by side.
- Must keep: the four bottom tabs, Week, Recipes, Shopping, Dough (confirmed 2026-10-19).
- Public repo: no names, codes or private data in committed files.

## Brand Commitments

- Name: Kitchen.
- Rejected before (confirmed): costume (aged paper, stains, handwriting, heirloom-cookbook dress-up); also unwanted: techy or dark dashboard, playful or cartoon, bare settings-screen minimalism.
- Copy voice: plain, short, British-leaning English ("Check you have", "Always have").

## Evidence on Hand

Real recipes and weeks exist in the Worker; test with the made-up seeds in `verify-shots/*.mjs` or a local KV backup. No photos of dishes exist; do not invent any as real.

## Product Principles

1. Planning a week of dinners should feel like one calm sitting, not seven forms.
2. A recipe on the counter is read from arm's length, mid-task.
3. Two plans, one kitchen: show whose dinner it is without making it a chore.
4. The app looks after timing (dough, being out) so nobody has to remember.
