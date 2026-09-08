const fs = require('fs');
const assert = require('assert');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const html = fs.readFileSync('newtab.html', 'utf8');
const dashboard = fs.readFileSync('advanced-dashboard.js', 'utf8');

assert.equal(manifest.manifest_version, 3);
assert(manifest.permissions.includes('bookmarks'));
assert(html.includes('id="wet-glass-canvas"'));
assert(html.includes('id="command-overlay"'));
assert(html.includes('control-group-dashboard'));
assert(html.indexOf('id="rain-test-btn"') > html.indexOf('class="header-controls"'), 'Rain test control belongs in the header');
assert(html.includes('advanced-dashboard.js'));
assert(dashboard.includes("['http:', 'https:']"), 'URL protocol allowlist must remain present');
assert(dashboard.includes('widgetCloseMap'), 'Every widget must receive a direct close action');
assert(dashboard.includes('mergeDrops()'), 'Wet-glass rain must support merging drops');
assert(dashboard.includes('windTarget'), 'Wet-glass rain must support changing lateral wind');
assert(dashboard.includes("globalCompositeOperation = 'screen'"), 'Drops must retain a separate optical highlight pass');
assert(dashboard.includes('staticBead'), 'Static beads and travelling drops must use distinct silhouettes');
assert(dashboard.includes('preserveTrail(drop)'), 'Trails must be able to outlive their parent drop');
assert(dashboard.includes('splitDrop(drop)'), 'Large drops must split instead of growing without bound');
assert(!dashboard.includes('j % 9'), 'Streaks must not contain repeated satellite circles');
assert(dashboard.includes("lineCap = 'butt'"), 'Streak segments must not render as strings of round caps');
assert(!html.includes('workspace-profile'), 'Workspace profiles must remain removed');
assert(html.includes('id="tab-appearance"'), 'Appearance controls belong in Settings');
assert(!html.includes('fonts.googleapis.com'), 'Extension pages must not load remote fonts');
console.log('Chrome Home smoke tests passed');
