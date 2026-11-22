# OBR bridge plan: GM companion mirrors and controls the OBR scene

Date: 2026-11-22. Status: plan, nothing built yet.

## Direction

- Games are now run in Owlbear Rodeo (OBR).
- `companion.html` is the player UI. `gm-companion.html` is the GM UI.
- Goal: control as much as possible from the HTML side (the companions), with the OBR extension kept as thin as possible.
- This supersedes the 2026-11-21 note "no new OBR extension work". The extension we extend is `GeezOBR/`, not the old `owlbear/` one. Keep it small: a publisher and a command executor, no UI of its own.

## The constraint

The OBR SDK only works inside OBR's own iframe. `gm-companion.html` is a standalone page, so it cannot call `OBR.*` directly.
Everything crosses a bridge: **Firebase** (already used by the companion and by `GeezOBR/weather.js`).

```
OBR scene  <->  GeezOBR extension (background.html)  <->  Firebase  <->  gm-companion.html / companion.html
```

Two directions:

1. **State out (OBR -> HTML):** the extension publishes scene state; the companions subscribe and render their own representation.
2. **Commands in (HTML -> OBR):** the companions write small command records; the extension (GM client only) executes them with the SDK and deletes them.

## 1. Current map mirror (first deliverable)

What exists:
- GeezOBR's dd2vtt import tags the map picture: `metadata['com.geezsheets/dd2vtt'] = { name, w, h, lights, lightType }` (`GeezOBR/dd2vtt.js:4`, `import.html:115`).
- `GeezSheets/battlemap/` holds the `.dd2vtt` files plus `index.json`.
- `js/vtt/dd2vtt.js` parses dd2vtt; `js/vtt/vtt.js` / `ui.js` render maps.

Extension side (GM client only, in `GeezOBR/background.html`):
- On scene ready / item change, find the image with `layer === 'MAP'` and the `MAPKEY` metadata.
- Write `{ name, w, h, sceneId, updated }` to `/v2/obr/currentMap` (same REST approach as `weather.js`).
- Clear it when no mapped scene is open.

Companion side (`gm-companion.js`, later `companion.js`):
- `onValue('/v2/obr/currentMap')`. When `name` changes, look it up in `battlemap/index.json`, fetch `battlemap/<name>.dd2vtt`, parse with `js/vtt/dd2vtt.js`, render with the existing VTT view.

Caveat: this only works if the imported dd2vtt also lives in `battlemap/` under the same name. Unknown names should show "map not in library". Possible later step: have the import page upload the dd2vtt itself to Firebase or Storage so any map works.

## 2. Live scene state (second deliverable)

Publish, throttled and diffed:
- Token positions, names, visibility, and the link to a character id (`companion.html?char=<id>`).
- Doors open/closed (`com.geezsheets/door`).
- Grid dpi and scale, so token positions map onto the dd2vtt grid.
- Fog/room visibility (`com.geezsheets/room`), if we want the HTML map to respect it.

Players' `companion.html` must only receive what a player may see, so publish a player-safe subset on a separate path (for example `/v2/obr/public/...`).
GM-only data (hidden tokens, all rooms) goes under a GM path.

## 3. Commands from HTML (third deliverable)

`/v2/obr/commands/<id> = { type, args, by, ts }`. The extension runs them as GM and removes them.
Candidate commands, in rough priority:

- `door.toggle { wall }` - open/close a door from the GM page.
- `room.reveal / hide { n }` - fog rooms.
- `token.move { id, x, y }` and `token.setHp` - ties into the HP bars.
- `light.place`, `map.load { name }` - load a battlemap from the library into OBR.
- `notification.show { text }` - ping the table.

Safety: only the GM client executes commands. The companion write path should be gated like the other GM-only Firebase writes (GM view/passphrase), and the extension should ignore commands older than a few minutes.

## Open questions

- Is the Firebase rules setup OK with an `/v2/obr` subtree split into public and GM paths?
- Should the HTML map be read-only (mirror) at first, with commands added only for doors and fog?
- Do players also get the mirrored map on `companion.html`, or GM only?

## Build notes

- Delegate the mechanical parts to Codex: extension publisher, companion subscriber, command executor.
- Keep design, security (public vs GM data) and final review with Claude.
- Test with `GeezOBR/*.test.mjs` style unit tests for the diffing/serialization logic.
