# Detailed Comparison: v1.1.4 -> v2.58.0

This document compares the old public marketplace/GitHub baseline (`v1.1.4`,
February 18, 2026) with the current local release target (`v2.58.0`, May 31,
2026).

## Summary

The old `v1.1.4` page described a focused RemNote MCP fork with background
connection lifecycle, Turkish-aware matching, table/property helpers, and a
small debug surface.

The current `v2.58.0` bridge is a full RemNote control and inspection layer:

- 150 covered bridge actions.
- SDK-visible vault export and host-side JSONL tooling.
- Read-only DB forensic/snapshot tooling.
- Typed write actions for notes, tags, templates, properties, tables, graph
  edges, flashcards, practice metadata, plugin runtime, and UI-facing SDK
  namespaces.
- Confirmation gates, destructive-operation guardrails, safe migration plans,
  rollback validation, and action coverage checks.

## Capability Delta

| Area | v1.1.4 | v2.58.0 |
| --- | --- | --- |
| Action count | About 19 public actions | 150 covered actions |
| Basic notes | create/read/update/search/journal | Preserved, plus move/delete/overwrite/open/location/subtree |
| Tables/properties | create table/property, set tag property | Adds row listing, filter writes, property type info/set, tag views, Learning Inbox repair |
| Tags/templates | Limited property helpers | Tag add/remove, template create/apply/list/auto-apply, tag auto-template |
| Vault reads | No full vault export layer | Paginated SDK-visible vault snapshot plus host JSONL export/query/stats/schema/field/quality/diff/graph |
| DB access | None | Read-only IndexedDB inventory/store and copied LevelDB snapshot forensic tools |
| Graph | Limited relation inspection | References, sources, portals, aliases, link Rems, graph edge export, Rem graph context, graph JSONL packages |
| Flashcards | None | Flashcards, cloze cards, batch creation, card catalog, full card read, practice queue export/control |
| RichText | Basic text formatting paths | Markdown parse, RichText inspect, range format, confirmation-gated HTML import |
| SDK coverage | No formal report | Capability inspector and SDK surface gap report |
| Migration safety | Manual caution | Safe Migration Engine, Doctor, Learning Inbox repair planner, audit log, rollback validation |
| Runtime controls | Background bridge lifecycle | App/window/editor/queue/plugin/events/reader/scheduler controls with confirmation gates |

## Preserved Behavior

The original user-facing core remains compatible:

- `create_note`
- `append_journal`
- `search`
- `read_note`
- `update_note`
- `get_status`
- `move_note`
- `delete_note`
- `overwrite_note_content`
- `create_structured_summary`
- `create_table`
- `create_property`
- `set_tag_property_value`

## Major New Read Layer

`v2.58.0` adds practical "read the knowledge base" workflows:

- `get_all_rems` for SDK-visible Rem listing.
- `read_rem_full` for one Rem with children, properties, tags, relations, card
  state, powerups, and metadata.
- `export_vault_snapshot` for paginated SDK-visible vault reads.
- `host_remnote_vault_snapshot_export` for cached JSONL export.
- `host_remnote_vault_snapshot_export_partitioned` for large resumable exports.
- Host-side JSONL query, stats, aggregate stats, schema profile, field profile,
  quality report, graph export, graph file export, graph catalog/query, and
  diff.

This is the recommended full-data path. It reads what the RemNote SDK exposes;
it is not a raw internal database dump.

## Internal DB Boundary

`v2.58.0` can inspect RemNote data files only in a read-only forensic mode:

- `indexeddb_inventory`
- `indexeddb_read_store`
- `host_remnote_db_inventory`
- `host_remnote_leveldb_snapshot_scan`
- `host_remnote_leveldb_decode`
- `host_remnote_leveldb_log_decode`
- `host_remnote_leveldb_entity_index`
- `host_remnote_leveldb_sdk_map`
- `host_remnote_leveldb_graph_export`
- `host_remnote_db_doctor_scan`

Rules:

- Live RemNote internal DB files are not modified.
- LevelDB work copies files into `.agent/cache/` first.
- Entity indexing is heuristic, not a guaranteed canonical schema.
- `probe_rem_ids` reconciles candidate IDs against the SDK-visible Rem graph.

## Major New Write and Control Layer

The write surface is now explicit and typed rather than hidden behind generic
calls.

Examples:

- Notes and formatting: heading level, highlight color, callout icon, native
  icon, powerups, folder/document state.
- Graph: references, portals, sources, aliases, link Rems.
- Tables/properties: table creation, row listing, table filter, property type,
  tag property values.
- Flashcards/practice: basic, cloze, batch cards, back text update, practice
  state, card controls.
- Runtime/UI: App, Window, Editor, Queue, Plugin Runtime, Events, Reader,
  Scheduler, RemObject state, RemObject structure.

Higher-risk operations require confirmation strings. Destructive merge
operations additionally require `allowDestructive=true` and
`destructiveConfirm=MERGE_REM`.

## Safety Additions

`v1.1.4` relied mostly on action-level caution. `v2.58.0` adds:

- `capability_inspector`
- `host_remnote_sdk_surface_gap_report`
- `safe_migration_plan`
- `safe_migration_apply`
- `safe_migration_audit_log`
- `safe_migration_validate_rollback`
- `safe_migration_apply_rollback`
- `remnote_doctor_scan`
- `plan_remnote_doctor_repairs`
- `apply_remnote_doctor_repairs`
- `export_learning_inbox`
- `plan_learning_inbox_repairs`
- `apply_learning_inbox_repairs`

These actions are designed so agents can inspect, dry-run, validate, and audit
large changes before applying them.

## Runtime and Packaging Delta

| Item | v1.1.4 | v2.58.0 |
| --- | --- | --- |
| WebSocket | Plugin lifecycle bridge | Preserved |
| Host bridge | Not a full host stack | `bridge-host.cjs` on HTTP 3400 / WS 3401 |
| Manifest serving | Dev server-oriented | Built plugin served on 8080 through `static-server.cjs` |
| Marketplace ID | `remnote-mcp-bridge-y-edition` | Preserved in `public/manifest.marketplace.json` |
| Local dev ID | Same as marketplace | `remnote-mcp-bridge-y-edition-dev-2` to avoid local/public collision |
| Version shown by runtime | `1.1.4` | `2.58.0` |

## Validation Delta

`v2.58.0` expected validation:

```powershell
npm run check-types
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_action_coverage.ps1 -FailOnUncovered
powershell -NoProfile -ExecutionPolicy Bypass -File .\test_bridge_actions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\test_readonly_debug_actions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\test_flashcard_actions.ps1
```

Expected result:

```text
150 action, 150 covered, 0 uncovered
pluginConnected=true
pluginVersion=2.58.0
```

## User Impact

Users moving from the old marketplace release should expect:

- A much larger MCP surface.
- Better structured responses and error messages.
- More reliable long-running bridge behavior.
- Safer large edits through dry-run and confirmation gates.
- Read-only data export workflows suitable for analysis, backup snapshots,
  migration planning, and graph work.

They should not expect:

- Direct writes to RemNote's internal database files.
- A guaranteed canonical raw DB schema parser.
- Mobile support.
- Destructive operations without explicit confirmation.
