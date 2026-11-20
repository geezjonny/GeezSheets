# Progress

## 2026-11-18

### Done
- Reorganized into `puzzle/` (pure rules, kinds, tests) and `vtt/` (UI split into `vtt.js`, `draw.js`, `panel.js`, `state.js`, `vtt.css`). `store.js` stays at root. Old stopgap moved to `old/`.
- 11 node tests in `puzzle/test/` (run: `node --test puzzle/test/`). All pass.
- Hidden objects: `hidden` flag; traps start hidden; players don't see them, GM sees them faded and dashed; GM right-click reveals or hides. Rules ignore the flag.
- Ink and parchment restyle: paper noise, wobbly ink walls and objects, stamp tokens, leather and brass UI. Page loads in Chrome with no console errors.
- README, serve.cmd and PLAN.md status brought up to date.

### Notes
- Codex produced nothing on the reorg (same as the earlier restyle attempt), so all work was done directly.
- A python http.server on port 8000 may still be running.

## Todo

### Check next
- [ ] Click through GM tools in the browser: right-click Reveal / Hide, place each kind, save a group.
- [ ] Re-check HP text colour after the CSS fix (`.token text.hp`).
- [ ] Check a player view (no `?gm=1`): hidden objects must not show.

### Later (from PLAN.md)
- [ ] Move that stays put: per-result `mode: "follow" | "once"`; maybe the same for state results.
- [ ] dd2vtt parts (walls, doors, lights) as promotable objects.
- [ ] Portal details: one-way or paired, exit link, bounce guard. (Portal kind is in the plan table but not built.)
- [ ] Sequence puzzles (needs an event recorder object).
- [ ] Counters and timers.
- [ ] Rolling stone path and animation.
- [ ] Loop guard for groups that fight over one object.
- [ ] HP gauge from real Gaia HP (`/v2`).
- [ ] Access control and GM-only data (hidden data still reaches player browsers today).
