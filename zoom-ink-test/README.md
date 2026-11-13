# The Ink Atlas

Hand-tinted parchment-and-ink version of `zoom-test`. The original project is untouched.

Open **http://127.0.0.1:8001** while the local server is running. To start it again,
double-click `Start Ink Atlas.cmd`, or run this from this folder:

```sh
node tools/serve.mjs 8001
```

This is an HTTP app; do not open `index.html` directly. It vendors Three.js and
needs no build or install to run. The server finds token portraits and battlemap
files in the sibling `GeezSheets` folder, just as the original app does.

Hold **W/A/S/D** to move the camera forward/left/back/right relative to the view,
on the surface or in a cellar. Speed follows the zoom level. Typing in fields
pauses movement; releasing the keys or leaving the window stops travel.
Use **Grid on/off** beside **Top**, or press **G**, to toggle the grid in any tool,
including Detail and underground maps.

## Try it

1. Tap **Brackenford**, then **Go**, to fly from the world into the town.
2. Zoom closer and rotate using the compass or turn buttons. Walls are paper,
   corners and silhouettes are ink, and solid forms are shaded by real sun shadows.
3. Switch to **Play**, enable **Cutaway**, and use **Top** to see the interior view.
4. Use **Roll initiative** for the battle grid, or **Ruler** to measure. Each game
   square is **5 feet**; this retains the source app's internal 1.5-metre game unit.
5. Set **Weather > Night** for dark nighttime with warm torch, brazier, and campfire
   light. Night surfaces use actual scene lighting, with faint moonlight rather than
   self-lit paper. High quality supports six nearby fire lights; low supports three.
6. **Menu > Detail > Fine / Simple** compares the new close-range surface detail.
   Fine adds wood grain, worn cobble joints, leaf markings, and sparse decorative
   stones; Simple hides them. The choice is saved in this fork's preferences.
7. **Menu > Motion > Living / Still** controls ambient animation. Canopies sway,
   engraved sea waves drift, rivers flow, flames bend and flicker, and nearby fires
   shed a few embers. Distant movement is gentler. System reduced-motion preferences
   pause these effects, and hidden tabs do not advance them.
8. The existing terrain/detail brushes, cards, lore, tokens, undo, and local saving
   are retained. Menu export/import uses the existing world JSON format.

The fork uses `geeztt-ink-world-v1` and `geeztt-ink-prefs-v1` in browser storage,
separate from the original app. It starts with the source's sample world rather
than silently importing another page's browser saves.

## Underground maps and entrances

Open **Menu > Underground**, name a map, choose its dimensions in 5-foot squares,
and select **Create underground map**. Each new map starts as a walled cellar with
braziers, a few storage props, and return stairs. Choose **Door** or **Trapdoor**,
then **Place entrance** and tap the surface. Clicking the entrance or its label
opens the linked map. Multiple entrances can share a destination.

A town building card also offers **Add cellar / link underground**. Create a cellar
there, or select an existing underground destination. Its trapdoor follows that
building's position, rotation, and floor height. Entrances can be hidden from
players in the Underground manager; entrances in unknown buildings stay hidden.

Below ground, use **Detail** to edit floors, walls, doors, and objects, or **Import
.dd2vtt** to replace the starter layout with imported walls, doors, and lights.
Ordinary DD2VTT embedded images are still skipped. Hearth full-map exports retain their separate ground artwork and native props. Import Undo restores the prior layout.
Tokens, combat, and painted tiles belong to that underground space and do not
overlap the surface or other underground maps.

Click the return stairs or the **Back arrow** to restore the original camera,
tool, grid, and cutaway settings. **Menu > Underground > Bring nearby tokens** brings tokens within
40 feet of the entrance below ground; those tokens return to their original
surface positions when you leave, retaining HP and other fields. Tokens created
below ground remain there. Maps, entrances, edits, and the active session persist
in local saves and world exports; reloading below ground resumes the same map.

