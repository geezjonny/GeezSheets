# To-do

Written 2026-11-19. Last commit is `6bdd54e`; everything from the "full VTT" push below is **not committed yet** (say "save").

## Codex batch 2026-11-20: built, tests pass (65/65), NOT clicked through in a browser
Written by Codex jobs, node-tested only. The page loads with no console errors; nothing below has been exercised by hand yet.
- [ ] **Unfinished job (stopped partway):** floating **Label** and **Fog** windows (same family as Floors/Walls/Doors: 176px, x, recents, last-touched outline). Fog has a half-entry in `KP` (`tools.js`), Label has none. Some edits to `tools.js`, `panel.js`, `vtt.js` from this job are in the tree and unverified: check them or redo the job.
- [ ] **Puzzle rework (same stopped job):** one Puzzle window with 5 recent puzzle objects as swatches plus a dropdown, an x, same width. Logic (when/then rules) opens from **right-click a puzzle object > Logic** as its own matching window with an x, and still works with several objects selected. Rules data and engine must not change.
- [ ] **Door tool, point to point** (like walls: click start, click end, or drag; ghost preview; a row of doors for longer segments; replace an existing door on that edge). Never tried in the browser. Earlier "door placement is not happening correctly" is what this was for.
- [ ] **Lights window fix** (inputs overflowed the window, cramped rows, swatches look alike) plus the new **Intensity slider** (0.2 to 1.5, stored as `intensity` on the light). **Token window restyled** to match the Build windows (`token-palette.js`). Both done by Codex after a screenshot of the bug; not seen since. All Build windows should be 176px wide: check they line up.
- [ ] **Annotations window opens by default** on top of the Tools window. It should stay hidden until the Marks tool is picked.
- [ ] **Player-view audit** (`docs/vtt/player-view-audit.md`): hidden traps / hidden props / fogged content must never be visible on screen for players (2D, 3D, menus, tooltips, toasts, initiative list). Open the page as a player (no `?gm`) and check. Data-level security was deliberately NOT done; only the visual hiding matters.
- [ ] Click through the rest: **Pause** (and the "Paused" banner for players), the status strip (scene / round / turn), **duplicate scene**, **map labels**, **Marks** annotations (draw, pin, fade, clear), **effects** (durations, resist/vuln, bonuses), **Journal** (share / unshare), **explored fog** (+ Reset explored), **Generate dungeon**, **initiative** start menu (roll all / NPCs only / none) and scene load restoring initiative.
- [ ] Implement `docs/vtt/scene-writes.md`: make scene load and import atomic so a disconnect cannot leave a half-replaced scene.
- [ ] Table Chat: real two-person call test (only ever tested alone plus fake tiles), a TURN relay for strict firewalls, and a per-campaign room name or passcode.
- Skipped on purpose: macros / hotbar, an in-VTT text chat, data-level hiding of traps and fog (vault / secret paths).

## Just finished (needs a browser check)
- [ ] **3D props** (Codex job, DONE in code, NOT yet seen on screen): sprite-VTT method with faceted parts, constant-width ink outlines, new props (pine, bush, rock, stump, well, lamp post, fence; 2D glyphs added in `draw.js`). I fixed one bug (ink shader uniform `uRes` needed `{ value }`) and the page then loaded with no JS errors, but the automation browser tab was throttled (about 1.5 fps, screenshots timed out), so the look was never checked. Open 3D, look at every prop kind (place them from the build menu), check the outlines at several zooms. If 3D feels slow on your machine, the outline shells (one extra mesh per part) are the first suspect.
- [ ] **dd2vtt import/export** (`vtt/dd2vtt.js`, "Import" bar button, GM): try a real map from `GeezSheets/battlemap/` (e.g. `cavesystem.dd2vtt`, `prison_00.dd2vtt`), then export and re-import.
- [ ] **Token picker** (`vtt/tokenpics.js`): right-click token > Picture. Needs internet (art is hosted on the GeezSheets site).
- [ ] **Scene** menu: Save, Load, Clear. Never clicked through in the browser. Clear sets `seeded` so the demo map does not come back.
- [ ] **Image > Add > URL**: place an image, right-click it to resize or delete.
- [ ] **Ping** (ruler already tested).
- [ ] **Players**: "Me" button picks your character; you can only drag your own PC token; enemies are GM-only. Test with a second window without `?gm=1`.
- [ ] Touch: pinch-zoom and two-finger pan on a phone.

