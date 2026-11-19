const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'remnote-cdp-toolbar-injector.cjs'), 'utf8');
const pluginIndexSource = fs.readFileSync(path.join(__dirname, 'src', 'widgets', 'index.tsx'), 'utf8');
const translatePopupSource = fs.readFileSync(path.join(__dirname, 'src', 'widgets', 'translate_popup.tsx'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, 'src', 'style.css'), 'utf8');
const webpackConfigSource = fs.readFileSync(path.join(__dirname, 'webpack.config.js'), 'utf8');
const launchRemNoteSource = fs.readFileSync(path.join(__dirname, 'launch_remnote.vbs'), 'utf8');
const retargetShortcutsSource = fs.readFileSync(
  path.join(__dirname, '..', 'remnote_host', 'retarget_remnote_shortcuts.ps1'),
  'utf8'
);
const stackWatcherSource = fs.readFileSync(
  path.join(__dirname, '..', 'remnote_host', 'watch_remnote_stack.ps1'),
  'utf8'
);
const silentWatcherSource = fs.readFileSync(
  path.join(__dirname, '..', 'remnote_host', 'silent_watcher.vbs'),
  'utf8'
);
const hiddenStartupSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'scripts', 'start_remnote_bridge_hidden.vbs'),
  'utf8'
);
const pdfTranslateLauncherSource = fs.readFileSync(
  path.join(__dirname, 'start_remnote_pdf_translate.ps1'),
  'utf8'
);
const cdpInjectorLauncherSource = fs.readFileSync(
  path.join(__dirname, 'start_remnote_cdp_toolbar_injector.ps1'),
  'utf8'
);
const topicChatSpaceVerifierSource = fs.readFileSync(
  path.join(__dirname, 'verify_topic_chat_space_live.cjs'),
  'utf8'
);

