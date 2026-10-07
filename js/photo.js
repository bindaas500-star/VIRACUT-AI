/* ViraCut AI — photo.js — PhotoLab engine (photo editor core).
 *
 * Non-destructive editing: every edit is a params object; the render
 * pipeline redraws from the original image. Undo/redo = param snapshots.
 * Preview renders at <=1600px; export renders at full/chosen resolution.
 */
(function () {
  'use strict';

  var PREVIEW_MAX = 1600;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var HSL_CHANNELS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

  function defaultParams() {
    var hsl = {};
    HSL_CHANNELS.forEach(function (ch) { hsl[ch] = { h: 0, s: 0, l: 0 }; });
    return {
      // light / basic (-100..100 unless noted)
      brightness: 0, exposure: 0, contrast: 0,
      highlights: 0, shadows: 0, whites: 0, blacks: 0,
      saturation: 0, vibrance: 0, temperature: 0, tint: 0,
      sharpness: 0, clarity: 0, texture: 0, dehaze: 0,
      fade: 0, grain: 0, vignette: 0,
      // color
      hsl: hsl,
      colorBalance: { shadows: 0, midtones: 0, highlights: 0 }, // -100..100 warm/cool
      // curves: arrays of [x,y] 0..255
      curves: {
        rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]],
        g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]]
      },
      // crop & transform
      crop: { x: 0, y: 0, w: 1, h: 1 }, // fractions of transformed image
      rotate: 0, // 0/90/180/270
      flipH: false, flipV: false,
      // filter preset
      filter: null, // {id, intensity}
      straighten: 0 // -45..45 degrees
    };
  }

  /* ================= image helpers ================= */
  function loadImageFile(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () { res({ img: im, url: url, name: file.name || 'photo' }); };
      im.onerror = rej;
      im.src = url;
    });
  }
  function naturalSize(img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    return { w: w, h: h };
  }
  // fit inside max, keep aspect
  function fitSize(w, h, max) {
    var s = Math.min(1, max / Math.max(w, h));
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }

  /* ================= pixel pipeline ================= */
  // Build a 256-entry LUT from curve points [[x,y]...]
  function curveLUT(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
    var lut = new Array(256), i, k = 0;
    for (i = 0; i < 256; i++) {
      while (k < p.length - 2 && i > p[k + 1][0]) k++;
      var p0 = p[k], p1 = p[k + 1];
      var t = p1[0] === p0[0] ? 0 : (i - p0[0]) / (p1[0] - p0[0]);
      t = clamp(t, 0, 1);
      lut[i] = clamp(Math.round(p0[1] + (p1[1] - p0[1]) * t), 0, 255);
    }
    return lut;
  }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      var tc = [h + 1 / 3, h, h - 1 / 3], out = [];
      for (var i = 0; i < 3; i++) {
        var t = tc[i] < 0 ? tc[i] + 1 : tc[i] > 1 ? tc[i] - 1 : tc[i];
        if (t < 1 / 6) out[i] = p + (q - p) * 6 * t;
        else if (t < 1 / 2) out[i] = q;
        else if (t < 2 / 3) out[i] = p + (q - p) * (2 / 3 - t) * 6;
        else out[i] = p;
      }
      r = out[0]; g = out[1]; b = out[2];
    }
    return [clamp(Math.round(r * 255), 0, 255), clamp(Math.round(g * 255), 0, 255), clamp(Math.round(b * 255), 0, 255)];
  }
  // channel index by hue: 0 red,1 orange,2 yellow,3 green,4 aqua,5 blue,6 purple,7 magenta
  function hueChannel(h) {
    if (h < 15 || h >= 345) return 0;
    if (h < 45) return 1; if (h < 75) return 2; if (h < 150) return 3;
    if (h < 195) return 4; if (h < 255) return 5; if (h < 285) return 6;
    return 7;
  }

  // Main pixel adjustment pass. src/dst are ImageData.
  function applyPixels(imgData, P, W, H) {
    var d = imgData.data, n = d.length, i;
    var lutR = curveLUT(P.curves.r), lutG = curveLUT(P.curves.g),
        lutB = curveLUT(P.curves.b), lutRGB = curveLUT(P.curves.rgb);
    var expo = Math.pow(2, P.exposure / 50); // -100..100 → 0.25x..4x
    var bri = P.brightness * 1.27;
    var con = P.contrast / 100, conF = (259 * (con * 128 + 255)) / (255 * (259 - con * 128));
    var sat = 1 + P.saturation / 100, vib = P.vibrance / 100;
    var temp = P.temperature / 100, tint = P.tint / 100;
    var fade = P.fade / 100, grain = P.grain / 100;
    var hl = P.highlights / 100, sh = P.shadows / 100, wh = P.whites / 100, bl = P.blacks / 100;
    var cb = P.colorBalance;
    var hasHSL = false, ci;
    for (ci = 0; ci < 8; ci++) {
      var ch = P.hsl[HSL_CHANNELS[ci]];
      if (ch.h || ch.s || ch.l) { hasHSL = true; break; }
    }
    var hasCurves = P.curves.rgb.length !== 2 || P.curves.r.length !== 2 ||
                    P.curves.g.length !== 2 || P.curves.b.length !== 2 ||
                    lutRGB[0] !== 0 || lutRGB[255] !== 255;
    for (i = 0; i < n; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      // exposure + brightness
      r = r * expo + bri; g = g * expo + bri; b = b * expo + bri;
      // contrast around 128
      r = conF * (r - 128) + 128; g = conF * (g - 128) + 128; b = conF * (b - 128) + 128;
      // tonal zones (luminance-weighted)
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var hlW = clamp((lum - 0.6) / 0.4, 0, 1), shW = clamp((0.4 - lum) / 0.4, 0, 1);
      r += hl * 60 * hlW + sh * 60 * shW + wh * 40 * lum - bl * 40 * (1 - lum);
      g += hl * 60 * hlW + sh * 60 * shW + wh * 40 * lum - bl * 40 * (1 - lum);
      b += hl * 60 * hlW + sh * 60 * shW + wh * 40 * lum - bl * 40 * (1 - lum);
      // temperature / tint
      r += temp * 22; b -= temp * 22; g += tint * 14; r -= tint * 7; b -= tint * 7;
      // color balance (warm/cool per zone)
      var cbAmt = cb.shadows * shW + cb.midtones * (1 - Math.abs(lum - 0.5) * 2) + cb.highlights * hlW;
      r += cbAmt * 0.35; b -= cbAmt * 0.35;
      // saturation + vibrance (vibrance favors less-saturated pixels)
      var avg = (r + g + b) / 3;
      var satAmt = 1 + (sat - 1);
      var vibAmt = vib * (1 - clamp(Math.max(Math.abs(r - avg), Math.abs(g - avg), Math.abs(b - avg)) / 128, 0, 1));
      var sF = satAmt + vibAmt;
      r = avg + (r - avg) * sF; g = avg + (g - avg) * sF; b = avg + (b - avg) * sF;
      // dehaze: midtone contrast + saturation
      if (P.dehaze) {
        var dz = P.dehaze / 100, mid = clamp(1 - Math.abs(lum - 0.5) * 2, 0, 1);
        r = r + (r - 128) * 0.35 * dz * mid; g = g + (g - 128) * 0.35 * dz * mid; b = b + (b - 128) * 0.35 * dz * mid;
        r -= dz * 8; g -= dz * 8; b -= dz * 8;
      }
      // per-channel HSL
      if (hasHSL) {
        var hsl = rgb2hsl(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255));
        var adj = P.hsl[HSL_CHANNELS[hueChannel(hsl[0])]];
        if (adj.h || adj.s || adj.l) {
          var rgb2 = hsl2rgb(hsl[0] + adj.h * 1.8, clamp(hsl[1] * (1 + adj.s / 100), 0, 1), clamp(hsl[2] + adj.l / 200, 0, 1));
          r = rgb2[0]; g = rgb2[1]; b = rgb2[2];
        }
      }
      // curves
      if (hasCurves) {
        r = lutRGB[lutR[clamp(Math.round(r), 0, 255)]];
        g = lutRGB[lutG[clamp(Math.round(g), 0, 255)]];
        b = lutRGB[lutB[clamp(Math.round(b), 0, 255)]];
      }
      // fade (lift blacks)
      if (fade) { r = r + (128 - r) * fade * 0.35; g = g + (128 - g) * fade * 0.35; b = b + (128 - b) * fade * 0.35; }
      d[i] = clamp(Math.round(r), 0, 255);
      d[i + 1] = clamp(Math.round(g), 0, 255);
      d[i + 2] = clamp(Math.round(b), 0, 255);
    }
    // grain (deterministic per-pixel)
    if (grain) {
      for (i = 0; i < n; i += 4) {
        var px = i / 4, gx = (px % W), gy = Math.floor(px / W);
        var nz = (Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453);
        nz = (nz - Math.floor(nz) - 0.5) * 2 * grain * 28;
        d[i] = clamp(d[i] + nz, 0, 255); d[i + 1] = clamp(d[i + 1] + nz, 0, 255); d[i + 2] = clamp(d[i + 2] + nz, 0, 255);
      }
    }
    // vignette
    if (P.vignette) {
      var vg = P.vignette / 100, cx = W / 2, cy = H / 2, maxD = Math.sqrt(cx * cx + cy * cy);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var idx = (y * W + x) * 4;
        var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD;
        var vAmt = 1 - clamp((dist - 0.45) / 0.55, 0, 1) * Math.abs(vg) * (vg > 0 ? 0.75 : -0.5);
        d[idx] = clamp(d[idx] * vAmt, 0, 255); d[idx + 1] = clamp(d[idx + 1] * vAmt, 0, 255); d[idx + 2] = clamp(d[idx + 2] * vAmt, 0, 255);
      }
    }
    return imgData;
  }

  // Unsharp-mask convolution. radius 1 = fine (sharpness), 2 = broad (clarity/texture).
  function applySharpness(imgData, W, H, amount, radius) {
    if (!amount) return imgData;
    radius = radius || 1;
    var src = new Uint8ClampedArray(imgData.data), d = imgData.data;
    var k = clamp(amount / 100, -1, 1) * 0.9, i, x, y;
    var ox = radius, oy = radius * W;
    for (y = radius; y < H - radius; y++) for (x = radius; x < W - radius; x++) {
      i = (y * W + x) * 4;
      for (var c = 0; c < 3; c++) {
        var lap = -src[i - oy * 4 + c] - src[i - ox * 4 + c] - src[i + ox * 4 + c] - src[i + oy * 4 + c] + 4 * src[i + c];
        d[i + c] = clamp(src[i + c] + lap * k, 0, 255);
      }
    }
    return imgData;
  }

  /* ================= render pipeline ================= */
  // Returns a canvas with the photo fully rendered at target size.
  function renderPhoto(img, P, targetW, targetH) {
    var PF = window.PhotoFilters || null;
    // stamp filter preset into a working copy of params
    var PW = P;
    if (P.filter && PF && P.filter.id) {
      PW = clone(P);
      PF.stamp(PW, P.filter.id, (P.filter.intensity == null ? 80 : P.filter.intensity) / 100);
    }
    var ns = naturalSize(img);
    // 1. rotate/flip base
    var rot = ((P.rotate % 360) + 360) % 360;
    var bw = (rot === 90 || rot === 270) ? ns.h : ns.w;
    var bh = (rot === 90 || rot === 270) ? ns.w : ns.h;
    var base = document.createElement('canvas');
    base.width = bw; base.height = bh;
    var bg = base.getContext('2d');
    bg.save();
    bg.translate(bw / 2, bh / 2);
    if (P.flipH) bg.scale(-1, 1);
    if (P.flipV) bg.scale(1, -1);
    if (P.straighten) bg.rotate(P.straighten * Math.PI / 180);
    bg.rotate(rot * Math.PI / 180);
    bg.drawImage(img, -ns.w / 2, -ns.h / 2, ns.w, ns.h);
    bg.restore();
    // 2. crop (fractions)
    var cw = Math.max(1, Math.round(bw * P.crop.w)), ch = Math.max(1, Math.round(bh * P.crop.h));
    var cx = Math.round(bw * P.crop.x), cy = Math.round(bh * P.crop.y);
    // 3. scale to target (fit crop box into target)
    var out = document.createElement('canvas');
    out.width = targetW; out.height = targetH;
    var g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(base, cx, cy, cw, ch, 0, 0, targetW, targetH);
    // 4. main adjustments pixel pass (filter preset already stamped into PW)
    var imgData = g.getImageData(0, 0, targetW, targetH);
    applyPixels(imgData, PW, targetW, targetH);
    applySharpness(imgData, targetW, targetH, PW.sharpness, 1);
    // clarity (broad local contrast) & texture (fine detail) at two radii
    if (PW.clarity) applySharpness(imgData, targetW, targetH, PW.clarity * 0.55, 3);
    if (PW.texture) applySharpness(imgData, targetW, targetH, PW.texture * 0.7, 1);
    g.putImageData(imgData, 0, 0);
    // 5. filter overlay FX (light leaks, dust, washes)
    if (P.filter && PF && P.filter.id) {
      g.save();
      PF.overlay(g, targetW, targetH, P.filter.id, (P.filter.intensity == null ? 80 : P.filter.intensity) / 100);
      g.restore();
    }
    return out;
  }

  /* ================= PhotoLab state ================= */
  var PL = {
    img: null, imgName: 'photo', imgURL: null,
    params: defaultParams(),
    history: [], hIndex: -1,
    beforeCanvas: null, // original preview for compare
    previewCanvas: null,
    projectId: null,

    open: function (img, name, url) {
      this.img = img; this.imgName = name || 'photo'; this.imgURL = url || null;
      this.params = defaultParams();
      this.history = []; this.hIndex = -1;
      this.beforeCanvas = null; this.previewCanvas = null;
      this.projectId = null;
      this.commit('open');
    },
    setParam: function (path, val) {
      var p = this.params, keys = path.split('.');
      for (var i = 0; i < keys.length - 1; i++) p = p[keys[i]];
      p[keys[keys.length - 1]] = val;
    },
    getParam: function (path) {
      var p = this.params, keys = path.split('.');
      for (var i = 0; i < keys.length; i++) p = p[keys[i]];
      return p;
    },
    commit: function (label) {
      this.history = this.history.slice(0, this.hIndex + 1);
      this.history.push({ label: label || 'edit', params: clone(this.params) });
      if (this.history.length > 60) this.history.shift();
      this.hIndex = this.history.length - 1;
    },
    undo: function () {
      if (this.hIndex > 0) { this.hIndex--; this.params = clone(this.history[this.hIndex].params); return true; }
      return false;
    },
    redo: function () {
      if (this.hIndex < this.history.length - 1) { this.hIndex++; this.params = clone(this.history[this.hIndex].params); return true; }
      return false;
    },
    resetAll: function () {
      var cropKeep = clone(this.params.crop), rot = this.params.rotate,
          fh = this.params.flipH, fv = this.params.flipV, st = this.params.straighten;
      this.params = defaultParams();
      this.params.crop = cropKeep; this.params.rotate = rot;
      this.params.flipH = fh; this.params.flipV = fv; this.params.straighten = st;
      this.commit('reset');
    },
    renderPreview: function () {
      if (!this.img) return null;
      var ns = naturalSize(this.img);
      var s = fitSize(ns.w, ns.h, PREVIEW_MAX);
      // account for crop aspect in preview size
      var cw = this.params.crop.w, ch = this.params.crop.h;
      var pw = Math.max(1, Math.round(s.w * cw)), ph = Math.max(1, Math.round(s.h * ch));
      this.previewCanvas = renderPhoto(this.img, this.params, pw, ph);
      return this.previewCanvas;
    },
    renderOriginalPreview: function () {      if (!this.img) return null;
      var P0 = defaultParams();
      // keep geometry so compare aligns
      P0.crop = clone(this.params.crop); P0.rotate = this.params.rotate;
      P0.flipH = this.params.flipH; P0.flipV = this.params.flipV; P0.straighten = this.params.straighten;
      var ns = naturalSize(this.img);
      var s = fitSize(ns.w, ns.h, PREVIEW_MAX);
      var pw = Math.max(1, Math.round(s.w * P0.crop.w)), ph = Math.max(1, Math.round(s.h * P0.crop.h));
      this.beforeCanvas = renderPhoto(this.img, P0, pw, ph, null);
      return this.beforeCanvas;
    },
    // Export at chosen resolution. scale: 1 = original pixels (post-crop)
    renderExport: function (maxDim) {
      var ns = naturalSize(this.img);
      var rot = ((this.params.rotate % 360) + 360) % 360;
      var bw = (rot === 90 || rot === 270) ? ns.h : ns.w;
      var bh = (rot === 90 || rot === 270) ? ns.w : ns.h;
      var cw = bw * this.params.crop.w, ch = bh * this.params.crop.h;
      var s = maxDim ? Math.min(1, maxDim / Math.max(cw, ch)) : 1;
      return renderPhoto(this.img, this.params, Math.round(cw * s), Math.round(ch * s));
    },
    // Render current image with arbitrary params at given size (for thumbnails).
    renderWith: function (P, w, h) {
      return renderPhoto(this.img, P, w, h);
    },
    estimateBytes: function (w, h, format, quality) {
      // rough: JPEG ~0.35 bytes/px at q80, PNG ~1.6, WebP ~0.28
      var px = w * h, q = quality / 100, bpp;
      if (format === 'png') bpp = 1.6;
      else if (format === 'webp') bpp = 0.12 + 0.3 * q;
      else bpp = 0.08 + 0.45 * q;
      return Math.round(px * bpp);
    }
  };

  /* ================= photo projects (localStorage) ================= */
  var LS_KEY = 'viracut_photo_projects';
  function lsGet() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; } }
  function lsSet(a) { try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch (e) {} }

  function thumbOf(canvas) {
    var t = document.createElement('canvas');
    var s = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
    t.width = Math.max(1, Math.round(canvas.width * s));
    t.height = Math.max(1, Math.round(canvas.height * s));
    t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.7);
  }
  // downscaled original for reopen (max 2048)
  function storeOriginal(img) {
    var ns = naturalSize(img), s = fitSize(ns.w, ns.h, 2048);
    var c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    c.getContext('2d').drawImage(img, 0, 0, s.w, s.h);
    return c.toDataURL('image/jpeg', 0.85);
  }

  var PhotoProjects = {
    list: function () { return lsGet().sort(function (a, b) { return b.updated - a.updated; }); },
    save: function (id) {
      var items = lsGet();
      var thumb = PL.previewCanvas ? thumbOf(PL.previewCanvas) : null;
      var rec = {
        id: id || ('ph_' + Date.now().toString(36)),
        name: PL.imgName.replace(/\.[^.]+$/, '') || 'Photo',
        params: clone(PL.params),
        original: storeOriginal(PL.img),
        thumb: thumb,
        updated: Date.now()
      };
      var ix = items.findIndex(function (x) { return x.id === rec.id; });
      if (ix >= 0) items[ix] = rec; else items.unshift(rec);
      lsSet(items.slice(0, 40));
      PL.projectId = rec.id;
      return rec;
    },
    open: function (id) {
      var rec = lsGet().find(function (x) { return x.id === id; });
      if (!rec) return null;
      var im = new Image();
      im.onload = function () {
        PL.open(im, rec.name, null);
        PL.params = clone(rec.params);
        PL.projectId = rec.id;
        PL.commit('open project');
        if (window.PhotoUI) PhotoUI.refreshAll();
      };
      im.src = rec.original;
      return rec;
    },
    del: function (id) { lsSet(lsGet().filter(function (x) { return x.id !== id; })); },
    dup: function (id) {
      var items = lsGet(), rec = items.find(function (x) { return x.id === id; });
      if (!rec) return;
      var c = clone(rec);
      c.id = 'ph_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      c.name = rec.name + ' copy'; c.updated = Date.now();
      items.unshift(c); lsSet(items.slice(0, 40));
    },
    count: function () { return lsGet().length; }
  };

  window.PhotoLab = PL;
  window.PhotoProjects = PhotoProjects;
  window.PhotoLabDefault = defaultParams;
})();
