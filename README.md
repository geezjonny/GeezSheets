# Compendium Companion — local inventory test

A local HTML chat connected to Ollama. This is the requested inventory testing interface, not the complete build brief. It has no Firebase write connection or LAN/player access.

## Run
Requires Node.js 22.13+ (Node 26 is installed here), Ollama, and the installed qwen3.5:4b model. No npm dependencies.

1. Keep Ollama running.
2. Double-click **start-companion.cmd**, or run `npm start` in this folder.
3. Open **http://127.0.0.1:8765**.
4. Choose a campaign and character. Click **Try an inventory award**, then **Send**.
5. Example: **Ashara gained 3 healing potions.**
6. Inspect the proposed before/after quantity. Inventory stays unchanged until **Approve & apply**.
7. Reject a second award to confirm it leaves inventory untouched.

The server binds exclusively to 127.0.0.1. Keep its terminal open. Ctrl+C stops it. The launcher may open the page before startup completes; refresh if needed.

## Data and limitations
The first run copies characters/pcs from geezsheets-default-rtdb-export.json into data/companion-test.sqlite. It never modifies the export or connects to Firebase. Later restarts resume this SQLite database rather than reimporting. The UI labels the active mode.

The export has 12 PCs in Dungeons & Daddies and Dungeons & Disney. No potion definitions were found in their inventories or geezvtt/campaign/things. Two explicit test fixtures, Potion of Healing and Potion of Greater Healing, make the example testable. Other existing inventory definitions are searchable. The prototype only supports compatible quantity stacks; it refuses duplicate or incompatible stacks. No NPC awards, HP actions, item consumption, leveling, ownership/LAN authentication, live Firebase integration, or backup/restore UI is implemented.

One award per message. Exact-name resolution wins; ambiguous lookups return candidates to Qwen. Clarifications retain recent tool/chat context, but do not assume model accuracy: always inspect the preview. A model reply alone is not proof of a queued change; the review panel is authoritative.

Chat, tool context, proposals, inventory copies and application audit records persist in SQLite. Retrying a failed chat uses the same request ID; a fresh Send is a new request and can create another award. Approval checks the displayed proposal revision and inventory fingerprint in a transaction. A stale approval updates the preview and requires another click. Reapplying the same proposal cannot award twice. The local DM is the only actor in this prototype.

## Configuration
Optional PowerShell environment variables before `npm start`:
```powershell
$env:OLLAMA_MODEL = 'qwen3.5:4b'
$env:OLLAMA_URL = 'http://127.0.0.1:11434'
$env:PORT = '8765'
$env:FIREBASE_EXPORT = 'C:\path\to\export.json'
$env:TEST_DATABASE = 'C:\path\to\a-new-test.sqlite'
npm start
```
To start a fresh isolated test, stop the server and set TEST_DATABASE to a new filename. Existing files are never silently overwritten or reseeded. Copy data only with the server stopped; this is not a complete backup/restore implementation.

## Verification
`npm test` runs fixture-based SQLite and fake-model checks for approval, rejection, validation, ambiguity, stale previews, retry deduplication, restart persistence, and prevention of model approval. It does not test Firebase.

For a live Qwen smoke test, send an award, confirm a proposal appears, approve it, refresh, and verify the increased quantity. Try “Ashara gained 3 potions” to test clarification. Stop Ollama and confirm chat shows an error while inventory/review remain usable. Model requests have a 120-second timeout and bounded tool calls.

The Ollama integration follows its native /api/chat tool-calling interface: https://docs.ollama.com/capabilities/tool-calling

## Spending inventory
Say **Ashara used 1 healing potion**, **Ashara drank 2 healing potions**, or ask to remove a quantity of another owned item. Review and approve the decrease. Spending refuses insufficient quantities and keeps empty stacks at quantity zero. It does not heal HP or apply item effects. Pending awards from earlier versions remain valid.

## Expanded campaign commands
See COMMANDS.md for 27 additional actions: HP, spell slots, ability charges, currency, manual field corrections, NPC creation/update, locations, notes and events. Click **Commands & examples** in the chat to fill a sample request. Type **/commands** for the guide without needing Ollama. All mutations are approved DM actions in the local test database. This remains a loopback-only prototype, not the player-authenticated full application in the build brief.

On upgrade, campaign-linked NPC sheets and world things are copied once from the export into a new records table. Existing test characters, inventory changes, queues, audit and chat are retained. World records without a verified campaign association are excluded from commands. The original app's graph mirrors, VTT map/token state and historic logs are not synchronized by these commands.

## Journal window
Double-click **Compendium Journal.vbs** (or start-companion.cmd). This starts the local server if needed, then opens a compact 940x800 Edge app window without browser tabs or an address bar. No install or additional dependencies are needed. Closing the journal window leaves the local server running so reopening is quick. Ollama is only required for Ask companion; keep Ollama running for commands.

**Journal note** saves dated writing directly to SQLite without invoking the model or altering character/campaign records. **Ask companion** continues the existing proposal-and-approval workflow. Use the left margin buttons for characters, review, and command examples. Pending changes appear in the Review count. Previously approved/rejected changes are collapsed under history. Draft writing and selected campaign/character are remembered in this browser profile. The journal displays the latest 80 messages; older entries remain in SQLite.

The window uses the existing local HTML application in Edge app mode; it is not a packaged native executable. Chrome is a fallback; if neither is installed it opens in the default browser. Startup errors appear in a message box. Background server logs from the launcher are under data/server.log and data/server-error.log.

## Chat-only interface and questions
The interface is now only the conversation and composer. Questions and commands share the same text box. Pending approvals appear inline, and approval/rejection outcomes are recorded in the conversation.

- Ask **Do we have Old Man Shade as an NPC?** This lookup reads saved records across the local DM's campaigns, reports the campaign, and does not need Ollama. Matching NPC sheet/world records are deduplicated.
- Ask **Who is Ashara?**, **Where is Mira?**, or other campaign questions. Qwen can search saved records and inspect them. Recognized informational questions have only read tools exposed, and the dispatcher rejects attempted writes for those turns. General Qwen answers have not been live-tested in this update.
- **/note Your writing here**, **Journal: Your writing here**, or **Save a note: Your writing here** saves a journal entry directly without Qwen. This does not promote the note to canon.
- **/campaigns** displays campaign choices inside the conversation.
- **/commands** lists supported updates.
- Journal search results are labeled as notes, separate from approved campaign records. Pending/rejected proposals are not treated as saved NPCs/events.

The earlier journal-mode tabs and side drawers have been replaced by this chat-only layout. Notes-first extraction, session preparation/live-journal separation, and initiative parsing are still future work.

## Blank-page journal
The interface is now a plain page with unboxed writing and quietly appearing replies. There are no speaker labels, suggestions, visible send button or chatbot header. Write directly on the page and press Enter for a response; Shift+Enter adds a newline. Earlier conversation is preserved under Earlier writing. Existing approvals still show the exact change and require confirmation, styled as marginal writing. Questions still use saved records; tone changes do not grant additional mutation permissions. Model-generated prose has been instructed to stay brief and natural; live model tone has not been separately tested.