const {spawnSync} = require('node:child_process');
const ts = require('typescript');
// Negative controls change a production preimage in memory only, never on disk.
const negativeControl = process.env.REMNOTE_CDP_CONTRACT_NEGATIVE;
assert.ok(!negativeControl || ['url','forced-restart','missing-reapply'].includes(negativeControl), 'unknown contract negative control');
function productionFunction(name, input = source) {
  const ast = ts.createSourceFile('injector.cjs', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let definition;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) definition = node;
    else ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(definition, 'production function must exist: '+name);
  return definition.getText(ast);
}
function runPowerShellFixture(file, extra = []) {
  const child = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...extra], {encoding:'utf8',timeout:60000,windowsHide:true});
  assert.ifError(child.error);
  assert.equal(child.status,0, 'isolated fixture failed: '+child.stdout+'\n'+child.stderr);
  return child.stdout;
}
function assertFixtureCases(output, names) {
  const passed = output.split(/\r?\n/).filter(line=>line.startsWith('PASS ')).map(line=>line.slice(5));
  assert.deepEqual(passed,names);
  assert.match(output,/RESULT passed=9 failed=0 total=9/);
}
function runForcedRestartPreimage() {
  // The existing fixture intercepts Stop-Process/Get-Process/Start-Process:
  // inserting an app stop here cannot reach any real process.
  const fixture = fs.readFileSync(path.join(__dirname,'test_pdf_translate_launcher_readiness.ps1'),'utf8');
  const anchor='if ($running.Count -gt 0) {';
  assert.ok(pdfTranslateLauncherSource.includes(anchor),'restart mutation anchor exists');
  const mutant=pdfTranslateLauncherSource.replace(anchor,anchor+'\n        Stop-Process -Id 101 -Force');
  const quote=value=>"'"+value.replace(/'/g,"''")+"'";
  const safeFixture=fixture
    .replaceAll('$PSScriptRoot',quote(__dirname))
    .replace('[System.Management.Automation.Language.Parser]::ParseFile($launcher,','[System.Management.Automation.Language.Parser]::ParseInput($productionSource,')
    .replace('$source = Get-Content -LiteralPath $launcher -Raw','$source = $productionSource');
  assert.notEqual(safeFixture,fixture);
  const script='$productionSource='+quote(mutant)+'\n& ([scriptblock]::Create('+quote(safeFixture)+")) -FixtureCase 'running-legacy'";
  const child=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','$fixtureInput=[Console]::In.ReadToEnd(); & ([scriptblock]::Create($fixtureInput))'],{input:script,encoding:'utf8',timeout:30000,windowsHide:true});
  assert.ifError(child.error);
  const line=child.stdout.split(/\r?\n/).find(line=>line.startsWith('FIXTURE '));
  assert.ok(line,'restart preimage must execute existing fixture: '+child.stderr);
  const report=JSON.parse(line.slice(8));
  assert.equal(report.runtimeTouched,false);
  assert.equal(report.stops,0,'running RemNote must never be stopped, even under legacy restart flag');
}
function loadIsMainRemNotePage() {
  let input=source;
  if(negativeControl==='url') input=input.replace('return legacyDesktopPage || currentDesktopPage || hostedRemNotePage;', 'return false;');
  return Function('return ('+productionFunction('isMainRemNotePage',input)+');')();
}

test('CDP injector recognizes legacy and current RemNote main-page URL schemes', () => {
  const isMainRemNotePage = loadIsMainRemNotePage();
  const target = (url, type = 'page', title = 'RemNote') => ({
    type,
    title,
    url,
    webSocketDebuggerUrl: 'ws://127.0.0.1:9233/devtools/page/main',
  });

  assert.equal(
    isMainRemNotePage(target('file:///C:/Program%20Files/RemNote/resources/app.asar/index.html')),
    true,
    'legacy app.asar desktop pages should remain supported'
  );
  assert.equal(
    isMainRemNotePage(target('app://js/t/knowledge-base/document')),
    true,
    'current app://js desktop pages should be recognized'
  );
  assert.equal(
    isMainRemNotePage(target('https://www.remnote.com/w/knowledge-base')),
    true,
    'hosted RemNote pages should be recognized when exposed by the desktop CDP port'
  );
  assert.equal(
    isMainRemNotePage(target('http://localhost:8080/index.html?pluginId=bridge', 'iframe')),
    false,
    'plugin iframes must not be mistaken for the RemNote shell'
  );
  assert.equal(
    isMainRemNotePage(target('app://js/t/knowledge-base/document', 'page', 'DevTools')),
    false,
    'DevTools pages must be excluded'
  );
});

test('CDP translate popup has outside-click and Escape dismissal hooks', () => {
  assert.match(source, /function\s+hidePopup\s*\(/, 'hidePopup function is required');
  assert.match(source, /function\s+handleDocumentPointerDown\s*\(/, 'outside pointer handler is required');
  assert.match(source, /function\s+handleWindowKeyDown\s*\(/, 'Escape key handler is required');
  assert.match(source, /document\.addEventListener\('pointerdown',\s*handleDocumentPointerDown,\s*true\)/);
  assert.match(source, /window\.addEventListener\('keydown',\s*handleWindowKeyDown,\s*true\)/);
  assert.match(source, /document\.removeEventListener\('pointerdown',\s*handleDocumentPointerDown,\s*true\)/);
  assert.match(source, /window\.removeEventListener\('keydown',\s*handleWindowKeyDown,\s*true\)/);
});

test('CDP translate popup renders sentence highlights with Turkish uppercase text', () => {
  assert.match(source, /function\s+appendHighlightedText\s*\(/, 'highlight text appender is required');
  assert.match(source, /function\s+renderTranslationPopupContent\s*\(/, 'structured popup renderer is required');
  assert.match(source, /mcp-cdp-cevir-highlight/, 'highlight span class is required');
  assert.match(source, /toLocaleUpperCase\('tr-TR'\)/, 'Turkish uppercase conversion is required');
});

test('CDP translate popup renders section headers with icon hierarchy', () => {
  assert.match(source, /SECTION_ICON_BY_KEY/, 'section icon map should exist');
  assert.match(source, /contextExplanation:\s*'↳'/, 'context explanation should have its own section icon');
  assert.match(translatePopupSource, /contextExplanation:\s*'↳'/, 'React context explanation should use the same icon');
  assert.match(source, /function\s+sectionIcon\s*\(/, 'section icon resolver should exist');
  assert.match(source, /function\s+appendSectionHeader\s*\(/, 'section header renderer should exist');
  assert.match(source, /mcp-cdp-cevir-section-icon/, 'section icon class is required');
  assert.match(source, /mcp-cdp-cevir-section-body/, 'section body class is required');
  assert.match(source, /textTransform\s*=\s*'uppercase'/, 'section labels should keep a heading hierarchy');
  assert.match(source, /appendSectionHeader\(row,\s*section\)/, 'translation sections should use the icon header');
});

test('CDP translate button warms host cache before click', () => {
  assert.match(source, /prefetchDelayMs:\s*650/, 'prefetch should wait briefly after selection stabilizes');
  assert.match(source, /function\s+scheduleTranslationPrefetch\s*\(/, 'prefetch scheduler is required');
  assert.match(source, /function\s+prefetchTranslationForSelection\s*\(/, 'prefetch worker is required');
  assert.match(source, /function\s+prefetchCoreTranslationForSelection\s*\(/, 'quality-core prefetch worker is required');
  assert.match(source, /function\s+prefetchProgressiveTranslationPaths\s*\(/, 'scheduler should warm core and detail paths together');
  assert.match(source, /function\s+warmTranslationPrefetchNow\s*\(/, 'button intent should warm translation cache immediately');
  assert.match(source, /function\s+callHostTranslateSelection\s*\(/, 'click and prefetch should share the host call path');
  assert.match(source, /codex_cdp_pdf_toolbar_core_prefetch:/, 'core prefetch traces should be internal');
  assert.match(source, /codex_cdp_pdf_toolbar_details_prefetch:/, 'detail prefetch traces should be internal');
  assert.match(source, /void\s+prefetchCoreTranslationForSelection\(key\)/, 'quality core should start before the detail prefetch timer');
  assert.match(source, /window\.setTimeout\(\(\)\s*=>\s*\{\s*void\s+prefetchTranslationForSelection\(key\);[\s\S]*\},\s*150\)/, 'detail prefetch should follow the core path');
  assert.match(source, /const warm = \(\) => \{ if \(found.surface !== 'note'\) warmTranslationPrefetchNow\(\); \}/, 'only PDF buttons should warm translation');
  assert.match(source, /button\.addEventListener\('pointerenter',\s*warm,\s*true\)/, 'hovering the PDF assistant should start warming');
  assert.match(source, /button\.addEventListener\('focus',\s*warm,\s*true\)/, 'keyboard focus should start warming');
  assert.match(source, /warmTranslationPrefetchNow\(\);/, 'pointerdown should start warming before the click handler');
  assert.match(source, /scheduleTranslationPrefetch\(\)/, 'toolbar scans should warm translation cache');
});

test('RemNote launcher and shortcuts start the CDP toolbar helper path', () => {
  assert.match(
    launchRemNoteSource,
    /start_remnote_pdf_translate\.ps1/i,
    'RemNote launcher should start the PDF translate CDP helper path, not only RemNote.exe'
  );
  assert.match(
    launchRemNoteSource,
    /-NoProfile[\s\S]*-ExecutionPolicy\s+Bypass[\s\S]*-File/i,
    'launcher should run the PowerShell helper safely and reproducibly'
  );
  if(negativeControl==='forced-restart') runForcedRestartPreimage();
  const readiness=runPowerShellFixture(path.join(__dirname,'test_pdf_translate_launcher_readiness.ps1'));
  assertFixtureCases(readiness,['cold-ready','cold-stack','missing-manifest','wrong-id','stack-failed','running-legacy','no-restart','cdp-ready','core-ready-other-missing']);
  assert.match(readiness,/realAppServiceNetworkTouched=false/);
  assert.doesNotMatch(
    retargetShortcutsSource,
    /LauncherArguments\s*=\s*'shell:AppsFolder\\io\.remnote'/,
    'shortcut retargeting must not send RemNote shortcuts back to the normal non-CDP app launch'
  );
  assert.match(
    retargetShortcutsSource,
    /launch_remnote\.vbs/i,
    'shortcut retargeting should point RemNote shortcuts at the CDP-aware launcher'
  );
});

test('RemNote startup watcher guards the PDF translate CDP path', () => {
  assert.match(
    hiddenStartupSource,
    /-EnableWatcher/i,
    'hidden startup should keep the stack watcher running after logon'
  );
  assert.match(
    stackWatcherSource,
    /EnablePdfTranslateGuard/i,
    'watcher should have an explicit PDF translate guard switch'
  );
  assert.match(
    silentWatcherSource,
    /watch_remnote_stack\.ps1[\s\S]*-EnablePdfTranslateGuard/i,
    'persistent hidden watcher launcher must actually enable the PDF translate guard'
  );
  assert.match(
    pdfTranslateLauncherSource,
    /-EnablePdfTranslateGuard/i,
    'PDF translate repair must start the watcher with the guard enabled'
  );
  assert.match(
    pdfTranslateLauncherSource,
    /existing_watcher_preserved_guard_not_enabled/i,
    'existing watcher must be preserved and its missing guard reported'
  );
  assert.doesNotMatch(
    pdfTranslateLauncherSource,
    /replaced_unguarded_watcher/i,
    'missing guard must not authorize replacing an existing watcher process'
  );
  assert.match(
    stackWatcherSource,
    /function\s+Test-CdpPort\s*\(/,
    'watcher should detect whether RemNote is running with the CDP port'
  );
  assert.match(
    stackWatcherSource,
    /function\s+Test-CdpToolbarInjector\s*\(/,
    'watcher should detect whether the toolbar injector helper is alive'
  );
  assert.match(
    stackWatcherSource,
    /function\s+Get-CdpToolbarInjectorHealth\s*\(/,
    'watcher should verify a fresh injector heartbeat instead of trusting process existence'
  );
  assert.match(stackWatcherSource, /heartbeat_stale/i, 'watcher should classify stale injector heartbeats');
  assert.match(
    stackWatcherSource,
    /start_remnote_cdp_toolbar_injector\.ps1/i,
    'watcher should restart the helper when CDP is already open'
  );
  assert.match(
    stackWatcherSource,
    /start_remnote_pdf_translate\.ps1/i,
    'watcher should use the CDP-aware launcher when RemNote is running without CDP'
  );
  const guard=runPowerShellFixture(path.join(__dirname,'..','remnote_host','test_pdf_translate_guard_no_app_restart.ps1'));
  assertFixtureCases(guard,[
    'missing CDP never launches app and reports no-restart reason',
    'missing CDP cooldown is bounded and still never launches',
    'repair launcher carries NoRestart not AllowRestartRunningRemNote',
    'guard disabled and launch grace cause no boundary calls',
    'healthy CDP injector is preserved and ready log deduplicates',
    'missing target page never restarts injector or app',
    'available CDP still recovers unhealthy helper without app launch',
    'helper failure is observable without app launch fallback',
    'MCP bridge MyDrive and Todo health contracts remain usable',
  ]);
  assert.match(guard,/watcherLoopExecuted=false runtimeTouched=false/);
  assert.match(
    stackWatcherSource,
    /ConvertFrom-Json/i,
    'watcher repair should parse the PDF translate launcher result instead of trusting process exit only'
  );
  assert.match(
    stackWatcherSource,
    /cdpReady/i,
    'watcher repair should require the launcher to report cdpReady=true'
  );
  // The guard fixture above executes helper failure and checks its observable
  // injector_failed state with zero app launches; the obsolete app-repair log
  // name is not a requirement under the preserve-running-RemNote policy.
  assert.match(
    pdfTranslateLauncherSource,
    /-PassThru/i,
    'PDF translate launcher should get a real injector result instead of scheduling blindly'
  );
  assert.match(
    pdfTranslateLauncherSource,
    /injector_start_failed/i,
    'PDF translate launcher should report injector startup failures in its JSON result'
  );
  assert.match(
    pdfTranslateLauncherSource,
    /function\s+Start-StackWatcherIfMissing\s*\{/,
    'PDF translate launcher should also keep the watcher alive for durable toolbar repair'
  );
  assert.match(
    pdfTranslateLauncherSource,
    /watcher_start_failed/i,
    'PDF translate launcher should report watcher startup failures in its JSON result'
  );
  assert.doesNotMatch(
    pdfTranslateLauncherSource,
    /scheduled_async/i,
    'PDF translate launcher should not claim readiness from an unverified async schedule'
  );
});

test('CDP translate button is not injected into highlight popup toolbar', () => {
  assert.match(source, /AppSchemeToolbarV4Live/, 'state key should force reinjection after current RemNote toolbar support');
  assert.match(source, /DetailRepairCooldownV3Live/, 'previous detail-repair overlay should be retired');
  assert.match(source, /2595SolMnemonicModelUi/, 'state key should force reinjection after the Sol mnemonic UI repair');
  assert.match(source, /2595SolMnemonicModel/, 'previous Sol mnemonic overlay should be retired');
  assert.match(source, /2594DurableToolbarHealth/, 'previous durable-toolbar overlay should be retired');
  assert.match(source, /25866ReadableText/, 'previous readable-text overlay should be retired');
  assert.match(source, /25865CompactActionsNoEmptyPanel/, 'state key should force reinjection after compact action UI changes');
  assert.match(source, /25865CompactActions/, 'old compact-action overlay key should be retired');
  assert.match(source, /25864PopupPersistence/, 'old popup-persistence overlay key should be retired');
  assert.match(source, /25861RoomyActionIcons/, 'old roomier-popup overlay key should be retired');
  assert.match(source, /25859StalePopupCleanup/, 'state key should force reinjection after stale popup cleanup changes');
  assert.match(source, /25858SectionIcons/, 'old section-icon overlay key should be retired');
  assert.match(source, /25857ImagePanel/, 'old image-panel overlay key should be retired');
  assert.match(source, /25847MnemonicPrefetchHierarchy/, 'old mnemonic-prefetch overlay key should be retired');
  assert.match(source, /25846HighPolish/, 'old high-polish overlay key should be retired');
  assert.match(source, /25844PopupLayout/, 'state key should force reinjection after popup layout changes');
  assert.match(source, /25843PopupHelpers/, 'old popup-helper overlay key should be retired');
  assert.match(source, /25842MnemonicImage/, 'old mnemonic/image overlay key should be retired');
  assert.match(source, /25834SidebarTabFirst/, 'old sidebar-tab overlay should be cleaned up before reinstall');
  assert.match(source, /25833SentenceHighlightExport/, 'old sentence-highlight overlay should be cleaned up before reinstall');
  assert.match(source, /25827SelectionToolbarOnly/, 'old selection-toolbar overlay should be cleaned up before reinstall');
  assert.match(source, /function\s+hasSelectionToolbarSignature\s*\(/, 'valid native selection toolbar should be recognized by its actions');
  assert.match(source, /hasCurrentNotesAction/, 'current icon-only Highlight toolbar should be recognized through its Notes action');
  assert.match(source, /\.rn-drawing-canvas-pdf-highlighter-toolbar/, 'signature should remain scoped to a real PDF selection toolbar');
  assert.match(source, /function\s+isHighlightPopupToolbar\s*\(/, 'highlight toolbar guard is required');
  assert.match(source, /\.HighlightPopup\.pdf-viewer__popup-menu/, 'generic highlight popup should be narrowed to the actual popup-menu surface');
  assert.match(source, /!hasSelectionToolbarSignature\(genericHighlightPopup\)/, 'a native AI Cards/Highlight/Explain toolbar must not be rejected only because it is wrapped by HighlightPopup');
  assert.match(source, /hasSelectionToolbarSignature\(direct\)/, 'direct selected-text menu lookup should require the native action signature');
  assert.match(source, /if\s*\(isHighlightPopupToolbar\(explainTextEl\)\)\s*continue;/, 'fallback explain lookup should skip highlight popups');
  assert.match(source, /hasSelectionToolbarSignature\(toolbar\)[\s\S]*if\s*\(isHighlightPopupToolbar\(toolbar\)\)\s*break;/, 'ancestor scan should accept the valid toolbar signature before rejecting unrelated highlight controls');
});

test('CDP injector cannot remain alive but silently stuck', () => {
  assert.match(source, /FETCH_TIMEOUT_MS\s*=\s*3000/, 'CDP target discovery should have a bounded timeout');
  assert.match(source, /CDP_CONNECT_TIMEOUT_MS\s*=\s*3000/, 'CDP WebSocket connect should have a bounded timeout');
  assert.match(source, /CDP_COMMAND_TIMEOUT_MS\s*=\s*5000/, 'CDP commands should have a bounded timeout');
  assert.match(source, /let\s+tickRunning\s*=\s*false/, 'poll ticks should be serialized');
  assert.match(source, /tickTimer\s*=\s*setTimeout\(\(\)\s*=>\s*void\s+tick\(\),\s*POLL_MS\)/, 'the next poll should be scheduled only after the current poll finishes');
  assert.match(source, /remnote_cdp_toolbar_injector_status\.json/, 'injector should publish a heartbeat status file');
  assert.match(source, /state\.healthTimer\s*=\s*window\.setInterval\(runHealthScan,\s*1000\)/, 'the page overlay should also repair React rerenders independently');
  assert.match(source, /window\.clearInterval\(state\.healthTimer\)/, 'overlay cleanup should stop its health timer');
  assert.match(cdpInjectorLauncherSource, /HeartbeatStaleSeconds\s*=\s*15/, 'launcher should define a stale heartbeat threshold');
  assert.match(cdpInjectorLauncherSource, /already_running_healthy/, 'launcher should only reuse a verified healthy injector');
  assert.match(cdpInjectorLauncherSource, /already_running_waiting_for_page/, 'launcher should expose a live process that has not attached to a page');
  assert.match(cdpInjectorLauncherSource, /successfulPages\s*-gt\s*0/, 'launcher readiness should require a successfully injected page');
  assert.match(stackWatcherSource, /target_page_missing/, 'watcher should reject waiting_for_page as a healthy translate runtime');
  assert.match(stackWatcherSource, /successfulPages\s*-gt\s*0/, 'watcher readiness should require a successfully injected page');
  assert.match(stackWatcherSource, /pdf_translate_target_page_missing/, 'watcher should log target mismatch without restarting the injector in a loop');
  assert.match(stackWatcherSource, /AbandonedMutexException/, 'watcher replacement should recover ownership after an unclean previous exit');
  assert.match(stackWatcherSource, /watcher_abandoned_mutex_recovered/, 'abandoned mutex recovery should be visible in the watchdog log');
  assert.match(cdpInjectorLauncherSource, /Stop-Process[\s\S]*Remove-Item[\s\S]*statusPath/, 'launcher should replace a stale injector and its heartbeat');
});

test('progressive translation cannot regress from details to an older core card', () => {
  assert.match(source, /activePopupResultRequestSeq:\s*0/, 'active popup result should be scoped to one request');
  assert.match(source, /activePopupResult:\s*null/, 'latest visible translation result should be retained');
  assert.match(source, /function\s+translationResultRank\s*\(/, 'translation stages need an explicit quality order');
  assert.match(source, /function\s+reconcilePopupResult\s*\(/, 'async rerenders should pass through one result reconciler');
  assert.match(source, /state\.reconcilePopupResult\s*=\s*reconcilePopupResult/, 'live diagnostics should expose the result reconciler');
  assert.match(source, /translationResultRank\(nextResult\)\s*>=\s*translationResultRank\(current\)/, 'a lower-rank core result must not replace details');
  assert.match(source, /const\s+resolvedResult\s*=\s*reconcilePopupResult\(nextResult,\s*popupRequestSeq\)/, 'popup rerenders should use the reconciled result');
  assert.match(source, /rerender\(state\.activePopupResultRequestSeq\s*===\s*popupRequestSeq\s*\?\s*state\.activePopupResult\s*:\s*result\)/, 'image completion should redraw the current result, not its captured core result');
  assert.match(source, /TRANSLATE_STAGE_TIMEOUT_MS/, 'CDP translation calls need bounded stage timeouts');
  assert.match(source, /signal:\s*controller\.signal/, 'CDP fetch should be abortable');
  assert.doesNotMatch(source, /cdp_pdf_toolbar_overlay_legacy_fallback/, 'a visible core card should not start a second long full fallback after detail failure');
  assert.match(translatePopupSource, /translation timed out after/, 'React translation calls need the same bounded timeout');
  assert.doesNotMatch(translatePopupSource, /_legacy_fallback/, 'React should preserve the core card instead of starting a long detail fallback');
});

test('CDP helper repairs an expanded left sidebar stuck at opacity zero', () => {
  assert.match(source, /STATE_KEY\s*=\s*'__mcpRemNoteSelectionAssistantV7'/, 'live overlay should reinject the assistant and existing guards');
  assert.match(source, /__mcpRemNoteCevirOverlay25930FeaturedImageExportLive/, 'the first featured-image export overlay should be retired');
  assert.match(source, /__mcpRemNoteCevirOverlay25930SentenceHighlightV2Live/, 'the previous sentence-highlight overlay should be retired');
  assert.match(source, /__mcpRemNoteCevirOverlay25930ProgressRaceGuardLive/, 'the previous progress-race overlay should be retired');
  assert.match(source, /__mcpRemNoteCevirOverlay25928ActionsFirstSidebarOpacityGuard/, 'the previous action-first overlay should be retired');
  assert.match(source, /SIDEBAR_OPACITY_GRACE_MS\s*=\s*1500/, 'normal RemNote opacity transitions need a grace period');
  assert.match(source, /function\s+repairExpandedDocumentSidebarVisibility\s*\(/, 'focused sidebar visibility repair helper is required');
  assert.match(source, /DocumentSidebarDocumentsInner/, 'repair must target the native document-list wrapper');
  assert.match(source, /collapse-left-sidebar-button/, 'repair must run only while the left sidebar is expanded');
  assert.match(source, /Document Sidebar Item:/, 'repair must require real rendered sidebar rows');
  assert.match(source, /style\.setProperty\('opacity',\s*'1',\s*'important'\)/, 'stuck inline opacity should be overridden only after the guard passes');
  assert.match(source, /runHealthScan\(\)[\s\S]*repairExpandedDocumentSidebarVisibility\(\)/, 'the existing one-second health loop should keep the repair durable');
  assert.match(source, /releaseDocumentSidebarVisibilityGuard\(\);[\s\S]*removeStalePopupDom\(\)/, 'overlay cleanup should release its transient visibility override');
});

test('CDP translate popup removes stale DOM from older overlay versions', () => {
  assert.match(source, /function\s+removeStalePopupDom\s*\(/, 'stale popup cleanup helper is required');
  assert.match(source, /querySelectorAll\('\.mcp-cdp-cevir-popup'\)/, 'cleanup should target old CDP popup nodes');
  assert.match(
    source,
    /if\s*\(window\[STATE_KEY\]\?\.installed\)\s*\{[\s\S]*?return\s*\{[\s\S]*?alreadyInstalled:\s*true[\s\S]*?\};[\s\S]*?\}\s*removeStalePopupDom\(\);/,
    'reinjection of the current overlay must not remove an open popup'
  );
  assert.match(source, /removeStalePopupDom\(\);[\s\S]*for\s*\(const key of OLD_KEYS\)/, 'stale popup DOM should be removed before old overlay cleanup runs');
  assert.match(source, /state\.cleanup\s*=\s*\(\)\s*=>[\s\S]*removeStalePopupDom\(\)/, 'normal cleanup should also remove the visible popup');
});

test('plugin translate widgets are not registered on PDF highlight popup surfaces', () => {
  assert.doesNotMatch(pluginIndexSource, /plugin\.app\.registerWidget\([^)]*WidgetLocation\.PDFHighlightToolbarLocation/s, 'highlight toolbar widget should not add Cevir');
  assert.doesNotMatch(pluginIndexSource, /plugin\.app\.registerWidget\([^)]*WidgetLocation\.PDFHighlightPopupLocation/s, 'highlight popup widget should not add Cevir');
  assert.doesNotMatch(pluginIndexSource, /plugin\.app\.registerMenuItem\(\{[^}]*PluginCommandMenuLocation\.PDFHighlightPopupLocation/s, 'highlight popup menu item should not add Cevir');
  assert.match(pluginIndexSource, /unregisterWidget\(RETIRED_TRANSLATE_TOOLBAR_WIDGET,\s*WidgetLocation\.PDFHighlightToolbarLocation\)/, 'retired highlight toolbar widget should be removed from RemNote runtime');
  assert.match(pluginIndexSource, /unregisterWidget\(RETIRED_TRANSLATE_PDF_HIGHLIGHT_POPUP_WIDGET,\s*WidgetLocation\.PDFHighlightPopupLocation\)/, 'retired highlight popup widget should be removed from RemNote runtime');
  assert.match(pluginIndexSource, /unregisterMenuItem\(RETIRED_TRANSLATE_PDF_HIGHLIGHT_MENU_ID\)/, 'retired highlight popup menu item should be removed from RemNote runtime');
  assert.doesNotMatch(pluginIndexSource, /mcp-pdf-selection-toolbar-cevir/, 'old plugin DOM fallback should not inject a second Cevir button');
  assert.match(pluginIndexSource, /WidgetLocation\.SelectedTextMenu/, 'non-PDF selected-text menu translate widget should remain registered');
});

test('CDP helper pins the MCP Bridge right-sidebar tab to the first position', async () => {
  const {chromium}=require('playwright');
  let browser;
  try {
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort()); // No network or RemNote attachment.
    const html='<div id="document-sidebar"><div class="rn-widget-tab-bar overflow-x-auto"><div class="flex-shrink-0" data-tab="other"><img src="other.svg"></div><div class="flex-shrink-0" data-tab="mcp"><img src="2885417.svg"></div></div></div>';
    await page.setContent(html);
    let input=source;
    if(negativeControl==='missing-reapply') {
      const anchor='        moveMcpRightSidebarTabFirst();';
      assert.ok(input.includes(anchor));input=input.replace(anchor,'        /* negative control: omit reapply */');
    }
    await page.evaluate('('+productionFunction('injectedOverlay',input)+')(function(){}, "isolated-sidebar-contract")');
    const key='__mcpRemNoteSelectionAssistantV7';
    // Direct behavior: move the complete wrapper; repeat is idempotent.
    assert.equal(await page.evaluate(key=>window[key].moveRightSidebarTabFirst(),key),true);
    assert.deepEqual(await page.locator('.rn-widget-tab-bar > div').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab)),['mcp','other']);
    assert.equal(await page.evaluate(key=>window[key].moveRightSidebarTabFirst(),key),true);
    // Remount invalidates the previous wrapper: only the actual observer/event
    // scheduler may repair this new node, not a test call to the move helper.
    for(let i=0;i<2;i++) {
      await page.waitForTimeout(300);
      const allocated=await page.evaluate(html=>{
        document.body.innerHTML=html;
        const original=window.setTimeout;let count=0;
        window.setTimeout=function(...args){count++;return original.apply(this,args);};
        try {for(let n=0;n<100;n++)document.dispatchEvent(new Event('selectionchange'));}
        finally {window.setTimeout=original;}
        return count;
      },html);
      assert.ok(allocated>0&&allocated<=3,'selection burst must use one bounded scan wave, got '+allocated);
      await page.waitForFunction(()=>document.querySelector('.rn-widget-tab-bar')?.firstElementChild?.dataset.tab==='mcp',{},{timeout:2000});
      assert.equal(await page.locator('[data-tab="mcp"]').count(),1);
    }
    // Foreign icons and invalid tab-list containers must not be reordered.
    for(const invalid of [html.replace('2885417.svg','foreign.svg'),html.replace('overflow-x-auto','not-a-tab-list')]) {
      await page.evaluate(html=>{document.body.innerHTML=html;},invalid);
      assert.equal(await page.evaluate(key=>window[key].moveRightSidebarTabFirst(),key),false);
      assert.deepEqual(await page.locator('.rn-widget-tab-bar > div').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab)),['other','mcp']);
    }
    await page.evaluate(key=>window[key].cleanup(),key);
    await page.evaluate(html=>{document.body.innerHTML=html;document.dispatchEvent(new Event('selectionchange'));},html);
    await page.waitForTimeout(300);
    assert.deepEqual(await page.locator('.rn-widget-tab-bar > div').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab)),['other','mcp'],'cleanup must cancel reapply');
  } finally {if(browser) await browser.close();}
});

test('CDP translate popup can export the translation as a RemNote flashcard', () => {
  assert.match(source, /function\s+buildFlashcardPayload\s*\(/, 'flashcard payload builder is required');
  assert.match(source, /function\s+resolveFlashcardImageCandidate\s*\(/, 'flashcard export needs one canonical image resolver');
  assert.match(source, /normalizePopupImageCandidate\(result\?\.selectedImage\s*\|\|\s*result\?\.imageCandidate\)/, 'an explicitly selected image should win');
  assert.match(source, /getReadyImagePrefetch\(capture,\s*result\)\[0\]/, 'the visible prefetched recommendation should be the export fallback');
  assert.match(source, /buildImageDetailSection\(resolveFlashcardImageCandidate\(capture,\s*result\)\)/, 'the resolved visible image should become a flashcard detail');
  assert.match(source, /function\s+buildImageDetailSection\s*\(/, 'the resolved visual should be converted to a flashcard detail');
  assert.match(source, /function\s+parseRemNotePairedPageIdFromUrl\s*\(/, 'PDF page remId parser is required');
  assert.match(source, /function\s+buildFlashcardTargets\s*\(/, 'flashcard target builder is required');
  assert.match(source, /action:\s*'create_flashcard'/, 'popup should call the existing RemNote create_flashcard action');
  assert.match(source, /parentId:\s*REMNOTE_VOCAB_PARENT_ID/, 'flashcards should still go to the vocabulary page');
  assert.match(source, /label:\s*'PDF sayfasi'/, 'flashcards should also target the current PDF page');
  assert.match(source, /parentId:\s*pdfPageRemId/, 'PDF page flashcards should use the parsed page remId');
  assert.match(source, /for\s*\(const target of targets\)/, 'flashcard export should write each target');
  assert.match(source, /front:\s*capture\.selectedText/, 'selected PDF text should be the front side');
  assert.match(source, /function\s+formatFlashcardBack\s*\(/, 'flashcard back should have one canonical formatter');
  assert.match(source, /cleanModelText\(result\?\.directTranslation/, 'flashcard back should accept the live direct-translation result shape');
  assert.match(source, /return\s+text\s*\?\s*`\*\*Bağlam:\*\*\s*\$\{text\}`\s*:\s*''/, 'flashcard back should use the native bold Baglam label');
  assert.match(source, /back:\s*flashcardBack/, 'formatted contextual translation should be the back side');
  assert.match(source, /title:\s*'\*\*Detaylar\*\*'/, 'remaining sections should live under the Detaylar root');
  assert.match(source, /title:\s*`\*\*\$\{label\}\*\*`/, 'every direct Detaylar child title should be bold');
  assert.match(source, /imageUrls:\s*\[image\.imageUrl\]/, 'selected visual should be exported as imageUrls');
  assert.match(source, /Flashcard'a aktar/, 'popup should expose a visible flashcard export button');
});

test('CDP translate popup exposes mnemonic, image, and GPT-5.6-Sol helper buttons', () => {
  assert.match(source, /host_translate_mnemonic_candidates/, 'popup should request mnemonic candidates from the host');
  assert.match(source, /host_translate_image_candidates/, 'popup should request image candidates from the host');
  assert.match(source, /mcp-cdp-cevir-mnemonic-button/, 'Mnemonic button should be visible in the popup');
  assert.match(source, /mcp-cdp-cevir-image-button/, 'Gorsel button should be visible in the popup');
  assert.match(source, /mcp-cdp-cevir-gpt55-button/, 'Sol Medium button should be visible in the popup');
  assert.match(source, /mcp-cdp-cevir-high-polish-button/, 'High Mnemonic button should be visible in the popup');
  assert.match(source, /6\.1 Sol Medium/, 'GPT-6.1-Sol Medium helper label should be present');
  assert.match(source, /High Mnemonic/, 'High refinement helper label should explain that it is mnemonic-only');
  assert.match(source, /GPT-5\.6-Sol high ile en iyi tek mnemonic adayini secip parlatir/, 'High helper tooltip should explain the action');
  assert.match(source, /gpt56_sol_high_refine/, 'High Mnemonic should call the Sol high-refine host path');
  assert.match(source, /resultWithMnemonicCandidate/, 'selected mnemonic should update the visible translation result');
  assert.match(source, /function\s+prefetchGpt55MnemonicCandidates\s*\(/, 'Sol Medium candidates should be prefetched after the meaning core render');
  assert.match(source, /getReadyGpt55MnemonicPrefetch/, 'ready Sol candidates should be reused on click');
  assert.match(source, /Sol Hazir/, 'ready Sol state should be visible beside the 5.6 icon');
  assert.match(source, /6\.1 Sol Medium zaten hazirlaniyor/, 'pending Sol click should wait for the in-flight prefetch');
});

test('React translate popup prefetches and reuses the same Sol mnemonic request', () => {
  assert.match(translatePopupSource, /useRef/);
  assert.match(translatePopupSource, /function\s+createSolMnemonicPrefetchKey\s*\(/);
  assert.match(translatePopupSource, /const\s+solPrefetchRef\s*=\s*useRef/);
  assert.match(translatePopupSource, /const\s+prefetchSolMnemonicCandidates\s*=\s*\(\)/);
  assert.match(translatePopupSource, /current\.key\s*===\s*key\s*&&\s*current\.response/);
  assert.match(translatePopupSource, /current\.key\s*===\s*key\s*&&\s*current\.promise/);
  assert.match(translatePopupSource, /void\s+prefetchSolMnemonicCandidates\(\)\.catch/);
  assert.match(translatePopupSource, /5\.6 Sol Hazir/);
  assert.match(translatePopupSource, /onbellekten/);
});

test('React and CDP popups prefetch one featured visual and reuse it for alternatives', () => {
  assert.match(source, /imagePrefetchKey:\s*null/);
  assert.match(source, /function\s+getImagePrefetchKey\s*\(/);
  assert.match(source, /function\s+prefetchImageCandidates\s*\(/);
  assert.match(source, /getReadyImagePrefetch\(capture,\s*result\)\[0\]/);
  assert.match(source, /appendFeaturedVisual\(cardView,\s*readyFeaturedImage/);
  assert.match(source, /const\s+candidates\s*=\s*await\s+prefetchImageCandidates\(capture,\s*result\)/);
  assert.match(source, /gridTemplateColumns\s*=\s*'repeat\(auto-fit, minmax\(180px, 1fr\)\)'/);
  assert.match(source, /img\.style\.objectFit\s*=\s*image\.displayMode\s*\|\|\s*'contain'/);
  assert.match(source, /stage\.style\.alignItems\s*=\s*'start'/, 'featured summary should align with the top of the image instead of floating in the middle');
  assert.match(source, /img\.style\.height\s*=\s*image\.displayMode === 'contain' \? 'auto' : '142px'/, 'wide diagrams should keep their natural aspect ratio');
  assert.match(source, /img\.style\.maxHeight\s*=\s*image\.displayMode === 'contain' \? '128px' : 'none'/, 'diagram height should remain bounded');
  assert.match(source, /figure\.style\.maxWidth\s*=\s*'280px'/, 'featured images should fill their column without becoming oversized');
  assert.match(source, /cardView\.insertBefore\(actionRow,\s*featuredStage\)/, 'helper actions should stay above the featured summary and image');
  const reactToolRowIndex = translatePopupSource.indexOf('mcp-translate-popup__tool-row');
  const reactFeaturedStageIndex = translatePopupSource.indexOf('mcp-translate-popup__featured-stage');
  assert.ok(reactToolRowIndex >= 0 && reactToolRowIndex < reactFeaturedStageIndex, 'React helper actions should render before the featured summary and image');

  assert.match(translatePopupSource, /function\s+createImagePrefetchKey\s*\(/);
  assert.match(translatePopupSource, /const\s+imagePrefetchRef\s*=\s*useRef/);
  assert.match(translatePopupSource, /const\s+prefetchImageCandidates\s*=\s*\(\)/);
  assert.match(translatePopupSource, /setFeaturedImage\(featured\)/);
  assert.match(translatePopupSource, /void\s+prefetchImageCandidates\(\)\.catch/);
  assert.match(translatePopupSource, /mcp-translate-popup__featured-image/);
  assert.match(styleSource, /\.mcp-translate-popup__featured-image img[\s\S]*height:\s*142px/);
  assert.match(styleSource, /\.mcp-translate-popup__featured-image\.is-contain img\s*\{[\s\S]*height:\s*auto;[\s\S]*max-height:\s*128px/);
  assert.match(styleSource, /\.mcp-translate-popup__featured-stage\s*\{[\s\S]*align-items:\s*start/);
  assert.match(styleSource, /grid-template-columns:\s*repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
});

test('word translation starts one stable Sol prefetch as soon as the meaning core is ready', () => {
  const cdpKeyStart = source.indexOf('function getGpt55MnemonicPrefetchKey(capture, result)');
  const cdpKeyEnd = source.indexOf('function getReadyGpt55MnemonicPrefetch', cdpKeyStart);
  const cdpKeySource = source.slice(cdpKeyStart, cdpKeyEnd);
  assert.ok(cdpKeyStart >= 0 && cdpKeyEnd > cdpKeyStart, 'CDP prefetch key should be found');
  assert.match(cdpKeySource, /hasMeaningCore/, 'CDP should require a quality meaning core');
  assert.match(cdpKeySource, /targetText:\s*normalizeText\(result\?\.targetText\s*\|\|\s*capture\.selectedText\)/);
  assert.doesNotMatch(cdpKeySource, /partial|detailStatus|sections\.map/, 'CDP key must not wait for or depend on details');
  assert.match(
    source,
    /const showHostResult = \(envelope\) => \{[\s\S]*?prefetchGpt55MnemonicCandidates\(capture, resolvedResult\)/,
    'CDP should start Sol when the first core result is shown'
  );

  const reactKeyStart = translatePopupSource.indexOf('function createSolMnemonicPrefetchKey(');
  const reactKeyEnd = translatePopupSource.indexOf('async function requestTranslation', reactKeyStart);
  const reactKeySource = translatePopupSource.slice(reactKeyStart, reactKeyEnd);
  assert.ok(reactKeyStart >= 0 && reactKeyEnd > reactKeyStart, 'React prefetch key should be found');
  assert.match(reactKeySource, /hasMeaningCore/, 'React should require a quality meaning core');
  assert.match(reactKeySource, /targetText:\s*cleanText\(result\.targetText\s*\|\|\s*selectedText/);
  assert.doesNotMatch(reactKeySource, /partial|detailStatus|naturalPatterns|mnemonic:/, 'React key must stay stable across detail enrichment');
  assert.match(
    translatePopupSource,
    /useEffect\(\(\) => \{\s*if \(!result \|\| result\.mnemonic\) return;\s*void prefetchSolMnemonicCandidates\(\)/,
    'React should start Sol on the core result without waiting for details'
  );
});

test('normal Mnemonic click immediately starts the coalesced Sol request in both popup paths', () => {
  const cdpRequestStart = source.indexOf('const requestMnemonicCandidates = async (button, tier) =>');
  const cdpRequestEnd = source.indexOf('const requestImageCandidates = async', cdpRequestStart);
  const cdpRequestSource = source.slice(cdpRequestStart, cdpRequestEnd);
  const cdpPrefetchIndex = cdpRequestSource.indexOf('prefetchGpt55MnemonicCandidates(capture, result)');
  const cdpDefaultRequestIndex = cdpRequestSource.indexOf("source: useGpt55 ? 'gpt56sol' : 'default'");
  assert.ok(cdpRequestStart >= 0 && cdpRequestEnd > cdpRequestStart, 'CDP mnemonic request handler should be found');
  assert.match(cdpRequestSource, /if\s*\(tier\s*===\s*'default'\)/, 'normal CDP click should trigger Sol');
  assert.ok(cdpPrefetchIndex >= 0 && cdpPrefetchIndex < cdpDefaultRequestIndex, 'CDP Sol should start before the default request');

  const reactRequestStart = translatePopupSource.indexOf("const requestMnemonicCandidates = async (source: 'default' | 'gpt56sol') =>");
  const reactRequestEnd = translatePopupSource.indexOf('const requestImageCandidates = async', reactRequestStart);
  const reactRequestSource = translatePopupSource.slice(reactRequestStart, reactRequestEnd);
  const reactPrefetchIndex = reactRequestSource.indexOf('prefetchSolMnemonicCandidates()');
  const reactDefaultRequestIndex = reactRequestSource.indexOf("modelTier: 'default'");
  assert.ok(reactRequestStart >= 0 && reactRequestEnd > reactRequestStart, 'React mnemonic request handler should be found');
  assert.match(reactRequestSource, /if\s*\(source\s*===\s*'default'\)/, 'normal React click should trigger Sol');
  assert.ok(reactPrefetchIndex >= 0 && reactPrefetchIndex < reactDefaultRequestIndex, 'React Sol should start before the default request');
});

test('React and CDP translate popups expose a context-aware Kart and Sohbet interface', () => {
  assert.match(source, /25930SentenceHighlightV2Live/, 'CDP overlay key should force the sentence-highlight-v2 guard into the live page');
  assert.match(source, /topicChatSessions:\s*new Map\(\)/, 'CDP chat history should survive progressive popup rerenders');
  assert.match(source, /function\s+createTopicChatTabShell\s*\(/);
  assert.match(source, /mcp-cdp-cevir-tab mcp-cdp-cevir-tab-\$\{key\}/);
  assert.match(source, /makeTabButton\('card',\s*'▤',\s*'Kart'\)/);
  assert.match(source, /makeTabButton\('chat',\s*'···',\s*'Sohbet'\)/);
  assert.match(source, /host_translate_topic_chat/);
  assert.match(source, /Bu kullanim neden boyle\?/);
  assert.match(source, /Enter gonderir/);
  assert.match(source, /appendTopicChatAnswer/, 'chat answers should be rendered as safe text with controlled bold markup');

  assert.match(translatePopupSource, /activeTab.*'card'.*'chat'/);
  assert.match(translatePopupSource, /mcp-translate-popup__tabs/);
  assert.match(translatePopupSource, /mcp-translate-popup__chat-panel/);
  assert.match(translatePopupSource, /host_translate_topic_chat/);
  assert.match(translatePopupSource, /renderChatAnswer/);
  assert.match(translatePopupSource, /Shift\+Enter yeni satır/);
  assert.match(styleSource, /\.mcp-translate-popup__chat-composer/);
  assert.match(styleSource, /\.mcp-translate-popup__chat-message\.is-assistant/);
});

test('React and CDP translate popups identify the exact translated expression', () => {
  assert.match(source, /mcp-cdp-cevir-target-expression/, 'CDP popup should render a target-expression banner');
  assert.match(source, /result\?\.targetText\s*\|\|\s*clickedText/, 'CDP target should prefer the formatter targetText');
  assert.match(source, /ÇEVRİLEN İFADE/, 'CDP popup should label the translated target');
  assert.match(source, /Tıklanan:\s*\$\{clickedText\}\s*·\s*Otomatik kalıp/, 'CDP popup should distinguish clicked token from expanded phrase');

  assert.match(translatePopupSource, /const\s+translatedTarget\s*=\s*useMemo/);
  assert.match(translatePopupSource, /result\?\.targetText\s*\|\|\s*selectedText/, 'React target should prefer the formatter targetText');
  assert.match(translatePopupSource, /mcp-translate-popup__target/);
  assert.match(translatePopupSource, /Tıklanan:\s*\{selectedText\}\s*·\s*Otomatik kalıp/);
  assert.match(styleSource, /\.mcp-translate-popup__target\s*\{/);
  assert.match(styleSource, /grid-template-columns:\s*28px minmax\(0, 1fr\) auto/);
});

test('React and CDP topic chat show Spark first and replace it with the quality answer', () => {
  assert.match(source, /callHostTranslateHelper\('host_translate_topic_chat_quick'/, 'CDP should start the quick lane');
  assert.match(source, /callHostTranslateHelper\('host_translate_topic_chat',\s*payload\)/, 'CDP should start the quality lane from the same payload');
  assert.match(source, /qualityPending:\s*true/, 'CDP should mark the temporary answer');
  assert.match(source, /upsertAssistant\(\{\s*id:\s*messageId,\s*role:\s*'assistant'/, 'CDP should replace instead of duplicate the answer');
  assert.match(source, /Hizli yanit hazir; kalite tamamlaniyor/, 'CDP should explain the progressive state');
  const cdpQuickStart = source.indexOf("const quickTask = callHostTranslateHelper('host_translate_topic_chat_quick'");
  const cdpQuickAwait = source.indexOf('await quickTask;', cdpQuickStart);
  const cdpQualityStart = source.indexOf("callHostTranslateHelper('host_translate_topic_chat', payload)", cdpQuickStart);
  assert.ok(cdpQuickStart >= 0 && cdpQuickAwait > cdpQuickStart, 'CDP quick request and handoff should exist');
  assert.ok(cdpQualityStart > cdpQuickAwait, 'CDP quality request must start after the quick request settles');

  assert.match(translatePopupSource, /requestHostAction<TopicChatResponse>\('host_translate_topic_chat_quick'/, 'React should start the quick lane');
  assert.match(translatePopupSource, /requestHostAction<TopicChatResponse>\('host_translate_topic_chat'/, 'React should start the quality lane');
  assert.match(translatePopupSource, /findIndex\(\(message\)\s*=>\s*message\.id\s*===\s*messageId\)/, 'React should replace the temporary message by id');
  assert.match(translatePopupSource, /qualityPending:\s*true/, 'React should mark the temporary answer');
  const reactQuickStart = translatePopupSource.indexOf("const quickTask = requestHostAction<TopicChatResponse>('host_translate_topic_chat_quick'");
  const reactQuickAwait = translatePopupSource.indexOf('await quickTask;', reactQuickStart);
  const reactQualityStart = translatePopupSource.indexOf("requestHostAction<TopicChatResponse>('host_translate_topic_chat'", reactQuickStart);
  assert.ok(reactQuickStart >= 0 && reactQuickAwait > reactQuickStart, 'React quick request and handoff should exist');
  assert.ok(reactQualityStart > reactQuickAwait, 'React quality request must start after the quick request settles');
  assert.match(translatePopupSource, /Hızlı yanıt hazır; kalite tamamlanıyor/, 'React should expose the progressive state');
});

test('React and CDP topic chat composers keep Space, Backspace, and Delete inside the textarea', () => {
  assert.match(source, /function\s+isTopicChatTextarea\s*\(/, 'CDP should identify only the topic-chat textarea');
  assert.match(source, /function\s+isUnmodifiedSpaceKey\s*\(/, 'CDP should distinguish plain Space from modifier shortcuts');
  assert.match(source, /function\s+isUnmodifiedDeleteKey\s*\(/, 'CDP should distinguish editing deletes from modifier shortcuts');
  assert.match(source, /function\s+insertTopicChatTextareaText\s*\(/, 'CDP should restore text at the current selection');
  assert.match(source, /function\s+deleteTopicChatTextareaText\s*\(/, 'CDP should own Backspace and Delete before reader shortcuts');
  assert.match(source, /textarea\.setRangeText\(text,\s*start,\s*end,\s*'end'\)/, 'CDP insertion should preserve cursor and replacement behavior');
  assert.match(source, /textarea\.setRangeText\('',\s*deleteStart,\s*deleteEnd,\s*'end'\)/, 'CDP deletion should preserve cursor and selection behavior');
  assert.match(source, /textarea\.dispatchEvent\(new Event\('input',\s*\{\s*bubbles:\s*true\s*\}\)\)/, 'CDP insertion should update draft and send-button state');
  assert.match(source, /className\s*=\s*'mcp-cdp-cevir-chat-input'/, 'CDP chat textarea should have a scoped marker');
  assert.match(source, /function\s+handleWindowKeyDown\s*\(/, 'CDP should own Space before document-level PDF shortcuts');
  assert.match(source, /window\.addEventListener\('keydown',\s*handleWindowKeyDown,\s*true\)/, 'Space guard should run at window capture level');
  assert.match(source, /window\.removeEventListener\('keydown',\s*handleWindowKeyDown,\s*true\)/, 'Space guard cleanup should match its window registration');
  assert.match(source, /isTopicChatTextarea\(event\.target\)[\s\S]*isUnmodifiedSpaceKey\(event\)[\s\S]*event\.stopImmediatePropagation\(\)[\s\S]*insertTopicChatTextareaText\(event\.target,\s*' '\)/, 'window capture should block the PDF shortcut and restore Space');
  assert.match(source, /isUnmodifiedDeleteKey\(event\)[\s\S]*event\.stopImmediatePropagation\(\)[\s\S]*deleteTopicChatTextareaText\(event\.target,\s*event\.key\)/, 'window capture should block the PDF shortcut and apply Backspace or Delete');
  assert.match(topicChatSpaceVerifierSource, /Input\.dispatchKeyEvent/, 'live verification must use the browser input path, not only synthetic DOM events');
  assert.match(topicChatSpaceVerifierSource, /physicalInsertion/, 'live verification should report the physical Space result');
  assert.match(topicChatSpaceVerifierSource, /physicalBackspace/, 'live verification should report the physical Backspace result');
  assert.match(topicChatSpaceVerifierSource, /physicalDelete/, 'live verification should report the physical Delete result');

  const reactHandlerStart = translatePopupSource.indexOf('const handleChatKeyDown =');
  const reactHandlerEnd = translatePopupSource.indexOf('\n\n  useEffect(', reactHandlerStart);
  const reactHandlerSource = translatePopupSource.slice(reactHandlerStart, reactHandlerEnd);
  assert.ok(reactHandlerStart >= 0 && reactHandlerEnd > reactHandlerStart, 'React chat keyboard handler should be found');
  assert.match(reactHandlerSource, /event\.stopPropagation\(\)/, 'React chat keys should not bubble to reader shortcuts');
  assert.match(reactHandlerSource, /event\.key\s*===\s*' '/, 'React should own plain Space');
  assert.match(reactHandlerSource, /textarea\.setRangeText\(' ',\s*start,\s*end,\s*'end'\)/, 'React Space insertion should preserve cursor behavior');
  assert.match(reactHandlerSource, /event\.key\s*===\s*'Backspace'\s*\|\|\s*event\.key\s*===\s*'Delete'/, 'React should own Backspace and Delete');
  assert.match(reactHandlerSource, /deleteTextareaText\(textarea,\s*event\.key\)/, 'React should apply controlled textarea deletion');
  assert.match(reactHandlerSource, /setChatInput\(textarea\.value\)/, 'React controlled state should receive the inserted Space');
});

test('CDP translate helper candidate panels can be dismissed without choosing', () => {
  assert.match(source, /const\s+appendCandidatePanelDismiss\s*=\s*\(\)\s*=>/, 'candidate panel should have a dismiss helper');
  assert.match(source, /mcp-cdp-cevir-candidate-dismiss/, 'candidate panel should render a visible dismiss control');
  assert.match(source, /label\.textContent\s*=\s*'Adaylar'/, 'candidate panel should show a visible panel label');
  assert.match(source, /dismissButton\.textContent\s*=\s*'×'/, 'dismiss control should be a clear close glyph');
  assert.match(source, /Aday listesini kapat/, 'dismiss control should be accessible');
  assert.match(source, /const\s+clearCandidatePanel\s*=\s*\(\)\s*=>/, 'candidate panel clearing should be centralized');
  assert.match(source, /candidatePanel\.textContent\s*=\s*''[\s\S]*setCandidateStatus\(''\)/, 'dismiss should clear both panel and status text');
  assert.match(source, /appendCandidatePanelDismiss\(\)[\s\S]*candidates\.forEach/, 'dismiss control should be added before candidate rows');
});

test('CDP image candidate captions stay inside the popup', () => {
  assert.match(source, /function\s+shortenPopupUrl\s*\(/, 'long image source URLs should be shortened for the popup');
  assert.match(source, /shortenPopupUrl\(candidate\.pageUrl\)/, 'popup captions should use shortened URLs');
  assert.match(source, /function\s+imageCandidateDetailCaption\s*\(/, 'flashcard detail should keep a separate full-source caption');
  assert.match(source, /body:\s*imageCandidateDetailCaption\(image\)/, 'flashcard export should keep the full source URL');
  assert.match(source, /caption\.style\.overflowWrap\s*=\s*'anywhere'/, 'caption text should be allowed to break inside the panel');
  assert.match(source, /candidateButton\.style\.minWidth\s*=\s*'0'/, 'candidate rows should not overflow their grid container');
});

test('CDP translate popup renders natural patterns as hierarchical rows', () => {
  assert.match(source, /function\s+isNaturalPatternsSection\s*\(/, 'natural patterns section should be detected');
  assert.match(source, /function\s+appendNaturalPatternHierarchy\s*\(/, 'natural patterns should have a structured renderer');
  assert.match(source, /mcp-cdp-cevir-pattern-list/, 'natural patterns should render as a list container');
  assert.match(source, /mcp-cdp-cevir-pattern-term/, 'English pattern should be visually separated from its detail');
  assert.match(source, /function\s+fallbackNaturalPatternDetail\s*\(/, 'natural patterns without explicit detail should get a Turkish fallback detail');
  assert.match(source, /mcp-cdp-cevir-pattern-detail-fallback/, 'fallback detail should have a stable class');
  assert.match(source, /isNaturalPatternsSection\(section\)[\s\S]*appendNaturalPatternHierarchy\(body,\s*valueText,\s*result\)/, 'natural pattern sections should use the hierarchy renderer with result context');
});

test('CDP translate popup renders verb-pattern families with their own icon and rows', () => {
  assert.match(source, /verbPatterns:\s*'↗'/);
  assert.match(source, /key\s*===\s*'verbPatterns'/);
  assert.match(source, /asciiLabel\.includes\('phrasal verb'\)/);
  assert.match(source, /exampleEnglish:/, 'pattern rows should separate the English example');
  assert.match(source, /exampleTurkish:/, 'pattern rows should separate the Turkish example');
  assert.match(source, /fontStyle\s*=\s*'italic'/, 'English examples should use italic contrast');
  assert.match(source, /borderBottom\s*=\s*index\s*===\s*rows\.length\s*-\s*1/, 'rows should use separators instead of nested cards');
  assert.match(source, /background\s*=\s*'transparent'/, 'nested pattern cards should be removed');
});

test('React translate popup uses the same pattern typography hierarchy', () => {
  assert.match(translatePopupSource, /function\s+parsePatternDisplayRows\s*\(/);
  assert.match(translatePopupSource, /function\s+renderPatternSection\s*\(/);
  assert.match(translatePopupSource, /mcp-translate-popup__pattern-example-en/);
  assert.match(styleSource, /font-family:\s*'Segoe UI Variable Text'/);
  assert.match(styleSource, /\.mcp-translate-popup__section-value\s*\{[\s\S]*?font-weight:\s*400/);
  assert.match(styleSource, /\.mcp-translate-popup__pattern-term\s*\{[\s\S]*?font-weight:\s*700/);
  assert.match(styleSource, /\.mcp-translate-popup__pattern-example-en\s*\{[\s\S]*?font-style:\s*italic/);
});

test('CDP translate popup renders explanation bullets with markdown bold', () => {
  assert.match(source, /function\s+isExplanationSection\s*\(/, 'explanation section should be detected');
  assert.match(source, /function\s+appendMarkdownBoldInline\s*\(/, 'explanation should support markdown bold spans');
  assert.match(source, /function\s+parseExplanationLabelLine\s*\(/, 'Context Translator style label/body lines should be parsed');
  assert.match(source, /function\s+appendExplanationLabelBody\s*\(/, 'explanation labels and bodies should render separately');
  assert.match(source, /function\s+appendExplanationBlock\s*\(/, 'explanation should have a structured renderer');
  assert.match(source, /mcp-cdp-cevir-explanation-block/, 'explanation should render as a block container');
  assert.match(source, /mcp-cdp-cevir-explanation-bullet/, 'explanation bullets should render as rows');
  assert.match(source, /mcp-cdp-cevir-explanation-label/, 'piece labels should have a stable class');
  assert.match(source, /label\.style\.color\s*=\s*'#ffe27a'/, 'piece labels should use an explanation accent color');
  assert.match(source, /mcp-cdp-cevir-explanation-bold/, 'bold explanation spans should have a stable class');
  assert.match(source, /isExplanationSection\(section\)[\s\S]*appendExplanationBlock\(body,\s*valueText\)/, 'explanation sections should use the explanation renderer');
});

test('CDP translate popup renders etymology notes and rows as a table', () => {
  assert.match(source, /function\s+isEtymologySection\s*\(/, 'etymology section should be detected');
  assert.match(source, /function\s+parseEtymologyRows\s*\(/, 'etymology rows should be parsed');
  assert.match(source, /function\s+appendEtymologyBlock\s*\(/, 'etymology should have a structured renderer');
  assert.match(source, /mcp-cdp-cevir-etymology-table/, 'etymology rows should render as a table container');
  assert.match(source, /mcp-cdp-cevir-etymology-part/, 'word part should have a stable cell class');
  assert.match(source, /isEtymologySection\(section\)[\s\S]*appendEtymologyBlock\(body,\s*valueText\)/, 'etymology sections should use the table renderer');
});

test('CDP translate popup keeps status text out of the button row', () => {
  assert.match(source, /mcp-cdp-cevir-action-buttons/, 'helper buttons should live in a separate row');
  assert.match(source, /buttonRow\.appendChild\(mnemonicButton\)/, 'Mnemonic button should be appended to the button row');
  assert.match(source, /buttonRow\.appendChild\(highPolishButton\)/, 'High Mnemonic button should be appended to the button row');
  assert.match(source, /actionRow\.appendChild\(status\)[\s\S]*actionRow\.appendChild\(buttonRow\)/, 'status should be a full row above action buttons');
  assert.match(source, /status\.style\.width\s*=\s*'100%'/, 'status should receive full popup width');
  assert.match(source, /function\s+setPopupStatusText\s*\(/, 'status visibility should be centralized');
  assert.match(source, /status\.style\.display\s*=\s*nextText\s*\?\s*'block'\s*:\s*'none'/, 'empty status text should not reserve a narrow visible column');
});

test('CDP translate popup keeps action buttons readable under narrow width', () => {
  assert.match(source, /buttonRow\.style\.display\s*=\s*'grid'/, 'action buttons should use a stable grid layout');
  assert.match(source, /buttonRow\.style\.gridTemplateColumns\s*=\s*'repeat\(auto-fit,\s*minmax\(128px,\s*1fr\)\)'/, 'helper buttons should wrap responsively instead of squeezing');
  assert.match(source, /button\.style\.minWidth\s*=\s*'0'/, 'grid buttons should be allowed to fit their columns');
  assert.match(source, /button\.style\.width\s*=\s*'100%'/, 'action buttons should fill their grid columns');
  assert.match(source, /buttonRow\.style\.overflow\s*=\s*'visible'/, 'wrapped action buttons should remain visible');
  assert.match(source, /button\.style\.gridColumn\s*=\s*'1 \/ -1'/, 'flashcard export button should occupy its own full row');
  assert.match(source, /targetPopupWidth\s*=\s*Math\.min\(640,\s*usableWidth\)/, 'desktop popup width should have a roomier 640px cap');
  assert.match(source, /function\s+setPopupActionButtonContent\s*\(/, 'action buttons should render through icon+label helper');
  assert.match(source, /setPopupActionButtonContent\(mnemonicButton,\s*SECTION_ICON_BY_KEY\.mnemonic,\s*'Mnemonic'\)/, 'Mnemonic action should keep an icon');
  assert.match(source, /setPopupActionButtonContent\(imageButton,\s*SECTION_ICON_BY_KEY\.visualCue,\s*'Gorsel'\)/, 'Gorsel action should keep an icon');
});

test('CDP translate popup keeps action labels unclipped and section headers compact', () => {
  assert.match(source, /button\.style\.lineHeight\s*=\s*'1\.15'/, 'wrapped action labels should keep a compact readable line-height');
  assert.match(source, /button\.style\.overflow\s*=\s*'hidden'/, 'button content should not bleed into adjacent grid cells');
  assert.match(source, /button\.style\.minHeight\s*=\s*'38px'/, 'action buttons should leave room for icons and descenders');
  assert.match(source, /button\.style\.height\s*=\s*'auto'/, 'long labels should be allowed to wrap instead of clipping');
  assert.match(source, /buttonRow\.style\.gap\s*=\s*'7px'/, 'action grid gaps should stay compact');
  assert.match(source, /labelNode\.style\.overflow\s*=\s*'visible'/, 'action labels should not clip descenders');
  assert.match(source, /labelNode\.style\.paddingBottom\s*=\s*'1px'/, 'action labels should get a small descender buffer');
  assert.match(source, /labelNode\.style\.whiteSpace\s*=\s*'normal'/, 'action labels should wrap on narrow popup widths');
  assert.match(source, /header\.style\.display\s*=\s*'inline-flex'/, 'section headers should not occupy full-width bars');
  assert.match(source, /header\.style\.padding\s*=\s*'2px 7px 2px 5px'/, 'section headers should be compact');
  assert.match(source, /row\.style\.padding\s*=\s*'7px 10px'/, 'section cards should not waste vertical space');
  assert.match(source, /row\.style\.marginBottom\s*=\s*index === sections\.length - 1 \? '0' : '14px'/, 'section gaps should be smaller but readable');
  assert.match(source, /candidatePanel\.style\.display\s*=\s*'none'/, 'empty candidate panel should not reserve vertical space');
  assert.match(source, /const\s+showCandidatePanel\s*=\s*\(\)\s*=>\s*\{[\s\S]*candidatePanel\.style\.display\s*=\s*'grid'/, 'candidate panel should only appear when candidates exist');
});

test('CDP translate popup uses a readable content font scale', () => {
  assert.match(source, /STATE_KEY\s*=\s*'__mcpRemNoteSelectionAssistantV7'/, 'overlay key should force the assistant and current guards into the live page');
  assert.match(source, /__mcpRemNoteCevirOverlay25930ChatQuickFirstTimeoutV2Live/, 'the previous quick-first timeout overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25930FeaturedImageExportLive/, 'the first featured-image export overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25930SentenceHighlightV2Live/, 'the previous sentence-highlight overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25927AdaptiveFeaturedLayout/, 'the prior adaptive featured layout should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25925ContextExplanation/, 'the prior context-explanation overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25924ConceptVisual/, 'the prior concept-visual overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25924FeaturedVisualLayout/, 'the prior featured-layout overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25924FeaturedVisual/, 'the prior featured-visual overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25923EarlySolPrefetch/, 'the prior early-Sol overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25922TargetExpression/, 'the prior target-expression overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25921WindowSpaceGuard/, 'the prior window Space guard overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25920ProgressiveTopicChat/, 'the previous progressive-chat overlay should be cleaned before injection');
  assert.match(source, /__mcpRemNoteCevirOverlay25919ChatSpaceGuard/, 'the previous overlay should be cleaned before injection');
  assert.match(source, /'__mcpRemNoteCevirOverlay25918TopicChat'/, 'the prior topic chat overlay key should be cleaned up');
  assert.match(source, /'__mcpRemNoteCevirOverlay25914PatternTypography'/, 'the prior typography overlay key should be cleaned up');
  assert.match(source, /'__mcpRemNoteCevirOverlay2595SolMnemonicModelUi'/, 'the prior overlay key should be cleaned up');
  assert.match(source, /const\s+POPUP_TEXT_FONT\s*=\s*'15px'/, 'popup body text should be larger than the old 14px baseline');
  assert.match(source, /const\s+POPUP_TEXT_LINE_HEIGHT\s*=\s*'1\.48'/, 'popup body text should keep enough line height at 15px');
  assert.match(source, /body\.style\.fontSize\s*=\s*POPUP_TEXT_FONT/, 'section bodies should explicitly use the readable popup font');
  assert.match(source, /label\.style\.fontSize\s*=\s*'12px'/, 'section heading labels should not stay at the old 11px size');
  assert.match(source, /const\s+POPUP_CANDIDATE_FONT\s*=\s*'13px\/1\.4/, 'mnemonic and image candidates should use a readable small-text scale');
});

test('CDP translate popup shows the quality core before progressive details', () => {
  assert.match(source, /stage\s*===\s*'core'[\s\S]*?'host_translate_selection_core'/);
  assert.match(source, /stage\s*===\s*'details'[\s\S]*?'host_translate_selection_details'/);
  assert.match(source, /cdp_pdf_toolbar_overlay_core:/, 'visible click should start the quality-core lane');
  assert.match(source, /cdp_pdf_toolbar_overlay_details:/, 'detail lane should follow the quality core');
  assert.match(source, /\{\s*stage:\s*'details',\s*coreResult\s*\}/, 'detail request must reuse the displayed core');
  assert.doesNotMatch(source, /cdp_pdf_toolbar_overlay_legacy_fallback:/, 'detail failure should preserve the visible core instead of starting another long full call');
  assert.match(source, /result\?\.partial\s*===\s*true/, 'partial results should be marked in the popup renderer');
  assert.match(source, /Kaliteli ceviri hazir\. Aciklama, kaliplar ve etimoloji tamamlaniyor\.\.\./, 'core popup should show a quality progress note');
  assert.match(source, /if\s*\(!isPartialResult\s*&&\s*payload\?\.front\s*&&\s*payload\?\.back\)/, 'partial results must not expose flashcard export');
  assert.match(source, /details:\s*50000/, 'CDP detail deadline should exceed the host model lane ceiling');
  assert.match(source, /prefetchRetryKey:\s*null/, 'detail prefetch should track the failed selection key');
  assert.match(source, /prefetchRetryAfterAt:\s*0/, 'detail prefetch should track a bounded retry time');
  assert.match(source, /state\.prefetchRetryAfterAt\s*=\s*Date\.now\(\)\s*\+\s*60000/, 'failed detail prefetch should cool down for one minute');
  assert.match(source, /const\s+detailCoolingDown\s*=/, 'health scans should treat a cooling-down detail key as settled');
});

test('React Translate popup uses the same progressive quality contract', () => {
  assert.match(translatePopupSource, /'host_translate_selection_core'/);
  assert.match(translatePopupSource, /'host_translate_selection_details'/);
  assert.match(translatePopupSource, /stage:\s*'core'\s*\|\s*'details'\s*\|\s*'full'/);
  assert.match(translatePopupSource, /setResult\(core\)[\s\S]*setProgressStatus\('Kaliteli ceviri hazir/);
  assert.match(translatePopupSource, /'details',[\s\S]*core/);
  assert.match(translatePopupSource, /_core_fallback/, 'full fallback should remain available only when the core itself fails');
  assert.doesNotMatch(translatePopupSource, /_legacy_fallback/, 'detail failure should not start a second long full request');
  assert.match(translatePopupSource, /result\?\.partial\s*!==\s*true/, 'tools should stay hidden until details complete');
  assert.match(translatePopupSource, /stage\s*===\s*'details'\s*\?\s*50000/, 'React detail deadline should match the CDP headroom');
});

test('CDP flashcard export preserves sentence highlights in RemNote detail rich text', () => {
  assert.match(source, /function\s+formatFlashcardDetailBody\s*\(/, 'flashcard export should format detail bodies');
  assert.match(source, /FLASHCARD_HIGHLIGHT_COLOR\s*=\s*'Yellow'/, 'highlight marker should use RemNote Yellow inline color');
  assert.match(source, /toLocaleUpperCase\('tr-TR'\)/, 'highlighted flashcard text should keep Turkish uppercase conversion');
  assert.match(source, /\[\[\$\{FLASHCARD_HIGHLIGHT_COLOR\}:\$\{highlighted\}\]\]/, 'flashcard detail should encode the highlighted phrase as a RemNote inline marker');
  assert.match(
    source,
    /body:\s*formatFlashcardDetailBody\(section\)/,
    'detail toggles should receive formatted body text, not the plain section value'
  );
});

test('plugin sandbox script cache-buster tracks the active right sidebar build', () => {
  assert.match(
    webpackConfigSource,
    /20260703-compact-actions-25865/,
    'RemNote should not reuse the old sandbox bundle after this visible plugin update'
  );
});

test('CDP translate popup stays within small viewport bounds', () => {
  assert.match(source, /function\s+placePopupWithinViewport\s*\(/, 'responsive popup placement helper is required');
  assert.match(source, /function\s+clampNumber\s*\(/, 'popup placement should clamp coordinates');
  assert.match(source, /document\.documentElement\.clientWidth/, 'popup placement should read viewport width');
  assert.match(source, /document\.documentElement\.clientHeight/, 'popup placement should read viewport height');
  assert.match(source, /aboveSpace\s*>\s*belowSpace\s*&&\s*belowSpace\s*<\s*desiredPopupHeight/, 'popup should use the roomier side when the lower viewport cannot fit the content');
  assert.match(source, /popup\.style\.boxSizing\s*=\s*'border-box'/, 'popup padding should be included in its bounds');
  assert.match(source, /window\.addEventListener\('resize',\s*handleViewportChange,\s*true\)/, 'popup should reposition after viewport resize');
  assert.doesNotMatch(source, /window\.innerWidth\s*-\s*480/, 'old fixed-width left clamp should not be used');
});

test('CDP translate popup sanitizes model HTML before rendering or flashcard export', () => {
  assert.match(source, /function\s+stripModelMarkup\s*\(/, 'model HTML sanitizer is required');
  assert.match(source, /function\s+cleanModelText\s*\(/, 'popup text cleaner is required');
  assert.match(source, /sectionValue\(section\)/, 'structured sections should use sanitized values');
  assert.match(source, /cleanModelText\(result\?\.translation/, 'fallback translation should be sanitized');
  assert.match(source, /cleanModelText\(highlightText,\s*200\)/, 'highlight text should be sanitized');
  assert.match(source, /replace\(\/<\\\/\?\[A-Za-z\]\[A-Za-z0-9:-\]\*/, 'sanitizer should strip HTML-like tags');
});
