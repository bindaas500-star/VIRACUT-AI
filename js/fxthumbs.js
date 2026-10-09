/* ViraCut AI — fxthumbs.js — Live animated effect thumbnails (CapCut-style).
 * Each effect tile gets a small canvas with a looping animation showing the
 * effect in motion. Single shared rAF loop, viewport culling via
 * IntersectionObserver, pauses when browser closes or tab hides.
 * Base image: user's current video frame if available, else test pattern.
 */
(function () {
  'use strict';

  var LOOP = 2.5;      // seconds per animation loop
  var TILE = 96;       // tile canvas px (CSS scales to fit)
  var MAX_DT = 0.1;    // clamp dt after tab switch

  /* ---- test pattern (same visual language as FXLIB.thumb) ---- */
  function testPattern(g, W, H) {
    var gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#2b3a67'); gr.addColorStop(0.5, '#7b4b94'); gr.addColorStop(1, '#e86a92');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(W * 0.3, H * 0.35, W * 0.14, 0, 7); g.fill();
    g.fillStyle = '#06d6a0'; g.fillRect(W * 0.55, H * 0.5, W * 0.3, H * 0.3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 ' + Math.round(H * 0.2) + 'px sans-serif';
    g.textAlign = 'center'; g.fillText('Aa', W * 0.72, H * 0.3);
  }

  /* ---- base image: user's video frame if meaningful, else test pattern ---- */
  var _vidBase = null, _vidChecked = false, _baseCache = null;
  function captureVideoBase(W, H) {
    if (_vidChecked) return _vidBase;
    _vidChecked = true; _vidBase = null;
    try {
      var ed = document.getElementById('edCanvas');
      if (!ed || !ed.width || !ed.height) return null;
      var tmp = document.createElement('canvas');
      tmp.width = 24; tmp.height = 24;
      var tg = tmp.getContext('2d');
      if (!tg) return null;
      tg.drawImage(ed, 0, 0, 24, 24);
      var d;
      try { d = tg.getImageData(0, 0, 24, 24).data; } catch (e) { return null; }
      var sum = 0, n = 0, i;
      for (i = 0; i < d.length; i += 12) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
      if (sum / (n * 3) < 14) return null; // dark/empty = no video
      var out = document.createElement('canvas');
      out.width = W; out.height = H;
      var og = out.getContext('2d');
      var ar = ed.width / ed.height, sw, sh, sx, sy;
      if (ar >= 1) { sh = ed.height; sw = sh; sx = (ed.width - sw) / 2; sy = 0; }
      else { sw = ed.width; sh = sw; sx = 0; sy = (ed.height - sh) / 2; }
      og.drawImage(ed, sx, sy, sw, sh, 0, 0, W, H);
      _vidBase = out;
    } catch (e) { _vidBase = null; }
    return _vidBase;
  }
  function getBase(W, H) {
    var key = W + 'x' + H;
    if (_baseCache && _baseCache.key === key) return _baseCache.canvas;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var vid = captureVideoBase(W, H);
    if (vid) g.drawImage(vid, 0, 0, W, H);
    else testPattern(g, W, H);
    _baseCache = { key: key, canvas: cv };
    return cv;
  }

  /* ---- demo params: gentle intensity pulse so static effects also move ---- */
  function demoParams(def, t) {
    var p = window.FXLIB ? window.FXLIB.defaultParams(def) : {};
    var ph = (t / LOOP) * Math.PI * 2;
    var mult = 0.72 + 0.28 * Math.sin(ph);
    (def.params || []).forEach(function (pd) {
      if (/intensity|amount|blur|glow/i.test(pd.key || '')) p[pd.key] = pd.def * mult;
    });
    return p;
  }

  var _off = null;
  function offCanvas(W, H) {
    if (!_off) _off = document.createElement('canvas');
    if (_off.width !== W || _off.height !== H) { _off.width = W; _off.height = H; }
    return _off;
  }

  /* ---- render one animated frame ---- */
  function renderFrame(cv, effectId, t) {
    if (!window.FXLIB) return false;
    var def = window.FXLIB.get(effectId);
    if (!def || def.unavailable) return false;
    var W = cv.width || TILE, H = cv.height || TILE;
    var g = cv.getContext('2d');
    if (!g) return false;
    var base = getBase(W, H);
    g.save();
    if (g.setTransform) g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    if (!def.apply && !def.draw && def.css) g.filter = def.css; // css-only photo fx
    g.drawImage(base, 0, 0, W, H);
    g.filter = 'none';
    g.restore();
    var params = demoParams(def, t);
    var segLike = { start: 0, dur: LOOP, params: params };
    var isBody = def.id && def.id.indexOf('b_') === 0;
    if (isBody && window.BodyFX) { try { BodyFX.thumbBegin(); } catch (e) {} }
    try {
      if (def.apply) {
        def.apply(g, W, H, t, segLike, segLike);
      } else if (def.draw) {
        def.draw(g, W, H, t, { params: params }, params);
      } else if (def.id === 'p_motion') {
        // Ken Burns: seamless zoom oscillation
        var off = offCanvas(W, H), og = off.getContext('2d');
        og.save(); og.setTransform(1, 0, 0, 1, 0, 0);
        og.globalAlpha = 1; og.filter = 'none'; og.globalCompositeOperation = 'source-over';
        og.drawImage(cv, 0, 0, W, H); og.restore();
        var z = 1 + 0.16 * (0.5 + 0.5 * Math.sin((t / LOOP) * Math.PI * 2));
        g.save(); g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
        g.drawImage(off, 0, 0, W, H); g.restore();
      }
    } catch (e) { /* keep last good frame */ }
    if (isBody && window.BodyFX) { try { BodyFX.thumbEnd(); } catch (e) {} }
    return true;
  }

  /* ---- shared rAF loop with viewport culling ---- */
  var tiles = []; // {cv, effectId, t, lastTs, visible}
  var rafId = 0, io = null;

  function findTile(cv) {
    for (var i = 0; i < tiles.length; i++) if (tiles[i].cv === cv) return tiles[i];
    return null;
  }
  function ensureLoop() {
    if (rafId) return;
    var i, any = false;
    for (i = 0; i < tiles.length; i++) if (tiles[i].visible) { any = true; break; }
    if (any && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(tick);
  }
  function tick(ts) {
    rafId = 0;
    var i, tl, dt, anyVisible = false;
    for (i = 0; i < tiles.length; i++) {
      tl = tiles[i];
      // teardown: canvas removed from the page without FXTHUMBS.stop()
      if (tl.cv && tl.cv.isConnected === false) { tiles.splice(i, 1); i--; continue; }
      if (!tl.visible) continue;
      anyVisible = true;
      if (!tl.lastTs) tl.lastTs = ts;
      dt = (ts - tl.lastTs) / 1000;
      tl.lastTs = ts;
      if (!(dt >= 0)) dt = 0;
      if (dt > MAX_DT) dt = MAX_DT;
      tl.t = (tl.t + dt) % LOOP;
      try { renderFrame(tl.cv, tl.effectId, tl.t); } catch (e) {}
    }
    if (anyVisible && typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(tick);
    }
  }
  function onIO(entries) {
    var i, tl, v, changed = false;
    for (i = 0; i < entries.length; i++) {
      tl = findTile(entries[i].target);
      if (!tl) continue;
      v = !!entries[i].isIntersecting;
      if (tl.visible !== v) { tl.visible = v; changed = true; }
      if (v) tl.lastTs = 0;
    }
    if (changed) ensureLoop();
  }
  function ensureIO() {
    if (io || typeof IntersectionObserver !== 'function') return;
    try { io = new IntersectionObserver(onIO, { threshold: 0.08 }); } catch (e) { io = null; }
  }

  /* ---- pause when tab hidden ---- */
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (rafId && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(rafId); rafId = 0; }
        } else {
          var i;
          for (i = 0; i < tiles.length; i++) tiles[i].lastTs = 0;
          ensureLoop();
        }
      });
    }
  } catch (e) {}

  window.FXTHUMBS = {
    LOOP: LOOP, TILE: TILE,
    play: function (cv, effectId) {
      if (!cv || !effectId) return;
      this.stop(cv);
      ensureIO();
      // stagger start phase so tiles don't pulse in sync
      var tile = { cv: cv, effectId: effectId, t: Math.random() * LOOP, lastTs: 0, visible: !io };
      tiles.push(tile);
      if (io) { try { io.observe(cv); } catch (e) { tile.visible = true; } }
      // first frame immediately (no waiting for rAF)
      try { renderFrame(cv, effectId, tile.t); } catch (e) {}
      ensureLoop();
    },
    stop: function (cv) {
      for (var i = tiles.length - 1; i >= 0; i--) {
        if (tiles[i].cv === cv) {
          if (io) { try { io.unobserve(cv); } catch (e) {} }
          tiles.splice(i, 1);
        }
      }
      if (!tiles.length && rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId); rafId = 0;
      }
    },
    stopAll: function () {
      var i;
      if (io) for (i = 0; i < tiles.length; i++) { try { io.unobserve(tiles[i].cv); } catch (e) {} }
      tiles = [];
      if (rafId && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(rafId); rafId = 0; }
    },
    resetBase: function () { _vidChecked = false; _vidBase = null; _baseCache = null; },
    // test hooks
    _tileCount: function () { return tiles.length; },
    _visibleCount: function () { var n = 0, i; for (i = 0; i < tiles.length; i++) if (tiles[i].visible) n++; return n; },
    _renderFrame: renderFrame,
    _demoParams: demoParams,
    _wrapT: function (t, dt) { return (t + dt) % LOOP; }
  };
})();
