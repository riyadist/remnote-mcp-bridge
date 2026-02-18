# Changelog

All notable changes in this fork are documented in this file.

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
  - `id: remnote-mcp-bridge-yavuz`
  - `name: MCP Bridge (Yavuz Edition)`

### Fixed

- Heading persistence issues when updating title text.
- Books table counting errors where visible rows did not match actual tagged table rows.
- Name matching issues for Turkish characters in some search/lookup paths.

## [1.1.3] - 2026-02-18

### Changed

- Stability baseline and bridge behavior cleanup.

## [1.1.0] - Baseline

- Initial release baseline inherited from upstream and from `origin/main` in this fork.
