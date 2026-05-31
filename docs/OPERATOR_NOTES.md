# Operator Notes

## Retrieval Discipline

- "Yapamam" veya "bu ortamda olmuyor" demeden once hizli geri cagirma sirasi:
  1. `docs/FAST_PATHS.md`
  2. `docs/OPERATOR_NOTES.md`
  3. `test_bridge_actions.ps1`
  4. `find_operator_memory.ps1 <keyword>`
- Bu kural ozellikle su tip islerde zorunlu:
  - image attachment / local-file / `imageUrls`
  - plugin reload / semantic rebuild
  - RemNote restart davranisi
  - daha once bir kez calistigi bilinen bridge workflow'lari

## 2026-03-10

### Structured source images

- `src/api/rem-adapter.ts` now preserves `sections[].imageUrls` in:
  - `createStructuredSummary`
  - `upsertStructuredNote`
  - `batchIngestRecords`
- Previous behavior accepted `imageUrls` in payload types but silently dropped them during note creation and update.
- Source images are now normalized to valid `http/https` URLs or `data:image/...` payloads and written under each section as image rem children.

### Validation

- `npm run check-types`
- `npm run build`

### RemNote restart behavior

- In this Windows environment, direct automation launch with:
  - `Start-Process "C:\Program Files\RemNote\RemNote.exe"`
  can exit immediately and fail to keep the desktop app open.
- Prefer Explorer shell launch instead:

```powershell
Start-Process explorer.exe -ArgumentList '"C:\Program Files\RemNote\RemNote.exe"'
```

- Preferred restart sequence for agents:

```powershell
Get-Process RemNote -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Start-Process explorer.exe -ArgumentList '"C:\Program Files\RemNote\RemNote.exe"'
```
