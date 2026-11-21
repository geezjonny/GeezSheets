# Atomic scene writes

Scene save/load currently writes the live map, objects, tokens, groups and initiative as separate RTDB paths. A disconnect between those writes can leave a scene partly replaced, so `js/vtt/scenes.js` and `js/vtt/dd2vtt.js` should move to one atomic scene operation.

## Recommendation

Build one multi-location `patch()` containing every destination path for the import or load, including `map`, `objects`, `tokens`, `groups`, `initiative`, `seeded`, and any imported atmosphere/audio. Keep the transform and validation local first, then issue exactly one RTDB write. Firebase applies a multi-path update atomically: readers see either the old paths or the complete new set.

The staging-pointer alternative is useful if the payload grows too large: write a versioned staging record, validate it, then atomically update a small active-version pointer. It adds cleanup and reader fallback complexity, so it should be the second choice here.

## Rollback story

Before replacing a live scene, retain the previous complete snapshot (or its version pointer) for one rollback slot. If validation fails, the write is rejected before the patch. If a later UI action must be undone, issue one inverse multi-path patch from that snapshot. For a staged implementation, leave the old pointer active until the new version is fully written and validated; an interrupted staging write therefore continues to serve the old scene, and abandoned staging records can be garbage-collected later.
