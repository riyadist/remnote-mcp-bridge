# RemNote MCP Bridge (Yavuz Edition)

Fork of `quentintou/remnote-mcp-bridge`, extended for production-style MCP workflows and richer RemNote editing operations.

## Why this fork

This fork keeps the original core features and adds:

- Background bridge lifecycle (connection does not depend on opening the sidebar widget)
- Better protocol compatibility (custom action payloads + JSON-RPC 2.0 style requests)
- Richer RemNote operations (structured summaries, table/property workflows, note move/delete/overwrite)
- Better handling for Turkish text matching and search fallback
- Cleaner local development defaults for localhost plugin work

## Version baseline

- Original baseline in this fork: `v1.1.0` (`origin/main`, commit `2caea76`)
- Current fork target: `v1.1.4`
- Detailed technical diff: `docs/COMPARISON_V1.1.0_TO_V1.1.4.md`

## Feature set

### Preserved from original

- `create_note`
- `append_journal`
- `search`
- `read_note`
- `update_note`
- `get_status`

### Added in this fork

- `move_note`
- `delete_note`
- `overwrite_note_content`
- `create_structured_summary`
- `create_table`
- `create_property`
- `set_tag_property_value`
- `count_books_table` (debug/validation helper)
- `count_tagged_rems` (debug helper)
- `debug_window_context` (debug helper)
- `debug_focused_page_children_raw` (debug helper)
- `inspect_rem_relations` (debug helper)
- `debug_rem_raw_text` (debug helper)

## Project structure

```text
public/
  manifest.json
src/
  api/
    rem-adapter.ts
  bridge/
    websocket-client.ts
  widgets/
    index.tsx
    right_sidebar.tsx
  settings.ts
  style.css
  index.css
docs/
  COMPARISON_V1.1.0_TO_V1.1.4.md
  GITHUB_PR_DRAFT.md
CHANGELOG.md
CONTRIBUTING.md
```

## Local development

```bash
npm install
npm run dev
```

Notes:
- Dev server is configured for `http://localhost:8081`.
- Manifest URL for RemNote local plugin dev: `http://localhost:8081/manifest.json`.

## Build

```bash
npm run build
```

Build output:
- `PluginZip.zip` is produced from the `dist/` build.

## GitHub contribution flow

If you want to contribute these changes upstream or present your fork clearly:

1. Push your branch to `https://github.com/riyadist/remnote-mcp-bridge`.
2. Use `docs/GITHUB_PR_DRAFT.md` as your PR description.
3. Link `docs/COMPARISON_V1.1.0_TO_V1.1.4.md` in the PR for a full technical breakdown.

## Hygiene

Runtime artifacts are ignored:

- `dev.out.log`
- `dev.err.log`
- `dev.pid`
- `*.pid`

## License

MIT (same as upstream).

## Credits

- Upstream project: https://github.com/quentintou/remnote-mcp-bridge
- Fork maintainer: https://github.com/riyadist
