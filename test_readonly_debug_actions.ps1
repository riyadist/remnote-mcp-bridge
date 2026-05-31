param(
    [string]$HostBaseUrl = 'http://127.0.0.1:3400',
    [string]$TargetRemId = 'ubgqlPRB62rYIoGn1',
    [string]$ExpectedPluginVersion = '2.58.0',
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

function Assert-TargetResult {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Result,
        [Parameter(Mandatory = $true)]
        [string]$Action
    )

    Assert-True ($Result.remId -eq $TargetRemId) "$Action returned unexpected remId: $($Result.remId)"
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$Result.title)) "$Action returned empty title"
}

$result = [ordered]@{
    targetRemId = $TargetRemId
    status = $null
    inspect_built_in_powerups = $null
    inspect_native_icon_state = $null
    inspect_note_style = $null
    inspect_rem_relations = $null
    debug_rem_raw_text = $null
    get_rem_tags = $null
    count_tagged_rems = $null
}

$result.status = Invoke-BridgeAction -Action 'get_status'
Assert-True ($result.status.pluginVersion -eq $ExpectedPluginVersion) "Unexpected plugin version: $($result.status.pluginVersion)"

$payload = @{ remId = $TargetRemId }

$result.inspect_built_in_powerups = Invoke-BridgeAction -Action 'inspect_built_in_powerups' -Payload $payload
Assert-TargetResult -Result $result.inspect_built_in_powerups -Action 'inspect_built_in_powerups'
Assert-True ($null -ne $result.inspect_built_in_powerups.activePowerups) 'inspect_built_in_powerups missing activePowerups'

$result.inspect_native_icon_state = Invoke-BridgeAction -Action 'inspect_native_icon_state' -Payload $payload
Assert-TargetResult -Result $result.inspect_native_icon_state -Action 'inspect_native_icon_state'
Assert-True ($null -ne $result.inspect_native_icon_state.powerups) 'inspect_native_icon_state missing powerups'

$result.inspect_note_style = Invoke-BridgeAction -Action 'inspect_note_style' -Payload $payload
Assert-TargetResult -Result $result.inspect_note_style -Action 'inspect_note_style'

$result.inspect_rem_relations = Invoke-BridgeAction -Action 'inspect_rem_relations' -Payload $payload
Assert-TargetResult -Result $result.inspect_rem_relations -Action 'inspect_rem_relations'
Assert-True ($null -ne $result.inspect_rem_relations.counts) 'inspect_rem_relations missing counts'

$result.debug_rem_raw_text = Invoke-BridgeAction -Action 'debug_rem_raw_text' -Payload $payload
Assert-TargetResult -Result $result.debug_rem_raw_text -Action 'debug_rem_raw_text'
Assert-True ($null -ne $result.debug_rem_raw_text.childIds) 'debug_rem_raw_text missing childIds'

$result.get_rem_tags = Invoke-BridgeAction -Action 'get_rem_tags' -Payload $payload
Assert-True ($result.get_rem_tags.remId -eq $TargetRemId) "get_rem_tags returned unexpected remId: $($result.get_rem_tags.remId)"
Assert-True ($null -ne $result.get_rem_tags.tags) 'get_rem_tags missing tags'

$result.count_tagged_rems = Invoke-BridgeAction -Action 'count_tagged_rems' -Payload $payload
Assert-TargetResult -Result $result.count_tagged_rems -Action 'count_tagged_rems'
Assert-True ($null -ne $result.count_tagged_rems.taggedCount) 'count_tagged_rems missing taggedCount'

$json = [pscustomobject]$result | ConvertTo-Json -Depth 12

if ($OutputPath) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)
}

$json
