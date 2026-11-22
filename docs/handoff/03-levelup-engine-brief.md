# Brief A: level-up engine + PC audit/fix tool (GeezSheets repo root = current folder). Node + pure JS, no deps.

Rules edition: D&D 5e **2014 SRD** (data/class_levels.json, data/classes.json, data/spells.json, data/features.json are 2014 API dumps) plus Tasha's options already in use
(Favored Foe, Dual Wielder etc. appear on sheets). Where the SRD has no data (non-SRD subclasses, third-casters), use hand-written tables you put in `data/subclass_features.json`.
Do NOT edit companion.html, sheet.html, CHANGELOG.md or anything under js/vtt, js/rodeo. New files only: `js/levelup.js`, `js/test/levelup.test.mjs`, `data/subclass_features.json`, `tools/audit-pcs.mjs`.

## Data you can read
- `data/class_levels.json`: `{classIndex: [{level, prof_bonus, features:[{index,name}], spellcasting:{cantrips_known, spells_known, spell_slots_level_1..9}, class_specific:{...}}]}`.
- `data/classes.json`: array, `hit_die`, `saving_throws`, `spellcasting` info.
- `data/spells.json`: spells with `level` and `classes:[{index}]`. `data/features.json`: SRD features with `desc[]`.
- A snapshot of the live PCs is at `docs/backup-pcs-2026-11-21.json` (object of entities keyed by id; filter `kind==='pc'`). Character data is in `entity.data`:
  `level, class, subclass, species, stats{str..cha}, combat{hp_current,hp_max,hit_dice:"4d8",proficiency_bonus,ac,speed,initiative_bonus,...}, saves{str..cha:number, proficient:[..]},
  skills{key:{bonus,proficient,expertise}}, senses{passive_perception,...}, spellcasting{ability,spell_save_dc,spell_attack_bonus,slots:[null,n1..n9],slots_used:[null,...],spells:[{name,level,prepared_type,cast_time,duration,concentration,damage,damage_type,to_hit,save_stat,notes,beginner_tip,upcast}]},
  abilities{key:{label,effect_desc,kind,activation,recharge,max,current,die,save_dc,save_stat}}, attacks[{name,type,to_hit,damage,damage_type,notes}], text_blocks{features_traits,...}`.
  Firebase turns empty arrays into `{"%EMPTY":"array"}`; treat as `[]`. Slots arrays are 10 long with index 0 null (some PCs have shorter arrays: normalise).

## `data/subclass_features.json`
Hand-written, keyed by `"<class>/<subclass name lowercased>"` for every subclass actually on a PC: Life Domain, Circle of the Land (Forest), College of Glamour, Gloomstalker (Gloom Stalker),
College of Lore, Battle Master, College of Dance (treat as the Tasha-style Dance bard: Dazzling Footwork L3, Inspiring Movement L6), Eldritch Knight, Transmuter, Assassin, War Domain.
Each: `{ features: {"3":[{name, desc, kind?, activation?, recharge?, max?}], "5":[...]}, alwaysPrepared: {"1":[spell names],"3":[...],"5":[...]}, caster: "full|half|third|none"?}`.
Include every feature through level 5 with short accurate rules text (what you roll, DC, uses). Gloom Stalker: Dread Ambusher (+WIS to initiative, +10 ft first turn, extra attack +1d8, round 1), Umbral Sight, Disguise Self always prepared at 3,
Iron Mind at 7 (not yet). Domain/circle spells per level. Eldritch Knight and Arcane Trickster need a third-caster table (cantrips, spells known, slots by level 3-20) here since the SRD lacks them.

## `js/levelup.js` (ES module, pure, no DOM/Firebase; works in Node and browser; loads JSON via an injected `data` argument so it never fetches itself)
Export:
- `profBonus(level)`; `abilityMod(score)`.
- `attacksPerAction(pc)` -> `{normal:n, round1:n, notes:[..]}`: Fighter 5/11/20 -> 2/3/4; Ranger, Paladin, Barbarian, Monk, Bard-Valor/Swords L6 -> 2 at 5 (6 for bards); Gloom Stalker adds +1 on round 1 (Dread Ambusher); Action Surge note ("+1 Attack action: attacks again"); Eldritch Knight same as fighter.
- `expectedSheet(pc, data)` -> what a correct sheet at `pc.level` must have: prof bonus, hit die count, spell slots, cantrips known, spells known/prepared counts (use class_levels `spellcasting`; wizard prepares INT mod+level, cleric/druid WIS mod+level, paladin CHA mod + half level;
  bards/rangers/sorcerers/warlocks use spells_known), spell save DC (8+prof+casting mod) and spell attack (prof+casting mod), save bonuses, skill bonuses (prof / expertise / Jack of All Trades half-prof on non-proficient for bards), passive perception, class + subclass features through that level (from class_levels + subclass_features),
  Extra Attack feature when applicable, HP max expectation range (hit die average per level + CON mod, informational only).
