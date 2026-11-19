const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adapterSource = fs.readFileSync(path.join(__dirname, 'src', 'api', 'rem-adapter.ts'), 'utf8');

test('single-line emphasis fast paths cannot consume multiline flashcard details', () => {
  assert.match(adapterSource, /const boldMatch = text\.match\(\/\^\\\*\\\*\(\[\^\\r\\n\]\+\)/);
  assert.match(adapterSource, /const italicMatch = text\.match\(\/\^\\\*\(\[\^\\r\\n\]\+\)/);
  assert.match(adapterSource, /const boldPrefixMatch = text\.match\(\/\^\\\*\\\*\(\[\^\*\\r\\n\]\+\)/);
  assert.doesNotMatch(adapterSource, /const boldPrefixMatch = text\.match\([^\n]+\$\/s\);/);
});

test('multiline text falls through to the native RemNote markdown parser', () => {
  const prefixIndex = adapterSource.indexOf('const boldPrefixMatch');
  const markdownIndex = adapterSource.indexOf('this.plugin.richText.parseFromMarkdown(text)', prefixIndex);
  assert.ok(prefixIndex >= 0);
  assert.ok(markdownIndex > prefixIndex);
});

test('inline color markers preserve markdown before inside and after the marker', () => {
  assert.match(adapterSource, /await appendMarkdown\(before\)/);
  assert.match(adapterSource, /await appendMarkdown\(body, colorCodes\[colorName\], true\)/);
  assert.match(adapterSource, /await appendMarkdown\(after\)/);
  assert.match(adapterSource, /parseFromMarkdown\(fragment\)/);
  assert.match(adapterSource, /b: forceBold \|\| item\.b \|\| undefined, tc: textColor/);
});
