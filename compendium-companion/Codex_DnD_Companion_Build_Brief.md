# Build a Local Qwen D&D Campaign Companion

## Instructions to Codex
Build the application described here. Start by inspecting the current repository, its instructions, and the existing Firebase integration. Implement a working inventory-first vertical slice, verify it, and document how to run it. Do not stop at a plan or generate a mock interface that claims to update records.

This document is a build specification, not authorization to alter live campaign data during development. Use fixtures and an isolated emulator/test configuration for verification. Real campaign writes happen only through the authorized application workflows: DM-approved campaign changes or authenticated, ownership-checked player HP actions.

## Goal and priorities
A local chatbot helps a DM manage a D&D campaign. The DM speaks naturally; Qwen translates the request into specific tool calls. Application code looks up saved records, validates changes, performs calculations, queues an update, and applies it to Firebase after DM approval.

During normal use, Qwen does not generate or execute code. It fills structured actions using tools the developer implements once.

Priority order:
1. Inventory: distribute existing saved items through short chat commands.
   Include player HP updates and the local storage alternative as milestone 1B, before proceeding to milestone 2.
2. Persistent NPCs and events: preserve improvised content and what actually happened.
3. Leveling: prepare level and stat changes using configured rules and player choices.

Ship milestone 1 completely before expanding the later milestones. Preserve extension points without implementing a general agent framework.

## Fixed decisions
- Firebase remains the default, using the user's existing project and campaign records. Also implement a selectable local SQLite backend as milestone 1B. Each campaign uses exactly one active canonical backend; do not implement dual writes or automatic synchronization.
- Discover whether the existing app uses Firestore or Realtime Database; support the actual existing backend rather than building both.
- Run Qwen locally through Ollama, with the model name and endpoint configurable.
- Use structured tool calls, deterministic application logic, and a durable update queue.
- Require DM approval of the exact proposed inventory, level, NPC, and event changes. Authenticated players may update current HP and temporary HP on their own characters immediately, within explicit server-side field permissions.
- Save session notes and generated drafts promptly; approval does not need to wait until the session ends.
- The selected backend holds official state and clearly separated provisional notes and queued changes. Local mode stores these in one SQLite database owned by the server; Firebase mode uses the existing Firebase schema.

## Inspect before implementing
Find the current schema, campaign identifier, character records, saved item catalog, inventory representation, authentication, security rules, and existing UI/backend conventions. Reuse existing IDs and record shapes.

Write a short schema mapping in the repository explaining which actual paths and fields the companion reads/writes. Examples in this brief are illustrative, not existing paths. Add only the minimal schema extensions needed. Never silently replace an existing inventory or migrate live data.

If project configuration is absent, implement against fixtures and the relevant Firebase emulator. Document the missing configuration. Do not invent project IDs, credentials, or the user's schema.

## Suggested implementation shape
Prefer the existing stack where practical. For a new companion service, use Python, FastAPI, Pydantic, a Firebase adapter, and a small localhost web chat with a review panel. If the repository already has an appropriate backend, keep its stack rather than creating a second service without need.

Separate responsibilities:
- Chat/model client: sends messages and tool definitions to local Ollama.
- Tool dispatcher: validates and executes allowlisted tool requests.
- Campaign service: resolves records, prepares changes, calculates quantities.
- Queue/approval service: persists proposals and verifies approval.
- Storage interface and Firebase/SQLite adapters: handle reads, atomic application, and concurrency checks. Business logic and Qwen tools must not depend on storage-specific paths.
- Rules module: handles any supported level calculations later.

Keep credentials in the server environment. Never expose Firebase administrative credentials to the browser or model. Reuse the existing user authentication where available; only the DM can approve/apply changes. Default to loopback for DM-only use. Provide an explicit authenticated LAN mode for player access in milestone 1B. Validate request origins and protect mutation requests against cross-origin submission. Never expose the model service or administrative endpoints just to enable player sheets.

## Milestone 1: inventory

### Main interaction
DM: “Add 3 potions to Penishead.”

1. Resolve the character against saved records.
2. Resolve the item against the saved item catalog.
3. If either is ambiguous, ask a focused clarification and preserve the original quantity and intent.
4. Read the current inventory.
5. Prepare an add-item operation using resolved IDs and quantity 3.
6. Display the exact proposed change, including before/after quantities.
7. Persist it as pending review without changing official inventory.
8. DM clicks Approve and apply.
9. Validate the approved revision and current inventory, then commit the update and its application record.
10. Report success only after the storage operation succeeds.

For a fixture containing 2 healing potions, the preview should read: “Penishead — Potion of Healing: 2 → 5.” That quantity is example data only.

