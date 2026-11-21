# Player-view audit

The player client still receives the shared `/test` data, but it does not render GM-hidden content.

- 2D objects, props, decals, tokens, titles, SVG data attributes, selection targets, and token menus are filtered before DOM creation.
- Closed `map.fog` filters objects, props, tokens, doors, and lights; light/torch cells are the only player reveal path. Fog changes and reveals redraw live.
- The 3D builder uses the same pure visibility rule and adds a per-cell fog surface for unrevealed fog cells. Hidden props, tokens, doors, and lights are not added to the scene or raycast targets.
- Initiative and roll-call player lists omit hidden or fog-covered tokens. Puzzle tools, inspector, saved groups, and their DOM are not created for players.
- Player event toasts and hidden-door audio are suppressed; dice, ping, measure, attack targets, and token tray paths do not create hidden-record elements.
- Existing player-visible labels, floors, walls, weather, revealed roofs, and shared annotations remain unchanged.

The pure rule is in `js/vtt/visibility.js`, with tests in `js/vtt/test/visibility.test.mjs`.
