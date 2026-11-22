# Brief: "Rodeo" — a basic Owlbear-Rodeo-style VTT (2D only)

Build a NEW, small, self-contained virtual tabletop. Do NOT touch `index.html`, `js/vtt/**` or anything else existing
(the old VTT is shelved). You may read `js/vtt/dd2vtt.js`, `js/rodeo-firebase.js`, `js/vtt/tokenpics.js` for ideas, but
the new code must not import from `js/vtt/`. Plain ES modules, no build step, no npm deps, no frameworks.
Served as static files (`serve.cmd` -> http://127.0.0.1:8000/rodeo.html).

Model it on Owlbear Rodeo: dark, clean, minimal, nothing fancy. No 3D, no walls/line-of-sight/dynamic lighting,
no drawing of our own map. The map is simply the **base64 image inside a .dd2vtt file** shown as the background.

## Files to create
- `rodeo.html` — page shell + `<link>` to `js/rodeo/rodeo.css`, `<script type="module" src="js/rodeo/main.js">`.
- `js/rodeo/rodeo.css`
- `js/rodeo/main.js` (boot, join card, wiring), `sync.js`, `scene.js` (state + canvas rendering + camera),
  `tools.js` (pointer tools), `tokens.js`, `dice.js`, `ui.js` (panels, menus), `dd2vtt.js` (pure parser), `images.js`
  (image chunking/recompress helpers). Split however you like, keep each file focused and < ~500 lines.
- `js/rodeo/test/*.test.mjs` — Node tests (`node --test js/rodeo/test`) for the PURE logic: dd2vtt parse, dice
  expression parsing/rolling (inject RNG), snapping, fog shape ordering, image chunk split/join.
- `battlemap/index.json` already exists: `[{file,name,bytes}]`. `tokens/index.json` already exists: array of png file names.

## dd2vtt
File JSON: `resolution.map_size {x,y}` (cells), `resolution.pixels_per_grid`, `resolution.map_origin`, `image` (base64,
no data: prefix; PNG or WEBP — sniff the first bytes: "iVBOR" png, "UklGR" webp, "/9j/" jpeg), plus ignorable
`line_of_sight`, `portals`, `lights`. Parser returns `{cols, rows, ppg, mime, imageB64}`; ignore everything else.
Maps can be up to 16 MB of base64 — decode via `Blob` + `createImageBitmap`/`Image` with an object URL, never
re-render per frame from a data URL string.

## Features (all must work, keep each simple)
1. **Join card** on load: name, color swatch, "I'm the GM" checkbox, room code (default from `?room=`, else `table`).
   Remember in localStorage. Then the app starts. Header shows the room code with a copy-link button.
2. **Scenes (GM)**: "Maps" panel lists `battlemap/index.json` (search box, name + size) and an "Upload .dd2vtt / image"
   button (a plain png/jpg/webp upload should also work: ask for cells-per-side or assume 70 px per cell). Picking one
   creates/replaces the current scene's map. Multiple scenes per room: scene tabs/dropdown (add, rename, delete, switch).
   GM switching scene switches everyone.
3. **Map sharing**: a scene's map is `{src:"battlemap/camp.dd2vtt"}` when picked from the library (players fetch the
   file themselves from the same static host, so nothing big goes through the database). For uploaded files, GM stores
   the image in the database as chunks (<= 400 KB base64 per chunk under `maps/<mapId>/chunks/<n>`, plus
   `maps/<mapId>/meta {mime,cols,rows,ppg,chunks}`); if base64 > 6 MB, first re-encode to WebP/JPEG (canvas, longest side
   <= 4096, quality .85) and adjust `ppg` accordingly. Players load chunks and rebuild. Show a loading indicator.
4. **Canvas** (single `<canvas>`, 2D context, devicePixelRatio aware, requestAnimationFrame only when dirty):
   pan (middle/right drag or space+drag or Select-tool drag on empty space), wheel zoom around cursor, pinch zoom and
   one/two-finger touch pan, "Fit" button, zoom % shown. Draw: background image, optional grid lines (toggle, colour,
   opacity — scene setting, GM edits), drawings, tokens, fog, pings, cursors, measurements.
