# Moving GeezTabletop from Godot to three.js (decided 2026-11-05)

The user's decision: GeezTabletop becomes the browser app grown from zoom-test. It opens on the
world map: painted terrain, roads between places, and code-built 3D (mountains, trees, bridges,
caves, mines, shrines, towns and their buildings). **The world map replaces both the campaign
board and the old world map.** A city card's Go button flies into it, down to its area and battlemaps.
The GM part of GeezSheets is retired, so everything it did for the GM has to live here.
GeezSheets stays for players' character sheets.

Godot (godot-vtt) is parked. Its docs and the GeezSheets data shapes are the reference for what
to build. Nothing from it is ported line for line; it's rebuilt in zoom-test's style (code only,
one palette, lazy loading, phone first).

## Where the campaign board's cards go (the board itself is eliminated)
- **Tap / left-click** a PC, an NPC or a place on the map to open its card right
  there, beside it. The card shows lore, notes, properties and Known/Visited, and for people
  their avatar, role, faction, HP and conditions. Right-click and long-press remain shortcuts.
- **Places** are the world's settlements and sites.
- **PCs and NPCs** are figures on the map: in the town they belong to, or as tokens on a
  battlemap. A place's card lists who is there; tap a name to open that person's card.
- **Events and notes** are pinned to a place and listed in its card.
- Cards that aren't anywhere on the map yet are found with search (in the menu) and dropped onto
  the map. This is a finder, not a board.
- **Links** between cards show in each card ("knows", "works for", and so on). Links between
  places are roads; `style: bridge` becomes a bridge where the road crosses water.

## Phases
0. **Lock down Firebase** (urgent, needs the user's OK before the live write): rules so only the
   GM account writes campaign data and players write only their own sheet, presence, rolls and
   token moves.
1. **The world map is the interface.** Finish NEXT.md: wire in lore.js, the details card, the
   lore driving the towns (walls, gates, watchtowers, fields, mill, temple), and the new site
   builders (caves, mines, shrines, towers, bridges at road and river crossings). A place card's Go button
   flies in.
2. **Campaign data.** Read a GeezSheets campaign from Firebase (things, maps, pins, links,
   roads) into the world: root map to world, area maps to towns, battlemap things to battlemap
   pins. The terrain is saved as `maps/<root>/terrain`. Then GM edits are written back as path
   updates in GeezSheets' shapes, through an offline queue. Reveals are per campaign, because
   Daddies and Disney share one world.
3. **At the table.** GM and Player roles from the login. Live sync of tokens, pings, the
   pull-to-my-view, locking movement and pings. Tokens from campaign people (avatar, size, PC,
   HP bar, conditions). Initiative, measure and templates, dice and roll calls (players' rolls go
   to the TV), handouts, who's online.
4. **One world painted at every scale** (replaces "battlemaps in depth"; see WORLD.md): the Detail brush
   on a global 1.5 m grid, objects, levels (inside and underground), auto-generate, battlemap import
   (dd2vtt and pictures), then fog of war on the painted walls. Built before phase 2.
5. **Go live.** GitHub Pages deploy (the GeezTabletopWeb repo, on a branch until the user
   reviews it), a test on a real phone and tablet, a rehearsal session, then retire the Godot
   app and GeezSheets' GM page.

Each phase ends with `node tools/check.mjs` passing, plus new checks for that phase. Nothing goes
to main, Pages or the live DB without the user's review. Codex builds well-bounded pieces; Claude
reviews them and commits.
