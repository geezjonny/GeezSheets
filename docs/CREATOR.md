# Character Creator

`creator.html` builds a voxel character in three.js. It is a new page: nothing in `index.html`, `sheet.html` or any `old-*` file changed.

## Run it
Serve the repo root over HTTP (modules and `fetch` need it), then open `creator.html`:

    python3 -m http.server 8000      # then http://localhost:8000/creator.html

three.js comes from `zoom-ink-test/vendor/three/` (shared, not copied).

## What it does
- **9 races** from `data/races.json` (human, elf, half-elf, dwarf, halfling, gnome, half-orc, tiefling, dragonborn). Each has its own proportions; dragonborn get their own head (snout, crest, frills), tieflings get horns and a tail, half-orcs get tusks, elves get long ears.
- **12 classes** from `data/classes.json`. Picking a class sets outfit, headgear, weapon and colours. It never changes the face, hair or race.
- **Proportions**: chibi: a big head on a short, stout body. Torso and legs are two-thirds of the first version's height and the arms hang at the hips. Each race sets its own `legH` and `torsoH` in `parts.js`.
- **Face**: skin tone, 4 eye shapes, 8 eye colours (optionally glowing), brows, nose, mouth, scars, war paint.
- **Hair and beard**: 7 hair styles, 13 hair colours (the same names as `zoom-ink-test/figures.js`), 6 beards.
- **Gear**: robe / tunic / armor, 9 headgear options, 7 weapons, cloth, trim, metal and magic colours.
- **Save and share**: saved in this browser (`localStorage`), a share link (`#c=...`), copy/paste recipe, and a transparent 512 px bust PNG for a token.

## Files
| File | Job |
|---|---|
| `js/creator/parts.js` | Every option list, race proportions, skin tones, class presets. Add new options here. |
| `js/creator/recipe.js` | The recipe (plain data): defaults, validation, randomize, share encoding, `toLook`. |
| `js/creator/build.js` | Recipe to voxels. No three.js, so it runs in Node. |
| `js/creator/voxels.js` | Voxel grid and shape helpers. |
| `js/creator/view.js` | three.js scene, camera views, blinking, PNG snapshot. |
| `tools/creator.test.mjs` | `node tools/creator.test.mjs` |

## Using a character elsewhere in the suite
A recipe is a small JSON object (`{ race, gender, skin, hairStyle, ... }`). The page exposes `window.GeezCreator` and fires a `geez-creator-change` event:

    GeezCreator.getRecipe()      // the whole character, for saving on a PC
    GeezCreator.setRecipe(r)     // load one; { race, klass } alone brings that class's gear
    GeezCreator.getLook()        // the NPC look zoom-ink-test/figures.js reads (race, gender, hair, clothing, armour, weapon, seed)
    GeezCreator.snapshot({ size: 512, view: 'bust' })   // Promise<Blob> (PNG, transparent)

`toLook` uses the same words as `figures.js` (`'red, long and braided'`, `'tabard over mail'`, `'handaxe'`), so a creator character can drive the existing 3D NPC figure too.

## Not done yet
- Saving a recipe on a PC in Gaia/Firebase. The recipe is the field to store; nothing is written yet.
- Long hair is a flat sheet from behind; the back of the head is the plainest part.
- Women and men differ in shoulders, lashes and lip colour only.