Use saved item definitions, properties, and descriptions. Reuse the current schema's reference/snapshot convention. Stack compatible stackable items. Preserve unique instances when the existing model distinguishes individual items. Do not duplicate an existing stack by accident or invent an item definition when lookup fails.

A repeated message may represent a second legitimate award. A retry of the same queued update must never award items twice. Use request/update IDs to distinguish those cases.

### Initial model tools
Names are suggestions; adapt to the existing schema:

```text
find_characters(name_or_alias)
find_saved_items(name_or_alias)
get_inventory(character_id)
queue_inventory_add(character_id, item_id, quantity, session_id)
get_pending_updates(session_id)
```

Lookup tools return IDs and enough relevant details to disambiguate. Queue tools accept resolved IDs, validate them again, and return the actual persisted proposal and its ID. Reject arbitrary database paths, unknown properties, invalid IDs, non-integer quantities, and quantities below 1.

Approval/application is a trusted UI/API operation. Do not expose a model-callable function that can approve its own proposals.

### Minimal UI
- Chat with persistent session selection or one resumable active session.
- Inventory lookup/view for the selected character.
- Pending changes showing character, item, quantity delta, before/after values, and status.
- Approve and apply, reject, and revise actions.
- Accurate success/error/conflict feedback.
- Session and queue restored after restart.

A DM can approve a change during play. Post-session batch review can follow once individual approval works.

## Milestone 1B: player HP and local-file hosting
This is part of the build scope. Complete the Firebase inventory slice first, then implement player HP and the SQLite alternative before expanding NPC/leveling features.

### Two storage modes, one application
- `STORAGE_BACKEND=firebase`: use the existing Firebase backend and records.
- `STORAGE_BACKEND=sqlite`: use one local database file at a configured path.
- All browser and Qwen mutations go through authenticated server endpoints. The server is the only writer in local mode. Players never open or directly modify the database file.
- Keep the same tools, approval rules, record identities, and UI behavior across adapters. Do not build a second companion app for local mode.
- SQLite is the local-file storage choice. JSON is for validated import/export and backups, not a concurrently edited live file. Direct live JSON storage is not required.
- Switching the configuration must not silently switch an existing campaign to an empty database or copy production data. Show the active backend/campaign clearly. Provide explicit, validated import/export for local portability; cross-backend automatic migration and sync are out of scope.

### Player interface and permissions
Provide a responsive browser character sheet reachable on the host's LAN address when LAN mode is explicitly enabled. Include current HP, max HP as read-only, temporary HP, damage/healing controls, temporary-HP controls, and clear saved/pending/error status.

Players authenticate and see only character data they are authorized to access. Persist server-controlled ownership mappings. A client-supplied character ID or role is never proof of access. The DM can manage ownership and update all campaign characters.

| Operation | Player permission | DM approval |
| --- | --- | --- |
| Current HP and temporary HP | Own characters only | Immediate, no queue approval |
| Maximum HP and permanent stats | View only; submit choices later if supported | Required |
| Inventory awards and transfers | View permitted inventory; no direct award/write permission | Required |
| Levels, NPCs, and campaign events | No direct canonical write permission | Required |

These permissions must be enforced on the backend on every request. In Firebase mode, enforce equivalent rules for any permitted direct client access, and remember that administrative SDK writes require authorization in application code. Deny arbitrary character-sheet patch requests and cross-campaign access.

Reuse existing authentication if available. For a new local deployment, provide a minimal documented DM/player login or revocable invite/session mechanism with protected credentials and server-validated roles. Do not ship anonymous LAN write access or hard-coded shared administrative credentials.

### HP operations and simultaneous changes
HP updates must not invoke Qwen or require Ollama to be running. Use narrow operations such as:

```text
apply_damage(character_id, amount, request_id)
apply_healing(character_id, amount, request_id)
set_current_hp(character_id, value, expected_hp_revision, request_id)
set_temporary_hp(character_id, value, expected_hp_revision, request_id)
```

Validate integer amounts, ownership, campaign membership, and configured HP limits. Define the campaign's HP policy explicitly: damage consumes temporary HP first where appropriate for the configured rules, healing does not exceed max HP by default, and temporary HP replacement/stacking follows the selected policy. Do not automatically implement death saves or other unrequested combat mechanics. Provide fixture policies and document assumptions.

Apply delta operations against the latest persisted values in a transaction. For example, with HP 20/30 and zero temporary HP, simultaneous damage 5 and healing 3 must result in HP 18, with both actions logged. Absolute set operations must detect a changed HP revision and request refresh/confirmation rather than overwriting a newer value.

