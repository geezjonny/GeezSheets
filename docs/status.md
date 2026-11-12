# GeezSheets status: what exists, where it lives, what's left

Last updated 2026-11-10 (evening), before the Friday 2026-11-13 session.

## What is live right now
| Where | What | State |
|---|---|---|
| GitHub Pages `geezjonny.github.io/GeezSheets/` | `old-index.html`, `old-sheet.html` and the rest of the old site | **Renamed old-* on 2026-11-10.** The fallback for Friday. |
| Same site | `index.html` (GM: `?gm=jonny`), `sheet.html?char=<pc>&live=world__daddies` | **New, live since 2026-11-10.** GeezSheets running on Gaia data in Firebase `/v2`. |
| Firebase RTDB `geezsheets-default-rtdb` | `rodeo`, `characters`, `geezvtt`, `session`, `campaigns`, `maps`, `dice` | **Unchanged.** The old site's data. |
| Same database | `/v2` (`worlds`, `campaigns`, `apps`, `files`) | **New.** Gaia data uploaded from the 2026-11-09 snapshot (~0.3 MB). Gets replaced Thursday by a fresh export. |
| Same database | `/v2-test/<run>` | Test area. Every test run deletes its own data. |

No logins: the GM is whoever opens a page with `?gm=jonny`, exactly like the old site. No database rules were changed.

## Where the code lives
- **GeezSheets `main`** (pushed): the new app under plain names (`index.html`, `sheet.html`, ...); the old site is `old-*`. Rule: **never edit `old-*` files**, so the old pages can never break.
  - `index.html`, `sheet.html` (always run on Gaia: Firebase `/v2`; the local Gaia server is gone, so test on the live site)
  - `js/geez-*.js`, `js/gaia-core/` (the Gaia core: schema, validation, actions; the only copy), `css/tailwind.css`, `audio/library.js`, `data/geez-*.json`
  - Shared, never copied: pictures (`props/`, `textures/`, `tokens/`), sounds (`audio/`), `battlemap/`, `config/`.
  - `js/config.js` is the **old site's** Firebase config (name predates this work); the new pages use `js/firebase-config.js`.
- **GeezSuite** is only the content pipeline now (NPC Desk, SRD data, roll tables, Map Forge, models). The migration tools, local Gaia server, CLI and console were dropped 2026-11-11; they are in GeezSuite's git history.

## What works (tested)
- One schema (Gaia v1) for PCs, NPCs, places, maps, items, links, campaigns with reveals and state.
- GeezSheets GM page, player page and sheet on Gaia, locally and on real Firebase: HP both ways live, ownership (a player edits only their own PC), concurrent writes, tokens, initiative, new campaigns, reloads.
- Maps as data: `.geez2vtt` files (no pictures) attach to a battle map place and draw with GeezSheets' own textures and props; doors, windows, arches, floors, line of sight.
- GeezMapConverter: imports legacy `.dd2vtt`, guesses floors/terrain and props from the picture (colour groups, prop groups, review marks), Select/Room apply, exports `.geez2vtt`.
- Geez Console and the `geez` CLI on the local server.

## Steps left to one version
1. **Before Friday: player writes.** Dice rolls, pings, presence, rollcall answers, notes and initiative edits from player screens are still GM-only on the new pages.
2. **Thursday: fresh data.** Export the live Firebase → `node tools/migrate.mjs` → review → `node tools/upload-v2.mjs --target v2 --yes-really --overwrite`. (The old site keeps changing until then; ids stay stable.)
3. **Thursday: rehearsal** on two devices (GM laptop + a phone) on `index.html`.
4. **Friday: play on `index.html`**, with `old-index.html` as the fallback.
5. **After a good session: switch.** Point `index.html`/`sheet.html` at the geez pages (redirect), stop writing the old tree, keep it as a read-only backup.
6. **Then clean up:** retire the old files, drop the `geez-` prefix if wanted, move the other pages (pinboard, world, pc-import) onto Gaia, then the DM control page (GeezRemote), then Ink 3D.
7. **Backups:** done (GeezSuite is on GitHub, private).

## Lessons worth keeping
- Real Firebase behaves differently from fakes: transaction handlers run first on the local cache (often empty), so never abort on a failed check; Firebase drops nulls, so compare null == missing.
- Name collisions: `js/config.js` would have become `js/config.js`, which already existed. Copy scripts must refuse to overwrite.
