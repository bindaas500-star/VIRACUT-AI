/* ViraCut — test-phase8.js — Phase 8 Effects System tests.
   Run: node test-phase8.js
   Tests: FXLIB registry (all listed effects exist with apply fns + params),
   search filter logic, subcategory mapping, segment active-at-time math,
   trim/move math, stacking order, default params, source-structure checks
   for browser UI / timeline lane / composite hook / export wiring. */
'use strict';
var fs = require('fs');
var fxlibSrc = fs.readFileSync(__dirname + '/js/fxlib.js', 'utf8');
var edSrc = fs.readFileSync(__dirname + '/js/editor.js', 'utf8');
var panSrc = fs.readFileSync(__dirname + '/js/editor-panels.js', 'utf8');
var html = fs.readFileSync(__dirname + '/index.html', 'utf8');
var css = fs.readFileSync(__dirname + '/css/app.css', 'utf8');
var exportSrc = fs.readFileSync(__dirname + '/js/export.js', 'utf8');

// ---- minimal DOM stubs so fxlib.js loads ----
var canvasStubs = [];
global.window = {};
global.document = {
  createElement: function (tag) {
    if (tag === 'canvas') {
      var cv = {
        width: 0, height: 0, style: {},
        getContext: function () {
          return {
            save: function () {}, restore: function () {}, translate: function () {},
            scale: function () {}, rotate: function () {}, fillRect: function () {},
            drawImage: function () {}, beginPath: function () {}, arc: function () {},
            fill: function () {}, strokeRect: function () {}, clip: function () {},
            ellipse: function () {}, createRadialGradient: function () {
              return { addColorStop: function () {} };
            },
            createLinearGradient: function () { return { addColorStop: function () {} }; },
            setTransform: function () {}, measureText: function () { return { width: 10 }; },
            canvas: cv, filter: 'none', globalAlpha: 1,
            globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '',
            lineWidth: 1, font: '', textAlign: '', imageSmoothingEnabled: true,
            fillText: function () {}
          };
        },
        toDataURL: function () { return 'data:image/png;base64,stub'; }
      };
      canvasStubs.push(cv);
      return cv;
    }
    return { style: {}, addEventListener: function () {}, appendChild: function () {} };
  }
};

require('/home/hatch/workspace/viracut/js/fxlib.js');
var FXLIB = global.window.FXLIB;
if (!FXLIB) { console.log('FAIL: FXLIB not loaded'); process.exit(1); }

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function hasSrc(s, sub) { return s.indexOf(sub) >= 0; }

// ---- 1. video effect registry ----
var expectedVideo = ['v_softblur', 'v_grain', 'v_rgbglitch', 'v_lightleak', 'v_zoom pulse',
  'v_shake', 'v_vhs', 'v_letterbox', 'v_colorshift', 'v_dreamglow', 'v_flash',
  'v_moblur', 'v_prism', 'v_pixel', 'v_oldfilm'];
ok(FXLIB.video.length >= 15, 'video effects count >= 15 (got ' + FXLIB.video.length + ')');
expectedVideo.forEach(function (id) {
  var d = FXLIB.get(id);
  ok(!!d, 'video effect exists: ' + id);
  ok(d && typeof d.apply === 'function', 'video effect has apply(): ' + id);
  ok(d && d.name && d.sub, 'video effect has name+sub: ' + id);
  ok(d && Array.isArray(d.params) && d.params.length > 0, 'video effect has params: ' + id);
  (d.params || []).forEach(function (p) {
    ok(p.key && p.label != null && p.min != null && p.max != null && p.def != null,
      'param shape ok: ' + id + '.' + p.key);
    ok(p.min <= p.def && p.def <= p.max, 'param default in range: ' + id + '.' + p.key);
  });
});

// ---- 2. subcategories ----
var subs = FXLIB.subcats.map(function (s) { return s.id; });
['trending', 'basic', 'glitch', 'retro', 'cinematic', 'light', 'camera'].forEach(function (s) {
  ok(subs.indexOf(s) >= 0, 'subcat exists: ' + s);
});
FXLIB.video.forEach(function (d) {
  ok(subs.indexOf(d.sub) >= 0, 'effect sub valid: ' + d.id + ' -> ' + d.sub);
});

// ---- 3. photo effects ----
var expectedPhoto = ['p_glow', 'p_bgblur', 'p_soft', 'p_film', 'p_vintage', 'p_pop', 'p_leak', 'p_motion', 'p_cine'];
ok(FXLIB.photo.length === 9, 'photo effects count == 9 (got ' + FXLIB.photo.length + ')');
expectedPhoto.forEach(function (id) {
  var d = FXLIB.get(id);
  ok(!!d, 'photo effect exists: ' + id);
  ok(d && (d.css || d.draw || d.id === 'p_motion'), 'photo effect has render path: ' + id);
});

