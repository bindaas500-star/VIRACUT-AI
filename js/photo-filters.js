/* ViraCut AI — photo-filters.js — 44 original filter presets, 17 categories.
 *
 * Each filter: { id, n: name, c: category, a: {param: delta}, o: overlay wash }
 * stamp(P, id, k): adds deltas scaled by intensity k (0..1) into params P.
 * overlay(g, W, H, id, k): deterministic canvas wash / light FX.
 */
(function () {
  'use strict';

  // overlay wash painters (deterministic, seeded)
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  var WASH = {
    teal: function (g, W, H, k) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(0,130,150,' + (0.14 * k).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,120,40,' + (0.12 * k).toFixed(3) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    },
    warm: function (g, W, H, k) {
      g.fillStyle = 'rgba(255,170,60,' + (0.14 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    },
    cool: function (g, W, H, k) {
      g.fillStyle = 'rgba(70,130,255,' + (0.13 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    },
    gold: function (g, W, H, k) {
      var gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(255,210,120,' + (0.20 * k).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(120,60,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    },
    rose: function (g, W, H, k) {
      g.fillStyle = 'rgba(255,120,170,' + (0.12 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    },
    emerald: function (g, W, H, k) {
      g.fillStyle = 'rgba(40,160,110,' + (0.12 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    },
    leak: function (g, W, H, k) {
      var gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, 'rgba(255,150,60,' + (0.35 * k).toFixed(3) + ')');
      gr.addColorStop(0.35, 'rgba(255,150,60,0)');
      gr.addColorStop(1, 'rgba(255,80,40,' + (0.18 * k).toFixed(3) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    },
    dust: function (g, W, H, k) {
      var i, n = Math.round(40 * k);
      g.fillStyle = 'rgba(255,245,225,0.5)';
      for (i = 0; i < n; i++) {
        var x = rnd(i * 3.3) * W, y = rnd(i * 7.9) * H, r = 1 + rnd(i * 5.1) * 3;
        g.globalAlpha = 0.10 + rnd(i * 9.7) * 0.25 * k;
        g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    },
    bw: function (g, W, H, k) {
      g.fillStyle = 'rgba(20,20,20,' + (0.06 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    }
  };

  var F = [
    // Cinematic
    { id: 'cine_pro', n: 'Cinematic Pro', c: 'Cinematic', o: 'teal', a: { contrast: 16, saturation: -14, temperature: -10, vignette: 26, blacks: -12, clarity: 14 } },
    { id: 'cine_dark', n: 'Cinematic Dark', c: 'Cinematic', o: 'teal', a: { exposure: -22, contrast: 20, saturation: -22, shadows: -24, vignette: 42, blacks: -18 } },
    { id: 'neo_noir', n: 'Neo Noir', c: 'Cinematic', o: 'cool', a: { contrast: 24, saturation: -34, temperature: -26, highlights: -14, vignette: 34 } },
    // Portrait
    { id: 'soft_portrait', n: 'Soft Portrait', c: 'Portrait', o: 'warm', a: { exposure: 8, contrast: -8, saturation: 6, temperature: 10, texture: -22, vignette: 10 } },
    { id: 'natural_skin', n: 'Natural Skin', c: 'Portrait', o: 'warm', a: { saturation: -6, vibrance: 12, temperature: 8, texture: -14, clarity: -8 } },
    { id: 'bright_day', n: 'Bright Day', c: 'Portrait', a: { exposure: 16, brightness: 10, shadows: 22, whites: 10, saturation: 8 } },
    // Travel
    { id: 'wander', n: 'Wander', c: 'Travel', o: 'teal', a: { saturation: 14, vibrance: 14, contrast: 10, temperature: -6, clarity: 12 } },
    { id: 'deep_blue', n: 'Deep Blue', c: 'Travel', o: 'cool', a: { saturation: 16, temperature: -24, tint: 6, contrast: 12, dehaze: 18 } },
    { id: 'ocean', n: 'Ocean', c: 'Travel', o: 'cool', a: { saturation: 20, vibrance: 16, temperature: -14, clarity: 10 } },
    // Nature
    { id: 'forest', n: 'Forest', c: 'Nature', o: 'emerald', a: { saturation: 14, contrast: 10, shadows: -10, temperature: -8, dehaze: 12 } },
    { id: 'sunset', n: 'Sunset', c: 'Nature', o: 'gold', a: { temperature: 30, saturation: 16, contrast: 8, highlights: -12, vignette: 14 } },
    // Food
    { id: 'tasty', n: 'Tasty', c: 'Food', o: 'warm', a: { saturation: 22, vibrance: 18, temperature: 14, contrast: 12, sharpness: 14 } },
    { id: 'fresh', n: 'Fresh', c: 'Food', a: { saturation: 12, vibrance: 20, exposure: 8, whites: 12, sharpness: 10 } },
    // Urban
    { id: 'urban_dark', n: 'Urban Dark', c: 'Urban', o: 'cool', a: { exposure: -14, contrast: 18, saturation: -16, temperature: -14, vignette: 30, grain: 12 } },
    { id: 'night_city', n: 'Night City', c: 'Urban', o: 'cool', a: { exposure: -8, contrast: 22, saturation: 10, temperature: -18, tint: 10, vignette: 26 } },
    // Vintage
    { id: 'vintage_90s', n: 'Vintage 90s', c: 'Vintage', o: 'warm', a: { contrast: -14, saturation: -18, fade: 42, temperature: 12, grain: 22, vignette: 18 } },
    { id: 'retro_cam', n: 'Retro Camera', c: 'Vintage', o: 'leak', a: { contrast: -6, saturation: -24, fade: 34, temperature: 16, grain: 30 } },
    { id: 'polaroid', n: 'Polaroid', c: 'Vintage', o: 'warm', a: { contrast: -10, saturation: -12, fade: 48, temperature: 10, vignette: 30, grain: 14 } },
    // Black & White
    { id: 'classic_bw', n: 'Classic B&W', c: 'Black & White', o: 'bw', a: { saturation: -100, contrast: 18, blacks: -10, whites: 8 } },
    { id: 'noir', n: 'Noir', c: 'Black & White', o: 'bw', a: { saturation: -100, contrast: 34, exposure: -10, vignette: 44, grain: 16 } },
    { id: 'silver', n: 'Silver', c: 'Black & White', o: 'bw', a: { saturation: -100, contrast: 8, brightness: 12, fade: 20, grain: 8 } },
    // Luxury
    { id: 'luxury_gold', n: 'Luxury Gold', c: 'Luxury', o: 'gold', a: { temperature: 22, saturation: 12, contrast: 14, highlights: -8, vignette: 20, sharpness: 8 } },
    { id: 'golden_film', n: 'Golden Film', c: 'Luxury', o: 'gold', a: { temperature: 26, saturation: 8, fade: 18, grain: 14, contrast: 6 } },
    // Moody
    { id: 'moody_night', n: 'Moody Night', c: 'Moody', o: 'cool', a: { exposure: -20, contrast: 16, saturation: -20, shadows: -20, temperature: -12, vignette: 38 } },
    { id: 'deep_shadows', n: 'Deep Shadows', c: 'Moody', a: { shadows: -34, blacks: -22, contrast: 18, saturation: -10, vignette: 30 } },
    // Warm
    { id: 'golden_hour', n: 'Golden Hour', c: 'Warm', o: 'gold', a: { temperature: 34, saturation: 14, exposure: 6, highlights: -14, vignette: 12 } },
    { id: 'warm_film', n: 'Warm Film', c: 'Warm', o: 'warm', a: { temperature: 20, saturation: 6, fade: 22, grain: 12, contrast: -4 } },
    // Cold
    { id: 'cold_film', n: 'Cold Film', c: 'Cold', o: 'cool', a: { temperature: -28, saturation: -6, fade: 16, contrast: 6, grain: 10 } },
    { id: 'arctic', n: 'Arctic', c: 'Cold', o: 'cool', a: { temperature: -36, saturation: 4, exposure: 10, brightness: 8, clarity: 8 } },
    // Instagram
    { id: 'dream', n: 'Dream', c: 'Instagram', o: 'rose', a: { exposure: 10, contrast: -12, saturation: 10, fade: 26, temperature: 8 } },
    { id: 'pastel', n: 'Pastel', c: 'Instagram', o: 'rose', a: { saturation: -14, contrast: -16, brightness: 12, fade: 30, temperature: 6 } },
    { id: 'vivid', n: 'Vivid', c: 'Instagram', a: { saturation: 32, vibrance: 24, contrast: 14, sharpness: 12, clarity: 10 } },
    // Film
    { id: 'film_grain', n: 'Film Grain', c: 'Film', o: 'dust', a: { grain: 44, fade: 18, saturation: -10, contrast: -6 } },
    { id: 'analog', n: 'Analog', c: 'Film', o: 'dust', a: { grain: 30, fade: 30, temperature: 10, saturation: -14, vignette: 16 } },
    { id: 'matte', n: 'Matte', c: 'Film', a: { fade: 52, contrast: -8, saturation: -16, blacks: 14, grain: 8 } },
    // HDR
    { id: 'hdr_pro', n: 'HDR Pro', c: 'HDR', a: { shadows: 34, highlights: -26, clarity: 30, dehaze: 22, saturation: 12, sharpness: 16 } },
    { id: 'clarity_pop', n: 'Clarity Pop', c: 'HDR', a: { clarity: 40, texture: 24, dehaze: 16, contrast: 12, sharpness: 18 } },
    // Wedding
    { id: 'blush', n: 'Blush', c: 'Wedding', o: 'rose', a: { exposure: 12, saturation: 4, temperature: 12, fade: 22, texture: -16 } },
    { id: 'ivory', n: 'Ivory', c: 'Wedding', o: 'warm', a: { exposure: 14, brightness: 10, contrast: -10, saturation: -4, fade: 26 } },
    // Night
    { id: 'night_neon', n: 'Night Neon', c: 'Night', o: 'cool', a: { exposure: -6, contrast: 24, saturation: 22, vibrance: 18, temperature: -16, vignette: 24 } },
    { id: 'moonlight', n: 'Moonlight', c: 'Night', o: 'cool', a: { exposure: -14, saturation: -30, temperature: -22, tint: 8, contrast: 14, vignette: 30 } },
    // Bonus: portrait/landscape extras to cross 40
    { id: 'espresso', n: 'Espresso', c: 'Moody', o: 'warm', a: { temperature: 14, contrast: 16, saturation: -12, vignette: 26, grain: 10 } },
    { id: 'lagoon', n: 'Lagoon', c: 'Travel', o: 'teal', a: { saturation: 24, temperature: -18, vibrance: 20, clarity: 14, dehaze: 10 } },
    { id: 'ember', n: 'Ember', c: 'Warm', o: 'leak', a: { temperature: 28, saturation: 18, contrast: 10, shadows: -12 } },
    { id: 'frost', n: 'Frost', c: 'Cold', o: 'cool', a: { temperature: -30, saturation: -12, exposure: 8, fade: 14, sharpness: 8 } }
  ];

  var byId = {};
  F.forEach(function (f) { byId[f.id] = f; });
  var CATS = [];
  F.forEach(function (f) { if (CATS.indexOf(f.c) < 0) CATS.push(f.c); });

  function stamp(P, id, k) {
    var f = byId[id];
    if (!f) return;
    Object.keys(f.a).forEach(function (key) {
      if (typeof P[key] === 'number') P[key] += f.a[key] * k;
    });
  }

  window.PhotoFilters = {
    list: function () { return F.map(function (f) { return { id: f.id, name: f.n, cat: f.c }; }); },
    cats: function () { return CATS.slice(); },
    byCat: function (c) { return F.filter(function (f) { return f.c === c; }).map(function (f) { return { id: f.id, name: f.n }; }); },
    count: function () { return F.length; },
    get: function (id) { return byId[id] || null; },
    stamp: stamp,
    overlay: function (g, W, H, id, k) {
      var f = byId[id];
      if (f && f.o && WASH[f.o] && k > 0.01) WASH[f.o](g, W, H, k);
    }
  };
})();
