# GeezTT world VTT (zoom-test v4)

One browser page that is the whole tabletop: for the GM and the players, on phone, tablet and computer.
The interface is the map. The map is one uniform world you scroll and zoom through, from the whole
continent down to a 1.5 m battle grid. No separate "world map" and "battlemap" screens: a battlemap is
just a place in the world that you've zoomed into.

All of it is code: no model files, no image files, no textures (not even canvas textures).

## Goals, in order
1. **Easy to use**, with mouse or fingers. Painting the world feels like a paint program: pick a brush, drag.
2. **Snappy everywhere.** 60 fps on a laptop, 30+ fps on a mid-range phone, at every zoom.
   Nothing exists unless someone is near enough to see it (see Lazy loading).
3. **One style.** Every object at every zoom uses the same look (see Style).
4. **Fixed world.** What you paint stays where you painted it. Trees, rocks and mountains never move,
   pop around or change shape as you zoom. Zooming in only *adds* things; it never moves them.
5. **Simple and light.** Plain ES modules, three.js r180 from `vendor/`, no build step, no frameworks,
   works when served as static files (GitHub Pages).

## Devices
- One layout that works from a 360 px phone in portrait up to a desktop. Honour safe-area insets.
  All touch targets at least 44 px.
- **Mouse:** wheel zooms toward the cursor; left-drag pans; right-drag turns and tilts.
- **Touch:** one finger pans; pinch zooms toward the pinch centre; a two-finger drag turns (sideways)
  and tilts (up/down). Place labels never block a gesture: they don't take pointer events; a tap on
  one is resolved by the map. In a drawing tool, one finger draws and two fingers still move the camera
  (a second finger landing cancels the stroke in progress, and that stroke is undone).
- **Every device:** tap a place label (or its grounds up close), battlemap label or token for its card; tap empty ground or Close to dismiss. Go flies in; double-tap a place label also flies in. Drag pins/tokens to move them; a drag never opens a card. Right-click and long-press are card shortcuts.
- **Camera buttons:** drag the compass to turn/tilt, tap it to face north and reset tilt; turn buttons step 15 degrees, +/- zoom at the screen centre, and Top toggles top-down. Targets are at least 44 px and stay clear of the toolbar and phone card. Look/Play offer Ping, then tap once to ping.
- **Pen** acts like a finger, but always draws in a drawing tool.
- Quality: Auto / High / Low in the menu. Auto picks Low on coarse-pointer devices or when fps
  stays under 40 for 3 s. Low = pixel ratio capped at 1.5, shorter prop range, fewer trees, no
  real point lights. High = pixel ratio up to 2.

## Who uses it (GM and players in one app)
- A **role** switch in the menu: GM or Player. One page, same code; the role only changes what you can
  see and do. (Sync between devices is not in this build; keep all state in the one world object so a
  sync layer can be added later. See Later.)
- **GM:** all tools. Can mark a place known/unknown to players.
- **Player:** Look and Play only. Unknown settlements and battlemaps are not drawn (no pin, no label, but the terrain is
  still there). Can move tokens and ping.

## Style (one rule set for everything)
- Flat-shaded low-poly: `MeshLambertMaterial({ flatShading: true, vertexColors: true })`. Glowing things
  (flames, lit windows, embers) use `MeshBasicMaterial` with vertex colours. That's the whole material set.
- One palette (`PAL` in `style.js`). Every colour in the scene comes from it, with at most a small fixed
  per-instance jitter (from the hash) so it isn't machine-perfect.
- Terrain, trees, rocks, houses, props and tokens are all built the same way: simple shapes with
  per-vertex palette colours. A flagstone street is a few irregular flat-shaded slabs in two palette
  greys, not a texture.
- Dark fantasy, pre-industrial (late 1600s–1700s): steep chunky shingle roofs with deep eaves, stone
  ground floors with timber upper storeys, warm glowing windows, torches in iron baskets on poles, wall
  lanterns by doors, braziers, barrels, crates, carts, torn canvas awnings. **No lamp posts of any kind.**
  Nothing perfectly straight: jitter roof ridges, wall tops and slabs a little.
- Muted colours, warm low sun (late afternoon), cool grey haze at distance that scales with zoom.

