/* ViraCut AI — fx-pro.js — Pro FX Pack (plugin effects).
 *
 * Step 1: Beat Sync FX + VBeat beat detector.
 * Pro effects register themselves via FX.register() — no core edits needed
 * for future pack additions. All hooks are deterministic (seeded by time),
 * so preview and export render identically.
 */
(function () {
  'use strict';

  /* ============ VBeat: lightweight energy-based beat detector ============
   * Analyzes a decoded AudioBuffer once (at music import) and returns an
   * array of beat times in seconds. Runs in well under a second for a
   * typical song; result is cached on project.music.beats.
   */
  var VBeat = {
    analyze: function (buffer) {
      try {
        var data = buffer.getChannelData(0), sr = buffer.sampleRate;
        var hop = Math.max(256, Math.floor(sr * 0.02)); // ~20ms windows
        var energies = [], i, j;
        for (i = 0; i < data.length; i += hop) {
          var sum = 0, n = 0, end = Math.min(i + hop, data.length);
          for (j = i; j < end; j += 4) { var v = data[j]; sum += v * v; n++; }
          energies.push(n ? sum / n : 0);
        }
        var beats = [], win = 25, k, m; // ~0.5s local window
        for (k = 5; k < energies.length - 1; k++) {
          var avg = 0, cnt = 0, w0 = Math.max(0, k - win);
          for (m = w0; m < k; m++) { avg += energies[m]; cnt++; }
          avg /= Math.max(1, cnt);
          if (avg > 0 && energies[k] > avg * 1.7 &&
              energies[k] > energies[k - 1] && energies[k] >= energies[k + 1]) {
            var t = (k * hop) / sr;
            if (!beats.length || t - beats[beats.length - 1] > 0.25) {
              beats.push(Math.round(t * 100) / 100);
            }
          }
        }
        return beats;
      } catch (e) { return []; }
    }
  };
  window.VBeat = VBeat;

  function projectMusic() {
    try {
      var E = window.Editor;
      if (E && E.project && E.project.music) return E.project.music;
    } catch (e) {}
    return null;
  }

  // 0..1 pulse: 1 exactly on a beat, decaying over ~0.35s.
  // Falls back to a 120 BPM grid when no analyzed music is present,
  // so the effect always does something sensible.
  function beatPulse(t) {
    var mu = projectMusic();
    var beats = mu && mu.beats, dur = mu && mu.buffer ? mu.buffer.duration : 0;
    if (!beats || !beats.length) {
      var ph = t % 0.5, dt = Math.min(ph, 0.5 - ph);
      return Math.max(0, 1 - dt / 0.18);
    }
    var tt = dur > 0 ? t % dur : t;
    var lo = 0, hi = beats.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (beats[mid] <= tt) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (ans < 0) return 0;
    return Math.max(0, 1 - (tt - beats[ans]) / 0.35);
  }

  /* ============ Beat Sync FX (PRO) ============
   * Zoom-punch + flash exactly on the music's beats.
   */
  if (window.FX && window.FX.register) {
    window.FX.register('beatsync', {
      name: 'Beat Sync', icon: '🥁', pro: true,
      pre: function (g, c, item, W, H, t) {
        var p = beatPulse(t);
        if (p > 0.01) {
          var z = 1 + 0.22 * p;
          g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
        }
      },
      over: function (g, c, item, W, H, t) {
        var p = beatPulse(t);
        if (p > 0.55) {
          g.fillStyle = 'rgba(255,255,255,' + ((p - 0.55) * 0.9).toFixed(3) + ')';
          g.fillRect(0, 0, W, H);
        }
      }
    });
  }

  /* ============ Step 2: Particle Storm FX (PRO) ============
   * Four ambient particle overlays. Deterministic (seeded by index),
   * pure functions of time t — identical in preview and export.
   */
  function prnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function particleOver(cfg) {
    return function (g, c, item, W, H, t) {
      var i, n = cfg.count, span = H + 120;
      g.save();
      for (i = 0; i < n; i++) {
        var a = prnd(i * 3.13 + cfg.seed), b = prnd(i * 7.71 + cfg.seed + 11.7), d = prnd(i * 13.37 + cfg.seed + 57.3);
        var spd = cfg.vy[0] + b * (cfg.vy[1] - cfg.vy[0]);
        var y = (a * span + t * spd) % span; if (y < 0) y += span; y -= 60;
        var x = d * W + Math.sin(t * cfg.swayF + a * 6.283) * cfg.sway;
        var sz = cfg.sz[0] + b * (cfg.sz[1] - cfg.sz[0]);
        cfg.draw(g, x, y, sz, t, a, b);
      }
      g.restore();
    };
  }

  function circle(g, x, y, r, style) {
    g.fillStyle = style;
    g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, 6.283); g.fill();
  }

  if (window.FX && window.FX.register) {
    // 🔥 Embers — rising sparks
    window.FX.register('embers', {
      name: 'Embers', icon: '🔥', pro: true,
      over: particleOver({
        seed: 3.7, count: 70, vy: [-110, -45], sway: 18, swayF: 1.4, sz: [1.5, 4],
        draw: function (g, x, y, sz, t, a) {
          var fl = 0.45 + 0.55 * Math.abs(Math.sin(t * 9 + a * 21));
          circle(g, x, y, sz * 2.1, 'rgba(255,110,20,' + (0.16 * fl).toFixed(3) + ')');
          circle(g, x, y, sz, 'rgba(255,' + Math.floor(140 + 80 * fl) + ',40,' + (0.75 * fl).toFixed(3) + ')');
        }
      })
    });
    // ❄️ Snowfall — slow drifting snow
    window.FX.register('snowfall', {
      name: 'Snowfall', icon: '❄️', pro: true,
      over: particleOver({
        seed: 9.2, count: 110, vy: [28, 70], sway: 34, swayF: 0.8, sz: [1.5, 4.5],
        draw: function (g, x, y, sz, t, a) {
          circle(g, x, y, sz, 'rgba(255,255,255,' + (0.35 + 0.4 * a).toFixed(3) + ')');
        }
      })
    });
    // 🌸 Petals — falling flower petals
    window.FX.register('petals', {
      name: 'Petals', icon: '🌸', pro: true,
      over: particleOver({
        seed: 5.1, count: 55, vy: [38, 92], sway: 44, swayF: 1.1, sz: [4, 8],
        draw: function (g, x, y, sz, t, a, b) {
          g.save(); g.translate(x, y); g.rotate(t * (0.8 + b) + a * 6.283);
          g.fillStyle = 'rgba(255,' + Math.floor(150 + 60 * a) + ',' + Math.floor(180 + 40 * b) + ',0.85)';
          g.beginPath(); g.ellipse(0, 0, sz, sz * 0.55, 0, 0, 6.283); g.fill();
          g.restore();
        }
      })
    });
    // ✨ Starfall — twinkling stars
    window.FX.register('starfall', {
      name: 'Starfall', icon: '✨', pro: true,
      over: particleOver({
        seed: 7.9, count: 80, vy: [0, 0], sway: 0, swayF: 1, sz: [1, 2.6],
        draw: function (g, x, y, sz, t, a) {
          var tw = 0.25 + 0.75 * Math.abs(Math.sin(t * (1.5 + a * 2) + a * 6.283));
          circle(g, x, y, sz * 2.4, 'rgba(255,240,200,' + (0.12 * tw).toFixed(3) + ')');
          circle(g, x, y, sz, 'rgba(255,250,230,' + tw.toFixed(3) + ')');
          if (sz > 2) { // sparkle cross on bigger stars
            g.strokeStyle = 'rgba(255,250,230,' + (0.6 * tw).toFixed(3) + ')';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x - sz * 2.2, y); g.lineTo(x + sz * 2.2, y);
            g.moveTo(x, y - sz * 2.2); g.lineTo(x, y + sz * 2.2);
            g.stroke();
          }
        }
      })
    });
  }

  /* ============ Step 3: Cinematic LUTs (PRO) ============
   * GPU-accelerated color grades via ctx.filter (no pixel loops).
   * post: redraws the rendered frame through the grade; over: tint wash.
   */
  function lutPost(filterStr) {
    return function (g, off, c, item, W, H, t) {
      g.save();
      try { g.filter = filterStr; } catch (e) {}
      g.drawImage(off, 0, 0, W, H);
      g.restore();
    };
  }
  function tintOver(top, bottom, alpha) {
    return function (g, c, item, W, H, t) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, top); gr.addColorStop(1, bottom);
      g.save(); g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
    };
  }

  if (window.FX && window.FX.register) {
    // 🎬 Teal & Orange — blockbuster look
    window.FX.register('cine_teal', {
      name: 'Teal & Orange', icon: '🎬', pro: true,
      post: lutPost('saturate(1.35) contrast(1.06) sepia(0.18) hue-rotate(-12deg)'),
      over: tintOver('rgba(0,120,140,0.10)', 'rgba(255,120,40,0.10)', 1)
    });
    // 🌃 Cyber Night — cold blue shadows, neon pop
    window.FX.register('cine_cyber', {
      name: 'Cyber Night', icon: '🌃', pro: true,
      post: lutPost('saturate(1.25) contrast(1.12) brightness(0.94) hue-rotate(18deg)'),
      over: tintOver('rgba(20,40,120,0.16)', 'rgba(0,10,40,0.22)', 1)
    });
    // 🌅 Golden Hour — warm sunset glow
    window.FX.register('cine_gold', {
      name: 'Golden Hour', icon: '🌅', pro: true,
      post: lutPost('sepia(0.28) saturate(1.45) brightness(1.05) contrast(1.02)'),
      over: tintOver('rgba(255,190,80,0.14)', 'rgba(200,90,20,0.12)', 1)
    });
  }

  /* Hook beat analysis into music import (non-invasive wrapper). */
  function hookMusic() {
    if (!window.AudioLab || !AudioLab.Music || AudioLab.Music._beatHooked) return;
    AudioLab.Music._beatHooked = true;
    var origSet = AudioLab.Music.set;
    AudioLab.Music.set = function (file, project) {
      origSet.call(this, file, project);
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (project.music && project.music.buffer) {
          clearInterval(iv);
          try {
            project.music.beats = VBeat.analyze(project.music.buffer);
            if (window.Store) Store.persist();
          } catch (e) {}
        } else if (tries > 100) clearInterval(iv);
      }, 200);
    };
    // if music was already imported before this script loaded, analyze now
    try {
      var mu = projectMusic();
      if (mu && mu.buffer && !mu.beats) {
        mu.beats = VBeat.analyze(mu.buffer);
        if (window.Store) Store.persist();
      }
    } catch (e) {}
  }
  if (document.readyState === 'complete') hookMusic();
  else window.addEventListener('load', hookMusic);
})();
