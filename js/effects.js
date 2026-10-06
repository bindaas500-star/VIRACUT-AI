/* ViraCut AI — effects.js — on-device Smart FX (canvas-based)
 *
 * Original ViraCut effects. All run locally on the canvas compositor and
 * are baked into export (preview and export share the same code path).
 * Randomness is seeded per-frame so export is deterministic.
 */
(function () {
  'use strict';

  // deterministic pseudo-random in [0,1) from an integer seed
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function prog(item, t) { return Math.max(0, Math.min(1, (t - item.start) / Math.max(0.01, item.end - item.start))); }
  function easeOut(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }

  // Effect shape:
  //   pre(g, clip, item, W, H, t)  — transform/filter BEFORE the clip is drawn
  //   post(g, off, clip, item, W, H, t) — pixel ops AFTER (off = rendered frame)
  //   over(g, clip, item, W, H, t) — overlay drawn on top
  var R = {
    none: { name: 'No effect', icon: '🚫' },

    punch: {
      name: 'Zoom Punch', icon: '💥',
      pre: function (g, c, item, W, H, t) {
        var z = 1 + 0.34 * easeOut(prog(item, t) * 2.4);
        g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
      }
    },

    shake: {
      name: 'Shake', icon: '📳',
      pre: function (g, c, item, W, H, t) {
        var f = Math.floor(t * 24), m = Math.min(W, H) * 0.028;
        g.translate((rnd(f * 3 + 1) - 0.5) * 2 * m, (rnd(f * 3 + 1001) - 0.5) * 2 * m);
      }
    },

    mirror: {
      name: 'Mirror', icon: '🪞',
      pre: function (g, c, item, W, H, t) { g.translate(W, 0); g.scale(-1, 1); }
    },

    flash: {
      name: 'Flash Pop', icon: '⚡',
      over: function (g, c, item, W, H, t) {
        var p = prog(item, t);
        if (p < 0.28) {
          g.fillStyle = 'rgba(255,255,255,' + ((1 - p / 0.28) * 0.9).toFixed(3) + ')';
          g.fillRect(0, 0, W, H);
        }
      }
    },

    vignette: {
      name: 'Vignette', icon: '🌑',
      over: function (g, c, item, W, H, t) {
        var gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.74);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,0,0.58)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
    },

    grain: {
      name: 'Film Grain', icon: '🎞️',
      over: function (g, c, item, W, H, t) {
        var f = Math.floor(t * 24), i, x, y, v;
        g.save();
        for (i = 0; i < 90; i++) {
          x = rnd(f * 131 + i * 17) * W; y = rnd(f * 171 + i * 31) * H;
          v = Math.floor(rnd(f * 197 + i * 7) * 255);
          g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.10)';
          g.fillRect(x, y, 2.5, 2.5);
        }
        g.restore();
      }
    },

    vintage: {
      name: 'Vintage', icon: '📽️',
      over: function (g, c, item, W, H, t) {
        g.fillStyle = 'rgba(150,90,30,0.16)'; g.fillRect(0, 0, W, H);
        var fl = 0.94 + 0.06 * rnd(Math.floor(t * 12));
        g.fillStyle = 'rgba(0,0,0,' + (1 - fl).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
        R.vignette.over(g, c, item, W, H, t);
        R.grain.over(g, c, item, W, H, t);
      }
    },

    glitch: {
      name: 'Glitch', icon: '👾',
      post: function (g, off, c, item, W, H, t) {
        var f = Math.floor(t * 18), strips = 9, sh = H / strips, i, dx;
        g.save();
        for (i = 0; i < strips; i++) {
          dx = (rnd(f * 7 + i * 13) - 0.5) * (rnd(f * 3 + i) > 0.72 ? 46 : 8);
          g.drawImage(off, 0, i * sh, W, sh, dx, i * sh, W, sh);
        }
        // chromatic edges
        g.globalAlpha = 0.32; g.globalCompositeOperation = 'screen';
        g.drawImage(off, -5, 0, W, H);
        g.drawImage(off, 5, 0, W, H);
        g.restore();
      }
    },

    focus: {
      name: 'Focus Pull', icon: '🌫️',
      post: function (g, off, c, item, W, H, t) {
        var b = (1 - easeOut(prog(item, t) * 1.7)) * 10;
        g.save();
        if (b > 0.3) g.filter = 'blur(' + b.toFixed(1) + 'px)';
        g.drawImage(off, 0, 0);
        g.restore();
      }
    },

    neon: {
      name: 'Neon Pop', icon: '✨',
      post: function (g, off, c, item, W, H, t) {
        g.save();
        g.filter = 'saturate(1.7) contrast(1.12)';
        g.drawImage(off, 0, 0);
        g.restore();
      }
    },

    reveal: {
      name: 'Dark Reveal', icon: '🌘',
      over: function (g, c, item, W, H, t) {
        var k = Math.max(0, Math.min(1, t / 1.4));
        if (k < 1) { g.fillStyle = 'rgba(0,0,0,' + ((1 - k) * 0.94).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
      }
    },

    gloworbs: {
      name: 'Glow Orbs', icon: '🔆',
      over: function (g, c, item, W, H, t) {
        var orbs = [[0.20, 0.34, 0.10, '255,150,40'], [0.80, 0.30, 0.13, '255,170,60'], [0.52, 0.66, 0.08, '255,200,120'], [0.35, 0.55, 0.06, '255,120,60']];
        g.save(); g.globalCompositeOperation = 'screen';
        orbs.forEach(function (o, i) {
          var fl = 0.55 + 0.45 * Math.sin(t * 2.4 + i * 2.1);
          var r = o[2] * Math.min(W, H) * (0.9 + 0.25 * fl);
          var gr = g.createRadialGradient(o[0] * W, o[1] * H, 0, o[0] * W, o[1] * H, r);
          gr.addColorStop(0, 'rgba(' + o[3] + ',' + (0.55 * fl).toFixed(3) + ')');
          gr.addColorStop(1, 'rgba(' + o[3] + ',0)');
          g.fillStyle = gr; g.beginPath(); g.arc(o[0] * W, o[1] * H, r, 0, 7); g.fill();
        });
        g.restore();
      }
    },

    streak: {
      name: 'Light Streak', icon: '🌠',
      over: function (g, c, item, W, H, t) {
        var p = prog(item, t);
        var y = H * (0.22 + 0.56 * p);
        g.save(); g.globalCompositeOperation = 'screen';
        var gr = g.createLinearGradient(0, y - 34, 0, y + 34);
        gr.addColorStop(0, 'rgba(140,200,255,0)');
        gr.addColorStop(0.5, 'rgba(180,220,255,' + (0.34 * Math.sin(p * Math.PI)).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(140,200,255,0)');
        g.fillStyle = gr; g.fillRect(0, y - 34, W, 68);
        g.restore();
      }
    },

    smoke: {
      name: 'Smoke', icon: '🌫️',
      over: function (g, c, item, W, H, t) {
        g.save();
        for (var i = 0; i < 5; i++) {
          var x = (((i * 0.23 + t * 0.018 * (1 + i * 0.25)) % 1.3) - 0.15) * W;
          var y = H * (0.74 + 0.05 * Math.sin(t * 0.7 + i * 1.3));
          var r = W * (0.30 + 0.07 * Math.sin(i * 3 + t * 0.5));
          var gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(205,205,215,0.13)');
          gr.addColorStop(1, 'rgba(205,205,215,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        }
        g.restore();
      }
    }
  };

  var ORDER = ['none', 'punch', 'shake', 'mirror', 'flash', 'glitch', 'focus', 'neon', 'vignette', 'grain', 'vintage', 'reveal', 'gloworbs', 'streak', 'smoke'];

  window.FX = {
    list: function () {
      return ORDER.map(function (id) { return { id: id, name: R[id].name, icon: R[id].icon }; });
    },
    get: function (id) { return R[id] || R.none; }
  };
})();
