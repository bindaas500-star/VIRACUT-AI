/* ViraCut — test-phase13.js — Phase 13: FREE Body Effects (MediaPipe) + Auto Captions (Web Speech API).
   Run: node test-phase13.js
   Tests: BodyFX module structure, FXLIB body registry (4 real effects, no
   'unavailable' flags), get()/thumb() cover body ids, editor-panels wiring
   (model preload, tile tap, AI panel links), AutoCap module structure,
   captions panel transcribe button logic, index.html script tags. */
'use strict';
var fs = require('fs');
var fxlibSrc = fs.readFileSync(__dirname + '/js/fxlib.js', 'utf8');
var bodyfxSrc = fs.readFileSync(__dirname + '/js/bodyfx.js', 'utf8');
var autocapSrc = fs.readFileSync(__dirname + '/js/autocap.js', 'utf8');
var panSrc = fs.readFileSync(__dirname + '/js/editor-panels.js', 'utf8');
var thumbsSrc = fs.readFileSync(__dirname + '/js/fxthumbs.js', 'utf8');
var html = fs.readFileSync(__dirname + '/index.html', 'utf8');

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL: ' + name); }
}
function has(src, s, name) { ok(src.indexOf(s) >= 0, name || s); }

// ---------- BodyFX module ----------
has(bodyfxSrc, 'window.BodyFX', 'BodyFX exposes window.BodyFX');
has(bodyfxSrc, 'selfie_segmentation', 'BodyFX references MediaPipe selfie_segmentation CDN');
has(bodyfxSrc, 'cdn.jsdelivr.net', 'BodyFX uses jsdelivr CDN');
has(bodyfxSrc, "status: function", 'BodyFX exposes status()');
has(bodyfxSrc, "'idle'", 'BodyFX has idle status');
has(bodyfxSrc, "'loading'", 'BodyFX has loading status');
has(bodyfxSrc, "'ready'", 'BodyFX has ready status');
has(bodyfxSrc, "'failed'", 'BodyFX has failed status');
ok(bodyfxSrc.indexOf('failMsg') >= 0 && panSrc.indexOf('check internet') >= 0,
  'BodyFX fail path + honest internet message in UI');
has(bodyfxSrc, 'maskFor', 'BodyFX exposes maskFor()');
has(bodyfxSrc, 'personLayer', 'BodyFX exposes personLayer()');
has(bodyfxSrc, 'glowLayer', 'BodyFX exposes glowLayer()');
has(bodyfxSrc, 'synthMask', 'BodyFX exposes synthMask() for thumbnails');
has(bodyfxSrc, 'thumbBegin', 'BodyFX exposes thumbBegin()');
has(bodyfxSrc, 'thumbEnd', 'BodyFX exposes thumbEnd()');
has(bodyfxSrc, 'modelSelection', 'BodyFX sets modelSelection option');
has(bodyfxSrc, 'onResults', 'BodyFX wires onResults callback');
has(bodyfxSrc, '256', 'BodyFX segments at reduced resolution');
has(bodyfxSrc, 'ensure: ensure', 'BodyFX exposes ensure()');