5. **Tokens**: "Add token" opens a picker over `tokens/index.json` (`tokens/<file>`; search box, ~120 results at a time,
   lazy images) plus "Upload picture" (resize to 256px, store as data URL, <= ~60 KB) plus plain coloured circle with
   initials. A token: `{id,x,y (in cells, float),size (cells, default 1; 0.5,1,2,3,4),img,name,color,rot,
   hp,maxHp,hidden,locked,owner}`. Drag to move with snap-to-grid (centre or corner depending on size; Alt held = free;
   a "Snap" toggle in the toolbar). Selected token gets a ring and a small floating bar: rename, size, rotate 90°,
   HP +/-, hide (GM), lock (GM), duplicate, delete. Multi-select with shift-click and a drag-box on empty space; move as
   a group; Delete key deletes; ctrl+D duplicates. Token name label under token (setting: always / on hover / never).
   Small HP bar when maxHp set. Hidden tokens are drawn translucent for the GM and NOT SENT TO RENDERING for players
   (players must never see them; also do not rely on client hiding alone for anything secret beyond this basic level).
   Locked tokens can't be moved by players. Tokens snap and render above the map and below fog? No: fog hides tokens
   from players, so draw order is: map, grid, drawings, tokens, fog, pings/cursors/rulers.
   Right-click a token = context menu with the same actions. Layers: players move any unlocked visible token (basic).
6. **Fog (GM)**: Owlbear-1 style. Fog is an ordered list of shapes `{op:"add"|"sub", kind:"rect"|"poly", pts}` composed
   on an offscreen canvas (add = destination-over fill, sub = destination-out). Fog tool has: draw rectangle, draw
   polygon (click points, double-click/Enter to close, Esc cancel), mode Add (cover) / Subtract (reveal), "Cover all",
   "Reveal all", undo last shape. Players see fog fully opaque black; GM sees it ~40% transparent. For players, token
   hit/visibility is irrelevant to fog (fog just paints over).
7. **Drawing tools**: freehand pen, line, rectangle, circle, with colour + width; eraser (click a drawing to delete it);
   each drawing carries `owner`; a player can delete only their own, GM any. "Clear my drawings" / GM "Clear all".
8. **Measure tool**: click-drag ruler showing distance in cells x 5 ft (setting: ft per cell, default 5; diagonal rule
   toggle 5e/straight), visible live to everyone for ~3 s after release (broadcast ephemeral). Also a radius/cone
   option is NOT needed.
9. **Ping**: Pointer tool — hold click (or double-click) to ping: animated ring in the player's colour seen by all.
   Live cursors of other players are shown (throttled ~15/s) as a small coloured arrow with name.
10. **Dice** (2D, no 3D): bottom-right dice tray with d4 d6 d8 d10 d12 d20 d100 buttons (click adds to the pool, badge
    count), modifier +/- field, advantage/disadvantage for d20, "Roll" button, and a free-text field accepting
    expressions like `2d6+3`, `d20+5`, `4d6kh3`, `1d20 adv`, `3d8+2d4-1`. Result animates briefly (dice "tumble" via
    CSS/number cycling is enough) and is posted to the shared **log** as `Name rolled 2d6+3 = 11 [4, 4] +3`, in the
    roller's colour; nat 20 / nat 1 highlighted. GM may roll "privately" (checkbox "GM only") -> only GM sees it.
    Also `/r 2d6+3` and `/roll` in chat. Use `crypto.getRandomValues` for randomness (injectable for tests).
11. **Chat/log panel**: collapsible right panel, newest at bottom, shows rolls + messages + system lines
    ("X joined", "GM changed scene to Y"). Input at the bottom. History = last 200 entries via `limitToLast`.
12. **Players list** (top right): avatars/colour dots with names, GM badge, online state via presence + onDisconnect.
13. **Settings** (gear, GM-only parts marked): grid on/off/colour/opacity (GM), ft per cell (GM), token label mode (me),
    snap (me). Scene settings are stored on the scene so everyone shares them.