Persist the HP change, its deduplication marker, and audit entry atomically. Retrying the same request ID returns its recorded result without applying it twice. Bind the ID to the actor, character, and payload; reject reuse with different parameters. Record actor, operation, before/after HP, timestamp, and action ID.

Never write an old whole-character snapshot to update HP. Inventory approval must preserve simultaneous HP updates, and HP actions must preserve inventory and levels. Use field/record revisions scoped to the affected data so an unrelated HP change does not unnecessarily invalidate an inventory proposal.

Use SQLite transactions, constraints, and appropriate locking/busy handling for local writes. Do not rely solely on an in-memory lock for durable correctness. Keep the database on the server's local disk, not a shared network folder or simultaneously synced editable file.

Refresh connected player/DM views after committed changes using polling initially or authenticated server events/WebSockets if useful. On reconnect fetch current authoritative state. Show an update as saved only after server confirmation. Offline editing/replay is out of scope initially; retain a failed action's request ID when retrying.

### Hosting and persistence
- Provide DM-only loopback mode and explicitly enabled authenticated LAN mode, with a documented player URL and port.
- Keep Qwen/Ollama and administrative secrets on the host. Player browsers need access only to the companion service.
- Explain that local mode requires the host computer and server to remain running and reachable.
- Remote access is optional: document a private-network or authenticated HTTPS reverse-proxy approach, without automatically exposing ports or publishing the service. Use secure transport and appropriately protected sessions for deployment beyond trusted local access.
- Include an explicit consistent SQLite backup/export operation and documented restore procedure. Never restore over a running writer or silently overwrite a campaign.
- Seed/test data must stay separate from real campaign files. Ownership, queues, sessions, and audit records must survive server restart.

### Milestone 1B acceptance criteria
- Two authenticated players can access their own characters; neither can change the other's HP or any protected fields.
- DM can update all campaign characters and approve inventory proposals.
- HP updates work while Ollama is unavailable.
- Simultaneous damage/healing use current values; duplicate retries apply once.
- A stale absolute HP set is rejected with current state for review.
- HP and inventory changes do not overwrite each other; inventory approval remains tied to the displayed inventory revision.
- Temporary HP and HP bounds obey documented policy.
- Player and DM views refresh after commits and recover correctly after reconnect.
- Both Firebase and SQLite adapters pass the relevant inventory approval and HP behavior checks.
- SQLite mode persists correctly across restart and supports a verified backup/restore using disposable data.
- LAN mutation endpoints require authentication and server-side ownership checks.

## Queue and data integrity
Use the existing schema where possible. A proposed update needs equivalents of:

```json
{
  "id": "update_uuid",
  "campaign_id": "existing_campaign_id",
  "session_id": "session_uuid",
  "source_message_id": "message_uuid",
  "revision": 1,
  "status": "pending_review",
  "operations": [
    {
      "type": "inventory_add",
      "character_id": "existing_character_id",
      "item_id": "existing_item_id",
      "quantity": 3,
      "expected_before": 2,
      "proposed_after": 5
    }
  ],
  "approval": null,
  "created_at": "timestamp",
  "applied_at": null
}
```

Include a schema/version marker, the appropriate concurrency token or equivalent, operation IDs where necessary, error/conflict details, and before/after information for audit. Do not assume example keys match existing Firebase documents.

Lifecycle: draft → pending_review → approved → applied. Also support rejected and needs_review/conflict outcomes. Editing invalidates prior approval. Store the approving DM, timestamp, and approved revision.

Use an atomic transaction supported by the active backend. In SQLite mode, commit record changes and application markers in one database transaction. Apply all official changes for an update together with its application marker so a timeout/retry cannot duplicate an award. For Realtime Database, choose a suitable common transaction boundary; do not pretend a sequence of independent writes is atomic. For Firestore, use its transaction/concurrency facilities as appropriate.

Re-read relevant state before applying. If the displayed proposal is stale, recompute it, show the new preview, and require approval again. Approval of “2 → 5” must not silently become approval of “4 → 7.”

Never mark an update applied before commit. After an uncertain network response, check the persisted application marker before retrying. Prevent overlapping apply attempts from applying the same update twice.

Keep an audit history. If undo is included, implement a reviewed compensating update with concurrency checks; do not blindly restore old snapshots over newer changes. Automated undo is optional for milestone 1, but the necessary audit information is required.

## Model behavior and tool loop
Supply concise instructions that explain the permitted actions, canonical-vs-provisional distinction, ambiguity handling, and DM approval requirement. Fetch relevant data with tools rather than stuffing the entire database into the prompt.

