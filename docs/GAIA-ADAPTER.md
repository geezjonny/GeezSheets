# Gaia adapter

Gaia pages can use Firebase Realtime Database directly, without the Node database server. Serve GeezSheets as static files over HTTPS. The browser uses the project's Firebase 11.1.0 compat SDK; there is no Firebase Auth flow or rules change.

## Open a Friday session

On the deployed site, use these paths (replace the campaign/PC if needed):

- GM: `gaia.html?gm=jonny&campaign=world__daddies`
- Player: `gaia.html?player&pc=ashara&campaign=world__daddies`
- Player sheet: `sheet-gaia.html?player&pc=ashara&char=ashara&campaign=world__daddies&live=world__daddies`

The wrappers select `?db=gaia&gaia=firebase` on non-localhost addresses, using only `/v2`. On localhost/127.0.0.1 they select the same origin's Node transport. Override either with `&gaia=http://127.0.0.1:8740` or `&gaia=firebase`. For isolated Firebase testing use `&gaia=firebase:/v2-test/<run-id>`. Other Firebase root paths are refused. The same switches work directly on old-index.html and old-sheet.html. Opening a static file through file:// is unsupported; use HTTP(S).

Do not use live legacy Firebase pages for this session: Gaia mode routes compatibility paths into the selected v2 root. It does not write to rodeo, characters, geezvtt, session, campaigns, maps or dice at the database root.

## Data layout and files

The selected root mirrors worlds/gaia/entities, worlds/gaia/links, campaigns and apps. Legacy apps/sheets/files moves to `files/<encoded filename>`. Embedded data URLs in input snapshots are extracted to deterministic filenames as well. Uploaded pictures are data URLs under that files subtree and are fetched only when a map requests them, never by the initial subscriptions. World/location pictures work; battle scenes render data.scene, with built-in material/prop assets instead of a published map painting.

Keys escape %, . # $ [ ] / and control characters reversibly as %HH. All-numeric object keys are also escaped to avoid Firebase turning objects into arrays. Empty objects/arrays use a reserved %EMPTY marker because RTDB otherwise deletes them. Real keys containing %EMPTY are escaped, so they cannot collide. Use the converter and adapter together rather than uploading the raw Gaia snapshot.

The supplied snapshot converts to 305,880 JSON bytes: worlds 201,631; campaigns 26,065; apps 78,124; files 19 (an empty-container marker). Initial converted data excluding files is 305,852 bytes. The offline browser measured a decoded initial mirror of 302,489 bytes after Firebase-style null removal. These are JSON payload sizes, excluding SDK, static assets, HTTP and subscription overhead. The browser logs its initial size on each connection.

## Shared validation and synchronization

js/gaia-core/write.mjs is the shared write boundary used by the Node server and Firebase transport. It includes schema checks, role/PC ownership, campaign creation/rename, proposals, standard actions including map.publish, and change preparation. Schema loading and IDs work in both Node and browsers. js/gaia-core is the only copy of the Gaia core (GeezSuite no longer has one); edit it here.

The adapter projects canonical records into the legacy RTDB-shaped view used by existing pages. source.id/source.mirrors preserve aliases between legacy sheet/map/board IDs and canonical IDs. Unknown entity fields survive patches. Deletion uses _sheetsDeleted tombstones. Migrated grouped tokens and canonical flat tokens are supported; PC/NPC HP lives on the entity, creature-instance HP on the token.

Firebase readers subscribe using child_added/changed/removed on entities, links, campaigns and apps. Events update the mirror and notify changed views; they do not reload the root or files. A writer takes an RTDB transaction lock at _writer, refreshes only affected records, executes every plan against a private snapshot, and submits a single atomic multi-path update. Concurrent character and token writes therefore survive, and a failed plan leaves no partial writes. Compare-and-set state conflicts retry through the existing adapter transaction API. Character transactions also guard the entity read before invoking the update function, so simultaneous sheet HP changes retry rather than losing a change. Standard HTTP transport retains fetch/SSE and the existing Node persistence.

All cooperating Gaia browser writers use _writer. It has no expiring lease that could allow a slow writer to overwrite a successor. A live SDK onDisconnect registration releases a crashed connection's lock; normal completion cancels that registration and releases ownership. If a connection dies in the small gap between acquisition and registering onDisconnect, a stale lock may need operator recovery. Competing clients make up to 200 attempts with 30 ms backoff (plus network round trips) before reporting busy; retry after connectivity returns. External writers bypassing this protocol are not coordinated.

## Permissions and remaining limits

- GM remains ?gm=jonny. Players select ?player&pc=<sheet-or-Gaia-id> (or choose their PC in the UI). Own-PC resources and own-token x/y movement are checked in the adapter and shared core. Other-PC edits are rejected.
- These are application checks, not authentication or secrecy. Without Auth/rules, a client with direct database access can bypass them. Player visibility remains the existing UI projection.
- Player-authored rolls, pings, presence, rollcall responses, party notes/cards/layout and initiative edits remain GM-only and are rejected. GM state writes work. These need narrow ownership/append checks before enabling player writes; they are not covered as working Friday player features.
- Very large data URLs can exceed SDK write limits; there is no file chunking or Cloud Storage transport.
- Link/entity deletion uses tombstones; other Gaia consumers may need tombstone filtering.
- The fake models asynchronous compat events, shared pages/frames, multi-path atomic updates, transactions and RTDB null/empty-container removal. It does not establish deployed rules, real network latency, SDK reconnect behavior or onDisconnect recovery. Those require the real test and a network rehearsal.
- The HTTP adapter still sends several requests for a multi-plan compatibility write. Firebase batches those plans atomically; the HTTP transport retains its existing request semantics.

