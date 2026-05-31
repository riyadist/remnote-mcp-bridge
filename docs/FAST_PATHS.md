# Fast Paths

Bu dosya, sık tekrar eden ama kolay unutulabilen operasyonel akislari hizli geri cagirmak icin tutulur.
Amaç: bir yetenekten emin degilsek once buraya bakmak, sonra kod/test dosyasina gitmek.

## Chat Attachment Image -> RemNote

Durum:
- Chat'teki image attachment dogrudan binary olarak her zaman erisilebilir olmayabilir.
- Ama daha once calisan yol su: goruntu once yerel dosya path'i veya URL olarak temsil edilir, sonra bridge uzerinden `imageUrls` ile RemNote'a yazilir.

Hizli akıs:
1. Yerel dosya path'ini al.
2. Bridge local-file URL'sine cevir:

```powershell
$localImageUrl = 'http://127.0.0.1:3400/local-file?path=' + [uri]::EscapeDataString($localImagePath)
```

3. `create_structured_summary` veya `upsert_structured_note` icinde `sections[].imageUrls` ver.

Kanıt dosyalari:
- `bridge-host.cjs` -> `/local-file`
- `src/api/rem-adapter.ts` -> `normalizeImageUrls`, `appendImageRems`
- `test_bridge_actions.ps1` -> calisan local image write ornegi

Ornek payload:

```json
{
  "action": "upsert_structured_note",
  "payload": {
    "title": "Image Test",
    "pathSegments": ["Personal Intelligence OS", "Image Tests"],
    "sections": [
      {
        "heading": "Source Image",
        "body": "Local image test",
        "imageUrls": [
          "http://127.0.0.1:3400/local-file?path=C%3A%5Cpath%5Cto%5Cimage.png"
        ]
      }
    ]
  }
}
```

## Plugin Reload + Semantic Refresh

```powershell
.\update_and_test_semantic.ps1 -AlsoDeep
```

Bu script sunlari yapar:
- typecheck
- build
- reload_plugin
- rebuild_semantic_index
- semantic regression suite

## RemNote Restart

Bu ortamda direkt exe launch guvenilmez olabilir.
Tercih edilen yol:

```powershell
Get-Process RemNote -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Start-Process explorer.exe -ArgumentList '"C:\Program Files\RemNote\RemNote.exe"'
```

Kaynak:
- `docs/OPERATOR_NOTES.md`

## Operasyonel Kural

Bir yetenek icin "yapamam" demeden once su sira izlenmeli:
1. `docs/FAST_PATHS.md`
2. `docs/OPERATOR_NOTES.md`
3. `test_bridge_actions.ps1`
4. `rg` ile repo icinde anahtar kelime taramasi
