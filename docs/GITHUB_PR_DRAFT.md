# PR Title

Enhance RemNote MCP Bridge with background runtime, advanced note/table actions, and locale-aware matching

# Summary

This PR extends the original `v1.1.0` bridge without removing core behavior.  
The existing action set is preserved and expanded with advanced operations for note lifecycle, structured summaries, and native table/property workflows.

# What changed

## Runtime and protocol

- Moved bridge runtime ownership to plugin lifecycle (`src/widgets/index.tsx`) instead of widget mount lifecycle.
- Added request normalization in WebSocket client for:
  - custom bridge format
  - JSON-RPC 2.0 requests

## API/Adapter surface

- Added:
  - `move_note`
  - `delete_note`
  - `overwrite_note_content`
  - `create_structured_summary`
  - `create_table`
  - `create_property`
  - `set_tag_property_value`
- Added debug/diagnostic actions for context and relation inspection.

## Formatting and language handling

- Added heading/document/quote/list handling in create/update paths.
- Added locale-aware Turkish normalization and fallback variants for matching/search.

## Table correctness

- Added row-tag resolution logic so table operations target the correct Rem entities.
- Added `count_books_table` diagnostics to validate real table counts.

## Packaging/dev

- Version updated to `1.1.4`.
- Plugin identity updated to avoid conflicts with original installs.
- Dev server defaults updated to localhost-friendly settings (`8081`, host binding, allowed hosts).

# Why this is useful

- Keeps bridge stable even when the sidebar UI is not actively used.
- Reduces manual multi-step editing from MCP clients.
- Improves reliability in multilingual setups (especially Turkish content).
- Enables direct automation of table/property workflows in RemNote.

# Backward compatibility

Core actions from v1.1.0 are preserved:

- `create_note`
- `append_journal`
- `search`
- `read_note`
- `update_note`
- `get_status`

# Test checklist

- [ ] `npm install`
- [ ] `npm run check-types`
- [ ] `npm run dev` and load manifest from `http://localhost:8081/manifest.json`
- [ ] Validate create/search/read/update/journal actions
- [ ] Validate structured summary creation and heading level behavior
- [ ] Validate table creation + property creation + property value write
- [ ] Validate Turkish search/matching cases

# Additional docs

- Full technical comparison: `docs/COMPARISON_V1.1.0_TO_V1.1.4.md`
- Changelog: `CHANGELOG.md`
