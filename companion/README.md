# Compendium Companion

A journal window with a chat that knows the game. It reads the live Gaia data (Firebase `/v2`, the same data
`index.html` and `sheet.html` use) and turns requests like "Ashara takes 3 damage" or "give Lark 2 healing
potions" into the same Gaia actions as the `geez` CLI. **Nothing is written until you click "Let it be written".**

## Run
Needs Node 22.13+ and Ollama with `qwen3.5:4b` (Ollama only for chat; the journal works without it).
Double-click **Compendium Journal.vbs** (or `start-companion.cmd`, or `npm start`, then http://127.0.0.1:8765).
The window title shows what it is connected to.

| `GEEZ_URL` | Connected to |
|---|---|
| unset / `firebase` | **the live game** (`/v2`) |
| `firebase:/v2-test/<name>` | a test copy |

## How it works
- Chat → qwen picks ONE action from the Gaia registry (`js/gaia-core/actions.mjs`, type `/commands` for the list)
  → a preview (no write) appears as a card → approve writes it to Firebase, reject drops it.
- On approve it previews again against the live data; if anything changed in between it shows the new result
  and asks again.
- Questions ("how much HP does Ashara have?") read live records and never propose changes.
- Journal notes (`/note ...`) and chat history stay on this PC in `data/companion.sqlite`.
- Firebase transport: `js/gaia-core/firebase-store.mjs`.

