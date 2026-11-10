# Export mapping (read-only source)

Detected export: geezsheets-default-rtdb-export.json. The tree is consistent with a Firebase Realtime Database export. No app source, Firebase security rules, authentication configuration, credentials or connection settings were supplied.

- /characters/pcs/{characterKey}: player character; key is retained as identity.
- Character name and campaign: strings. Campaign membership is stored on each character, not inferred from /campaigns/default.
- /characters/pcs/{characterKey}/inventory/{stackKey}: inline item snapshots with name, category, desc and integer qty, plus any additional existing properties.
- /characters/pcs/{characterKey}/combat: includes hp_current, hp_max and temp_hp; read as part of the copied record and preserved on inventory changes.
- /characters/npcs/{npcKey}: existing NPCs; outside this prototype.
- /geezvtt/campaign/things/{thingKey}: event/location/note/NPC records found. No saved potion/item catalog found there.
- /campaigns/default: graph nodes/edges, map and tag definitions. Not used as player campaign ownership.

Prototype storage is an explicitly separate local SQLite test database. Tables: characters (copied source shape), proposals (revision, status, exact preview and inventory fingerprint), chats (request-bound tool histories/results), messages (visible transcript), audit (applied proposal), meta (source/version marker). Transactions atomically apply inventory and proposal/audit records. No Firebase paths are written and no production schema extensions or security rules are deployed.

Test potion definitions are in core.mjs and labeled as fixtures. They are not represented as discovered campaign canon. Existing inventory entries supply saved-item definitions for other items. Full live integration needs the original application's source/configuration, rules and actual saved catalog location if one exists elsewhere.


## Expanded command mapping
Campaign names observed in PC/NPC sheets map explicitly as follows: Dungeons & Daddies → world__daddies, Dungeons & Disney → world__disney. These correspond to the Daddies and Disney map records in this export; no fuzzy campaign association is used. World-only test campaign and NPCs lacking campaign membership are excluded from this application's current campaign selection.

| Domain | Inspected source fields | Local command behavior |
| --- | --- | --- |
| HP | characters/{pcs or npcs}/{id}/combat/{hp_current,hp_max,temp_hp} | Damage, healing, current/temp/max HP with bounded previews. |
| Spell slots | spellcasting/slots and slots_used | slots is capacity, slots_used is spent count; rank indices 1–9; missing used rank means zero. Preserve array/object representation. |
| Charge abilities | abilities/{key}/{kind,current,max,label} | Spend/restore saved kind=charge entries within bounds; no coupled resource updates. |
| Currency | coin_purse/{cp,sp,ep,gp,pp} | Add/spend integer coins without conversion. |
| Manual sheet corrections | level, xp, stats, profile fields, selected combat fields | Explicit approved edits. No level-up/derived-stat automation. |
| Character notes | text_blocks/notes | Append or replace. |
| NPCs | characters/npcs/{id} and geezvtt/campaign/things/{id}, type=npc | Create minimal linked records; update name/notes/status in linked sheet where present; role/faction in world traits. No invented stats. |
| Locations | geezvtt/campaign/things/{id}, type=location | Create; edit name, notes or traits/category. |
| Events/notes | geezvtt/campaign/things/{id}, type=event or note | Create stable IDs with supplied notes and optional event locationId/when; generic notes append/replace applies too. |
| Character location | NPC world traits/locationId; PC narrative field absent | NPC updates traits/locationId. PC mapping is companion/character_locations/{characterId} in local records. |
| Party location | No verified narrative party field | companion/party_location/{worldId}, isolated from VTT viewport/tokens. |

Local records retain their source paths as internal IDs; model arguments never accept arbitrary paths. Creation IDs are stable in pending proposals and retained on approval. Proposals contain exact field before/after patches, reference/bounds checks and scoped concurrency guards. Application merges patches into latest records in one SQLite transaction with audit/application status, preserving unrelated inventory/HP changes.

## Remaining export sections
- campaigns/default/{nodes,edges,tagDefs,map}: graph, relationships, tag definitions and cartography; no new write commands. Existing graph mirrors are not synchronized automatically.
- geezvtt/campaign/{maps,links,battles,settings,version}: map metadata, relationships, battle setups and app configuration; read-only source for this iteration.
- geezvtt/live: presence, roll logs, tokens, initiative, viewport and session state; no commands to overwrite runtime state.
- geezvtt/party: existing board/link/note layout; retained separately from narrative location.
- geezvtt/table3d and maps/*/geometry: 3D scene data, walls, lights, doors; no geometry editing commands.
- rodeo: dice/messages/maps/rollcall/session/sketches; historical and UI/runtime data; no blanket rewriting.
- dice/last and session: last-roll display and lock flags; no command handlers.

The prototype does not cover every raw key in the export. These omissions are deliberate and visible: commands are defined per campaign action, not as unrestricted JSON patch access. No writes to any Firebase path occur.