14. **Toolbar** (left vertical, icon buttons with tooltips and hotkeys): Select (V), Pointer/Ping (P), Draw (D),
    Measure (M), Fog (F, GM), Add token (T), Maps (GM), Fit (0), Undo (ctrl+Z for my last token move/draw/fog action,
    keep a simple local undo stack of inverse writes). Active tool highlighted. Sub-options appear in a small bar next to
    the toolbar for the active tool. Keyboard shortcuts must not fire while typing in an input.
15. Works on touch (basic) and at narrow widths (panels become overlays). No horizontal page scroll.

## Sync (Firebase Realtime DB through the existing wrapper)
Use `import { R, ref, onValue, set, update, remove, push, onDisconnect, query, limitToLast, get } from "../rodeo-firebase.js"`
(this also supports `?db=local`; check that file). All room data under `R("vtt2/<room>/...")`:
```
vtt2/<room>/meta            { sceneId, gmName?, paused? }
vtt2/<room>/scenes/<sid>    { name, map:{src|mapId,cols,rows,ppg,mime}, grid:{on,color,opacity}, ftPerCell, order,
                              tokens:{<tid>:{...}}, drawings:{<did>:{...}}, fog:{<n>:{...}} }
vtt2/<room>/maps/<mapId>    { meta, chunks:{0:"...",1:"..."} }
vtt2/<room>/players/<uid>   { name, color, gm, online, cx, cy }   // cursor in cell units; onDisconnect set online:false
vtt2/<room>/pings/<pid>     { x,y,color,t }  (self-deleting after 4 s; ignore any older than 6 s)
vtt2/<room>/measure/<uid>   { x1,y1,x2,y2,t }   (remove on release + after 3 s)
vtt2/<room>/chat/<pushId>   { t,uid,name,color,kind:"msg"|"roll"|"sys",text,roll?:{expr,parts,total},gmOnly? }
```
- uid: random per browser stored in localStorage.
- Subscribe with granular listeners (per-scene `tokens`, `drawings`, `fog` children via `onValue` on each collection
  path), apply to local state, re-render. Writes are optimistic: update local state immediately, then write.
  Drag moves: throttle writes to ~20/s and always write the final position. Never rewrite whole scenes for small edits.
- Keep a tiny `sync.js` interface so `scene.js`/`tools.js` never call Firebase directly:
  `sync.setToken(id, patch)`, `sync.removeToken(id)`, `sync.addDrawing(d)`, `sync.pushFog(shape)`, `sync.chat(entry)`, ...
- If Firebase can't connect (offline / blocked) the app must still work as a single-player local table (state in
  memory + localStorage backup of the last scene's tokens), and show a small "offline" badge. Do not crash on missing
  `crypto.subtle`, etc.

## Look
Dark UI like Owlbear Rodeo: background `#1a1b26`-ish, panels `#222436` with 1px `#33364d` borders, rounded 8px,
soft shadows, accent purple-blue `#7c6cf0`; system font. Toolbar icons: inline SVG (simple strokes, no icon font, no CDN).
Map area fills the viewport; panels float over it. Empty state (no map yet): centred card "Pick a map" for GM / "Waiting
for the GM to pick a map" for players, over a subtle grid.

## Quality bar
- No console errors on load, no unhandled promise rejections; wrap storage and network in try/catch.
- Big maps (16 MB base64, ~8000 px wide) must load without freezing for long: decode with createImageBitmap off the
  main thread where possible, draw with `drawImage` only (no getImageData).
- Players never receive/see hidden tokens in render. GM-only controls are not shown to players.
- Write the Node tests and make `node --test js/rodeo/test` pass.
- When done, add a short `js/rodeo/README.md` (file map, data model, how to run, known gaps). Do NOT edit CHANGELOG.md.
- Do not run git commands that change history; don't commit. Don't delete or modify files outside `rodeo.html`, `js/rodeo/`.
