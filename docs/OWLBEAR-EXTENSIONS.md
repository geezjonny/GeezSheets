# Owlbear Rodeo extensions: what the SDK can do, what exists, and how OBR replaces GeezSheets

Written 2026-11-12. The goal: run the table in Owlbear Rodeo (OBR) with our own extensions, so the GeezSheets site is no longer needed at the table.

Sources: the SDK's own type definitions (`@owlbear-rodeo/sdk@3.1.0` from npm, the version the extension loads), the OBR blog, and web search of the extension store. docs.owlbear.rodeo and extensions.owlbear.rodeo were blocked from this session, so anything marked *(check)* comes from search results or memory and wasn't confirmed against the docs.

## 1. How an extension works

An extension is a static website. Owlbear loads its pages in iframes and talks to them through `OBR.*`. We already host ours on GitHub Pages (`geezjonny.github.io/GeezSheets/owlbear/`). Install = paste the manifest URL into OBR (Profile → Extensions → Add custom extension). The public store is a separate submission *(check)*.

### manifest.json
| Field | Notes |
|---|---|
| `name`, `version`, `author` | strings |
| `manifest_version` | `1` |
| `description` | **128 characters max** (we hit this: commit 637efef) |
| `icon` | absolute URL |
| `action` | the toolbar button: `{ title, icon, popover, width, height }`. One per extension. |
| `background_url` | a hidden page that runs for every client while the room is open. Put context menus, tools, watchers and token drawing here. |

Everything else (context menus, tools, modes, popovers, modals) is created at runtime from code, so one extension can have many of them.

