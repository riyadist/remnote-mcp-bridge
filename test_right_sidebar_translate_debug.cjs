const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(__dirname, 'src', 'widgets', 'right_sidebar.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('right sidebar translate debug card is collapsed by default', () => {
  assert.match(
    source,
    /const \[isTranslateDebugExpanded, setTranslateDebugExpanded\] = useState<boolean>\(false\);/,
    'translate debug details should start collapsed to reduce sidebar height',
  );
});

test('right sidebar translate debug card uses an accessible toggle header', () => {
  assert.match(source, /aria-expanded=\{isTranslateDebugExpanded\}/, 'toggle should expose expanded state');
  assert.match(source, /aria-controls="translate-debug-details"/, 'toggle should point to the collapsible details region');
  assert.match(
    source,
    /onClick=\{\(\) => setTranslateDebugExpanded\(\(value\) => !value\)\}/,
    'header button should toggle the details region',
  );
});

test('right sidebar translate debug details render only when expanded', () => {
  assert.match(source, /id="translate-debug-details"/, 'details region should have a stable id');
  assert.match(
    source,
    /isTranslateDebugExpanded && latestTranslateTrace \? \(/,
    'trace details should not render while the card is collapsed',
  );
});
