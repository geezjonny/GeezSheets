# Brief: redesign the UI of `companion.html` (GeezSheets folder). Visual/UX only.

`companion.html` is a mobile character companion (single file, inline CSS + one inline module script). It works, but it looks like a generic dark list.
Improve the UI and presentation ONLY. Do NOT change data paths, Firebase calls, write logic, roll logic or the `data-act` handler semantics
(you may rename CSS classes, restructure markup and add new display-only markup/helpers). Do not touch any other file. Keep it one file, no CDN, no frameworks.
Keep `node --check` passing on the extracted module script. Do NOT write to the live database while testing.

## Look & feel: "parchment and brass" table companion that matches the VTT
Palette to use (CSS variables on :root): deep ink background `#12100e`, leather panels `#1d1814` / `#262019`, brass accent `#c9a24b` (hover `#e0bd6a`), parchment text `#e9dfc7`,
dim `#a39a85`, blood red `#b3412f`, emerald `#4f9d69`, arcane violet `#8a6fd1`, ice `#5aa7c7`. Fonts: system serif for names/headings (`Georgia, 'Iowan Old Style', serif`),
system-ui for numbers and controls. Subtle 1px brass borders (`#4a3f2a`), 12-14px radii, soft inner shadow, a faint paper-noise or leather gradient via CSS only (no images).
Respect `prefers-reduced-motion` and keep contrast AA.

## Home screen (most important)
- Hero card: large portrait (88px, brass ring, token colour glow) beside name (serif, 1.5rem) and subline; class/level as a small brass badge.
- HP as the centrepiece: a wide, thick bar with the number overlaid big (e.g. "29 / 39"), temp HP as a blue segment, colour shifts green→amber→red, a subtle pulse under 25%, "Bloodied" tag at half.
  Damage/Heal controls: a single big amount field with quick chips (1, 5, 10) and two large buttons (red Damage, green Heal); Temp HP as a small secondary control. All 44px+ targets.
- Core stats as a compact row of "shield" tiles: AC (shield shape via CSS clip-path), Initiative, Speed, Prof, Passive Perception; Inspiration as a star toggle; Exhaustion as a 6-step pip row.
- Ability scores: six tiles in a 3x2 grid, modifier big, score small, tap feedback.
- Spell slots as glowing gem pips grouped by level with clear "Lv 1 / 2 / 3" labels, spent pips hollow; charge abilities similarly with their label and recharge note.
- Conditions: coloured chips (each condition its own tint), concentration as a distinct violet banner with spell name; at 0 HP the death-save block becomes a prominent card.
- Sticky mini-header that appears after scrolling past the hero: name + HP number + HP mini-bar, so HP is always visible on other tabs too (show it on all tabs, not just Home).

## Tabs and bottom bar
Bottom bar with inline SVG icons (simple strokes, no icon font): Home, Skills (list), Feats (star), Spells (flame/sparkle), Gear (sword), Items (bag). Active tab brass-lit with a small indicator; labels under icons;
`padding-bottom: env(safe-area-inset-bottom)`. Content gets bottom padding so nothing hides behind the bar. Smooth tab change (opacity/translate, disabled under reduced motion).

## Lists (Skills, Feats, Spells, Gear, Items)
- Section headers: serif small-caps with a brass rule.
- Skills: two-column grid of compact rows on wide phones, single column under 380px; proficiency shown as a filled/ring/double-ring dot; bonus right-aligned in a pill; saves as six round badges at the top.
- Spells: group headers "Cantrips", "Level 1" ... with slot pips repeated in the header of each level group; spell rows show school-ish colour stripe on the left (use concentration = violet, damage = red, healing = green, other = brass, based on existing fields),
  chips for cast time / concentration / damage; expanded state animates open; Cast/Attack/Damage as clear buttons at the bottom of the expanded card.
- Gear: weapon cards with big attack bonus and damage as two tappable "roll" buttons; armor/shield with AC; coin purse as five coin badges (cp sp ep gp pp) with coin-coloured dots.
- Items: grouped by category with counts, quantity badge, search box with clear button, empty state illustration made of text/CSS.
- Everything expandable uses `<details>`-like behaviour or an existing mechanism, with a chevron that rotates.

## Feedback
- Roll results: a bottom sheet / centred card with the label, the dice detail and a big total; nat 20 gold flash, nat 1 red shake (disabled under reduced motion); auto-dismiss after ~4s, tap to dismiss, stack at most 3.
- Toasts above the tab bar, not under it. Buttons get an `:active` press state. Show a subtle "saving…" state on write buttons if easy, never block the UI.
- Loading skeletons (pulsing blocks) instead of blank screen while the character loads; friendly empty and error states ("That character wasn't found. Pick another").

## Picker screen
Grid of character cards: portrait/initial, name, "Lv 5 Cleric", campaign tag, tap to open; search box when more than 8; remembers last pick; campaign grouping headers.

## Responsive
Design at 360-430px first. At >=700px centre a 560px column on a subtle background (or two columns for Skills/Items). No horizontal scroll at 320px. Landscape phone: tab bar stays reachable.

## Acceptance
- Same behaviour as before for every button (verify by grepping that every `data-act` value in the old file still exists and is handled).
- Script still passes `node --check`. File size stays under ~90 KB.
- Finish with a short list of what changed.
