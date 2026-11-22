# Handoff for Codex: finish the GeezSheets companion

Written 2026-11-21 in case Claude runs out of tokens. Read `docs/companion-spec.md` first (the agreed spec). This file is the work list.
Repo: `C:\Users\jonge\Documents\GitHub\GeezSheets` (git, remote geezjonny/GeezSheets). The Owlbear extension lives in a separate folder, `C:\Users\jonge\Documents\GitHub\owlbear`.

## Ground rules
- **Do not edit `sheet.html`.** It is the fallback. Work in `companion.html` and new files.
- **Never write to the live Firebase database** (`https://geezsheets-default-rtdb.firebaseio.com/v2/...`) while testing. Dry runs against `docs/backup-pcs-2026-11-21.json` only. The `--apply` step in task 2 is run by the user, not by you.
- Plain ES modules, no build step, no CDN, no frameworks. Static serving: `serve.cmd` -> `http://127.0.0.1:8000/companion.html?char=<id>`.
- Rules: D&D 5e **2014 SRD** data in `data/` plus Tasha options already on the sheets.
- CHANGELOG: only add an entry when the user says "save" (then add a short user-facing bullet list under today's date, commit, do not push unless asked).
- The git working tree has many unrelated modified files (js/vtt, js/rodeo, owlbear deletions). Never `git add -A`. Stage only your own files. Do NOT commit the deleted `owlbear/` files (the extension manifest points at `geezjonny.github.io/GeezSheets/owlbear/...`; the user must decide where the extension is hosted).
- Players can only write their own PC (`?char=<id>` sets identity; see `js/gaia-db.js` ~line 23 and the whitelist near line 450). GM identity is `?gm=jonny`.
- Keep each task's result checked with `node --check` on the extracted inline module script and `node --test` where tests exist.

## Current state
- `companion.html` exists (first build + UI redesign by Codex, ~39 KB). Tabs: Home, Skills, Spells, Gear, Items. Writes HP (damage via `db.damage`, heal via `runTransaction`), temp HP, death saves, spell slots (`slots_used`), charges, conditions, concentration, inspiration, exhaustion. Has a dice parser and posts rolls to `geezvtt/live/<campaign>/rolls`. Never opened in a browser by anyone yet: do a real visual check (see task 7).
- Two bugs already fixed by hand: slot pip `data-used==='true'`, and save rolls use `pc.saves[key]`.
- Briefs that built it, for context: `docs/handoff/01-companion-first-build-brief.md`, `02-companion-ui-brief.md`. Engine brief (not yet confirmed built): `03-levelup-engine-brief.md`.
- Backup of every entity before any data change: `docs/backup-pcs-2026-11-21.json`.

## Task 1: level-up engine and audit tool
Build exactly what `docs/handoff/03-levelup-engine-brief.md` says (`js/levelup.js`, `js/test/levelup.test.mjs`, `data/subclass_features.json`, `tools/audit-pcs.mjs`). If any of those files already exist, review and finish them rather than starting over. Tests must pass: `node --test js/test`.

## Task 2: review the dry run, then the user applies
Run `node tools/audit-pcs.mjs --to-level 5` (dry run). Check the report against these known problems; every one must be fixed by the patch or listed as "needs decision":
- All level-5 PCs (Ashara, Lark, Liora, Rurik, Seris) have `proficiency_bonus` 2; should be +3. Spell DC, spell attack, saves, skills, passive scores, weapon `to_hit` (and the "d20+N" text in `notes`), maneuver DCs ("DC 14" in Seris's maneuvers -> 15) all follow.
- Kairon is level 4 (needs level 5: 2 third-level slots, HP, hit dice 5d8). Disney campaign PCs (Esmeralda, Jasmine, Kristoff, Merlin, Mushu, Wendy Darling) are level 3: the user said "all PCs right for level 5", so plan them to 5 too (average HP), flagged in the report.
- Ashara: 3 cantrips (needs 4), no 3rd-level spells although she has 2 third-level slots (add Life domain Beacon of Hope and Revivify as always prepared, plus picks like Spirit Guardians), duplicate "Cure Wounds (2nd level)" entry, Destroy Undead is level 5 but she should also get it as a feature card.
- Lark and Rurik (bards): know 5 spells, need 8; no 3rd-level spells; Hypnotic Pattern is a level-3 spell filed as level 1 (Lark); Font of Inspiration (level 5) is missing.
- Liora: knows 3 spells, needs 4; no Extra Attack card; Disguise Self (Gloom Stalker, always prepared) missing; Dread Ambusher should add WIS to initiative. Seris: no Extra Attack card (it is only in `text_blocks.features_traits`), 4 maneuvers where level 5 allows 3 (list as "needs decision").
- Level-3 oddities (review, do not auto-delete): Kristoff (Eldritch Knight) has Eldritch Blast and Shield of Faith, not on his list; he knows 2 spells, needs 3. Merlin (Wizard) has no spellbook spells (needs 6 + 2 per level). Mushu (Assassin rogue) has cleric/druid spells and no slots. Esmeralda has Fire Bolt (not a bard spell).
- ASI at level 4 is not auditable: report "check ability scores" without changing stats.
Write the human-readable report to `docs/pc-audit-2026-11-21.md`. Then tell the user to run `node tools/audit-pcs.mjs --to-level 5 --apply` themselves. Do not run it.

## Task 3: roll recipes (pure module) `js/recipes.js` + tests
`recipeFor(pc, thing, options)` returns `{label, parts:[{text, dice?, flat?, source}], summary, notes}` where parts are the dice and labelled modifiers to roll and add. Spells use `data/spells.json`:
`heal_at_slot_level` ("1d8 + MOD"), `damage.damage_at_slot_level`, `damage.damage_at_character_level` (cantrips scale at 5/11/17), `dc`, `attack_type`, `higher_level` text, `area_of_effect`.
Support: spell attack ("d20 + prof + casting mod"), save spells ("DC = 8 + prof + casting mod, target rolls DEX save"), healing with MOD = casting ability mod, upcasting per slot level (offer a slot-level selector for leveled spells),
weapon attack and damage (ability mod, proficiency, Archery +2, Dueling +2, Two-Weapon Fighting, Sharpshooter/Great Weapon options noted but not auto-applied), ability checks, saves, skills (proficiency, expertise, Jack of All Trades half-proficiency), initiative (+ Dread Ambusher WIS).
Riders to include and label: Disciple of Life (healing spells of level 1+: +2 + spell level), Hunter's Mark +1d6, Favored Foe +1d4, Dread Ambusher (round 1: extra attack, +1d8), Bardic Inspiration (die by level), Guidance +1d4, Bless +1d4, Divine Favor +1d4 radiant, Guided Strike +10, Sneak Attack (Assassin level 5: 3d6), Assassinate note, Superiority dice (d8, maneuver DC 8 + prof + STR or DEX mod), Extra Attack counts via `attacksPerAction` in `js/levelup.js`.
Unit tests for: Ashara Cure Wounds level 1 and level 2 (1d8/2d8 + WIS + 2 + level), Sacred Flame at level 5 (2d8), Guiding Bolt upcast, Liora longbow (+DEX + prof + Archery), Fighter attack count, Dread Ambusher round 1.

## Task 4: companion changes (all in `companion.html`)
- Bottom bar becomes 7 tabs: **Home, Skills, Feats, Spells, Gear, Items, Notes**. Hash routing stays. Icons are inline SVG.
- **Feats tab:** every `pc.abilities` entry as a full card (label, activation, recharge, effect text, charge pips with existing write), `origin_feat`, `text_blocks.features_traits`. Features that are rolls show the recipe.
- **Spells tab:** Cantrips section first, then levels. Each spell expands to the recipe from `js/recipes.js`, description from `data/spells.json`, slot-level picker for upcasting, **Cast** (spends the chosen slot, sets concentration).
- **Roll buttons** use the recipe: roll every dice part, add every flat part, show the breakdown line by line, post to the shared log (`geezvtt/live/<pc.campaign>/rolls`, same entry shape as the existing `roll()` helper).
- **Gear tab:** "Attack action" banner from `attacksPerAction` (e.g. "2 attacks, +9 to hit, 1d8+4 each; round 1: 3, extra attack +1d8"), weapon recipes.
- **Notes tab:** player notes at `apps/sheets/party/<campaign>/notes/<pcId>/<noteKey>` (players may write this path, see `js/gaia-core/player-writes.mjs` `field==='notes'`); look at how `sheet.html`/gaia-db maps notes before writing. Also show the GM's reveal notes for the character (`campaigns/<campaign>/reveals/<pcId>/notes`), read-only.
- **Roll-call display:** follow `geezvtt/live/<pc.campaign>/rollcall` like `followCalls`/`renderCall` in `sheet.html` + `js/rollcall.js` (`callTitle`, `callMod`, `answerCall`); show "GM calls: DEX save, DC 14: roll d20, add +4 +3" with this character's modifier and an Answer/Roll button.
- Remove nothing that already works; keep `node --check` passing.

## Task 5: GM mode (`?gm=jonny`) and level-up button, same file
- Party overview as the first screen in GM mode: card per PC with HP bar, conditions, concentration, slot pips; tap opens that character (full companion view, with write access in GM identity).
- GM tools: give item (copy `giveItem` from `sheet.html`), call roll (copy the GM side from the VTT or `js/rollcall.js`: initiative, save, skill, optional DC; writes the rollcall record), damage/heal any PC.
- **Level up** button (GM, and a read-only "Level up available" hint for players): uses `planLevelUp` from `js/levelup.js`, shows the summary and the remaining choices (new spells, ASI, subclass), then writes the patch (through the same adapter, wrap writes in try/catch with toasts). Needs the data arguments (`data/*.json`) loaded in the page.

## Task 6: Owlbear extension (folder `C:\Users\jonge\Documents\GitHub\owlbear`)
Existing: `background.html` (OBR SDK 3.1.0 via jsdelivr), `hp.js` (HP bars from the Firebase REST stream), `manifest.json` (URLs point at geezjonny.github.io/GeezSheets/owlbear/...).
- **Roll feed:** in `background.html` stream `geezvtt/live/<campaign>/rolls` (REST EventSource like `hp.js` `stream()`), show `OBR.notification.show("Name: Label, total")` for each new roll (ignore rolls older than 10 s on connect), and a popover/action panel `rolls.html` with the scrolling log. Campaign key = the GM's open game (`geezvtt/live/_dmCampaign` -> `{id,name}`).
- **GM "Call roll":** `OBR.tool.createAction` or context-menu entry (GM only) opening a small popover (kind: initiative/save/skill, ability or skill, DC, who) that writes the same rollcall record as the companion. Players answer from their companion.
- Optional (only after the above works): transparent click-through overlay with `js/dice3d.js`.
- **Hosting decision needed from the user** (do not decide yourself): the `owlbear/` folder is deleted from the GeezSheets working tree while `manifest.json` URLs expect it under GitHub Pages `GeezSheets/owlbear/`. Report this and leave deployment alone.

## Task 7: verification (needs a real browser)
Open `http://127.0.0.1:8000/companion.html?char=kairon` at 360x740 (and 1024 wide), no console errors, every tab renders for a caster (Ashara `pc_bdjqq6jmqmcq`), a martial (Seris `pc_kdgtscbrzakl`) and a PC with no spellcasting. Check the layout (no horizontal scroll at 320 px, tab bar usable, nothing under the safe area). Test writes only against `?db=local` or a throwaway `/v2-test/<run-id>` target (see `js/gaia-firebase.mjs`), never `/v2`.
Finish with a short report: what was built, tests run and results, what was not verified.