### SDK 3.1.0 API (the full surface)
| Namespace | What it gives us |
|---|---|
| `OBR.scene.items` | `getItems(filter)`, `addItems`, `updateItems(filter\|items, draft => …)`, `deleteItems`, `getItemAttachments`, `getItemBounds`, `onChange`. Shared, saved, synced to everyone. |
| `OBR.scene.local` | Same API, but **only on this client and never saved**. This is how HP bars are drawn (Stat Bubbles, GM's Grimoire, our `background.html`). |
| `OBR.scene` | `isReady`, `onReadyChange`, `getMetadata` / `setMetadata` / `onMetadataChange` (per scene) |
| `OBR.scene.grid` | dpi, scale ("5ft"), type (square/hex/isometric/dimetric), measurement, `snapPosition`, `getDistance`, `onChange` |
| `OBR.scene.fog` | color, stroke, filled, `onChange` |
| `OBR.scene.history` | undo / redo |
| `OBR.room` | `getMetadata` / `setMetadata` / `onMetadataChange` (**16 kB total, shared by every extension in the room**), permissions |
| `OBR.player` | own `id`, `connectionId`, `name`, `color`, `role` (`GM`/`PLAYER`), `selection`, `select`/`deselect`, metadata (per connection, gone when they leave), `hasPermission`, `syncView`, `onChange` |
| `OBR.party` | `getPlayers()`, `onChange`: everyone else in the room with role, name, color, selection, metadata |
| `OBR.broadcast` | `sendMessage(channel, data, { destination: REMOTE\|LOCAL\|ALL })`, `onMessage`. Messages are not saved; use them for rolls, pings, sounds, rollcall. |
| `OBR.contextMenu` | `create({ id, icons: [{ icon, label, filter: { roles, min, max, every/some: [{ key, value, operator }] } }], onClick, embed })` (right-click on items) |
| `OBR.tool` | own toolbar tools with modes (pointer/drag/click handlers), actions, cursors, per-tool metadata |
| `OBR.interaction` | `startItemInteraction(items)`: 60 fps local preview while dragging, then commit once |
| `OBR.popover` | open/close floating iframes at an element or screen position; `disableClickAway` keeps them open (our float panel) |
| `OBR.modal` | full-screen or centred iframes, optionally with no backdrop and no pointer events (good for overlays, handouts, cinematics) |
| `OBR.action` | the toolbar button: open/close, size, icon, title, **badge text and colour** |
| `OBR.notification` | toasts: DEFAULT/INFO/SUCCESS/WARNING/ERROR |
| `OBR.viewport` | pan/zoom, `animateTo`, `animateToBounds`, screen↔scene point transforms |
| `OBR.theme` | light/dark plus colours, `onChange` |
| `OBR.assets` | `uploadImages`, `uploadScenes` (to the GM's storage), `downloadImages` / `downloadScenes` (opens the GM's asset picker) |

Builders: `buildImage`, `buildShape`, `buildText`, `buildLabel`, `buildCurve`, `buildLine`, `buildPath`, `buildPointer`, `buildRuler`, plus newer ones: **`buildWall`, `buildLight`, `buildEffect`, `buildBillboard`**, `buildImageUpload`, `buildSceneUpload`.

### Item schema
Every item: `id, type, name, visible, locked, createdUserId, zIndex, lastModified, lastModifiedUserId, position, rotation, scale, metadata, layer, attachedTo?, disableHit?, disableAutoZIndex?, disableAttachmentBehavior?, description?`

- Layers: `MAP, GRID, DRAWING, PROP, MOUNT, CHARACTER, ATTACHMENT, NOTE, TEXT, RULER, FOG, POINTER, POST_PROCESS, CONTROL, POPOVER`
- Attachment behaviours (what follows the parent): `VISIBLE, SCALE, ROTATION, POSITION, DELETE, LOCKED, COPY`
- `WALL`: `points[], doubleSided, blocking`, which the native dynamic fog uses (so doors are walls that get toggled)
- `LIGHT`: `attenuationRadius, sourceRadius, falloff, innerAngle, outerAngle, lightType: PRIMARY|SECONDARY|AUXILIARY` (vision vs torches)
- `EFFECT`: GPU shader in SkSL with `uniforms[]`, `effectType: STANDALONE|ATTACHMENT|VIEWPORT`, `blendMode`, which could drive weather, the realm shift, auras and spell areas
- `BILLBOARD`: an image that keeps its screen size (`minViewScale/maxViewScale`), good for markers
- Item `metadata` is free JSON under our own key (`com.geezsheets/...`), saved with the scene

Permissions players can be given: `{FOG,MAP,PROP,MOUNT,CHARACTER,ATTACHMENT,NOTE,DRAWING,RULER,POINTER,TEXT}_{CREATE,UPDATE,DELETE}` and `CHARACTER_OWNER_ONLY` (players move only the tokens they created).

### Where data can live
| Store | Size | Lifetime | Good for |
|---|---|---|---|
| Room metadata | 16 kB total, shared with every other extension | Saved with the room | Settings, the campaign id, initiative order, round |
| Scene metadata | not confirmed *(check)* | Saved with the scene | Per-map state: doors, weather, encounter |
| Item metadata | not confirmed, keep it small *(check)* | Saved with the token | Token → PC link, monster HP, conditions |
| Player metadata | small | Until they disconnect | Presence, "my PC is …" |
| Broadcast | ephemeral, rate-limited *(check)* | Not saved | Rolls, pings, sounds, rollcall |
| Our Firebase `/v2` | large | Ours | Full character sheets, the world, NPCs, maps |

**Full character sheets won't fit in OBR.** Room metadata is 16 kB for the whole room, and a single Gaia PC is bigger than that. Gaia/Firebase stays the source of truth, and OBR shows it and writes to it, which is how `owlbear/` already works.

### What the SDK can't do
- Switch scenes for everyone. There is no scene-open API; the GM changes scene by hand.
- Run server-side. A background page only runs while someone has the room open.
- Play audio as a built-in. Sound means our own `<audio>` in an iframe, and browsers block it until the player has clicked something in that iframe.
- Store files without the GM. `assets.upload*` goes to the GM's own storage and the picker needs a click.
- Identify users to Firebase. `player.id` is OBR's own id; nothing signs it for our database. It's still better than `?gm=jonny` for deciding who sees what, but it doesn't secure Firebase.

## 2. What already exists (store / community)
| Area | Extensions | Gap we'd fill |
|---|---|---|
| Fog, walls, lights | **Dynamic Fog** (official, 2.3: realtime walls + lights), Smoke & Spectre! (community; walls, doors, vision) | No importer for our `.geez2vtt`/`.dd2vtt` that also places doors, windows and torches |
| HP / stats on tokens | **Stat Bubbles for D&D**, **Game Master's Grimoire** (HP + initiative + 5e/PF2e stat blocks + dice) | They keep HP on the token; ours is live from the PC's sheet in Gaia |
| Initiative | official **Initiative Tracker**, **Pretty Sordid** (fork with token images), Stat Bubbles, Grimoire | No link to sheet DEX/initiative bonus, concentration or death saves |
| Dice | **Rumble!** (rolls + chat), **Bones!**, **dddice**, **Owl20** (D&D Beyond via Beyond20) | Rolls aren't driven by our sheet's attacks, spells or Bardic dice |
| Character sheets | **Sheet from Beyond** (links to external sheets), **Chronicle!**, Shadow Sheet, Ultimate Story (single-system) | None reads Gaia; ours does |
| Combat | **Clash!** (initiative + stat blocks + automation) | — |
| Scene tools | Prefabs, Portals (token teleport between points), Loot!, DM Screen 5E, Tabletop Tokens | Portals ≈ our stairs/trapdoor links |
| Music | Hoot (music player) *(check)* | No campaign library (`audio/`) or synced ambience |
| Bundles | `FullPeople/obr-suite` (15★, small) | — |

What makes ours better is that every one of these is a separate island, while ours is one suite on one world database. HP, conditions, initiative, rolls, NPCs and maps are the same records the site and sheets use, so nothing is typed twice.

## 3. GeezSheets → OBR: feature map
| GeezSheets feature | In OBR | Use | Build |
|---|---|---|---|
| Battle map picture | Scene + MAP image | native | — |
| `.geez2vtt` walls, doors, windows, line of sight | `WALL` + `LIGHT` items, Dynamic Fog | Dynamic Fog for the rendering | **Map importer**: geez2vtt/dd2vtt → `uploadScenes` with picture + walls + doors + lights in one go; right-click a door to open/close it (toggles `blocking`) |
| Stairs / trapdoor links | — | Portals (or ours) | Right-click a stair to move the token to the linked spot / scene |
| Character sheet | popover / float | — | **done** (1.4.0): embed `sheet.html` |
| Party HP + status | action popover + token bars | — | **done**: live from Gaia |
| Conditions, concentration, death saves on tokens | local ATTACHMENT items | — | **done** as a label; next: icons per condition (`config/conditions.json`) |
| Monster/NPC HP | item metadata | Stat Bubbles works today | NPC/creature HP from Gaia tokens; right-click "Add stat block" from `data/monsters.json` |
| Initiative | room metadata (order, round, turn) | official tracker works today | Tracker that rolls from sheet bonuses, highlights the token, pans the GM view, shows concentration/down |
| Dice + roll log | broadcast + popover | Rumble! works today | Sheet roll buttons → broadcast → shared log + `dice3d.js` in a no-backdrop modal |
| Rollcall | broadcast + popover | — | GM asks "everyone roll Perception" → each player gets a one-click prompt with their own bonus |
| Sound board / ambience | broadcast → audio iframe | — | GM board with `audio/library.js`; each player's float panel plays it (one click to unlock audio) |
| Handouts / pinboard / notes | NOTE layer, modal | native notes | GM pushes a handout → modal on every screen |
| Realm shift, weather, night | `EFFECT` (SkSL) on VIEWPORT | — | Shaders, port from `zoom-ink-test/motion-shader.js` / `atmosphere.js` |
| World map, travel | separate scene | native | Scene per region; clickable place pins open notes |
| GM identity `?gm=jonny` | `player.role` | native | Use OBR role to choose GM vs player view (still no Firebase auth) |
| NPC desk, world editor, map converter | — | — | Stay on the site (prep tools, not table tools) |

## 4. Plan
**Recommendation: one extension (GeezSheets), several modules.** One manifest means one install for the players. Context menus, tools, popovers and modals are unlimited, and GM-only parts hide by `role`. Shared code stays in `owlbear/dd2vtt.js`.

**Update (2.0.0):** the character sheet, party HP and token HP bars were removed from the extension. It now does maps only: dd2vtt import, room-by-room fog with the Rooms tool, and optional walls, doors and lights.

Don't change anything that Friday 2026-11-13 depends on. After a good session:

1. **Initiative + dice log** (biggest table win, all broadcast/room metadata, no Firebase writes needed beyond what the sheet already does).
2. **Map importer**: done in 1.5.0 (`owlbear/import.html`, `owlbear/dd2vtt.js`): dd2vtt → picture, walls, doors (GM handles to open/close), lights, all attached to the map picture.
3. **Rollcall + handouts + sound board** (broadcast).
4. **Monster stat blocks + NPC HP** on tokens.
5. **Effects**: realm shift, weather, night.
6. Clean up: hand-test with two browsers (GM + player) each step; then submit to the store if wanted.

Open questions:
- **Firebase security:** today anyone with the URL can write `/v2`. OBR doesn't issue anything our database could verify, so the real fix is Firebase Auth (e.g. anonymous sign-in plus a per-player PC claim set by the GM) with database rules. Worth deciding before player writes go wider.
- **Scene/item metadata limits** and broadcast rate limits: confirm on docs.owlbear.rodeo (blocked from this session).
