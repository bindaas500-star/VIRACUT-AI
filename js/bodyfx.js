/* ViraCut AI — bodyfx.js — FREE on-device body segmentation (MediaPipe).
 * Loads MediaPipe Selfie Segmentation from CDN (first use needs internet,
 * then browser-cached). Runs at 256px for performance. Mask results are
 * cached per time-bucket so preview AND export share identical masks.
 * No paid API, no API key. If the model fails to load, status() = 'failed'
 * and callers show an honest message.
 */
(function () {
  'use strict';

  var CDN_SCRIPT = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
  var CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/';
  var SEG_W = 256;          // segmentation working width (perf)
  var BUCKET_FPS = 8;       // mask cache granularity
  var SEND_GAP_MS = 120;    // throttle model sends

  var _status = 'idle';     // idle | loading | ready | failed
  var _failMsg = '';
  var _seg = null;
  var _busy = false;
  var _lastSend = 0;
  var _masks = {};          // bucket -> canvas
  var _latest = null;       // most recent mask canvas
  var _pendingKey = null;
  var _thumbDepth = 0;      // >0 while rendering thumbnails (use synth mask)

  var _small = null, _tmp = {};

  function smallCanvas() {
    if (!_small) _small = document.createElement('canvas');
    return _small;
  }
  function tmpCanvas(W, H) {
    var key = W + 'x' + H, c = _tmp[key];
    if (!c) { c = document.createElement('canvas'); c.width = W; c.height = H; _tmp[key] = c; }
    return c;
  }
  function bucket(t) { return Math.max(0, Math.floor((+t || 0) * BUCKET_FPS)); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-bodyfx]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true; s.setAttribute('data-bodyfx', '1');
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script load failed')); };
      document.head.appendChild(s);
      setTimeout(function () { reject(new Error('script load timeout')); }, 30000);
    });
  }

  function initSegmenter() {
    var SS = window.SelfieSegmentation;
    if (!SS) throw new Error('SelfieSegmentation missing after script load');
    var seg = new SS({
      locateFile: function (f) { return CDN_BASE + f; }
    });
    seg.setOptions({ modelSelection: 1, selfieMode: false });
    seg.onResults(function (res) {
      _busy = false;
      try {
        var m = res && res.segmentationMask;
        if (m && _pendingKey != null) {
          var c = document.createElement('canvas');
          c.width = SEG_W; c.height = Math.max(1, Math.round(SEG_W * (m.height / m.width)));
          var g = c.getContext('2d');
          g.drawImage(m, 0, 0, c.width, c.height);
          _masks[_pendingKey] = c;
          _latest = c;
        }
      } catch (e) { /* keep old masks */ }
      _pendingKey = null;
    });
    return seg;
  }

  var _readyPromise = null;
  function ensure() {
    if (_status === 'ready') return Promise.resolve(true);
    if (_status === 'failed') return Promise.resolve(false);
    if (_readyPromise) return _readyPromise;
    _status = 'loading';
    _readyPromise = loadScript(CDN_SCRIPT)
      .then(function () { _seg = initSegmenter(); _status = 'ready'; return true; })
      .catch(function (e) {
        _status = 'failed';
        _failMsg = (e && e.message) || 'load failed';
        return false;
      });
    return _readyPromise;
  }

  /* Ask the model to segment the current frame (async, throttled).
     frameCanvas: canvas holding the current video frame; W,H its size. */
  function kick(frameCanvas, W, H, t) {
    if (inThumb()) return; // thumbnails use the synthetic mask — never download the model for them
    if (_status === 'idle') { ensure(); return; }
    if (_status !== 'ready' || !_seg || _busy) return;
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - _lastSend < SEND_GAP_MS) return;
    var key = bucket(t);
    if (_masks[key]) return; // already have this bucket
    try {
      var sc = smallCanvas();
      var sh = Math.max(1, Math.round(SEG_W * H / Math.max(1, W)));
      if (sc.width !== SEG_W || sc.height !== sh) { sc.width = SEG_W; sc.height = sh; }
      var sg = sc.getContext('2d');
      sg.save(); sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalAlpha = 1; sg.globalCompositeOperation = 'source-over';
      sg.drawImage(frameCanvas, 0, 0, SEG_W, sh);
      sg.restore();
      _busy = true; _pendingKey = key; _lastSend = now;
      _seg.send({ image: sc });
    } catch (e) { _busy = false; _pendingKey = null; }
  }

  /* Sync: best cached mask for project time t (canvas), or null. */
  function maskFor(t) {
    var m = _masks[bucket(t)];
    return m || _latest || null;
  }

  /* Person-only layer: frame with background transparent (via mask). */
  function personLayer(frameCanvas, maskCanvas, W, H) {
    var c = tmpCanvas(W, H), g = c.getContext('2d');
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.drawImage(frameCanvas, 0, 0, W, H);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(maskCanvas, 0, 0, W, H);
    g.restore();
    return c;
  }

  /* Soft glow halo from mask (color string, blur px). */
  function glowLayer(maskCanvas, W, H, color, blurPx) {
    var c = tmpCanvas(W, H), g = c.getContext('2d');
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    // tint mask to glow color
    g.drawImage(maskCanvas, 0, 0, W, H);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.restore();
    // blur it on a second temp for the halo
    var c2 = tmpCanvas(W, H), g2 = c2.getContext('2d');
    g2.save();
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.globalAlpha = 1; g2.globalCompositeOperation = 'source-over';
    g2.clearRect(0, 0, W, H);
    try { g2.filter = 'blur(' + Math.max(1, blurPx) + 'px)'; } catch (e) {}
    g2.drawImage(c, 0, 0, W, H);
    try { g2.filter = 'none'; } catch (e) {}
    g2.restore();
    return c2;
  }

  /* Synthetic person silhouette (head + shoulders) for thumbnails —
     lets effect tiles animate without downloading the model. */
  function synthMask(W, H) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(W * 0.5, H * 0.32, W * 0.13, 0, 7); g.fill(); // head
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.72, W * 0.20, H * 0.26, 0, 0, 7); g.fill(); // torso
    return c;
  }

  function thumbBegin() { _thumbDepth++; }
  function thumbEnd() { _thumbDepth = Math.max(0, _thumbDepth - 1); }
  function inThumb() { return _thumbDepth > 0; }

  window.BodyFX = {
    ensure: ensure,
    kick: kick,
    maskFor: maskFor,
    personLayer: personLayer,
    glowLayer: glowLayer,
    synthMask: synthMask,
    thumbBegin: thumbBegin,
    thumbEnd: thumbEnd,
    inThumb: inThumb,
    status: function () { return _status; },
    failMsg: function () { return _failMsg; },
    clear: function () { _masks = {}; _latest = null; }
  };
})();
