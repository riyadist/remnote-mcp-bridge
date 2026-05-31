# PR / Release Title

Publish RemNote MCP Bridge Y Edition v2.58.0 capability catch-up

# Summary

This update brings the public GitHub page and release messaging from the old
`v1.1.4` marketplace baseline to the current `v2.58.0` bridge.

The bridge has grown from a small note/table helper fork into a full RemNote MCP
control and inspection layer with 150 covered actions, SDK-visible vault export,
read-only DB forensics, graph tooling, flashcard/practice workflows, safe
migration, and typed confirmation-gated controls.

# What Changed

## Public documentation

- README now describes the real `v2.58.0` bridge instead of the old `1.1.4`
  marketplace text.
- Added `docs/COMPARISON_V1.1.4_TO_V2.58.0.md`.
- Added `docs/RELEASE_V2.58.0.md`.
- Added `public/manifest.marketplace.json` for the stable marketplace plugin ID.

## Runtime capability catch-up

- 150 covered actions exposed through the bridge.
- Full SDK-visible vault reads and host-side JSONL export/query/stats/schema/
  field/quality/diff/graph workflows.
- Read-only IndexedDB and copied LevelDB forensic tooling.
- RemNote Doctor, Learning Inbox, Safe Migration, rollback validation, and audit
  log workflows.
- Flashcard, cloze, card catalog, practice queue, RichText, graph/reference/
  portal/source/alias, template, table, property, folder/document, and powerup
  workflows.
- Typed inspectors and confirmation-gated controls for App, Window, Editor,
  Queue, Plugin Runtime, Events, Reader, Scheduler, RemObject State, and
  RemObject Structure.

# Safety Notes

- Internal DB tooling is read-only.
- LevelDB scanning operates on copied snapshots.
- Destructive Rem merge operations require `CONTROL_REM_STRUCTURE` plus
  `MERGE_REM`.
- Large edits should use Safe Migration dry-run and audit flows.

# Compatibility

Core actions from v1.1.4 are preserved:

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

# Test Checklist

- [x] `npm run check-types`
- [x] `npm run build`
- [x] `check_action_coverage.ps1 -FailOnUncovered`
- [x] `test_bridge_actions.ps1`
- [x] `test_readonly_debug_actions.ps1`
- [x] `test_flashcard_actions.ps1`
- [x] Live health: `pluginConnected=true`, `pluginVersion=2.58.0`

# User Message

The RemNote marketplace listing may still show `1.1.4` until the marketplace
package is republished. GitHub now documents the `2.58.0` bridge line, and
`public/manifest.marketplace.json` is ready for packaging the stable public
plugin ID.
