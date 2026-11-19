param(
    [string]$HostBaseUrl = 'http://127.0.0.1:3400',
    [string]$ParentRemId = 'ubgqlPRB62rYIoGn1',
    [string]$ExpectedPluginVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version,
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-BridgeAction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [hashtable]$Payload = @{}
    )

    $body = @{
        action = $Action
        payload = $Payload
    } | ConvertTo-Json -Depth 12

    $response = Invoke-RestMethod -Method Post -Uri ($HostBaseUrl.TrimEnd('/') + '/call') -ContentType 'application/json' -Body $body -TimeoutSec 60
    if (-not $response.ok) {
        throw "Bridge action failed: $Action"
    }

    return $response.result
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Condition,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

$suffix = Get-Date -Format 'yyyyMMdd_HHmmss'
$testImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
$cleanupRemIds = New-Object System.Collections.Generic.List[string]

$result = [ordered]@{
    status = $null
    parent = $null
    create_flashcard = $null
    update_flashcard_back = $null
    create_cloze_flashcard = $null
    batch_create_flashcards = $null
    export_practice_queue = $null
    read_parent_before_cleanup = $null
}

try {
    $result.status = Invoke-BridgeAction -Action 'get_status'
    Assert-True ($result.status.pluginVersion -eq $ExpectedPluginVersion) "Unexpected plugin version: $($result.status.pluginVersion)"

    $result.parent = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = "AG Flashcard Smoke $suffix"
        parentId = $ParentRemId
        isDocument = $true
        tags = @('smoke-flashcard')
    }
    $cleanupRemIds.Add([string]$result.parent.remId) | Out-Null

    $result.create_flashcard = Invoke-BridgeAction -Action 'create_flashcard' -Payload @{
        parentId = $result.parent.remId
        front = "front-$suffix"
        back = "back-$suffix"
        type = 'forward'
        detailToggles = @(
            @{
                title = "Details-$suffix"
                collapsed = $false
                children = @(
                    @{
                        title = "Meaning-$suffix"
                        body = "explanation-$suffix"
                        imageUrls = @($testImageDataUrl)
                        collapsed = $false
                    }
                )
            }
        )
        tags = @('smoke-flashcard')
    }
    $cleanupRemIds.Add([string]$result.create_flashcard.remId) | Out-Null
    Assert-True ($result.create_flashcard.front -eq "front-$suffix") 'create_flashcard front mismatch.'
    Assert-True ($result.create_flashcard.back -eq "back-$suffix") 'create_flashcard back mismatch.'
    Assert-True ($result.create_flashcard.type -eq 'forward') 'create_flashcard type mismatch.'

    $result.update_flashcard_back = Invoke-BridgeAction -Action 'update_flashcard_back' -Payload @{
        remId = $result.create_flashcard.remId
        back = "updated-back-$suffix"
    }
    Assert-True ($result.update_flashcard_back.success -eq $true) 'update_flashcard_back failed.'
    Assert-True ($result.update_flashcard_back.back -eq "updated-back-$suffix") 'update_flashcard_back back mismatch.'

    $result.create_cloze_flashcard = Invoke-BridgeAction -Action 'create_cloze_flashcard' -Payload @{
        parentId = $result.parent.remId
        text = "cloze-$suffix {{answer}}"
        tags = @('smoke-flashcard')
    }
    $cleanupRemIds.Add([string]$result.create_cloze_flashcard.remId) | Out-Null
    Assert-True ($result.create_cloze_flashcard.clozeCount -eq 1) 'create_cloze_flashcard clozeCount mismatch.'

    $result.batch_create_flashcards = Invoke-BridgeAction -Action 'batch_create_flashcards' -Payload @{
        parentId = $result.parent.remId
        cards = @(
            @{
                front = "batch-a-front-$suffix"
                back = "batch-a-back-$suffix"
                type = 'forward'
                tags = @('smoke-flashcard')
            },
            @{
                front = "batch-b-front-$suffix"
                back = "batch-b-back-$suffix"
                type = 'forward'
                tags = @('smoke-flashcard')
            }
        )
    }
    foreach ($card in @($result.batch_create_flashcards.cards)) {
        if ($card.remId) {
            $cleanupRemIds.Add([string]$card.remId) | Out-Null
        }
    }
    Assert-True ($result.batch_create_flashcards.created -eq 2) 'batch_create_flashcards count mismatch.'

    $result.export_practice_queue = Invoke-BridgeAction -Action 'export_practice_queue' -Payload @{
        parentId = $result.parent.remId
        includeBackText = $true
        includeCardDetails = $true
        limit = 10
        maxScan = 20
        sortBy = 'title'
        direction = 'asc'
    }
    Assert-True ($result.export_practice_queue.readOnly -eq $true) 'export_practice_queue is not read-only.'
    Assert-True ($result.export_practice_queue.mutationApplied -eq $false) 'export_practice_queue applied a mutation.'
    Assert-True ($result.export_practice_queue.returned -ge 4) 'export_practice_queue did not return the created practice cards.'
    $createdCardRow = @($result.export_practice_queue.rows | Where-Object { $_.remId -eq $result.create_flashcard.remId } | Select-Object -First 1)
    Assert-True ($createdCardRow.Count -eq 1) 'export_practice_queue did not include the created flashcard.'
    Assert-True ($createdCardRow[0].isCardItem -eq $true) 'export_practice_queue did not report isCardItem for created flashcard.'
    Assert-True ($createdCardRow[0].backTextPlain -eq "updated-back-$suffix") 'export_practice_queue back text mismatch.'

    $result.read_parent_before_cleanup = Invoke-BridgeAction -Action 'read_note' -Payload @{
        remId = $result.parent.remId
        depth = 1
    }
    $childIds = @($result.read_parent_before_cleanup.children | ForEach-Object { $_.remId })
    Assert-True ($childIds -contains $result.create_flashcard.remId) 'Parent read did not include created flashcard.'
    Assert-True ($childIds -contains $result.create_cloze_flashcard.remId) 'Parent read did not include created cloze flashcard.'

    $result.read_created_flashcard = Invoke-BridgeAction -Action 'read_note' -Payload @{
        remId = $result.create_flashcard.remId
        depth = 3
    }
    $detailRoot = @($result.read_created_flashcard.children | Where-Object { $_.text -eq "Details-$suffix" } | Select-Object -First 1)
    Assert-True ($detailRoot.Count -eq 1) 'create_flashcard did not create detail toggle root.'
    $detailChild = @($detailRoot[0].children | Where-Object { $_.text -eq "Meaning-$suffix" } | Select-Object -First 1)
    Assert-True ($detailChild.Count -eq 1) 'create_flashcard did not create detail toggle child.'
    $detailGrandchildren = @($detailChild[0].children)
    Assert-True ($detailGrandchildren.Count -ge 2) 'create_flashcard detail child did not include body plus image child.'

    $result.inspect_detail_root = Invoke-BridgeAction -Action 'inspect_rem_object_state' -Payload @{
        remId = $detailRoot[0].remId
        powerupCodes = @('x', 'e')
        includePowerups = $true
    }
    Assert-True ($result.inspect_detail_root.fields.powerups.hasPowerup.x.value -eq $true) 'detail toggle root is missing Extra Card Detail power-up.'
    Assert-True ($result.inspect_detail_root.fields.powerups.hasPowerup.e.value -ne $true) 'detail toggle root should not have Edit Later power-up.'

    $result.inspect_detail_child = Invoke-BridgeAction -Action 'inspect_rem_object_state' -Payload @{
        remId = $detailChild[0].remId
        powerupCodes = @('x', 'e')
        includePowerups = $true
    }
    Assert-True ($result.inspect_detail_child.fields.powerups.hasPowerup.x.value -ne $true) 'detail child should not have Extra Card Detail power-up.'
    Assert-True ($result.inspect_detail_child.fields.powerups.hasPowerup.e.value -ne $true) 'detail child should not have Edit Later power-up.'
}
finally {
    foreach ($remId in ($cleanupRemIds | Select-Object -Unique | Sort-Object -Descending)) {
        try {
            Invoke-BridgeAction -Action 'delete_note' -Payload @{ remId = $remId } | Out-Null
        } catch {
        }
    }
}

$json = [pscustomobject]$result | ConvertTo-Json -Depth 12

if ($OutputPath) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)
}

$json