## The world data (what gets saved)
A single JSON object, saved to localStorage and downloadable / loadable as a file:
```
{ version: 1, size: 256,                 // cells per side; a cell is 160 m, so the world is ~41 km
  terrain: "<base64, 1 byte per cell>",  // terrain type id per cell
  rivers: [ { id, pts: [[x,z], ...] } ],  // polylines in world metres
  roads:  [ { id, pts: [[x,z], ...] } ],
  settlements: [ { id, name, kind: "town"|"village"|"keep"|"camp"|"ruin", x, z, r, seed, known } ],
  battlemaps:  [ { id, name, x, z, rot, known } ],   // a 40 x 40 grid of 1.5 m squares, centred on x,z, turned by rot
  tokens: [ { id, name, color, map, i, j } ] }       // i,j = square on that battlemap
// version 1 files (with "places") load too: each place becomes a settlement plus a battlemap at its centre.
```
Terrain types: 0 deep sea, 1 shallow sea, 2 beach, 3 grass, 4 forest, 5 hills, 6 mountains,
7 snowy peaks, 8 marsh, 9 dry plain.
Everything visible is a pure function of this data plus fixed hashes. The same file always gives the same world.

## How the world is made from the data
- **Height:** each type has a base height (sea below 0). Blur the per-cell base heights (and per-type
  weights for hills/mountains/snow) a couple of passes, sample bilinearly, then add fixed noise scaled by
  the blurred roughness; mountain and snow weights add ridged noise for peaks and ridges. Noise is in
  world space, so ridges are where you painted and never shift. A sea plane sits at y = 0.
- **Borders:** sample the type map through a small fixed domain warp (~50 m) so painted borders read
  organic, not as 160 m squares. Colour and props use the same warped lookup.
- **Colour:** from the palette per type, bilinearly blended; rock on steep slopes; snow above a fixed height.
- **Settlements are part of the world.** A town or village is an area (centre + radius). The world's
  roads inside it are its streets; houses line both sides facing the road. Where too few roads reach
  it, the town adds its own streets through the centre, and towns add short lanes off the streets.
  A town has a square at its centre (flagstones, a well, a brazier, a cart, stalls) and flagstone
  streets in its core; outside the core streets are packed earth. Houses sit on the real ground with
  stone footings on slopes (no flattening). Keeps, camps and ruins are one walled or fenced unit at the
  centre, on levelled ground, turned so the gate faces the first road; a keep has a few houses along
  its roads outside the walls. Everything is a pure function of the data: moving a road moves the
  houses along it.
- **Cities and large towns:** connected back lanes divide the radial/ring street network into
  terraced blocks with small accessible courtyards. Houses rise 2–4 storeys; a temple bell tower,
  guildhall and city palace reserve larger central plots. Compacted ground fills the courts.
  Walls sit 8 m beyond the actual built radius, with only a few cottages immediately outside
  radial gates. Both LODs share the same footprints; far geometry uses merged wall/roof masses,
  while near geometry adds facade details within the area triangle budget.
- **Rivers and roads:** ribbons along the polylines that sit just on the ground. Their width never drops
  below ~2 px on screen and they lift slightly with camera distance (in the vertex shader) so they stay
  visible from the top of the world without z-fighting up close.

## Lazy loading (the core rule: only what someone can see exists)
- **Terrain chunks:** 16 × 16 cells. Detail level from camera distance (e.g. 8 / 16 / 32 / 64 / 128
  segments per chunk; the finest is 20 m). Built on demand within a per-frame time budget, cached in an
  LRU with a size cap, freed when out of view. Skirts hide cracks between levels. The finest level
  samples the same height function as the coarsest.
- **Props (trees, bushes, rocks, reeds, dead trees, stumps):** every cell owns a fixed list of prop
  slots (jittered grid, from a hash of the cell index): position, type, size, colour jitter and a
  *rank* in [0,1). A slot is drawn if `rank < density(type, distance)`: full density close, thinning
  with distance, nothing beyond the prop range (~1.5 km High, ~800 m Low). So as you come closer,
  trees are added among the ones already there; none ever moves. Props stand on the finest terrain
  lattice (computed per cell from a 9 × 9 height lattice) so they never float. A cell's slots are
  built when it first comes into range and dropped when it leaves (LRU).
- **Forest canopy:** beyond the prop range, forest cells show a low lumpy canopy layer (a few
  flat-shaded blobs per cell, same green, fixed positions) so a forest still reads as a forest.
  Beyond ~6 km (High) / 3.5 km (Low) the terrain colour alone carries it.