`underground.js` owns the saved links and isolated scene, reusing the existing
Detail, Maps, DD2VTT geometry, paper materials, lighting, and token systems.

### Named trapdoors, shared cellars, and concealed entrances

In **Menu > Underground**, use **Place surface trapdoor** before creating a
cellar. An entrance inside a building gets its building's name, with a number
added when needed. Rename it in the manager at any time.

Create one large cellar and open it. Choose **Menu > Underground**, select a
named surface entrance and **Stairs up** or **Ladder**, then **Place linked
stairs / ladder** and tap a clear floor square. Repeat for another building.
Entering a trapdoor frames its own stairs; **Bring nearby tokens** uses that
arrival. Click stairs (or their **Climb to** button in the manager) to emerge
at the matching building. Traveling tokens keep their HP and return near that
exit. The **Back arrow** retains the original return behavior. Click the cellar's
name in the top-left to open its menu: tools, grid, top view, name/dimensions,
stairs, nearby tokens, imports, undo/redo, and return controls. The menu is scoped
to that cellar. The global map list remains under **Menu > Underground**.

Edit **Width** and **Height** in 5-foot squares and choose **Save cellar settings**.
The preview shows the size in feet. Resizing keeps the northwest corner fixed,
adds flagstone floor when growing, and updates the outer walls. Shrinking trims
floor/wall tiles; first move any props, stairs, tokens, or imported structures
that would lie outside the new bounds. Edits and linked entrances stay intact.
Rename and resize changes support Undo/Redo and world saves/exports. From a
surface trapdoor's focused panel, **Cellar settings** opens the same controls
without entering the cellar.
Each surface entrance has one paired exit; placing it again relocates the link.

For a concealed entrance, select **Crate**, **Carpet**, or **Bed** and **Set
cover** in the entrance manager. **Move cover aside** exposes the trapdoor;
**Replace cover** conceals it again. Alternatively, select an existing building
furnishing and use **Hide trapdoor beneath [furnishing]**. Moving or removing that
furnishing exposes the entrance automatically. Covered entrances cannot be
entered or climbed through. The GM retains a labeled manager handle; players
see neither the entrance nor its label. **Players: hidden** independently keeps
a secret entrance hidden even after its cover moves.

Names, links, covers, and staircase placement persist in world saves/exports
and support Undo/Redo. Old cellar maps retain their default return stairs until
individual exits are linked.

## Select and edit props

In **Look** or **Play**, click a prop to open its inspector. Right-click also
works while using another tool. A gold outline marks the selected prop. This
supports Detail objects above or below ground, building furnishings, generated
town barrels/crates/carts, and the movable covers placed over surface trapdoors.

The GM can name a prop, write its contents (one item per line), and configure a
trap with a trigger, DC, and effect. **Save prop** commits these fields. Contents
and trap details each have a separate reveal checkbox; players see only what
the GM reveals. **Trigger trap** and **Disarm trap** track its state; the GM
resolves rolls and damage.

Use the compass-direction nudge buttons to move by **0.5**, **1**, or **2.5 feet**,
or rotate/remove the prop. Placed objects carry their contents and traps across
grid squares; occupied destination squares and walls reject the move. Building
furnishings stay within their room and preserve its access aisle.

**Trapdoor underneath** hides a named surface entrance beneath the selected prop.
It opens an editor for that entrance alone. **Create cellar for this entrance**
creates its destination and paired stairs without leaving the surface. **Choose
existing cellar** starts with destinations linked within 400 feet of the entrance;
**Browse distant cellars** explicitly expands the picker to all maps. The global
map list remains under **Menu > Underground**. Moving or removing
the covering prop exposes the entrance. Contents, traps, placement, and generated
prop edits support Undo/Redo and persist in local saves and world exports.

## Generated building interiors

