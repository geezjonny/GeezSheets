# One world, painted at every scale (decided 2026-11-05)

The world *is* the battlemap. You draw the whole world, auto-generate areas when you like, and fight
wherever you are. One uniform scale you zoom through, from the 41 km continent to the 1.5 m square.
Sometimes you go inside a building or underground, still at the same scale and in the same place.
(Inspired by storydraft.app's cell painting.) Read with SPEC.md (style, lazy loading, devices) and
PORT.md (the phases). Every action is tap / left-click first (phone, tablet, trackpad).

## Two brushes, one world
- **World brush** (exists): terrain types in 160 m cells.
- **Detail brush** (new): 1.5 m squares on one global grid, axis aligned, square (0,0) at the world's
  -X/-Z corner. Paints:
  - **ground**: flagstone, cobble, dirt, wood floor, rock floor, sand, grass, mud, shallow water,
    deep water, and "none" (shows the world's own ground);
  - **walls** on square edges: stone, timber, palisade; **doors** and **windows** set into a wall edge;
  - **objects** on squares (phase B): barrel, crate, table, chair, bed, chest, torch, brazier,
    campfire, tree, rock, statue, altar, stairs up/down, and so on, all from the code-built prop set.
  - **clear**: removes generated houses and trees from those squares, so you can redraw a town block
    by hand.
- Painted detail wins over generated content: trees and rocks never stand on painted squares, and
  generated houses whose footprint touches a cleared or walled square are not built.

## Random encounters anywhere
What the World brush paints from afar is already a battlemap up close: every generated tree, bush,
rock and house is fixed (a pure function of the data), so zooming into any painted forest, hill or
pass gives a playable fight with no prep. Generated props occupy the grid square(s) under them
(`app.props.squareBlocked(level, sx, sz)` -> null | 'tree' | 'rock' | 'bush'), so movement and, later,
line of sight treat them like painted walls (bushes are cover, not blockers).

## Data (sparse: saved only where painted)
`data.detail = { "<level>,<ti>,<tj>": tile }`. A tile is 40 x 40 squares (60 m).
`tile = { ground: b64(1600 bytes), wallN: b64(1600), wallW: b64(1600), objects: [{ k, i, j, rot }] }`
(wallN/wallW = the kind on the square's north and west edge, so each edge is stored once).
`level`: 0 = the surface, -1, -2 = underground, 1, 2 = upper floors. Empty tiles are deleted.
This maps 1:1 to Firebase paths later (`maps/<root>/detail/<key>`).

## The grid and tokens
- Zoomed in close (camera under ~300 m), the grid shows wherever you are, fading in. No pin is needed
  to play anywhere.
- Tokens live on the global grid: `{ id, name, color, kind, level, sx, sz }` (square coordinates).
  Old tokens on a battlemap (map, i, j) migrate to the global square under them.
- Battlemap pins become **bookmarks** (named spots: "the bridge ambush"), with Go, Known/Hidden and notes.
  They no longer have their own turned grid.

## Rendering (lazy, as SPEC.md)
- Detail tiles within ~500 m of the camera are built; they're freed beyond ~700 m with hysteresis. Each tile
  merges into at most 3 meshes. Ground squares are draped slabs in palette colours (with the same jitter
  rules as the streets). Walls are ~3 m tall, slightly uneven, and get hidden by the Cutaway like houses.
- Far away, painted ground shows as a tint in the terrain colour, so a painted road or plaza still reads
  from region zoom.

## Levels: inside and underground
- A level control (on the bar's Play/Look strip and in the card of a stair, cave or mine):
  Surface / Below 1 / Below 2 / Upper 1. Underground levels show only their painted detail and tokens,
  on dark rock, with the surface hidden. Upper floors show above the cutaway.
- Stairs, cave mouths, mine shafts and cellar trapdoors are portals: tap, and then "Go down" or "Go up" moves the
  view (and selected tokens) to the same spot on the other level.

## Auto-generate (phase D)
Drag a box with the Generate tool and pick: dungeon (rooms and corridors), cave system, building
interior, camp, forest clearing, ruin, or town block. It writes ordinary detail tiles, so everything
generated can be painted over. It uses the same seeded generators and lore (a cave's dwellers, a
keep's rooms), and it's undoable as one step.

## Import a battlemap (phase E)
- Import a `.dd2vtt` / `.uvtt` (picture + walls + doors + grid size) or a plain PNG/JPG (ask the grid size
  in pixels per square).
- It is placed like a sticker: drag to move, a turn handle, snapped to the 1.5 m grid (one map square = one
  world square). The picture drapes as ground on its level; its walls and doors become detail walls
  and doors, so line of sight works.
- The picture is kept in IndexedDB locally (and later a storage bucket) and referenced from the data, not
  inlined.

## Phases
A. Detail layer: data, Detail brush (ground, walls, doors, windows, clear), rendering, the global grid,
   tokens on the global grid (with migration), battlemap pins as bookmarks, undo, save.
B. Objects palette.
C. Levels and portals.
D. Auto-generate.
E. Battlemap import.
Then the campaign data from Firebase (PORT.md phase 2), table play (phase 3), and fog of war on detail
walls.
