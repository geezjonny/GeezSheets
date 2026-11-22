# GeezSheets Companion: spec (agreed 2026-11-21)

`companion.html` is the player's mobile character companion at the table. `sheet.html` stays untouched as the fallback.
**Decision 2026-11-21: no new OBR extension work.** Players use stock Owlbear Rodeo for the map and this companion for everything else (sheet, rolls, roll calls). The existing extension in `GitHub/owlbear` is left alone.

## Principles
- **Automate and spell out.** Every spell, attack, check and feature shows exactly what to roll and what to add, worked out for this character
  (e.g. Cure Wounds at level 2: roll 2d8, add +4 WIS, add +4 Disciple of Life (2 + spell level)). Upcasting, subclass riders and attack counts included. No rules lookup at the table.
- **The sheet rolls.** One tap rolls the whole recipe, shows the breakdown line by line, and posts to the shared roll log `geezvtt/live/<campaign>/rolls`.
- **Mobile first** (360 px), also fine on desktop. Same data and write path as `sheet.html` (Gaia adapter, `js/rodeo-firebase.js`, Firebase `/v2`).
- **Rules edition:** 2014 SRD data (`data/class_levels.json`, `classes.json`, `spells.json`, `features.json`) plus Tasha options already on the sheets.

## Home (front page)
Portrait, name, class / level / subclass. HP bar with damage, heal and temp HP; death saves at 0. Spell slot pips and ability charge pips (Channel Divinity, Superiority Dice...).
AC, initiative, speed, proficiency, passive perception, six ability scores, inspiration, exhaustion, conditions, concentration.
Martial characters get an "Attack action" banner: 2 attacks at level 5, +1 on round 1 for Gloom Stalker, Action Surge note.

## Menu (bottom bar, 7 tabs)
- **Home**
- **Skills:** saves, skills, senses, proficiencies and languages.
- **Feats:** class and subclass features, species traits, origin feat and feats, spelled out in full, with charge pips for limited-use ones.
- **Spells:** **Cantrips** section first, then leveled spells grouped by level. Roll recipes (attack, damage, healing, save DC), Cast spends the slot and sets concentration, upcast choices.
- **Gear:** weapons (attack + damage recipes), armor, shield, coin.
- **Items:** inventory grouped by category, descriptions, search.
- **Notes:** the player's own notes (party notes record, which players may write) plus the GM's notes for that character.

## GM
Party overview (everyone's HP, conditions, slots), open any character, give items, call a roll.
**Call roll:** the GM calls an initiative, save or skill roll from the companion's GM view. It uses the existing roll-call record `geezvtt/live/<campaign>/rollcall`.
Each companion shows the call with that character's numbers worked out.

## Leveling
One button applies the new level: proficiency, slots, hit dice, HP (average), class and subclass features, always-prepared spells, Extra Attack.
It lists what is left to choose (new spells, ability score increase, subclass). Engine: `js/levelup.js`. Data check and fix tool: `tools/audit-pcs.mjs`
(dry run by default; `--apply` writes to Firebase only after checking the live data against the snapshot). Backup before any fix: `docs/backup-pcs-2026-11-21.json`.

## Owlbear Rodeo
Stock OBR only. Rolls made in the companion are posted to the shared roll log (`geezvtt/live/<campaign>/rolls`) so the GM sees them in the companion's GM view; nothing is shown inside OBR.

## Out of scope
OBR's own dice tray (no extension API). Dice+ / dddice integration is unverified and not needed.
