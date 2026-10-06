/* ViraCut AI — tx-frame.js — original photo-frame templates.
 * Concept: the photo sits INSIDE a decorative frame (frame stays static,
 * photo slow-zooms inside). All frame artwork is original/procedural —
 * painted in code, no copied assets. */
(function () {
  'use strict';

  function R(seed) { var s = seed; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function leaf(ctx, x, y, s, ang, c) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
    ctx.restore();
  }

  function stem(ctx, x0, len, sway, w, c) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, -4);
    ctx.bezierCurveTo(x0 + sway, len * 0.35, x0 - sway, len * 0.65, x0 + sway * 1.6, len);
    ctx.stroke();
  }

  function flower(ctx, x, y, s, petal, center) {
    var i, a;
    for (i = 0; i < 5; i++) {
      a = i / 5 * Math.PI * 2;
      ctx.fillStyle = petal;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.72, y + Math.sin(a) * s * 0.72, s * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = center;
    ctx.beginPath(); ctx.arc(x, y, s * 0.38, 0, Math.PI * 2); ctx.fill();
  }

  function imgSize(img) {
    return { w: img.naturalWidth || img.videoWidth || img.width || 0, h: img.naturalHeight || img.videoHeight || img.height || 0 };
  }
  function drawCoverRect(ctx, img, x, y, w, h) {
    var sz = imgSize(img), iw = sz.w, ih = sz.h;
    if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih);
    var dw = iw * s, dh = ih * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  var GREENS = ['#2d6a2f', '#3f8f3a', '#57a84e', '#1f4d24', '#6fbf5f'];

  var painters = {
    /* ---------------- GREEN VINES ---------------- */
    vines: {
      name: 'Green Vines',
      photo: 'rect',
      inset: function (W, H) { return { x: W * 0.055, y: H * 0.085, w: W * 0.89, h: H * 0.83, r: W * 0.045 }; },
      bg: function (ctx, W, H) {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0e2718'); g.addColorStop(0.6, '#07130c'); g.addColorStop(1, '#020604');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      },
      top: function (ctx, W, H, t, ins) {
        var rnd = R(77), v, i, p;
        // bark border around the photo
        var bw = W * 0.038;
        ctx.save();
        ctx.lineWidth = bw; ctx.strokeStyle = '#4a3524';
        roundRectPath(ctx, ins.x - bw * 0.35, ins.y - bw * 0.35, ins.w + bw * 0.7, ins.h + bw * 0.7, ins.r + bw * 0.35);
        ctx.stroke();
        ctx.lineWidth = bw * 0.3; ctx.strokeStyle = 'rgba(15,9,4,0.55)';
        roundRectPath(ctx, ins.x - bw * 0.35, ins.y - bw * 0.35, ins.w + bw * 0.7, ins.h + bw * 0.7, ins.r + bw * 0.35);
        ctx.stroke();
        // bark cracks
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,12,6,0.5)';
        for (i = 0; i < 14; i++) {
          var bx = ins.x - bw * 0.35 + rnd() * (ins.w + bw * 0.7);
          ctx.beginPath(); ctx.moveTo(bx, ins.y - bw * 0.35);
          ctx.lineTo(bx + (rnd() - 0.5) * W * 0.03, ins.y - bw * 0.35 + (ins.h + bw * 0.7) * rnd());
          ctx.stroke();
        }
        ctx.restore();
        // hanging vines from the top
        for (v = 0; v < 6; v++) {
          var x0 = W * (0.06 + rnd() * 0.88);
          var len = H * (0.10 + rnd() * 0.24);
          var sway = Math.sin(t * 1.5 + v * 1.7) * W * 0.010;
          stem(ctx, x0, len, sway, W * 0.009, '#2a4d22');
          var n = 6 + Math.floor(rnd() * 5);
          for (i = 0; i < n; i++) {
            p = 0.15 + 0.85 * (i / n);
            leaf(ctx, x0 + Math.sin(p * 6 + v * 2) * W * 0.022 + sway * p, len * p,
              W * (0.016 + rnd() * 0.020), rnd() * Math.PI * 2, GREENS[Math.floor(rnd() * GREENS.length)]);
          }
        }
        // climbers on left & right edges
        for (v = 0; v < 4; v++) {
          var side = v % 2 === 0 ? 0 : 1;
          var ex = side ? W * (0.97 + rnd() * 0.02) : W * (0.03 - rnd() * 0.02);
          var ey = H * (0.25 + rnd() * 0.5);
          for (i = 0; i < 7; i++) {
            leaf(ctx, ex + (rnd() - 0.5) * W * 0.05, ey + (i - 3) * H * 0.03,
              W * (0.018 + rnd() * 0.018), (side ? -1 : 1) * (0.4 + rnd() * 0.8),
              GREENS[Math.floor(rnd() * GREENS.length)]);
          }
        }
        // bushy leaves along the bottom
        for (i = 0; i < 26; i++) {
          leaf(ctx, W * rnd(), H * (0.94 + rnd() * 0.05),
            W * (0.022 + rnd() * 0.026), rnd() * Math.PI * 2,
            GREENS[Math.floor(rnd() * GREENS.length)]);
        }
      }
    },

    /* ---------------- GOLDEN ARCH (Islamic) ---------------- */
    arch: {
      name: 'Golden Arch',
      photo: 'arch',
      inset: function (W, H) { return { x: W * 0.13, y: H * 0.15, w: W * 0.74, h: H * 0.72 }; },
      archPath: function (ctx, W, H) {
        var ins = this.inset(W, H), x = ins.x, y = ins.y, w = ins.w, h = ins.h;
        var sy = y + h * 0.30;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x, sy);
        ctx.quadraticCurveTo(x, y, x + w / 2, y);
        ctx.quadraticCurveTo(x + w, y, x + w, sy);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
      },
      bg: function (ctx, W, H) {
        var g = ctx.createRadialGradient(W / 2, H * 0.3, H * 0.05, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, '#16213e'); g.addColorStop(1, '#05070f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // faint stars
        var rnd = R(913), i;
        ctx.fillStyle = 'rgba(253,230,138,0.5)';
        for (i = 0; i < 40; i++) {
          ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, rnd() * 1.6 + 0.4, 0, Math.PI * 2); ctx.fill();
        }
      },
      top: function (ctx, W, H, t, ins) {
        var self = this;
        // gold arch border
        ctx.save();
        ctx.lineWidth = W * 0.022;
        var g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#fde68a'); g.addColorStop(0.5, '#b8860b'); g.addColorStop(1, '#fde68a');
        ctx.strokeStyle = g;
        self.archPath(ctx, W, H); ctx.stroke();
        ctx.lineWidth = W * 0.006; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        self.archPath(ctx, W, H); ctx.stroke();
        ctx.restore();
        // finial on top
        var ax = W / 2, ay = H * 0.15;
        ctx.fillStyle = '#fde68a';
        ctx.beginPath(); ctx.arc(ax, ay - H * 0.035, W * 0.018, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ax - W * 0.004, ay - H * 0.035, W * 0.008, H * 0.02);
        // lantern glows, top corners
        [[W * 0.10, H * 0.10], [W * 0.90, H * 0.10]].forEach(function (pt) {
          var rg = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], W * 0.12);
          var pulse = 0.55 + 0.15 * Math.sin(t * 2 + pt[0]);
          rg.addColorStop(0, 'rgba(253,230,138,' + pulse + ')');
          rg.addColorStop(1, 'rgba(253,230,138,0)');
          ctx.fillStyle = rg;
          ctx.fillRect(pt[0] - W * 0.12, pt[1] - W * 0.12, W * 0.24, W * 0.24);
        });
      }
    },

    /* ---------------- ROSE FRAME ---------------- */
    floral: {
      name: 'Rose Frame',
      photo: 'rect',
      inset: function (W, H) { return { x: W * 0.07, y: H * 0.10, w: W * 0.86, h: H * 0.80, r: W * 0.06 }; },
      bg: function (ctx, W, H) {
        var g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#2b1220'); g.addColorStop(1, '#0d0509');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      },
      top: function (ctx, W, H, t, ins) {
        var rnd = R(55), i;
        // thin gold border
        ctx.save();
        ctx.lineWidth = W * 0.012; ctx.strokeStyle = '#e8b4b8';
        roundRectPath(ctx, ins.x - W * 0.015, ins.y - W * 0.015, ins.w + W * 0.03, ins.h + W * 0.03, ins.r + W * 0.015);
        ctx.stroke();
        ctx.restore();
        // corner flower clusters
        var corners = [[ins.x, ins.y], [ins.x + ins.w, ins.y], [ins.x, ins.y + ins.h], [ins.x + ins.w, ins.y + ins.h]];
        corners.forEach(function (c, ci) {
          for (i = 0; i < 5; i++) {
            var fx = c[0] + (rnd() - 0.5) * W * 0.16 * (ci % 2 ? -1 : 1) * -1;
            var fy = c[1] + (rnd() - 0.5) * W * 0.16 * (ci < 2 ? -1 : 1) * -1;
            flower(ctx, c[0] + (rnd() - 0.5) * W * 0.14, c[1] + (rnd() - 0.5) * W * 0.14,
              W * (0.020 + rnd() * 0.022),
              rnd() > 0.4 ? '#f9a8d4' : '#fde68a', '#fff1f2');
          }
          for (i = 0; i < 6; i++)
            leaf(ctx, c[0] + (rnd() - 0.5) * W * 0.18, c[1] + (rnd() - 0.5) * W * 0.18,
              W * (0.016 + rnd() * 0.014), rnd() * Math.PI * 2, GREENS[Math.floor(rnd() * GREENS.length)]);
        });
        // floating petals
        for (i = 0; i < 10; i++) {
          var px = (rnd() * W + t * W * 0.02 * (1 + rnd())) % W;
          var py = (rnd() * H + t * H * 0.015) % H;
          ctx.save(); ctx.globalAlpha = 0.7; ctx.translate(px, py); ctx.rotate(t * 0.8 + i);
          ctx.fillStyle = '#f9a8d4';
          ctx.beginPath(); ctx.ellipse(0, 0, W * 0.012, W * 0.007, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }
  };

  window.TXFrame = {
    list: function () {
      return Object.keys(painters).map(function (id) { return { id: id, name: painters[id].name }; });
    },
    /* full frame render: bg -> photo (slow zoom inside) -> frame art on top */
    render: function (ctx, W, H, tpl, img, t, local, dur) {
      var p = painters[tpl.frame];
      if (!p) return false;
      var ins = p.inset(W, H);
      p.bg(ctx, W, H);
      ctx.save();
      if (p.photo === 'arch') p.archPath(ctx, W, H);
      else roundRectPath(ctx, ins.x, ins.y, ins.w, ins.h, ins.r);
      ctx.clip();
      var sz = img ? imgSize(img) : { w: 0, h: 0 };
      if (sz.w && sz.h) {
        var pr = Math.max(0, Math.min(1, (local || 0) / Math.max(dur || 15, 0.01)));
        var z = 1 + 0.12 * pr;
        var cw = ins.w * z, ch = ins.h * z;
        var cx = ins.x + ins.w / 2, cy = ins.y + ins.h / 2;
        drawCoverRect(ctx, img, cx - cw / 2, cy - ch / 2, cw, ch);
      } else {
        var g = ctx.createLinearGradient(ins.x, ins.y, ins.x, ins.y + ins.h);
        g.addColorStop(0, '#475569'); g.addColorStop(1, '#0f172a');
        ctx.fillStyle = g; ctx.fillRect(ins.x - 2, ins.y - 2, ins.w + 4, ins.h + 4);
      }
      ctx.restore();
      p.top(ctx, W, H, t, ins);
      // template text (e.g. Urdu caption) still supported
      return true;
    }
  };
})();
