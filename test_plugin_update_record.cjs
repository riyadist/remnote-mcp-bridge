const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = fs.readFileSync(path.join(__dirname, 'update_remnote_bridge.ps1'), 'utf8');
const version = '2.59.99';
const oldRecord = { version, updatedAt: '2025-01-02T03:04:05.000Z', verified: true };
const quote = value => `'${value.replace(/'/g, "''")}'`;

function fixture({ skipBuild = false, failBuild = false, mismatch = false, deployFail = false, startupFalse = false, receipt = null, missingPublished = false, capturePreload = false, repeats = 1, unchangedVersion = false, reloadFalse = false, reloadInnerFalse = false, reloadThrow = false, baselineUnknown = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remnote-update-record-'));
  fs.writeFileSync(path.join(dir, 'update_remnote_bridge.ps1'), source);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
  fs.mkdirSync(path.join(dir, 'dist'));
  if (receipt) {
    fs.writeFileSync(path.join(dir, 'plugin_update_info.json'), JSON.stringify(receipt));
    if (!missingPublished) fs.writeFileSync(path.join(dir, 'dist', `plugin-update-${version}.json`), JSON.stringify(receipt));
  }
  // Exercise the actual static-server preload and request handler without a real
  // listener or process. Its cache survives disk changes via this fixture snapshot.
  const serverFixture = path.join(dir, 'server-fixture.cjs');
  fs.writeFileSync(serverFixture, `
    const fs = require('node:fs');
    const vm = require('node:vm');
    let handler;
    const context = {
      require: name => name === 'node:http' ? { createServer: fn => { handler = fn; return { listen() {} }; } } : require(name),
      process: { argv: ['node', 'static-server', ${JSON.stringify(path.join(dir, 'dist'))}] },
      console: { log() {}, error() {} },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(__dirname, 'static-server.cjs'))}, 'utf8'), context);
    const cache = vm.runInContext('cache', context);
    const snapshot = ${JSON.stringify(path.join(dir, 'preload-cache.json'))};
    if (process.argv[2] === 'preload') {
      fs.writeFileSync(snapshot, JSON.stringify([...cache.entries()].map(([key, bytes]) => [key, bytes.toString('utf8')])));
    } else {
      cache.clear();
      for (const [key, text] of JSON.parse(fs.readFileSync(snapshot, 'utf8'))) cache.set(key, Buffer.from(text));
      let status;
      handler({ url: '/plugin-update-${version}.json', method: 'GET' }, {
        writeHead(code) { status = code; },
        end(bytes) { process.stdout.write(JSON.stringify({status, body: bytes.toString()})); },
      });
    }
  `);
  const preload = capturePreload ? `& node ${quote(serverFixture)} preload | Out-Null\n` : '';
  fs.writeFileSync(path.join(dir, 'ensure_local_plugin.ps1'), '$global:fixtureStarted=$true\n' + preload + (deployFail ? "throw 'fixture deployment failed'" : startupFalse ? "'{\"ok\":false}'" : "'{\"ok\":true}'"));
  // Run the real updater with only external process/network/build boundaries replaced.
  const script = `
    $ErrorActionPreference = 'Stop'
    $global:fixtureStarted = $false
    function Get-CimInstance { param($ClassName,$Filter); @() }
    function Stop-Process { throw 'UNEXPECTED PROCESS STOP' }
    function Start-Sleep { param($Seconds,$Milliseconds) }
    function npm {
      if ($args[1] -eq 'build') {
        [IO.Directory]::Delete(${quote(path.join(dir, 'dist'))}, $true)
        [IO.Directory]::CreateDirectory(${quote(path.join(dir, 'dist'))}) | Out-Null
      }
      $global:LASTEXITCODE = ${failBuild ? 1 : 0}
    }
    function Invoke-RestMethod {
      param($Uri,$TimeoutSec,$Method,$ContentType,$Body)
      if ($Uri -like '*/call') {
        $request = $Body | ConvertFrom-Json
        if ($request.action -eq 'get_status') {
          if (-not $global:fixtureStarted) { return @{ok=$${baselineUnknown ? 'false' : 'true'};result=@{pluginVersion='${unchangedVersion ? version : '2.59.98'}'}} }
          return @{ok=$true;result=@{pluginVersion='${mismatch ? '2.59.98' : version}'}}
        }
        ${reloadThrow ? "throw 'fixture reload failed'" : `return @{ok=$${reloadFalse ? 'false' : 'true'};result=@{ok=$${reloadInnerFalse ? 'false' : 'true'}}}`}
      }
      if ($Uri -like '*/health') { return [pscustomobject]@{ok=$true;pluginConnected=$true} }
      return @{version='${version}'}
    }
    & ${quote(path.join(dir, 'update_remnote_bridge.ps1'))} -SkipTypeCheck ${skipBuild ? '-SkipBuild' : ''} -ReloadTimeoutSeconds 0
  `;
  const read = file => fs.existsSync(path.join(dir, file)) ? JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) : null;
  const attempts = [];
  for (let i = 0; i < repeats; i++) {
    const started = Date.now();
    const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 15000 });
    const ended = Date.now();
    let served = null;
    if (capturePreload && fs.existsSync(path.join(dir, 'preload-cache.json'))) {
      const response = spawnSync(process.execPath, [serverFixture, 'serve'], { encoding: 'utf8', timeout: 5000 });
      assert.equal(response.status, 0, response.stderr);
      served = JSON.parse(response.stdout);
    }
    attempts.push({ run, started, ended, receipt: read('plugin_update_info.json'), published: read(`dist/plugin-update-${version}.json`), served });
  }
  const result = { ...attempts.at(-1), attempts };
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('verified successful build publishes completion UTC and authoritative receipt', () => {
  const f = fixture();
  assert.equal(f.run.status, 0, f.run.stderr);
  assert.ok(f.receipt, 'successful update needs authoritative receipt');
  assert.deepEqual(Object.keys(f.receipt).sort(), ['updatedAt', 'verified', 'version']);
  assert.equal(f.receipt.version, version);
  assert.equal(f.receipt.verified, true);
  assert.match(f.receipt.updatedAt, /Z$/);
  assert.ok(Date.parse(f.receipt.updatedAt) >= f.started && Date.parse(f.receipt.updatedAt) <= f.ended);
  assert.deepEqual(f.published, f.receipt);
});
test('reload-only without history does not invent an update date', () => {
  const f = fixture({ skipBuild: true });
  assert.equal(f.run.status, 0, f.run.stderr);
  assert.equal(f.receipt, null);
  assert.equal(f.published, null);
});
test('same-version reload preserves verified receipt date', () => {
  const f = fixture({ skipBuild: true, receipt: oldRecord });
  assert.deepEqual(f.receipt, oldRecord);
  assert.deepEqual(f.published, oldRecord);
});
for (const failure of ['failBuild', 'mismatch', 'deployFail']) {
  test(`${failure} does not fabricate a receipt when none exists`, () => {
    const f = fixture({ [failure]: true });
    assert.notEqual(f.run.status, 0);
    assert.equal(f.receipt, null);
    assert.equal(f.published, null);
  });
  test(`${failure} retains existing verified receipt and published file after dist removal`, () => {
    const f = fixture({ [failure]: true, receipt: oldRecord });
    assert.notEqual(f.run.status, 0);
    assert.deepEqual(f.receipt, oldRecord);
    assert.deepEqual(f.published, oldRecord);
  });
}
test('successful build with proved loaded-version transition replaces old date', () => {
  const f = fixture({ receipt: oldRecord });
  assert.equal(f.run.status, 0, f.run.stderr);
  assert.ok(f.receipt && f.receipt.updatedAt !== oldRecord.updatedAt);
  assert.deepEqual(f.published, f.receipt);
});
test('reload-only republishes missing dist record using original verified date', () => {
  const f = fixture({ skipBuild: true, receipt: oldRecord, missingPublished: true });
  assert.equal(f.run.status, 0, f.run.stderr);
  assert.deepEqual(f.receipt, oldRecord);
  assert.deepEqual(f.published, oldRecord);
});
for (const receipt of [
  { ...oldRecord, verified: 'true' },
  { ...oldRecord, updatedAt: '2099-01-02T03:04:05.000Z' },
  { ...oldRecord, updatedAt: 'not-a-date' },
]) {
  test(`invalid historical receipt is not published: ${receipt.updatedAt}/${receipt.verified}`, () => {
    const f = fixture({ skipBuild: true, receipt, missingPublished: true });
    assert.equal(f.run.status, 0, f.run.stderr);
    assert.deepEqual(f.receipt, receipt);
    assert.equal(f.published, null);
  });
}
test('actual Windows PowerShell 5.1 parser accepts updater', () => {
  const command = `$tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseFile(${quote(path.join(__dirname, 'update_remnote_bridge.ps1'))},[ref]$tokens,[ref]$errors)|Out-Null; if($errors.Count){$errors|Out-String|Write-Error;exit 1}; if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){exit 2}; 'PS5.1_PARSE_OK'`;
  const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /PS5.1_PARSE_OK/);
});
test('structured unsuccessful deployment does not overwrite successful receipt', () => {
  const f = fixture({ startupFalse: true, receipt: oldRecord });
  assert.deepEqual(f.receipt, oldRecord);
  assert.deepEqual(f.published, oldRecord);
});
test('repeated updates to same target after measured rollback serve new date instead of preloaded prior record', () => {
  const f = fixture({ receipt: oldRecord, capturePreload: true, repeats: 2 });
  let previousDate = oldRecord.updatedAt;
  for (const attempt of f.attempts) {
    assert.equal(attempt.run.status, 0, attempt.run.stderr);
    assert.equal(attempt.served.status, 200);
    assert.deepEqual(JSON.parse(attempt.served.body), attempt.receipt, 'real static-server handler must serve latest completion date');
    assert.notEqual(attempt.receipt.updatedAt, previousDate);
    previousDate = attempt.receipt.updatedAt;
  }
});
test('no-build server preload keeps original verified date', () => {
  const f = fixture({ skipBuild: true, receipt: oldRecord, capturePreload: true });
  assert.equal(f.run.status, 0, f.run.stderr);
  assert.equal(f.served.status, 200);
  assert.deepEqual(JSON.parse(f.served.body), oldRecord);
});
test('repeated unchanged-version rebuilds preserve history through actual server preload', () => {
  const f = fixture({ receipt: oldRecord, unchangedVersion: true, capturePreload: true, repeats: 2 });
  for (const attempt of f.attempts) {
    assert.equal(attempt.run.status, 0, attempt.run.stderr);
    assert.deepEqual(attempt.receipt, oldRecord);
    assert.equal(attempt.served.status, 200);
    assert.deepEqual(JSON.parse(attempt.served.body), oldRecord);
  }
});
for (const failure of ['unchangedVersion', 'reloadFalse', 'reloadInnerFalse', 'reloadThrow', 'baselineUnknown']) {
  test(`${failure} cannot advance successful update date`, () => {
    const f = fixture({ [failure]: true, receipt: oldRecord });
    assert.deepEqual(f.receipt, oldRecord);
    assert.deepEqual(f.published, oldRecord);
  });
  test(`${failure} without history stays unknown`, () => {
    const f = fixture({ [failure]: true });
    assert.equal(f.receipt, null);
    assert.equal(f.published, null);
  });
}
