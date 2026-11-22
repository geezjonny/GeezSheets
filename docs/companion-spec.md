# GeezSheets Companion: spec (agreed 2026-11-21)

`companion.html` is the player's mobile character companion at the table. `sheet.html` stays untouched as the fallback.
**Decision 2026-11-21: no new OBR extension work.** Players use stock Owlbear Rodeo for the map and this companion for everything else (sheet, rolls, roll calls). The existing extension in `GitHub/owlbear` is left alone.

## Principles
- **Automate and spell out.** Every spell, attack, check and feature shows exactly what to roll and what to add, worked out for this character
  (e.g. Cure Wounds at level 2: roll 2d8, add +4 WIS, add +4 Disciple of Life (2 + spell level)). Upcasting, subclass riders and attack counts included. No rules lookup at the table.
- **The sheet rolls.** One tap rolls the whole recipe, shows the breakdown line by line, and posts to the shared roll log `geezvtt/live/<campaign>/rolls`.
- **Mobile first** (360 px), also fine on desktop. Same data and write path as `sheet.html` (Gaia adapter, `js/rodeo-firebase.js`, Firebase `/v2`).
- **Rules edition:** 2014 SRD data (`data/class_levels.json`, `classes.json`, `spells.json`, `features.json`) plus Tasha options already on the sheets.

## Layout (simplified 2026-11-22, modelled on how D&D Beyond's mobile sheet is organised)
Five tabs plus a floating dice button. Code: `companion.html` (shell and styles) and `js/companion.js`.
- **Character:** portrait and name, HP (damage, heal, temp), AC, initiative, speed, proficiency, passive perception, inspiration, exhaustion, conditions and concentration, ability scores, saving throws, skills (collapsible), death saves at 0 HP, Short rest and Long rest. Tapping any ability, save, skill or initiative opens its roll recipe.
- **Actions:** what you do on your turn. Attack count banner ("2 attacks, 3 on round 1"), weapons with Attack and Damage recipes, cantrips, and features with pips (Channel Divinity, Action Surge, Superiority Dice).
- **Spells:** slot pips, save DC and spell attack, cantrips, then spells by level. Each spell opens its recipe with a slot picker, optional extras and Cast (spends the slot, sets concentration). Cleric, druid, wizard and paladin get **Prepare spells** (also offered after a long rest), with always-prepared spells locked.
- **Inventory:** equipment, coin, consumables with a Use button, other items, search.
- **Features:** class, subclass, species and feats in full, with pips, plus About and **My notes** (saved to `text_blocks.player_notes`).
- **Dice button:** d4 to d100, advantage and disadvantage, free expression.
- **Roll call box** appears at the top when the GM calls a roll.

## GM (`?gm=jonny`)
Opens on the **party screen**: pick the campaign, see each character's HP, AC, slots, conditions and concentration, tap one to open their full sheet (the GM can edit anything). **Call roll** (initiative, save, skill or ability, optional DC, who), live results with pass/fail, **Give item**, recent rolls, and **Level up** on a character's Features tab (shows what changes and what is left to choose before applying).

## Leveling
One button applies the new level: proficiency, slots, hit dice, HP (average), class and subclass features, always-prepared spells, Extra Attack.
It lists what is left to choose (new spells, ability score increase, subclass). Engine: `js/levelup.js`. Data check and fix tool: `tools/audit-pcs.mjs`
(dry run by default; `--apply` writes to Firebase only after checking the live data against the snapshot). Backup before any fix: `docs/backup-pcs-2026-11-21.json`.

## Owlbear Rodeo
Stock OBR only. Rolls made in the companion are posted to the shared roll log (`geezvtt/live/<campaign>/rolls`) so the GM sees them in the companion's GM view; nothing is shown inside OBR.

## Out of scope
OBR's own dice tray (no extension API). Dice+ / dddice integration is unverified and not needed.