Tap an ordinary or named town building, then **Look inside**. This enables Play,
the 5-foot grid, and cutaway, and frames its furnished ground floor. Interiors
use the building's actual length, depth, rotation, and foundation height. Near
houses have hollow ground-floor walls and a real doorway; far buildings keep
their inexpensive exterior models. Upper storeys retain their exterior appearance
and are not furnished in this version.

Houses get beds, tables, chests, and cold hearths; stores get counters, shelves,
crates, and barrels. Inns, taverns, smithies, warehouses, shrines, libraries,
workshops, and other building types have their own furnishing plans. Small
footprints fit fewer objects; larger floors can add a back room and more stock.
A reserved aisle keeps the entrance and partition openings clear.

The layout is deterministic per building. Doors, walls, partitions, and substantial
furniture block token movement. Select a furnishing to see suggested cover; cover
is a GM reference, not an automatic attack modifier. The GM can move furnishings
in 2.5-foot steps, remove them, reset the furnishing plan, or open/close the door.
Edits support Undo/Redo and persist in local saves and world exports. Removing
an object leaves everything else in place. Reset furnishings preserves door state.

`interior-layout.js` generates local-space layouts separately from rendering.
`interiors.js` streams up to 16 nearby furnished buildings on High (8 on Low),
reuses the paper materials and shadows, and unloads them at world scale. No new
map or image is needed when a fight starts.

## Rolls belong to the world

Use **Menu > Place existing NPCs** to put the world's existing named residents,
shopkeepers, notable people, and saved ledger NPCs near their homes or workplaces.
A settlement card's **Place town NPCs** limits placement to that town. Ordinary
empty houses do not get invented residents. Existing person tokens, including
ones below ground, are skipped. Placement finds clear, unoccupied squares and
supports Undo/Redo and local saves/exports. Linked resident tokens follow profile
edits; ledger-only tokens offer **Open saved NPC**. NPCs belonging to unknown
settlements remain hidden from players until that settlement is revealed.

GM rolls now commit their results to the saved campaign. Open **Menu > World
ledger** to search people, places, things, events, and factions. Click an underlined
name in a roll, or an **In the world** link, to inspect its entry, related entities,
notes, and the rolls that mention it. **Go** visits its location; **Open source**
opens the corresponding settlement, building, or token when one exists.

Existing names are reused first. Missing named references are created and saved;
for example, a rumour about **The Copper Dragon** establishes an inn on an available
house plot, or creates a small location when no suitable plot exists. Later mentions
reuse that identity. NPCs have saved profiles and homes; objects have locations and,
where supplied by the roll, owners. Records distinguish a rumour from established
facts: creating its subject does not make every claim about it true.

Rolled settlements and special sites are placed automatically on clear nearby land.
Buildings occupy real house plots, and rolled shopkeepers occupy their shops.
The settlement button is now **Go to place**. NPC tokens remain an optional map
representation of the saved person. Replaying the same roll reopens the saved result.
Roll creation and physical placement share Undo/Redo, and the ledger and roll history
are included in local saves and world exports. The ledger is GM-only.

`world-canon.js` provides stable identities, source/owner/home links, saved results,
and the ledger UI. Legacy prose is scanned for names and concrete references;
authored generators can provide explicit `refs: [{name, kind}]` for ambiguous names.
Existing settlement, building, and person cards are indexed when the GM opens them.

## Campaign tone

Fresh rolls favour vampires, zombies, blood cults, illithid influence, occult
societies, and other undead. Narrative fields use a seeded 45% preference for
the campaign pools in `campaign-flavor.js`, with everyday results mixed in.
A single involvement roll keeps about **55% of ordinary NPC rolls free of occult
backstories, secrets, and rare magical finds**. They can still have everyday
problems and private lives. Explicitly supernatural roles remain supernatural.
Separately, **10% of new settlements** share one town-wide pact or conspiracy.
Their notable people, shopkeepers, and generated building residents know the same
secret. The GM's settlement card shows **Shared town secret**; players receive
only outward clues. The pact has a shared identity in the world ledger.
Eligible undead and cult encounters have four times their former weight; terrain,
level, difficulty, and peaceful/combat filters still apply. Vampire and illithid
plots currently use mortal servants and existing creature stat blocks for map
encounters; they do not add vampire or mind flayer combat rules.