## Next (finish the integration)
- [ ] **Vision**: `vtt/vision.js` is ready (visibility polygons, tests pass) but not wired. Hook it into player fog in `draw.js` (`updateFogMask`): union of each PC token's visibility polygon, radius = token sight (default about 6 cells), doors that are not open block sight. Add a GM toggle (room fog vs line-of-sight).
- [ ] **3D**: roofs (gable for rectangles, see-through for GM), fog, map images as ground planes, picture tokens (billboard), condition rings under tokens, token size, a simple day / dusk / night tint.
- [ ] **Token size** (1, 2, 3 cells) in the token menu and in 2D / 3D drawing.
- [ ] Initiative: highlight whose turn on the map; optional roll-call for players.
- [ ] Docs: update `README.md` (new modules: `ui.js`, `view.js`, `dice.js`, `dice3d.js`, `initiative.js`, `scenes.js`, `images.js`, `measure.js`, `conditions.js`, `tokenpics.js`, `dd2vtt.js`, `vision.js`) and `CHANGELOG.md`.
- [ ] Commit.

## Decisions waiting on you
- [ ] **GM security**: anyone can type `?gm=1`. Options: (a) local Node server with a GM key (about 150 lines, no dependencies, server enforces who may write, `store.js` is the only file to swap, Firebase kept as fallback; remote players need a tunnel such as Cloudflare Tunnel or Tailscale Funnel); (b) Firebase auth + rules (needs console work); (c) leave as is.
- [ ] Hidden traps / fog / props are still sent to player browsers. A local server could split GM-only data.

## Ideas, in rough value order
- [ ] **Proximity chat** (Table Chat, `js/vtt/chatdock.js` + `videochat.html`): volume fades with token distance, silent past a range. About half a day. VTT works out each person's volume from token positions (40px = 1 cell, check feet per cell in the ruler) and posts `{name: 0..1}` to the call page, which sets each remote video element's `volume`, ramped so it does not click. Match names to tokens the same way `talk.js` does. Starting numbers: full within 15 ft, linear to silent at 60 ft. Decide: GM always heard by everyone (or a GM whisper / local toggle), players with no token hear everyone, tokens on other floors count as far, dim far tiles, a hearing-range ring on the map, GM settings for on/off and distances. Stretch (about a day more): muffle through walls with a low-pass filter plus a line-of-sight check (`reach.js` / `vision.js`). Only lowers volume in each browser, so it is not secret from a tech-savvy player. Do the real two-person call test first.
- [ ] Sounds from `GeezSheets/audio/` (thunder, portcullis, trap clank, war horn, ambience loops) and a small sound board.
- [ ] Door kinds: double, portcullis, bars, secret, arch, curtain, window (textures in `GeezSheets/textures/door`, art would need to match the ink style).
- [ ] Sprite tokens (GeezVTT-sprite: pixel characters with 8 directions and animations, from NPC Desk > Sprite Forge).
- [ ] Placement ghosts (see-through preview before you click).
- [ ] Weather (rain, snow, fog) and torch-lit night, from `zoom-ink-test/atmosphere.js`.
- [ ] Multi-select and copy / paste; grid on / off and grid size; notes and handouts.
- [ ] `GeezSheets/js/rollcall.js`: "DM calls for a roll" (init, save, skill).
- [ ] `GeezSheets/js/stamps.js` ink props for 2D.
- [ ] Underground / linked scenes (`zoom-ink-test/underground.js`) as a v2 of Scene.

## Decided to skip (keeps it simple)
- Atlas ink post-process and paper shader, `texel.js` pixel textures, the GeezSheets realistic textures (dark, clash with the parchment, ink and Wind Waker look), world / settlement generators, Owlbear extension code.

## Notes
- Codex jobs: always run `codex exec ... < /dev/null`. Without it `codex exec` hangs on "Reading additional input from stdin..." when started from a background shell (this is why the first two props runs did nothing).
- Browser caches ES modules hard: after editing, reload with `fetch('/vtt/<file>', {cache:'reload'})` then refresh, or hard-reload.
- Dice tray loads three r128 + cannon.js from a CDN the first time you roll.
- Test data written while developing was removed (initiative, conditions); `rolls/` history in Firebase `/test` has some dev rolls.
- Tests: `node --test puzzle/test/ vtt/test/` (19 pass at last run).
