# Campaign command guide

These commands are implemented in the local HTML chat and isolated SQLite test copy. All mutations require explicit approval of the displayed proposal revision. Original export and live Firebase remain untouched. Click **Commands & examples** in chat, or type **/commands**. Use natural language; the internal action names are listed for reference.

| Action | Example | Policy |
| --- | --- | --- |
| hp_damage | Ashara takes 5 damage. | Damage consumes temporary HP first, then current HP; minimum zero. |
| hp_heal | Heal Ashara by 3 HP. | Healing caps at saved maximum HP. |
| hp_set | Set Ashara current HP to 20. | Absolute current HP, bounded by max HP. |
| hp_temp_set | Set Ashara temporary HP to 5. | Replaces temporary HP; does not stack it. |
| hp_max_set | Set Ashara maximum HP to 40. | Manual correction. Lowering maximum HP also caps current HP. |
| slot_spend | Ashara expended 1 level 1 spell slot. | Increases slots_used without changing slot capacity. |
| slot_restore | Restore 1 level 1 spell slot to Ashara. | Decreases slots_used; cannot restore more than spent. |
| slot_set_remaining | Set Ashara remaining level 1 spell slots to 2. | Converts remaining count to slots_used. |
| ability_spend | Ashara used 1 Channel Divinity charge. | Only saved charge abilities; no automatic linked resource deductions. |
| ability_restore | Restore 1 Channel Divinity charge to Ashara. | Cannot exceed saved maximum. |
| coin_add | Give Ashara 10 gold pieces. | field: cp, sp, ep, gp or pp. No automatic conversion. |
| coin_spend | Ashara spent 2 gold pieces. | Cannot spend more than owned. |
| level_set | Correct Ashara level field to 6. | Manual level-field correction ONLY. Does not perform a rules-based level-up. |
| xp_add | Award Ashara 100 XP. | Records XP only; does not automatically level up. |
| stat_set | Set Ashara strength score to 16. | field: str, dex, con, int, wis, cha. No automatic derived-stat recalculation. |
| detail_set | Set Ashara background to Sailor. | Profile fields: alignment, background, class, subclass, species, player_name, size, combat_role. |
| combat_set | Set Ashara armor class to 17. | field: ac, speed, initiative_bonus, inspiration, exhaustion. |
| notes_append | Add to Ashara notes: Met a mysterious traveler. | Appends to existing character or campaign-entity notes. |
| notes_set | Replace Ashara notes with: Resting at the inn. | Exact replacement shown for approval. |
| npc_create | Create an NPC named Mira with notes: A friendly innkeeper. | Creates a stable NPC sheet and linked world record, without invented stats. |
| npc_update | Set Mira status to Missing. | field: name, notes, status, role, faction. Updates linked sheet where applicable. |
| location_create | Create a location named Willow Inn with notes: A quiet roadside inn. | Creates a location record in the active campaign. |
| location_update | Set Willow Inn notes to: Closed after the storm. | field: name, notes, category. |
| entity_move | Move Ashara to Willow Inn. | Resolves saved location in the same campaign. Records position; does not move VTT tokens. |
| party_move | Move the party to Willow Inn. | Records narrative party location; does not move VTT viewport or tokens. |
| event_create | Record an event named Arrival at Willow Inn with notes: The party arrived safely. | Stores only supplied facts with stable ID and optional location link. |
| note_create | Create a campaign note named The Missing Key with notes: Mira lost the cellar key. | Creates a persistent campaign note. |

Inventory awards and expenditures use prepare_inventory_award and prepare_inventory_expenditure, as before. Inventory currently supports player characters.

Commands work for existing PC sheets and campaign-linked NPC sheets where the required saved stats exist. Creating an NPC does not invent combat stats. An NPC without saved combat stats cannot receive combat/HP updates until its stats are explicitly provided through a future stat-creation workflow.

**Manual corrections:** level, class and ability-score edits do not calculate derived values. A request to level up is unsupported unless it explicitly requests a manual field correction. No rules engine, spell effects, death saves, automatic rest recovery, linked ability pools or automatic currency conversion is added.

**Locations:** NPC world records use traits.locationId. Since PC sheets and the party have no verified narrative-location field, companion-owned character_locations and party_location records store those positions. This does not move VTT tokens or reinterpret the dmAt viewport.

**Model verification:** deterministic handlers and fake-model tool dispatch are automated-tested. New natural-language phrasings have not been live-tested against Qwen. Inspect the exact review preview.