// ---- 4. body (Phase 13: REAL free on-device AI) + AI honest placeholders ----
ok(FXLIB.body.length === 4, 'body effects count == 4 (real)');
ok(FXLIB.ai.length === 9, 'ai effects count == 9');
FXLIB.body.forEach(function (b) {
  ok(!b.unavailable && !b.badge, 'body effect is real (no badge): ' + b.name);
  ok(!!FXLIB.get(b.id) && typeof FXLIB.get(b.id).apply === 'function',
    'body effect in real registry with apply: ' + b.id);
});
FXLIB.ai.forEach(function (a) {
  ok(a.unavailable === 'api' && a.badge, 'ai honest badge: ' + a.name);
  ok(!FXLIB.get(a.id), 'ai effect NOT in real registry: ' + a.id);
});

// ---- 5. activeAt segment math ----
var segs = [
  { id: 's1', start: 2, dur: 3 },   // 2-5
  { id: 's2', start: 5, dur: 2 },   // 5-7
  { id: 's3', start: 4, dur: 4 }    // 4-8 (overlap)
];
var a1 = FXLIB.activeAt(segs, 1);
ok(a1.length === 0, 'activeAt: none before');
var a2 = FXLIB.activeAt(segs, 3);
ok(a2.length === 1 && a2[0].id === 's1', 'activeAt: s1 at t=3');
var a3 = FXLIB.activeAt(segs, 5);
ok(a3.length === 2 && a3[0].id === 's2' && a3[1].id === 's3', 'activeAt: boundary t=5 -> s2+s3 (stacking order preserved)');
var a4 = FXLIB.activeAt(segs, 6);
ok(a4.length === 2, 'activeAt: overlap t=6 -> 2 segs');
var a5 = FXLIB.activeAt(segs, 8);
ok(a5.length === 0, 'activeAt: none at end boundary');
ok(FXLIB.activeAt(null, 3).length === 0, 'activeAt: null-safe');

// ---- 6. defaultParams ----
var soft = FXLIB.get('v_softblur');
var dp = FXLIB.defaultParams(soft);
ok(dp.intensity === 8, 'defaultParams: softblur intensity=8');
var glitch = FXLIB.get('v_rgbglitch');
var dp2 = FXLIB.defaultParams(glitch);
ok(dp2.intensity === 60 && dp2.speed === 18, 'defaultParams: glitch has both');

// ---- 7. thumbnails (stubbed canvas) ----
var th = FXLIB.thumb('v_grain');
ok(typeof th === 'string' && th.indexOf('data:image') === 0, 'thumb returns dataURL');
var th2 = FXLIB.thumb('v_grain');
ok(th === th2, 'thumb cached (same string)');
// every video effect thumb generates without throwing
var thumbOk = true;
FXLIB.video.forEach(function (d) { try { FXLIB.thumb(d.id); } catch (e) { thumbOk = false; } });
ok(thumbOk, 'all video effect thumbs generate');
var pthumbOk = true;
FXLIB.photo.forEach(function (d) { try { FXLIB.thumb(d.id); } catch (e) { pthumbOk = false; } });
ok(pthumbOk, 'all photo effect thumbs generate');

