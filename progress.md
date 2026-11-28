# Progress

## 2026-11-28
- `sheet.html` sends its rolls to the Geez3DVTT board (`gmroll/gaia/<character>`), as `companion.html` does.
- Both pages show a warning when a roll does not reach the board.
- Tests pass. `companion.html` rolls were seen on the live board; a live `sheet.html` roll is still to be tried.
- **Save errors fixed** ("Not saved: signal timed out"): the shared-dice and Deck of Chance feeds each held one of the
  browser's six connections to the database, so a few open tabs blocked every save. Both now use the Firebase SDK
  (`js/geez/live.js`). Do not use `EventSource` on the live database.
- **Packs:** the Bag tab has an **Unpack** button, so single things from a pack can be used or sent.
- 88 tests pass. With three local companion tabs, Equip and Unequip reached the save step quickly (saving was blocked in
  the test) and both feeds received data. Left: a real save, dice animating between two devices, a GM deck draw, and
  Unpack in a browser. Reload every open companion tab after the update (up to 10 minutes to arrive).
- Seris's **Thirsty Blade** to hit is still 2 (other attacks are +7); change it in the Character Workshop (GM, Create tab).
