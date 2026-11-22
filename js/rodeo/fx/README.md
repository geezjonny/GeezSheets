# fx — sound effects

Put audio files here, named after the effect. `.mp3`, `.ogg` or `.wav` all work.

| File | Plays when |
| --- | --- |
| `click` | any button/menu click, flipping a switch, turning a dial |
| `door-open` | a door changes to open |

Missing files fall back to a small synthesized beep. Add a new effect by dropping a file here and calling `play("name")` from `fx.js`.
| `door-close` | a door changes to closed |
| `dice-roll` | a dice roll starts (everyone hears it) |

Door and dice sounds are CC0 recordings from the GeezSheets/godot-vtt sound set.