- One `InstancedMesh` per prop type, refilled only when the camera has moved enough (≥ 5 % of its distance).
- **Settlements:** two detail levels. Within ~9 km a light version (each house a block and a roof) so
  towns read from region zoom; within ~1.1 km the full version. Freed with hysteresis. Each level
  merges into ≤ 3 meshes.
- **Lights:** real point lights only at battle scale, at most 4 (0 on Low), on the torches nearest the
  camera. Everywhere else glow is faked with emissive flames and a soft additive halo mesh.
- HUD (small, collapsible): fps, draw calls, triangles, chunks, props, places loaded.

## Battlemaps
A battlemap is a point the GM drops anywhere in the world: a town square, a gate, a forest road, a
clearing. It is a 40 × 40 grid of 1.5 m squares (60 m), turned by `rot` (dropped near a street it lines
up with the street). The grid lies on whatever is really there (terrain, trees, houses): it is drawn
draped over the ground and fades in below ~300 m camera distance, only for the battlemap you're
looking at. Tokens belong to a battlemap and snap to its squares.
**Cutaway:** in Play, a Cutaway toggle hides everything of the buildings above ~2.7 m inside the active
battlemap, so a fight in the tavern is visible from above.

## Tools
A floating bar, bottom centre (wraps to two rows on narrow screens): **Look | Paint | Rivers | Roads |
Towns | Maps | Play**. Players only see **Look | Play**. A menu button top-left: role, quality, Save file,
Open file, New world, HUD toggle. Undo / redo buttons on the bar (and Ctrl+Z / Ctrl+Y).
- **Look:** move the camera. Tap a place for its card, then Go to fly in (or double-tap its label). Esc / a Back button: fly out one level.
- **Paint:** terrain swatches; brush size (1–12 cells); drag to paint; a Smooth toggle (blends with
  neighbours; Shift-drag on desktop). Round brush cursor on the ground. Only touched chunks and prop
  cells rebuild, right away.
- **Rivers / Roads:** tap to add points, double-tap / Enter / a Done button to finish, Esc / Cancel.
  Tap a line to select it; Delete (key or button) removes it.
- **Towns:** tap to drop a settlement, name it, pick a kind and size, toggle Known, Reroll. Drag the
  pin to move; Delete removes.
- **Maps:** tap to drop a battlemap (lines up with a street if one is near), name it, toggle Known,
  Turn (15° steps) or Align to the nearest street. Drag the pin to move; Delete removes.
- **Play:** on a battlemap, add a token (name + colour), drag tokens square to square (snapped);
  long-press / double-click the ground to ping (a ring that pulses for 2 s).
- Top-down button (and Tab): toggle straight-down / tilted view, so painting is easy.
- Undo / redo for every edit. Autosave to localStorage (debounced).
- **New world** fills a starter continent (sea around a landmass with mountains, forests, hills,
  a river, a road and 4 places) so you never start from a blank sea. First load uses it too.

## Files
`index.html`, `main.js` (setup, loop, camera, quality), `style.js` (palette, materials, geometry
builder that bakes colours into vertices), `noise.js`, `world.js` (data, fields, height, colour,
chunks), `props.js` (prop slots, prop shapes, instancing, canopy), `lines.js` (rivers, roads),
`places.js` (battlemaps), `input.js` (mouse/touch/pen gestures), `tools.js` (tools, undo), `ui.js`.
Keep each file focused. Old prototypes main.v1.js / main.v2.js stay untouched.

## Checks before calling it done
`tools/check.mjs` (Playwright, headless Chromium; serve the folder with a tiny static server in the script):
- loads the page at desktop size (1366 × 768) and phone size (390 × 844, touch, DPR 3); no console errors;
- paints a few strokes, adds a road, drops a place, flies in to it; records fps, draw calls and triangles at
  world, region and battlemap zoom; screenshot at each into `tools/out/`;
- **fixed props:** records the world positions of props in one forest cell, zooms out and back in,
  asserts every originally drawn prop is still drawn at the identical position;
- **lazy:** at world zoom, prop count and places loaded are 0; at a battlemap, only that place is loaded;
- **reload:** the painted world comes back from localStorage exactly;
- **player role:** an unknown place shows no label, and the Paint tool is not offered;
- **touch:** a simulated pinch zooms, a one-finger drag in Paint mode paints.

## Later (not in this build)
- Sync between devices (GM and players live on one world) through Firebase, in the GeezSheets /
  GeezTabletop data layout; per-campaign reveals.
- Fog of war, character sheets, dice, time of day / weather.