- `auditPc(pc, data)` -> array of issues `{id, severity:'fix'|'review', path, message, expected, actual, patch}`; `patch` is a set of dotted paths under `data.` (e.g. `data.combat.proficiency_bonus`) -> value, only present when the fix is mechanical and safe:
  proficiency bonus, spell DC/attack, slots, hit_dice string, saves/skills/passive scores (shift proficient ones by the prof delta), attack `to_hit` (shift by prof delta, also update the "d20+N" text in `notes`), `save_dc` numbers and "DC N" text in ability `effect_desc` that follow 8+prof+mod,
  a mis-levelled spell (compare with data/spells.json level), duplicate spell names, MISSING class/subclass features (add as `abilities.<key>` cards with SRD desc or subclass_features desc), missing Extra Attack (add as an ability card), missing always-prepared domain/circle spells,
  too few cantrips/spells -> add recommended spells (see below). `severity:'review'` (no patch) for: spells not on the class list, caster-less classes with spells and no slots (e.g. a Rogue with Cleric spells), spell counts above the allowed number, maneuver counts above the allowed number, anything ambiguous.
- Recommended spells: a small curated table inside levelup.js (or a JSON) of good picks per class and level (e.g. Cleric L3: Spirit Guardians, Revivify, Beacon of Hope; Bard L3: Fireball? no: Hypnotic Pattern, Fear, Dispel Magic; Ranger L2: Pass Without Trace...), each must exist in data/spells.json with `classes` including the class; build the new spell objects with `{name, level, prepared_type:'prepared'|'known', cast_time, duration, concentration, damage?, notes, beginner_tip:''}` taken from spells.json (`casting_time`, `duration`, `concentration`). Never remove existing spells automatically.
- `planLevelUp(pc, data, {hpMethod:'average'|'roll', rng})` -> `{toLevel, patch, summary:[lines], choices:{asi:boolean, newCantrips:n, newSpells:n, subclassNeeded:boolean, maneuvers?:n, other:[...]}}`.
  Patch: level, hit_dice, hp_max (+ average `floor(die/2)+1 + CON mod` min 1) and hp_current (+ same gain), prof bonus and everything that follows from it (reuse the audit logic: run `auditPc` on the leveled copy and merge patches), new slots, new features (cards), always-prepared spells, Extra Attack, ASI at 4/8/12/16/19 (fighter also 6/14, rogue also 10) flagged as a choice (do not change stats).
- Everything deterministic given `rng`.

## `tools/audit-pcs.mjs` (Node, ESM)
Usage: `node tools/audit-pcs.mjs [--snapshot docs/backup-pcs-2026-11-21.json] [--to-level 5] [--only <name>] [--apply]`.
- Reads the snapshot (default) or fetches `https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities.json` with `--live`.
- For each PC (kind==='pc', not `data._sheetsDeleted`): if `--to-level N` and level < N, plan level-ups one level at a time (average HP); then audit; print a readable per-character report (fix list + review list + choices pending) and write the combined patch to `docs/pc-patch-<date>.json` (`{entityId:{dottedPath:value}}`).
- `--apply`: for each entity, `PATCH https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities/<id>.json` is NOT allowed to use dotted keys with arrays carelessly; implement by reading the live entity, applying the dotted-path patch to the in-memory object (arrays stay arrays; Firebase will store them), and writing back only the changed top-level `data/<section>` subtrees with `PUT .../entities/<id>/data/<section>.json` (sections: level, combat, saves, skills, senses, spellcasting, abilities, attacks, text_blocks). Before writing, compare the live subtree with the snapshot subtree; if they differ, skip that entity and report "changed since snapshot". After writing, re-read and verify. Write also `meta.updated_at`/`meta.updated_by:'levelup-tool'`. Without `--apply` it is a dry run and writes nothing to Firebase.
- Keep empty arrays encoded the way Firebase expects: do not write `[]`; instead remove the key or use `{"%EMPTY":"array"}` exactly as the existing data does (copy the convention: grep how existing entities store empty arrays).

## Tests (`node --test js/test`)
Pure tests with a tiny hand-made PC fixture for: profBonus table, attacksPerAction (Fighter 5 = 2, Gloom Stalker 5 = 2 normal / 3 round 1, Fighter 11 = 3), expected slots for Cleric 5 (4/3/2), Ranger 5 (4/2), Bard 5 (4/3/2), Wizard 3 (4/2), Eldritch Knight 3 (2 slots L1), auditPc catches proficiency +2 at level 5 and shifts to_hit by +1, planLevelUp Kairon 4->5 gives 3rd-level slots (2), prof +3, HP gain average. Run them and make them pass.

## Hard rules
- Never write to Firebase unless `--apply` is passed; never pass `--apply` yourself. Dry run against the snapshot only.
- Report at the end: files created, test result, and a printed dry-run summary of the patch counts per character.
