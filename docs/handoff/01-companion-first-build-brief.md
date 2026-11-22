# Brief: build `companion.html` (mobile character companion) in C:\Users\jonge\Documents\GitHub\GeezSheets

Create ONE new file, `companion.html`, a mobile-first single-character companion page for a D&D table. Do NOT edit `sheet.html`
or any other existing file (sheet.html is the reference and the fallback). Single file: inline `<style>` and one inline
`<script type="module">`. No build step, no npm, no frameworks, no CDN. Served statically (`serve.cmd`, http://127.0.0.1:8000/companion.html).
Read `sheet.html` first: copy its approach to data, writes, rolls and palette (CSS variables in its `:root`: slate + emerald,
`--bg:#0f172a --panel2:#1e293b --border:#334155 --gold:#34d399 --text:#e2e8f0 --dim:#94a3b8 --red --green --warn --magic --skill --weapon`).

## Boot (copy exactly from sheet.html lines 4-8 and its imports)
- Same first `<script>` that forces `?db=gaia&gaia=firebase` via location.replace, and `<script src="js/firebase-config.js">`.
- `import { db, ref, get, set, update, push, onValue, runTransaction } from "./js/rodeo-firebase.js";`
- Character id: `?char=<id>` (legacy ids like `kairon`), else localStorage `companion.char`. If none: show a picker listing
  `characters/pcs` (name, class/level, campaign; skip `__oracle__` and npc records, same filter as sheet.html loadParty).
  Picking stores it, calls `db.selectPC(id)` and updates the URL with `history.replaceState` (`?char=`). A small "switch" link returns to the picker.
- Player identity comes from `?char=` (see js/gaia-db.js line ~23); the page must also call `db.selectPC(id)` after picking.
- Load static data like sheet.html does: `data/spells.json`, `data/skills.json`, `data/equipment.json`, `data/magic_items.json`,
  plus `data/conditions.json` (15 items: `{index,name,desc:[...]}`). Index by lower-case name.
- Live data: `onValue(ref(db, 'characters/pcs/'+id), snap => ...)` for the whole character; keep one `pc` object and re-render the active view
  on every change. Never lose input focus or the typed HP amount on re-render (keep that value in a variable, restore after render).
  Use event delegation (`data-act` attributes), not inline onclick.

## Layout
Mobile first (360px wide, thumb reach, 44px tap targets, safe-area insets), works on desktop as a centred column max 560px.
Top: slim header (character name, "switch"). Bottom: fixed tab bar with 6 tabs: **Home, Skills, Feats, Spells, Gear, Items**.
Remember the active tab in `location.hash`. Everything "spelled out": show rules text inline (collapsible rows are fine, tap to expand), never make
the player open a second place to find a number.

### Home (front page)
- Portrait (circle): `pc.sheets?.traits?.avatar` if non-empty (the character object may not carry `sheets`; check), else `tokens/<file>` whose name matches
  the character name (load `tokens/index.json`, match lower-case, underscores for spaces), else a coloured circle (`pc.token_color`) with initial.
- Name, subline `Lv {level} {class} ({subclass}) · {species}`.
- HP block: bar (green/amber at 50%/red at 25%), `hp_current / hp_max`, `+temp_hp`. Amount input + **Damage** / **Heal** buttons, **Temp HP** field.
  Damage: `await db.damage(id, n)` (gaia action: temp HP first, concentration check, death saves). Heal: copy the runTransaction in sheet.html `adjustHp`.
  Temp HP: `set(ref(db,'characters/pcs/<id>/combat/temp_hp'), n)`.
  At 0 HP show death save pips (success/fail, 3 each), copy `deathHtml` / `deathPip` / `rollDeath` logic from sheet.html.
- Core stats row: AC, Initiative (button: rolls like `rollInitiative` in sheet.html), Speed, Proficiency, Passive Perception, Inspiration (toggle, `update(combat,{inspiration})`), Exhaustion (- / + , `update(combat,{exhaustion})`).
- Six ability tiles (score + modifier). Tapping a tile rolls a check; saving throws are in the Skills tab.
- Spell slot pips per level (tap = same as `toggleSlot` in sheet.html: sets `spellcasting/slots_used/<lvl>`), plus charge-ability pips (`toggleCharge`).
  Show spell save DC and attack bonus. Hide the whole spell block for non-casters (`!spellcasting`).
- Conditions: chips for active ones (tap x to remove) and a "+ Condition" button opening a bottom sheet with all 15 conditions and their rules text; toggling writes
  `update(ref(db,'characters/pcs/<id>/combat'), { conditions: [...names] })` (the adapter turns this into condition.add/remove actions).
- Concentration: toggle + spell name using the same payload as `concentrationControls` in js/vttcore.js
  (`update(combat,{concentration:{active,spell,check:null}})`); if `concentration.check` exists show the prompt "Concentration save: CON DC n" with Roll CON save / Keep / Drop (see js/vttcore.js).
- Rest-free: no rest buttons.

### Skills
Saving throws (6) with bonus and proficiency dot; all skills from `data/skills.json` (fields `index`->key with `-`→`_`, `name`, `ability_score.index`) with the
bonus formula from sheet.html `buildCard` (use `skills[key].bonus` if present else computed), proficient/expertise marks, senses pills, proficiencies &
languages (`text_blocks.proficiencies_languages`). Tap a row to roll `1d20+bonus` (advantage/disadvantage toggle at the top). Tap-and-hold or a chevron expands the skill rules text from skills.json `desc`.

### Feats
Class/species features: every entry of `pc.abilities` (`{label, effect_desc, kind, activation, recharge, die, max, current}`) as cards with full `effect_desc`;
`kind==='charge'` entries get tappable pips (same write as sheet.html `toggleCharge`). Then `origin_feat` (string) and `text_blocks.features_traits` (newline list, pre-wrap).
Include `text_blocks.appearance/backstory/notes` in a collapsed "About" section at the bottom.

### Spells
Header: ability, save DC, attack bonus, `spellcasting.notes`. Slot pips again (same writes). Cantrips, then leveled spells grouped by level (`spellcasting.spells[]`:
`{name, level, prepared_type, cast_time, duration, concentration, damage, damage_type, to_hit, save_stat, notes, beginner_tip, upcast}`; cantrip when `prepared_type==='cantrip'||level===0`).
Row = name, level tag, cast time, concentration badge. Expanded: full description from `data/spells.json` (join `desc` paragraphs; also range, components, duration), plus `notes`, `beginner_tip`.
Buttons: **Cast** (leveled spells only: spends one slot at the lowest level >= spell level that still has a free slot, same write as toggleSlot; if the spell has `concentration`, sets concentration to it; toast if no slot left),
**Attack** (rolls `1d20+to_hit` if to_hit), **Damage** (rolls `damage` dice). Roll results go through the shared `roll()` helper below.

### Gear
Equipped armor and shield (`pc.equipped = {armor, shield}`) with AC; weapon cards from `pc.attacks[]` (`{name,type,to_hit,damage,damage_type,notes}`) with Attack and Damage roll buttons;
look the item names up in equipment.json for properties/weight when found. Coin purse (`coin_purse {cp,sp,ep,gp,pp}`) shown as a row.

### Items
Inventory: `pc.inventory` is an object `{key:{name,qty,category,desc,notes}}` (or array); show name, qty, category, desc (fall back to equipment.json / magic_items.json `desc[0]`), notes.
Group by `category`. Search box. Read-only for players except: nothing writes here (the GM gives items; new items show a toast like sheet.html `watchInventory`).

## Rolls
Copy `rollExpr` from sheet.html (the dice parser) into this file. `roll(label, expr)`: roll, show a toast/overlay with label, detail and total (nat 20 / nat 1 highlighted),
and push `{by:pc.name, char:id, expr:label+' '+expr, detail, total, nat, dice, ts:Date.now()}` to `geezvtt/live/<pc.campaign>/rolls` (same as `doRoll` in sheet.html, campaign = the PC's campaign) so the GM sees it. Wrap in try/catch; if the push fails, toast it and still show the local result.

## Quality bar
- Every write in try/catch with a visible toast on failure ("Not saved: ..."). Players may only write their own PC; do not touch other characters.
- Escape every string from the database (copy `esc` from sheet.html). Fix mojibake in database text (`â€”`→`—`, `â€™`→`’`, `â€œ`/`â€\x9d`→quotes, `â€“`→`–`) with one helper applied when rendering.
- No console errors on load; handle a missing character, missing spellcasting, empty inventory, `conditions` being undefined, `{ "%EMPTY": "array" }` leftovers (treat as empty).
- Respect `prefers-reduced-motion`; no horizontal scroll at 320px.
- Do NOT write anything to the live database while testing. Test with Node-only logic checks if you like (e.g. pure helper functions), and load the page's script for syntax (`node --check` on the extracted module script).
- Do NOT edit CHANGELOG.md.