Refresh and roll again to see the change. Previously saved cards keep their text.

## Import DD2VTT structures

Open **Menu > Import .dd2vtt**, select a `.dd2vtt` or `.uvtt` file, then choose
**Place on map** and tap a location, or **Import at view center**. Before placing,
you can name the import, rotate it, and choose stone or timber walls.

Each source grid square becomes **5 feet**. Walls, doors, and lights use the
existing ink-and-parchment rendering, shadows, and world terrain. The embedded
base64 image is skipped before JSON parsing: it is never decoded, rendered, or
saved. No terrain or decorations are inferred from that image.

In Look or Play, click a door to open or close it. Imported walls and closed doors
block token movement. **Menu > Imported maps** provides Go, door controls, and
Remove. Placement, door changes, and removal support Undo/Redo; imported structures
persist in local saves and exported world files without needing the source file.
Light color, range, intensity, and shadow settings are preserved; the existing
nearby-light limit still applies.

`dd2vtt-format.js` reads structure metadata and handles origin offsets, angled
walls, and door openings. `dd2vtt.js` manages placement, geometry, doors, lights,
collision, and persistence.

## Import full maps from Hearth

Use the sibling `dd2vtt-creator` app's default **Ink VTT (.dd2vtt) - full map** export, then the existing **Menu > Import .dd2vtt** flow. Unlike an ordinary structure-only DD2VTT file, a version 2 Hearth export carries an explicit scene and ground-only artwork. Ink validates that contract, retains the painted floors, terrains, room surfaces and labels, and rebuilds individual props using the native object, furniture and vegetation builders. Each square remains five feet. Per-wall styles, map quarter-turns, arbitrary prop angles, scale, doors, lights, tags and notes are preserved.

Click an imported prop in Look or Play to use the usual inspector. The GM can nudge, rotate, remove, add tags, and edit creator notes with undo/redo. Creator notes are hidden in the player inspector. Movement checks include native prop footprints and explicitly marked blockers. Native lights keep the existing nearest-light budget.

Full maps work on the surface and through **Import into underground map**. They persist in browser saves and exported campaign files, including their separate ground texture. In Ink the imported ground and labels form one rendered surface; their original vector records remain saved, and can be revised in Hearth before re-export. Surface imports follow the existing terrain; underground imports are flat. The top-level DD2VTT image is still skipped, and older structure-only imports behave as before.

`ink-creator.js` owns native rendering and footprints. `hearth-core.js` is the creator's identical bundled versioned schema and asset registry; refresh it with `npm run ink:sync` in `dd2vtt-creator` when the contract changes. Unknown asset IDs and unsupported schema versions are rejected with explicit errors. Run `npm run test:ink` from that project for an end-to-end export/import test covering all 63 asset types, rotation, native prop editing, privacy, persistence, and underground maps.

## How the look works

- `paper.js`: procedural paper grain, ink pigments, smooth surface shading,
  elevation contours, forest stippling, shoreline ink, and engraved water strokes.
- `motion-shader.js`: shared GPU deformation for foliage and flame color, normal,
  and shadow passes. Tree roots and all gameplay coordinates stay fixed. Paper and
  leaf marks stay attached to the undeformed surface rather than crawling with wind.
- `motion.js`: shared animation clock, reduced-motion/visibility handling, and one
  bounded ember-particle draw near up to six fires (three on Low). Idle animation
  is paced at up to 30 fps at distance/Low and 60 close up; camera input is not capped.
- `micro-detail.js`: one capped instanced batch of small decorative stones, with
  deterministic world positions, view-frustum culling, distance fades, exclusion
  from painted/imported/house floors, and no tiny-object shadows or collisions.
