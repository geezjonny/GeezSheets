# Plan: live water (and lava) as an Owlbear effect

Status: planned 2026-11-12, not started. Ship battle on 11-13 uses a WebM from `tools/loop-maker.html` instead.

## Why
`tools/loop-maker.html` draws cartoon water with a WebGL shader and records a WebM.
OBR SDK 3.1.0 (already used by `owlbear/background.html`) has **Effect** items that run SkSL shaders on the map:

```js
buildEffect().effectType('STANDALONE').width(w).height(h).sksl(code).uniforms([{ name, value }]).build()
```

A live effect has no loop seam, stays sharp at any zoom, uploads a few KB instead of 10 MB,
and can change colour, flow or speed mid-session by updating uniforms.

## Steps
1. **Port the shader to SkSL.** Copy the FRAG shader from `loop-maker.html`: `vec2` becomes `float2`, `vec3` becomes `half3`/`float3`,
   `main()` becomes `half4 main(float2 coord)`, `gl_FragCoord` becomes `coord`. Keep the hash, vnoise, swirl and edges functions as they are.
2. **Time.** Check whether OBR passes a built-in `time` uniform to effects (not in the SDK .d.ts files, so check the docs).
   If it doesn't, have the extension background update a `t` uniform, which is slow and syncs to everyone, so avoid that.
   Loop phase = `fract(time / seconds)`.
3. **Place it.** Add a context-menu entry in `background.html`, "Add water". It builds an effect covering the selected map item
   (or the viewport) on the MAP layer, below the tokens. Store the preset in item metadata.
4. **Presets.** Reuse the `PRESETS` table from `loop-maker.html` (sea, deep ocean, stormy, river, swamp, lava),
   plus a small popover with flow arrows, speed and colours that updates the uniforms.
5. **Test.** Use a test room, never a live session, and check it on a phone as well as the PC (each client runs the shader).
   Check for frame drops on a phone at full-map size.

## Watch out for
- SkSL has no `fract` on ints and no dynamic loop bounds; the 3×3 voronoi loop is fixed, so it's fine.
- `edges()` runs 3 times per pixel (ripple, shadow, rim). Drop the shadow pass if phones struggle.
- The map scale in grid cells sets the wave size: tie `cells` to grid size so waves look the same on any map.
