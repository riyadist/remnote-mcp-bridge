# Detailed Comparison: v1.1.0 -> v1.1.4 (Yavuz Edition)

This document compares the original baseline (`v1.1.0`, commit `2caea76`) with the current fork state (`v1.1.4` target).

## Scope used for comparison

- Baseline branch: `origin/main` (`2caea76`)
- Compared files:
  - `package.json`
  - `package-lock.json`
  - `public/manifest.json`
  - `src/api/rem-adapter.ts`
  - `src/bridge/websocket-client.ts`
  - `src/widgets/index.tsx`
  - `src/widgets/right_sidebar.tsx`
  - `webpack.config.js`

## Executive summary

No core feature was removed. The fork is additive:

- Core MCP actions from v1.1.0 are still present.
- Bridge reliability and lifecycle behavior were upgraded.
- Editing/table automation capability increased significantly.
- Turkish text matching behavior improved for real-world usage.

## 1. Connection architecture

## v1.1.0

- Main bridge logic lived inside `src/widgets/right_sidebar.tsx`.
- Connection was tied to widget lifecycle and UI effects.

## v1.1.4

- Bridge lifecycle moved to `src/widgets/index.tsx` (`onActivate` / `onDeactivate`).
- Sidebar became an optional status dashboard.
- Reconnection remains automatic, now configured with unlimited attempts at plugin level.

## Benefit

- The bridge can stay alive even if the right sidebar is not actively used.
- More predictable behavior for long-running MCP sessions.

## 2. Protocol compatibility (WebSocket client)

## v1.1.0

- Accepted only the custom action envelope (`id`, `action`, `payload`).

## v1.1.4

- `src/bridge/websocket-client.ts` now normalizes:
  - Custom bridge requests
  - JSON-RPC 2.0 requests (`method`, `params`)
- Supports optional IDs and response behavior for both formats.

## Benefit

- Better interoperability with MCP hosts and middleware layers that emit JSON-RPC 2.0 style messages.

## 3. MCP action surface

## Preserved actions

- `create_note`
- `append_journal`
- `search`
- `read_note`
- `update_note`
- `get_status`

## Added actions

- Content and lifecycle:
  - `move_note`
  - `delete_note`
  - `overwrite_note_content`
  - `create_structured_summary`
- Table and property workflows:
  - `create_table`
  - `create_property`
  - `set_tag_property_value`
- Diagnostics:
  - `count_books_table`
  - `count_tagged_rems`
  - `debug_window_context`
  - `debug_focused_page_children_raw`
  - `inspect_rem_relations`
  - `debug_rem_raw_text`

## Benefit

- The fork moves from basic CRUD to workflow-grade automation for summary building and table/property management.

## 4. Rem adapter capabilities

## v1.1.0

- Basic create/read/update/search/journal support.
- Limited formatting controls.

## v1.1.4

- Added method-level support for:
  - Heading level control
  - Document/quote/list modes during create/update
  - Structured summary creation in one operation
  - Move/delete/overwrite content operations
  - Native RemNote table creation and property handling
- Added tag ID resolution logic that maps table IDs to row-tag IDs when needed.

## Benefit

- Fewer multi-step workarounds in clients.
- Lower risk of writing data into the wrong table-related Rem.
- More deterministic formatting output.

## 5. Turkish character and matching robustness

## v1.1.4 additions

- Locale-aware normalization and variant generation (`tr-TR`) in search/lookup code paths.
- Fallback matching logic for characters such as `ç, ğ, ı, ö, ş, ü`.

## Benefit

- Better hit rate for Turkish page/tag/note names in search and parent resolution.

## 6. Books table counting fix

## Problem observed

- Counting visible child rows can diverge from true table row count in RemNote.

## v1.1.4 approach

- Added `count_books_table` helper that:
  - Resolves page/table from window context
  - Includes fallback detection from raw rich text references
  - Uses tagged-row semantics for more reliable counts

## Benefit

- More accurate book count checks for table-backed note sets.

## 7. UI behavior changes

## v1.1.0

- Sidebar was both UI and active bridge runtime.

## v1.1.4

- Sidebar is status/reporting UI:
  - host health polling
  - recent actions
  - session stats

## Benefit

- Cleaner separation between runtime bridge logic and visual diagnostics.

## 8. Build and packaging changes

## Changed

- `package.json`
  - version updated to `1.1.4`
  - `@remnote/plugin-sdk` pinned to `^0.0.46`
  - dev script uses port `8081`
- `webpack.config.js`
  - dev server configured for host binding and allowed hosts
- `public/manifest.json`
  - plugin identity changed to `remnote-mcp-bridge-yavuz`
  - display name changed to `MCP Bridge (Yavuz Edition)`
  - version set to `1.1.4`

## Benefit

- Safer local fork usage (plugin ID separation).
- Easier localhost plugin development and loading.

## 9. Net impact

- This fork is backward-compatible with the original action set.
- It extends capability depth for:
  - Formatting correctness
  - Table/property operations
  - Turkish language matching
  - Diagnostics and runtime stability

In practical terms: more automation coverage, fewer manual correction steps, and better day-to-day reliability for RemNote MCP workflows.
