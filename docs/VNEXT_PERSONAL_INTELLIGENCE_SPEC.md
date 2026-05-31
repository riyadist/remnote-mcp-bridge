# RemNote MCP Bridge vNext

This document defines the `v1.6.0` action surface for Antigravity-driven personal intelligence workflows.

## Goal

Keep the RemNote plugin as a reliable execution layer while Antigravity handles:

- classification
- taxonomy routing
- structured note drafting
- memory extraction

The bridge is responsible for:

- resolving or creating the target path in RemNote
- upserting notes with deterministic section layout
- batch-writing prepared ingestion records
- surfacing curated left-sidebar shortcuts for important pages

## New Actions

### `find_or_create_path`

Resolve a nested RemNote path and create missing nodes when requested.

Payload:

```json
{
  "pathSegments": ["Personal Intelligence", "Neuroscience", "Consciousness"],
  "rootParentId": "optional-rem-id-or-title",
  "createMissing": true,
  "asFolders": true
}
```

Response:

```json
{
  "rootParentId": "optional-root-rem-id",
  "leafId": "leaf-rem-id",
  "leafTitle": "Consciousness",
  "resolved": [
    { "remId": "a", "title": "Personal Intelligence", "created": false },
    { "remId": "b", "title": "Neuroscience", "created": true },
    { "remId": "c", "title": "Consciousness", "created": true }
  ]
}
```

### `upsert_structured_note`

Create or update a note under a resolved parent or taxonomy path.

Payload:

```json
{
  "title": "Global Workspace Theory Diagram",
  "pathSegments": ["Personal Intelligence", "Neuroscience", "Consciousness"],
  "headingLevel": 2,
  "tags": ["neuroscience", "consciousness", "diagram"],
  "mergeStrategy": "overwrite_if_exact_title",
  "metadata": {
    "sourceUrl": "https://example.com/diagram",
    "capturedAt": "2026-03-08T10:15:00Z",
    "contentType": "image"
  },
  "sections": [
    { "heading": "Summary", "body": "Short explanation." },
    { "heading": "Key Points", "body": "- conscious access\n- broadcast model" }
  ]
}
```

Response:

```json
{
  "remId": "target-rem-id",
  "title": "Global Workspace Theory Diagram",
  "status": "created",
  "parentId": "leaf-parent-id",
  "path": ["Personal Intelligence", "Neuroscience", "Consciousness"]
}
```

Supported merge strategies:

- `overwrite_if_exact_title`
- `append_sections`

### `batch_ingest_records`

Write multiple prepared records in one bridge call.

Payload:

```json
{
  "records": [
    {
      "title": "Integrated Information Theory Note",
      "pathSegments": ["Personal Intelligence", "Neuroscience", "Consciousness"],
      "tags": ["neuroscience", "consciousness"],
      "sections": [
        { "heading": "Summary", "body": "..." }
      ]
    }
  ]
}
```

### `add_sidebar_shortcut`

Register an important page in the plugin-managed left sidebar shortcuts panel.

Payload:

```json
{
  "remId": "QVveg5uLbCa2hTnW8",
  "title": "Personal Intelligence OS",
  "icon": "🧠",
  "description": "Main hub for your personal intelligence system"
}
```

### `get_sidebar_shortcuts`

Read the current left-sidebar shortcuts stored in synced plugin storage.

### `remove_sidebar_shortcut`

Remove a shortcut by `remId`.

Response:

```json
{
  "processed": 1,
  "created": 1,
  "updated": 0,
  "results": [
    {
      "title": "Integrated Information Theory Note",
      "remId": "target-rem-id",
      "status": "created",
      "parentId": "leaf-parent-id"
    }
  ]
}
```

## Antigravity Flow

Recommended flow:

1. Capture content in Antigravity.
2. Classify it against `taxonomy.yml`.
3. Draft a normalized ingestion record.
4. Call `find_or_create_path` or directly `upsert_structured_note`.
5. Call `add_sidebar_shortcut` for any page that should stay reachable from the left side.
6. Write atomic facts to memory separately.

## Boundaries

Do not put full classification logic in the RemNote bridge.

The bridge should stay focused on:

- RemNote path resolution
- idempotent note writing
- deterministic section formatting
- batch execution