- Close-range material tags on generated geometry select wood, stone, and foliage
  patterns in `paper.js`; grain stays attached to the world and derivative filtering
  fades marks before they become subpixel noise. No surface crosshatching returns.
- `shadows.js`: a view-centered sun shadow map for local play (2048 high / 1024 low),
  with cutaway-aware depth and point-light distance materials. Day shadows deepen the paper without surface crosshatching;
  the shadow map is disabled at world scale and at night.
  Torchlight uses each light's own occlusion rather than a second global shadow
  mask. Simplified fire baskets and brazier bowls behave as open cages in point
  shadows, avoiding oversized black disks beneath their flames; poles, props,
  walls, and daylight shadows remain. Placed pole/wall torches stay visible above
  the cellar cutaway height.
- `ink.js`: color/depth compositing and a geometry-normal pass for ink edges. The
  normal pass preserves building cutaways and road vertex displacement. It is
  skipped at world distance, and image buffers are capped at 1800 pixels on the
  long edge to limit high-DPI GPU cost.
- `style.js`: a restrained dark-fantasy palette of moss, charcoal, weathered brown,
  tarnished gold, and cold grey-green. Roofs vary within that narrow range; terrain,
  trees, water, buildings, and props share the same subdued pigments. The paper
  shader preserves dark material values and mixes them into stained parchment
  with uneven pigment pooling and visible grain. Real cast shadows, smooth face
  shading, ink outlines, and nighttime fire illumination remain in place.
- `ink.css`: matching paper controls, labels, cards, and page frame.

This remains real 3D. The fork changes the rendering, not the settlement layouts,
world geometry, token coordinates, or campaign data format. Portraits and token
colors remain readable. Close-range outlines add a render pass; physical phone
performance has not yet been measured. Surface detail and terrain contours are a first
visual treatment and can be tuned further.

The inherited SPEC/PORT/WORLD/NEXT documents describe the source project's history
and roadmap. This copy does not add Firebase campaign integration or multiplayer.

## Validation

```sh
node tools/check-ink.mjs
node tools/check-night.mjs
node tools/check-shadows.mjs
node tools/check-torch-lighting.mjs
node tools/check-fine-detail.mjs
node tools/check-motion.mjs
node tools/check-dd2vtt-format.mjs
node tools/check-dd2vtt.mjs
node tools/check-world-canon.mjs
node tools/check-campaign-tone.mjs
node tools/check-interior-layout.mjs
node tools/check-interiors.mjs
node tools/check-underground.mjs
```

Checks desktop and emulated phone rendering, camera orbit, cutaway, 5-foot square
measurement, initiative, ruler, real-pointer detail painting, undo/redo, reload
persistence, touch pinch, isolated storage, local asset loading, and source-file
hashes. Captures screenshots and `ink-report.json` in `tools/out/`. The fine-detail check compares Fine/Simple FPS from matching camera poses, checks
semantic material tags, verifies fixed decorative stone positions and distance
exclusion, tests the comparison UI, and captures foliage and night views.
The motion check compares rendered frames at controlled times, checks that Still
frames are identical, tests reduced motion and ember limits, verifies fixed token
coordinates, and records Still/Living hardware FPS samples from matching poses.
The night check compares real day/night framebuffers and verifies that turning off
point lights removes warm surface illumination. Half-float color buffers avoid
banding in dim firelight when supported by the GPU. The screenshot
run uses software WebGL and is not a hardware performance benchmark.

Playwright is only required for tests. The helper uses a local installation, an
explicit `PLAYWRIGHT_MODULE`, or the installed global Playwright MCP package.
`npm install` supplies the local dev dependency if needed. `CHROME` can point to a
Chromium executable. Inherited checks are available but the full inherited suite
has not been rerun for this visual fork.

Preview: [town](tools/out/ink-street.png), [world](tools/out/ink-world.png),
[cutaway](tools/out/ink-cutaway.png), [phone](tools/out/ink-phone-town.png).
