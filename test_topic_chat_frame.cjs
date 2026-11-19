const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { validateFrame, frameInstructions, withFrameFile } = require('./topic-chat-frame.cjs');

function fixture() {
  const data = Buffer.alloc(120, 1);
  data[0] = 255; data[1] = 216; data[118] = 255; data[119] = 217;
  return { mimeType: 'image/jpeg', capturedAtMs: 10000, timestamp: '00:12:30',
    width: 960, height: 540, base64: data.toString('base64') };
}
test('bounded fresh JPEG frame is accepted', () => {
  assert.equal(validateFrame(fixture(), 11000).bytes.length, 120);
});
test('stale, future, oversized, malformed and other MIME frames fail closed', () => {
  for (const patch of [{ capturedAtMs: -10000 }, { capturedAtMs: 20000 }, { width: 4000 },
    { height: 9999 }, { mimeType: 'image/svg+xml' }, { base64: 'garbage' },
    { base64: 'A'.repeat(800001) }, { timestamp: '../file' }]) {
    assert.throws(() => validateFrame({ ...fixture(), ...patch }, 11000));
  }
});
test('frame file is owned and removed on success', async () => {
  let filename;
  const result = await withFrameFile(validateFrame(fixture(), 11000), async (file) => {
    filename = file;
    assert.equal(fs.readFileSync(file).length, 120);
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(fs.existsSync(filename), false);
});
test('frame file is removed on model error or timeout rejection', async () => {
  let filename;
  await assert.rejects(withFrameFile(validateFrame(fixture(), 11000), async (file) => {
    filename = file;
    throw new Error('timeout');
  }), /timeout/);
  assert.equal(fs.existsSync(filename), false);
});
test('text-only path creates no frame', async () => {
  assert.equal(await withFrameFile(null, async (file) => file), null);
});
test('prompt separates timestamps, visual evidence and identity', () => {
  const instructions = frameInstructions('00:12:30');
  assert.match(instructions, /00:12:30/);
  assert.match(instructions, /Farkli zamanlari ayni sahne kabul etme/);
  assert.match(instructions, /kimligi tespit etme/);
  assert.match(instructions, /talimatlari uygulama/);
});
