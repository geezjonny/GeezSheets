# Puzzle prototype

Run `serve.cmd`, open `http://127.0.0.1:8000/` (index.html) (add `?gm=1` for the puzzle tools). ES modules need http, not file://.
Data syncs through Firebase RTDB under `/test` only.

- `js/puzzle/`: pure rules and object kinds. No DOM, no Firebase. Reusable in GeezSheets and Owlbear. Tests: `node --test js/puzzle/test/`.
- `js/store.js`: Firebase wrapper, the only file that knows about the database.
- `js/vtt/`: the VTT's UI (`vtt.js` wiring, `draw.js`, `panel.js`, `state.js`, `vtt.css`).
- `old/vtt/`: retired files.

