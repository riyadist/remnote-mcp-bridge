# RemNote MCP Bridge v2.58.0 Release Notes

This release updates the Y Edition bridge from the old public `v1.1.4`
marketplace baseline to the current `v2.58.0` control and inspection layer.

## Headline

RemNote MCP Bridge now exposes a broad, typed, safety-gated RemNote automation
surface: full SDK-visible vault export, graph inspection, flashcards, properties,
templates, tables, safe migration workflows, and read-only DB forensics.

## For Existing Users

If your RemNote marketplace page still shows `Version: 1.1.4`, you are looking
at the old public listing text. The current GitHub branch and local bridge
runtime are `2.58.0`.

The biggest practical changes:

- The bridge can now export and query all SDK-visible RemNote data.
- Large exports can be written as resumable JSONL partitions.
- Graph, tags, properties, powerups, references, portals, aliases, and practice
  metadata are now easier to inspect.
- Flashcard and practice workflows are available through explicit actions.
- Risky writes have dry-run and confirmation gates.
- Direct internal database writes are intentionally not supported.

## New Data Access Tools

- Full Rem listing and single Rem read:
  `get_all_rems`, `read_rem_full`
- Vault export:
  `export_vault_snapshot`, `host_remnote_vault_snapshot_export`,
  `host_remnote_vault_snapshot_export_partitioned`
- Export analysis:
  query, stats, aggregate stats, schema profile, field profile, quality report,
  graph export, graph file export, graph catalog/query, and diff actions
- Internal DB diagnostics:
  IndexedDB inventory/store read and copied LevelDB snapshot scan/decode/log/
  entity-index/SDK-map/graph actions

## New Control Tools

- Note, tag, template, table, property, folder/document, icon, and powerup
  workflows.
- Portal, source, reference, alias, and link Rem workflows.
- Flashcard, cloze, batch card, card catalog, card mutation, and practice queue
  workflows.
- RichText parsing, inspecting, formatting, and confirmation-gated HTML import.
- App, Window, Editor, Queue, Plugin Runtime, Events, Reader, Scheduler,
  RemObject State, and RemObject Structure controls.

## Safety Notes

- Internal database access is read-only.
- LevelDB inspection copies data into `.agent/cache/` before scanning.
- Destructive Rem merge operations require both the normal confirmation and
  `destructiveConfirm=MERGE_REM`.
- Large changes should be planned with Safe Migration first.

## Validation

The release target has been validated with:

```powershell
npm run check-types
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_action_coverage.ps1 -FailOnUncovered
powershell -NoProfile -ExecutionPolicy Bypass -File .\test_bridge_actions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\test_readonly_debug_actions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\test_flashcard_actions.ps1
```

Expected coverage:

```text
150 action, 150 covered, 0 uncovered
```

Expected live runtime:

```text
pluginConnected=true
pluginVersion=2.58.0
```

## Marketplace Package

Use the release packaging helper when preparing the stable public plugin ID:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_marketplace_package.ps1
```

The script builds with `public/manifest.marketplace.json`, writes
`PluginZip_v2.58.0_marketplace.zip`, and restores the local development manifest
and local-dev build after the package is copied.

The package contains the stable marketplace ID
`remnote-mcp-bridge-y-edition` and `public/logo.svg`. Use this package for the
existing public listing; do not upload a local-dev package with
`remnote-mcp-bridge-y-edition-dev-2`.

## Known Boundaries

- This is not a raw internal DB writer.
- SDK-visible vault export is the canonical data path.
- Raw LevelDB entity indexing is heuristic and should be reconciled through SDK
  probes.
- The plugin is disabled on mobile.
