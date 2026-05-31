# Changelog

All notable changes in this fork are documented in this file.

## [2.58.0] - 2026-05-31

### Public catch-up

- GitHub-facing documentation has been updated from the old `1.1.4` marketplace
  description to the current `2.58.0` bridge line.
- Added a new full comparison document:
  `docs/COMPARISON_V1.1.4_TO_V2.58.0.md`.
- Added user-facing release notes:
  `docs/RELEASE_V2.58.0.md`.
- Added `public/manifest.marketplace.json` for packaging the existing public
  plugin ID `remnote-mcp-bridge-y-edition` without overwriting the local
  development manifest ID.

### Added since the old marketplace release

- Expanded the bridge from the v1.1.4 note/table helper set to 150 covered
  bridge actions.
- Added SDK-visible full vault reads, single-file JSONL exports, partitioned
  resumable exports, host-side query/stats/schema/field/quality/diff/graph
  tooling, and graph JSONL file packages.
- Added read-only internal database forensic tools for IndexedDB inventory/store
  reads and copied LevelDB snapshot scan/decode/log/entity-index/SDK-map/graph
  workflows. Direct internal DB writes remain blocked.
- Added capability inspector and host-side SDK surface gap reporting.
- Added RemNote Doctor, Learning Inbox, Safe Migration dry-run/apply/rollback
  validation, and audit-log workflows.
- Added flashcard, cloze, card catalog, practice queue export, and confirmed
  card/practice control actions.
- Added tag/template/property/table/folder/document/native-icon/callout/powerup
  workflows.
- Added graph/reference/source/portal/alias/link-rem workflows.
- Added RichText parsing, inspection, range formatting, and confirmation-gated
  HTML import.
- Added typed context inspectors and confirmation-gated controls for App,
  Window, Editor, Queue, Plugin Runtime, Events, Reader, Scheduler, RemObject
  State, and RemObject Structure.

### Safety and validation

- Dangerous actions now require explicit confirmation strings; destructive Rem
  merge operations require an additional `MERGE_REM` confirmation.
- Internal database tools are read-only and operate on copied snapshots or host
  cache files.
- Current expected coverage is `150 action, 150 covered, 0 uncovered`.
- Current expected live health is `pluginConnected=true` and
  `pluginVersion=2.58.0`.

## [1.7.7] - 2026-03-11

### Changed

- Startup bootstrap now starts the watchdog with both RemNote restart recovery and version-sync enabled.
- Bootstrap now inspects both plugin connection state and active-vs-manifest version before deciding whether a startup sync is needed.

### Fixed

- Plugin status and activation logs are aligned to `v1.7.6`; stale `1.7.5` constants no longer trigger false mismatch diagnostics.
- Reboot / reopen flow is now more resilient when RemNote comes up with the old plugin bundle or with no live MCP connection.

## [1.7.6] - 2026-03-10

### Changed

- Right sidebar polling interval was relaxed from `2s` to `10s` to reduce background churn.
- Watchdog defaults were relaxed to a `90s` poll interval with a `600s` recovery cooldown.
- Startup bootstrap now launches only the lightweight ensure/watch/reconnect path.

### Fixed

- Localhost manifest server now serves a stable plugin `id`; it no longer mutates the plugin identity per request.
- Reconnect sync flow now tolerates a disconnected `3005/call` response and can proceed to RemNote restart when needed.

## [1.7.5] - 2026-03-10

### Added

- Right sidebar now includes `Reload Plugin` and `Open PI OS` quick actions for faster recovery and navigation.

### Changed

- Plugin version alignment updated to `v1.7.5`.

### Fixed

- Structured note write flows now persist section `imageUrls` instead of dropping source images during create/update.
- Local operator guidance now documents that RemNote should be relaunched via `explorer.exe` shell invocation when automation needs to restart the desktop app.

## [1.7.4] - 2026-03-10

### Added

- Right sidebar now shows `UPDATE STATUS` with:
  - active loaded plugin version
  - localhost manifest version
  - manifest host label
- Clear mismatch warning when the loaded plugin is older than the localhost build.
- Auto-builder/runtime status is exposed from the local bridge host and shown in the right sidebar.
- New bridge actions:
  - `list_children`
  - `open_note`

### Changed

- Default localhost manifest port is now `8080`.
- `get_status` and the right sidebar are aligned around `v1.7.4`.

## [1.6.0] - 2026-03-08

### Added

- New sidebar shortcut actions:
  - `get_sidebar_shortcuts`
  - `set_sidebar_shortcuts`
  - `add_sidebar_shortcut`
  - `remove_sidebar_shortcut`
- Left sidebar widget `left_sidebar_shortcuts` backed by synced plugin storage.
- Plugin-managed shortcut flow for high-priority pages like `Personal Intelligence OS`.

### Changed

- `get_status` now reports `1.6.0`.
- README now explains the bridge-managed left sidebar approach because native RemNote pin/favorite APIs are not exposed by the current SDK.

## [1.5.0] - 2026-03-08

### Added

- New personal-intelligence actions:
  - `find_or_create_path`
  - `upsert_structured_note`
  - `batch_ingest_records`
- Shared section-writer flow so structured summaries and vNext note upserts use the same deterministic layout engine.
- Metadata block support in structured writes for source URL, capture timestamp, content type, and similar fields.

### Changed

- `get_status` now reports `1.5.0`.
- README now documents the vNext bridge surface and personal intelligence spec.

## [1.1.4] - 2026-02-18

### Added

- New MCP actions:
  - `move_note`
  - `delete_note`
  - `overwrite_note_content`
  - `create_structured_summary`
  - `create_table`
  - `create_property`
  - `set_tag_property_value`
  - `count_books_table` (debug)
  - `count_tagged_rems` (debug)
  - `debug_window_context` (debug)
  - `debug_focused_page_children_raw` (debug)
  - `inspect_rem_relations` (debug)
  - `debug_rem_raw_text` (debug)
- Turkish-aware normalization for matching/search fallbacks.
- Table row-tag resolution logic to avoid writing to the wrong Rem when using table IDs.

### Changed

- WebSocket client now accepts both:
  - Custom bridge payload format (`{ action, payload }`)
  - JSON-RPC 2.0 request format (`{ jsonrpc, method, params }`)
- Bridge connection lifecycle moved to plugin activation (`src/widgets/index.tsx`) and no longer depends on sidebar widget mount state.
- `create_note` / `update_note` workflows expanded with heading/document/quote/list controls.
- Development server default port changed to `8081`.
- Plugin manifest identity updated to:
  - `id: remnote-mcp-bridge-y-edition`
  - `name: MCP Bridge (Y Edition)`

### Fixed

- Heading persistence issues when updating title text.
- Books table counting errors where visible rows did not match actual tagged table rows.
- Name matching issues for Turkish characters in some search/lookup paths.

## [1.1.3] - 2026-02-18

### Changed

- Stability baseline and bridge behavior cleanup.

## [1.1.0] - Baseline

- Initial release baseline inherited from upstream and from `origin/main` in this fork.