// ---- 8. effect apply() functions run without throwing (stub ctx) ----
function stubCtx() {
  return {
    save: function () {}, restore: function () {}, translate: function () {},
    scale: function () {}, rotate: function () {}, fillRect: function () {},
    drawImage: function () {}, beginPath: function () {}, arc: function () {},
    fill: function () {}, strokeRect: function () {}, clip: function () {},
    ellipse: function () {}, createRadialGradient: function () { return { addColorStop: function () {} }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    canvas: { width: 72, height: 72 }, filter: 'none', globalAlpha: 1,
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: true
  };
}
var applyOk = true, applyErr = '';
FXLIB.video.forEach(function (d) {
  try { d.apply(stubCtx(), 72, 72, 1.3, { start: 0, dur: 3, params: FXLIB.defaultParams(d) }); }
  catch (e) { applyOk = false; applyErr = d.id + ': ' + e.message; }
});
ok(applyOk, 'all video apply() run clean' + (applyErr ? ' (' + applyErr + ')' : ''));
// animated effects differ across time (grain uses seeded t)
var grain = FXLIB.get('v_grain');
var calls = [];
var countingCtx = stubCtx();
var origFill = countingCtx.fillRect;
countingCtx.fillRect = function () { calls.push(1); origFill.apply(this, arguments); };
grain.apply(countingCtx, 72, 72, 0.1, { start: 0, dur: 3, params: { intensity: 50 } });
var n1 = calls.length;
calls = [];
grain.apply(countingCtx, 72, 72, 2.7, { start: 0, dur: 3, params: { intensity: 50 } });
ok(calls.length === n1 && n1 > 0, 'grain draws deterministic dot count per frame');

// ---- 9. source-structure checks: editor wiring ----
ok(hasSrc(edSrc, 'p.effects = p.effects || []'), 'editor: effects migration in open()');
ok(hasSrc(edSrc, 'drawEffectSegments'), 'editor: drawEffectSegments defined');
ok(hasSrc(edSrc, 'self.drawEffectSegments(g, W, H, t)'), 'editor: composite calls drawEffectSegments');
ok(hasSrc(edSrc, '_renderEffectLane'), 'editor: _renderEffectLane defined');
ok(hasSrc(edSrc, 'edTrackEffect'), 'editor: references edTrackEffect');
ok(hasSrc(edSrc, 'selFxId'), 'editor: selFxId selection state');
ok(hasSrc(edSrc, '_fxPreview'), 'editor: _fxPreview live-preview state');
ok(hasSrc(edSrc, 'FXLIB.renderSegments'), 'editor: uses FXLIB.renderSegments');

// ---- 10. panels: browser UI ----
ok(hasSrc(panSrc, 'panel_fx'), 'panels: panel_fx defined');
ok(hasSrc(panSrc, '_fxBrowser'), 'panels: _fxBrowser defined');
ok(hasSrc(panSrc, 'fxb-search'), 'panels: search bar');
ok(hasSrc(panSrc, '_fxRenderGrid'), 'panels: grid renderer');
ok(hasSrc(panSrc, 'panel_fx_adjust'), 'panels: adjustment panel');
ok(hasSrc(panSrc, '_fxApplyPreview'), 'panels: apply preview -> segment');
ok(hasSrc(panSrc, '_fxApplyPhoto'), 'panels: apply photo effect');
ok(hasSrc(panSrc, 'coming in Phase 2'), 'panels: honest body/AI toast');
ok(hasSrc(panSrc, 'project.effects.push'), 'panels: segment creation');
ok(hasSrc(panSrc, 'snapshot(); Store.persist()'), 'panels: undo/persist on mutate');

// ---- 11. html + css ----
ok(hasSrc(html, 'id="edTrackEffect"'), 'html: effect lane track');
ok(hasSrc(html, 'data-lane="effect"'), 'html: effect lane');
ok(hasSrc(html, 'js/fxlib.js'), 'html: fxlib script tag');
ok(hasSrc(css, '.fx-seg'), 'css: fx-seg style');
ok(hasSrc(css, '.fxb-grid'), 'css: browser grid style');
ok(hasSrc(css, 'repeat(4,1fr)'), 'css: 4-column grid');
ok(hasSrc(css, '.fxb-tile.sel'), 'css: selected tile style');
ok(hasSrc(css, '[data-lane=effect]'), 'css: effect lane height');

// ---- 12. export wiring: composite is shared ----
ok(hasSrc(exportSrc, 'Editor.composite(g, size.w, size.h, t, true)'), 'export: uses Editor.composite per frame (effects baked in)');

// ---- 13. effect segment trim math (mirrors _fxSegTrim) ----
function fxTrim(sg, which, dt) {
  var oStart = sg.start, oDur = sg.dur;
  if (which === 'l') {
    var ns = Math.max(0, Math.round((oStart + dt) * 100) / 100);
    var nd = Math.round((oDur - (ns - oStart)) * 100) / 100;
    if (nd >= 0.5) { sg.start = ns; sg.dur = nd; }
  } else {
    sg.dur = Math.max(0.5, Math.round((oDur + dt) * 100) / 100);
  }
  return sg;
}
var t1 = fxTrim({ start: 2, dur: 3 }, 'r', 1.5);
ok(t1.dur === 4.5 && t1.start === 2, 'fx trim right: extends duration');
var t2 = fxTrim({ start: 2, dur: 3 }, 'r', -2.8);
ok(t2.dur === 0.5, 'fx trim right: clamps to 0.5 min');
var t3 = fxTrim({ start: 2, dur: 3 }, 'l', 1);
ok(t3.start === 3 && t3.dur === 2, 'fx trim left: moves start, shrinks dur');
var t4 = fxTrim({ start: 2, dur: 3 }, 'l', -5);
ok(t4.start === 0 && t4.dur === 5, 'fx trim left: clamps start at 0');
var t5 = fxTrim({ start: 2, dur: 1 }, 'l', 0.8);
ok(t5.start === 2 && t5.dur === 1, 'fx trim left: blocked when dur would go < 0.5');

// ---- 14. segment move math ----
function fxMove(sg, dt) {
  sg.start = Math.max(0, Math.round((sg.start + dt) * 100) / 100);
  return sg;
}
var m1 = fxMove({ start: 2, dur: 3 }, 1.25);
ok(m1.start === 3.25, 'fx move: shifts start');
var m2 = fxMove({ start: 0.5, dur: 3 }, -2);
ok(m2.start === 0, 'fx move: clamps at 0');

// ---- 15. editor has trim/move handlers ----
ok(hasSrc(edSrc, '_fxSegTrim'), 'editor: _fxSegTrim defined');
ok(hasSrc(edSrc, '_fxSegDrag'), 'editor: _fxSegDrag defined');
ok(hasSrc(edSrc, 'trim-handle l'), 'editor: trim handles on selected segment');

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
