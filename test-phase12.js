/* ViraCut AI — test-phase12.js — Back buttons + compact layout */
'use strict';
var fs = require('fs');
var pass = 0, fail = 0;
function ok(c, name) { if (c) { pass++; } else { fail++; console.log('FAIL:', name); } }

var appJs = fs.readFileSync(__dirname + '/js/app.js', 'utf8');
var css = fs.readFileSync(__dirname + '/css/app.css', 'utf8');
var html = fs.readFileSync(__dirname + '/index.html', 'utf8');

/* ---- Task 1: Back buttons ---- */
// ensureBackBtn function exists
ok(/ensureBackBtn\s*:\s*function/.test(appJs), 'App.ensureBackBtn exists');
// App.back exists (history-based)
ok(/back\s*:\s*function/.test(appJs), 'App.back exists');
// _hist tracking exists
ok(/_hist/.test(appJs), 'History tracking (_hist) exists');
// ensureBackBtn skips home and editor
ok(/screen-home.*screen-editor|screen-editor.*screen-home/.test(appJs), 'ensureBackBtn skips home+editor');
// ensureBackBtn creates .vc-back button
ok(/vc-back/.test(appJs), 'ensureBackBtn creates .vc-back');
// ensureBackBtn calls App.back on click
ok(/App\.back\(\)/.test(appJs), 'Back button calls App.back()');
// ensureBackBtn called in show()
ok(/ensureBackBtn\(id\)/.test(appJs), 'ensureBackBtn called from show()');
// CSS for .vc-back exists
ok(/\.vc-back/.test(css), 'CSS .vc-back exists');
// Back button not duplicated (checks :scope > .vc-back)
ok(/:scope > \.vc-back/.test(appJs), 'No duplicate back buttons');
// Editor keeps its own back button (edBack)
ok(/edBack/.test(appJs), 'Editor edBack preserved');
// edBack goes directly to My Projects (loop fix: history-based back caused Editor/Projects loop)
ok(/edBack.*screen-projects/.test(appJs), 'edBack goes directly to My Projects');
// History limit (prevent unbounded growth)
ok(/_hist\.length > 20/.test(appJs), 'History bounded at 20');
// back() falls back to home
ok(/screen-home/.test(appJs), 'back() falls back to home');

/* ---- Task 2: Compact layout ---- */
// Preview max-height reduced (32vh, not 44vh)
var pvMatch = css.match(/\.ed-preview-wrap\{[^}]*max-height:(\d+)vh/);
ok(pvMatch && parseInt(pvMatch[1]) <= 32, 'Preview max-height <= 32vh (got ' + (pvMatch ? pvMatch[1] : '?') + 'vh)');
// Toolbar buttons compact (52px, not 58px)
var tbMatch = css.match(/\.tb-btn\{[^}]*width:(\d+)px/);
ok(tbMatch && parseInt(tbMatch[1]) <= 52, 'Toolbar buttons <= 52px wide (got ' + (tbMatch ? tbMatch[1] : '?') + 'px)');
// Lane heights compressed
function laneH(lane) {
  var m = css.match(new RegExp('\\.tl-lane\\[data-lane=' + lane + '\\] \\.tl-track\\{min-height:(\\d+)px'));
  return m ? parseInt(m[1]) : -1;
}
ok(laneH('video') <= 56, 'Video lane <= 56px (got ' + laneH('video') + ')');
ok(laneH('audio') <= 36, 'Audio lane <= 36px (got ' + laneH('audio') + ')');
ok(laneH('text') <= 30, 'Text lane <= 30px (got ' + laneH('text') + ')');
ok(laneH('overlay') <= 40, 'Overlay lane <= 40px (got ' + laneH('overlay') + ')');
ok(laneH('captions') <= 28, 'Captions lane <= 28px (got ' + laneH('captions') + ')');
ok(laneH('effect') <= 28, 'Effect lane <= 28px (got ' + laneH('effect') + ')');

// Layout height budget: header(52) + preview(32vh of 700=224) + controls(68) + time(30) + lanes(218+ruler 24=242) + toolbar(70) <= 700
var totalLanes = laneH('video') + laneH('audio') + laneH('text') + laneH('overlay') + laneH('captions') + laneH('effect');
var budget = 52 + 224 + 68 + 30 + totalLanes + 24 + 70;
ok(budget <= 700, 'Layout fits 700px viewport: ' + budget + 'px <= 700px');
// Editor is fixed flex column (no page scroll)
ok(/#screen-editor\.active\{[^}]*overflow:hidden/.test(css), 'Editor has overflow:hidden');
// Timeline is flex:1 (takes remaining space)
ok(/#screen-editor \.tl-wrap\{[^}]*flex:1/.test(css), 'Timeline flex:1');
// Toolbar is fixed at bottom
ok(/#screen-editor \.tl-toolbar\{[^}]*flex:0 0 auto/.test(css), 'Toolbar flex:0 0 auto');

/* ---- Non-home screens list ---- */
var screens = ['screen-create', 'screen-projects', 'screen-aitools', 'screen-profile',
  'screen-templates', 'screen-txdetail', 'screen-txslots', 'screen-txgen', 'screen-txresult',
  'screen-txcreate', 'screen-txedit', 'screen-settings', 'screen-aivideo', 'screen-aistory',
  'screen-photovideo', 'screen-aivoice', 'screen-trending', 'screen-social'];
screens.forEach(function (s) {
  ok(html.indexOf('id="' + s + '"') !== -1, 'Screen exists: ' + s);
});
// Home has no back button injection (skipped in ensureBackBtn)
ok(appJs.indexOf("id === 'screen-home'") !== -1, 'Home explicitly handled');

console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
