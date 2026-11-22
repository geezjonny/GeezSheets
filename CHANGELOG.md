# Changelog

## 2026-11-21

### Companion: new mobile character page (companion.html), spec agreed
- **New page `companion.html`:** a phone-friendly character companion for the table. Front page has portrait, HP (damage, heal, temp HP, death saves), spell slot pips, core stats, conditions and concentration. Tabs for Skills, Spells, Gear and Items. `sheet.html` is untouched and stays as the fallback.
- **Spec written (`docs/companion-spec.md`):** every spell, attack and feature will spell out what to roll and what to add (upcasting and subclass bonuses worked out), the sheet does the rolling and posts to the shared roll log, and Owlbear shows that feed plus a GM "Call roll". Tabs will be Home, Skills, Feats, Spells (cantrips first), Gear, Items and Notes. A GM party view and one-button leveling are planned.
- **Audit of the 12 player characters:** most level-5 characters have proficiency +2 instead of +3 (so spell DCs and attack bonuses are one low), Kairon is level 4, several casters are missing 3rd-level or known spells, and Seris and Liora have no Extra Attack card (Liora should make 3 attacks on round 1). Fixes come next, after a full backup (`docs/backup-pcs-2026-11-21.json`).
- **Handoff written (`docs/companion-handoff.md`):** a full work list for Codex in case Claude runs out: level-up engine, data fixes, roll recipes, Feats and Notes tabs, GM view, Call roll, Owlbear roll feed.
- **Level-up engine and character fixes (applied to all 12 characters):** daddies are level 5 (Kairon levelled up from 4), disney are level 4. Proficiency bonus is +3 for level 5, so spell save DCs, spell attacks, weapon attacks, saves, skills and passive scores were corrected. Slots, hit dice, Bardic Inspiration d8 and Preserve Life (25 HP) updated. Added Extra Attack (Seris, Liora), Font of Inspiration, Destroy Undead, Sneak Attack, Cunning Action, Assassinate, Arcane Recovery and other missing features. Filled in missing cantrips and spells (cleric, bards, druid, ranger, wizard, Eldritch Knight, domain and circle spells), fixed Hypnotic Pattern's level and removed a duplicate Cure Wounds. Liora's Archery (+9) and Seris's Dueling (+6 damage) now show on their attacks, and Gloom Stalker initiative adds WIS. Full backup before the change: `docs/backup-pcs-2026-11-21.json`.
- **Needs your decision (listed in `docs/pc-audit-2026-11-21.md`):** Seris knows 4 maneuvers (level 5 allows 3); Kairon has Land's Stride and Timeless Body early and Shocking Grasp (not a druid spell); Kristoff has Eldritch Blast, Shield of Faith, War Magic and Eldritch Strike that do not fit an Eldritch Knight at level 4; Esmeralda has Fire Bolt (not a bard spell); Mushu has cleric and druid spells but no spellcasting; ability score increases at level 4 are not checked.
- **Companion now has recipes, 7 tabs and roll calls:** every spell, attack, skill, save, initiative and death save opens a panel that says exactly what to roll and what to add (for example Cure Wounds at a level 2 slot: 2d8 +4 WIS +4 Disciple of Life), with a slot picker, optional extras to tick (Hunter's Mark, Sneak Attack, Dread Ambusher, Guidance...) and a Roll button that posts to the shared roll log. Tabs are Home, Skills, Feats, Spells (cantrips first), Gear, Items and Notes; the Gear tab shows how many attacks you get (3 on round 1 for Gloom Stalker). When the GM calls a roll, a gold box shows the player's own numbers with Advantage and extras. Cantrip damage on attack cards now scales with level (Sacred Flame 2d8, Vicious Mockery 2d4 at level 5). Opened in the browser for Ashara: Home, Spells and Gear render with the fixed numbers.
- **Scope decision:** no new Owlbear extension. Players use stock OBR for the map and the companion for everything else, and the GM's Call roll will live in the companion's GM view.
- **Not yet tested:** a live roll call, saving a note, and everything on a real phone.
- **Still to do:** roll recipes and roll buttons in the companion, Feats and Notes tabs, GM view and Call roll, level-up button, applying the data fixes, the Owlbear roll feed. The companion has not been opened in a browser yet.

### VTT: old dd2vtt maps import, reference picture, Replace tool, bucket fix
- **dd2vtt import works again:** maps with doors (24 of the 40 in `battlemap/`) were silently failing to import. They load now, including bloom-castlegrounds.
- **Reference picture:** importing a dd2vtt can show its picture behind the grid so you can trace walls, doors and lights over it. It is never saved: scenes and exports stay picture-free. Show / hide and opacity are in the View menu and the Reference button, with an info panel and Copy base64.
- **Replace tool (View > Replace...):** swap a material or kind across the scene while keeping the category (walls, floors, roofs, doors, props, lights), e.g. every stone wall to brick or every wood door to iron. Pick From / To, see how many items change, apply in one undoable step. An eyedropper picks from the map, and right-click gives "Replace all like this...".
- **Paint bucket respects walls:** it leaked across the whole map on imported cave maps with diagonal walls. It now stops at any wall or door.
- **Still to do:** 3D view is lackluster and needs a pass (see the to-do list); the View menu's Reference line has no tick; the Replace window layout is cramped.

## 2026-11-20

### VTT: new tools and tidy-up (built with Codex, tests pass, not clicked through yet)
- **Initiative:** every token on the map joins; start with "Roll for all", "Roll for NPCs only" or "No rolls". Loading a scene now brings its initiative back.
- **Pause:** the GM can freeze the table; players see a "Paused" banner and can't move. A small strip shows the scene, round and whose turn it is.
- **Scenes and drawing:** duplicate a scene; place and edit map text labels; draw arrows, shapes, freehand and notes on the map (Marks) that fade or can be pinned.
- **Effects:** conditions can have durations that tick down each round, plus resistances, vulnerabilities and AC / attack / save bonuses.
- **Journal:** the GM writes pages and shares them with players.
- **Explored fog:** places you've seen stay dimly revealed, with a reset for the GM.
- **Generate dungeon:** a seeded room-and-corridor generator in the Build menu.
- **Doors like walls:** place doors by clicking a start point and an end point (or dragging), with a preview.
- **Build windows:** Lights now matches the other windows and has an intensity slider; the Token window is restyled to match; all Build windows are the same width.
- **Hidden things:** an audit pass to make sure players can't see hidden traps or fogged content on screen.
- **Still to do:** Label, Fog and Puzzle windows in the same style (Logic from right-click on an object), and a click-through of everything above. See the to-do list.

### VTT: Table Chat (webcam + mic)
- **Built-in video chat:** a new **Chat** button in the menu bar opens a floating video panel right in the VTT. Everyone joins the same call, and it's just the video: no bars or menus, only a mic, camera and leave icon floating on your own tile.
- **"Join the table" card at page load:** players pick which character they are (it also sets your Me button, so your token is yours), tick camera and mic, and one click joins the call. The GM just clicks join. Your browser then asks for camera and mic access. "Skip video" closes the card, and `?nojoin` hides it.
- **Your call name is your character:** the call uses your character name, or "GM" for the GM, so it lines up with your token.
- **Table Chat is a normal VTT window:** the same title bar, snapping to other windows and remembered position as the Build windows, with a slim leather and brass look inside. You can resize it. Closing it (the x, the Chat button or the leave icon) disconnects you from the call and turns off your camera and mic; opening it again reconnects.
- **Preview with fake players:** add `?fake=5` to the VTT address to fill the call with animated stand-in players (one with camera off, a moving speaker highlight) and see how a full table looks.
- **Tokens shake when their player talks:** the call reports who is speaking (your own mic too), and the token with that name shakes on the map. You join the call under your "Me" character, so your name lines up with your token.
- **Also its own page:** `videochat.html` works standalone with `?room=` and `?name=`.
- **Next idea written up:** proximity chat (voices fade with distance between tokens) is planned in the to-do list.
- **Not tested with a second real person yet.** Players behind strict firewalls may need a TURN relay, and the close button only hides the panel without muting.

### VTT: Build Tools
- **Build Tools window + one small window per kind:** any Build item opens a Build Tools window (Select, Erase, Shape, Paint brush, Paint bucket) and that kind's window (Floors, Walls, Doors, Roofs, Lights, Props). Each shows your 5 most recently used swatches as icons with a dropdown underneath for the rest. They stay open until you close them, so you can pick a floor, draw it, pick a wall, draw it, pick a prop, place it, without going back to the menu.
- **Build Tools is a row of icons** (cursor, eraser, rectangle, brush, bucket; hover for the name), and Floors, Walls, Roofs, Doors and Build Tools are all the same width so they line up.
- **Object opens its own window** (plate, tripwire, switch, spawn and the rest) like the other kinds, with recents and a dropdown. Erase is no longer in the Build menu; it lives in Build Tools. The Props window matches the others' width.
- **The window you touched last is what you draw with:** it gets an outline, each remembers its own material, and brush and bucket grey out where they don't apply.
- **Windows snap and connect:** drag a window near another (or the screen edge) and it snaps flush; windows left touching move together. Shift while dragging pulls one out, Alt turns snapping off.
- **Tools strip can dock:** the x on Tools moves Select, Ruler, Ping, Dice, Grid, Fit and 3D into the top right of the menu bar; the small button there floats it again.
- **"Draw walls around it" is now a checkbox in the Floors window** and keeps your choice. The extra bar that popped up at the top when picking a tool is gone, and so is the "Prototype" footer text.

### VTT: import maps from the GeezSuite mapmaker
- **Import GeezSheets map (.geezmap.json)** in Import / Export brings in a whole map from the mapmaker: every floor, walls, doors, lights, props, roofs, labels and stairs, with an option to also set time, weather and light (dark maps become fog that lights reveal).
- **Puzzle rules and hand-placed fog come across too:** plates, switches, spawns and the like keep their when/then rules, and rules that open a door or light still work on the imported door or light.
- **Many more things to build with:** about 130 props (with rotation, scale and mirror), decals as props, 22 floors, 12 walls, 6 roofs and 9 door kinds (portcullis, bars, secret, arch, curtain, double, window) that act the way they look.
- **Prop palette like Dungeondraft:** categories down the side, a search box, thumbnails, and random rotation and scale options.
- **Elevation and several floors:** raised and sunk ground is shaded and outlined, and rises in the 3D view. Floor up / Floor down buttons switch levels, and players follow the GM's level. Sight and fog only count things on the same level.
- **Labels** written on the map show for players; the GM can edit or delete them.
- **Export GeezSheets map (.geezmap.json)** in Import / Export saves the whole scene (every floor, materials, door kinds, props, roofs, labels, stairs, fog, time and weather). The file is also a valid .dd2vtt, so other VTTs can open it too. Puzzle rules are not exported yet.

### Dashboard (new GM page, dashboard.html)
- New GM dashboard: movable, resizable floating windows that read and write the same Firebase data as the sheets and the VTT. A top bar shows or hides each window, and the layout is remembered. It now looks like the VTT: leather, brass, parchment and ink.
- HP: add any PC or NPC from a dropdown (press + for more). HP bar and number, click to set HP, or type an amount and press Dmg or Heal (temp HP soaks damage, healing stops at max, death saves reset above 0). Spell slot pips in a dropdown. HP, slot and condition changes are written to both the sheet and the VTT, so everything stays in sync.
- Conditions: a palette of conditions. Drag one onto a character in the HP window to apply it (chips show on the row, click x to clear).
- Notes: a GM scratchpad with draggable snippets. Drop a snippet on a character to add it to their note (every character also has a 📝 note in the HP window).
- Initiative: start, next turn and end, with an editable turn order. Time: slider and presets (dawn, noon, dusk, night).
- Weather and Music (track, volume, ambience), plus a Soundfx window with a searchable button for every effect.
- Roll call: call for rolls and watch the answers come in. Dice: a GM roller the table can see.
- Party: AC, speed, initiative, passive Perception, spell save DC and gold for every PC. Handouts: add, list and remove.
- Scenes: load and save scenes. Drag the current weather, time of day, music or an ambience loop onto a scene and it applies itself whenever that scene loads in the VTT.

### VTT (Dungeon Table)
- New Sight trigger: a Sight object sees players or NPCs within a range (walls and closed doors block it), which can fire rules.
- New "Start initiative" effect: when it fires, everyone joins initiative with a d20 roll and the highest goes first.
- Players can't move their tokens once initiative has started.
- New GM command console (Command button, or press /): type `roll all dex dc15`, `roll pcs wis save dc13 adv`, `init start|next|end`, `move goblin 5,3`, `close vault door`, `hp goblin -5`. Also available as `vtt.run("...")` in the browser console.
- Players can no longer walk through walls, closed doors or windows. Open doors let them through.
- Only the GM can drag tokens now. Players move their own character with WASD or the arrow keys, one cell per press.
- Easy attacks for the GM: right-click any token > Attack… lists its weapons, cantrips and spells from its sheet. Pick one and a ghost follows the cursor on the map (range ring, and the right shape for spheres, cubes, cones and lines; targets light up red). Click a cell or token and the attack roll starts: d20 plus the bonus, with Hit/Miss shown when the target's AC is known. Then roll damage (doubled dice on a natural 20) and apply it to the target's HP, or half for a made save.
- The token whose turn it is in Initiative now has a pulsing gold ring on the map too.
- The GM's right-click on any token (enemies and NPCs included) now opens the movable floating window, not just PCs. NPC tokens also get a "View stat block" window.
- Natural 20s and natural 1s now get a full-screen highlight with their own sound once the dice settle: a golden burst and rising chime for a 20, a red shaking vignette and sad wah-wah for a 1. Everyone at the table sees it, and with advantage or disadvantage only the die that counts triggers it.
- Right-click a PC token > Equipment opens a window with Helmet, Armor, Shield and Weapon. The GM picks from that PC's inventory; hover any slot to see what it does (AC, Stealth penalty, strength requirement, weapon damage). It saves to the PC's sheet, so it updates live both ways.
- Roll Call now applies the rules for you. Chain Mail (or any noisy armor) means disadvantage on Stealth, armor the sheet isn't trained in means disadvantage on STR/DEX rolls, and Poisoned, Frightened and Restrained add their own penalties. Advantage and disadvantage cancel out.
- The player's roll window shows the result and why ("Rolling with disadvantage: Chain Mail, noisy armor") and players can no longer switch it, so rolling stays one click. The GM can still call advantage or disadvantage for everyone.

## 2026-11-19

### GeezSheets
- The VTT now reads its Firebase settings from `js/firebase-config.js` (one place to change them) and uses one Firebase version everywhere, so the page downloads less.
- The new VTT (Dungeon Table) replaces the old campaign page: it is now the site's `index.html`, with its code in `js/vtt/`.
- The old campaign page, its scripts and styles, and the `old-*` pages moved to `old/`. The character sheet (and the scripts it loads) stays in place.
- Everything not used by the new VTT (companion, tools, map converter, stamps, world maps, props, textures and more) moved to `Archive/GeezSheets`, outside this repo, as a working copy of the old app for testing.

### VTT (Dungeon Table)
- Right-click a token > Inventory opens a floating window with what it carries and its coins (pp, gp, ep, sp, cp). A PC's items and coins are the ones on their GeezSheets sheet, live both ways; other tokens keep their own. The GM adds items from the SRD (autocomplete) or any custom name with an optional description that shows as a tooltip, changes quantities, removes items, and adds or spends coins (Shift = 10). Players can look but not edit.
- Token right-click menu has a new "Light: hold torch" option (GM). The token glows, lights the 3D scene and clears fog around it as it moves; click again to put it out. Everyone sees it, since it's saved on the token.
- Tokens can now be dragged in the 3D view: press on one and drag along the floor, and it snaps to the grid on release (players can only move their own). Dragging anywhere else still turns the camera.
- Rain, snow and the day/night tint now show in the 3D view too (they were hidden behind it).
- Roofs now show in 3D: a gabled roof with shingles (or wood/stone) sits on the walls. Players see it solid until a PC token is inside, then it lifts to show the room; "Lift roof" still works by hand. The GM sees closed roofs see-through.
- Right-clicking a PC token opens a draggable floating window (HP, damage/heal, hide, picture, initiative, conditions, settings) that stays open and follows the sheet's HP. Enemy and NPC tokens keep the quick popup.
- Roll Call rebuilt: pick the stat (Initiative, Save, Skill, Ability or Custom), set a DC, then tick which tokens on the map must roll. Players get a floating window that takes their modifier from their GeezSheets sheet, with Advantage/Disadvantage, Bless, Guidance, Resistance, Bardic Inspiration and an Other box. The dice roll for everyone, results show pass/fail against the DC, and the GM can roll for NPCs or close the call.
- Build > Token is now a floating window with a dropdown of PCs and NPCs (or just type a name), then click the map. It opens blank each time.
- GeezSheets write-back: right-click a PC token (GM) to Damage or Heal, written straight to their sheet the same way the sheet does it (temp HP first, death saves reset). Ticking a condition on a PC token also adds it to their sheet.
- Live HP: PC tokens show their real HP from the sheet on the map and in the token menu, and update the moment the sheet or the GM changes it.
- "View sheet" now opens the character sheet in a floating, draggable, resizable window instead of a new tab.
- New menu layout: File (Scene, Import/Export, Undo, Redo), Build, Table (Initiative, Roll Call, Handouts, Images), Atmosphere (Time, Weather), Audio and View. The old VTT menu is gone.
- A small floating Tools strip holds the things you flip constantly: Select, Ruler, Ping, Dice, Grid, Fit and a 2D/3D toggle (players get it too).
- The 2D map now scales to fit the window, so the page never scrolls, whatever shape the map is.
- Import: pick where a map goes (add to the current scene, or a new scene that saves the old one first). Walls, doors and lights only. New "From GeezSheets places" loads battle maps (like castle grounds) and "From GeezSheets maps" loads raw maps, both read-only from the live GeezSheets data. Maps up to 100 cells wide.
- Right-click a door or window (or click it with Select in 3D) to Open or Close it.
- Grid button now draws grid lines over the whole 2D map; 3D has a ground plane and the camera frames maps that have no floors, and the 3D view fills the window.
- New Audio menu in the menu bar: GM plays shared music, ambience loops and sound effects (from the GeezSheets library) for everyone; each player has their own mute and volume.
- VTT > Handouts: paste an image URL or upload a picture and it pops up in a closeable floating window on every screen.
- VTT > Roll Call: ask the table for initiative, a save, a skill or a custom d20; players get a Roll button, the GM sees results sorted high to low.
- VTT > Time and Weather: a time-of-day slider tints the map, and Clear / Rain / Snow (with a colour swatch) animates over the 2D and 3D views for everyone.
- Windows: Build > Door > Window places a window (glass in 2D and 3D, sight passes through).
- Puzzle objects (plate, gauge, switch, dial, light, floor, spawn, stone, catapult, tripwire) have new drawn icons.
- Scene, Image, Import, Handouts and Roll Call now open as floating windows instead of dropdowns.
- Menu bar: only one menu open at a time; hovering another item switches to it.
- Fixes: ambience loops no longer stop right after starting, Night in the Time window works, weather swatches hide on Clear, and closing a floating window clears its menu check mark.
- The Dice window no longer opens by itself when the page loads; use the 🎲 button.
- Every Build item (Floor, Fog, Wall, Door, Roof, Light, Token, Prop, objects) now opens the same pair of floating, draggable windows (like Aseprite/Photoshop): a tool window (Select, Erase, plus Shape/Line, Paint brush, Paint bucket or Place depending on the item) and a Swatches window of materials where they apply. Picking another Build item reuses the windows; finishing the tool closes them. Erase only removes the type you're working on. Fog gained a paint brush and bucket.
- Light has a colour picker with eight presets in its Swatches window; new lights use the chosen colour.
- Roof has a swatch of roof types (thatch, slate, tile, wood, stone) and Prop has a swatch of every prop to place.
- Puzzle now opens as two floating windows: Puzzle (Select and place objects) and Logic (inspector, When/Then, saved groups) instead of the bottom panel.
- 3D view now has the cartoon cel-shaded look: banded toon lighting, dark ink outlines, a dusky sky, and a slightly softened (10% less saturated) palette.
- 3D floors, walls, doors and props have hand-inked textures (wood planks, stone blocks, cobbles, riveted iron, grass, water, sand and more).
- Fixed striped flickering on 3D floors where rooms and floor strips overlap.
- Doors now replace the wall under them in both 2D and 3D. Delete or move the door and the wall comes back.
- Saved puzzle groups can be edited: click "edit" on a group, change it, then "Update group" (or "Cancel edit").
- Started shared plumbing for upcoming features: draggable floating windows and a movable VTT tool bar.
- The VTT tool bar is now a small round ☰ button you can drag anywhere (it remembers its spot); click it to open the tools beside it, same as the build button.
- VTT tools now work in 3D: Zoom/Out/Fit move the 3D camera, and Ruler and Ping work on the floor (Ping shows a ring and beam for everyone). Grid is hidden in 3D.
- New 3D Camera button: off by default so it can't get in the way of other tools; turn it on to left-drag pan, scroll zoom and right-drag orbit.
- New 3D Select button: click a token, prop, door, light or wall to ring it and open the same settings menu as right-clicking it in 2D.
- The VTT tool bar now has the same buttons in 2D and 3D, in this order: Select, Camera, Scene, Image, Ruler, Ping, Dice, Import. In 2D, Camera lets you left-drag to pan the map.
- The top bar is now a thin Windows-style menu bar (about half the height) with Build, VTT and View menus; Puzzle sits beside them for the GM. The floating round Build and VTT buttons are gone, and the same tools drop down from the menu items.
- New View menu switches between 2D and 3D.
- Grid button now works in 3D: it shows or hides grid lines over the whole map.
- Camera, Zoom and Out buttons are gone; use the mouse instead. In 3D: scroll zooms, scroll-button drag orbits, Space + scroll-button drag pans. In 2D: scroll zooms, scroll-button drag pans.
- Also in this batch: dice roller (with 3D dice), initiative tracker, token conditions and pictures, scene saving, image adding, DD2VTT map import, fog-of-war vision, and new door sounds.

## 2026-11-18

### VTT (Dungeon Table)
- The build button is now a floating round ⚒ you can drag anywhere (it remembers its spot); click it to open the build menu beside it.
- Settings moved into right-click menus: place a part with build > part > click, then right-click it to change material, colour, light radius, door direction, prop kind, token name and more.
- Doors, lights and all other objects can now be named from their right-click menu.
- New 3D button: see the map in 3D with walls and doors raised 2 units (10 ft), real colored lights and shadows. Drag to orbit, scroll to zoom. Open doors leave a gap you can see through.
- Puzzle rules and the map now live in separate `puzzle/` (rules, object kinds, tests) and `vtt/` (map UI) folders, so each is easier to change.
- Traps can be hidden: players don't see them, the GM sees them faded and can right-click to reveal or hide.
- New ink-and-parchment look: paper texture, hand-drawn walls, stamp-style tokens.
- Adding a token (+ > Token) now has a dropdown of every NPC from the main app's Firebase data, plus a Blank NPC option. Picking one fills in its name and HP. This only reads the data; nothing in the main app is changed.
- The + > Token dropdown now also lists our PCs (in their own group above the NPCs). Picking one fills in their name and HP from their sheet, and the token is linked to that character.
- Right-click any token (players too) to see its name and HP. For PCs the HP is read live from their sheet, and a "View sheet" link opens their GeezSheets page. Read-only: nothing in the main app is changed.
- Open doors now show as a dotted line, so you can see a trigger (e.g. three plates held down) has worked. Before, open doors looked the same as closed ones.
- Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) now undo and redo any map edit: walls, floors, fog, props, tokens, objects, puzzle rules and more.
- Fog and Floor tools have a bucket fill option: click inside a walled room and it fills the whole enclosed area, stopping at walls and doors.
- Walls and doors can be wood, stone, cobble or iron. Floors can also be gravel, sand, grass, water, mud or ice. Lights come in colors (torch, white, red, blue, green, purple, cyan, pink).
- New `vtt/fx/` folder for sound effects: drop in `click` and `door-open` audio files. Until then, short beeps play on clicks and when a door opens.
- Removed the HP strip at the bottom of the screen. The GM now adjusts an enemy's HP with − / + buttons in the token's right-click menu.
- Right-clicking objects, props, fog and roofs now opens a menu to choose from, instead of instantly toggling. It stays open until you pick something or click away. Fog and roofs can also be deleted from it.
- Tokens and props can now be hidden from players too (GM sees them faded), via "Hide from players" / "Reveal to players" in the right-click menu.
- Lights now clear fog around them for players. When placing a light, set how many cells of fog it clears (default 2, 0 for none); turning the light off brings the fog back.
