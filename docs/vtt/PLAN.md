# Puzzle system plan

Goal: build puzzles inside the VTT out of placed objects and simple if/then rules. No separate puzzle editor. If it works, it slots into GeezSheets (Firebase `/v2`) and the Owlbear extension.

## Core idea

Everything on the map is an **object** with an id, a place, and a **state**. A **group** is a rule: `when` conditions (all must be true) = `then` results. The rule engine only knows ids and states, so it does not care what an object is.

```
objects: { id: { kind, label, x, y, sx, sy, state, start, hidden, ...kind props } }
tokens:  { id: { x, y, hp?, max? } }
groups:  { id: { when: [cond], then: [act], met } }
```

Positions are pixel centres of 40px cells. `sx,sy` is the start position.

### Conditions (If)
- `{ id, state }`: object is in that state (a door is open, a dial reads E).
- `{ id, at: {x,y} }`: object or token is at that spot ("move" as an if).

### Results (Then)
- `<state name>`: level-based. While the rule is met the object takes that state, otherwise it returns to its start.
- `toggle`: edge-based. Flips each time the rule becomes met.
- `move` + target cell: level-based for objects (returns to start when unmet), once for tokens.
- `fire`: edge-based, latches `fired` until a GM reset (event objects).

Chains work because any object's state can be a condition for another group.

## Object kinds

| Kind | States | Changed by |
|---|---|---|
| Plate | down / up | a token on its cell (optional "stays down" = lever-like) |
| Tripwire | tripped / clear | a token on any of its cells (line of cells, optional latch) |
| HP gauge | alive / bloodied / dead | derived from a token's HP (at or below half = bloodied, 0 = dead) |
| Switch | on / off | click (lever, button that stays, turn key) |
| Dial | any list of values | click cycles (line-up puzzles, combination digits) |
| Door | open / closed | rules |
| Light | on / off | rules |
| Floor | solid / open | rules (pits, trapdoors) |
| Spawn | armed / fired | rules; on fire places enemy tokens |
| Rolling stone | armed / fired | rules; on fire moves to its target cell |
| Catapult | armed / fired | rules; on fire shows a GM notice |
| Portal | open / closed | rules; while open, a token that lands on it is moved to its linked exit cell (a second portal, or a chosen cell) |

Plate, button, key and lever are all the same shape: a two-state object. Door, gate and portcullis are one kind with different art.

## How the GM builds a puzzle

1. Puzzle mode. Place objects from the palette, drag to move, click to select.
2. Selected objects land in **Selected**. Drag them into **When** or **Then**.
3. Click a chip to cycle its state, or pick "at" or "move" and click a cell on the map.
4. Save group. Saved groups list with a live dot (green = met) and a remove button.
5. Reset all puts every object back to its start state and place.

## Architecture

- `puzzle-core.js`: pure rules and the kind table. No Firebase, no DOM. Reusable in the VTT, GeezSheets and Owlbear.
- `store.js`: the only file that knows about Firebase. All data lives under `/test`.
- `vtt.js` and `vtt.html`: drawing, placement, panel, interaction.
- Only the GM client runs the rules, so two clients never race.
- Event objects fire from a transition `armed -> fired` seen by the GM client.

## File organization (agreed)

Split by who needs the code. `puzzle/` is what ships; `vtt/` is throwaway UI that gets rewritten for each home.

```
puzzle/                 reusable, pure, no DOM, no Firebase
  objects.js            kinds, states, derive, onFired, defaults
  triggers.js           evaluate, resetAll
  index.js              re-exports both (replaces puzzle-core.js)
  test/                 node tests for both
store.js                the only file that talks to Firebase (the swap point for /v2 or OBR metadata)
vtt/                    this prototype's UI
  vtt.html
  vtt.js                map events, wiring
  draw.js               drawObject, drawTokens (the ink look)
  panel.js              palette, inspector, chips, group list
  vtt.css               the parchment style
PLAN.md
old/
```

- `puzzle/` moves into GeezSheets and Owlbear as-is, so it stays pure.
- Changing the database means changing `store.js` only.
- One file per object kind is not wanted: kinds stay as table entries in `objects.js`. Split a kind out only when it grows real code (for example a sequence puzzle).
- Triggers stay in one file; no `triggers/` folder.
- Delete `puzzle-core.js` once `puzzle/index.js` exists (it is a stopgap re-export now).
- Move the node checks into `puzzle/test/` so they run after every change.
- Do this next, before the hidden flag and the restyle, so both land in the new files.

## Hidden objects (next)

- `hidden: true/false` on each object, separate from its state. Rules ignore it: a hidden tripwire still trips.
- Players do not see hidden objects. The GM sees them ghosted with a dashed outline.
- Right-click an object (GM): Reveal / Hide, so a passed perception roll can reveal it.
- Tripwire, spawn, stone, catapult and floor start hidden when placed.
- Limit: with no logins, a player's browser still receives hidden data. Real hiding needs GM-only data later.

## Look

Ink and parchment. Paper noise, wobbly ink walls, hand-drawn objects, ink-stamp tokens, leather and brass UI. Visual changes only, behaviour untouched. A Codex attempt wrote nothing after ~10 minutes and was stopped, so this is done directly, after the reorganize (the look lives in `vtt/draw.js` and `vtt/vtt.css`).

## Later

- **Move that stays put (to figure out):** today `move` is level-based, so an object returns to its start cell when the rule stops being met (a plate lifts and the moved thing slides back). Often we want it to stay where it landed. Needs a per-result choice, something like `mode: "follow" | "once"`, where `once` moves on the rising edge only and leaves the object there. Open questions: how a chip shows the choice (click to cycle, like the other chips), and whether the same choice should apply to state results too (a door that stays open after the plate lifts). Reset all still puts everything back.

- **dd2vtt parts as objects:** walls (solid / gone), doors, lights import as static map data. Click one in puzzle mode to promote it to an object with an id that points back at its source, so a re-import keeps the link.
- **Portal details (to figure out):** one-way or paired two-way, how the exit is linked (pick a cell like "move", or pair two portal objects), and how to stop a token bouncing back and forth when it lands on the exit.
- **Sequence puzzles** ("press in this order"): needs memory of events, so an extra recorder object.
- **Counters and timers** ("three rounds", "within 30 seconds").
- **Paths and animation** for the rolling stone, instead of a jump.
- **Loop guard** for two groups that fight over one object.
- **HP source:** point the gauge at the real Gaia HP (`/v2`) instead of a number kept on the test token.
- **Access control and GM-only data** once it moves into `/v2` or Owlbear.

## Status

- Done and tested (`node --test puzzle/test/`, 11 tests): rule engine, placement, inspector, selecting and dragging chips, "at" and "move" cell picking, Switch / Dial / Gauge, event objects, GM Reset, HP tray, toasts.
- Done: Firebase `/test` sandbox, synced tokens and objects.
- Done: reorganized into `puzzle/` and `vtt/`; hidden flag with GM right-click Reveal / Hide; ink and parchment restyle.
- Next: pick from "Later".
