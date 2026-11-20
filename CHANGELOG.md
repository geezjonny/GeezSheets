# Changelog

## 2026-11-19

### GeezSheets
- The new VTT (Dungeon Table) replaces the old campaign page: it is now the site's `index.html`, with its code in `js/vtt/`.
- The old campaign page, its scripts and styles, and the `old-*` pages moved to `old/`. The character sheet (and the scripts it loads) stays in place.
- Everything not used by the new VTT (companion, tools, map converter, stamps, world maps, props, textures and more) moved to `Archive/GeezSheets`, outside this repo, as a working copy of the old app for testing.

### VTT (Dungeon Table)
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