// ---------- FXLIB body registry ----------
['b_bgblur', 'b_bodyglow', 'b_bgreplace', 'b_spotlight'].forEach(function (id) {
  has(fxlibSrc, "id: '" + id + "'", 'FXLIB has body effect ' + id);
});
ok(fxlibSrc.indexOf("unavailable = 'model'") < 0, 'No body effect marked unavailable/model');
ok(fxlibSrc.indexOf('Needs AI model') < 0, 'No "Needs AI model" badge text remains');
has(fxlibSrc, 'Background Blur', 'b_bgblur named Background Blur');
has(fxlibSrc, 'Body Glow', 'b_bodyglow named Body Glow');
has(fxlibSrc, 'BG Replace', 'b_bgreplace named BG Replace');
has(fxlibSrc, 'Spotlight', 'b_spotlight named Spotlight');
has(fxlibSrc, 'Free on-device AI', 'Body effects described as free on-device AI');
// get() covers BD
(function () {
  var getFn = fxlibSrc.match(/function get\(id\) \{[\s\S]*?\n  \}/);
  ok(!!getFn && getFn[0].indexOf('BD') >= 0, 'FXLIB.get() searches BD array');
})();
// thumb() covers BD + thumbBegin/End
(function () {
  var thFn = fxlibSrc.match(/function thumb\(id\) \{[\s\S]*?\n  \}/);
  ok(!!thFn && thFn[0].indexOf('BD') >= 0, 'FXLIB.thumb() searches BD array');
  ok(!!thFn && thFn[0].indexOf('thumbBegin') >= 0, 'FXLIB.thumb() wraps body in thumbBegin');
  ok(!!thFn && thFn[0].indexOf('thumbEnd') >= 0, 'FXLIB.thumb() wraps body in thumbEnd');
})();
// body effects use BodyFX helpers
has(fxlibSrc, 'BodyFX.kick', 'Body effects kick async segmentation');
has(fxlibSrc, 'BodyFX.maskFor', 'Body effects read cached mask');
has(fxlibSrc, 'BodyFX.personLayer', 'Body effects use personLayer');
has(fxlibSrc, 'BodyFX.inThumb', 'Body effects check thumbnail mode');
has(bodyfxSrc, 'destination-in', 'Person extraction uses destination-in composite');

// ---------- fxthumbs animated tiles ----------
has(thumbsSrc, 'thumbBegin', 'FXTHUMBS wraps body tiles in thumbBegin');
has(thumbsSrc, 'thumbEnd', 'FXTHUMBS wraps body tiles in thumbEnd');

// ---------- editor-panels: body tab ----------
has(panSrc, 'BodyFX.ensure()', 'Body tab pre-loads the model');
has(panSrc, 'Downloading free AI model', 'Tile tap shows honest loading toast');
has(panSrc, 'Model download failed', 'Tile tap shows honest failure toast');
ok(panSrc.indexOf('needs a downloadable AI segmentation model') < 0 ||
   panSrc.indexOf("it.unavailable === 'model'") >= 0,
   'Old model-block toast removed or unreachable');

// ---------- AutoCap module ----------
has(autocapSrc, 'window.AutoCap', 'AutoCap exposes window.AutoCap');
has(autocapSrc, 'webkitSpeechRecognition', 'AutoCap detects webkitSpeechRecognition');
has(autocapSrc, 'supported: supported', 'AutoCap exposes supported()');
has(autocapSrc, 'isActive: isActive', 'AutoCap exposes isActive()');
has(autocapSrc, 'continuous = true', 'AutoCap uses continuous mode');
has(autocapSrc, 'interimResults = true', 'AutoCap uses interim results');
has(autocapSrc, "rec.lang", 'AutoCap sets recognition language');
has(autocapSrc, 'not-allowed', 'AutoCap handles mic permission denial honestly');
has(autocapSrc, "'network'", 'AutoCap handles network errors honestly');
has(autocapSrc, 'No paid API', 'AutoCap documents no paid API');

// ---------- captions panel wiring ----------
has(panSrc, '_autoCapStart', 'Captions panel has _autoCapStart');
has(panSrc, '_autoCapGo', 'Captions panel has _autoCapGo');
has(panSrc, '_autoCapStop', 'Captions panel has _autoCapStop');
has(panSrc, 'AutoCap.supported()', 'Panel checks AutoCap.supported()');
has(panSrc, 'AutoCap.isActive()', 'Panel checks AutoCap.isActive()');
has(panSrc, "'en-US'", 'Language picker offers English');
has(panSrc, "'ur-PK'", 'Language picker offers Urdu');
has(panSrc, 'Captions.add(evt.text', 'Final transcripts become Captions.add() blocks');
has(panSrc, 'not available in this browser/WebView', 'Honest message when SR unsupported');
has(panSrc, '⏹ Stop transcribe', 'Panel shows Stop while transcribing');

// ---------- AI panel links ----------
has(panSrc, 'FREE →', 'AI panel marks free features');
has(panSrc, "go: 'captions'", 'AI panel links Auto Captions to captions tool');
has(panSrc, "go: 'fx-body'", 'AI panel links BG tools to body effects');

