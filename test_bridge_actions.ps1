param(
    [string]$HostBaseUrl = 'http://127.0.0.1:3400'
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

    try {
        $response = Invoke-RestMethod -Method Post -Uri ($HostBaseUrl.TrimEnd('/') + '/call') -ContentType 'application/json' -Body $body -TimeoutSec 60
    } catch {
        $details = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                if ($responseBody) {
                    $details = "$details Body: $responseBody"
                }
            } catch {
            }
        }
        throw "Bridge action request failed: $Action. $details"
    }
    if (-not $response.ok) {
        throw "Bridge action failed: $Action"
    }

    return $response.result
}

function Get-BridgeHealth {
    $url = $HostBaseUrl.TrimEnd('/') + '/health'
    return Invoke-RestMethod -Method Get -Uri $url -TimeoutSec 30
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
$rootTitle = "AG Bridge Smoke $suffix"
$localImagePath = Join-Path (Resolve-Path "$PSScriptRoot\..\..\..").Path 'docs\vision_logs\crop_after_star.png'
$localImageUrl = 'http://127.0.0.1:3400/local-file?path=' + [uri]::EscapeDataString($localImagePath)
$remoteImageUrl = 'https://placehold.co/320x180/png'

$result = [ordered]@{
    health = $null
    status = $null
    capability_inspector = $null
    sdk_gap_report = $null
    sdk_namespace_call_app = $null
    sdk_namespace_call_window = $null
    inspect_app_context = $null
    inspect_editor_context = $null
    inspect_queue_context = $null
    inspect_plugin_runtime = $null
    inspect_focus_context = $null
    sdk_namespace_call_storage = $null
    sdk_namespace_call_setting = $null
    sdk_namespace_call_kb = $null
    rich_text_parse_markdown = $null
    rich_text_format_range = $null
    rich_text_inspect = $null
    rich_text_insert_html_dry_run = $null
    rich_text_insert_html_unconfirmed = $null
    rich_text_insert_html_unsafe = $null
    rich_text_insert_html = $null
    host_remnote_sdk_surface_gap_report = $null
    safe_migration_audit_log = $null
    safe_migration_apply = $null
    safe_migration_apply_rollback = $null
    safe_migration_plan = $null
    safe_migration_rollback_read = $null
    safe_migration_validate_rollback = $null
    debug_window_context = $null
    path = $null
    note = $null
    search = $null
    read = $null
    inspect_rem_object_state = $null
    inspect_rem_graph_context = $null
    control_rem_object_state_status = $null
    control_rem_object_state_dry_run = $null
    control_rem_object_state_unconfirmed = $null
    control_rem_object_state_apply = $null
    control_rem_structure_status = $null
    control_rem_structure_dry_run = $null
    control_rem_structure_unconfirmed = $null
    control_rem_structure_destructive_block = $null
    get_all_rems = $null
    export_vault_snapshot = $null
    host_remnote_vault_snapshot_export = $null
    host_remnote_vault_snapshot_export_partitioned = $null
    host_remnote_vault_partition_query = $null
    host_remnote_vault_partition_cursor_page1 = $null
    host_remnote_vault_partition_cursor_page2 = $null
    host_remnote_vault_partition_cursor_page3 = $null
    host_remnote_vault_partition_stats = $null
    host_remnote_vault_partition_stats_cursor_page1 = $null
    host_remnote_vault_partition_stats_cursor_page2 = $null
    host_remnote_vault_partition_stats_cursor_page3 = $null
    host_remnote_vault_partition_stats_aggregate = $null
    host_remnote_vault_export_field_profile = $null
    host_remnote_vault_export_field_profile_filtered = $null
    host_remnote_vault_export_schema_profile = $null
    host_remnote_vault_quality_report = $null
    host_remnote_vault_partition_graph = $null
    host_remnote_vault_partition_diff = $null
    host_remnote_vault_export_catalog = $null
    host_remnote_vault_export_query = $null
    host_remnote_vault_export_stats = $null
    host_remnote_vault_export_graph = $null
    host_remnote_vault_export_graph_file = $null
    host_remnote_vault_graph_export_catalog = $null
    host_remnote_vault_graph_export_query = $null
    host_remnote_vault_export_diff = $null
    read_rem_full = $null
    probe_rem_ids = $null
    export_subtree = $null
    export_daily_range = $null
    list_children = $null
    update = $null
    overwrite = $null
    move = $null
    location = $null
    get_daily_doc = $null
    append_journal = $null
    note_heading = $null
    note_highlight = $null
    add_powerup = $null
    remove_powerup_v2 = $null
    native_icon = $null
    document_pinned = $null
    document_unpinned = $null
    callout_icon = $null
    remove_powerup = $null
    structured = $null
    structured_read = $null
    create_reference = $null
    create_portal = $null
    add_rem_to_portal = $null
    remove_rem_from_portal = $null
    add_source_to_rem = $null
    remove_source_from_rem = $null
    create_link_rem_dry_run = $null
    create_link_rem_unconfirmed = $null
    create_link_rem = $null
    create_alias = $null
    set_practice_state = $null
    upsert = $null
    upsert_read = $null
    batch = $null
    sidebar_get = $null
    sidebar_set = $null
    sidebar_add = $null
    sidebar_remove = $null
    table = $null
    property = $null
    property_info_before = $null
    property_type_set = $null
    property_info_after = $null
    row = $null
    property_set = $null
    doctor_target = $null
    doctor_blank_child = $null
    add_tag_by_id = $null
    remove_tag_by_id = $null
    list_table_rows = $null
    export_tag_view = $null
    export_learning_inbox = $null
    export_card_catalog = $null
    read_card_full = $null
    control_card_status = $null
    control_card_dry_run = $null
    control_card_unconfirmed = $null
    control_app_status = $null
    control_app_dry_run = $null
    control_app_unconfirmed = $null
    control_editor_status = $null
    control_editor_dry_run = $null
    control_editor_unconfirmed = $null
    control_practice_queue_status = $null
    control_practice_queue_unconfirmed = $null
    control_window_status = $null
    control_window_dry_run = $null
    control_window_unconfirmed = $null
    control_plugin_runtime_status = $null
    control_plugin_runtime_storage_get = $null
    control_plugin_runtime_dry_run = $null
    control_plugin_runtime_unconfirmed = $null
    inspect_powerup_registry = $null
    control_events_status = $null
    control_events_dry_run = $null
    control_events_unconfirmed = $null
    control_events_add = $null
    control_events_remove = $null
    control_reader_status = $null
    control_reader_dry_run = $null
    control_reader_unconfirmed = $null
    control_scheduler_status = $null
    control_scheduler_dry_run = $null
    control_scheduler_unconfirmed = $null
    sdk_namespace_call_powerup = $null
    repair_property = $null
    plan_learning_inbox_repairs = $null
    apply_learning_inbox_repairs_unconfirmed = $null
    apply_learning_inbox_repairs = $null
    export_learning_inbox_after_apply = $null
    set_table_filter_raw = $null
    template = $null
    template_auto_apply_off = $null
    template_auto_apply_on = $null
    templates = $null
    template_target = $null
    template_apply = $null
    auto_template_target = $null
    auto_template_apply = $null
    rem_sdk_call = $null
    rem_raw_call = $null
    list_tagged_rems = $null
    export_graph_edges = $null
    remnote_doctor_scan = $null
    plan_remnote_doctor_repairs = $null
    apply_remnote_doctor_repairs_unconfirmed = $null
    apply_remnote_doctor_repairs = $null
    remnote_doctor_scan_after_apply = $null
    indexeddb_inventory = $null
    indexeddb_read_store = $null
    host_remnote_db_doctor_scan = $null
    host_remnote_db_inventory = $null
    host_remnote_leveldb_decode = $null
    host_remnote_leveldb_entity_index = $null
    host_remnote_leveldb_graph_export = $null
    host_remnote_leveldb_log_decode = $null
    host_remnote_leveldb_sdk_map = $null
    host_remnote_leveldb_snapshot_scan = $null
    folder_before = $null
    folder_after = $null
    open_note = $null
    debug_focused_page_children_raw = $null
    semantic_status = $null
    discover_tables = $null
    smart_count_table = $null
    count_books_table = $null
    inject_css = $null
}

$cleanupRemIds = New-Object System.Collections.Generic.List[string]

try {
    $result.health = Get-BridgeHealth
    Assert-True ($result.health.ok -eq $true) 'Health endpoint returned non-ok response.'

    $result.status = Invoke-BridgeAction -Action 'get_status'
    Assert-True ($result.status.connected -eq [bool]$result.health.pluginConnected) "get_status connected mismatch. status=$($result.status.connected) health=$($result.health.pluginConnected)"
    Assert-True ($result.status.pluginVersion -eq '2.58.0') "Unexpected plugin version: $($result.status.pluginVersion)"
    Assert-True ($null -ne $result.health.runtime.lastUpdate) 'Health runtime.lastUpdate is missing.'
    Assert-True ($result.health.runtime.lastUpdate.expectedVersion -eq $result.status.pluginVersion) "Health expectedVersion mismatch: $($result.health.runtime.lastUpdate.expectedVersion)"
    Assert-True ($result.health.runtime.lastUpdate.activeVersion -eq $result.status.pluginVersion) "Health activeVersion mismatch: $($result.health.runtime.lastUpdate.activeVersion)"

    $result.capability_inspector = Invoke-BridgeAction -Action 'capability_inspector'
    Assert-True ($result.capability_inspector.pluginVersion -eq '2.58.0') 'capability_inspector pluginVersion mismatch.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'sdk_namespace_call' }).Count -eq 1) 'capability_inspector missing sdk_namespace_call action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_app_context' }).Count -eq 1) 'capability_inspector missing inspect_app_context action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_editor_context' }).Count -eq 1) 'capability_inspector missing inspect_editor_context action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_queue_context' }).Count -eq 1) 'capability_inspector missing inspect_queue_context action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_plugin_runtime' }).Count -eq 1) 'capability_inspector missing inspect_plugin_runtime action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_focus_context' }).Count -eq 1) 'capability_inspector missing inspect_focus_context action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'rich_text_parse_markdown' }).Count -eq 1) 'capability_inspector missing rich_text_parse_markdown action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'rich_text_format_range' }).Count -eq 1) 'capability_inspector missing rich_text_format_range action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'rich_text_inspect' }).Count -eq 1) 'capability_inspector missing rich_text_inspect action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'rich_text_insert_html' }).Count -eq 1) 'capability_inspector missing rich_text_insert_html action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_sdk_surface_gap_report' }).Count -eq 1) 'capability_inspector missing host_remnote_sdk_surface_gap_report action.'
    Assert-True ($null -ne $result.capability_inspector.sdkNamespaceReadAllowlist) 'capability_inspector missing sdkNamespaceReadAllowlist.'
    Assert-True (@($result.capability_inspector.sdkNamespaceReadAllowlist.app | Where-Object { $_ -eq 'getPlatform' }).Count -eq 1) 'capability_inspector namespace allowlist missing app.getPlatform.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'get_all_rems' }).Count -eq 1) 'capability_inspector missing get_all_rems action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'export_vault_snapshot' }).Count -eq 1) 'capability_inspector missing export_vault_snapshot action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_snapshot_export' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_snapshot_export action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_snapshot_export_partitioned' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_snapshot_export_partitioned action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_catalog' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_catalog action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_query' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_query action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_field_profile' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_field_profile action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_stats' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_stats action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_schema_profile' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_schema_profile action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_stats_aggregate' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_stats_aggregate action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_quality_report' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_quality_report action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_graph' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_graph action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_graph_file' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_graph_file action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_graph_export_catalog' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_graph_export_catalog action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_graph_export_query' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_graph_export_query action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_vault_export_diff' }).Count -eq 1) 'capability_inspector missing host_remnote_vault_export_diff action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'probe_rem_ids' }).Count -eq 1) 'capability_inspector missing probe_rem_ids action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'indexeddb_inventory' }).Count -eq 1) 'capability_inspector missing indexeddb_inventory action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_db_doctor_scan' }).Count -eq 1) 'capability_inspector missing host_remnote_db_doctor_scan action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_db_inventory' }).Count -eq 1) 'capability_inspector missing host_remnote_db_inventory action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_leveldb_decode' }).Count -eq 1) 'capability_inspector missing host_remnote_leveldb_decode action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_leveldb_entity_index' }).Count -eq 1) 'capability_inspector missing host_remnote_leveldb_entity_index action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_leveldb_graph_export' }).Count -eq 1) 'capability_inspector missing host_remnote_leveldb_graph_export action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_leveldb_log_decode' }).Count -eq 1) 'capability_inspector missing host_remnote_leveldb_log_decode action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'host_remnote_leveldb_sdk_map' }).Count -eq 1) 'capability_inspector missing host_remnote_leveldb_sdk_map action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'create_link_rem' }).Count -eq 1) 'capability_inspector missing create_link_rem action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'export_practice_queue' }).Count -eq 1) 'capability_inspector missing export_practice_queue action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'export_card_catalog' }).Count -eq 1) 'capability_inspector missing export_card_catalog action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'read_card_full' }).Count -eq 1) 'capability_inspector missing read_card_full action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_card' }).Count -eq 1) 'capability_inspector missing control_card action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_app' }).Count -eq 1) 'capability_inspector missing control_app action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_editor' }).Count -eq 1) 'capability_inspector missing control_editor action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_practice_queue' }).Count -eq 1) 'capability_inspector missing control_practice_queue action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_plugin_runtime' }).Count -eq 1) 'capability_inspector missing control_plugin_runtime action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_window' }).Count -eq 1) 'capability_inspector missing control_window action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_powerup_registry' }).Count -eq 1) 'capability_inspector missing inspect_powerup_registry action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_events' }).Count -eq 1) 'capability_inspector missing control_events action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_reader' }).Count -eq 1) 'capability_inspector missing control_reader action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_scheduler' }).Count -eq 1) 'capability_inspector missing control_scheduler action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_rem_object_state' }).Count -eq 1) 'capability_inspector missing inspect_rem_object_state action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_rem_object_state' }).Count -eq 1) 'capability_inspector missing control_rem_object_state action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'inspect_rem_graph_context' }).Count -eq 1) 'capability_inspector missing inspect_rem_graph_context action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'control_rem_structure' }).Count -eq 1) 'capability_inspector missing control_rem_structure action.'
    Assert-True (@($result.capability_inspector.sdkNamespaceReadAllowlist.powerup | Where-Object { $_ -eq 'getPowerupByCode' }).Count -eq 1) 'capability_inspector namespace allowlist missing powerup.getPowerupByCode.'
    Assert-True (@($result.capability_inspector.sdkNamespaceReadAllowlist.powerup | Where-Object { $_ -eq 'getPowerupSlotByCode' }).Count -eq 1) 'capability_inspector namespace allowlist missing powerup.getPowerupSlotByCode.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'export_learning_inbox' }).Count -eq 1) 'capability_inspector missing export_learning_inbox action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'plan_learning_inbox_repairs' }).Count -eq 1) 'capability_inspector missing plan_learning_inbox_repairs action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'apply_learning_inbox_repairs' }).Count -eq 1) 'capability_inspector missing apply_learning_inbox_repairs action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'plan_remnote_doctor_repairs' }).Count -eq 1) 'capability_inspector missing plan_remnote_doctor_repairs action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'apply_remnote_doctor_repairs' }).Count -eq 1) 'capability_inspector missing apply_remnote_doctor_repairs action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'safe_migration_audit_log' }).Count -eq 1) 'capability_inspector missing safe_migration_audit_log action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'safe_migration_apply' }).Count -eq 1) 'capability_inspector missing safe_migration_apply action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'safe_migration_apply_rollback' }).Count -eq 1) 'capability_inspector missing safe_migration_apply_rollback action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'safe_migration_plan' }).Count -eq 1) 'capability_inspector missing safe_migration_plan action.'
    Assert-True (@($result.capability_inspector.actions | Where-Object { $_ -eq 'safe_migration_validate_rollback' }).Count -eq 1) 'capability_inspector missing safe_migration_validate_rollback action.'

    $result.sdk_gap_report = Invoke-BridgeAction -Action 'sdk_gap_report'
    Assert-True ($result.sdk_gap_report.sdkVersion -eq '0.0.46') 'sdk_gap_report SDK version mismatch.'

    $result.sdk_namespace_call_app = Invoke-BridgeAction -Action 'sdk_namespace_call' -Payload @{
        namespace = 'app'
        method = 'getPlatform'
    }
    Assert-True ($result.sdk_namespace_call_app.readOnly -eq $true) 'sdk_namespace_call app must be read-only.'
    Assert-True ($result.sdk_namespace_call_app.mutationApplied -eq $false) 'sdk_namespace_call app must not mutate RemNote.'
    Assert-True ($result.sdk_namespace_call_app.namespace -eq 'app') 'sdk_namespace_call app namespace mismatch.'
    Assert-True ($result.sdk_namespace_call_app.method -eq 'getPlatform') 'sdk_namespace_call app method mismatch.'
    Assert-True ($result.sdk_namespace_call_app.ok -eq $true) 'sdk_namespace_call app failed.'

    $result.sdk_namespace_call_window = Invoke-BridgeAction -Action 'sdk_namespace_call' -Payload @{
        namespace = 'window'
        method = 'getOpenPaneIds'
    }
    Assert-True ($result.sdk_namespace_call_window.readOnly -eq $true) 'sdk_namespace_call window must be read-only.'
    Assert-True ($result.sdk_namespace_call_window.mutationApplied -eq $false) 'sdk_namespace_call window must not mutate RemNote.'
    Assert-True ($result.sdk_namespace_call_window.ok -eq $true) 'sdk_namespace_call window failed.'

    $result.inspect_app_context = Invoke-BridgeAction -Action 'inspect_app_context'
    Assert-True ($result.inspect_app_context.readOnly -eq $true) 'inspect_app_context must be read-only.'
    Assert-True ($result.inspect_app_context.mutationApplied -eq $false) 'inspect_app_context must not mutate RemNote.'
    Assert-True ($result.inspect_app_context.pluginVersion -eq '2.58.0') 'inspect_app_context pluginVersion mismatch.'
    Assert-True ($result.inspect_app_context.fields.platform.ok -eq $true) 'inspect_app_context platform failed.'

    $result.control_app_status = Invoke-BridgeAction -Action 'control_app' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_app_status.success -eq $true) 'control_app status failed.'
    Assert-True ($result.control_app_status.readOnly -eq $true) 'control_app status must be read-only.'
    Assert-True ($result.control_app_status.mutationApplied -eq $false) 'control_app status must not mutate RemNote.'
    Assert-True ($result.control_app_status.pluginVersion -eq '2.58.0') 'control_app status pluginVersion mismatch.'

    $result.control_app_dry_run = Invoke-BridgeAction -Action 'control_app' -Payload @{
        operation = 'registerCSS'
        id = "mcp-dry-run-$suffix"
        css = '.mcp-dry-run { color: inherit; }'
        dryRun = $true
    }
    Assert-True ($result.control_app_dry_run.readOnly -eq $true) 'control_app dry-run must be read-only.'
    Assert-True ($result.control_app_dry_run.dryRun -eq $true) 'control_app dry-run flag missing.'
    Assert-True ($result.control_app_dry_run.mutationApplied -eq $false) 'control_app dry-run must not mutate RemNote.'
    Assert-True ($result.control_app_dry_run.plannedCall.method -eq 'registerCSS') 'control_app dry-run planned method mismatch.'

    $result.control_app_unconfirmed = Invoke-BridgeAction -Action 'control_app' -Payload @{
        operation = 'toast'
        message = "unconfirmed-$suffix"
    }
    Assert-True ($result.control_app_unconfirmed.requiresConfirmation -eq $true) 'control_app unconfirmed should require confirmation.'
    Assert-True ($result.control_app_unconfirmed.mutationApplied -eq $false) 'control_app unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_app_unconfirmed.confirmationText -eq 'CONTROL_APP') 'control_app confirmation text mismatch.'
    Assert-True ($result.control_app_unconfirmed.pluginVersion -eq '2.58.0') 'control_app unconfirmed pluginVersion mismatch.'

    $result.control_window_status = Invoke-BridgeAction -Action 'control_window' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_window_status.success -eq $true) 'control_window status failed.'
    Assert-True ($result.control_window_status.readOnly -eq $true) 'control_window status must be read-only.'
    Assert-True ($result.control_window_status.mutationApplied -eq $false) 'control_window status must not mutate RemNote.'
    Assert-True ($result.control_window_status.pluginVersion -eq '2.58.0') 'control_window status pluginVersion mismatch.'
    Assert-True ($null -ne $result.control_window_status.before.fields.openPaneIds) 'control_window status missing openPaneIds.'

    $result.control_window_dry_run = Invoke-BridgeAction -Action 'control_window' -Payload @{
        operation = 'setURL'
        url = 'remnote://local'
        dryRun = $true
    }
    Assert-True ($result.control_window_dry_run.readOnly -eq $true) 'control_window dry-run must be read-only.'
    Assert-True ($result.control_window_dry_run.dryRun -eq $true) 'control_window dry-run flag missing.'
    Assert-True ($result.control_window_dry_run.mutationApplied -eq $false) 'control_window dry-run must not mutate RemNote.'
    Assert-True ($result.control_window_dry_run.plannedCall.method -eq 'setURL') 'control_window dry-run planned method mismatch.'

    $result.control_window_unconfirmed = Invoke-BridgeAction -Action 'control_window' -Payload @{
        operation = 'setURL'
        url = 'remnote://local'
    }
    Assert-True ($result.control_window_unconfirmed.requiresConfirmation -eq $true) 'control_window unconfirmed should require confirmation.'
    Assert-True ($result.control_window_unconfirmed.mutationApplied -eq $false) 'control_window unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_window_unconfirmed.confirmationText -eq 'CONTROL_WINDOW') 'control_window confirmation text mismatch.'
    Assert-True ($result.control_window_unconfirmed.pluginVersion -eq '2.58.0') 'control_window unconfirmed pluginVersion mismatch.'

    $result.control_plugin_runtime_status = Invoke-BridgeAction -Action 'control_plugin_runtime' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_plugin_runtime_status.success -eq $true) 'control_plugin_runtime status failed.'
    Assert-True ($result.control_plugin_runtime_status.readOnly -eq $true) 'control_plugin_runtime status must be read-only.'
    Assert-True ($result.control_plugin_runtime_status.mutationApplied -eq $false) 'control_plugin_runtime status must not mutate RemNote.'
    Assert-True ($result.control_plugin_runtime_status.pluginVersion -eq '2.58.0') 'control_plugin_runtime status pluginVersion mismatch.'

    $result.control_plugin_runtime_storage_get = Invoke-BridgeAction -Action 'control_plugin_runtime' -Payload @{
        operation = 'storageGet'
        storageArea = 'session'
        key = 'ag-smoke-missing-key'
    }
    Assert-True ($result.control_plugin_runtime_storage_get.readOnly -eq $true) 'control_plugin_runtime storageGet must be read-only.'
    Assert-True ($result.control_plugin_runtime_storage_get.mutationApplied -eq $false) 'control_plugin_runtime storageGet must not mutate RemNote.'
    Assert-True ($result.control_plugin_runtime_storage_get.plannedCall.method -eq 'getSession') 'control_plugin_runtime storageGet planned method mismatch.'

    $result.control_plugin_runtime_dry_run = Invoke-BridgeAction -Action 'control_plugin_runtime' -Payload @{
        operation = 'storageSet'
        storageArea = 'session'
        key = "ag-dry-run-$suffix"
        value = @{ ok = $true; suffix = $suffix }
        dryRun = $true
    }
    Assert-True ($result.control_plugin_runtime_dry_run.readOnly -eq $true) 'control_plugin_runtime dry-run must be read-only.'
    Assert-True ($result.control_plugin_runtime_dry_run.dryRun -eq $true) 'control_plugin_runtime dry-run flag missing.'
    Assert-True ($result.control_plugin_runtime_dry_run.mutationApplied -eq $false) 'control_plugin_runtime dry-run must not mutate RemNote.'
    Assert-True ($result.control_plugin_runtime_dry_run.plannedCall.method -eq 'setSession') 'control_plugin_runtime dry-run planned method mismatch.'

    $result.control_plugin_runtime_unconfirmed = Invoke-BridgeAction -Action 'control_plugin_runtime' -Payload @{
        operation = 'broadcast'
        message = @{ smoke = $suffix }
    }
    Assert-True ($result.control_plugin_runtime_unconfirmed.requiresConfirmation -eq $true) 'control_plugin_runtime unconfirmed should require confirmation.'
    Assert-True ($result.control_plugin_runtime_unconfirmed.mutationApplied -eq $false) 'control_plugin_runtime unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_plugin_runtime_unconfirmed.confirmationText -eq 'CONTROL_PLUGIN_RUNTIME') 'control_plugin_runtime confirmation text mismatch.'
    Assert-True ($result.control_plugin_runtime_unconfirmed.pluginVersion -eq '2.58.0') 'control_plugin_runtime unconfirmed pluginVersion mismatch.'

    $result.inspect_powerup_registry = Invoke-BridgeAction -Action 'inspect_powerup_registry' -Payload @{
        powerupCodes = @('o', 'r', 't')
        slotsByPowerupCode = @{
            o = @('Status')
            r = @('Size')
            t = @('Status')
        }
        includeDefaultPowerups = $false
        valueDepth = 3
    }
    Assert-True ($result.inspect_powerup_registry.readOnly -eq $true) 'inspect_powerup_registry must be read-only.'
    Assert-True ($result.inspect_powerup_registry.mutationApplied -eq $false) 'inspect_powerup_registry must not mutate RemNote.'
    Assert-True ($result.inspect_powerup_registry.pluginVersion -eq '2.58.0') 'inspect_powerup_registry pluginVersion mismatch.'
    Assert-True ($result.inspect_powerup_registry.powerupCount -eq 3) 'inspect_powerup_registry powerup count mismatch.'
    Assert-True ($result.inspect_powerup_registry.slotProbeCount -eq 3) 'inspect_powerup_registry slot count mismatch.'
    Assert-True ($result.inspect_powerup_registry.powerups.o.ok -eq $true) 'inspect_powerup_registry failed to read Document powerup.'

    $result.control_events_status = Invoke-BridgeAction -Action 'control_events' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_events_status.success -eq $true) 'control_events status failed.'
    Assert-True ($result.control_events_status.readOnly -eq $true) 'control_events status must be read-only.'
    Assert-True ($result.control_events_status.mutationApplied -eq $false) 'control_events status must not mutate RemNote.'
    Assert-True ($result.control_events_status.pluginVersion -eq '2.58.0') 'control_events status pluginVersion mismatch.'

    $result.control_events_dry_run = Invoke-BridgeAction -Action 'control_events' -Payload @{
        operation = 'addListener'
        eventId = 'global.url-change'
        listenerKey = "ag-dry-run-$suffix"
        dryRun = $true
    }
    Assert-True ($result.control_events_dry_run.readOnly -eq $true) 'control_events dry-run must be read-only.'
    Assert-True ($result.control_events_dry_run.dryRun -eq $true) 'control_events dry-run flag missing.'
    Assert-True ($result.control_events_dry_run.mutationApplied -eq $false) 'control_events dry-run must not mutate RemNote.'
    Assert-True ($result.control_events_dry_run.plannedCall.method -eq 'addListener') 'control_events dry-run planned method mismatch.'

    $result.control_events_unconfirmed = Invoke-BridgeAction -Action 'control_events' -Payload @{
        operation = 'addListener'
        eventId = 'global.url-change'
        listenerKey = "ag-unconfirmed-$suffix"
    }
    Assert-True ($result.control_events_unconfirmed.requiresConfirmation -eq $true) 'control_events unconfirmed should require confirmation.'
    Assert-True ($result.control_events_unconfirmed.mutationApplied -eq $false) 'control_events unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_events_unconfirmed.confirmationText -eq 'CONTROL_EVENTS') 'control_events confirmation text mismatch.'
    Assert-True ($result.control_events_unconfirmed.pluginVersion -eq '2.58.0') 'control_events unconfirmed pluginVersion mismatch.'

    $eventListenerKey = "ag-smoke-$suffix"
    $result.control_events_add = Invoke-BridgeAction -Action 'control_events' -Payload @{
        operation = 'addListener'
        eventId = 'global.url-change'
        listenerKey = $eventListenerKey
        confirm = 'CONTROL_EVENTS'
    }
    Assert-True ($result.control_events_add.success -eq $true) 'control_events confirmed add failed.'
    Assert-True ($result.control_events_add.mutationApplied -eq $true) 'control_events confirmed add did not mutate listener registry.'
    Assert-True ($result.control_events_add.listenerKey -eq $eventListenerKey) 'control_events add listenerKey mismatch.'

    $result.control_events_remove = Invoke-BridgeAction -Action 'control_events' -Payload @{
        operation = 'removeListener'
        eventId = 'global.url-change'
        listenerKey = $eventListenerKey
        confirm = 'CONTROL_EVENTS'
    }
    Assert-True ($result.control_events_remove.success -eq $true) 'control_events confirmed remove failed.'
    Assert-True ($result.control_events_remove.mutationApplied -eq $true) 'control_events confirmed remove did not mutate listener registry.'
    Assert-True ($result.control_events_remove.removedTracked -eq $true) 'control_events remove did not remove tracked listener.'

    $result.control_reader_status = Invoke-BridgeAction -Action 'control_reader' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_reader_status.success -eq $true) 'control_reader status failed.'
    Assert-True ($result.control_reader_status.readOnly -eq $true) 'control_reader status must be read-only.'
    Assert-True ($result.control_reader_status.mutationApplied -eq $false) 'control_reader status must not mutate RemNote.'
    Assert-True ($result.control_reader_status.pluginVersion -eq '2.58.0') 'control_reader status pluginVersion mismatch.'

    $result.control_reader_dry_run = Invoke-BridgeAction -Action 'control_reader' -Payload @{
        operation = 'addHighlight'
        dryRun = $true
    }
    Assert-True ($result.control_reader_dry_run.readOnly -eq $true) 'control_reader dry-run must be read-only.'
    Assert-True ($result.control_reader_dry_run.dryRun -eq $true) 'control_reader dry-run flag missing.'
    Assert-True ($result.control_reader_dry_run.mutationApplied -eq $false) 'control_reader dry-run must not mutate RemNote.'
    Assert-True ($result.control_reader_dry_run.plannedCall.method -eq 'addHighlight') 'control_reader dry-run planned method mismatch.'

    $result.control_reader_unconfirmed = Invoke-BridgeAction -Action 'control_reader' -Payload @{
        operation = 'addHighlight'
    }
    Assert-True ($result.control_reader_unconfirmed.requiresConfirmation -eq $true) 'control_reader unconfirmed should require confirmation.'
    Assert-True ($result.control_reader_unconfirmed.mutationApplied -eq $false) 'control_reader unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_reader_unconfirmed.confirmationText -eq 'CONTROL_READER') 'control_reader confirmation text mismatch.'

    $schedulerParameters = @(
        @{
            type = 'number'
            id = 'retention'
            title = 'Retention'
            defaultValue = 0.9
        },
        @{
            type = 'dropdown'
            id = 'mode'
            title = 'Mode'
            defaultValue = 'balanced'
            options = @(
                @{ key = 'balanced'; label = 'Balanced'; value = 'balanced' },
                @{ key = 'intense'; label = 'Intense'; value = 'intense' }
            )
        }
    )
    $result.control_scheduler_status = Invoke-BridgeAction -Action 'control_scheduler' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_scheduler_status.success -eq $true) 'control_scheduler status failed.'
    Assert-True ($result.control_scheduler_status.readOnly -eq $true) 'control_scheduler status must be read-only.'
    Assert-True ($result.control_scheduler_status.mutationApplied -eq $false) 'control_scheduler status must not mutate RemNote.'
    Assert-True ($result.control_scheduler_status.pluginVersion -eq '2.58.0') 'control_scheduler status pluginVersion mismatch.'

    $result.control_scheduler_dry_run = Invoke-BridgeAction -Action 'control_scheduler' -Payload @{
        operation = 'registerCustomScheduler'
        name = "ag-dry-run-scheduler-$suffix"
        parameters = $schedulerParameters
        dryRun = $true
    }
    Assert-True ($result.control_scheduler_dry_run.readOnly -eq $true) 'control_scheduler dry-run must be read-only.'
    Assert-True ($result.control_scheduler_dry_run.dryRun -eq $true) 'control_scheduler dry-run flag missing.'
    Assert-True ($result.control_scheduler_dry_run.mutationApplied -eq $false) 'control_scheduler dry-run must not mutate RemNote.'
    Assert-True ($result.control_scheduler_dry_run.plannedCall.method -eq 'registerCustomScheduler') 'control_scheduler dry-run planned method mismatch.'
    Assert-True ($result.control_scheduler_dry_run.plannedCall.parameterCount -eq 2) 'control_scheduler dry-run parameter count mismatch.'

    $result.control_scheduler_unconfirmed = Invoke-BridgeAction -Action 'control_scheduler' -Payload @{
        operation = 'registerCustomScheduler'
        name = "ag-unconfirmed-scheduler-$suffix"
        parameters = $schedulerParameters
    }
    Assert-True ($result.control_scheduler_unconfirmed.requiresConfirmation -eq $true) 'control_scheduler unconfirmed should require confirmation.'
    Assert-True ($result.control_scheduler_unconfirmed.mutationApplied -eq $false) 'control_scheduler unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_scheduler_unconfirmed.confirmationText -eq 'CONTROL_SCHEDULER') 'control_scheduler confirmation text mismatch.'

    $result.inspect_editor_context = Invoke-BridgeAction -Action 'inspect_editor_context'
    Assert-True ($result.inspect_editor_context.readOnly -eq $true) 'inspect_editor_context must be read-only.'
    Assert-True ($result.inspect_editor_context.mutationApplied -eq $false) 'inspect_editor_context must not mutate RemNote.'
    Assert-True ($result.inspect_editor_context.pluginVersion -eq '2.58.0') 'inspect_editor_context pluginVersion mismatch.'
    Assert-True ($null -ne $result.inspect_editor_context.fields.selection) 'inspect_editor_context missing selection field.'

    $result.control_editor_status = Invoke-BridgeAction -Action 'control_editor' -Payload @{
        operation = 'status'
    }
    Assert-True ($result.control_editor_status.success -eq $true) 'control_editor status failed.'
    Assert-True ($result.control_editor_status.readOnly -eq $true) 'control_editor status must be read-only.'
    Assert-True ($result.control_editor_status.mutationApplied -eq $false) 'control_editor status must not mutate RemNote.'
    Assert-True ($result.control_editor_status.pluginVersion -eq '2.58.0') 'control_editor status pluginVersion mismatch.'

    $result.control_editor_dry_run = Invoke-BridgeAction -Action 'control_editor' -Payload @{
        operation = 'insertPlainText'
        text = "dry-run-$suffix"
        dryRun = $true
    }
    Assert-True ($result.control_editor_dry_run.readOnly -eq $true) 'control_editor dry-run must be read-only.'
    Assert-True ($result.control_editor_dry_run.dryRun -eq $true) 'control_editor dry-run flag missing.'
    Assert-True ($result.control_editor_dry_run.mutationApplied -eq $false) 'control_editor dry-run must not mutate RemNote.'
    Assert-True ($result.control_editor_dry_run.plannedCall.method -eq 'insertPlainText') 'control_editor dry-run planned method mismatch.'

    $result.control_editor_unconfirmed = Invoke-BridgeAction -Action 'control_editor' -Payload @{
        operation = 'insertPlainText'
        text = "unconfirmed-$suffix"
    }
    Assert-True ($result.control_editor_unconfirmed.requiresConfirmation -eq $true) 'control_editor unconfirmed should require confirmation.'
    Assert-True ($result.control_editor_unconfirmed.mutationApplied -eq $false) 'control_editor unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_editor_unconfirmed.confirmationText -eq 'CONTROL_EDITOR') 'control_editor confirmation text mismatch.'
    Assert-True ($result.control_editor_unconfirmed.pluginVersion -eq '2.58.0') 'control_editor unconfirmed pluginVersion mismatch.'

    $result.inspect_queue_context = Invoke-BridgeAction -Action 'inspect_queue_context' -Payload @{
        includeCurrentCard = $true
    }
    Assert-True ($result.inspect_queue_context.readOnly -eq $true) 'inspect_queue_context must be read-only.'
    Assert-True ($result.inspect_queue_context.mutationApplied -eq $false) 'inspect_queue_context must not mutate RemNote.'
    Assert-True ($result.inspect_queue_context.pluginVersion -eq '2.58.0') 'inspect_queue_context pluginVersion mismatch.'
    Assert-True ($null -ne $result.inspect_queue_context.fields.currentQueueScreenType) 'inspect_queue_context missing currentQueueScreenType field.'

    $result.control_practice_queue_status = Invoke-BridgeAction -Action 'control_practice_queue' -Payload @{
        operation = 'status'
        includeCurrentCard = $true
    }
    Assert-True ($result.control_practice_queue_status.success -eq $true) 'control_practice_queue status failed.'
    Assert-True ($result.control_practice_queue_status.readOnly -eq $true) 'control_practice_queue status must be read-only.'
    Assert-True ($result.control_practice_queue_status.mutationApplied -eq $false) 'control_practice_queue status must not mutate RemNote.'
    Assert-True ($result.control_practice_queue_status.pluginVersion -eq '2.58.0') 'control_practice_queue status pluginVersion mismatch.'

    $result.control_practice_queue_unconfirmed = Invoke-BridgeAction -Action 'control_practice_queue' -Payload @{
        operation = 'showAnswer'
    }
    Assert-True ($result.control_practice_queue_unconfirmed.requiresConfirmation -eq $true) 'control_practice_queue unconfirmed should require confirmation.'
    Assert-True ($result.control_practice_queue_unconfirmed.mutationApplied -eq $false) 'control_practice_queue unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_practice_queue_unconfirmed.confirmationText -eq 'CONTROL_PRACTICE_QUEUE') 'control_practice_queue confirmation text mismatch.'
    Assert-True ($result.control_practice_queue_unconfirmed.pluginVersion -eq '2.58.0') 'control_practice_queue unconfirmed pluginVersion mismatch.'

    $result.inspect_plugin_runtime = Invoke-BridgeAction -Action 'inspect_plugin_runtime' -Payload @{
        valueDepth = 4
    }
    Assert-True ($result.inspect_plugin_runtime.readOnly -eq $true) 'inspect_plugin_runtime must be read-only.'
    Assert-True ($result.inspect_plugin_runtime.mutationApplied -eq $false) 'inspect_plugin_runtime must not mutate RemNote.'
    Assert-True ($result.inspect_plugin_runtime.pluginVersion -eq '2.58.0') 'inspect_plugin_runtime pluginVersion mismatch.'
    Assert-True ($null -ne $result.inspect_plugin_runtime.fields.currentSettings) 'inspect_plugin_runtime missing currentSettings.'
    Assert-True ($null -ne $result.inspect_plugin_runtime.fields.settings.'mcp-ws-url') 'inspect_plugin_runtime missing mcp-ws-url setting.'
    Assert-True ($null -ne $result.inspect_plugin_runtime.fields.storage.'mcp-runtime-status') 'inspect_plugin_runtime missing runtime storage.'
    Assert-True ($null -ne $result.inspect_plugin_runtime.fields.knowledgeBase.current) 'inspect_plugin_runtime missing knowledge base current field.'

    $result.inspect_focus_context = Invoke-BridgeAction -Action 'inspect_focus_context'
    Assert-True ($result.inspect_focus_context.readOnly -eq $true) 'inspect_focus_context must be read-only.'
    Assert-True ($result.inspect_focus_context.mutationApplied -eq $false) 'inspect_focus_context must not mutate RemNote.'
    Assert-True ($result.inspect_focus_context.pluginVersion -eq '2.58.0') 'inspect_focus_context pluginVersion mismatch.'
    Assert-True ($null -ne $result.inspect_focus_context.fields.focusedRem) 'inspect_focus_context missing focusedRem field.'

    $result.sdk_namespace_call_storage = Invoke-BridgeAction -Action 'sdk_namespace_call' -Payload @{
        namespace = 'storage'
        method = 'getSynced'
        args = @('mcp-runtime-status')
    }
    Assert-True ($result.sdk_namespace_call_storage.readOnly -eq $true) 'sdk_namespace_call storage must be read-only.'
    Assert-True ($result.sdk_namespace_call_storage.ok -eq $true) 'sdk_namespace_call storage getSynced failed.'

    $result.sdk_namespace_call_setting = Invoke-BridgeAction -Action 'sdk_namespace_call' -Payload @{
        namespace = 'settings'
        method = 'getSetting'
        args = @('mcp-ws-url')
    }
    Assert-True ($result.sdk_namespace_call_setting.readOnly -eq $true) 'sdk_namespace_call settings must be read-only.'
    Assert-True ($result.sdk_namespace_call_setting.ok -eq $true) 'sdk_namespace_call settings getSetting failed.'

    $result.sdk_namespace_call_kb = Invoke-BridgeAction -Action 'sdk_namespace_call' -Payload @{
        namespace = 'kb'
        method = 'getCurrentKnowledgeBaseData'
    }
    Assert-True ($result.sdk_namespace_call_kb.readOnly -eq $true) 'sdk_namespace_call kb must be read-only.'
    Assert-True ($null -ne $result.sdk_namespace_call_kb.ok) 'sdk_namespace_call kb getCurrentKnowledgeBaseData missing ok/error state.'

    $result.sdk_namespace_call_powerup = Invoke-BridgeAction -Action 'sdk_namespace_call' -Payload @{
        namespace = 'powerup'
        method = 'getPowerupByCode'
        args = @('o')
    }
    Assert-True ($result.sdk_namespace_call_powerup.readOnly -eq $true) 'sdk_namespace_call powerup must be read-only.'
    Assert-True ($result.sdk_namespace_call_powerup.mutationApplied -eq $false) 'sdk_namespace_call powerup must not mutate RemNote.'
    Assert-True ($result.sdk_namespace_call_powerup.ok -eq $true) 'sdk_namespace_call powerup getPowerupByCode failed.'

    $result.rich_text_parse_markdown = Invoke-BridgeAction -Action 'rich_text_parse_markdown' -Payload @{
        markdown = '**bold** [site](https://example.com)'
        includeMarkdown = $true
        includeString = $true
    }
    Assert-True ($result.rich_text_parse_markdown.readOnly -eq $true) 'rich_text_parse_markdown must be read-only.'
    Assert-True ($result.rich_text_parse_markdown.mutationApplied -eq $false) 'rich_text_parse_markdown must not mutate RemNote.'
    Assert-True ($result.rich_text_parse_markdown.pluginVersion -eq '2.58.0') 'rich_text_parse_markdown pluginVersion mismatch.'
    Assert-True ($result.rich_text_parse_markdown.length.ok -eq $true) 'rich_text_parse_markdown length failed.'
    Assert-True ($result.rich_text_parse_markdown.plainText.ok -eq $true) 'rich_text_parse_markdown plainText failed.'

    $result.rich_text_format_range = Invoke-BridgeAction -Action 'rich_text_format_range' -Payload @{
        text = 'format me'
        start = 0
        end = 6
        format = 'bold'
        mode = 'apply'
        includeMarkdown = $true
    }
    Assert-True ($result.rich_text_format_range.readOnly -eq $true) 'rich_text_format_range must be read-only.'
    Assert-True ($result.rich_text_format_range.mutationApplied -eq $false) 'rich_text_format_range must not mutate RemNote.'
    Assert-True ($result.rich_text_format_range.pluginVersion -eq '2.58.0') 'rich_text_format_range pluginVersion mismatch.'
    Assert-True ($result.rich_text_format_range.operation.format -eq 'bold') 'rich_text_format_range operation format mismatch.'
    Assert-True ($result.rich_text_format_range.plainText.ok -eq $true) 'rich_text_format_range plainText failed.'

    $result.rich_text_inspect = Invoke-BridgeAction -Action 'rich_text_inspect' -Payload @{
        markdown = 'See [RemNote](https://www.remnote.com)'
        character = 'R'
        start = 0
        end = 3
        includeMarkdown = $true
        includeReferences = $true
    }
    Assert-True ($result.rich_text_inspect.readOnly -eq $true) 'rich_text_inspect must be read-only.'
    Assert-True ($result.rich_text_inspect.mutationApplied -eq $false) 'rich_text_inspect must not mutate RemNote.'
    Assert-True ($result.rich_text_inspect.pluginVersion -eq '2.58.0') 'rich_text_inspect pluginVersion mismatch.'
    Assert-True ($result.rich_text_inspect.length.ok -eq $true) 'rich_text_inspect length failed.'
    Assert-True ($result.rich_text_inspect.fields.indexOf.ok -eq $true) 'rich_text_inspect indexOf failed.'

    $result.host_remnote_sdk_surface_gap_report = Invoke-BridgeAction -Action 'host_remnote_sdk_surface_gap_report' -Payload @{
        maxPotentialGaps = 20
    }
    Assert-True ($result.host_remnote_sdk_surface_gap_report.readOnly -eq $true) 'host_remnote_sdk_surface_gap_report must be read-only.'
    Assert-True ($result.host_remnote_sdk_surface_gap_report.mutationApplied -eq $false) 'host_remnote_sdk_surface_gap_report must not mutate RemNote.'
    Assert-True ($result.host_remnote_sdk_surface_gap_report.pluginVersion -eq '2.58.0') 'host_remnote_sdk_surface_gap_report pluginVersion mismatch.'
    Assert-True ($result.host_remnote_sdk_surface_gap_report.sdkPackage.version -eq '0.0.46') 'host_remnote_sdk_surface_gap_report SDK version mismatch.'
    Assert-True ($result.host_remnote_sdk_surface_gap_report.summary.sdkMethodCount -gt 0) 'host_remnote_sdk_surface_gap_report found no SDK methods.'
    Assert-True ($result.host_remnote_sdk_surface_gap_report.summary.allowlistMissingFromSdkCount -eq 0) 'host_remnote_sdk_surface_gap_report found allowlisted methods missing from SDK.'
    Assert-True ($result.host_remnote_sdk_surface_gap_report.actionCoverage.summary.uncoveredCount -eq 0) 'host_remnote_sdk_surface_gap_report coverage has uncovered actions.'
    $appNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'AppNamespace' } | Select-Object -First 1)
    Assert-True ($appNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has AppNamespace review gaps.'
    $dateNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'DateNamespace' } | Select-Object -First 1)
    Assert-True ($dateNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has DateNamespace review gaps.'
    $windowNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'WindowNamespace' } | Select-Object -First 1)
    Assert-True ($windowNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has WindowNamespace review gaps.'
    $storageNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'StorageNamespace' } | Select-Object -First 1)
    Assert-True ($storageNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has StorageNamespace review gaps.'
    $settingsNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'SettingsNamespace' } | Select-Object -First 1)
    Assert-True ($settingsNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has SettingsNamespace review gaps.'
    $widgetNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'WidgetNamespace' } | Select-Object -First 1)
    Assert-True ($widgetNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has WidgetNamespace review gaps.'
    $messagingNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'MessagingNamespace' } | Select-Object -First 1)
    Assert-True ($messagingNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has MessagingNamespace review gaps.'
    $richTextNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'RichTextNamespace' } | Select-Object -First 1)
    Assert-True ($richTextNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has RichTextNamespace review gaps.'
    $readerNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'ReaderNamespace' } | Select-Object -First 1)
    Assert-True ($readerNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has ReaderNamespace review gaps.'
    $schedulerNamespaceGap = @($result.host_remnote_sdk_surface_gap_report.methodsByClass | Where-Object { $_.className -eq 'SchedulerNamespace' } | Select-Object -First 1)
    Assert-True ($schedulerNamespaceGap.needsReview -eq 0) 'host_remnote_sdk_surface_gap_report still has SchedulerNamespace review gaps.'

    $result.debug_window_context = Invoke-BridgeAction -Action 'debug_window_context'

    $result.path = Invoke-BridgeAction -Action 'find_or_create_path' -Payload @{
        pathSegments = @('Personal Intelligence OS', 'Smoke Tests', $rootTitle)
        asFolders = $true
    }
    $cleanupRemIds.Add([string]$result.path.remId) | Out-Null

    $result.get_daily_doc = Invoke-BridgeAction -Action 'get_daily_doc'
    Assert-True ($null -ne $result.get_daily_doc.remId) 'get_daily_doc did not return a daily document id.'

    $result.append_journal = Invoke-BridgeAction -Action 'append_journal' -Payload @{
        content = "AG append journal smoke $suffix"
        timestamp = $false
    }
    $cleanupRemIds.Add([string]$result.append_journal.remId) | Out-Null
    Assert-True ($result.append_journal.content -like "*AG append journal smoke $suffix*") 'append_journal content mismatch.'

    $result.note = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = "create-note-$suffix"
        content = 'Ilk icerik'
        parentId = $result.path.remId
        tags = @('smoke-test')
        isDocument = $true
    }
    $cleanupRemIds.Add([string]$result.note.remId) | Out-Null

    $result.search = Invoke-BridgeAction -Action 'search' -Payload @{
        query = "create-note-$suffix"
        limit = 5
        includeContent = $true
    }
    Assert-True (@($result.search.results).Count -ge 1) 'Search did not find created note.'

    $result.read = Invoke-BridgeAction -Action 'read_note' -Payload @{
        remId = $result.note.remId
        depth = 2
    }
    Assert-True ($result.read.title -like "*create-note-$suffix*") 'Read note title mismatch.'
    Assert-True ($result.read.createdAt -is [long] -or $result.read.createdAt -is [int] -or $result.read.createdAt -is [double]) 'Read note createdAt metadata is missing.'

    $result.inspect_rem_object_state = Invoke-BridgeAction -Action 'inspect_rem_object_state' -Payload @{
        remId = $result.note.remId
        includePowerups = $true
        powerupCodes = @('o', 'r', 'm')
        valueDepth = 4
    }
    Assert-True ($result.inspect_rem_object_state.readOnly -eq $true) 'inspect_rem_object_state must be read-only.'
    Assert-True ($result.inspect_rem_object_state.mutationApplied -eq $false) 'inspect_rem_object_state must not mutate RemNote.'
    Assert-True ($result.inspect_rem_object_state.fields.flags.isDocument.ok -eq $true) 'inspect_rem_object_state missing isDocument flag.'
    Assert-True ($result.inspect_rem_object_state.fields.position.positionAmongstSiblings.ok -eq $true) 'inspect_rem_object_state missing sibling position.'

    $result.control_rem_object_state_status = Invoke-BridgeAction -Action 'control_rem_object_state' -Payload @{
        remId = $result.note.remId
        operation = 'status'
    }
    Assert-True ($result.control_rem_object_state_status.success -eq $true) 'control_rem_object_state status failed.'
    Assert-True ($result.control_rem_object_state_status.readOnly -eq $true) 'control_rem_object_state status must be read-only.'
    Assert-True ($result.control_rem_object_state_status.mutationApplied -eq $false) 'control_rem_object_state status must not mutate RemNote.'

    $result.control_rem_object_state_dry_run = Invoke-BridgeAction -Action 'control_rem_object_state' -Payload @{
        remId = $result.note.remId
        operation = 'setTodo'
        value = $true
        dryRun = $true
    }
    Assert-True ($result.control_rem_object_state_dry_run.readOnly -eq $true) 'control_rem_object_state dry-run must be read-only.'
    Assert-True ($result.control_rem_object_state_dry_run.mutationApplied -eq $false) 'control_rem_object_state dry-run must not mutate RemNote.'
    Assert-True ($result.control_rem_object_state_dry_run.plannedCall.method -eq 'setIsTodo') 'control_rem_object_state dry-run planned method mismatch.'

    $result.control_rem_object_state_unconfirmed = Invoke-BridgeAction -Action 'control_rem_object_state' -Payload @{
        remId = $result.note.remId
        operation = 'setTodo'
        value = $true
    }
    Assert-True ($result.control_rem_object_state_unconfirmed.requiresConfirmation -eq $true) 'control_rem_object_state unconfirmed should require confirmation.'
    Assert-True ($result.control_rem_object_state_unconfirmed.confirmationText -eq 'CONTROL_REM_OBJECT_STATE') 'control_rem_object_state confirmation text mismatch.'
    Assert-True ($result.control_rem_object_state_unconfirmed.mutationApplied -eq $false) 'control_rem_object_state unconfirmed must not mutate RemNote.'

    $result.control_rem_object_state_apply = Invoke-BridgeAction -Action 'control_rem_object_state' -Payload @{
        remId = $result.note.remId
        operation = 'setTodo'
        value = $true
        confirm = 'CONTROL_REM_OBJECT_STATE'
    }
    Assert-True ($result.control_rem_object_state_apply.success -eq $true) 'control_rem_object_state confirmed apply failed.'
    Assert-True ($result.control_rem_object_state_apply.mutationApplied -eq $true) 'control_rem_object_state confirmed apply did not report mutation.'
    Assert-True ($result.control_rem_object_state_apply.plannedCall.method -eq 'setIsTodo') 'control_rem_object_state confirmed planned method mismatch.'
    Assert-True ($result.control_rem_object_state_apply.after.fields.flags.isTodo.value -eq $true) 'control_rem_object_state confirmed setTodo did not update inspect snapshot.'

    $result.inspect_rem_graph_context = Invoke-BridgeAction -Action 'inspect_rem_graph_context' -Payload @{
        remId = $result.note.remId
        includeDeepReferences = $true
        includeContainers = $true
        limit = 5
        valueDepth = 4
    }
    Assert-True ($result.inspect_rem_graph_context.readOnly -eq $true) 'inspect_rem_graph_context must be read-only.'
    Assert-True ($result.inspect_rem_graph_context.mutationApplied -eq $false) 'inspect_rem_graph_context must not mutate RemNote.'
    Assert-True ($result.inspect_rem_graph_context.pluginVersion -eq '2.58.0') 'inspect_rem_graph_context pluginVersion mismatch.'
    Assert-True ($null -ne $result.inspect_rem_graph_context.fields.location.children) 'inspect_rem_graph_context missing children context.'
    Assert-True ($null -ne $result.inspect_rem_graph_context.fields.siblings.siblingRem) 'inspect_rem_graph_context missing siblingRem context.'
    Assert-True ($null -ne $result.inspect_rem_graph_context.fields.tagContext.ancestorTagRem) 'inspect_rem_graph_context missing ancestor tag context.'
    Assert-True ($null -ne $result.inspect_rem_graph_context.fields.references.deepRemsBeingReferenced) 'inspect_rem_graph_context missing deep reference context.'

    $result.control_rem_structure_status = Invoke-BridgeAction -Action 'control_rem_structure' -Payload @{
        remId = $result.note.remId
        operation = 'status'
    }
    Assert-True ($result.control_rem_structure_status.success -eq $true) 'control_rem_structure status failed.'
    Assert-True ($result.control_rem_structure_status.readOnly -eq $true) 'control_rem_structure status must be read-only.'
    Assert-True ($result.control_rem_structure_status.mutationApplied -eq $false) 'control_rem_structure status must not mutate RemNote.'
    Assert-True ($result.control_rem_structure_status.pluginVersion -eq '2.58.0') 'control_rem_structure status pluginVersion mismatch.'

    $result.control_rem_structure_dry_run = Invoke-BridgeAction -Action 'control_rem_structure' -Payload @{
        remId = $result.note.remId
        operation = 'setType'
        remType = 'CONCEPT'
        dryRun = $true
    }
    Assert-True ($result.control_rem_structure_dry_run.readOnly -eq $true) 'control_rem_structure dry-run must be read-only.'
    Assert-True ($result.control_rem_structure_dry_run.dryRun -eq $true) 'control_rem_structure dry-run flag missing.'
    Assert-True ($result.control_rem_structure_dry_run.mutationApplied -eq $false) 'control_rem_structure dry-run must not mutate RemNote.'
    Assert-True ($result.control_rem_structure_dry_run.plannedCall.method -eq 'setType') 'control_rem_structure dry-run planned method mismatch.'

    $result.control_rem_structure_unconfirmed = Invoke-BridgeAction -Action 'control_rem_structure' -Payload @{
        remId = $result.note.remId
        operation = 'indent'
    }
    Assert-True ($result.control_rem_structure_unconfirmed.requiresConfirmation -eq $true) 'control_rem_structure unconfirmed should require confirmation.'
    Assert-True ($result.control_rem_structure_unconfirmed.confirmationText -eq 'CONTROL_REM_STRUCTURE') 'control_rem_structure confirmation text mismatch.'
    Assert-True ($result.control_rem_structure_unconfirmed.mutationApplied -eq $false) 'control_rem_structure unconfirmed must not mutate RemNote.'

    $result.control_rem_structure_destructive_block = Invoke-BridgeAction -Action 'control_rem_structure' -Payload @{
        remId = $result.note.remId
        operation = 'merge'
        targetRemId = $result.path.remId
        confirm = 'CONTROL_REM_STRUCTURE'
    }
    Assert-True ($result.control_rem_structure_destructive_block.requiresConfirmation -eq $true) 'control_rem_structure destructive merge should require extra confirmation.'
    Assert-True ($result.control_rem_structure_destructive_block.destructiveConfirmationText -eq 'MERGE_REM') 'control_rem_structure destructive confirmation text mismatch.'
    Assert-True ($result.control_rem_structure_destructive_block.mutationApplied -eq $false) 'control_rem_structure destructive block must not mutate RemNote.'

    $htmlImport = "<ul><li>html import smoke $suffix</li><li><strong>bold child</strong></li></ul>"
    $result.rich_text_insert_html_dry_run = Invoke-BridgeAction -Action 'rich_text_insert_html' -Payload @{
        remId = $result.note.remId
        html = $htmlImport
        dryRun = $true
    }
    Assert-True ($result.rich_text_insert_html_dry_run.readOnly -eq $true) 'rich_text_insert_html dry-run must be read-only.'
    Assert-True ($result.rich_text_insert_html_dry_run.dryRun -eq $true) 'rich_text_insert_html dry-run flag missing.'
    Assert-True ($result.rich_text_insert_html_dry_run.mutationApplied -eq $false) 'rich_text_insert_html dry-run must not mutate RemNote.'
    Assert-True ($result.rich_text_insert_html_dry_run.plannedCall.method -eq 'parseAndInsertHtml') 'rich_text_insert_html dry-run planned method mismatch.'
    Assert-True ($result.rich_text_insert_html_dry_run.safety.ok -eq $true) 'rich_text_insert_html dry-run safety failed.'

    $result.rich_text_insert_html_unconfirmed = Invoke-BridgeAction -Action 'rich_text_insert_html' -Payload @{
        remId = $result.note.remId
        html = $htmlImport
    }
    Assert-True ($result.rich_text_insert_html_unconfirmed.requiresConfirmation -eq $true) 'rich_text_insert_html unconfirmed should require confirmation.'
    Assert-True ($result.rich_text_insert_html_unconfirmed.confirmationText -eq 'IMPORT_HTML_TO_REM') 'rich_text_insert_html confirmation text mismatch.'
    Assert-True ($result.rich_text_insert_html_unconfirmed.mutationApplied -eq $false) 'rich_text_insert_html unconfirmed must not mutate RemNote.'

    $result.rich_text_insert_html_unsafe = Invoke-BridgeAction -Action 'rich_text_insert_html' -Payload @{
        remId = $result.note.remId
        html = '<script>alert("blocked")</script>'
        confirm = 'IMPORT_HTML_TO_REM'
    }
    Assert-True ($result.rich_text_insert_html_unsafe.error -eq 'unsafe_html_blocked') 'rich_text_insert_html unsafe HTML was not blocked.'
    Assert-True ($result.rich_text_insert_html_unsafe.readOnly -eq $true) 'rich_text_insert_html unsafe block must be read-only.'
    Assert-True ($result.rich_text_insert_html_unsafe.mutationApplied -eq $false) 'rich_text_insert_html unsafe block must not mutate RemNote.'

    $result.rich_text_insert_html = Invoke-BridgeAction -Action 'rich_text_insert_html' -Payload @{
        remId = $result.note.remId
        html = $htmlImport
        confirm = 'IMPORT_HTML_TO_REM'
    }
    Assert-True ($result.rich_text_insert_html.success -eq $true) 'rich_text_insert_html confirmed import failed.'
    Assert-True ($result.rich_text_insert_html.mutationApplied -eq $true) 'rich_text_insert_html confirmed import did not report mutation.'
    Assert-True ($result.rich_text_insert_html.readOnly -eq $false) 'rich_text_insert_html confirmed import should not be read-only.'
    Assert-True ($result.rich_text_insert_html.plannedCall.method -eq 'parseAndInsertHtml') 'rich_text_insert_html confirmed planned method mismatch.'
    Assert-True ($null -ne $result.rich_text_insert_html.after) 'rich_text_insert_html confirmed import missing after snapshot.'

    $linkUrl = "https://example.com/remnote-mcp-smoke/$suffix"
    $result.create_link_rem_dry_run = Invoke-BridgeAction -Action 'create_link_rem' -Payload @{
        url = $linkUrl
        parentId = $result.path.remId
        dryRun = $true
    }
    Assert-True ($result.create_link_rem_dry_run.readOnly -eq $true) 'create_link_rem dry-run must be read-only.'
    Assert-True ($result.create_link_rem_dry_run.dryRun -eq $true) 'create_link_rem dry-run flag missing.'
    Assert-True ($result.create_link_rem_dry_run.mutationApplied -eq $false) 'create_link_rem dry-run must not mutate RemNote.'
    Assert-True ($result.create_link_rem_dry_run.plannedCall.method -eq 'createLinkRem') 'create_link_rem dry-run planned method mismatch.'

    $result.create_link_rem_unconfirmed = Invoke-BridgeAction -Action 'create_link_rem' -Payload @{
        url = $linkUrl
        parentId = $result.path.remId
    }
    Assert-True ($result.create_link_rem_unconfirmed.requiresConfirmation -eq $true) 'create_link_rem unconfirmed should require confirmation.'
    Assert-True ($result.create_link_rem_unconfirmed.confirmationText -eq 'CREATE_LINK_REM') 'create_link_rem unconfirmed confirmation text mismatch.'
    Assert-True ($result.create_link_rem_unconfirmed.mutationApplied -eq $false) 'create_link_rem unconfirmed must not mutate RemNote.'

    $result.create_link_rem = Invoke-BridgeAction -Action 'create_link_rem' -Payload @{
        url = $linkUrl
        parentId = $result.path.remId
        confirm = 'CREATE_LINK_REM'
    }
    $cleanupRemIds.Add([string]$result.create_link_rem.remId) | Out-Null
    Assert-True ($result.create_link_rem.success -eq $true) 'create_link_rem failed.'
    Assert-True ($result.create_link_rem.mutationApplied -eq $true) 'create_link_rem did not report mutation.'
    Assert-True ($result.create_link_rem.parentId -eq $result.path.remId) 'create_link_rem parent mismatch.'
    Assert-True ($result.create_link_rem.plannedCall.method -eq 'createLinkRem') 'create_link_rem planned method mismatch.'

    $result.get_all_rems = Invoke-BridgeAction -Action 'get_all_rems' -Payload @{
        query = "create-note-$suffix"
        limit = 10
        sortBy = 'title'
        direction = 'asc'
        includeTypeFlags = $true
    }
    Assert-True ($result.get_all_rems.totalMatched -ge 1) 'get_all_rems did not find the smoke note.'

    $result.export_vault_snapshot = Invoke-BridgeAction -Action 'export_vault_snapshot' -Payload @{
        limit = 50
        offset = 0
        sortBy = 'createdAt'
        direction = 'desc'
        includeRawText = $true
        includeBackText = $false
        includeTypeFlags = $true
        includePowerups = $true
        includeRelations = $true
        relationMode = 'summaries'
        maxRelationSummaries = 3
        includeProperties = $false
        includePracticeData = $true
        includeCards = $false
    }
    Assert-True ($result.export_vault_snapshot.readOnly -eq $true) 'export_vault_snapshot is not read-only.'
    Assert-True ($result.export_vault_snapshot.mutationApplied -eq $false) 'export_vault_snapshot reported mutation.'
    Assert-True ($result.export_vault_snapshot.mode -eq 'vault_snapshot') 'export_vault_snapshot mode mismatch.'
    Assert-True ($result.export_vault_snapshot.returned -gt 0) 'export_vault_snapshot returned no rows.'
    Assert-True ($result.export_vault_snapshot.totalAccessible -ge $result.export_vault_snapshot.returned) 'export_vault_snapshot count mismatch.'
    $vaultSmokeRows = @($result.export_vault_snapshot.rows | Where-Object { $_.remId -eq $result.note.remId })
    Assert-True ($vaultSmokeRows.Count -ge 1) 'export_vault_snapshot did not include the recent smoke note.'
    Assert-True ($null -ne $vaultSmokeRows[0].rawText) 'export_vault_snapshot rawText missing for smoke note.'
    Assert-True ($null -ne $vaultSmokeRows[0].relations) 'export_vault_snapshot relations missing for smoke note.'
    Assert-True ($null -ne $vaultSmokeRows[0].practice) 'export_vault_snapshot practice block missing for smoke note.'

    $result.host_remnote_vault_snapshot_export = Invoke-BridgeAction -Action 'host_remnote_vault_snapshot_export' -Payload @{
        exportId = "smoke-vault-$suffix"
        maxRows = 50
        pageLimit = 25
        sortBy = 'createdAt'
        direction = 'desc'
        includeRawText = $false
        includeBackText = $false
        includeTypeFlags = $true
        includePowerups = $false
        includeRelations = $false
        includeProperties = $false
        includePracticeData = $false
        includeCards = $false
    }
    Assert-True ($result.host_remnote_vault_snapshot_export.readOnly -eq $true) 'host_remnote_vault_snapshot_export is not read-only.'
    Assert-True ($result.host_remnote_vault_snapshot_export.mutationApplied -eq $false) 'host_remnote_vault_snapshot_export reported mutation.'
    Assert-True ($result.host_remnote_vault_snapshot_export.mode -eq 'host_remnote_vault_snapshot_export') 'host_remnote_vault_snapshot_export mode mismatch.'
    Assert-True ($result.host_remnote_vault_snapshot_export.exportedRows -eq 50) 'host_remnote_vault_snapshot_export exported row count mismatch.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_snapshot_export.rowsPath) 'host_remnote_vault_snapshot_export rows file missing.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_snapshot_export.manifestPath) 'host_remnote_vault_snapshot_export manifest file missing.'
    Assert-True (@(Get-Content -LiteralPath $result.host_remnote_vault_snapshot_export.rowsPath).Count -eq 50) 'host_remnote_vault_snapshot_export rows file line count mismatch.'

    $result.host_remnote_vault_snapshot_export_partitioned = Invoke-BridgeAction -Action 'host_remnote_vault_snapshot_export_partitioned' -Payload @{
        exportId = "smoke-vault-parts-$suffix"
        maxRows = 50
        pageLimit = 10
        partitionRows = 20
        sortBy = 'createdAt'
        direction = 'desc'
        includeRawText = $false
        includeBackText = $false
        includeTypeFlags = $true
        includePowerups = $false
        includeRelations = $false
        includeProperties = $false
        includePracticeData = $false
        includeCards = $false
    }
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.readOnly -eq $true) 'host_remnote_vault_snapshot_export_partitioned is not read-only.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.mutationApplied -eq $false) 'host_remnote_vault_snapshot_export_partitioned reported mutation.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.mode -eq 'host_remnote_vault_snapshot_export_partitioned') 'host_remnote_vault_snapshot_export_partitioned mode mismatch.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.partitioned -eq $true) 'host_remnote_vault_snapshot_export_partitioned is not marked partitioned.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.resumable -eq $true) 'host_remnote_vault_snapshot_export_partitioned is not marked resumable.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.format -eq 'jsonl_parts_v1') 'host_remnote_vault_snapshot_export_partitioned format mismatch.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.exportedRows -eq 50) 'host_remnote_vault_snapshot_export_partitioned exported row count mismatch.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.exportedRowsThisRun -eq 50) 'host_remnote_vault_snapshot_export_partitioned run row count mismatch.'
    Assert-True ($result.host_remnote_vault_snapshot_export_partitioned.partCount -eq 3) 'host_remnote_vault_snapshot_export_partitioned part count mismatch.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_snapshot_export_partitioned.manifestPath) 'host_remnote_vault_snapshot_export_partitioned manifest file missing.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_snapshot_export_partitioned.partsDir) 'host_remnote_vault_snapshot_export_partitioned parts dir missing.'
    $partitionLineCount = 0
    foreach ($part in @($result.host_remnote_vault_snapshot_export_partitioned.partFiles)) {
        Assert-True (Test-Path -LiteralPath $part.path) "partitioned vault part missing: $($part.path)"
        Assert-True ($part.rows -gt 0) 'partitioned vault part has no rows.'
        Assert-True (@(Get-Content -LiteralPath $part.path).Count -eq $part.rows) 'partitioned vault part line count mismatch.'
        $partitionLineCount += [int]$part.rows
    }
    Assert-True ($partitionLineCount -eq 50) 'partitioned vault total part line count mismatch.'

    $result.host_remnote_vault_partition_query = Invoke-BridgeAction -Action 'host_remnote_vault_export_query' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        limit = 3
        includeRows = $true
        fields = @('remId', 'title', 'createdAt')
    }
    Assert-True ($result.host_remnote_vault_partition_query.readOnly -eq $true) 'partitioned vault query is not read-only.'
    Assert-True ($result.host_remnote_vault_partition_query.partitioned -eq $true) 'partitioned vault query did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_partition_query.fileCount -eq 3) 'partitioned vault query did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_query.scanned -eq 50) 'partitioned vault query scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_query.matchedTotal -eq 50) 'partitioned vault query matched count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_query.returned -eq 3) 'partitioned vault query returned row count mismatch.'

    $result.host_remnote_vault_partition_cursor_page1 = Invoke-BridgeAction -Action 'host_remnote_vault_export_query' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        limit = 25
        cursorMode = $true
        includeRows = $true
        fields = @('remId', 'title', 'createdAt')
    }
    Assert-True ($result.host_remnote_vault_partition_cursor_page1.cursorMode -eq $true) 'partitioned cursor page1 did not enable cursor mode.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page1.fileCount -eq 3) 'partitioned cursor page1 did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page1.scanned -eq 25) 'partitioned cursor page1 scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page1.returned -eq 25) 'partitioned cursor page1 returned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page1.stopReason -eq 'limit') 'partitioned cursor page1 stop reason mismatch.'
    Assert-True (-not [string]::IsNullOrWhiteSpace($result.host_remnote_vault_partition_cursor_page1.nextCursor)) 'partitioned cursor page1 missing nextCursor.'

    $result.host_remnote_vault_partition_cursor_page2 = Invoke-BridgeAction -Action 'host_remnote_vault_export_query' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        limit = 25
        cursorMode = $true
        cursor = $result.host_remnote_vault_partition_cursor_page1.nextCursor
        includeRows = $true
        fields = @('remId', 'title', 'createdAt')
    }
    Assert-True ($result.host_remnote_vault_partition_cursor_page2.cursorMode -eq $true) 'partitioned cursor page2 did not enable cursor mode.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page2.fileCount -eq 3) 'partitioned cursor page2 did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page2.scanned -eq 25) 'partitioned cursor page2 scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page2.returned -eq 25) 'partitioned cursor page2 returned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page2.stopReason -eq 'limit') 'partitioned cursor page2 stop reason mismatch.'
    Assert-True (-not [string]::IsNullOrWhiteSpace($result.host_remnote_vault_partition_cursor_page2.nextCursor)) 'partitioned cursor page2 missing nextCursor.'

    $cursorPage1Ids = @($result.host_remnote_vault_partition_cursor_page1.rows | ForEach-Object { $_.remId })
    $cursorPage2Ids = @($result.host_remnote_vault_partition_cursor_page2.rows | ForEach-Object { $_.remId })
    $cursorOverlap = @($cursorPage1Ids | Where-Object { $cursorPage2Ids -contains $_ })
    Assert-True ($cursorOverlap.Count -eq 0) 'partitioned cursor pages overlapped.'

    $result.host_remnote_vault_partition_cursor_page3 = Invoke-BridgeAction -Action 'host_remnote_vault_export_query' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        limit = 25
        cursorMode = $true
        cursor = $result.host_remnote_vault_partition_cursor_page2.nextCursor
        includeRows = $true
        fields = @('remId', 'title', 'createdAt')
    }
    Assert-True ($result.host_remnote_vault_partition_cursor_page3.cursorMode -eq $true) 'partitioned cursor page3 did not enable cursor mode.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page3.scanned -eq 0) 'partitioned cursor page3 should be at end of export.'
    Assert-True ($result.host_remnote_vault_partition_cursor_page3.returned -eq 0) 'partitioned cursor page3 returned rows after end of export.'
    Assert-True ($null -eq $result.host_remnote_vault_partition_cursor_page3.nextCursor) 'partitioned cursor page3 should not return nextCursor at end.'

    $result.host_remnote_vault_partition_stats = Invoke-BridgeAction -Action 'host_remnote_vault_export_stats' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxScan = 50
        topLimit = 5
        includeSamples = $false
    }
    Assert-True ($result.host_remnote_vault_partition_stats.readOnly -eq $true) 'partitioned vault stats is not read-only.'
    Assert-True ($result.host_remnote_vault_partition_stats.export.partitioned -eq $true) 'partitioned vault stats did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_partition_stats.export.fileCount -eq 3) 'partitioned vault stats did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_stats.scanned -eq 50) 'partitioned vault stats scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats.parsedRows -eq 50) 'partitioned vault stats parsed row count mismatch.'

    $result.host_remnote_vault_partition_stats_cursor_page1 = Invoke-BridgeAction -Action 'host_remnote_vault_export_stats' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxScan = 25
        cursorMode = $true
        topLimit = 5
        includeSamples = $false
    }
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page1.cursorMode -eq $true) 'partitioned stats cursor page1 did not enable cursor mode.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page1.export.fileCount -eq 3) 'partitioned stats cursor page1 did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page1.scanned -eq 25) 'partitioned stats cursor page1 scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page1.parsedRows -eq 25) 'partitioned stats cursor page1 parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page1.stopReason -eq 'maxScan') 'partitioned stats cursor page1 stop reason mismatch.'
    Assert-True (-not [string]::IsNullOrWhiteSpace($result.host_remnote_vault_partition_stats_cursor_page1.nextCursor)) 'partitioned stats cursor page1 missing nextCursor.'

    $result.host_remnote_vault_partition_stats_cursor_page2 = Invoke-BridgeAction -Action 'host_remnote_vault_export_stats' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxScan = 25
        cursorMode = $true
        cursor = $result.host_remnote_vault_partition_stats_cursor_page1.nextCursor
        topLimit = 5
        includeSamples = $false
    }
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page2.cursorMode -eq $true) 'partitioned stats cursor page2 did not enable cursor mode.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page2.export.fileCount -eq 3) 'partitioned stats cursor page2 did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page2.scanned -eq 25) 'partitioned stats cursor page2 scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page2.parsedRows -eq 25) 'partitioned stats cursor page2 parsed row count mismatch.'
    Assert-True (-not [string]::IsNullOrWhiteSpace($result.host_remnote_vault_partition_stats_cursor_page2.nextCursor)) 'partitioned stats cursor page2 missing nextCursor.'

    $result.host_remnote_vault_partition_stats_cursor_page3 = Invoke-BridgeAction -Action 'host_remnote_vault_export_stats' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxScan = 25
        cursorMode = $true
        cursor = $result.host_remnote_vault_partition_stats_cursor_page2.nextCursor
        topLimit = 5
        includeSamples = $false
    }
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page3.cursorMode -eq $true) 'partitioned stats cursor page3 did not enable cursor mode.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page3.scanned -eq 0) 'partitioned stats cursor page3 should be at end of export.'
    Assert-True ($result.host_remnote_vault_partition_stats_cursor_page3.parsedRows -eq 0) 'partitioned stats cursor page3 parsed rows after end of export.'
    Assert-True ($null -eq $result.host_remnote_vault_partition_stats_cursor_page3.nextCursor) 'partitioned stats cursor page3 should not return nextCursor at end.'

    $result.host_remnote_vault_partition_stats_aggregate = Invoke-BridgeAction -Action 'host_remnote_vault_export_stats_aggregate' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        pageSize = 20
        maxRows = 50
        topLimit = 5
        includeSamples = $true
        sampleLimit = 2
    }
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.readOnly -eq $true) 'partitioned stats aggregate is not read-only.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.mode -eq 'host_remnote_vault_export_stats_aggregate') 'partitioned stats aggregate mode mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.export.partitioned -eq $true) 'partitioned stats aggregate did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.export.fileCount -eq 3) 'partitioned stats aggregate did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.scanned -eq 50) 'partitioned stats aggregate scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.parsedRows -eq 50) 'partitioned stats aggregate parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.parseErrors -eq 0) 'partitioned stats aggregate parse errors on smoke export.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.pageCount -eq 3) 'partitioned stats aggregate page count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.pages[0].scanned -eq 20) 'partitioned stats aggregate first page size mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.pages[2].scanned -eq 10) 'partitioned stats aggregate final page size mismatch.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.truncated -eq $false) 'partitioned stats aggregate should not truncate smoke export.'
    Assert-True ($null -eq $result.host_remnote_vault_partition_stats_aggregate.nextCursor) 'partitioned stats aggregate should not return nextCursor after full export.'
    Assert-True ($result.host_remnote_vault_partition_stats_aggregate.samples.Count -eq 2) 'partitioned stats aggregate sample count mismatch.'

    $result.host_remnote_vault_export_schema_profile = Invoke-BridgeAction -Action 'host_remnote_vault_export_schema_profile' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxRows = 50
        fieldLimit = 40
        topLimit = 10
        sampleLimit = 2
    }
    Assert-True ($result.host_remnote_vault_export_schema_profile.readOnly -eq $true) 'vault schema profile is not read-only.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.mutationApplied -eq $false) 'vault schema profile reported mutation.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.mode -eq 'host_remnote_vault_export_schema_profile') 'vault schema profile mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.export.partitioned -eq $true) 'vault schema profile did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.export.fileCount -eq 3) 'vault schema profile did not read all part files.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.scanned -eq 50) 'vault schema profile scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.parsedRows -eq 50) 'vault schema profile parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.parseErrors -eq 0) 'vault schema profile parse errors on smoke export.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.fieldPathCount -ge 5) 'vault schema profile returned too few field paths.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.requiredFields.remId.present -eq $true) 'vault schema profile did not mark remId as present.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.requiredFields.title.present -eq $true) 'vault schema profile did not mark title as present.'
    Assert-True (@($result.host_remnote_vault_export_schema_profile.fields | Where-Object { $_.path -eq 'remId' }).Count -ge 1) 'vault schema profile missing remId field profile.'
    Assert-True ($result.host_remnote_vault_export_schema_profile.recommendations.Count -ge 1) 'vault schema profile missing recommendations.'

    $result.host_remnote_vault_export_field_profile = Invoke-BridgeAction -Action 'host_remnote_vault_export_field_profile' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxRows = 50
        topLimit = 5
        sampleLimit = 2
        fields = @('remId', 'title', 'createdAt', 'parentId', 'flags.isDocument')
    }
    Assert-True ($result.host_remnote_vault_export_field_profile.readOnly -eq $true) 'vault field profile is not read-only.'
    Assert-True ($result.host_remnote_vault_export_field_profile.mutationApplied -eq $false) 'vault field profile reported mutation.'
    Assert-True ($result.host_remnote_vault_export_field_profile.mode -eq 'host_remnote_vault_export_field_profile') 'vault field profile mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile.export.partitioned -eq $true) 'vault field profile did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_export_field_profile.export.fileCount -eq 3) 'vault field profile did not read all part files.'
    Assert-True ($result.host_remnote_vault_export_field_profile.scanned -eq 50) 'vault field profile scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile.parsedRows -eq 50) 'vault field profile parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile.matchedRows -eq 50) 'vault field profile matched row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile.parseErrors -eq 0) 'vault field profile parse errors on smoke export.'
    Assert-True ($result.host_remnote_vault_export_field_profile.fieldCount -eq 5) 'vault field profile field count mismatch.'
    $fieldProfileRemId = @($result.host_remnote_vault_export_field_profile.fields | Where-Object { $_.field -eq 'remId' })[0]
    $fieldProfileCreatedAt = @($result.host_remnote_vault_export_field_profile.fields | Where-Object { $_.field -eq 'createdAt' })[0]
    Assert-True ($fieldProfileRemId.rowsWithValue -eq 50) 'vault field profile remId coverage mismatch.'
    Assert-True ($fieldProfileRemId.coveragePct -eq 100) 'vault field profile remId coverage percent mismatch.'
    Assert-True ($fieldProfileRemId.topValues.Count -ge 1) 'vault field profile remId top values missing.'
    Assert-True ($fieldProfileCreatedAt.types.number -eq 50) 'vault field profile createdAt type count mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile.recommendations.Count -ge 1) 'vault field profile missing recommendations.'

    $result.host_remnote_vault_export_field_profile_filtered = Invoke-BridgeAction -Action 'host_remnote_vault_export_field_profile' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        remId = $result.note.remId
        maxRows = 50
        topLimit = 5
        sampleLimit = 2
        fields = @('remId', 'title', 'createdAt')
    }
    Assert-True ($result.host_remnote_vault_export_field_profile_filtered.readOnly -eq $true) 'filtered vault field profile is not read-only.'
    Assert-True ($result.host_remnote_vault_export_field_profile_filtered.mutationApplied -eq $false) 'filtered vault field profile reported mutation.'
    Assert-True ($result.host_remnote_vault_export_field_profile_filtered.scanned -eq 50) 'filtered vault field profile scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile_filtered.parsedRows -eq 50) 'filtered vault field profile parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_field_profile_filtered.matchedRows -eq 1) 'filtered vault field profile matched row count mismatch.'
    Assert-True (@($result.host_remnote_vault_export_field_profile_filtered.filters.remIds)[0] -eq $result.note.remId) 'filtered vault field profile did not echo remId filter.'
    $filteredFieldProfileRemId = @($result.host_remnote_vault_export_field_profile_filtered.fields | Where-Object { $_.field -eq 'remId' })[0]
    Assert-True ($filteredFieldProfileRemId.rowsWithValue -eq 1) 'filtered vault field profile remId coverage mismatch.'
    Assert-True ($filteredFieldProfileRemId.coveragePct -eq 100) 'filtered vault field profile remId coverage percent mismatch.'

    $result.host_remnote_vault_quality_report = Invoke-BridgeAction -Action 'host_remnote_vault_quality_report' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxRows = 50
        topLimit = 5
        issueLimit = 10
    }
    Assert-True ($result.host_remnote_vault_quality_report.readOnly -eq $true) 'vault quality report is not read-only.'
    Assert-True ($result.host_remnote_vault_quality_report.mutationApplied -eq $false) 'vault quality report reported mutation.'
    Assert-True ($result.host_remnote_vault_quality_report.mode -eq 'host_remnote_vault_quality_report') 'vault quality report mode mismatch.'
    Assert-True ($result.host_remnote_vault_quality_report.export.partitioned -eq $true) 'vault quality report did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_quality_report.export.fileCount -eq 3) 'vault quality report did not read all part files.'
    Assert-True ($result.host_remnote_vault_quality_report.scanned -eq 50) 'vault quality report scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_quality_report.parsedRows -eq 50) 'vault quality report parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_quality_report.parseErrors -eq 0) 'vault quality report parse errors on smoke export.'
    Assert-True ($result.host_remnote_vault_quality_report.qualityScore -ge 0 -and $result.host_remnote_vault_quality_report.qualityScore -le 100) 'vault quality report score out of range.'
    Assert-True (@('good', 'watch', 'needs_review', 'risky') -contains $result.host_remnote_vault_quality_report.grade) 'vault quality report grade invalid.'
    Assert-True ($null -ne $result.host_remnote_vault_quality_report.issueCounts) 'vault quality report missing issue counts.'
    Assert-True ($null -ne $result.host_remnote_vault_quality_report.severityCounts) 'vault quality report missing severity counts.'
    Assert-True ($null -ne $result.host_remnote_vault_quality_report.schemaCoverage) 'vault quality report missing schema coverage.'
    Assert-True ($result.host_remnote_vault_quality_report.schemaCoverage.strictSchema -eq $false) 'vault quality report strict schema default mismatch.'
    Assert-True ($result.host_remnote_vault_quality_report.issueCounts.missingActivePowerups -eq 0) 'vault quality report should not count omitted activePowerups as a data issue.'
    Assert-True ($result.host_remnote_vault_quality_report.schemaCoverage.missingFields.activePowerups -eq 50) 'vault quality report schema coverage did not count omitted activePowerups.'
    Assert-True ($result.host_remnote_vault_quality_report.schemaRecommendations.Count -ge 1) 'vault quality report missing schema recommendations.'
    Assert-True ($result.host_remnote_vault_quality_report.recommendations.Count -ge 1) 'vault quality report missing recommendations.'
    Assert-True ($null -ne $result.host_remnote_vault_quality_report.repairPlanPreview) 'vault quality report missing repair plan preview.'
    Assert-True ($result.host_remnote_vault_quality_report.repairPlanPreview.readOnly -eq $true) 'vault quality repair plan preview is not read-only.'
    Assert-True ($result.host_remnote_vault_quality_report.repairPlanPreview.mutationApplied -eq $false) 'vault quality repair plan preview reported mutation.'
    Assert-True ($result.host_remnote_vault_quality_report.repairPlanPreview.summary.totalItems -ge 1) 'vault quality repair plan preview did not produce any triage items.'
    Assert-True ($result.host_remnote_vault_quality_report.repairPlanPreview.summary.richerExportNeeded -ge 1) 'vault quality repair plan preview did not classify omitted schema fields as richer export needed.'
    Assert-True (@($result.host_remnote_vault_quality_report.repairPlanPreview.items | Where-Object { $_.category -eq 'richer_export_needed' }).Count -ge 1) 'vault quality repair plan preview missing richer_export_needed item.'

    $result.host_remnote_vault_partition_graph = Invoke-BridgeAction -Action 'host_remnote_vault_export_graph' -Payload @{
        exportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxScan = 50
        maxNodes = 200
        maxEdges = 500
        includeNodes = $false
        includeEdges = $false
    }
    Assert-True ($result.host_remnote_vault_partition_graph.readOnly -eq $true) 'partitioned vault graph is not read-only.'
    Assert-True ($result.host_remnote_vault_partition_graph.export.partitioned -eq $true) 'partitioned vault graph did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_partition_graph.export.fileCount -eq 3) 'partitioned vault graph did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_graph.scanned -eq 50) 'partitioned vault graph scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_graph.parsedRows -eq 50) 'partitioned vault graph parsed row count mismatch.'

    $result.host_remnote_vault_partition_diff = Invoke-BridgeAction -Action 'host_remnote_vault_export_diff' -Payload @{
        baseExportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        compareExportId = $result.host_remnote_vault_snapshot_export_partitioned.exportId
        maxScan = 50
        limit = 2
        includeRows = $false
    }
    Assert-True ($result.host_remnote_vault_partition_diff.readOnly -eq $true) 'partitioned vault diff is not read-only.'
    Assert-True ($result.host_remnote_vault_partition_diff.base.partitioned -eq $true) 'partitioned vault diff base did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_partition_diff.compare.partitioned -eq $true) 'partitioned vault diff compare did not mark partitioned export.'
    Assert-True ($result.host_remnote_vault_partition_diff.base.fileCount -eq 3) 'partitioned vault diff base did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_diff.compare.fileCount -eq 3) 'partitioned vault diff compare did not read all part files.'
    Assert-True ($result.host_remnote_vault_partition_diff.stats.base.scanned -eq 50) 'partitioned vault diff base scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_diff.stats.compare.scanned -eq 50) 'partitioned vault diff compare scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_partition_diff.counts.added -eq 0) 'partitioned vault diff added rows on identical export.'
    Assert-True ($result.host_remnote_vault_partition_diff.counts.removed -eq 0) 'partitioned vault diff removed rows on identical export.'
    Assert-True ($result.host_remnote_vault_partition_diff.counts.changed -eq 0) 'partitioned vault diff changed rows on identical export.'
    Assert-True ($result.host_remnote_vault_partition_diff.counts.unchanged -eq 50) 'partitioned vault diff unchanged count mismatch.'

    $result.host_remnote_vault_export_catalog = Invoke-BridgeAction -Action 'host_remnote_vault_export_catalog' -Payload @{
        limit = 20
        includeManifest = $false
    }
    Assert-True ($result.host_remnote_vault_export_catalog.readOnly -eq $true) 'host_remnote_vault_export_catalog is not read-only.'
    Assert-True ($result.host_remnote_vault_export_catalog.mutationApplied -eq $false) 'host_remnote_vault_export_catalog reported mutation.'
    Assert-True ($result.host_remnote_vault_export_catalog.mode -eq 'host_remnote_vault_export_catalog') 'host_remnote_vault_export_catalog mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_catalog.totalFound -ge 1) 'host_remnote_vault_export_catalog found no exports.'
    Assert-True (@($result.host_remnote_vault_export_catalog.exports | Where-Object { $_.rowsPath -eq $result.host_remnote_vault_snapshot_export.rowsPath }).Count -ge 1) 'host_remnote_vault_export_catalog did not list the smoke export.'
    Assert-True (@($result.host_remnote_vault_export_catalog.exports | Where-Object { $_.exportId -eq $result.host_remnote_vault_snapshot_export_partitioned.exportId -and $_.partitioned -eq $true }).Count -ge 1) 'host_remnote_vault_export_catalog did not list the partitioned smoke export.'

    $result.host_remnote_vault_export_query = Invoke-BridgeAction -Action 'host_remnote_vault_export_query' -Payload @{
        rowsPath = $result.host_remnote_vault_snapshot_export.rowsPath
        remIds = @($result.note.remId)
        limit = 5
        includeRows = $true
        fields = @('remId', 'title', 'createdAt')
    }
    Assert-True ($result.host_remnote_vault_export_query.readOnly -eq $true) 'host_remnote_vault_export_query is not read-only.'
    Assert-True ($result.host_remnote_vault_export_query.mutationApplied -eq $false) 'host_remnote_vault_export_query reported mutation.'
    Assert-True ($result.host_remnote_vault_export_query.mode -eq 'host_remnote_vault_export_query') 'host_remnote_vault_export_query mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_query.matchedTotal -ge 1) 'host_remnote_vault_export_query did not match the smoke note.'
    Assert-True (@($result.host_remnote_vault_export_query.rows | Where-Object { $_.remId -eq $result.note.remId }).Count -ge 1) 'host_remnote_vault_export_query did not return the smoke note row.'

    $result.host_remnote_vault_export_stats = Invoke-BridgeAction -Action 'host_remnote_vault_export_stats' -Payload @{
        rowsPath = $result.host_remnote_vault_snapshot_export.rowsPath
        topLimit = 5
        includeSamples = $true
        sampleLimit = 2
    }
    Assert-True ($result.host_remnote_vault_export_stats.readOnly -eq $true) 'host_remnote_vault_export_stats is not read-only.'
    Assert-True ($result.host_remnote_vault_export_stats.mutationApplied -eq $false) 'host_remnote_vault_export_stats reported mutation.'
    Assert-True ($result.host_remnote_vault_export_stats.mode -eq 'host_remnote_vault_export_stats') 'host_remnote_vault_export_stats mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_stats.scanned -eq 50) 'host_remnote_vault_export_stats scanned count mismatch.'
    Assert-True ($result.host_remnote_vault_export_stats.parsedRows -eq 50) 'host_remnote_vault_export_stats parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_stats.parseErrors -eq 0) 'host_remnote_vault_export_stats parse errors on smoke export.'
    Assert-True ($result.host_remnote_vault_export_stats.timeRanges.createdAt.count -ge 1) 'host_remnote_vault_export_stats missing createdAt range.'

    $result.host_remnote_vault_export_graph = Invoke-BridgeAction -Action 'host_remnote_vault_export_graph' -Payload @{
        rowsPath = $result.host_remnote_vault_snapshot_export.rowsPath
        maxScan = 50
        maxNodes = 200
        maxEdges = 500
        includeNodes = $true
        includeEdges = $true
        nodeFields = @('remId', 'title', 'parentId', 'createdAt', 'updatedAt', 'flags')
    }
    Assert-True ($result.host_remnote_vault_export_graph.readOnly -eq $true) 'host_remnote_vault_export_graph is not read-only.'
    Assert-True ($result.host_remnote_vault_export_graph.mutationApplied -eq $false) 'host_remnote_vault_export_graph reported mutation.'
    Assert-True ($result.host_remnote_vault_export_graph.mode -eq 'host_remnote_vault_export_graph') 'host_remnote_vault_export_graph mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph.graphFormat -eq 'nodes_edges_v1') 'host_remnote_vault_export_graph graph format mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph.parsedRows -eq 50) 'host_remnote_vault_export_graph parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph.nodeCount -ge 50) 'host_remnote_vault_export_graph returned too few nodes.'
    Assert-True ($result.host_remnote_vault_export_graph.edgeCount -ge 1) 'host_remnote_vault_export_graph returned no edges.'
    Assert-True (@($result.host_remnote_vault_export_graph.nodes | Where-Object { $_.id -eq $result.note.remId }).Count -ge 1) 'host_remnote_vault_export_graph missing smoke note node.'

    $result.host_remnote_vault_export_graph_file = Invoke-BridgeAction -Action 'host_remnote_vault_export_graph_file' -Payload @{
        rowsPath = $result.host_remnote_vault_snapshot_export.rowsPath
        graphId = "smoke-vault-graph-$suffix"
        maxScan = 50
        maxNodes = 200
        maxEdges = 500
        nodeFields = @('remId', 'title', 'parentId', 'createdAt', 'updatedAt', 'flags')
    }
    Assert-True ($result.host_remnote_vault_export_graph_file.readOnly -eq $true) 'host_remnote_vault_export_graph_file is not read-only.'
    Assert-True ($result.host_remnote_vault_export_graph_file.mutationApplied -eq $false) 'host_remnote_vault_export_graph_file reported mutation.'
    Assert-True ($result.host_remnote_vault_export_graph_file.mode -eq 'host_remnote_vault_export_graph_file') 'host_remnote_vault_export_graph_file mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.graphFormat -eq 'nodes_edges_jsonl_v1') 'host_remnote_vault_export_graph_file graph format mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.sourceGraphFormat -eq 'nodes_edges_v1') 'host_remnote_vault_export_graph_file source graph format mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.fileFormat -eq 'jsonl') 'host_remnote_vault_export_graph_file file format mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.streaming -eq $true) 'host_remnote_vault_export_graph_file is not using streaming mode.'
    Assert-True ($result.host_remnote_vault_export_graph_file.memoryMode -eq 'streaming_nodes_edges_v1') 'host_remnote_vault_export_graph_file memory mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.scanPasses -eq 2) 'host_remnote_vault_export_graph_file scan pass count mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.parsedRows -eq 50) 'host_remnote_vault_export_graph_file parsed row count mismatch.'
    Assert-True ($result.host_remnote_vault_export_graph_file.nodeCount -ge 50) 'host_remnote_vault_export_graph_file returned too few nodes.'
    Assert-True ($result.host_remnote_vault_export_graph_file.edgeCount -ge 1) 'host_remnote_vault_export_graph_file returned no edges.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_export_graph_file.nodesPath) 'host_remnote_vault_export_graph_file nodes file missing.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_export_graph_file.edgesPath) 'host_remnote_vault_export_graph_file edges file missing.'
    Assert-True (Test-Path -LiteralPath $result.host_remnote_vault_export_graph_file.manifestPath) 'host_remnote_vault_export_graph_file manifest file missing.'
    Assert-True (@(Get-Content -LiteralPath $result.host_remnote_vault_export_graph_file.nodesPath).Count -eq $result.host_remnote_vault_export_graph_file.nodeCount) 'host_remnote_vault_export_graph_file node line count mismatch.'
    Assert-True (@(Get-Content -LiteralPath $result.host_remnote_vault_export_graph_file.edgesPath).Count -eq $result.host_remnote_vault_export_graph_file.edgeCount) 'host_remnote_vault_export_graph_file edge line count mismatch.'

    $result.host_remnote_vault_graph_export_catalog = Invoke-BridgeAction -Action 'host_remnote_vault_graph_export_catalog' -Payload @{
        limit = 20
        includeManifest = $false
    }
    Assert-True ($result.host_remnote_vault_graph_export_catalog.readOnly -eq $true) 'host_remnote_vault_graph_export_catalog is not read-only.'
    Assert-True ($result.host_remnote_vault_graph_export_catalog.mutationApplied -eq $false) 'host_remnote_vault_graph_export_catalog reported mutation.'
    Assert-True ($result.host_remnote_vault_graph_export_catalog.mode -eq 'host_remnote_vault_graph_export_catalog') 'host_remnote_vault_graph_export_catalog mode mismatch.'
    Assert-True ($result.host_remnote_vault_graph_export_catalog.totalFound -ge 1) 'host_remnote_vault_graph_export_catalog found no graph exports.'
    Assert-True (@($result.host_remnote_vault_graph_export_catalog.graphExports | Where-Object { $_.manifestPath -eq $result.host_remnote_vault_export_graph_file.manifestPath }).Count -ge 1) 'host_remnote_vault_graph_export_catalog did not list the smoke graph export.'

    $result.host_remnote_vault_graph_export_query = Invoke-BridgeAction -Action 'host_remnote_vault_graph_export_query' -Payload @{
        graphId = $result.host_remnote_vault_export_graph_file.graphId
        nodeIds = @($result.note.remId)
        edgeTypes = @('parent_of')
        nodeLimit = 5
        edgeLimit = 5
        nodeFields = @('id', 'kind', 'title')
        edgeFields = @('source', 'target', 'type')
    }
    Assert-True ($result.host_remnote_vault_graph_export_query.readOnly -eq $true) 'host_remnote_vault_graph_export_query is not read-only.'
    Assert-True ($result.host_remnote_vault_graph_export_query.mutationApplied -eq $false) 'host_remnote_vault_graph_export_query reported mutation.'
    Assert-True ($result.host_remnote_vault_graph_export_query.mode -eq 'host_remnote_vault_graph_export_query') 'host_remnote_vault_graph_export_query mode mismatch.'
    Assert-True ($result.host_remnote_vault_graph_export_query.graphFormat -eq 'nodes_edges_jsonl_v1') 'host_remnote_vault_graph_export_query graph format mismatch.'
    Assert-True ($result.host_remnote_vault_graph_export_query.nodesMatchedTotal -ge 1) 'host_remnote_vault_graph_export_query did not match the smoke node.'
    Assert-True (@($result.host_remnote_vault_graph_export_query.nodes | Where-Object { $_.id -eq $result.note.remId }).Count -ge 1) 'host_remnote_vault_graph_export_query did not return the smoke node.'
    Assert-True ($result.host_remnote_vault_graph_export_query.edgesMatchedTotal -ge 1) 'host_remnote_vault_graph_export_query did not match graph edges.'

    $result.host_remnote_vault_export_diff = Invoke-BridgeAction -Action 'host_remnote_vault_export_diff' -Payload @{
        baseRowsPath = $result.host_remnote_vault_snapshot_export.rowsPath
        compareRowsPath = $result.host_remnote_vault_snapshot_export.rowsPath
        fields = @('title', 'parentId', 'createdAt', 'updatedAt', 'flags')
        rowFields = @('remId', 'title', 'createdAt', 'updatedAt')
        limit = 5
        includeRows = $true
    }
    Assert-True ($result.host_remnote_vault_export_diff.readOnly -eq $true) 'host_remnote_vault_export_diff is not read-only.'
    Assert-True ($result.host_remnote_vault_export_diff.mutationApplied -eq $false) 'host_remnote_vault_export_diff reported mutation.'
    Assert-True ($result.host_remnote_vault_export_diff.mode -eq 'host_remnote_vault_export_diff') 'host_remnote_vault_export_diff mode mismatch.'
    Assert-True ($result.host_remnote_vault_export_diff.counts.added -eq 0) 'host_remnote_vault_export_diff added rows on identical inputs.'
    Assert-True ($result.host_remnote_vault_export_diff.counts.removed -eq 0) 'host_remnote_vault_export_diff removed rows on identical inputs.'
    Assert-True ($result.host_remnote_vault_export_diff.counts.changed -eq 0) 'host_remnote_vault_export_diff changed rows on identical inputs.'
    Assert-True ($result.host_remnote_vault_export_diff.counts.unchanged -eq 50) 'host_remnote_vault_export_diff unchanged count mismatch.'

    $result.read_rem_full = Invoke-BridgeAction -Action 'read_rem_full' -Payload @{
        remId = $result.note.remId
        includeChildren = $true
        includeRelations = $true
        includeProperties = $false
        childLimit = 20
    }
    Assert-True ($result.read_rem_full.remId -eq $result.note.remId) 'read_rem_full remId mismatch.'
    Assert-True ($null -ne $result.read_rem_full.relations) 'read_rem_full relations missing.'

    $result.probe_rem_ids = Invoke-BridgeAction -Action 'probe_rem_ids' -Payload @{
        remIds = @($result.note.remId, 'not-a-real-rem-id')
        includeMissing = $true
        includeTypeFlags = $true
        includePowerups = $true
        includeRelations = $true
        maxIds = 20
    }
    Assert-True ($result.probe_rem_ids.readOnly -eq $true) 'probe_rem_ids is not read-only.'
    Assert-True ($result.probe_rem_ids.foundCount -ge 1) 'probe_rem_ids found no SDK-visible Rem.'
    Assert-True ($result.probe_rem_ids.missingCount -ge 1 -or $result.probe_rem_ids.invalidCount -ge 1) 'probe_rem_ids did not report the missing/invalid probe ID.'
    Assert-True (@($result.probe_rem_ids.rows | Where-Object { $_.remId -eq $result.note.remId -and $_.exists -eq $true }).Count -eq 1) 'probe_rem_ids did not resolve the smoke note.'

    $result.export_subtree = Invoke-BridgeAction -Action 'export_subtree' -Payload @{
        remId = $result.path.remId
        depth = 2
        maxNodes = 50
        includeRelations = $true
    }
    Assert-True ($result.export_subtree.rootRemId -eq $result.path.remId) 'export_subtree root mismatch.'
    Assert-True ($result.export_subtree.returned -ge 1) 'export_subtree returned no nodes.'

    $today = Get-Date -Format 'yyyy-MM-dd'
    $result.export_daily_range = Invoke-BridgeAction -Action 'export_daily_range' -Payload @{
        startDate = $today
        endDate = $today
        includeChildren = $false
        maxDays = 1
    }
    Assert-True ($result.export_daily_range.returnedDays -eq 1) 'export_daily_range did not return one day.'

    $result.list_children = Invoke-BridgeAction -Action 'list_children' -Payload @{
        remId = $result.path.remId
        limit = 20
    }
    Assert-True ($result.list_children.count -ge 1) 'Path should have at least one child.'

    $result.update = Invoke-BridgeAction -Action 'update_note' -Payload @{
        remId = $result.note.remId
        appendContent = ' ek-icerik'
        addTags = @('updated-smoke')
    }
    Assert-True ($result.update.success -eq $true) 'update_note failed.'

    $result.overwrite = Invoke-BridgeAction -Action 'overwrite_note_content' -Payload @{
        remId = $result.note.remId
        content = 'tamamen yeni govde'
    }
    Assert-True ($result.overwrite.success -eq $true) 'overwrite_note_content failed.'

    $movedPath = Invoke-BridgeAction -Action 'find_or_create_path' -Payload @{
        pathSegments = @('Personal Intelligence OS', 'Smoke Tests', "$rootTitle Moved")
        asFolders = $true
    }
    $cleanupRemIds.Add([string]$movedPath.remId) | Out-Null

    $result.move = Invoke-BridgeAction -Action 'move_note' -Payload @{
        remId = $result.note.remId
        parentId = $movedPath.remId
    }
    Assert-True ($result.move.success -eq $true) 'move_note failed.'

    $result.location = Invoke-BridgeAction -Action 'inspect_rem_location' -Payload @{
        remId = $result.note.remId
    }
    Assert-True ($result.location.parentId -eq $movedPath.remId) 'inspect_rem_location parent mismatch after move.'

    $result.note_heading = Invoke-BridgeAction -Action 'set_note_heading_level' -Payload @{
        remId = $result.note.remId
        headingLevel = 3
    }
    Assert-True (($result.note_heading.fontSize -eq 'H3') -or ($result.note_heading.hasHeaderPowerup -eq $true)) 'set_note_heading_level did not apply H3/header state.'

    $result.note_highlight = Invoke-BridgeAction -Action 'set_note_highlight_color' -Payload @{
        remId = $result.note.remId
        highlightColor = 'Green'
    }
    Assert-True ($null -ne $result.note_highlight.remId) 'set_note_highlight_color returned no result.'

    $result.add_powerup = Invoke-BridgeAction -Action 'add_powerup' -Payload @{
        remId = $result.note.remId
        powerup = 'todo'
    }
    Assert-True ($result.add_powerup.success -eq $true) 'add_powerup failed.'

    $result.remove_powerup_v2 = Invoke-BridgeAction -Action 'remove_powerup_v2' -Payload @{
        remId = $result.note.remId
        powerup = 'todo'
    }
    Assert-True ($result.remove_powerup_v2.success -eq $true) 'remove_powerup_v2 failed.'

    $result.native_icon = Invoke-BridgeAction -Action 'apply_native_emoji_icon' -Payload @{
        remId = $result.note.remId
        emoji = '*'
    }
    Assert-True ($result.native_icon.powerups.document -eq $true) 'apply_native_emoji_icon did not enable document powerup.'

    $result.document_pinned = Invoke-BridgeAction -Action 'set_document_pinned_state' -Payload @{
        remId = $result.note.remId
        pinned = $true
    }
    Assert-True ($result.document_pinned.powerups.document -eq $true) 'set_document_pinned_state did not enable document powerup.'

    $result.document_unpinned = Invoke-BridgeAction -Action 'set_document_pinned_state' -Payload @{
        remId = $result.note.remId
        pinned = $false
    }
    Assert-True ($result.document_unpinned.powerups.document -eq $true) 'set_document_pinned_state unpin returned no document state.'

    $result.callout_icon = Invoke-BridgeAction -Action 'apply_callout_bullet_icon' -Payload @{
        remId = $result.note.remId
        icon = '!'
    }
    Assert-True ($result.callout_icon.icon -eq '!') 'apply_callout_bullet_icon icon mismatch.'

    $result.remove_powerup = Invoke-BridgeAction -Action 'remove_powerup' -Payload @{
        remId = $result.note.remId
        powerup = 'clo'
    }
    Assert-True ($null -ne $result.remove_powerup.activePowerups) 'remove_powerup did not return powerup inspection.'

    $result.structured = Invoke-BridgeAction -Action 'create_structured_summary' -Payload @{
        parentId = $result.path.remId
        title = "structured-$suffix"
        sections = @(
            @{
                heading = 'Visual'
                body = 'Remote image smoke test'
                imageUrls = @($remoteImageUrl)
            }
        )
    }
    $cleanupRemIds.Add([string]$result.structured.remId) | Out-Null

    $result.structured_read = Invoke-BridgeAction -Action 'read_note' -Payload @{
        remId = $result.structured.remId
        depth = 3
    }
    $visualSection = @($result.structured_read.children | Where-Object { $_.text -eq 'Visual' } | Select-Object -First 1)
    Assert-True ($visualSection.Count -eq 1) 'Structured summary Visual section missing.'
    Assert-True (@($visualSection[0].children).Count -ge 2) 'Structured summary image/body children missing.'

    $result.create_reference = Invoke-BridgeAction -Action 'create_reference' -Payload @{
        remId = $result.note.remId
        text = "reference-$suffix"
        targetRemId = $result.structured.remId
    }
    Assert-True ($result.create_reference.success -eq $true) 'create_reference failed.'

    $result.create_portal = Invoke-BridgeAction -Action 'create_portal' -Payload @{
        parentId = $result.path.remId
        sourceRemId = $result.structured.remId
    }
    Assert-True ($result.create_portal.success -eq $true) 'create_portal failed.'
    Assert-True ($null -ne $result.create_portal.portalRemId) 'create_portal did not return portalRemId.'

    $result.add_rem_to_portal = Invoke-BridgeAction -Action 'add_rem_to_portal' -Payload @{
        remId = $result.note.remId
        portalId = $result.create_portal.portalRemId
    }
    Assert-True ($result.add_rem_to_portal.success -eq $true) 'add_rem_to_portal failed.'

    $result.remove_rem_from_portal = Invoke-BridgeAction -Action 'remove_rem_from_portal' -Payload @{
        remId = $result.note.remId
        portalId = $result.create_portal.portalRemId
    }
    Assert-True ($result.remove_rem_from_portal.success -eq $true) 'remove_rem_from_portal failed.'

    $result.add_source_to_rem = Invoke-BridgeAction -Action 'add_source_to_rem' -Payload @{
        remId = $result.note.remId
        sourceRemId = $result.structured.remId
    }
    Assert-True ($result.add_source_to_rem.success -eq $true) 'add_source_to_rem failed.'

    $result.remove_source_from_rem = Invoke-BridgeAction -Action 'remove_source_from_rem' -Payload @{
        remId = $result.note.remId
        sourceRemId = $result.structured.remId
    }
    Assert-True ($result.remove_source_from_rem.success -eq $true) 'remove_source_from_rem failed.'

    $result.create_alias = Invoke-BridgeAction -Action 'create_alias' -Payload @{
        remId = $result.note.remId
        aliasText = "alias-$suffix"
    }
    Assert-True ($result.create_alias.success -eq $true) 'create_alias failed.'

    $result.set_practice_state = Invoke-BridgeAction -Action 'set_practice_state' -Payload @{
        remId = $result.note.remId
        enablePractice = $true
        direction = 'forward'
    }
    Assert-True ($result.set_practice_state.success -eq $true) 'set_practice_state failed.'

    $result.export_card_catalog = Invoke-BridgeAction -Action 'export_card_catalog' -Payload @{
        remIds = @($result.note.remId)
        limit = 5
        includeRem = $true
    }
    Assert-True ($result.export_card_catalog.readOnly -eq $true) 'export_card_catalog must be read-only.'
    Assert-True ($result.export_card_catalog.mutationApplied -eq $false) 'export_card_catalog must not mutate RemNote.'
    Assert-True ($result.export_card_catalog.pluginVersion -eq '2.58.0') 'export_card_catalog pluginVersion mismatch.'
    Assert-True ($null -ne $result.export_card_catalog.rows) 'export_card_catalog missing rows.'

    $result.read_card_full = Invoke-BridgeAction -Action 'read_card_full' -Payload @{
        remId = $result.note.remId
        includeRem = $true
    }
    Assert-True ($result.read_card_full.readOnly -eq $true) 'read_card_full must be read-only.'
    Assert-True ($result.read_card_full.mutationApplied -eq $false) 'read_card_full must not mutate RemNote.'
    Assert-True ($result.read_card_full.pluginVersion -eq '2.58.0') 'read_card_full pluginVersion mismatch.'
    Assert-True ($null -ne $result.read_card_full.rows) 'read_card_full missing rows.'

    $cardIdForControl = if (@($result.read_card_full.rows).Count -gt 0) { [string]$result.read_card_full.rows[0].cardId } else { "missing-card-$suffix" }
    $result.control_card_status = Invoke-BridgeAction -Action 'control_card' -Payload @{
        operation = 'status'
        cardId = $cardIdForControl
    }
    Assert-True ($result.control_card_status.readOnly -eq $true) 'control_card status must be read-only.'
    Assert-True ($result.control_card_status.mutationApplied -eq $false) 'control_card status must not mutate RemNote.'
    Assert-True ($result.control_card_status.pluginVersion -eq '2.58.0') 'control_card status pluginVersion mismatch.'

    $result.control_card_dry_run = Invoke-BridgeAction -Action 'control_card' -Payload @{
        operation = 'remove'
        cardId = $cardIdForControl
        dryRun = $true
    }
    Assert-True ($result.control_card_dry_run.readOnly -eq $true) 'control_card dry-run must be read-only.'
    Assert-True ($result.control_card_dry_run.dryRun -eq $true) 'control_card dry-run flag missing.'
    Assert-True ($result.control_card_dry_run.mutationApplied -eq $false) 'control_card dry-run must not mutate RemNote.'
    Assert-True ($result.control_card_dry_run.plannedCall.method -eq 'remove') 'control_card dry-run planned method mismatch.'

    $result.control_card_unconfirmed = Invoke-BridgeAction -Action 'control_card' -Payload @{
        operation = 'updateRepetitionStatus'
        cardId = $cardIdForControl
        score = 'good'
    }
    Assert-True ($result.control_card_unconfirmed.requiresConfirmation -eq $true) 'control_card unconfirmed should require confirmation.'
    Assert-True ($result.control_card_unconfirmed.confirmationText -eq 'CONTROL_CARD') 'control_card unconfirmed confirmation text mismatch.'
    Assert-True ($result.control_card_unconfirmed.mutationApplied -eq $false) 'control_card unconfirmed must not mutate RemNote.'
    Assert-True ($result.control_card_unconfirmed.plannedCall.method -eq 'updateCardRepetitionStatus') 'control_card unconfirmed planned method mismatch.'

    $result.upsert = Invoke-BridgeAction -Action 'upsert_structured_note' -Payload @{
        title = "upsert-$suffix"
        pathSegments = @('Personal Intelligence OS', 'Smoke Tests', $rootTitle)
        mergeStrategy = 'overwrite_if_exact_title'
        sections = @(
            @{
                heading = 'Local Image'
                body = 'Local image smoke test'
                imageUrls = @($localImageUrl)
            }
        )
    }
    $cleanupRemIds.Add([string]$result.upsert.remId) | Out-Null

    $result.upsert_read = Invoke-BridgeAction -Action 'read_note' -Payload @{
        remId = $result.upsert.remId
        depth = 3
    }
    $localImageSection = @($result.upsert_read.children | Where-Object { $_.text -eq 'Local Image' } | Select-Object -First 1)
    Assert-True ($localImageSection.Count -eq 1) 'Upsert Local Image section missing.'
    Assert-True (@($localImageSection[0].children).Count -ge 2) 'Upsert local image child missing.'

    $result.batch = Invoke-BridgeAction -Action 'batch_ingest_records' -Payload @{
        records = @(
            @{
                title = "batch-a-$suffix"
                pathSegments = @('Personal Intelligence OS', 'Smoke Tests', $rootTitle)
                sections = @(@{ heading = 'A'; body = 'batch body a' })
            },
            @{
                title = "batch-b-$suffix"
                pathSegments = @('Personal Intelligence OS', 'Smoke Tests', $rootTitle)
                sections = @(@{ heading = 'B'; body = 'batch body b' })
            }
        )
    }
    foreach ($entry in @($result.batch.results)) {
        if ($entry.remId) {
            $cleanupRemIds.Add([string]$entry.remId) | Out-Null
        }
    }
    Assert-True (@($result.batch.results).Count -eq 2) 'Batch ingest result count mismatch.'

    $result.sidebar_get = Invoke-BridgeAction -Action 'get_sidebar_shortcuts'
    $result.sidebar_set = Invoke-BridgeAction -Action 'set_sidebar_shortcuts' -Payload @{
        shortcuts = @(
            @{
                remId = $result.note.remId
                title = "shortcut-$suffix"
            }
        )
    }
    $result.sidebar_add = Invoke-BridgeAction -Action 'add_sidebar_shortcut' -Payload @{
        remId = $result.note.remId
        title = "shortcut-$suffix"
    }
    $result.sidebar_remove = Invoke-BridgeAction -Action 'remove_sidebar_shortcut' -Payload @{
        remId = $result.note.remId
    }

    $result.table = Invoke-BridgeAction -Action 'create_table' -Payload @{
        title = "table-$suffix"
        parentId = $result.path.remId
        tags = @('smoke-table')
    }
    $cleanupRemIds.Add([string]$result.table.remId) | Out-Null
    $cleanupRemIds.Add([string]$result.table.rowTagRemId) | Out-Null
    Assert-True ($result.table.isTable -eq $true) 'create_table did not produce a table.'

    $result.property = Invoke-BridgeAction -Action 'create_property' -Payload @{
        parentTagId = $result.table.rowTagRemId
        name = "property-$suffix"
        propertyType = 'text'
    }
    $cleanupRemIds.Add([string]$result.property.remId) | Out-Null

    $result.property_info_before = Invoke-BridgeAction -Action 'get_property_info' -Payload @{
        propertyId = $result.property.remId
    }
    Assert-True ($result.property_info_before.isProperty -eq $true) 'get_property_info did not see a property rem.'

    $result.property_type_set = Invoke-BridgeAction -Action 'set_property_type' -Payload @{
        propertyId = $result.property.remId
        propertyType = 'text'
    }
    Assert-True ($result.property_type_set.propertyId -eq $result.property.remId) 'set_property_type returned the wrong property id.'
    Assert-True (($result.property_type_set.success -eq $true) -or ($result.property_type_set.supported -eq $false)) 'set_property_type returned an unexpected state.'

    $result.property_info_after = Invoke-BridgeAction -Action 'get_property_info' -Payload @{
        propertyId = $result.property.remId
    }

    $result.row = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = "row-$suffix"
        content = 'table row'
        parentId = $result.path.remId
        tagIds = @($result.table.rowTagRemId)
        isDocument = $true
    }
    $cleanupRemIds.Add([string]$result.row.remId) | Out-Null

    $result.property_set = Invoke-BridgeAction -Action 'set_tag_property_value' -Payload @{
        remId = $result.row.remId
        propertyId = $result.property.remId
        value = 'deger-1'
    }
    Assert-True ($result.property_set.success -eq $true) 'set_tag_property_value failed.'

    $result.doctor_target = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = "doctor-target-$suffix"
        parentId = $result.path.remId
        tagIds = @($result.table.rowTagRemId)
        isDocument = $true
    }
    $cleanupRemIds.Add([string]$result.doctor_target.remId) | Out-Null

    $result.doctor_blank_child = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = ''
        parentId = $result.doctor_target.remId
    }
    $cleanupRemIds.Add([string]$result.doctor_blank_child.remId) | Out-Null

    $result.add_tag_by_id = Invoke-BridgeAction -Action 'add_tag_by_id' -Payload @{
        remId = $result.note.remId
        tagId = $result.table.rowTagRemId
    }
    Assert-True ($result.add_tag_by_id.success -eq $true) 'add_tag_by_id failed.'

    $result.remove_tag_by_id = Invoke-BridgeAction -Action 'remove_tag_by_id' -Payload @{
        remId = $result.note.remId
        tagId = $result.table.rowTagRemId
        removeProperties = $false
    }
    Assert-True ($result.remove_tag_by_id.success -eq $true) 'remove_tag_by_id failed.'

    $result.safe_migration_plan = Invoke-BridgeAction -Action 'safe_migration_plan' -Payload @{
        includeSnapshots = $true
        operations = @(
            @{
                id = 'plan-title'
                action = 'update_note'
                payload = @{
                    remId = $result.note.remId
                    title = "planned-title-$suffix"
                    addTags = @('planned-safe-migration')
                }
            },
            @{
                id = 'plan-property'
                action = 'set_tag_property_value'
                payload = @{
                    remId = $result.row.remId
                    propertyId = $result.property.remId
                    value = 'planned-deger'
                }
            },
            @{
                id = 'plan-tag'
                action = 'add_tag_by_id'
                payload = @{
                    remId = $result.note.remId
                    tagId = $result.table.rowTagRemId
                }
            },
            @{
                id = 'plan-move'
                action = 'move_note'
                payload = @{
                    remId = $result.note.remId
                    parentId = $result.path.remId
                }
            }
        )
    }
    Assert-True ($result.safe_migration_plan.readOnly -eq $true) 'safe_migration_plan is not read-only.'
    Assert-True ($result.safe_migration_plan.dryRun -eq $true) 'safe_migration_plan is not dry-run.'
    Assert-True ($result.safe_migration_plan.mutationApplied -eq $false) 'safe_migration_plan applied a mutation.'
    Assert-True ($result.safe_migration_plan.operationCount -eq 4) 'safe_migration_plan operation count mismatch.'
    Assert-True ($result.safe_migration_plan.supportedCount -eq 4) 'safe_migration_plan did not support all smoke operations.'
    Assert-True (@($result.safe_migration_plan.rollbackPlan).Count -ge 1) 'safe_migration_plan rollback plan missing.'

    $result.safe_migration_apply = Invoke-BridgeAction -Action 'safe_migration_apply' -Payload @{
        confirm = 'APPLY_SAFE_MIGRATION'
        includeSnapshots = $true
        operations = @(
            @{
                id = 'apply-title'
                action = 'update_note'
                payload = @{
                    remId = $result.note.remId
                    title = "applied-title-$suffix"
                    addTags = @('applied-safe-migration')
                }
            },
            @{
                id = 'apply-property'
                action = 'set_tag_property_value'
                payload = @{
                    remId = $result.row.remId
                    propertyId = $result.property.remId
                    value = 'applied-deger'
                }
            },
            @{
                id = 'apply-tag'
                action = 'add_tag_by_id'
                payload = @{
                    remId = $result.note.remId
                    tagId = $result.table.rowTagRemId
                }
            },
            @{
                id = 'apply-move'
                action = 'move_note'
                payload = @{
                    remId = $result.note.remId
                    parentId = $result.path.remId
                }
            }
        )
    }
    Assert-True ($result.safe_migration_apply.success -eq $true) 'safe_migration_apply failed.'
    Assert-True ($result.safe_migration_apply.mutationApplied -eq $true) 'safe_migration_apply did not apply mutations.'
    Assert-True ($result.safe_migration_apply.appliedCount -eq 4) 'safe_migration_apply applied count mismatch.'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$result.safe_migration_apply.auditId)) 'safe_migration_apply auditId missing.'
    Assert-True (@($result.safe_migration_apply.rollbackPlan).Count -ge 1) 'safe_migration_apply rollback plan missing.'
    $appliedTitleStep = @($result.safe_migration_apply.results | Where-Object { $_.id -eq 'apply-title' } | Select-Object -First 1)
    Assert-True ($appliedTitleStep.Count -eq 1) 'safe_migration_apply missing title step result.'
    Assert-True ($appliedTitleStep[0].afterApply.title -eq "applied-title-$suffix") 'safe_migration_apply did not update the note title.'

    $result.safe_migration_audit_log = Invoke-BridgeAction -Action 'safe_migration_audit_log' -Payload @{
        auditId = $result.safe_migration_apply.auditId
        includePlans = $true
        limit = 5
    }
    Assert-True ($result.safe_migration_audit_log.readOnly -eq $true) 'safe_migration_audit_log is not read-only.'
    Assert-True ($result.safe_migration_audit_log.returned -ge 1) 'safe_migration_audit_log did not return the apply audit entry.'
    Assert-True ($result.safe_migration_audit_log.rows[0].auditId -eq $result.safe_migration_apply.auditId) 'safe_migration_audit_log auditId mismatch.'

    $result.safe_migration_validate_rollback = Invoke-BridgeAction -Action 'safe_migration_validate_rollback' -Payload @{
        auditId = $result.safe_migration_apply.auditId
        includeSnapshots = $true
    }
    Assert-True ($result.safe_migration_validate_rollback.readOnly -eq $true) 'safe_migration_validate_rollback is not read-only.'
    Assert-True ($result.safe_migration_validate_rollback.dryRun -eq $true) 'safe_migration_validate_rollback is not dry-run.'
    Assert-True ($result.safe_migration_validate_rollback.mutationApplied -eq $false) 'safe_migration_validate_rollback applied a mutation.'
    Assert-True ($result.safe_migration_validate_rollback.rollbackOperationCount -ge 1) 'safe_migration_validate_rollback saw no rollback operations.'

    $result.safe_migration_apply_rollback = Invoke-BridgeAction -Action 'safe_migration_apply_rollback' -Payload @{
        auditId = $result.safe_migration_apply.auditId
        includeSnapshots = $true
        confirm = 'APPLY_SAFE_ROLLBACK'
    }
    Assert-True ($result.safe_migration_apply_rollback.success -eq $true) 'safe_migration_apply_rollback failed.'
    Assert-True ($result.safe_migration_apply_rollback.mutationApplied -eq $true) 'safe_migration_apply_rollback did not apply mutations.'
    Assert-True ($result.safe_migration_apply_rollback.rollbackOperationCount -ge 1) 'safe_migration_apply_rollback saw no rollback operations.'
    Assert-True ($result.safe_migration_apply_rollback.applyResult.appliedCount -ge 1) 'safe_migration_apply_rollback applied no rollback steps.'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$result.safe_migration_apply_rollback.rollbackAuditId)) 'safe_migration_apply_rollback rollbackAuditId missing.'

    $expectedRollbackTitleStep = @($result.safe_migration_apply.rollbackPlan | Where-Object { $_.action -eq 'update_note' -and $null -ne $_.payload.title } | Select-Object -First 1)
    Assert-True ($expectedRollbackTitleStep.Count -eq 1) 'safe_migration_apply rollback plan did not include a title restore step.'
    $result.safe_migration_rollback_read = Invoke-BridgeAction -Action 'read_note' -Payload @{
        remId = $result.note.remId
        depth = 1
    }
    Assert-True ($result.safe_migration_rollback_read.content -eq $expectedRollbackTitleStep[0].payload.title) 'safe_migration_apply_rollback did not restore the previous note title.'

    $result.export_tag_view = Invoke-BridgeAction -Action 'export_tag_view' -Payload @{
        tagRemId = $result.table.rowTagRemId
        limit = 20
        sortBy = 'createdAt'
        direction = 'desc'
        includeProperties = $true
        propertyIds = @($result.property.remId)
    }
    Assert-True ($result.export_tag_view.totalTagged -ge 1) 'export_tag_view did not see tagged rows.'

    $result.export_learning_inbox = Invoke-BridgeAction -Action 'export_learning_inbox' -Payload @{
        learningTagId = $result.table.rowTagRemId
        datePropertyId = $result.property.remId
        statusPropertyId = $result.property.remId
        priorityPropertyId = $result.property.remId
        domainPropertyId = $result.property.remId
        limit = 20
        maxScan = 20
        includeArchived = $true
        includePractice = $true
        sortBy = 'createdAt'
        direction = 'desc'
    }
    Assert-True ($result.export_learning_inbox.readOnly -eq $true) 'export_learning_inbox is not read-only.'
    Assert-True ($result.export_learning_inbox.mutationApplied -eq $false) 'export_learning_inbox applied a mutation.'
    Assert-True ($result.export_learning_inbox.totalTagged -ge 1) 'export_learning_inbox did not see tagged rows.'
    $learningInboxRow = @($result.export_learning_inbox.rows | Where-Object { $_.remId -eq $result.row.remId } | Select-Object -First 1)
    Assert-True ($learningInboxRow.Count -eq 1) 'export_learning_inbox did not include the smoke row.'
    Assert-True ($learningInboxRow[0].practiceCardCount -eq 0) 'export_learning_inbox practice count mismatch for smoke row.'
    Assert-True (@($learningInboxRow[0].issues | Where-Object { $_ -eq 'missing_practice_card' }).Count -eq 1) 'export_learning_inbox did not flag missing practice card.'

    $result.repair_property = Invoke-BridgeAction -Action 'create_property' -Payload @{
        parentTagId = $result.table.rowTagRemId
        name = "repair-status-$suffix"
        propertyType = 'text'
    }
    $cleanupRemIds.Add([string]$result.repair_property.remId) | Out-Null

    $result.plan_learning_inbox_repairs = Invoke-BridgeAction -Action 'plan_learning_inbox_repairs' -Payload @{
        learningTagId = $result.table.rowTagRemId
        statusPropertyId = $result.repair_property.remId
        limit = 20
        maxScan = 20
        includeArchived = $true
        includePractice = $true
        includeSafeMigrationPlan = $true
        includeCardDrafts = $true
        defaultStatus = 'New'
        defaultPriority = ''
        maxOperations = 20
    }
    Assert-True ($result.plan_learning_inbox_repairs.readOnly -eq $true) 'plan_learning_inbox_repairs is not read-only.'
    Assert-True ($result.plan_learning_inbox_repairs.dryRun -eq $true) 'plan_learning_inbox_repairs is not dry-run.'
    Assert-True ($result.plan_learning_inbox_repairs.mutationApplied -eq $false) 'plan_learning_inbox_repairs applied a mutation.'
    Assert-True ($result.plan_learning_inbox_repairs.operationCount -ge 1) 'plan_learning_inbox_repairs did not propose any property operations.'
    Assert-True ($result.plan_learning_inbox_repairs.cardDraftCount -ge 1) 'plan_learning_inbox_repairs did not propose any card drafts.'
    Assert-True ($result.plan_learning_inbox_repairs.migrationPlan.readOnly -eq $true) 'plan_learning_inbox_repairs did not include read-only migration plan.'

    $result.apply_learning_inbox_repairs_unconfirmed = Invoke-BridgeAction -Action 'apply_learning_inbox_repairs' -Payload @{
        learningTagId = $result.table.rowTagRemId
        statusPropertyId = $result.repair_property.remId
        limit = 20
        maxScan = 20
        includeArchived = $true
        includePractice = $true
        includeCardDrafts = $true
        defaultStatus = 'New'
        defaultPriority = ''
        maxOperations = 20
    }
    Assert-True ($result.apply_learning_inbox_repairs_unconfirmed.requiresConfirmation -eq $true) 'apply_learning_inbox_repairs should require confirmation.'
    Assert-True ($result.apply_learning_inbox_repairs_unconfirmed.mutationApplied -eq $false) 'apply_learning_inbox_repairs wrote without confirmation.'

    $result.apply_learning_inbox_repairs = Invoke-BridgeAction -Action 'apply_learning_inbox_repairs' -Payload @{
        learningTagId = $result.table.rowTagRemId
        statusPropertyId = $result.repair_property.remId
        limit = 20
        maxScan = 20
        includeArchived = $true
        includePractice = $true
        includeCardDrafts = $true
        defaultStatus = 'New'
        defaultPriority = ''
        maxOperations = 20
        confirm = 'APPLY_LEARNING_INBOX_REPAIRS'
    }
    Assert-True ($result.apply_learning_inbox_repairs.success -eq $true) 'apply_learning_inbox_repairs failed.'
    Assert-True ($result.apply_learning_inbox_repairs.mutationApplied -eq $true) 'apply_learning_inbox_repairs did not apply any property repairs.'
    Assert-True ($result.apply_learning_inbox_repairs.appliedCount -ge 1) 'apply_learning_inbox_repairs applied no operations.'
    Assert-True ($result.apply_learning_inbox_repairs.cardDraftCount -ge 1) 'apply_learning_inbox_repairs did not preserve card drafts.'

    $result.export_learning_inbox_after_apply = Invoke-BridgeAction -Action 'export_learning_inbox' -Payload @{
        learningTagId = $result.table.rowTagRemId
        statusPropertyId = $result.repair_property.remId
        limit = 20
        maxScan = 20
        includeArchived = $true
        includePractice = $false
        sortBy = 'createdAt'
        direction = 'desc'
    }
    $learningInboxAppliedRow = @($result.export_learning_inbox_after_apply.rows | Where-Object { $_.remId -eq $result.row.remId } | Select-Object -First 1)
    Assert-True ($learningInboxAppliedRow.Count -eq 1) 'export_learning_inbox_after_apply did not include the smoke row.'
    Assert-True ($learningInboxAppliedRow[0].status -eq 'New') 'apply_learning_inbox_repairs did not write the status repair.'

    $result.set_table_filter_raw = Invoke-BridgeAction -Action 'set_table_filter_raw' -Payload @{
        remId = $result.table.remId
        dryRun = $true
        filter = @{
            exp = 'expression'
            refType = 'Text'
            matcherType = 'contains'
            text = 'row'
        }
    }
    Assert-True ($result.set_table_filter_raw.dryRun -eq $true) 'set_table_filter_raw dryRun failed.'

    $result.template = Invoke-BridgeAction -Action 'create_template' -Payload @{
        tagId = $result.table.rowTagRemId
        title = "template-$suffix"
        content = "Ozet ::`nNeden onemli:`nKaynak:"
        autoApply = $true
    }
    $cleanupRemIds.Add([string]$result.template.remId) | Out-Null
    Assert-True ($result.template.autoApply -eq $true) 'create_template did not set autoApply.'
    Assert-True ($result.template.childCount -ge 3) 'create_template did not create template children.'

    $result.template_auto_apply_off = Invoke-BridgeAction -Action 'set_template_auto_apply' -Payload @{
        templateId = $result.template.remId
        autoApply = $false
    }
    Assert-True ($result.template_auto_apply_off.autoApply -eq $false) 'set_template_auto_apply did not disable autoApply.'

    $result.template_auto_apply_on = Invoke-BridgeAction -Action 'set_template_auto_apply' -Payload @{
        templateId = $result.template.remId
        autoApply = $true
    }
    Assert-True ($result.template_auto_apply_on.autoApply -eq $true) 'set_template_auto_apply did not re-enable autoApply.'

    $result.templates = Invoke-BridgeAction -Action 'list_tag_templates' -Payload @{
        tagId = $result.table.rowTagRemId
    }
    $listedTemplate = @($result.templates.templates | Where-Object { $_.remId -eq $result.template.remId })
    Assert-True ($listedTemplate.Count -eq 1) 'list_tag_templates did not return created template.'
    Assert-True ($listedTemplate[0].autoApply -eq $true) 'list_tag_templates did not report autoApply.'

    $result.template_target = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = "template-target-$suffix"
        parentId = $result.path.remId
        isDocument = $true
    }
    $cleanupRemIds.Add([string]$result.template_target.remId) | Out-Null

    $result.template_apply = Invoke-BridgeAction -Action 'apply_template_to_rem' -Payload @{
        remId = $result.template_target.remId
        templateId = $result.template.remId
        tagId = $result.table.rowTagRemId
        skipExistingChildTitles = $true
        propertyDefaults = @{
            "$($result.property.remId)" = 'template-default'
        }
    }
    Assert-True ($result.template_apply.success -eq $true) 'apply_template_to_rem failed.'
    Assert-True (@($result.template_apply.addedChildren).Count -ge 3) 'apply_template_to_rem did not clone children.'

    $result.auto_template_target = Invoke-BridgeAction -Action 'create_note' -Payload @{
        title = "auto-template-target-$suffix"
        parentId = $result.path.remId
        isDocument = $true
    }
    $cleanupRemIds.Add([string]$result.auto_template_target.remId) | Out-Null

    $result.auto_template_apply = Invoke-BridgeAction -Action 'apply_tag_auto_template' -Payload @{
        remId = $result.auto_template_target.remId
        tagId = $result.table.rowTagRemId
        skipExistingChildTitles = $true
    }
    Assert-True ($result.auto_template_apply.success -eq $true) 'apply_tag_auto_template failed.'
    Assert-True (@($result.auto_template_apply.addedChildren).Count -ge 3) 'apply_tag_auto_template did not clone children.'

    $result.rem_sdk_call = Invoke-BridgeAction -Action 'rem_sdk_call' -Payload @{
        remId = $result.template_target.remId
        method = 'getChildrenRem'
        args = @()
    }
    Assert-True (@($result.rem_sdk_call.result).Count -ge 3) 'rem_sdk_call getChildrenRem returned too few children.'

    $result.rem_raw_call = Invoke-BridgeAction -Action 'rem_raw_call' -Payload @{
        remId = $result.property.remId
        method = 'getPropertyType'
        payload = @{}
    }

    $result.list_table_rows = Invoke-BridgeAction -Action 'list_table_rows' -Payload @{
        tagRemId = $result.table.rowTagRemId
        limit = 20
    }
    Assert-True ($result.list_table_rows.tagRemId -eq $result.table.rowTagRemId) 'list_table_rows tagRemId mismatch.'
    Assert-True ($result.list_table_rows.totalTagged -ge 1) 'list_table_rows did not see the tagged smoke row.'
    $listedSmokeRow = @($result.list_table_rows.rows | Where-Object { $_.remId -eq $result.row.remId })
    Assert-True ($listedSmokeRow.Count -eq 1) 'list_table_rows did not return the smoke row.'

    $result.list_tagged_rems = Invoke-BridgeAction -Action 'list_tagged_rems' -Payload @{
        tagRemId = $result.table.rowTagRemId
        limit = 10
        sortBy = 'createdAt'
        direction = 'desc'
    }
    Assert-True ($result.list_tagged_rems.totalTagged -ge 1) 'list_tagged_rems did not see tagged rems.'
    Assert-True ($result.list_tagged_rems.sortBy -eq 'createdAt') 'list_tagged_rems sortBy mismatch.'

    $result.export_graph_edges = Invoke-BridgeAction -Action 'export_graph_edges' -Payload @{
        remIds = @($result.note.remId, $result.row.remId)
        includeTags = $true
        includeReferences = $true
        includeSources = $true
        includePortals = $true
        maxNodes = 20
    }
    Assert-True ($result.export_graph_edges.nodeCount -ge 2) 'export_graph_edges returned too few nodes.'

    $result.remnote_doctor_scan = Invoke-BridgeAction -Action 'remnote_doctor_scan' -Payload @{
        remIds = @($result.doctor_target.remId)
        limit = 20
        datePropertyId = $result.property.remId
    }
    Assert-True ($result.remnote_doctor_scan.readOnly -eq $true) 'remnote_doctor_scan is not read-only.'
    Assert-True ($result.remnote_doctor_scan.mutationApplied -eq $false) 'remnote_doctor_scan applied a mutation.'
    Assert-True ($result.remnote_doctor_scan.scanned -ge 1) 'remnote_doctor_scan scanned no Rems.'
    Assert-True (@($result.remnote_doctor_scan.issues | Where-Object { $_.type -eq 'missing_date_property' }).Count -ge 1) 'remnote_doctor_scan did not detect missing date property.'
    Assert-True (@($result.remnote_doctor_scan.issues | Where-Object { $_.type -eq 'blank_direct_children' }).Count -ge 1) 'remnote_doctor_scan did not detect the blank direct child.'

    $result.plan_remnote_doctor_repairs = Invoke-BridgeAction -Action 'plan_remnote_doctor_repairs' -Payload @{
        remIds = @($result.doctor_target.remId)
        limit = 20
        datePropertyId = $result.property.remId
        includeDateBackfill = $true
        includeBlankChildDeletes = $true
        includeSafeMigrationPlan = $true
        maxOperations = 10
    }
    Assert-True ($result.plan_remnote_doctor_repairs.readOnly -eq $true) 'plan_remnote_doctor_repairs is not read-only.'
    Assert-True ($result.plan_remnote_doctor_repairs.dryRun -eq $true) 'plan_remnote_doctor_repairs is not dry-run.'
    Assert-True ($result.plan_remnote_doctor_repairs.mutationApplied -eq $false) 'plan_remnote_doctor_repairs applied a mutation.'
    Assert-True ($result.plan_remnote_doctor_repairs.operationCount -ge 2) 'plan_remnote_doctor_repairs did not propose expected repairs.'
    Assert-True ($result.plan_remnote_doctor_repairs.migrationPlan.readOnly -eq $true) 'plan_remnote_doctor_repairs did not include a read-only migration plan.'

    $result.apply_remnote_doctor_repairs_unconfirmed = Invoke-BridgeAction -Action 'apply_remnote_doctor_repairs' -Payload @{
        remIds = @($result.doctor_target.remId)
        limit = 20
        datePropertyId = $result.property.remId
        includeDateBackfill = $true
        includeBlankChildDeletes = $true
        maxOperations = 10
    }
    Assert-True ($result.apply_remnote_doctor_repairs_unconfirmed.requiresConfirmation -eq $true) 'apply_remnote_doctor_repairs should require confirmation.'
    Assert-True ($result.apply_remnote_doctor_repairs_unconfirmed.mutationApplied -eq $false) 'apply_remnote_doctor_repairs wrote without confirmation.'

    $result.apply_remnote_doctor_repairs = Invoke-BridgeAction -Action 'apply_remnote_doctor_repairs' -Payload @{
        remIds = @($result.doctor_target.remId)
        limit = 20
        datePropertyId = $result.property.remId
        includeDateBackfill = $true
        includeBlankChildDeletes = $true
        maxOperations = 10
        confirm = 'APPLY_REMNOTE_DOCTOR_REPAIRS'
        allowHighRisk = $true
        allowDelete = $true
    }
    Assert-True ($result.apply_remnote_doctor_repairs.success -eq $true) 'apply_remnote_doctor_repairs failed.'
    Assert-True ($result.apply_remnote_doctor_repairs.mutationApplied -eq $true) 'apply_remnote_doctor_repairs did not apply mutations.'
    Assert-True ($result.apply_remnote_doctor_repairs.appliedCount -ge 2) 'apply_remnote_doctor_repairs applied too few repairs.'

    $result.remnote_doctor_scan_after_apply = Invoke-BridgeAction -Action 'remnote_doctor_scan' -Payload @{
        remIds = @($result.doctor_target.remId)
        limit = 20
        datePropertyId = $result.property.remId
    }
    Assert-True (@($result.remnote_doctor_scan_after_apply.issues | Where-Object { $_.type -eq 'missing_date_property' }).Count -eq 0) 'apply_remnote_doctor_repairs did not backfill the date property.'
    Assert-True (@($result.remnote_doctor_scan_after_apply.issues | Where-Object { $_.type -eq 'blank_direct_children' }).Count -eq 0) 'apply_remnote_doctor_repairs did not remove the blank direct child.'

    $result.host_remnote_db_doctor_scan = Invoke-BridgeAction -Action 'host_remnote_db_doctor_scan' -Payload @{
        source = 'indexeddb-leveldb'
        limit = 40
        maxInspected = 400
        maxProbeIds = 20
        maxIssues = 80
        includeValues = $false
        includeRows = $false
        includeTypeFlags = $true
        includePowerups = $false
        includeRelations = $false
        minVisibilityRatio = 0.5
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_db_doctor_scan.readOnly -eq $true) 'host_remnote_db_doctor_scan is not read-only.'
    Assert-True ($result.host_remnote_db_doctor_scan.snapshot -eq $true) 'host_remnote_db_doctor_scan did not use snapshot mode.'
    Assert-True ($result.host_remnote_db_doctor_scan.decoded -eq $true) 'host_remnote_db_doctor_scan did not decode snapshot data.'
    Assert-True ($result.host_remnote_db_doctor_scan.scannedEntities -ge 1) 'host_remnote_db_doctor_scan scanned no DB entities.'
    Assert-True ($null -ne $result.host_remnote_db_doctor_scan.issues) 'host_remnote_db_doctor_scan issues missing.'

    $result.indexeddb_inventory = Invoke-BridgeAction -Action 'indexeddb_inventory' -Payload @{
        includeCounts = $false
        includeSamples = $false
    }
    Assert-True ($result.indexeddb_inventory.readOnly -eq $true) 'indexeddb_inventory is not read-only.'
    Assert-True ($result.indexeddb_inventory.supported -eq $true) 'indexeddb_inventory is unsupported in this RemNote runtime.'

    $firstDb = @($result.indexeddb_inventory.databases | Where-Object { @($_.objectStoreNames).Count -gt 0 } | Select-Object -First 1)
    if ($firstDb.Count -gt 0) {
        $firstDbName = [string]$firstDb[0].name
        $firstStoreName = [string]@($firstDb[0].objectStoreNames)[0]
        $result.indexeddb_read_store = Invoke-BridgeAction -Action 'indexeddb_read_store' -Payload @{
            databaseName = $firstDbName
            storeName = $firstStoreName
            limit = 3
            includeValues = $false
        }
        Assert-True ($result.indexeddb_read_store.readOnly -eq $true) 'indexeddb_read_store is not read-only.'
        Assert-True ($result.indexeddb_read_store.databaseName -eq $firstDbName) 'indexeddb_read_store database mismatch.'
        Assert-True ($result.indexeddb_read_store.storeName -eq $firstStoreName) 'indexeddb_read_store store mismatch.'
    }

    $result.host_remnote_db_inventory = Invoke-BridgeAction -Action 'host_remnote_db_inventory' -Payload @{
        includeFiles = $true
        maxFiles = 10
    }
    Assert-True ($result.host_remnote_db_inventory.readOnly -eq $true) 'host_remnote_db_inventory is not read-only.'
    Assert-True ($result.host_remnote_db_inventory.directories.indexedDbLevelDb.exists -eq $true) 'host_remnote_db_inventory did not find IndexedDB LevelDB directory.'
    Assert-True ($result.host_remnote_db_inventory.directories.indexedDbLevelDb.fileCount -ge 1) 'host_remnote_db_inventory found no IndexedDB LevelDB files.'

    $result.host_remnote_leveldb_snapshot_scan = Invoke-BridgeAction -Action 'host_remnote_leveldb_snapshot_scan' -Payload @{
        source = 'indexeddb-leveldb'
        query = 'remnote'
        limit = 5
        minLength = 10
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_leveldb_snapshot_scan.readOnly -eq $true) 'host_remnote_leveldb_snapshot_scan is not read-only.'
    Assert-True ($result.host_remnote_leveldb_snapshot_scan.snapshot -eq $true) 'host_remnote_leveldb_snapshot_scan did not use snapshot mode.'
    Assert-True ($result.host_remnote_leveldb_snapshot_scan.copiedFileCount -ge 1) 'host_remnote_leveldb_snapshot_scan copied no files.'

    $result.host_remnote_leveldb_decode = Invoke-BridgeAction -Action 'host_remnote_leveldb_decode' -Payload @{
        source = 'indexeddb-leveldb'
        limit = 3
        maxInspected = 200
        includeValues = $false
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_leveldb_decode.readOnly -eq $true) 'host_remnote_leveldb_decode is not read-only.'
    Assert-True ($result.host_remnote_leveldb_decode.snapshot -eq $true) 'host_remnote_leveldb_decode did not use snapshot mode.'
    Assert-True ($result.host_remnote_leveldb_decode.copiedFileCount -ge 1) 'host_remnote_leveldb_decode copied no files.'
    Assert-True ($result.host_remnote_leveldb_decode.decoded -eq $true) 'host_remnote_leveldb_decode did not decode snapshot data.'
    Assert-True ($result.host_remnote_leveldb_decode.returned -ge 1) 'host_remnote_leveldb_decode returned no decoded rows.'

    $result.host_remnote_leveldb_log_decode = Invoke-BridgeAction -Action 'host_remnote_leveldb_log_decode' -Payload @{
        source = 'indexeddb-leveldb'
        limit = 3
        maxInspected = 200
        includeValues = $false
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_leveldb_log_decode.readOnly -eq $true) 'host_remnote_leveldb_log_decode is not read-only.'
    Assert-True ($result.host_remnote_leveldb_log_decode.snapshot -eq $true) 'host_remnote_leveldb_log_decode did not use snapshot mode.'
    Assert-True ($result.host_remnote_leveldb_log_decode.copiedFileCount -ge 1) 'host_remnote_leveldb_log_decode copied no files.'
    Assert-True ($result.host_remnote_leveldb_log_decode.decoded -eq $true) 'host_remnote_leveldb_log_decode did not decode log data.'
    Assert-True ($result.host_remnote_leveldb_log_decode.returned -ge 1) 'host_remnote_leveldb_log_decode returned no decoded rows.'

    $result.host_remnote_leveldb_entity_index = Invoke-BridgeAction -Action 'host_remnote_leveldb_entity_index' -Payload @{
        source = 'indexeddb-leveldb'
        limit = 40
        maxInspected = 400
        includeValues = $false
        includeRows = $true
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_leveldb_entity_index.readOnly -eq $true) 'host_remnote_leveldb_entity_index is not read-only.'
    Assert-True ($result.host_remnote_leveldb_entity_index.snapshot -eq $true) 'host_remnote_leveldb_entity_index did not use snapshot mode.'
    Assert-True ($result.host_remnote_leveldb_entity_index.decoded -eq $true) 'host_remnote_leveldb_entity_index did not decode snapshot data.'
    Assert-True ($result.host_remnote_leveldb_entity_index.entityCount -ge 1) 'host_remnote_leveldb_entity_index found no entity candidates.'
    Assert-True ($result.host_remnote_leveldb_entity_index.indexedRowCount -ge 1) 'host_remnote_leveldb_entity_index indexed no rows.'

    $result.host_remnote_leveldb_graph_export = Invoke-BridgeAction -Action 'host_remnote_leveldb_graph_export' -Payload @{
        source = 'indexeddb-leveldb'
        limit = 40
        maxInspected = 400
        maxNodes = 20
        maxEdges = 80
        includeValues = $false
        includeRows = $false
        includeTypeFlags = $true
        includePowerups = $false
        includeRelations = $false
        includeUnresolvedNodes = $true
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_leveldb_graph_export.readOnly -eq $true) 'host_remnote_leveldb_graph_export is not read-only.'
    Assert-True ($result.host_remnote_leveldb_graph_export.snapshot -eq $true) 'host_remnote_leveldb_graph_export did not use snapshot mode.'
    Assert-True ($result.host_remnote_leveldb_graph_export.decoded -eq $true) 'host_remnote_leveldb_graph_export did not decode snapshot data.'
    Assert-True ($result.host_remnote_leveldb_graph_export.nodeCount -ge 1) 'host_remnote_leveldb_graph_export returned no nodes.'
    Assert-True ($result.host_remnote_leveldb_graph_export.sdkProbe.foundCount -ge 1) 'host_remnote_leveldb_graph_export found no SDK-visible nodes.'
    Assert-True ($null -ne $result.host_remnote_leveldb_graph_export.edges) 'host_remnote_leveldb_graph_export edges missing.'

    $dbEntityIds = @($result.host_remnote_leveldb_entity_index.entities | Select-Object -First 20 | ForEach-Object { $_.entityId })
    $result.probe_rem_ids = Invoke-BridgeAction -Action 'probe_rem_ids' -Payload @{
        remIds = @($result.note.remId) + $dbEntityIds
        includeMissing = $true
        includeTypeFlags = $true
        includePowerups = $false
        includeRelations = $false
        maxIds = 25
    }
    Assert-True ($result.probe_rem_ids.readOnly -eq $true) 'probe_rem_ids DB candidate probe is not read-only.'
    Assert-True ($result.probe_rem_ids.uniqueCount -ge 1) 'probe_rem_ids DB candidate probe saw no IDs.'
    Assert-True ($result.probe_rem_ids.foundCount -ge 1) 'probe_rem_ids DB candidate probe found no SDK-visible Rem.'

    $result.host_remnote_leveldb_sdk_map = Invoke-BridgeAction -Action 'host_remnote_leveldb_sdk_map' -Payload @{
        source = 'indexeddb-leveldb'
        limit = 40
        maxInspected = 400
        maxProbeIds = 20
        includeValues = $false
        includeRows = $false
        includeTypeFlags = $true
        includePowerups = $false
        includeRelations = $false
        maxTotalBytes = 67108864
    }
    Assert-True ($result.host_remnote_leveldb_sdk_map.readOnly -eq $true) 'host_remnote_leveldb_sdk_map is not read-only.'
    Assert-True ($result.host_remnote_leveldb_sdk_map.snapshot -eq $true) 'host_remnote_leveldb_sdk_map did not use snapshot mode.'
    Assert-True ($result.host_remnote_leveldb_sdk_map.decoded -eq $true) 'host_remnote_leveldb_sdk_map did not decode snapshot data.'
    Assert-True ($result.host_remnote_leveldb_sdk_map.entityIndex.entityCount -ge 1) 'host_remnote_leveldb_sdk_map found no DB entity candidates.'
    Assert-True ($result.host_remnote_leveldb_sdk_map.sdkProbe.foundCount -ge 1) 'host_remnote_leveldb_sdk_map found no SDK-visible entity candidates.'
    Assert-True ($result.host_remnote_leveldb_sdk_map.mappedCount -eq $result.host_remnote_leveldb_sdk_map.sdkProbe.foundCount) 'host_remnote_leveldb_sdk_map mapped count mismatch.'

    $result.folder_before = Invoke-BridgeAction -Action 'inspect_folder_state' -Payload @{
        remId = $result.path.remId
    }
    $result.folder_after = Invoke-BridgeAction -Action 'set_folder_state' -Payload @{
        remId = $result.path.remId
        isFolder = $true
    }
    Assert-True ($result.folder_after.isFolder -eq $true) 'set_folder_state failed.'

    $result.open_note = Invoke-BridgeAction -Action 'open_note' -Payload @{
        remId = $result.note.remId
    }
    Assert-True ($result.open_note.ok -eq $true) 'open_note failed.'

    $result.debug_focused_page_children_raw = Invoke-BridgeAction -Action 'debug_focused_page_children_raw'
    Assert-True ($null -ne $result.debug_focused_page_children_raw.pageRemId) 'debug_focused_page_children_raw did not return a page rem id.'

    $result.semantic_status = Invoke-BridgeAction -Action 'semantic_status'
    $result.discover_tables = Invoke-BridgeAction -Action 'discover_tables' -Payload @{
        minRows = 1
    }
    $result.smart_count_table = Invoke-BridgeAction -Action 'smart_count_table' -Payload @{
        query = "table-$suffix"
    }
    $result.count_books_table = Invoke-BridgeAction -Action 'count_books_table' -Payload @{
        pageRemId = $result.path.remId
        tableRemId = $result.table.remId
        pageTitle = $rootTitle
        tableTitle = "table-$suffix"
    }
    Assert-True ($result.count_books_table.table.remId -eq $result.table.remId) 'count_books_table table rem mismatch.'

    $result.inject_css = Invoke-BridgeAction -Action 'inject_css' -Payload @{
        id = 'ag-smoke-noop'
        css = ':root { --ag-smoke-noop: 0; }'
    }
    Assert-True ($result.inject_css.ok -eq $true) 'inject_css failed.'
}
finally {
    foreach ($remId in ($cleanupRemIds | Select-Object -Unique | Sort-Object -Descending)) {
        try {
            Invoke-BridgeAction -Action 'delete_note' -Payload @{ remId = $remId } | Out-Null
        } catch {
        }
    }
}

$outputPath = Join-Path $PSScriptRoot 'test_bridge_actions_result.json'
$json = [pscustomobject]$result | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($outputPath, $json, (New-Object System.Text.UTF8Encoding($false)))
$json
