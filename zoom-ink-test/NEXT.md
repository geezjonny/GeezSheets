# Status 2026-11-05 (read PORT.md for the plan)
- Done on master (a53bfd0): card.js (right-click / long-press a place, battlemap or token opens its card;
  replaces the campaign board), lore on every settlement, Towns tool rolls places. tools/check-card.mjs.
- Codex job `sites` (worktree ../zoom-test-sites): cave, mine, shrine, tower, wizard units + bridges.js.
- Codex job `lore-towns` (worktree ../zoom-test-towns): items 3, 5, 6 below.
- Next: review both, merge into master, run check.mjs + check-card.mjs. Then Phase 2 (campaign data from
  Firebase), also a good Codex job. Claude usage is near its weekly limit: hand building to Codex.

# Where zoom-test stands (2026-11-04, late)

## Done
- Lore-driven settlements (`lore-towns`): per-kind profiles, city ring street, terrain-following
  palisades/stone walls with road gates and towers, roadside fields and prop clearing, windmills,
  wells, temples, inn signs, smithies, farmyards and crossing signposts. Both LODs merge to at most
  three meshes. Pin/road edits invalidate surrounding field props; map alignment uses `UNIT_KINDS`.
  `tools/check.mjs` covers gates, field/wall tree exclusion, lore counts, deterministic LODs and a
  radius-320 city budget, and captures all six kinds (overview and detail) in `tools/out/lore-*.png`.
- v5 (commit 1f87d1a): towns are built around the world's roads; battlemaps are separate grid pins
  that drape over whatever is there; Towns / Maps tools; Cutaway in Play. All checks pass.
- `node tools/serve.mjs 8123 --lan` serves to phones on the same Wi-Fi (prints the address,
  e.g. http://192.168.68.134:8123/).
- `lore.js`, the location generator (lite WorldForge):
  - Kinds: city, town, village, hamlet, keep, watchtower, wizard's tower, mine, cave, shrine,
    farm, crossing, camp, ruin. Categories are Settlements / Points of interest / Rural & wild,
    as in the user's own place generator (html-test.html).
  - Each roll gives: size tier and population (which sets the radius), faction, ruler and
    government, a hidden power (GM only), defences (wall, palisade or none; towers; guards),
    named buildings with owners, NPCs (trait, want, secret), what it is known for (from the
    terrain), mood, atmosphere, an oddity, a local danger, hooks and rumours. Sites also get
    rooms, dwellers, a threat level and treasure.
  - `rollPlace(world, x, z, kind|'any'|category, seed)`, `rollLore`, `rollSection` (reroll one
    section), `featuresOf(S)` (what the 3D builder needs), `summary`, `governmentOf`.
  - Factions are meant to be shared through `world.data.factions` (rolls reuse one 50% of the time).
- world.js:
  - new kinds are in `UNIT_KINDS` / `DEFAULT_R`; `DENSE_KINDS` (city, town); `data.factions`;
  - `clearOfProps` keeps trees out of walled towns.
  - props.js also asks `world.fieldFn` (not set yet) so trees stay out of fields.

## Left to do (next session)
1. **Wire the lore in:**
   - settlements without `lore` get `rollLore(world, S, S.seed)` on load (main.js loadData);
   - the starter world rolls lore for its places;
   - new places from the Towns tool use `rollPlace` with a "New: Any / category / kind" picker.
2. **Details card:**
   - styled like html-test.html (gold accent #c9a050, Georgia, info blocks, a hook box);
   - opens from the Towns tool and when a settlement label is tapped;
   - has a die per section to reroll it, Roll all, a kind and size select, and GM notes;
   - players see only the public parts (no hidden power, secrets, hooks or notes).
4. **New units in places.js:** tower, wizard (slender spire), mine (timber shaft frame, sheds,
   rail carts), cave (rock mound with a dark mouth, bones), shrine (standing stones, altar, chapel).
7. Codex (usage resets 2026-11-05 01:32): good jobs to hand it are the new unit builders,
   house interiors for the cutaway, and street variety.

## To test
- `node tools/check.mjs` (desktop and phone emulation). Add checks:
  - a rolled place has lore;
  - a walled town has gates where its roads cross the wall;
  - no trees inside fields or walls;
  - the player card hides GM-only parts.
- City performance (r up to 320, many houses): triangle counts at area and battlemap zoom, and
  on a real phone over `--lan`.
- On a real phone: pinch, two-finger turn, painting, tapping labels, the details card on a
  small screen.
- Screenshots of each kind: city, town, village, hamlet, farm, crossing (bridge), keep, tower,
  wizard, mine, cave, shrine, camp, ruin.
- Old saves: v1 places and v2 settlements without lore should load and gain lore.