Execution loop:
1. Send chat context and tool schemas to Ollama.
2. Parse returned tool calls with the runtime's supported interface.
3. Validate against strict schemas and the allowlist.
4. Execute reads or proposal creation.
5. Return tool results to Qwen and continue until it produces a response.

Bound tool iterations, timeouts, result sizes, and retries. Clearly report malformed calls, unavailable Ollama, unsupported tool-calling models, storage failures, and unresolved names. Do not report a queue or write success based on model prose.

Campaign descriptions, item text, and roll-table entries are data, not instructions. They cannot authorize writes or approvals. An approval button/API request binds to a specific entry and revision; do not infer trusted approval from arbitrary text that contains the word “approve.” Chat approval can be added later with an explicit authenticated application-level confirmation flow.

No fine-tuning, vector database, shell access, unrestricted file access, code execution, or generic Firebase-write tool is needed for this first version.

## Milestone 2: NPCs, roll tables, and events
Example: “Give me five NPC names for the people who died, and randomize their backstories from my roll table.”

Read the actual saved table. Application code performs random selection/rolls; Qwen turns the results into descriptions. Record the table ID and results. Immediately persist generated NPCs as provisional records and add creation/linking operations to the queue.

Give every NPC a stable ID, name, backstory, life status, session reference, and known event/location links. Give every event its own stable ID and participant/location links. Preserve uncertainty: do not invent a location, perpetrator, or other established campaign fact when none was supplied.

Distinguish generated suggestions, content used in play, and approved canon. The DM can approve improvised NPCs/events during the session. Once approved, invented NPCs are normal campaign records and must remain discoverable in later sessions. The bot retrieves their records rather than relying on chat memory. Drafts must also survive restarts and retain their IDs when promoted to canon.

If the DM says “Vecna killed five innocent bystanders in [location],” propose the event and relevant linked records without overwriting unrelated character data. Rejecting a proposal preserves the session journal while keeping rejected content out of official campaign views.

## Milestone 3: leveling
Example: “The party gained one level.”

Resolve current party membership and sheets. Require a configured D&D edition, supported rules, and house rules. Never assume all characters have the same class or current level.

Deterministic rules code calculates supported level/stat changes. Qwen gathers choices and explains the proposal. Leave unresolved feats, spell selections, multiclass choices, HP rolls, and other required inputs pending. Do not fabricate missing rules or choices. Show individual before/after character changes for DM approval.

If a rules engine is not yet implemented, clearly report that leveling automation is unsupported. Do not label an increment of the level field as a completed character level-up.

## Verification and acceptance criteria
Use meaningful tests against fixtures/emulators, plus a fake model client for repeatable tool-loop tests. Include a documented live local-Qwen smoke test when a suitable model is available.

Milestone 1 is complete when:
- The example command resolves saved records and queues a valid update.
- Ambiguous potion names trigger clarification instead of an invented choice.
- Inventory remains unchanged before approval and after rejection.
- Approval changes fixture inventory from 2 to 5 and records the application.
- Replaying or concurrently applying the same update leaves the quantity at 5.
- A stale preview requires renewed review.
- Invalid model output cannot mutate official records or approve itself.
- A failure/timeout does not falsely report success or duplicate an award on retry.
- Sessions, pending proposals, and history survive restart.
- The approved operation uses the existing inventory format and saved item definition.

Do not claim an Ollama/Firebase integration was tested if only a mocked path ran. Report exactly what was verified and what configuration remains missing.

## Deliverables
- Working inventory-first companion integrated with the existing repository.
- Firebase schema mapping and minimal necessary rules/index changes, reviewed in code before live deployment.
- Configuration example without secrets; configurable Ollama endpoint/model, Firebase/campaign selection, SQLite path, active backend, and explicit LAN settings.
- Player HP browser interface, authenticated ownership checks, and an audit log for immediate HP actions.
- SQLite adapter, JSON import/export, consistent backup/restore, and LAN hosting instructions.
- Emulator/fixture seed data including a character named Penishead, a saved Potion of Healing, an ambiguous alternative potion, and inventory quantity 2.
- Setup/run instructions and a short manual verification walkthrough.
- Automated checks for approval, validation, concurrency, retries, player ownership, both storage adapters, and backup/restore behaviors above.
- A concise implementation summary listing completed milestones, checks run, and concrete remaining work.

Stay focused: prove chat → saved-item lookup → queued change → DM approval → correct Firebase update first. Then complete milestone 1B: authenticated player HP updates and the SQLite local-file option. These are required scope, not merely suggested future work.
