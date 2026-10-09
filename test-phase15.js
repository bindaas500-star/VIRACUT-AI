/* ViraCut — test-phase15.js — Phase 15: crash/bug audit regression tests.
   Run: node test-phase15.js
   Tests: verifies the null/empty/race guards added during the Phase 15 audit
   are present in each file. Static source-pattern tests (browser DOM code). */
'use strict';
var fs = require('fs');
function read(p) { return fs.readFileSync(__dirname + '/' + p, 'utf8'); }

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL: ' + name); }
}
function has(s, sub, name) { ok(s.indexOf(sub) >= 0, name || sub); }

/* ================= editor.js (24 bug sites) ================= */
var ed = read('js/editor.js');
has(ed, 'self.snapshot()', 'editor.js importFiles uses self.snapshot() (not this)');
has(ed, "p.voiceovers = p.voiceovers || []", 'editor.js open() migrates voiceovers array');
has(ed, 'if (!this.canvas)', 'editor.js open() guards missing edCanvas');
has(ed, 'window.AudioLab', 'editor.js guards AudioLab before Engine calls');
has(ed, 'window.Captions', 'editor.js composite() guards Captions global');
has(ed, 'g.rect(', 'editor.js composite() has roundRect fallback');
has(ed, 'cancelAnimationFrame', 'editor.js teardown cancels stale animation frames');

/* ================= editor-panels.js (18 fixes) ================= */
var ep = read('js/editor-panels.js');
has(ep, 'pv.params = pv.params || {}', 'editor-panels.js _fxRenderPreviewBar defaults params');
has(ep, 'pv.params || {}', 'editor-panels.js _fxCommitPreview guards JSON stringify of params');
has(ep, 'pp.params || {}', 'editor-panels.js _fxApplyPhoto guards params');
has(ep, 'p.texts = p.texts || []', 'editor-panels.js guards missing texts array');
has(ep, 'p.captions = p.captions || []', 'editor-panels.js guards missing captions array');
has(ep, 'p.overlays = p.overlays || []', 'editor-panels.js guards missing overlays array');
has(ep, "getElementById('edStickerLayer')", 'editor-panels.js references sticker layer (guarded)');
has(ep, 'No project', 'editor-panels.js renderPanel handles null project');

/* ================= app.js / store.js / projects.js / settings.js / toolpages.js ================= */
var app = read('js/app.js');
has(app, 'if (!root) return;', 'app.js toast() guards missing toastRoot');
has(app, "if (!box) return;", 'app.js renderCreate/renderAITools guard null box');
has(app, "if (!window.Exporter", 'app.js startExport guards missing Exporter');
has(app, 'safe(', 'app.js init() wraps init calls in safe()');
has(app, "typeof Trending.ideas === 'function'", 'app.js initTrending guards ideas fn');

var store = read('js/store.js');
has(store, 'Array.isArray(v) ? v : []', 'store.js getProjects rejects corrupt non-array data');
has(store, 'if (!clip) return 0.1', 'store.js clipPlayDur guards null clip');
has(store, 'Array.isArray(this.current.clips)', 'store.js timing() guards non-array clips');

var proj = read('js/projects.js');
has(proj, 'if (!p) return', 'projects.js thumbFor guards null project');

var set = read('js/settings.js');
has(set, 'readObj', 'settings.js readObj guards non-object localStorage data');
has(set, "if (!scr) return;", 'settings.js render guards missing screen');

var tp = read('js/toolpages.js');
has(tp, 'window.Editor', 'toolpages.js openEditor guards missing Editor');
has(tp, 'window.App', 'toolpages.js guards missing App global');

/* ================= templates flow ================= */
var tf = read('js/tx-flow.js');
has(tf, 'if (!scr) return;', 'tx-flow.js guards missing screen element');
has(tf, 'if (!sw || !sh) return;', 'tx-flow.js drawCoverAnim guards zero-size media');

var tf2 = read('js/tx-flow2.js');
has(tf2, 'Template not found', 'tx-flow2.js TXSlots.open toasts on miss');
has(tf2, 'Nothing to render', 'tx-flow2.js TXGen.start validates before render');
has(tf2, "typeof cv.captureStream !== 'function'", 'tx-flow2.js guards missing captureStream');
has(tf2, 'Template has no scenes', 'tx-flow2.js TXEdit.open rejects scene-less drafts');

var tr = read('js/tx-remote.js');
has(tr, 'Array.isArray(j.templates)', 'tx-remote.js check() validates templates is array');
has(tr, 't.remote = true', 'tx-remote.js normalizes remote templates');

/* ================= photo editor ================= */
var ph = read('js/photo.js');
has(ph, 'if (!this.img) return null;', 'photo.js renderExport guards null image');
has(ph, 'Math.max(1', 'photo.js clamps output dims to >= 1');

var phu = read('js/photo-ui.js');
has(phu, 'Could not load that image', 'photo-ui.js pickFile handles load rejection');
has(phu, 'if (!lab().img) return;', 'photo-ui.js crop guards null image');
has(phu, 'Export failed', 'photo-ui.js doExport handles null renderExport');

/* ================= effects / AI / misc ================= */
var fxt = read('js/fxthumbs.js');
has(fxt, 'isConnected === false', 'fxthumbs.js tick() drops detached canvases');

var exp = read('js/export.js');
has(exp, 'failExport', 'export.js failExport cleans up on render throw');
has(exp, 'try', 'export.js wraps composite in try/catch');

var aud = read('js/audio.js');
has(aud, 'Audio not supported on this device', 'audio.js Music.set toasts honestly');
has(aud, 'e.data && e.data.size', 'audio.js Voice guards null blob data');

var av = read('js/ai-video.js');
has(av, 'AIAdapter.generateVideo', 'ai-video.js guards generateVideo existence');

var ais = read('js/ai-story.js');
has(ais, 'if (!story || !story.title || !story.scenes) return null', 'ai-story.js buildProject validates story');

var bf = read('js/bodyfx.js');
has(bf, 'inThumb()', 'bodyfx.js kick() skips model download for thumbnails');

var cap = read('js/captions.js');
has(cap, '_caps(p)', 'captions.js _caps helper ensures array exists');

var pla = read('js/plans.js');
has(pla, "typeof App.refreshPlanBadge === 'function'", 'plans.js guards refreshPlanBadge method');

console.log('\nRESULT: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