// ---------- index.html ----------
has(html, 'js/bodyfx.js?v=1', 'index.html loads bodyfx.js');
has(html, 'js/autocap.js?v=1', 'index.html loads autocap.js');
has(html, 'js/fxlib.js?v=3', 'index.html bumps fxlib.js to v3');
has(html, 'js/fxthumbs.js?v=3', 'index.html bumps fxthumbs.js to v3');
has(html, 'js/editor-panels.js?v=6', 'index.html bumps editor-panels.js to v6');
(function () {
  var bi = html.indexOf('js/bodyfx.js');
  var fi = html.indexOf('js/fxlib.js');
  ok(bi >= 0 && fi >= 0 && bi < fi, 'bodyfx.js loads before fxlib.js');
})();

// ---------- runtime smoke: load modules with DOM stubs ----------
(function () {
  var stubs = [];
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
              fill: function () {}, ellipse: function () {}, clearRect: function () {},
              createLinearGradient: function () { return { addColorStop: function () {} }; },
              createRadialGradient: function () { return { addColorStop: function () {} }; },
              setTransform: function () {}, measureText: function () { return { width: 10 }; },
              canvas: cv, filter: 'none', globalAlpha: 1,
              globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '',
              getImageData: function () { return { data: [] }; }
            };
          },
          toDataURL: function () { return 'data:,'; }
        };
        stubs.push(cv); return cv;
      }
      return { style: {}, setAttribute: function () {}, appendChild: function () {} };
    },
    querySelector: function () { return null; },
    head: { appendChild: function () {} }
  };
  try {
    eval(bodyfxSrc);
    ok(!!window.BodyFX, 'BodyFX loads in stub DOM');
    ok(window.BodyFX.status() === 'idle', 'BodyFX initial status is idle');
    ok(typeof window.BodyFX.ensure === 'function', 'BodyFX.ensure is a function');
    ok(typeof window.BodyFX.maskFor === 'function', 'BodyFX.maskFor is a function');
    window.BodyFX.thumbBegin();
    ok(window.BodyFX.inThumb() === true, 'BodyFX.inThumb true inside thumbBegin/End');
    window.BodyFX.thumbEnd();
    ok(window.BodyFX.inThumb() === false, 'BodyFX.inThumb false after thumbEnd');
    var sm = window.BodyFX.synthMask(72, 72);
    ok(sm && sm.width === 72 && sm.height === 72, 'BodyFX.synthMask returns 72x72 canvas');
  } catch (e) { ok(false, 'BodyFX stub load: ' + e.message); }
  // AutoCap without SpeechRecognition -> supported() false
  try {
    eval(autocapSrc);
    ok(!!window.AutoCap, 'AutoCap loads in stub DOM');
    ok(window.AutoCap.supported() === false, 'AutoCap.supported() false without SR');
    ok(window.AutoCap.isActive() === false, 'AutoCap.isActive() false initially');
  } catch (e) { ok(false, 'AutoCap stub load: ' + e.message); }
  // AutoCap with fake SR -> supported() true
  try {
    window.SpeechRecognition = function () {};
    delete require.cache[__filename];
    eval(autocapSrc);
    ok(window.AutoCap.supported() === true, 'AutoCap.supported() true with SR present');
    delete window.SpeechRecognition;
  } catch (e) { ok(false, 'AutoCap SR-present load: ' + e.message); }
  // fxlib body registry
  try {
    global.window.FXLIB = undefined;
    eval(fxlibSrc);
    var L = window.FXLIB;
    ok(!!L, 'FXLIB loads in stub DOM');
    ok(L.body && L.body.length === 4, 'FXLIB.body has 4 effects');
    ['b_bgblur', 'b_bodyglow', 'b_bgreplace', 'b_spotlight'].forEach(function (id) {
      var d = L.get(id);
      ok(!!d && typeof d.apply === 'function', 'FXLIB.get(' + id + ') returns def with apply');
      ok(!d.unavailable, 'FXLIB body ' + id + ' has no unavailable flag');
      ok(Array.isArray(d.params) && d.params.length > 0, 'FXLIB body ' + id + ' has params');
    });
    ok(L.get('b_nope') === null, 'FXLIB.get unknown id returns null');
  } catch (e) { ok(false, 'FXLIB stub load: ' + e.message); }
})();

console.log('RESULT: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
