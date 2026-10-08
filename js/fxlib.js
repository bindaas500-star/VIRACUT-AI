/* ViraCut AI — fxlib.js — Phase 1 Effects System registry.
 * Real on-device canvas effects. Video effects apply to the full frame via
 * timeline segments (project.effects). Photo effects apply to a selected
 * photo clip / overlay (item.photoFx). Body + AI tabs are honest placeholders.
 * Randomness is seeded per-frame so preview and export render identically.
 */
(function () {
  'use strict';

  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function prog(seg, t) { return clamp((t - seg.start) / Math.max(0.01, seg.dur), 0, 1); }

  // copy current frame to offscreen, hand (g, off) to fn
  var _off = null;
  function withFrame(g, W, H, fn) {
    if (!_off) _off = document.createElement('canvas');
    if (_off.width !== W || _off.height !== H) { _off.width = W; _off.height = H; }
    var og = _off.getContext('2d');
    og.save(); og.setTransform(1, 0, 0, 1, 0, 0); og.globalAlpha = 1;
    og.globalCompositeOperation = 'source-over'; og.filter = 'none';
    og.drawImage(g.canvas, 0, 0, W, H); og.restore();
    fn(g, _off, W, H);
  }

  function P(seg, key, def) {
    var v = seg.params ? seg.params[key] : undefined;
    return (v == null || isNaN(v)) ? def : +v;
  }

  /* ================= VIDEO EFFECTS ================= */
  var V = [
    {
      id: 'v_softblur', name: 'Soft Blur', icon: '🌫️', sub: 'basic',
      desc: 'Gentle defocus blur across the frame.',
      params: [{ key: 'intensity', label: 'Blur amount', min: 0, max: 24, def: 8, step: 0.5 }],
      apply: function (g, W, H, t, seg, Pp) {
        var b = P(seg, 'intensity', 8);
        if (b < 0.3) return;
        withFrame(g, W, H, function (gg, off) {
          gg.save(); gg.filter = 'blur(' + b.toFixed(1) + 'px)';
          gg.drawImage(off, 0, 0, W, H); gg.restore();
        });
      }
    },
    {
      id: 'v_grain', name: 'Film Grain', icon: '🎞️', sub: 'retro',
      desc: 'Animated 35mm film grain.',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 45, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 45) / 100;
        if (inten <= 0.01) return;
        var f = Math.floor(t * 24), n = Math.round(40 + 90 * inten), i, x, y, v;
        g.save();
        for (i = 0; i < n; i++) {
          x = rnd(f * 131 + i * 17) * W; y = rnd(f * 171 + i * 31) * H;
          v = Math.floor(rnd(f * 197 + i * 7) * 255);
          g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.16 * inten).toFixed(3) + ')';
          g.fillRect(x, y, 2.4, 2.4);
        }
        g.restore();
      }
    },
    {
      id: 'v_rgbglitch', name: 'RGB Glitch', icon: '👾', sub: 'glitch',
      desc: 'Channel split + slice displacement.',
      params: [
        { key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 60, step: 1 },
        { key: 'speed', label: 'Speed', min: 1, max: 40, def: 18, step: 1 }
      ],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 60) / 100, sp = P(seg, 'speed', 18);
        if (inten <= 0.01) return;
        var f = Math.floor(t * sp);
        withFrame(g, W, H, function (gg, off) {
          var strips = 9, sh = H / strips, i, dx;
          gg.save();
          for (i = 0; i < strips; i++) {
            dx = (rnd(f * 7 + i * 13) - 0.5) * (rnd(f * 3 + i) > 0.72 ? 46 : 8) * inten;
            gg.drawImage(off, 0, i * sh, W, sh, dx, i * sh, W, sh);
          }
          gg.globalAlpha = 0.32 * inten; gg.globalCompositeOperation = 'screen';
          gg.drawImage(off, -5 * inten, 0, W, H);
          gg.drawImage(off, 5 * inten, 0, W, H);
          gg.restore();
        });
      }
    },
    {
      id: 'v_lightleak', name: 'Light Leak', icon: '🔆', sub: 'light',
      desc: 'Warm drifting light leak.',
      params: [
        { key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 55, step: 1 },
        { key: 'speed', label: 'Speed', min: 1, max: 20, def: 6, step: 1 }
      ],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 55) / 100, sp = P(seg, 'speed', 6);
        if (inten <= 0.01) return;
        var x = W * (0.5 + 0.45 * Math.sin(t * 0.5 * sp * 0.28));
        var gr = g.createRadialGradient(x, H * 0.15, 0, x, H * 0.15, Math.max(W, H) * 0.7);
        gr.addColorStop(0, 'rgba(255,150,60,' + (0.5 * inten).toFixed(3) + ')');
        gr.addColorStop(0.6, 'rgba(255,120,80,' + (0.18 * inten).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,120,80,0)');
        g.save(); g.globalCompositeOperation = 'screen';
        g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      }
    },
    {
      id: 'v_zoom pulse', name: 'Zoom Pulse', icon: '🔍', sub: 'trending',
      desc: 'Rhythmic zoom in and out.',
      params: [
        { key: 'intensity', label: 'Zoom amount', min: 0, max: 60, def: 25, step: 1 },
        { key: 'speed', label: 'Speed', min: 1, max: 20, def: 6, step: 1 }
      ],
      apply: function (g, W, H, t, seg, Pp) {
        var amt = P(seg, 'intensity', 25) / 100, sp = P(seg, 'speed', 6);
        var z = 1 + amt * (0.5 + 0.5 * Math.sin(t * sp * 0.9));
        withFrame(g, W, H, function (gg, off) {
          gg.save(); gg.translate(W / 2, H / 2); gg.scale(z, z); gg.translate(-W / 2, -H / 2);
          gg.drawImage(off, 0, 0, W, H); gg.restore();
        });
      }
    },
    {
      id: 'v_shake', name: 'Camera Shake', icon: '📳', sub: 'camera',
      desc: 'Handheld camera jitter.',
      params: [
        { key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 50, step: 1 },
        { key: 'speed', label: 'Speed', min: 4, max: 48, def: 24, step: 1 }
      ],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 50) / 100, sp = P(seg, 'speed', 24);
        if (inten <= 0.01) return;
        var f = Math.floor(t * sp), m = Math.min(W, H) * 0.035 * inten;
        withFrame(g, W, H, function (gg, off) {
          gg.save();
          gg.translate((rnd(f * 3 + 1) - 0.5) * 2 * m, (rnd(f * 3 + 1001) - 0.5) * 2 * m);
          gg.drawImage(off, -m, -m, W + 2 * m, H + 2 * m);
          gg.restore();
        });
      }
    },
    {
      id: 'v_vhs', name: 'Retro VHS', icon: '📼', sub: 'retro',
      desc: 'Scanlines, tracking bar and chromatic wobble.',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 60, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 60) / 100;
        if (inten <= 0.01) return;
        withFrame(g, W, H, function (gg, off) {
          gg.save();
          var wob = Math.sin(t * 7) * 3 * inten;
          gg.drawImage(off, wob, 0, W, H);
          gg.globalAlpha = 0.35 * inten; gg.globalCompositeOperation = 'screen';
          gg.drawImage(off, wob - 4 * inten, 0, W, H);
          gg.drawImage(off, wob + 4 * inten, 0, W, H);
          gg.restore();
        });
        // scanlines
        g.save(); g.globalAlpha = 0.12 * inten; g.fillStyle = '#000';
        for (var y = 0; y < H; y += 4) g.fillRect(0, y, W, 1.4);
        g.restore();
        // tracking bar
        var by = ((t * 0.35) % 1.3 - 0.15) * H;
        var bgr = g.createLinearGradient(0, by - 26, 0, by + 26);
        bgr.addColorStop(0, 'rgba(255,255,255,0)');
        bgr.addColorStop(0.5, 'rgba(255,255,255,' + (0.22 * inten).toFixed(3) + ')');
        bgr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.fillStyle = bgr; g.fillRect(0, by - 26, W, 52); g.restore();
      }
    },
    {
      id: 'v_letterbox', name: 'Cinematic Fade', icon: '🎬', sub: 'cinematic',
      desc: 'Letterbox bars slide in.',
      params: [{ key: 'intensity', label: 'Bar size', min: 0, max: 100, def: 70, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 70) / 100;
        var k = clamp(t / 1.2, 0, 1); // animate in over 1.2s
        var bh = H * 0.12 * inten * k;
        if (bh < 1) return;
        g.save(); g.fillStyle = '#000';
        g.fillRect(0, 0, W, bh); g.fillRect(0, H - bh, W, bh);
        g.restore();
      }
    },
    {
      id: 'v_colorshift', name: 'Color Shift', icon: '🌈', sub: 'trending',
      desc: 'Hue rotation color shift.',
      params: [
        { key: 'intensity', label: 'Shift', min: 0, max: 360, def: 120, step: 1 },
        { key: 'speed', label: 'Speed', min: 0, max: 20, def: 4, step: 1 }
      ],
      apply: function (g, W, H, t, seg, Pp) {
        var sh = P(seg, 'intensity', 120), sp = P(seg, 'speed', 4);
        var hue = sp > 0 ? (t * sp * 18) % 360 : sh;
        withFrame(g, W, H, function (gg, off) {
          gg.save(); gg.filter = 'hue-rotate(' + hue.toFixed(1) + 'deg) saturate(1.25)';
          gg.drawImage(off, 0, 0, W, H); gg.restore();
        });
      }
    },
    {
      id: 'v_dreamglow', name: 'Dream Glow', icon: '✨', sub: 'light',
      desc: 'Soft bloom glow.',
      params: [{ key: 'intensity', label: 'Glow', min: 0, max: 100, def: 55, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 55) / 100;
        if (inten <= 0.01) return;
        withFrame(g, W, H, function (gg, off) {
          gg.save(); gg.globalCompositeOperation = 'screen';
          gg.filter = 'blur(' + (Math.max(W, H) * 0.03 * inten + 2).toFixed(1) + 'px) brightness(1.35)';
          gg.globalAlpha = 0.55 * inten;
          gg.drawImage(off, 0, 0, W, H); gg.restore();
        });
      }
    },
    {
      id: 'v_flash', name: 'Flash Burst', icon: '⚡', sub: 'trending',
      desc: 'White flash that decays.',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 80, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 80) / 100;
        var p = prog(seg, t);
        var a = p < 0.3 ? (1 - p / 0.3) * inten : 0;
        if (a <= 0.01) return;
        g.save(); g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        g.fillRect(0, 0, W, H); g.restore();
      }
    },
    {
      id: 'v_moblur', name: 'Motion Blur', icon: '💨', sub: 'camera',
      desc: 'Directional smear ghosting.',
      params: [
        { key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 50, step: 1 },
        { key: 'speed', label: 'Speed', min: 1, max: 20, def: 8, step: 1 }
      ],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 50) / 100, sp = P(seg, 'speed', 8);
        if (inten <= 0.01) return;
        var dx = Math.cos(t * sp * 0.5) * 14 * inten, dy = Math.sin(t * sp * 0.35) * 10 * inten;
        withFrame(g, W, H, function (gg, off) {
          gg.save();
          for (var i = 4; i >= 1; i--) {
            gg.globalAlpha = 0.14 * inten;
            gg.drawImage(off, dx * i / 4, dy * i / 4, W, H);
          }
          gg.restore();
        });
      }
    },
    {
      id: 'v_prism', name: 'Prism', icon: '💠', sub: 'light',
      desc: 'Rainbow edge refraction.',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 60, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 60) / 100;
        if (inten <= 0.01) return;
        withFrame(g, W, H, function (gg, off) {
          gg.save(); gg.globalCompositeOperation = 'screen'; gg.globalAlpha = 0.5 * inten;
          var cols = ['255,0,90', '255,140,0', '255,235,0', '0,220,120', '0,140,255', '150,60,255'];
          for (var i = 0; i < 6; i++) {
            gg.strokeStyle = 'rgba(' + cols[i] + ',0.5)';
            gg.lineWidth = Math.max(2, W * 0.012 * inten);
            var inset = i * W * 0.016 * inten + W * 0.02;
            gg.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
          }
          gg.restore();
        });
      }
    },
    {
      id: 'v_pixel', name: 'Pixel Distort', icon: '🧊', sub: 'glitch',
      desc: 'Mosaic pixelation.',
      params: [{ key: 'intensity', label: 'Pixel size', min: 2, max: 60, def: 18, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var px = P(seg, 'intensity', 18);
        if (px < 2) return;
        withFrame(g, W, H, function (gg, off) {
          var sw = Math.max(2, Math.round(W / px)), sh = Math.max(2, Math.round(H / px));
          var tiny = document.createElement('canvas'); tiny.width = sw; tiny.height = sh;
          var tg = tiny.getContext('2d'); tg.drawImage(off, 0, 0, sw, sh);
          gg.save(); gg.imageSmoothingEnabled = false;
          gg.drawImage(tiny, 0, 0, W, H); gg.restore();
        });
      }
    },
    {
      id: 'v_oldfilm', name: 'Old Film', icon: '📽️', sub: 'retro',
      desc: 'Scratches, dust and flicker.',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 55, step: 1 }],
      apply: function (g, W, H, t, seg, Pp) {
        var inten = P(seg, 'intensity', 55) / 100;
        if (inten <= 0.01) return;
        var f = Math.floor(t * 24), i;
        g.save();
        // flicker
        var fl = 0.92 + 0.08 * rnd(f * 3 + 7);
        g.fillStyle = 'rgba(0,0,0,' + ((1 - fl) * inten).toFixed(3) + ')';
        g.fillRect(0, 0, W, H);
        // scratches
        for (i = 0; i < 3; i++) {
          var x = rnd(f * 11 + i * 37) * W;
          g.fillStyle = 'rgba(255,255,255,' + (0.25 * inten).toFixed(3) + ')';
          g.fillRect(x, 0, 1.2, H);
        }
        // dust
        for (i = 0; i < 12; i++) {
          var dx = rnd(f * 51 + i * 13) * W, dy = rnd(f * 61 + i * 29) * H;
          g.fillStyle = 'rgba(255,255,255,' + (0.4 * inten).toFixed(3) + ')';
          g.fillRect(dx, dy, 2, 2);
        }
        g.restore();
      }
    }
  ];

  /* ================= PHOTO EFFECTS =================
   * Applied to the selected photo clip or overlay (item.photoFx = fxId).
   * Each has css() -> filter string for the base grade + optional draw(g,W,H,t,P,item).
   */
  var PH = [
    {
      id: 'p_glow', name: 'Portrait Glow', icon: '✨',
      desc: 'Soft radiant glow.', css: 'brightness(1.08) saturate(1.2)',
      params: [{ key: 'intensity', label: 'Glow', min: 0, max: 100, def: 55, step: 1 }],
      draw: function (g, W, H, t, item, Pp) {
        var inten = (Pp.intensity == null ? 55 : Pp.intensity) / 100;
        g.save(); g.globalCompositeOperation = 'screen';
        var gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
        gr.addColorStop(0, 'rgba(255,220,180,' + (0.3 * inten).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,220,180,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      }
    },
    {
      id: 'p_bgblur', name: 'Background Blur', icon: '🌀',
      desc: 'Sharp subject, blurred edges (faux depth).',
      css: '', params: [{ key: 'intensity', label: 'Blur', min: 0, max: 30, def: 12, step: 1 }],
      draw: function (g, W, H, t, item, Pp) {
        var b = Pp.intensity == null ? 12 : Pp.intensity;
        if (b < 0.5) return;
        var cw = W * 0.62, ch = H * 0.62;
        // snapshot sharp frame first (self-draw would blur the source)
        var snap = document.createElement('canvas'); snap.width = W; snap.height = H;
        snap.getContext('2d').drawImage(g.canvas, 0, 0, W, H);
        g.save();
        g.filter = 'blur(' + b.toFixed(1) + 'px)';
        g.drawImage(snap, 0, 0, W, H);
        g.restore();
        // re-draw sharp center ellipse
        g.save();
        g.beginPath(); g.ellipse(W / 2, H / 2, cw / 2, ch / 2, 0, 0, 7); g.clip();
        g.drawImage(snap, 0, 0, W, H);
        g.restore();
      }
    },
    {
      id: 'p_soft', name: 'Soft Focus', icon: '🌸',
      desc: 'Dreamy soft focus.', css: 'brightness(1.1) saturate(1.1)',
      params: [{ key: 'intensity', label: 'Softness', min: 0, max: 20, def: 7, step: 0.5 }],
      draw: function (g, W, H, t, item, Pp) {
        var b = Pp.intensity == null ? 7 : Pp.intensity;
        if (b < 0.3) return;
        g.save(); g.globalAlpha = 0.55; g.filter = 'blur(' + b.toFixed(1) + 'px)';
        g.drawImage(g.canvas, 0, 0, W, H); g.restore();
      }
    },
    {
      id: 'p_film', name: 'Film Look', icon: '🎞️',
      desc: 'Cinematic grain + warm grade.', css: 'sepia(0.25) contrast(1.08) saturate(1.15)',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 50, step: 1 }],
      draw: function (g, W, H, t, item, Pp) {
        var inten = (Pp.intensity == null ? 50 : Pp.intensity) / 100, i;
        g.save();
        for (i = 0; i < 60 * inten; i++) {
          var v = Math.floor(rnd(i * 7 + 3) * 255);
          g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.1 * inten).toFixed(3) + ')';
          g.fillRect(rnd(i * 17) * W, rnd(i * 31) * H, 2, 2);
        }
        g.restore();
      }
    },
    {
      id: 'p_vintage', name: 'Vintage Photo', icon: '📻',
      desc: 'Faded retro tones.', css: 'sepia(0.55) contrast(0.92) brightness(1.02)',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 60, step: 1 }],
      draw: function (g, W, H, t, item, Pp) {
        var inten = (Pp.intensity == null ? 60 : Pp.intensity) / 100;
        g.save();
        g.fillStyle = 'rgba(255,240,210,' + (0.12 * inten).toFixed(3) + ')';
        g.fillRect(0, 0, W, H);
        var gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,20,0,' + (0.4 * inten).toFixed(3) + ')');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.restore();
      }
    },
    {
      id: 'p_pop', name: 'Color Pop', icon: '🎨',
      desc: 'Vivid punchy colors.', css: 'saturate(1.8) contrast(1.18)',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 65, step: 1 }]
    },
    {
      id: 'p_leak', name: 'Light Leak', icon: '🔆',
      desc: 'Warm photo light leak.', css: '',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 55, step: 1 }],
      draw: function (g, W, H, t, item, Pp) {
        var inten = (Pp.intensity == null ? 55 : Pp.intensity) / 100;
        var gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, 'rgba(255,160,60,' + (0.4 * inten).toFixed(3) + ')');
        gr.addColorStop(0.5, 'rgba(255,160,60,0)');
        gr.addColorStop(1, 'rgba(255,120,80,' + (0.25 * inten).toFixed(3) + ')');
        g.save(); g.globalCompositeOperation = 'screen';
        g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      }
    },
    {
      id: 'p_motion', name: 'Photo Motion', icon: '🎥',
      desc: 'Slow Ken Burns zoom.', css: '',
      params: [{ key: 'intensity', label: 'Zoom', min: 0, max: 40, def: 15, step: 1 }],
      draw: null // handled by transform in draw path
    },
    {
      id: 'p_cine', name: 'Cinematic Portrait', icon: '🎬',
      desc: 'Teal-orange grade + bars.', css: 'contrast(1.1) saturate(1.2)',
      params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, def: 60, step: 1 }],
      draw: function (g, W, H, t, item, Pp) {
        var inten = (Pp.intensity == null ? 60 : Pp.intensity) / 100;
        g.save();
        g.fillStyle = 'rgba(0,120,140,' + (0.08 * inten).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,120,40,' + (0.06 * inten).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
        var bh = H * 0.09 * inten;
        g.fillStyle = '#000'; g.fillRect(0, 0, W, bh); g.fillRect(0, H - bh, W, bh);
        g.restore();
      }
    }
  ];

  /* ================= BODY (honest placeholder) ================= */
  var BD = [
    { id: 'b_outline', name: 'Outline Glow' }, { id: 'b_neon', name: 'Neon Outline' },
    { id: 'b_trail', name: 'Motion Trail' }, { id: 'b_bodyglow', name: 'Body Glow' },
    { id: 'b_sil', name: 'Silhouette' }, { id: 'b_colorline', name: 'Color Outline' },
    { id: 'b_aura', name: 'Aura' }, { id: 'b_lighttrail', name: 'Light Trail' }
  ].map(function (e) { e.unavailable = 'model'; e.badge = 'Needs AI model'; return e; });

  /* ================= AI (honest placeholder) ================= */
  var AI = [
    { id: 'a_bgremove', name: 'Background Removal' }, { id: 'a_enhance', name: 'Portrait Enhancement' },
    { id: 'a_style', name: 'AI Style Transfer' }, { id: 'a_cartoon', name: 'Cartoon Style' },
    { id: 'a_anime', name: 'Anime Style' }, { id: 'a_relight', name: 'Portrait Relighting' },
    { id: 'a_motion', name: 'AI Motion' }, { id: 'a_seg', name: 'Subject Segmentation' },
    { id: 'a_smartblur', name: 'Smart Blur' }
  ].map(function (e) { e.unavailable = 'api'; e.badge = 'Needs API'; return e; });

  var SUBCATS = [
    { id: 'trending', name: 'Trending' }, { id: 'basic', name: 'Basic' },
    { id: 'glitch', name: 'Glitch' }, { id: 'retro', name: 'Retro' },
    { id: 'cinematic', name: 'Cinematic' }, { id: 'light', name: 'Light' },
    { id: 'camera', name: 'Camera' }
  ];

  /* ---- thumbnails: render each effect on a test pattern, cache dataURL ---- */
  var _thumbs = {};
  function testPattern(cv) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height;
    var gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#2b3a67'); gr.addColorStop(0.5, '#7b4b94'); gr.addColorStop(1, '#e86a92');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(W * 0.3, H * 0.35, W * 0.14, 0, 7); g.fill();
    g.fillStyle = '#06d6a0'; g.fillRect(W * 0.55, H * 0.5, W * 0.3, H * 0.3);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 ' + Math.round(H * 0.2) + 'px sans-serif';
    g.textAlign = 'center'; g.fillText('Aa', W * 0.72, H * 0.3);
  }
  function thumb(id) {
    if (_thumbs[id]) return _thumbs[id];
    var def = null, i;
    for (i = 0; i < V.length; i++) if (V[i].id === id) def = V[i];
    if (!def) for (i = 0; i < PH.length; i++) if (PH[i].id === id) def = PH[i];
    var cv = document.createElement('canvas'); cv.width = 72; cv.height = 72;
    testPattern(cv);
    if (def && def.apply) {
      try { def.apply(cv.getContext('2d'), 72, 72, 0.7, { start: 0, dur: 3, params: {} }); }
      catch (e) {}
    } else if (def && def.draw) {
      try {
        var g = cv.getContext('2d');
        if (def.css) { g.filter = def.css; g.drawImage(cv, 0, 0); g.filter = 'none'; }
        def.draw(g, 72, 72, 0, {}, {});
      } catch (e) {}
    } else if (def && def.css) {
      try {
        var g2 = cv.getContext('2d');
        var tmp = document.createElement('canvas'); tmp.width = 72; tmp.height = 72;
        tmp.getContext('2d').drawImage(cv, 0, 0);
        g2.filter = def.css; g2.drawImage(tmp, 0, 0); g2.filter = 'none';
      } catch (e) {}
    }
    _thumbs[id] = cv.toDataURL();
    return _thumbs[id];
  }

  function get(id) {
    var i;
    for (i = 0; i < V.length; i++) if (V[i].id === id) return V[i];
    for (i = 0; i < PH.length; i++) if (PH[i].id === id) return PH[i];
    return null;
  }

  // segments active at project time t (for composite + export)
  function activeAt(effects, t) {
    var out = [], i, s;
    for (i = 0; i < (effects || []).length; i++) {
      s = effects[i];
      if (t >= s.start && t < s.start + s.dur) out.push(s);
    }
    return out;
  }

  window.FXLIB = {
    video: V, photo: PH, body: BD, ai: AI, subcats: SUBCATS,
    get: get, thumb: thumb, activeAt: activeAt,
    // apply all active segments in order (later = on top)
    renderSegments: function (g, W, H, t, effects) {
      var segs = activeAt(effects, t), i, def;
      for (i = 0; i < segs.length; i++) {
        def = get(segs[i].fxId);
        if (def && def.apply) {
          try { def.apply(g, W, H, t, segs[i], segs[i]); } catch (e) {}
        }
      }
    },
    defaultParams: function (def) {
      var o = {};
      (def.params || []).forEach(function (p) { o[p.key] = p.def; });
      return o;
    }
  };
})();
