/* ViraCut AI — editor.js (1/3): core, transport, compositor.
   Canvas-based preview compositing video + photos (Ken Burns) + text +
   captions + crossfade transitions + filters. Audio mixed via WebAudio. */
(function () {
  'use strict';

  var XF = 0.5; // crossfade seconds

  var FILTERS = {
    none: 'none',
    warm: 'sepia(0.35) saturate(1.35)',
    cool: 'saturate(1.1) hue-rotate(-18deg) brightness(1.06)',
    mono: 'grayscale(1)',
    vivid: 'saturate(1.8) contrast(1.15)',
    vintage: 'sepia(0.55) contrast(0.95) brightness(0.96)'
  };

  var Editor = {
    project: null,
    canvas: null, ctx: null,
    vidEls: new Map(), imgEls: new Map(), stills: new Map(), // clipId -> dataURL (end frame)
    playing: false, t: 0, rafId: 0, lastTs: 0,
    selClipId: null, tool: null,
    audioKept: null, // offsets for resume
    placingSticker: null, selStickerId: null,
    _seeking: false,
    // Phase 1 additions
    zoomPps: 30, _tlWidths: [], _tlX: [], _tlBound: false,
    staged: [], audioBufs: new Map(), // clipId -> AudioBuffer (session only)

    /* ================= open / teardown ================= */
    open: function (id) {
      var p = Store.openProject(id);
      if (!p) { toast('Project not found.', true); return; }
      // Phase 2 migrations
      p.overlays = p.overlays || [];
      p.ovLaneCount = Math.max(1, Math.min(3, p.ovLaneCount || 1));
      this.project = p;
      this.vidEls = new Map(); this.imgEls = new Map(); this.stills = new Map();
      this.thumbStrips = new Map(); this.ovEls = new Map();
      this.t = 0; this.playing = false; this.selClipId = null; this.tool = null;
      this.selOvId = null; this.selTxId = null;
      this.audioKept = null; this.placingSticker = null; this.selStickerId = null;
      this.staged = []; this.audioBufs = new Map(); this._tlBound = false;
      try { this.zoomPps = Math.max(8, Math.min(160, parseFloat(localStorage.getItem('viracut_tlzoom')) || 30)); } catch (e) { this.zoomPps = 30; }
      this.canvas = document.getElementById('edCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.sizeCanvas();
      document.getElementById('edName').textContent = p.name;
      this.syncMedia(); this.bindTimeline();
      this.renderTools(); this.setTool(null); this.renderTimeline(); this.renderClipStrip(); this.renderStickers(); this.updateUndoRedo();
      this.updateTransport();
      App.show('screen-editor');
      this.drawOnce();
      if (App.deepLink && App.deepLink.panel) { this.setTool(App.deepLink.panel); App.deepLink = null; }
    },
    teardown: function () {
      this.pause();
      AudioLab.Engine.stop();
      this.vidEls.forEach(function (el) { try { el.pause(); } catch (e) {} });
      cancelAnimationFrame(this.rafId);
      this.playing = false;
    },
    sizeCanvas: function () {
      var a = this.project.aspect, W, H;
      if (a === '16:9') { W = 640; H = 360; }
      else if (a === '1:1') { W = 540; H = 540; }
      else { W = 405; H = 720; }
      this.canvas.width = W; this.canvas.height = H;
      this.canvas.style.aspectRatio = W + ' / ' + H;
    },

    /* ================= media elements ================= */
    syncMedia: function () {
      var self = this, seen = {};
      this.project.clips.forEach(function (c) {
        seen[c.id] = true;
        if (c.type === 'video' && c.url && !self.vidEls.has(c.id)) self.makeVideoEl(c);
        if (c.type === 'photo' && c.url && !self.imgEls.has(c.id)) {
          var im = new Image();
          im.onload = function () { self.captureStill(c); };
          im.src = c.url; self.imgEls.set(c.id, im);
        }
      });
      // overlays
      var ovSeen = {};
      (this.project.overlays || []).forEach(function (ov) {
        ovSeen[ov.id] = true;
        if (!ov.url || self.ovEls.has(ov.id)) return;
        if (ov.type === 'video') {
          var v = document.createElement('video');
          v.src = ov.url; v.preload = 'auto'; v.playsInline = true; v.muted = true; v.loop = true;
          self.ovEls.set(ov.id, v);
        } else {
          var im2 = new Image(); im2.src = ov.url;
          self.ovEls.set(ov.id, im2);
        }
      });
      // drop stale
      this.vidEls.forEach(function (el, id) { if (!seen[id]) { try { el.pause(); } catch (e) {} self.vidEls.delete(id); } });
      this.imgEls.forEach(function (im, id) { if (!seen[id]) self.imgEls.delete(id); });
      this.ovEls.forEach(function (el, id) { if (!ovSeen[id]) { try { el.pause && el.pause(); } catch (e) {} self.ovEls.delete(id); } });
    },
    makeVideoEl: function (clip) {
      var self = this;
      var el = document.createElement('video');
      el.src = clip.url; el.preload = 'auto'; el.playsInline = true;
      el.muted = false;
      // FIX (preview): redraw as soon as video data arrives; seek to in-point so first frame shows
      el.addEventListener('loadeddata', function () {
        try { el.currentTime = Math.max(0, Math.min(clip.in || 0, (el.duration || 1) - 0.1)); } catch (e) {}
        self.captureStill(clip);
        self.drawOnce();
      });
      // scrubbing: after any seek completes while paused, refresh the preview frame
      el.addEventListener('seeked', function () {
        if (!self.playing) self.drawOnce();
      });
      el.addEventListener('error', function () {
        toast('Media error: could not decode "' + (clip.name || 'video') + '". Try MP4/H.264.', true);
      });
      this.vidEls.set(clip.id, el);
      // route element audio through WebAudio so per-clip volume/fade/mute apply in preview
      try { if (window.AudioLab) AudioLab.Engine.routeVideo(el, false); } catch (e) {}
    },
    captureStill: function (clip) {
      // end-frame still for crossfade + timeline thumb fallback
      var self = this;
      try {
        if (clip.type === 'video') {
          var el = this.vidEls.get(clip.id);
          if (!el) return;
          var prevPos = el.currentTime; // restore after capture so preview isn't disturbed
          var done = function () {
            try {
              var cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
              cv.getContext('2d').drawImage(el, 0, 0, 96, 54);
              self.stills.set(clip.id, cv.toDataURL('image/jpeg', 0.6));
              self.renderTimeline();
            } catch (e) {}
            el.removeEventListener('seeked', done);
            // restore playback position so the preview shows the right frame
            try { el.currentTime = prevPos; } catch (e2) {}
          };
          el.addEventListener('seeked', done);
          el.currentTime = Math.max(0, (clip.out || clip.duration || 1) - 0.08);
        } else {
          var im = this.imgEls.get(clip.id);
          if (!im || !im.complete) return;
          var cv2 = document.createElement('canvas'); cv2.width = 96; cv2.height = 54;
          var g = cv2.getContext('2d');
          var s = Math.max(96 / im.width, 54 / im.height);
          g.drawImage(im, (96 - im.width * s) / 2, (54 - im.height * s) / 2, im.width * s, im.height * s);
          this.stills.set(clip.id, cv2.toDataURL('image/jpeg', 0.6));
        }
      } catch (e) {}
    },

    /* ================= transport ================= */
    toggle: function () { this.playing ? this.pause() : this.play(); },
    play: function () {
      var self = this;
      var tm = Store.timing();
      if (!this.project || !tm.items.length) { toast('Import media first.'); return; }
      if (this.t >= tm.total - 0.05) this.t = 0;
      // decode extracted-audio buffers first if needed
      this.ensureAudioBuffers().then(function () {
        if (self.playing) return;
        self.playing = true;
        document.getElementById('edPlay').textContent = '⏸';
        self.startAudio();
        self.lastTs = performance.now();
        var loop = function (now) {
          if (!self.playing) return;
          var dt = (now - self.lastTs) / 1000; self.lastTs = now;
          self.t += dt;
          var total = Store.timing().total;
          if (self.t >= total) { self.t = total; self.pause(); self.drawOnce(); self.updateTransport(); return; }
          self.syncClipPlayback();
          self.drawOnce();
          self.updateTransport();
          self.rafId = requestAnimationFrame(loop);
        };
        self.rafId = requestAnimationFrame(loop);
      });
    },
    pause: function () {
      if (!this.playing) return;
      this.playing = false;
      cancelAnimationFrame(this.rafId);
      document.getElementById('edPlay').textContent = '▶';
      this.vidEls.forEach(function (el) { try { el.pause(); } catch (e) {} });
      this.audioKept = AudioLab.Engine.pause();
      this.updateTransport();
    },
    seek: function (t) {
      var total = Store.timing().total;
      this.t = Math.max(0, Math.min(total, t));
      var found = Store.clipAt(this.t);
      if (found) {
        var c = found.item.clip;
        if (c.type === 'video') {
          var el = this.vidEls.get(c.id);
          if (el && el.readyState >= 1) {
            try { el.currentTime = Math.min(c.in + (this.t - found.item.start) * (c.speed || 1), c.out - 0.05); } catch (e) {}
          }
        }
      }
      this.drawOnce(); this.updateTransport();
    },
    syncClipPlayback: function () {
      var self = this;
      var found = Store.clipAt(this.t);
      this.vidEls.forEach(function (el, id) {
        var isCur = found && found.item.clip.id === id;
        try {
          if (isCur) {
            var c = found.item.clip;
            el.playbackRate = c.speed || 1;
            if (el.paused) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
            var exp = c.in + (self.t - found.item.start) * (c.speed || 1);
            if (Math.abs(el.currentTime - exp) > 0.4 && el.readyState >= 1) el.currentTime = Math.min(exp, c.out - 0.05);
          } else if (!el.paused) el.pause();
        } catch (e) {}
      });
      this.applyClipAudioGain(this.t);
      // overlay videos: play only while active on timeline
      var L2 = window.EditorLogic, tt = this.t;
      this.ovEls.forEach(function (el, id) {
        if (!el.play) return;
        var ov = null;
        var ovs = self.project.overlays || [];
        for (var i = 0; i < ovs.length; i++) if (ovs[i].id === id) ov = ovs[i];
        var active = ov && L2.ovActive(ov, tt);
        try {
          if (active) { if (el.paused) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); } }
          else if (!el.paused) el.pause();
        } catch (e) {}
      });
    },
    /* per-clip volume + fade in/out + mute, applied to the current clip's gain node */
    applyClipAudioGain: function (t) {
      var found = Store.clipAt(t);
      var self = this;
      this.vidEls.forEach(function (el, id) {
        try {
          var mon = el._audMon;
          if (!mon) return;
          var target = 0;
          if (found && found.item.clip.id === id) {
            target = window.EditorLogic ? EditorLogic.fadeGain(found.item.clip, t - found.item.start) : (found.item.clip.volume == null ? 1 : found.item.clip.volume);
          }
          if (Math.abs(mon.gain.value - target) > 0.02) mon.gain.value = target;
        } catch (e) {}
      });
    },
    startAudio: function () {
      var p = this.project, voices = [], kept = this.audioKept, ki = 0;
      var baseT = this.t;
      if (p.music && p.music.buffer) {
        var mo = kept && kept[0] && kept[0].buffer === p.music.buffer ? kept[0].offset : 0;
        voices.push({ buffer: p.music.buffer, volume: p.music.volume, loop: true, offset: mo });
        ki = 1;
      }
      p.voiceovers.forEach(function (v) {
        if (!v.buffer) return;
        var k = kept && kept[ki];
        var off = (k && k.buffer === v.buffer) ? k.offset : 0;
        voices.push({ buffer: v.buffer, volume: v.volume, loop: false, offset: off, resumed: !!(k && k.buffer === v.buffer) });
        ki++;
      });
      // extracted audio clips: scheduled at their timeline position
      var self = this;
      var tm = Store.timing();
      tm.items.forEach(function (item) {
        var c = item.clip;
        if (c.type !== 'audio') return;
        var buf = self.audioBufs.get(c.id);
        if (!buf) return;
        var k = kept && kept[ki];
        var useKept = k && k.buffer === buf;
        var off = useKept ? k.offset : (c.in || 0);
        voices.push({
          buffer: buf, volume: (c.volume == null ? 1 : c.volume), loop: false,
          offset: off, resumed: !!useKept, at: item.start, dur: EditorLogic.playDur(c),
          fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0
        });
        ki++;
      });
      if (voices.length) AudioLab.Engine.start(voices, false, baseT);
      this.audioKept = null;
    },
    updateTransport: function () {
      var total = Store.timing().total;
      var L = window.EditorLogic;
      var te = document.getElementById('edTime');
      if (te) te.textContent = L.fmtTime(this.t) + ' / ' + L.fmtTime(total);
      // keep fixed center playhead on current time
      if (this.playing) this.centerPlayhead();
    },

    /* ================= compositor ================= */
    drawOnce: function () {
      if (!this.ctx) return;
      this.composite(this.ctx, this.canvas.width, this.canvas.height, this.t, false);
    },
    composite: function (g, W, H, t, forExport) {
      var p = this.project;
      g.save();
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (!p) { g.restore(); return; }
      var found = Store.clipAt(t);
      if (!found) {
        g.fillStyle = '#9AA0B4'; g.font = '400 ' + Math.round(W * 0.035) + 'px sans-serif'; g.textAlign = 'center';
        g.fillText('Import media to preview', W / 2, H / 2);
        g.restore(); return;
      }
      var item = found.item, idx = found.index;
      // crossfade: previous clip end-still dissolving
      var xf = item.clip.transitionIn === 'crossfade' && idx > 0 && (t - item.start) < XF;
      this.drawClipFX(g, item, W, H, t);
      if (xf) {
        var prev = Store.timing().items[idx - 1];
        var still = this.stills.get(prev.clip.id);
        var a = 1 - (t - item.start) / XF;
        if (still) {
          var im = new Image(); // cached by browser; stills are dataURLs
          // draw via temp image each frame is wasteful — use preloaded
          var pre = this._stillImgs || (this._stillImgs = {});
          if (!pre[prev.clip.id] || pre[prev.clip.id]._src !== still) {
            var ni = new Image(); ni._src = still; ni.src = still; pre[prev.clip.id] = ni;
          }
          var sim = pre[prev.clip.id];
          if (sim.complete && sim.naturalWidth) {
            g.save(); g.globalAlpha = Math.max(0, Math.min(1, a));
            this.drawCover(g, sim, W, H);
            g.restore();
          }
        }
      }
      // text overlays (Pro kinetic-text FX hook)
      var self = this;
      var kfx = (window.FX && found) ? FX.get(found.item.clip.fx) : null;
      p.texts.forEach(function (tx) {
        if (t >= tx.start && t <= tx.end) {
          if (kfx && kfx.kineticText) kfx.kineticText(g, tx, W, H, t);
          else self.drawText(g, tx, W, H);
        }
      });
      // captions
      var cap = Captions.at(t);
      if (cap) {
        g.save();
        g.font = '700 ' + Math.round(W * 0.045) + 'px sans-serif'; g.textAlign = 'center';
        var tw = Math.min(W * 0.9, g.measureText(cap.text).width + 36);
        var bw = tw, bh = W * 0.075, bx = (W - bw) / 2, by = H - bh - H * 0.06;
        g.fillStyle = 'rgba(0,0,0,.72)';
        g.beginPath(); g.roundRect(bx, by, bw, bh, 12); g.fill();
        g.fillStyle = '#fff';
        g.fillText(cap.text, W / 2, by + bh * 0.68, W * 0.88);
        g.restore();
      }
      // stickers (export only — preview uses DOM layer)
      if (forExport) {
        p.stickers.forEach(function (s) {
          g.save();
          g.font = Math.round(s.size * W) + 'px sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(s.emoji, s.x * W, s.y * H);
          g.restore();
        });
      }
      // overlays (photo/video picture-in-picture)
      self.drawOverlays(g, W, H, t);
      g.restore();
    },
    drawOverlays: function (g, W, H, t) {
      var self = this, p = this.project;
      if (!p || !p.overlays || !p.overlays.length) return;
      var L = window.EditorLogic;
      p.overlays.forEach(function (ov) {
        if (!L.ovActive(ov, t)) return;
        var media = null;
        if (ov.type === 'video') media = self.ovEls.get(ov.id);
        else media = self.ovEls.get(ov.id);
        if (!media) return;
        var mw, mh;
        if (ov.type === 'video') {
          if (!media.videoWidth || media.readyState < 2) return;
          mw = media.videoWidth; mh = media.videoHeight;
        } else {
          if (!media.complete || !media.naturalWidth) return;
          mw = media.naturalWidth; mh = media.naturalHeight;
        }
        g.save();
        g.globalAlpha = Math.max(0, Math.min(1, ov.opacity == null ? 1 : ov.opacity));
        g.translate(ov.x * W, ov.y * H);
        if (ov.rotation) g.rotate(ov.rotation * Math.PI / 180);
        var s = (ov.scale || 0.4) * W / mw;
        var dw = mw * s, dh = mh * s;
        // cover-fit into a 16:9-ish box? No — draw natural aspect
        try { g.drawImage(media, -dw / 2, -dh / 2, dw, dh); } catch (e) {}
        if (self.selOvId === ov.id) {
          g.strokeStyle = '#8B5CF6'; g.lineWidth = 3;
          g.strokeRect(-dw / 2, -dh / 2, dw, dh);
        }
        g.restore();
      });
    },
    drawClipFX: function (g, item, W, H, t) {
      // Smart FX wrapper: pre-transforms, pixel post-processing, overlays.
      // Shared by preview and export, so effects are baked into the video.
      var fx = (window.FX ? FX.get(item.clip.fx) : null) || {};
      if (fx.post) {
        var off = this._fxOff || (this._fxOff = document.createElement('canvas'));
        if (off.width !== W || off.height !== H) { off.width = W; off.height = H; }
        var og = off.getContext('2d');
        og.fillStyle = '#000'; og.fillRect(0, 0, W, H);
        this.drawClipMedia(og, item.clip, item, W, H, t, 1);
        fx.post(g, off, item.clip, item, W, H, t);
        if (fx.over) { g.save(); fx.over(g, item.clip, item, W, H, t); g.restore(); }
      } else {
        if (fx.pre) {
          g.save();
          fx.pre(g, item.clip, item, W, H, t);
          this.drawClipMedia(g, item.clip, item, W, H, t, 1);
          g.restore();
        } else {
          this.drawClipMedia(g, item.clip, item, W, H, t, 1);
        }
        if (fx.over) { g.save(); fx.over(g, item.clip, item, W, H, t); g.restore(); }
      }
    },
    drawClipMedia: function (g, clip, item, W, H, t, alpha) {
      g.save();
      g.globalAlpha = alpha == null ? 1 : alpha;
      var pf = FILTERS[this.project.filter] || 'none';
      var af = this.adjustFilter ? this.adjustFilter(clip) : '';
      g.filter = (af ? af + ' ' : '') + pf;
      var rot = ((clip.rotation || 0) % 360 + 360) % 360;
      g.translate(W / 2, H / 2);
      if (rot) g.rotate(rot * Math.PI / 180);
      if (clip.flipH) g.scale(-1, 1);
      if (clip.flipV) g.scale(1, -1);
      var swap = rot === 90 || rot === 270;
      var dw = swap ? H : W, dh = swap ? W : H;
      if (clip.type === 'audio') {
        // audio-only clip: draw a simple label card
        g.fillStyle = '#101828'; g.fillRect(-dw / 2, -dh / 2, dw, dh);
        g.fillStyle = '#8B5CF6'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '700 ' + Math.round(dw * 0.09) + 'px sans-serif';
        g.fillText('🎵', 0, -dh * 0.08);
        g.fillStyle = '#C9CEDD'; g.font = '600 ' + Math.round(dw * 0.032) + 'px sans-serif';
        g.fillText(String(clip.name || 'Audio').slice(0, 24), 0, dh * 0.1, dw * 0.9);
        g.restore(); return;
      }
      if (clip.type === 'placeholder' || !clip.url) {
        // template placeholder card
        g.fillStyle = '#17142b'; g.fillRect(-dw / 2, -dh / 2, dw, dh);
        g.strokeStyle = 'rgba(168,85,247,.75)'; g.lineWidth = Math.max(2, dw * 0.006);
        g.setLineDash([14, 10]);
        var pw = dw * 0.86, ph = dh * 0.62;
        g.beginPath();
        if (g.roundRect) g.roundRect(-pw / 2, -ph / 2, pw, ph, 18); else g.rect(-pw / 2, -ph / 2, pw, ph);
        g.stroke(); g.setLineDash([]);
        g.fillStyle = '#a855f7'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '700 ' + Math.round(dw * 0.11) + 'px sans-serif';
        g.fillText('＋', 0, -dh * 0.06);
        g.fillStyle = '#e6e1f7'; g.font = '600 ' + Math.round(dw * 0.04) + 'px sans-serif';
        g.fillText(clip.hint || 'Tap the clip below to add your media', 0, dh * 0.1, dw * 0.78);
        g.restore(); return;
      }
      if (clip.type === 'video') {
        var el = this.vidEls.get(clip.id);
        if (el && el.readyState >= 2 && el.videoWidth) {
          this.drawFit(g, el, el.videoWidth, el.videoHeight, dw, dh, clip.fit || 'cover');
        } else {
          g.fillStyle = '#141428'; g.fillRect(-dw / 2, -dh / 2, dw, dh);
          g.fillStyle = '#9AA0B4'; g.font = '400 15px sans-serif'; g.textAlign = 'center';
          g.fillText('Loading…', 0, 5);
        }
      } else {
        var im = this.imgEls.get(clip.id);
        if (im && im.complete && im.naturalWidth) {
          if (clip.kb === false) { this.drawFit(g, im, im.width, im.height, dw, dh, clip.fit || 'cover'); }
          else {
            // Ken Burns: gentle zoom + pan across the clip
            var pr = (t - item.start) / Math.max(0.01, item.end - item.start);
            var z = 1 + 0.18 * pr, px = (pr - 0.5) * 0.08 * dw;
            g.translate(px, 0);
            this.drawFit(g, im, im.width, im.height, dw * z, dh * z, 'cover');
          }
        } else {
          g.fillStyle = '#141428'; g.fillRect(-dw / 2, -dh / 2, dw, dh);
        }
      }
      g.restore();
    },
    drawFit: function (g, src, sw, sh, dw, dh, fit) {
      var s = fit === 'contain' ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
      var w = sw * s, h = sh * s;
      g.drawImage(src, -w / 2, -h / 2, w, h);
    },
    drawCover: function (g, src, W, H) {
      var s = Math.max(W / src.naturalWidth, H / src.naturalHeight);
      var w = src.naturalWidth * s, h = src.naturalHeight * s;
      g.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
    },
    drawText: function (g, tx, W, H) {
      g.save();
      var fs = Math.round((tx.size || 5) * W / 100);
      g.font = '800 ' + fs + 'px sans-serif'; g.textAlign = 'center';
      var y = tx.position === 'top' ? H * 0.14 : tx.position === 'bottom' ? H * 0.82 : H * 0.5;
      g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 8;
      g.fillStyle = tx.color || '#ffffff';
      var words = String(tx.text).split(' '), lines = [], line = '';
      words.forEach(function (w) {
        var t2 = line + w + ' ';
        if (g.measureText(t2).width > W * 0.88 && line) { lines.push(line); line = w + ' '; } else line = t2;
      });
      lines.push(line);
      var lh = fs * 1.25, y0 = y - (lines.length - 1) * lh / 2;
      lines.forEach(function (l, i) { g.fillText(l, W / 2, y0 + i * lh); });
      g.restore();
    }
  };

  window.Editor = Editor;
})();
/* ViraCut AI — editor.js: EditorLogic — pure, DOM-free helpers (unit-testable).
   All math used by the Phase 1 features lives here. */
(function () {
  'use strict';
  var L = {
    /* clip playback duration after speed */
    playDur: function (clip) {
      return Math.max(0.1, (clip.out - clip.in)) / (clip.speed || 1);
    },
    /* split point m (media seconds) -> [aIn,aOut,bIn,bOut] */
    splitBounds: function (clip, m) {
      m = Math.max(clip.in + 0.25, Math.min(clip.out - 0.25, m));
      m = +m.toFixed(2);
      return [clip.in, m, m, clip.out];
    },
    /* validate custom speed 0.1x..8x */
    clampSpeed: function (v) {
      v = parseFloat(v);
      if (isNaN(v) || v < 0.1 || v > 8) return null;
      return +v.toFixed(2);
    },
    /* effective audio gain for a clip at `pos` seconds into its timeline playback.
       Applies volume (0..1), mute, linear fade in/out over fadeIn/fadeOut seconds. */
    fadeGain: function (clip, pos) {
      if (clip.muted) return 0;
      var v = (clip.volume == null ? 1 : clip.volume);
      var dur = L.playDur(clip);
      var fi = Math.max(0, clip.fadeIn || 0), fo = Math.max(0, clip.fadeOut || 0);
      var g = 1;
      if (fi > 0 && pos < fi) g *= Math.max(0, pos / fi);
      if (fo > 0 && pos > dur - fo) g *= Math.max(0, (dur - pos) / fo);
      return Math.max(0, Math.min(1, v * g));
    },
    /* estimated export bytes: total seconds * (video + audio bitrate) / 8 */
    estBytes: function (totalSec, videoBps, audioBps) {
      return Math.max(0, totalSec) * ((videoBps || 0) + (audioBps || 0)) / 8;
    },
    /* move element in array from -> to, returns new array */
    reorder: function (arr, from, to) {
      var a = arr.slice();
      to = Math.max(0, Math.min(a.length - 1, to));
      var x = a.splice(from, 1)[0];
      a.splice(to, 0, x);
      return a;
    },
    /* timeline x (px) of project time t.
       items: [{start, end, x, w}] — x/w are pixel geometry of each timeline card */
    playheadX: function (items, t) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (t <= it.end || i === items.length - 1) {
          var r = (it.end - it.start) > 0 ? (t - it.start) / (it.end - it.start) : 0;
          r = Math.max(0, Math.min(1, r));
          return it.x + r * it.w;
        }
      }
      return 0;
    },
    /* ---- Phase 2 helpers ---- */
    /* seconds -> "MM:SS" */
    fmtTime: function (s) {
      s = Math.max(0, s || 0);
      var m = Math.floor(s / 60), ss = Math.floor(s % 60);
      return (m < 10 ? '0' + m : '' + m) + ':' + (ss < 10 ? '0' + ss : '' + ss);
    },
    /* nice time-marker step (seconds) so labels are >= ~70px apart */
    markerStep: function (pps) {
      var steps = [1, 2, 5, 10, 15, 30, 60];
      for (var i = 0; i < steps.length; i++) if (steps[i] * pps >= 70) return steps[i];
      return 60;
    },
    /* how many thumbnails for a clip of durSec seconds: 1 per ~2s, clamped 2..8 */
    thumbCount: function (durSec) {
      var n = Math.round((durSec || 3) / 2);
      return Math.max(2, Math.min(8, n));
    },
    /* pure trim math: returns {in,out} after dragging `which` handle by dt seconds */
    trimApply: function (clip, which, dt) {
      var nin = clip.in, nout = clip.out;
      if (which === 'l') nin = Math.max(0, Math.min(clip.out - 0.1, clip.in + dt));
      else nout = Math.max(clip.in + 0.1, clip.out + dt);
      if (clip.type === 'video' && clip.duration) {
        nin = Math.max(0, nin); nout = Math.min(clip.duration, nout);
        if (nout - nin < 0.1) { if (which === 'l') nin = nout - 0.1; else nout = nin + 0.1; }
      }
      return { 'in': +nin.toFixed(2), out: +nout.toFixed(2) };
    },
    /* lane block geometry: x/width in px for a block at startT with durT */
    laneGeom: function (startT, durT, pps) {
      return { x: Math.round(startT * pps), w: Math.max(28, Math.round(durT * pps)) };
    },
    /* is overlay visible at project time t? */
    ovActive: function (ov, t) { return t >= ov.start && t < ov.start + ov.dur; },
    /* project time from scroll position (center-playhead model).
       scrollLeft includes padL left padding. */
    timeFromScroll: function (scrollLeft, viewW, pps, total, padL) {
      var t = (scrollLeft - (padL || 0) + viewW / 2) / Math.max(1, pps);
      return Math.max(0, Math.min(total, t));
    },
    /* scrollLeft needed to center project time t */
    scrollForTime: function (t, viewW, pps) {
      return Math.max(0, t * pps - viewW / 2);
    },
    /* waveform peaks: n values 0..1 from Float32Array channel data */
    wavePeaks: function (data, n) {
      var out = [], len = data.length || 1;
      for (var i = 0; i < n; i++) {
        var s = Math.floor(i * len / n), e = Math.floor((i + 1) * len / n);
        var m = 0;
        for (var j = s; j < e; j += 4) { var v = Math.abs(data[j] || 0); if (v > m) m = v; }
        out.push(Math.max(0, Math.min(1, m)));
      }
      return out;
    }
  };
  window.EditorLogic = L;
})();
/* ViraCut AI — editor.js (2/3): media import, timeline, clip operations */
(function () {
  'use strict';
  var Editor = window.Editor;

  /* ================= import ================= */
  Editor.importFiles = function (files) {
    var self = this, p = this.project;
    if (!p) return;
    var list = Array.prototype.slice.call(files).filter(function (f) {
      return f.type.indexOf('video') === 0 || f.type.indexOf('image') === 0;
    });
    if (!list.length) { toast('No video/photo files selected.', true); return; }
    var pending = list.length;
    list.forEach(function (f) {
      var url = URL.createObjectURL(f);
      if (f.type.indexOf('video') === 0) {
        var v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = function () {
          var id = Store.uid('clip');
          Store.mediaCache.set(id, url);
          var dur = v.duration || 5;
          p.clips.push({ id: id, type: 'video', name: f.name, url: url, duration: dur, in: 0, out: dur, speed: 1, rotation: 0, flipH: false, flipV: false, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, fit: 'cover', transitionIn: 'none' });
          v.onloadedmetadata = null;
          fin();
        };
        v.onerror = function () { toast('Could not read: ' + f.name, true); fin(); };
        v.src = url;
      } else {
        var img = new Image();
        img.onload = function () {
          var id = Store.uid('clip');
          Store.mediaCache.set(id, url);
          p.clips.push({ id: id, type: 'photo', name: f.name, url: url, duration: 3, in: 0, out: 3, speed: 1, rotation: 0, fit: 'cover', transitionIn: 'none', kb: true });
          fin();
        };
        img.onerror = function () { toast('Could not read: ' + f.name, true); fin(); };
        img.src = url;
      }
    });
    function fin() {
      pending--;
      if (pending <= 0) {
        this.snapshot(); Store.persist();
        self.syncMedia(); self.renderTimeline(); self.drawOnce(); self.updateTransport();
        toast(list.length + ' clip(s) added.');
      }
    }
  };

  /* ---------- PREVIEW BEFORE ADDING (staging) ---------- */
  Editor.stageFiles = function (files) {
    var self = this, p = this.project;
    if (!p) return;
    var list = Array.prototype.slice.call(files).filter(function (f) {
      return f.type.indexOf('video') === 0 || f.type.indexOf('image') === 0;
    });
    if (!list.length) { toast('No video/photo files selected.', true); return; }
    var pending = list.length;
    list.forEach(function (f) {
      var url = URL.createObjectURL(f);
      var item = { file: f, url: url, name: f.name, kind: f.type.indexOf('video') === 0 ? 'video' : 'photo', duration: 0, ready: false };
      self.staged.push(item);
      function done() { item.ready = true; if (--pending <= 0 && self.tool === 'media') self.renderPanel(); }
      if (item.kind === 'video') {
        var v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = function () { item.duration = v.duration || 0; done(); };
        v.onerror = function () { done(); };
        v.src = url;
      } else {
        var im = new Image();
        im.onload = function () { done(); };
        im.onerror = function () { done(); };
        im.src = url;
      }
    });
    this.setTool('media');
  };
  Editor.commitStaged = function (idx) {
    var self = this, p = this.project;
    var items = idx == null ? this.staged.slice() : [this.staged[idx]];
    var added = 0;
    items.forEach(function (item) {
      var id = Store.uid('clip');
      Store.mediaCache.set(id, item.url);
      if (item.kind === 'video') {
        var dur = item.duration || 5;
        p.clips.push({ id: id, type: 'video', name: item.name, url: item.url, duration: dur, in: 0, out: dur, speed: 1, rotation: 0, flipH: false, flipV: false, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, fit: 'cover', transitionIn: 'none' });
      } else {
        p.clips.push({ id: id, type: 'photo', name: item.name, url: item.url, duration: 3, in: 0, out: 3, speed: 1, rotation: 0, flipH: false, flipV: false, fit: 'cover', transitionIn: 'none', kb: true });
      }
      var si = self.staged.indexOf(item);
      if (si >= 0) self.staged.splice(si, 1);
      added++;
    });
    this.snapshot(); Store.persist();
    this.syncMedia(); this.renderTimeline(); this.drawOnce(); this.updateTransport(); this.renderPanel();
    toast(added + ' clip(s) added.');
  };
  Editor.discardStaged = function (idx) {
    var item = this.staged[idx];
    if (item) { try { URL.revokeObjectURL(item.url); } catch (e) {} this.staged.splice(idx, 1); }
    this.renderPanel();
  };

  /* ---------- DUPLICATE ---------- */
  Editor.duplicateClip = function () {
    var p = this.project, c = this.selClip();
    if (!p || !c) { toast('Select a clip first.'); return; }
    var nc = Object.assign({}, c, { id: Store.uid('clip'), name: (c.name || 'clip') + ' (copy)' });
    if (c.type === 'audio') {
      var buf = this.audioBufs.get(c.id);
      if (buf) this.audioBufs.set(nc.id, buf);
    }
    if (c.url) Store.mediaCache.set(nc.id, c.url);
    p.clips.splice(p.clips.indexOf(c) + 1, 0, nc);
    this.selClipId = nc.id;
    this.snapshot(); Store.persist(); this.syncMedia(); this.renderTimeline(); this.drawOnce(); this.updateTransport();
    toast('Clip duplicated.');
  };

  /* ---------- EXTRACT AUDIO ---------- */
  Editor.ensureClipAudioBuffer = function (clip) {
    var self = this;
    return new Promise(function (resolve) {
      var buf = self.audioBufs.get(clip.id);
      if (buf) return resolve(buf);
      if (!clip.url) return resolve(null);
      var decode = function (ab) {
        var AC = window.AudioContext || window.webkitAudioContext;
        var acx = self._decCtx || (self._decCtx = new AC());
        return acx.decodeAudioData(ab).then(function (b) {
          if (b && b.numberOfChannels && b.duration > 0.05) { self.audioBufs.set(clip.id, b); return b; }
          return null;
        }).catch(function () { return null; });
      };
      fetch(clip.url).then(function (r) { return r.arrayBuffer(); }).then(decode).then(resolve).catch(function () { resolve(null); });
    });
  };
  Editor.ensureAudioBuffers = function () {
    var self = this, jobs = [];
    (this.project ? this.project.clips : []).forEach(function (c) {
      if (c.type === 'audio' && !self.audioBufs.get(c.id) && c.url) jobs.push(self.ensureClipAudioBuffer(c));
    });
    return Promise.all(jobs);
  };
  Editor.extractAudio = function () {
    var self = this, c = this.selClip();
    if (!c) { toast('Select a clip first.'); return; }
    if (c.type !== 'video' || !c.url) { toast('Select a video clip to extract audio from.', true); return; }
    toast('Extracting audio…');
    this.ensureClipAudioBuffer(c).then(function (buf) {
      if (!buf) { toast('No audio track found in this video.', true); return; }
      var id = Store.uid('clip');
      self.audioBufs.set(id, buf);
      var nc = {
        id: id, type: 'audio', name: '🎵 ' + (c.name || 'audio'), url: c.url,
        duration: buf.duration, in: c.in, out: Math.min(c.out, c.in + buf.duration),
        speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, muted: false
      };
      if (nc.out - nc.in < 0.25) { nc.in = 0; nc.out = buf.duration; }
      Store.mediaCache.set(id, c.url);
      var idx = self.project.clips.indexOf(c);
      self.project.clips.splice(idx + 1, 0, nc);
      c.muted = true; // avoid double audio from the original video
      self.snapshot(); Store.persist(); self.syncMedia(); self.renderTimeline(); self.drawOnce(); self.updateTransport();
      toast('Audio extracted — original clip muted.');
    });
  };
  Editor.relinkClip = function (clipId) {
    var self = this;
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/*,image/*';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var url = URL.createObjectURL(f);
      var c = self.findClip(clipId);
      if (!c) return;
      var isVid = f.type.indexOf('video') === 0;
      var apply = function (dur) {
        c.url = url; c.type = isVid ? 'video' : 'photo'; c.name = f.name;
        c.duration = dur;
        if (isVid) { c.out = Math.min(c.out || dur, dur); if (!(c.in >= 0)) c.in = 0; }
        else { c.kb = true; }
        Store.mediaCache.set(clipId, url);
        self.snapshot(); Store.persist(); self.syncMedia(); self.renderTimeline(); self.drawOnce();
        toast('Clip added.');
      };
      if (isVid) {
        var v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = function () { apply(v.duration || c.duration || 5); };
        v.onerror = function () { apply(c.duration || 5); };
        v.src = url;
      } else apply(c.duration || 3);
    };
    inp.click();
  };

  Editor.findClip = function (id) {
    var p = this.project; if (!p) return null;
    for (var i = 0; i < p.clips.length; i++) if (p.clips[i].id === id) return p.clips[i];
    return null;
  };
  Editor.snapshot = function () { Store.snapshot(); };

  /* ================= timeline render ================= */
  Editor.setZoom = function (dir) {
    this.zoomPps = Math.max(8, Math.min(160, Math.round(this.zoomPps * (dir > 0 ? 1.4 : 1 / 1.4))));
    try { localStorage.setItem('viracut_tlzoom', String(this.zoomPps)); } catch (e) {}
    this.renderTimeline(); this.updateTransport();
  };
  Editor.moveClipTo = function (from, to) {
    var p = this.project;
    if (!p || from === to) return;
    to = Math.max(0, Math.min(p.clips.length - 1, to));
    var x = p.clips.splice(from, 1)[0];
    p.clips.splice(to, 0, x);
    this.snapshot(); Store.persist(); this.renderTimeline(); this.drawOnce(); this.updateTransport();
  };

  /* ================= Phase 2 timeline: absolute time-positioned tracks + fixed center playhead ================= */
  Editor.tlPad = function () {
    var sc = document.getElementById('edTlScroll');
    var vw = sc ? sc.clientWidth || 320 : 320;
    return vw / 2;
  };
  /* ============ UNIFIED TIMELINE (Phase 3): 4 lanes, one scroll, one playhead ============ */
  Editor.renderTimeline = function () {
    var self = this;
    var vTrack = document.getElementById('edTrackVideo');
    var aTrack = document.getElementById('edTrackAudio');
    var tTrack = document.getElementById('edTrackText');
    var oTrack = document.getElementById('edTrackOverlay');
    var inner = document.getElementById('edTlInner');
    var markers = document.getElementById('edMarkers');
    var p = this.project;
    vTrack.innerHTML = ''; aTrack.innerHTML = ''; tTrack.innerHTML = ''; oTrack.innerHTML = ''; markers.innerHTML = '';
    this._tlGeom = [];
    var pps = this.zoomPps, pad = this.tlPad();
    this._padL = pad;
    var L = window.EditorLogic;
    var tm = Store.timing(), total = tm.total;
    // time markers (shared ruler)
    var step = L.markerStep(pps), mhtml = '';
    for (var mt = 0; mt <= total + 0.01; mt += step) {
      mhtml += '<span class="ed2-marker" style="left:' + Math.round(pad + mt * pps) + 'px">' + L.fmtTime(mt) + '</span>';
    }
    markers.innerHTML = mhtml;
    var innerW = Math.max(Math.round(pad * 2 + total * pps + 90), 200);
    markers.style.width = innerW + 'px';
    inner.style.width = innerW + 'px';

    /* ---- VIDEO LANE: thumbnail strips, no cards ---- */
    if (!p || !p.clips.length) {
      vTrack.appendChild(this._addTile(pad, function () { self.setTool('media'); }));
    } else {
      p.clips.forEach(function (c, i) {
        var it = tm.items[i]; if (!it) return;
        var playDur = Store.clipPlayDur(c);
        var gx = pad + it.start * pps, gw = Math.max(40, Math.round(playDur * pps));
        self._tlGeom.push({ start: it.start, end: it.end, x: gx, w: gw });
        var blk = document.createElement('div');
        blk.className = 'clip-block' + (self.selClipId === c.id ? ' sel' : '');
        blk.style.left = Math.round(gx) + 'px';
        blk.style.width = Math.round(gw) + 'px';
        blk.setAttribute('data-id', c.id);
        var badgeIc = c.type === 'placeholder' ? '🎭' : c.type === 'video' ? '' : c.type === 'audio' ? '🎵' : '🖼';
        blk.innerHTML = (badgeIc ? '<span class="cbadge">' + badgeIc + '</span>' : '') + self.thumbStripHTML(c, gw) +
          (!c.url ? '<div class="relink">tap to re-link</div>' : '');
        if (self.selClipId === c.id && c.url) {
          var hl = document.createElement('div'); hl.className = 'trim-handle l'; hl.title = 'Trim start';
          var hr = document.createElement('div'); hr.className = 'trim-handle r'; hr.title = 'Trim end';
          hl.addEventListener('pointerdown', function (e) { e.stopPropagation(); self.onTrimHandle(e, c, blk, 'l'); });
          hr.addEventListener('pointerdown', function (e) { e.stopPropagation(); self.onTrimHandle(e, c, blk, 'r'); });
          blk.appendChild(hl); blk.appendChild(hr);
        }
        blk.addEventListener('pointerdown', function (e) { self.onCardDown(e, c, blk, i); });
        vTrack.appendChild(blk);
        if (c.type === 'video' && c.url && !self.thumbStrips.get(c.id)) self.captureThumbStrip(c, gw);
      });
      // "+" tile at end of video track
      var add = document.createElement('div');
      add.className = 'tl-add';
      add.style.left = Math.round(pad + total * pps + 8) + 'px';
      add.textContent = '＋'; add.title = 'Add media';
      add.addEventListener('click', function () { self.setTool('media'); });
      vTrack.appendChild(add);
    }

    /* ---- AUDIO LANE ---- */
    this._renderAudioLane(aTrack, tm, total, pps, pad);
    /* ---- TEXT LANE ---- */
    this._renderTextLane(tTrack, pps, pad);
    /* ---- OVERLAY LANE (single) ---- */
    this._renderOverlayLane(oTrack, pps, pad);

    this.renderClipStrip();
    this.centerPlayhead();
    this.renderEmptyImport();
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  };

  /* small "+" tile for empty lanes */
  Editor._addTile = function (pad, cb) {
    var d = document.createElement('div');
    d.className = 'tl-add';
    d.style.left = Math.round(pad) + 'px';
    d.textContent = '＋';
    d.addEventListener('click', cb);
    return d;
  };

  Editor._renderAudioLane = function (el, tm, total, pps, pad) {
    var self = this, p = this.project, L = window.EditorLogic;
    var hasAny = false;
    function block(x, w, inner, sel, cb) {
      var d = document.createElement('div');
      d.className = 'au-block' + (sel ? ' sel' : '');
      d.style.left = Math.round(x) + 'px'; d.style.width = Math.max(28, Math.round(w)) + 'px';
      d.innerHTML = inner;
      d.addEventListener('click', function (e) { e.stopPropagation(); cb(); });
      el.appendChild(d);
      return d;
    }
    if (p.music) {
      hasAny = true;
      var g = L.laneGeom(0, total, pps);
      block(pad + g.x, g.w, '🎵 ' + esc(p.music.name || 'Music'), false, function () { self.setTool('audio'); });
    }
    tm.items.forEach(function (item) {
      var c = item.clip;
      if (c.type !== 'audio') return;
      hasAny = true;
      var g2 = L.laneGeom(item.start, item.end - item.start, pps);
      var d = block(pad + g2.x, g2.w, '', self.selClipId === c.id, function () {
        self.selClipId = c.id; self.selOvId = null; self.selTxId = null;
        self.setTool(null); self.renderTimeline(); self.drawOnce();
      });
      var buf = self.audioBufs.get(c.id);
      if (buf) {
        try {
          var cv = document.createElement('canvas');
          var peaks = L.wavePeaks(buf.getChannelData(0), 48);
          cv.width = 96; cv.height = 26;
          var ctx2 = cv.getContext('2d');
          ctx2.fillStyle = '#a78bfa';
          for (var i = 0; i < peaks.length; i++) {
            var bh = Math.max(2, peaks[i] * 24);
            ctx2.fillRect(i * 2, 13 - bh / 2, 1.4, bh);
          }
          d.insertBefore(cv, d.firstChild);
        } catch (e) {}
      }
      var sp = document.createElement('span');
      sp.textContent = '🎵';
      d.appendChild(sp);
    });
    if (!hasAny) el.appendChild(this._addTile(pad, function () { self.setTool('audio'); }));
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  };

  Editor._renderTextLane = function (el, pps, pad) {
    var self = this, p = this.project, L = window.EditorLogic;
    if (!p.texts.length) {
      el.appendChild(this._addTile(pad, function () { self.textDialog(); }));
      return;
    }
    p.texts.forEach(function (tx) {
      var g = L.laneGeom(tx.start, Math.max(0.5, tx.end - tx.start), pps);
      var d = document.createElement('div');
      d.className = 'tx-block' + (self.selTxId === tx.id ? ' sel' : '');
      d.style.left = Math.round(pad + g.x) + 'px';
      d.style.width = Math.max(28, Math.round(g.w)) + 'px';
      d.textContent = 'T ' + String(tx.text || '').slice(0, 14);
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        self.selTxId = tx.id; self.selClipId = null; self.selOvId = null;
        self.renderTimeline(); self.textDialog(tx);
      });
      el.appendChild(d);
    });
  };

  Editor._renderOverlayLane = function (el, pps, pad) {
    var self = this, p = this.project, L = window.EditorLogic;
    if (!p.overlays.length) {
      el.appendChild(this._addTile(pad, function () { self.setTool('overlay'); }));
      return;
    }
    p.overlays.forEach(function (ov) {
      var g = L.laneGeom(ov.start, ov.dur, pps);
      var d = document.createElement('div');
      d.className = 'ov-block' + (self.selOvId === ov.id ? ' sel' : '');
      d.style.left = Math.round(pad + g.x) + 'px';
      d.style.width = Math.max(28, Math.round(g.w)) + 'px';
      d.textContent = (ov.type === 'video' ? '🎞' : '🖼');
      d.title = String(ov.name || 'overlay');
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        self.selOvId = ov.id; self.selClipId = null; self.selTxId = null;
        self.renderTimeline(); self.setTool('overlay');
      });
      el.appendChild(d);
    });
  };

  /* subtle "+" in preview when project is empty (not a card) */
  Editor.renderEmptyImport = function () {
    var wrap = document.getElementById('edPreviewWrap');
    var old = document.getElementById('edEmptyImport');
    if (old) old.remove();
    if (this.project && this.project.clips.length) return;
    var d = document.createElement('div');
    d.className = 'ed-empty-import'; d.id = 'edEmptyImport';
    d.innerHTML = '<button id="edEmptyBtn" title="Import media">＋</button>';
    wrap.appendChild(d);
    var self = this;
    d.querySelector('#edEmptyBtn').onclick = function () { self.setTool('media'); };
  };

  /* thumbnail strip: N frames across the clip via offscreen video (session cache) */
  Editor.thumbStripHTML = function (c, w) {
    var n = window.EditorLogic.thumbCount(Store.clipPlayDur(c));
    var arr = this.thumbStrips.get(c.id);
    var h = '<div class="thumbs">';
    if (c.type === 'video' && arr && arr.length) {
      for (var i = 0; i < arr.length; i++) h += '<img src="' + arr[i] + '" alt="">';
    } else if (c.type === 'video') {
      var st = this.stills.get(c.id);
      h += st ? '<img src="' + st + '" style="width:100%" alt="">' : '<div class="cmeta" style="padding:14px 6px">…</div>';
    } else if (c.type === 'audio') {
      h += '<div class="cmeta" style="padding:12px 6px;font-size:20px">🎵</div>';
    } else if (c.url) {
      h += '<img src="' + c.url + '" style="width:100%" alt="">';
    }
    return h + '</div>';
  };
  Editor.captureThumbStrip = function (c, w) {
    var self = this;
    if (this.thumbStrips.get(c.id) === null) return;
    this.thumbStrips.set(c.id, null);
    try {
      var v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      v.src = c.url;
      var n = window.EditorLogic.thumbCount(Store.clipPlayDur(c));
      var out = [], k = 0, done = false;
      var span = Math.max(0.2, (c.out || 1) - (c.in || 0));
      function finish() {
        if (done) return; done = true;
        if (out.length) { self.thumbStrips.set(c.id, out); self.renderTimeline(); }
        else self.thumbStrips.delete(c.id);
      }
      v.addEventListener('loadedmetadata', function () { step(); });
      v.addEventListener('error', function () { self.thumbStrips.delete(c.id); });
      setTimeout(finish, 15000);
      function step() {
        if (done) return;
        if (k >= n) { finish(); return; }
        var tt = (c.in || 0) + span * (n === 1 ? 0.5 : k / (n - 1));
        var onSeek = function () {
          v.removeEventListener('seeked', onSeek);
          try {
            var cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
            cv.getContext('2d').drawImage(v, 0, 0, 96, 54);
            out.push(cv.toDataURL('image/jpeg', 0.55));
          } catch (e) {}
          k++; step();
        };
        v.addEventListener('seeked', onSeek);
        try { v.currentTime = Math.max(0, Math.min(tt, (v.duration || tt + 1) - 0.05)); }
        catch (e) { v.removeEventListener('seeked', onSeek); k++; step(); }
      }
    } catch (e) { this.thumbStrips.delete(c.id); }
  };

  /* trim handles: drag left/right edge to adjust in/out */
  Editor.onTrimHandle = function (e, c, card, which) {
    var self = this, L = window.EditorLogic;
    e.preventDefault();
    var x0 = e.clientX, pps = this.zoomPps;
    var origIn = c.in, origOut = c.out;
    function onMove(ev) {
      var dt = (ev.clientX - x0) / pps;
      var r = L.trimApply({ 'in': origIn, out: origOut, type: c.type, duration: c.duration }, which, dt);
      c.in = r['in']; c.out = r.out;
      var tm = Store.timing(), it = null;
      for (var i = 0; i < tm.items.length; i++) if (tm.items[i].clip.id === c.id) it = tm.items[i];
      if (it) {
        card.style.left = Math.round((self._padL || 0) + it.start * pps) + 'px';
        card.style.width = Math.max(40, Math.round(Store.clipPlayDur(c) * pps)) + 'px';
      }
      self.drawOnce();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      self.snapshot(); Store.persist();
      self.renderTimeline(); self.drawOnce(); self.updateTransport();
      if (self.tool === 'trim') self.renderPanel();
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /* long-press to drag a clip card and reorder; plain tap selects */
  Editor.onCardDown = function (e, c, card, idx) {
    var self = this;
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest && e.target.closest('.trim-handle')) return;
    var x0 = e.clientX, moved = false, dragging = false, timer = null;
    function clear() {
      if (timer) { clearTimeout(timer); timer = null; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    function onMove(ev) {
      var dx = ev.clientX - x0;
      if (!dragging) {
        if (Math.abs(dx) > 12) { moved = true; clear(); return; }
        return;
      }
      ev.preventDefault();
      card.style.transform = 'translateX(' + dx + 'px)';
      card.style.zIndex = '10';
      var geom = self._tlGeom;
      var cx = geom[idx].x + geom[idx].w / 2 + dx;
      var to = idx;
      for (var i = 0; i < geom.length; i++) {
        if (cx < geom[i].x + geom[i].w / 2) { to = i; break; }
        to = i;
      }
      card._dropTo = to;
    }
    function onUp(ev) {
      clear();
      card.style.transform = ''; card.style.zIndex = '';
      if (dragging) {
        var to = card._dropTo != null ? card._dropTo : idx;
        card._dropTo = null;
        if (to !== idx) self.moveClipTo(idx, to);
        return;
      }
      if (moved) return;
      if (!c.url) { self.relinkClip(c.id); return; }
      self.selClipId = c.id; self.selOvId = null; self.selTxId = null;
      self.setTool(null);
      self.renderTimeline(); self.drawOnce();
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    timer = setTimeout(function () {
      timer = null;
      if (moved) return;
      dragging = true;
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (e2) {}
    }, 450);
  };

  /* center the fixed playhead on current time */
  Editor.centerPlayhead = function () {
    var sc = document.getElementById('edTlScroll');
    if (!sc) return;
    var L = window.EditorLogic;
    this._progScroll = true;
    try { sc.scrollLeft = Math.max(0, L.scrollForTime(this.t, sc.clientWidth || 320, this.zoomPps) + (this._padL || 0)); } catch (e) {}
    var self = this;
    setTimeout(function () { self._progScroll = false; }, 80);
  };

  /* bind once: scrub, playhead drag, pinch zoom, manual-scroll seek */
  Editor.bindTimeline = function () {
    if (this._tlBound) return;
    this._tlBound = true;
    var self = this, L = window.EditorLogic;
    var sc = document.getElementById('edTlScroll');
    var inner = document.getElementById('edTlInner');
    var ph = document.getElementById('edPlayhead');
    var scrubbing = false;
    function seekFromClientX(cx) {
      var total = Store.timing().total; if (!total) return;
      var r = sc.getBoundingClientRect();
      var t = ((sc.scrollLeft + (cx - r.left) - (self._padL || 0)) / self.zoomPps);
      self.seek(Math.max(0, Math.min(total, t)));
    }
    inner.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.clip-block')) return;
      scrubbing = true; self._seeking = true; seekFromClientX(e.clientX);
    });
    window.addEventListener('pointermove', function (e) { if (scrubbing) seekFromClientX(e.clientX); });
    window.addEventListener('pointerup', function () { if (scrubbing) { scrubbing = false; self._seeking = false; self.centerPlayhead(); } });
    // drag the playhead itself = move timeline under it
    var phDrag = null;
    ph.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      phDrag = e.clientX;
      if (self.playing) self.pause();
    });
    window.addEventListener('pointermove', function (e) {
      if (phDrag == null) return;
      var dx = e.clientX - phDrag; phDrag = e.clientX;
      self._progScroll = true;
      sc.scrollLeft -= dx;
      var total = Store.timing().total;
      if (total) self.seek(L.timeFromScroll(sc.scrollLeft, sc.clientWidth || 320, self.zoomPps, total, self._padL || 0));
      self._progScroll = false;
    });
    window.addEventListener('pointerup', function () { phDrag = null; });
    // manual scroll (not programmatic) = scrub to center; pause if playing
    var scrollT = null;
    sc.addEventListener('scroll', function () {
      if (self._progScroll) return;
      if (scrollT) clearTimeout(scrollT);
      scrollT = setTimeout(function () {
        if (self.playing) self.pause();
        var total = Store.timing().total; if (!total) return;
        var t = L.timeFromScroll(sc.scrollLeft, sc.clientWidth || 320, self.zoomPps, total, self._padL || 0);
        self.seek(t);
      }, 90);
    }, { passive: true });
    // pinch to zoom
    var pinchD = 0;
    sc.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    sc.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinchD > 0) {
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        var nz = Math.max(8, Math.min(160, self.zoomPps * d / pinchD));
        pinchD = d;
        if (Math.abs(nz - self.zoomPps) > 1) {
          self.zoomPps = Math.round(nz);
          try { localStorage.setItem('viracut_tlzoom', String(self.zoomPps)); } catch (e2) {}
          self.renderTimeline(); self.updateTransport();
        }
      }
    }, { passive: true });
    // sheet close wiring
    document.getElementById('edSheetX').onclick = function () { self.closeSheet(); };
    document.getElementById('edSheetBackdrop').onclick = function () { self.closeSheet(); };
    document.getElementById('edSheetGrip').onclick = function () { self.closeSheet(); };
  };

  Editor.selClip = function () { return this.selClipId ? this.findClip(this.selClipId) : null; };

  /* ================= clip ops ================= */
  Editor.moveClip = function (dir) {
    var p = this.project, c = this.selClip();
    if (!p || !c) { toast('Select a clip first.'); return; }
    var i = p.clips.indexOf(c), j = i + dir;
    if (j < 0 || j >= p.clips.length) return;
    p.clips.splice(i, 1); p.clips.splice(j, 0, c);
    this.snapshot(); Store.persist(); this.renderTimeline(); this.drawOnce();
  };
  Editor.deleteClip = function () {
    var p = this.project, c = this.selClip();
    if (!p || !c) { toast('Select a clip first.'); return; }
    var self = this;
    App.confirm('Delete this clip?', function (ok) {
      if (!ok) return;
      p.clips = p.clips.filter(function (x) { return x.id !== c.id; });
      if (self.selClipId === c.id) self.selClipId = null;
      self.snapshot(); Store.persist(); self.syncMedia(); self.renderTimeline(); self.drawOnce(); self.updateTransport();
      toast('Clip deleted.');
    });
  };
  Editor.splitAtPlayhead = function () {
    var p = this.project;
    var found = Store.clipAt(this.t);
    if (!found) { toast('Nothing to split — playhead is past the end.'); return; }
    var c = found.item.clip, idx = found.index;
    var local = (this.t - found.item.start) * (c.speed || 1); // media seconds into clip
    var m = c.in + local;
    if (m - c.in < 0.25 || c.out - m < 0.25) { toast('Move the playhead a bit inside the clip to split.'); return; }
    var a = Object.assign({}, c, { id: Store.uid('clip'), out: +m.toFixed(2), name: c.name });
    var b = Object.assign({}, c, { id: Store.uid('clip'), in: +m.toFixed(2), transitionIn: 'none' });
    var self = this;
    [a, b].forEach(function (x) { if (c.url) Store.mediaCache.set(x.id, c.url); x.url = c.url; });
    p.clips.splice(idx, 1, a, b);
    this.selClipId = b.id;
    this.snapshot(); Store.persist(); this.syncMedia(); this.renderTimeline(); this.drawOnce();
    toast('Clip split.');
  };
  Editor.trimSel = function (which, delta) {
    var c = this.selClip();
    if (!c) { toast('Select a clip first.'); return; }
    if (which === 'in') c.in = Math.max(0, Math.min(c.in + delta, c.out - 0.25));
    else c.out = Math.min(c.duration, Math.max(c.out + delta, c.in + 0.25));
    c.in = +c.in.toFixed(2); c.out = +c.out.toFixed(2);
    this.snapshot(); Store.persist(); this.renderTimeline(); this.drawOnce(); this.updateTransport(); this.renderPanel();
  };
  Editor.setTrimAtPlayhead = function (which) {
    var p = this.project;
    var found = Store.clipAt(this.t);
    if (!found) return;
    var c = found.item.clip;
    var m = c.in + (this.t - found.item.start) * (c.speed || 1);
    this.selClipId = c.id;
    if (which === 'in') c.in = Math.max(0, Math.min(m, c.out - 0.25));
    else c.out = Math.min(c.duration, Math.max(m, c.in + 0.25));
    c.in = +c.in.toFixed(2); c.out = +c.out.toFixed(2);
    this.snapshot(); Store.persist(); this.renderTimeline(); this.drawOnce(); this.updateTransport(); this.renderPanel();
    toast((which === 'in' ? 'In-point' : 'Out-point') + ' set at playhead.');
  };

  Editor.updateUndoRedo = function () {
    document.getElementById('edUndo').disabled = !Store.canUndo();
    document.getElementById('edRedo').disabled = !Store.canRedo();
  };
  Editor.doUndo = function () {
    if (Store.undo()) {
      this.project = Store.current;
      this.selClipId = null; this.sizeCanvas(); this.syncMedia();
      this.renderTimeline(); this.renderStickers(); this.drawOnce(); this.updateTransport(); this.renderPanel();
      document.getElementById('edName').textContent = this.project.name;
    }
    this.updateUndoRedo();
  };
  Editor.doRedo = function () {
    if (Store.redo()) {
      this.project = Store.current;
      this.selClipId = null; this.sizeCanvas(); this.syncMedia();
      this.renderTimeline(); this.renderStickers(); this.drawOnce(); this.updateTransport(); this.renderPanel();
      document.getElementById('edName').textContent = this.project.name;
    }
    this.updateUndoRedo();
  };
})();
/* ViraCut AI — editor.js (3/3): tool buttons + panels */
(function () {
  'use strict';
  var Editor = window.Editor;

  var TOOLS = [
    { id: 'edit', label: '✂️ Edit' }, { id: 'audio', label: '🎵 Audio' },
    { id: 'text', label: '🔤 Text' }, { id: 'fx', label: '✨ Effects' },
    { id: 'overlay', label: '🖼️ Overlay' }, { id: 'captions', label: '💬 Captions' },
    { id: 'filter', label: '🎨 Filters' }, { id: 'adjust', label: '🎚️ Adjust' },
    { id: 'transition', label: '⋈ Transitions' }, { id: 'sticker', label: '😀 Stickers' },
    { id: 'ai', label: '🤖 AI' }
  ];

  Editor.renderTools = function () {
    var self = this, el = document.getElementById('edTools');
    el.innerHTML = '';
    TOOLS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tb-btn' + (self.tool === t.id ? ' on' : '');
      var parts = t.label.split(' ');
      b.innerHTML = '<span class="ic">' + parts[0] + '</span><span>' + parts.slice(1).join(' ') + '</span>';
      b.onclick = function () { self.onToolTap(t.id); };
      el.appendChild(b);
    });
  };
  Editor.onToolTap = function (id) {
    if (id === 'edit') {
      var c = this.selClip();
      if (!c) {
        // select clip under playhead if any
        var found = Store.clipAt(this.t);
        if (found && found.item.clip.url) {
          this.selClipId = found.item.clip.id;
          this.renderTimeline(); this.drawOnce();
          toast('Clip selected — edit actions above.');
        } else toast('Select a clip in the timeline first.', true);
        return;
      }
      this.setTool(null); // strip is already visible
      var strip = document.getElementById('edClipStrip');
      if (strip) strip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    this.setTool(this.tool === id ? null : id);
  };
  Editor.setTool = function (id) {
    this.tool = id; this.placingSticker = null;
    document.getElementById('edStickerLayer').style.pointerEvents = 'none';
    this.renderTools(); this.renderPanel(); this.renderClipStrip();
  };

  Editor.renderPanel = function () {
    var el = document.getElementById('edPanel');
    var sheet = document.getElementById('edSheet');
    var backdrop = document.getElementById('edSheetBackdrop');
    var fn = this['panel_' + this.tool];
    el.innerHTML = '';
    if (!fn) { this.closeSheet(); return; }
    fn.call(this, el);
    sheet.style.display = 'flex';
    backdrop.style.display = 'block';
    this.updateUndoRedo();
  };

  Editor.closeSheet = function () {
    document.getElementById('edSheet').style.display = 'none';
    document.getElementById('edSheetBackdrop').style.display = 'none';
    if (this.tool) { this.tool = null; this.renderTools(); }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }

  /* ---------- MEDIA ---------- */
  Editor.panel_media = function (el) {
    var self = this;
    el.appendChild(h(
      '<h4>📥 Import media</h4>' +
      '<div class="row"><button class="btn primary sm" id="mPick">＋ Videos / Photos</button></div>' +
      '<p class="muted" style="margin-top:8px">MP4 / WebM / JPG / PNG work best. Files stay on this device. Preview first, then add.</p>' +
      (this.project.clips.length ?
        '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="mLeft">◀ Move clip</button>' +
        '<button class="btn ghost sm" id="mRight">Move clip ▶</button>' +
        '<button class="btn ghost sm" id="mDup">⧉ Duplicate clip</button>' +
        '<button class="btn danger sm" id="mDel">Delete clip</button></div>' : '')
    ));
    el.querySelector('#mPick').onclick = function () { document.getElementById('edFileInput').click(); };
    var l = el.querySelector('#mLeft'), r = el.querySelector('#mRight'), d = el.querySelector('#mDel'), dp = el.querySelector('#mDup');
    if (l) l.onclick = function () { self.moveClip(-1); };
    if (r) r.onclick = function () { self.moveClip(1); };
    if (d) d.onclick = function () { self.deleteClip(); };
    if (dp) dp.onclick = function () { self.duplicateClip(); };
    // staging: preview before adding
    if (this.staged.length) {
      var box = h('<h4 style="margin-top:12px">👀 Preview — add what you want</h4><div class="pv-grid" id="pvGrid"></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="pvAll">＋ Add all</button></div>');
      el.appendChild(box);
      var grid = box.querySelector('#pvGrid');
      this.staged.forEach(function (item, i) {
        var d2 = document.createElement('div');
        d2.className = 'pv-item';
        var media = item.kind === 'video'
          ? '<div class="pv-thumb"><video src="' + item.url + '" muted preload="metadata" playsinline></video></div>'
          : '<div class="pv-thumb"><img src="' + item.url + '"></div>';
        d2.innerHTML = media +
          '<div class="pv-name">' + esc(item.name) + (item.kind === 'video' && item.duration ? ' · ' + item.duration.toFixed(1) + 's' : '') + (item.ready ? '' : ' · …') + '</div>' +
          '<div class="pv-btns"><button class="btn primary" data-a="add">Add</button><button class="btn ghost" data-a="rm">✕</button></div>';
        d2.querySelector('[data-a="add"]').onclick = function () { self.commitStaged(i); };
        d2.querySelector('[data-a="rm"]').onclick = function () { self.discardStaged(i); };
        grid.appendChild(d2);
      });
      box.querySelector('#pvAll').onclick = function () { self.commitStaged(null); };
    }
  };

  /* ---------- TRIM ---------- */
  Editor.panel_trim = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip in the timeline first.</p>'; return; }
    el.appendChild(h(
      '<h4>✂️ Trim — ' + esc(c.name) + '</h4>' +
      '<div class="kv"><span>In-point <b>' + c.in.toFixed(2) + 's</b></span>' +
      '<span><button class="icon-btn" data-t="in" data-d="-0.5">−</button> <button class="icon-btn" data-t="in" data-d="0.5">＋</button></span></div>' +
      '<div class="kv"><span>Out-point <b>' + c.out.toFixed(2) + 's</b></span>' +
      '<span><button class="icon-btn" data-t="out" data-d="-0.5">−</button> <button class="icon-btn" data-t="out" data-d="0.5">＋</button></span></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="tInPh">Set In = ▶ playhead</button>' +
      '<button class="btn ghost sm" id="tOutPh">Set Out = ▶ playhead</button></div>' +
      '<p class="muted" style="margin-top:8px">Steps are 0.5s. Playhead: ' + this.t.toFixed(2) + 's</p>'
    ));
    el.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () { self.trimSel(b.getAttribute('data-t'), parseFloat(b.getAttribute('data-d'))); };
    });
    el.querySelector('#tInPh').onclick = function () { self.setTrimAtPlayhead('in'); };
    el.querySelector('#tOutPh').onclick = function () { self.setTrimAtPlayhead('out'); };
  };

  /* ---------- SPEED ---------- */
  Editor.panel_speed = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    var d = h('<h4>⏩ Speed — ' + esc(c.name) + '</h4><div class="pills" id="spPills"></div>' +
      '<div class="row" style="margin-top:10px;align-items:flex-end"><div style="flex:1"><label class="lbl">Custom speed (0.1–8x)</label>' +
      '<input type="number" id="spCustom" min="0.1" max="8" step="0.05" value="' + c.speed + '" style="min-height:44px"></div>' +
      '<button class="btn primary sm" id="spApply" style="min-height:44px">Apply</button></div>' +
      '<p class="muted" style="margin-top:8px">Speed changes clip length on the timeline.</p>');
    el.appendChild(d);
    function setSpeed(s) {
      c.speed = s; self.snapshot(); Store.persist();
      self.renderTimeline(); self.drawOnce(); self.updateTransport(); self.renderPanel();
    }
    [0.25, 0.5, 1, 1.5, 2, 4].forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'pill' + (c.speed === s ? ' on' : ''); b.textContent = s + 'x';
      b.onclick = function () { setSpeed(s); };
      d.querySelector('#spPills').appendChild(b);
    });
    d.querySelector('#spApply').onclick = function () {
      var v = window.EditorLogic ? EditorLogic.clampSpeed(d.querySelector('#spCustom').value) : null;
      if (v == null) { toast('Enter a speed between 0.1 and 8.', true); return; }
      setSpeed(v);
    };
  };

  /* ---------- ROTATE / FLIP / FIT ---------- */
  Editor.panel_rotate = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    el.appendChild(h(
      '<h4>🔄 Rotate & Flip — ' + esc(c.name) + '</h4>' +
      '<div class="row"><button class="btn ghost sm" id="rL">⟲ 90°</button>' +
      '<button class="btn ghost sm" id="rR">⟳ 90°</button>' +
      '<button class="btn ghost sm" id="rFit">' + (c.fit === 'cover' ? 'Fit: Cover' : 'Fit: Contain') + '</button></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="rFH">' + (c.flipH ? '✓ ' : '') + '⇋ Flip H</button>' +
      '<button class="btn ghost sm" id="rFV">' + (c.flipV ? '✓ ' : '') + '⇅ Flip V</button></div>' +
      '<p class="muted" style="margin-top:8px">Rotation: ' + (c.rotation || 0) + '°</p>'
    ));
    function rot(dgr) { c.rotation = (((c.rotation || 0) + dgr) % 360 + 360) % 360; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); }
    function flip(k) { c[k] = !c[k]; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); }
    el.querySelector('#rL').onclick = function () { rot(-90); };
    el.querySelector('#rR').onclick = function () { rot(90); };
    el.querySelector('#rFH').onclick = function () { flip('flipH'); };
    el.querySelector('#rFV').onclick = function () { flip('flipV'); };
    el.querySelector('#rFit').onclick = function () {
      c.fit = c.fit === 'cover' ? 'contain' : 'cover'; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel();
    };
  };

  /* ---------- FILTER ---------- */
  Editor.panel_filter = function (el) {
    var self = this, p = this.project;
    var names = { none: 'None', warm: '☀ Warm', cool: '❄ Cool', mono: 'Mono', vivid: '✨ Vivid', vintage: '📼 Vintage' };
    var d = h('<h4>🎨 Filter (whole project)</h4><div class="pills" id="fPills"></div>');
    el.appendChild(d);
    Object.keys(names).forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'pill' + (p.filter === k ? ' on' : ''); b.textContent = names[k];
      b.onclick = function () { p.filter = k; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); };
      d.querySelector('#fPills').appendChild(b);
    });
  };

  /* ---------- TRANSITION ---------- */
  Editor.panel_transition = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    var idx = this.project.clips.indexOf(c);
    if (idx === 0) { el.innerHTML = '<p class="hint">The first clip has no incoming transition — select a later clip.</p>'; return; }
    el.appendChild(h(
      '<h4>⋈ Transition into — ' + esc(c.name) + '</h4>' +
      '<div class="pills"><button class="pill' + (c.transitionIn !== 'crossfade' ? ' on' : '') + '" id="trNone">None (cut)</button>' +
      '<button class="pill' + (c.transitionIn === 'crossfade' ? ' on' : '') + '" id="trX">Crossfade 0.5s</button></div>' +
      '<p class="muted" style="margin-top:8px">Blends the end of the previous clip into this one in preview & export.</p>'
    ));
    function set(v) { c.transitionIn = v; self.snapshot(); Store.persist(); self.renderTimeline(); self.drawOnce(); self.renderPanel(); }
    el.querySelector('#trNone').onclick = function () { set('none'); };
    el.querySelector('#trX').onclick = function () { set('crossfade'); };
  };

  /* ---------- FX (Smart Effects) ---------- */
  Editor.panel_fx = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip in the timeline first.</p>'; return; }
    el.appendChild(h('<h4>✨ Smart FX — ' + esc(c.name) + '</h4>'));
    var grid = document.createElement('div');
    grid.className = 'fx-grid';
    FX.list().forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'fx-btn' + ((c.fx || 'none') === f.id ? ' on' : '') + (f.pro ? ' pro' : '');
      b.innerHTML = '<span class="fx-ic">' + f.icon + '</span><span>' + f.name + '</span>' +
        (f.pro ? '<span class="fx-lock">🔒</span>' : '');
      b.onclick = function () {
        if (f.pro) { toast(window.t ? t('fx.pro_locked') : '🔒 Pro effect — coming soon in ViraCut Pro'); return; }
        c.fx = f.id === 'none' ? undefined : f.id;
        self.snapshot(); Store.persist(); self.drawOnce(); self.renderTimeline(); self.renderPanel();
      };
      grid.appendChild(b);
    });
    el.appendChild(grid);
    el.insertAdjacentHTML('beforeend', '<p class="muted" style="margin-top:8px">Original ViraCut effects — baked into export.</p>');
  };

  /* ---------- TEXT ---------- */
  Editor.panel_text = function (el) {
    var self = this, p = this.project;
    var total = Store.timing().total;
    var d = h('<h4>🔤 Text overlays</h4><div id="txList"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="txAdd">＋ Add text</button></div>');
    el.appendChild(d);
    var list = d.querySelector('#txList');
    if (!p.texts.length) list.innerHTML = '<p class="muted">No text yet.</p>';
    p.texts.forEach(function (tx) {
      var row = document.createElement('div');
      row.className = 'kv';
      row.innerHTML = '<span>' + esc(tx.text).slice(0, 28) + ' <span class="muted">(' + tx.start.toFixed(1) + '–' + tx.end.toFixed(1) + 's)</span></span>';
      var del = document.createElement('button'); del.className = 'icon-btn'; del.textContent = '🗑'; del.title = 'Delete';
      del.onclick = function () { p.texts = p.texts.filter(function (x) { return x.id !== tx.id; }); self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); };
      var edt = document.createElement('button'); edt.className = 'icon-btn'; edt.textContent = '✎'; edt.title = 'Edit';
      edt.onclick = function () { self.textDialog(tx); };
      var sp = document.createElement('span'); sp.appendChild(edt); sp.appendChild(del);
      row.appendChild(sp); list.appendChild(row);
    });
    d.querySelector('#txAdd').onclick = function () { self.textDialog(null); };
  };
  Editor.textDialog = function (tx) {
    var self = this, p = this.project;
    var isNew = !tx;
    var total = Store.timing().total || 10;
    var cur = tx || { text: '', position: 'mid', color: '#ffffff', size: 6, start: 0, end: total };
    App.modal(
      '<h3>' + (isNew ? '＋ Add text' : '✎ Edit text') + '</h3>' +
      '<label class="lbl">Text</label><input type="text" id="txT" value="' + esc(cur.text) + '" placeholder="Your text…">' +
      '<label class="lbl">Position</label><div class="pills" id="txPos"></div>' +
      '<div class="row" style="margin-top:10px"><div style="flex:1"><label class="lbl">Color</label><input type="color" id="txC" value="' + esc(cur.color) + '" style="height:42px;padding:4px"></div>' +
      '<div style="flex:2"><label class="lbl">Size: <span id="txSv">' + cur.size + '</span></label><input type="range" id="txS" min="3" max="12" value="' + cur.size + '"></div></div>' +
      '<div class="row"><div style="flex:1"><label class="lbl">Start (s)</label><input type="text" id="txSt" value="' + cur.start + '"></div>' +
      '<div style="flex:1"><label class="lbl">End (s)</label><input type="text" id="txEn" value="' + cur.end + '"></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="txOk" style="flex:1">Save</button>' +
      '<button class="btn ghost" id="txNo">Cancel</button></div>',
      function (root) {
        ['top', 'mid', 'bottom'].forEach(function (pos) {
          var b = document.createElement('button');
          b.className = 'pill' + (cur.position === pos ? ' on' : ''); b.textContent = pos;
          b.onclick = function () { cur.position = pos; root.querySelectorAll('#txPos .pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); };
          root.querySelector('#txPos').appendChild(b);
        });
        root.querySelector('#txS').oninput = function (e) { root.querySelector('#txSv').textContent = e.target.value; };
        root.querySelector('#txNo').onclick = App.closeModal;
        root.querySelector('#txOk').onclick = function () {
          var t = root.querySelector('#txT').value.trim();
          if (!t) { toast('Enter some text.', true); return; }
          var obj = {
            text: t, position: cur.position, color: root.querySelector('#txC').value,
            size: +root.querySelector('#txS').value,
            start: Math.max(0, parseFloat(root.querySelector('#txSt').value) || 0),
            end: Math.max(0.5, parseFloat(root.querySelector('#txEn').value) || total)
          };
          if (obj.end <= obj.start) obj.end = obj.start + 2;
          if (isNew) { obj.id = Store.uid('tx'); p.texts.push(obj); }
          else Object.assign(tx, obj);
          self.snapshot(); Store.persist(); App.closeModal(); self.drawOnce(); self.renderPanel();
          toast('Text saved.');
        };
      }
    );
  };

  /* ---------- STICKERS ---------- */
  var EMOJIS = ['😀', '😂', '😍', '🔥', '⭐', '✨', '💯', '🎉', '👏', '❤️', '👍', '🤯', '😱', '🥳', '💡', '🎬', '🎵', '👑', '💎', '🚀', '🌟', '💥', '😎', '🤖'];
  Editor.panel_sticker = function (el) {
    var self = this;
    var d = h('<h4>😀 Stickers — tap one, then tap the preview to place. Drag to move.</h4><div class="pills" id="stGrid" style="gap:6px"></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="stBigger">A＋ bigger</button>' +
      '<button class="btn ghost sm" id="stSmaller">A− smaller</button>' +
      '<button class="btn danger sm" id="stDel">Delete selected</button></div>');
    el.appendChild(d);
    var grid = d.querySelector('#stGrid');
    EMOJIS.forEach(function (e) {
      var b = document.createElement('button');
      b.className = 'pill'; b.style.fontSize = '20px'; b.textContent = e;
      b.onclick = function () {
        self.placingSticker = e;
        document.getElementById('edStickerLayer').style.pointerEvents = 'auto';
        toast('Tap the preview to place ' + e);
      };
      grid.appendChild(b);
    });
    d.querySelector('#stBigger').onclick = function () { self.stickerSize(1.2); };
    d.querySelector('#stSmaller').onclick = function () { self.stickerSize(0.85); };
    d.querySelector('#stDel').onclick = function () {
      if (!self.selStickerId) { toast('Tap a sticker to select it first.'); return; }
      self.project.stickers = self.project.stickers.filter(function (s) { return s.id !== self.selStickerId; });
      self.selStickerId = null; self.snapshot(); Store.persist(); self.renderStickers();
    };
  };
  Editor.stickerSize = function (f) {
    if (!this.selStickerId) { toast('Tap a sticker to select it first.'); return; }
    var s = this.project.stickers.filter(function (x) { return x.id === this.selStickerId; }, this)[0];
    if (!s) return;
    s.size = Math.max(0.03, Math.min(0.4, s.size * f));
    this.snapshot(); Store.persist(); this.renderStickers();
  };
  Editor.renderStickers = function () {
    var self = this, layer = document.getElementById('edStickerLayer');
    layer.innerHTML = '';
    layer.style.pointerEvents = this.placingSticker ? 'auto' : 'none';
    this.project.stickers.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'stk'; d.textContent = s.emoji;
      d.style.left = (s.x * 100) + '%'; d.style.top = (s.y * 100) + '%';
      d.style.fontSize = (s.size * layer.clientWidth || 40) + 'px';
      if (s.id === self.selStickerId) d.style.outline = '2px solid #8B5CF6';
      d.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        self.selStickerId = s.id;
        var move = function (ev) {
          var r = layer.getBoundingClientRect();
          s.x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
          s.y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
          d.style.left = (s.x * 100) + '%'; d.style.top = (s.y * 100) + '%';
        };
        var up = function () {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          self.snapshot(); Store.persist(); self.renderStickers();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
      layer.appendChild(d);
    });
    // placement clicks
    layer.onclick = function (e) {
      if (!self.placingSticker) return;
      if (e.target !== layer) return;
      var r = layer.getBoundingClientRect();
      var st = { id: Store.uid('st'), emoji: self.placingSticker, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, size: 0.12 };
      self.project.stickers.push(st);
      self.placingSticker = null;
      self.snapshot(); Store.persist(); self.renderStickers();
      toast('Sticker placed — drag to move.');
    };
  };

  /* ---------- CAPTIONS ---------- */
  Editor.panel_captions = function (el) {
    var self = this, p = this.project;
    var d = h('<h4>💬 Captions</h4><div id="cpList"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="cpAdd">＋ Add</button>' +
      '<button class="btn ghost sm" id="cpAuto">✨ Auto from script</button>' +
      '<button class="btn danger sm" id="cpClear">Clear</button></div>');
    el.appendChild(d);
    var list = d.querySelector('#cpList');
    if (!p.captions.length) list.innerHTML = '<p class="muted">No captions yet.</p>';
    p.captions.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'kv';
      row.innerHTML = '<span>' + esc(c.text).slice(0, 34) + ' <span class="muted">(' + c.start.toFixed(1) + '–' + c.end.toFixed(1) + 's)</span></span>';
      var del = document.createElement('button'); del.className = 'icon-btn'; del.textContent = '🗑';
      del.onclick = function () { Captions.remove(c.id); self.drawOnce(); self.renderPanel(); };
      row.appendChild(del); list.appendChild(row);
    });
    d.querySelector('#cpAdd').onclick = function () {
      App.modal('<h3>＋ Caption</h3>' +
        '<label class="lbl">Text</label><input type="text" id="cpT" placeholder="Caption text…">' +
        '<div class="row"><div style="flex:1"><label class="lbl">Start (s)</label><input type="text" id="cpS" value="' + self.t.toFixed(1) + '"></div>' +
        '<div style="flex:1"><label class="lbl">End (s)</label><input type="text" id="cpE" value="' + (self.t + 2).toFixed(1) + '"></div></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="cpOk" style="flex:1">Add</button><button class="btn ghost" id="cpNo">Cancel</button></div>',
        function (root) {
          root.querySelector('#cpNo').onclick = App.closeModal;
          root.querySelector('#cpOk').onclick = function () {
            var t = root.querySelector('#cpT').value.trim();
            if (!t) { toast('Enter caption text.', true); return; }
            Captions.add(t, root.querySelector('#cpS').value, root.querySelector('#cpE').value);
            App.closeModal(); self.drawOnce(); self.renderPanel(); toast('Caption added.');
          };
        });
    };
    d.querySelector('#cpAuto').onclick = function () {
      var n = Captions.autoFromScript();
      if (n) { self.drawOnce(); self.renderPanel(); toast(n + ' captions created from script.'); }
    };
    d.querySelector('#cpClear').onclick = function () {
      App.confirm('Clear all captions?', function (ok) { if (ok) { Captions.clear(); self.drawOnce(); self.renderPanel(); } });
    };
  };

  /* ---------- AUDIO ---------- */
  Editor.panel_audio = function (el) {
    this.renderAudioPanel(el);
  };
  Editor.renderAudioPanel = function (el) {
    var self = this, p = this.project;
    el = el || document.getElementById('edPanel');
    if (this.tool !== 'audio') return;
    el.innerHTML = '';
    // ---- per-clip audio (volume / fade / mute / extract) ----
    var c = this.selClip();
    var ca = h('<h4>🎚 Clip audio</h4><div id="caBox"></div>');
    el.appendChild(ca);
    var cab = ca.querySelector('#caBox');
    if (!c) cab.innerHTML = '<p class="muted">Select a clip in the timeline to adjust its audio.</p>';
    else if (c.type === 'photo') cab.innerHTML = '<p class="muted">Photos have no audio — select a video or audio clip.</p>';
    else {
      cab.innerHTML =
        '<div class="kv"><span>' + esc(c.name) + '</span>' +
        '<button class="btn ghost sm" id="caMute">' + (c.muted ? '🔈 Unmute' : '🔇 Mute') + '</button></div>' +
        '<label class="lbl">Volume: <span id="caVv">' + Math.round((c.volume == null ? 1 : c.volume) * 100) + '</span>%</label>' +
        '<input type="range" id="caV" min="0" max="100" value="' + Math.round((c.volume == null ? 1 : c.volume) * 100) + '">' +
        '<div class="row"><div style="flex:1"><label class="lbl">Fade in (s)</label>' +
        '<input type="number" id="caFi" min="0" max="5" step="0.5" value="' + (c.fadeIn || 0) + '" style="min-height:44px"></div>' +
        '<div style="flex:1"><label class="lbl">Fade out (s)</label>' +
        '<input type="number" id="caFo" min="0" max="5" step="0.5" value="' + (c.fadeOut || 0) + '" style="min-height:44px"></div></div>' +
        (c.type === 'video' ? '<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="caExt">🎵 Extract audio</button></div>' : '') +
        '<p class="muted" style="margin-top:6px">Volume & fades apply in preview and are baked into export.</p>';
      cab.querySelector('#caV').oninput = function (e) {
        c.volume = e.target.value / 100;
        cab.querySelector('#caVv').textContent = e.target.value;
        Store.persist();
      };
      cab.querySelector('#caV').onchange = function () { self.snapshot(); };
      function fadeWire(id, key) {
        cab.querySelector(id).onchange = function (e) {
          var v = Math.max(0, Math.min(5, parseFloat(e.target.value) || 0));
          e.target.value = v; c[key] = v; self.snapshot(); Store.persist();
        };
      }
      fadeWire('#caFi', 'fadeIn'); fadeWire('#caFo', 'fadeOut');
      cab.querySelector('#caMute').onclick = function () {
        c.muted = !c.muted; self.snapshot(); Store.persist(); self.renderAudioPanel();
      };
      var ex = cab.querySelector('#caExt');
      if (ex) ex.onclick = function () { self.extractAudio(); };
    }
    var d = h('<h4>🎵 Music</h4><div id="muBox"></div>' +
      '<div class="row" style="margin:8px 0"><button class="btn ghost sm" id="muPick">＋ Import music</button></div>' +
      '<h4 style="margin-top:14px">🎙️ Voiceover takes</h4><div id="voBox"></div>' +
      '<div class="row" style="margin:8px 0"><button class="btn primary sm" id="voRec">⏺ Record</button></div>' +
      '<p class="muted">Music & takes mix automatically in preview and export.</p>');
    el.appendChild(d);
    // music
    var mb = d.querySelector('#muBox');
    if (p.music) {
      mb.innerHTML = '<div class="kv"><span>🎵 ' + esc(p.music.name) + '</span><button class="icon-btn" id="muX">🗑</button></div>' +
        '<label class="lbl">Music volume</label><input type="range" id="muV" min="0" max="100" value="' + Math.round(p.music.volume * 100) + '">';
      mb.querySelector('#muX').onclick = function () { AudioLab.Music.clear(p); self.renderAudioPanel(); };
      mb.querySelector('#muV').oninput = function (e) { p.music.volume = e.target.value / 100; Store.persist(); };
    } else mb.innerHTML = '<p class="muted">No music yet.</p>';
    d.querySelector('#muPick').onclick = function () { document.getElementById('edMusicInput').click(); };
    // voice takes
    var vb = d.querySelector('#voBox');
    if (!p.voiceovers.length) vb.innerHTML = '<p class="muted">No takes yet — record with the mic.</p>';
    p.voiceovers.forEach(function (v) {
      var row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = '<div class="kv"><span>🎙 ' + esc(v.name) + '</span><button class="icon-btn">🗑</button></div>' +
        (v.url ? '<audio controls src="' + v.url + '"></audio>' : '<p class="muted">encoding…</p>') +
        '<label class="lbl">Volume</label><input type="range" min="0" max="100" value="' + Math.round(v.volume * 100 + '') + '">';
      var btns = row.querySelectorAll('button');
      row.querySelector('input').oninput = function (e) { v.volume = e.target.value / 100; Store.persist(); };
      btns[0].onclick = function () { AudioLab.Voice.remove(p, v.id); self.renderAudioPanel(); };
      vb.appendChild(row);
    });
    var recB = d.querySelector('#voRec');
    if (AudioLab.Voice.recording()) {
      recB.textContent = '⏹ Stop (' + Math.round((Date.now() - AudioLab.Voice.recStart) / 1000) + 's)';
      recB.onclick = function () {
        AudioLab.Voice.stop(p).then(function (take) {
          self.renderAudioPanel();
          if (take) toast('Take saved.');
        });
      };
    } else {
      recB.onclick = function () {
        AudioLab.Voice.start().then(function (ok) {
          if (ok) { toast('Recording… tap Stop when done.'); self.renderAudioPanel(); }
        });
      };
    }
  };
})();

/* ViraCut AI — editor.js (4/4): Phase 2 lanes, clip strip, adjust/AI/overlay panels, cover, freeze */
(function () {
  'use strict';
  var Editor = window.Editor;
  var L = window.EditorLogic;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  Editor.addOverlayLane = function () { this.setTool('overlay'); };

  Editor.addOverlay = function (lane) {
    var self = this;
    this._ovLanePick = lane == null ? 0 : lane;
    document.getElementById('edOverlayInput').click();
  };
  Editor.commitOverlayFile = function (file) {
    var self = this, p = this.project;
    var isVid = /^video\//.test(file.type || '');
    var url = URL.createObjectURL(file);
    var id = Store.uid('ov');
    Store.mediaCache.set(id, url);
    var ov = {
      id: id, type: isVid ? 'video' : 'photo', name: file.name, url: url,
      start: +this.t.toFixed(2), dur: 3, x: 0.5, y: 0.5, scale: 0.4,
      rotation: 0, opacity: 1, lane: this._ovLanePick || 0
    };
    function done(dur) {
      if (isVid && dur) ov.dur = Math.min(8, Math.max(1, dur));
      p.overlays.push(ov);
      self.selOvId = id; self.selClipId = null; self.selTxId = null;
      self.snapshot(); Store.persist(); self.syncMedia();
      self.renderTimeline(); self.drawOnce(); self.setTool('overlay');
      toast('Overlay added.');
    }
    if (isVid) {
      var v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.src = url;
      v.addEventListener('loadedmetadata', function () { done(v.duration || 5); });
      v.addEventListener('error', function () { done(5); });
      setTimeout(function () { if (!p.overlays.some(function (o) { return o.id === id; })) done(5); }, 8000);
    } else done(3);
  };

  Editor.selOverlay = function () {
    var p = this.project; if (!p || !this.selOvId) return null;
    for (var i = 0; i < p.overlays.length; i++) if (p.overlays[i].id === this.selOvId) return p.overlays[i];
    return null;
  };
  Editor.deleteOverlay = function () {
    var p = this.project, ov = this.selOverlay();
    if (!ov) return;
    var self = this;
    App.confirm('Delete this overlay?', function (ok) {
      if (!ok) return;
      p.overlays = p.overlays.filter(function (o) { return o.id !== ov.id; });
      self.selOvId = null;
      self.snapshot(); Store.persist(); self.syncMedia();
      self.renderTimeline(); self.drawOnce(); self.renderPanel();
      toast('Overlay deleted.');
    });
  };

  /* ================= CLIP STRIP ================= */
  var STRIP = [
    { id: 'mute', ic: '🔇', label: 'Mute' },
    { id: 'split', ic: '🔪', label: 'Split' },
    { id: 'trim', ic: '✂️', label: 'Trim' },
    { id: 'speed', ic: '⏩', label: 'Speed' },
    { id: 'volume', ic: '🔊', label: 'Volume' },
    { id: 'delete', ic: '🗑️', label: 'Delete' },
    { id: 'duplicate', ic: '⧉', label: 'Duplicate' },
    { id: 'crop', ic: '◫', label: 'Crop', soon: true },
    { id: 'rotate', ic: '🔄', label: 'Rotate' },
    { id: 'flip', ic: '⇄', label: 'Flip' },
    { id: 'reverse', ic: '◀◀', label: 'Reverse', soon: true },
    { id: 'freeze', ic: '❄️', label: 'Freeze' },
    { id: 'adjust', ic: '🎚️', label: 'Adjust' },
    { id: 'filter', ic: '🎨', label: 'Filter' },
    { id: 'cover', ic: '🖼️', label: 'Cover' }
  ];
  Editor.renderClipStrip = function () {
    var el = document.getElementById('edClipStrip');
    var c = this.selClip();
    // tool panel takes priority over the strip
    if (!c || this.tool) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var self = this;
    el.style.display = 'flex'; el.innerHTML = '';
    STRIP.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'cs-btn' + (s.soon ? ' soon' : '');
      var label = s.label, ic = s.ic;
      if (s.id === 'mute') { label = c.muted ? 'Unmute' : 'Mute'; ic = c.muted ? '🔈' : '🔇'; }
      b.innerHTML = '<span class="ic">' + ic + '</span><span>' + label + '</span>';
      b.onclick = function () { self.clipStripAction(s.id); };
      el.appendChild(b);
    });
  };
  Editor.clipStripAction = function (id) {
    var self = this, c = this.selClip();
    if (!c) { toast('Select a clip first.', true); return; }
    switch (id) {
      case 'mute':
        c.muted = !c.muted;
        this.snapshot(); Store.persist(); this.drawOnce(); this.renderTimeline();
        toast(c.muted ? 'Clip muted.' : 'Clip unmuted.');
        break;
      case 'split': this.splitAtPlayhead(); break;
      case 'trim': this.setTool('trim'); break;
      case 'speed': this.setTool('speed'); break;
      case 'volume': this.setTool('audio'); break;
      case 'delete': this.deleteClip(); break;
      case 'duplicate': this.duplicateClip(); break;
      case 'crop': toast('Crop is coming soon.', true); break;
      case 'rotate': this.setTool('rotate'); break;
      case 'flip':
        c.flipH = !c.flipH;
        this.snapshot(); Store.persist(); this.drawOnce(); this.renderTimeline();
        toast(c.flipH ? 'Flipped horizontally.' : 'Flip off.');
        break;
      case 'reverse': toast('Reverse is coming soon.', true); break;
      case 'freeze': this.freezeFrame(); break;
      case 'adjust': this.setTool('adjust'); break;
      case 'filter': this.setTool('filter'); break;
      case 'cover': this.openCoverPicker(); break;
    }
  };
  Editor.freezeFrame = function () {
    var self = this, p = this.project;
    var found = Store.clipAt(this.t);
    if (!found) { toast('Nothing to freeze at the playhead.', true); return; }
    var idx = found.index;
    try {
      var url = this.canvas.toDataURL('image/jpeg', 0.85);
      var id = Store.uid('clip');
      Store.mediaCache.set(id, url);
      var nc = {
        id: id, type: 'photo', name: '❄ Freeze frame', url: url,
        duration: 2, in: 0, out: 2, speed: 1, rotation: 0, fit: 'cover',
        transitionIn: 'none', kb: false, volume: 1, muted: true
      };
      p.clips.splice(idx + 1, 0, nc);
      this.snapshot(); Store.persist(); this.syncMedia();
      this.renderTimeline(); this.drawOnce(); this.updateTransport();
      toast('Freeze frame added (2s).');
    } catch (e) { toast('Could not capture frame.', true); }
  };

  /* ================= COVER PICKER ================= */
  Editor.openCoverPicker = function () {
    var self = this;
    var total = Store.timing().total || 1;
    App.modal(
      '<h3>🖼️ Project cover</h3>' +
      '<p class="muted">Scrub to pick a frame, then save it as the project cover.</p>' +
      '<input type="range" id="cvSeek" min="0" max="1000" value="' + Math.round(this.t / total * 1000) + '" style="width:100%;min-height:44px">' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="cvOk" style="flex:1">Save cover</button>' +
      '<button class="btn ghost" id="cvNo">Cancel</button></div>',
      function (root) {
        root.querySelector('#cvSeek').oninput = function (e) {
          self.seek(total * (e.target.value / 1000));
        };
        root.querySelector('#cvNo').onclick = App.closeModal;
        root.querySelector('#cvOk').onclick = function () {
          try {
            var url = self.canvas.toDataURL('image/jpeg', 0.8);
            self.project.cover = url;
            self.snapshot(); Store.persist(); App.closeModal();
            toast('Cover saved.');
          } catch (e) { toast('Could not save cover.', true); }
        };
      }
    );
  };

  /* ================= PANEL: ADJUST ================= */
  var ADJUSTS = [
    { k: 'b', label: 'Brightness', min: 0.3, max: 2, def: 1, css: function (v) { return 'brightness(' + v + ')'; } },
    { k: 'c', label: 'Contrast', min: 0.3, max: 2, def: 1, css: function (v) { return 'contrast(' + v + ')'; } },
    { k: 's', label: 'Saturation', min: 0, max: 2.5, def: 1, css: function (v) { return 'saturate(' + v + ')'; } },
    { k: 'h', label: 'Hue', min: -180, max: 180, def: 0, css: function (v) { return 'hue-rotate(' + v + 'deg)'; } },
    { k: 'sep', label: 'Warmth', min: 0, max: 1, def: 0, css: function (v) { return 'sepia(' + v + ')'; } },
    { k: 'gray', label: 'B&W', min: 0, max: 1, def: 0, css: function (v) { return 'grayscale(' + v + ')'; } },
    { k: 'blur', label: 'Blur', min: 0, max: 8, def: 0, css: function (v) { return 'blur(' + v + 'px)'; } }
  ];
  Editor.adjustFilter = function (clip) {
    var a = clip.adjust; if (!a) return '';
    var parts = [];
    ADJUSTS.forEach(function (d) {
      var v = a[d.k];
      if (v != null && v !== d.def) parts.push(d.css(+v.toFixed(3)));
    });
    return parts.join(' ');
  };
  Editor.panel_adjust = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    c.adjust = c.adjust || {};
    var d = document.createElement('div');
    d.innerHTML = '<h4>🎚️ Adjust — ' + esc(c.name) + '</h4>';
    ADJUSTS.forEach(function (a) {
      var v = c.adjust[a.k] != null ? c.adjust[a.k] : a.def;
      var row = document.createElement('div');
      row.className = 'adj-row';
      row.innerHTML = '<div class="lbl"><span>' + a.label + '</span><span>' + v + '</span></div>';
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = a.min; inp.max = a.max; inp.step = '0.01'; inp.value = v;
      inp.oninput = function (e) {
        c.adjust[a.k] = +e.target.value;
        row.querySelector('.lbl span:last-child').textContent = e.target.value;
        self.drawOnce();
      };
      inp.onchange = function () { self.snapshot(); Store.persist(); };
      row.appendChild(inp);
      d.appendChild(row);
    });
    var rb = document.createElement('button');
    rb.className = 'btn ghost sm'; rb.textContent = 'Reset adjustments';
    rb.onclick = function () {
      c.adjust = {}; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel();
      toast('Adjustments reset.');
    };
    d.appendChild(rb);
    el.appendChild(d);
  };

  /* ================= PANEL: AI ================= */
  Editor.panel_ai = function (el) {
    var rows = [
      { ic: '✂️', t: 'AI Clipper', d: 'Analyzes video and suggests the best sections to keep. Needs an AI backend — architecture ready, not connected yet.' },
      { ic: '💬', t: 'Auto Captions', d: 'Speech-to-text captions. Needs a transcription backend — not available on this device.' },
      { ic: '🪄', t: 'Background Removal', d: 'AI person segmentation. Needs a vision backend — not available on this device.' },
      { ic: '🔍', t: 'AI Enhance', d: 'AI upscaling/denoise. Needs a GPU backend — not available on this device.' }
    ];
    var d = document.createElement('div');
    d.innerHTML = '<h4>🤖 AI Tools</h4><p class="muted" style="margin-bottom:10px">These need an online AI backend. Nothing here is faked — unavailable features are marked honestly.</p>';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'ai-row';
      row.innerHTML = '<span class="ic">' + r.ic + '</span><span class="tx"><b>' + esc(r.t) + '</b>' + esc(r.d) + '</span><span class="ai-badge">UNAVAILABLE</span>';
      d.appendChild(row);
    });
    el.appendChild(d);
  };

  /* ================= PANEL: OVERLAY ================= */
  Editor.panel_overlay = function (el) {
    var self = this, p = this.project;
    var d = document.createElement('div');
    d.innerHTML = '<h4>🖼️ Overlays</h4>';
    if (!p.overlays.length) d.innerHTML += '<p class="muted">No overlays yet.</p>';
    p.overlays.forEach(function (ov) {
      var row = document.createElement('div');
      row.className = 'ov-row' + (self.selOvId === ov.id ? ' sel' : '');
      row.innerHTML = '<span class="nm">' + (ov.type === 'video' ? '🎞 ' : '🖼 ') + esc(ov.name || '') + '</span>';
      var eb = document.createElement('button'); eb.className = 'btn ghost xs'; eb.textContent = 'Edit';
      eb.onclick = function () { self.selOvId = ov.id; self.ovEditDialog(ov); };
      var db = document.createElement('button'); db.className = 'btn danger xs'; db.textContent = '✕';
      db.onclick = function () { self.selOvId = ov.id; self.deleteOverlay(); };
      row.appendChild(eb); row.appendChild(db);
      row.addEventListener('click', function (e) {
        if (e.target === eb || e.target === db) return;
        self.selOvId = ov.id; self.selClipId = null; self.selTxId = null;
        self.renderTimeline();
      });
      d.appendChild(row);
    });
    var ab = document.createElement('button');
    ab.className = 'btn primary sm'; ab.textContent = '＋ Add overlay';
    ab.style.marginTop = '6px';
    ab.onclick = function () { self.addOverlay(0); };
    d.appendChild(ab);
    el.appendChild(d);
  };
  Editor.ovEditDialog = function (ov) {
    var self = this;
    App.modal(
      '<h3>🖼️ Overlay</h3>' +
      '<div class="adj-row"><div class="lbl"><span>Size</span><span id="ovSv">' + ov.scale + '</span></div><input type="range" id="ovS" min="0.1" max="1.5" step="0.01" value="' + ov.scale + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>Opacity</span><span id="ovOv">' + ov.opacity + '</span></div><input type="range" id="ovO" min="0.05" max="1" step="0.01" value="' + ov.opacity + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>Rotation°</span><span id="ovRv">' + ov.rotation + '</span></div><input type="range" id="ovR" min="-180" max="180" step="1" value="' + ov.rotation + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>X position</span><span id="ovXv">' + ov.x + '</span></div><input type="range" id="ovX" min="0" max="1" step="0.01" value="' + ov.x + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>Y position</span><span id="ovYv">' + ov.y + '</span></div><input type="range" id="ovY" min="0" max="1" step="0.01" value="' + ov.y + '"></div>' +
      '<div class="row"><div style="flex:1"><label class="lbl">Duration (s)</label><input type="number" id="ovD" min="0.5" max="60" step="0.5" value="' + ov.dur + '"></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="ovOk" style="flex:1">Done</button>' +
      '<button class="btn danger" id="ovDel">Delete</button></div>',
      function (root) {
        function wire(id, key, lab) {
          root.querySelector('#' + id).oninput = function (e) {
            ov[key] = +e.target.value;
            root.querySelector('#' + lab).textContent = e.target.value;
            self.drawOnce();
          };
        }
        wire('ovS', 'scale', 'ovSv'); wire('ovO', 'opacity', 'ovOv');
        wire('ovR', 'rotation', 'ovRv'); wire('ovX', 'x', 'ovXv'); wire('ovY', 'y', 'ovYv');
        root.querySelector('#ovD').onchange = function (e) {
          ov.dur = Math.max(0.5, Math.min(60, parseFloat(e.target.value) || 3));
          self.renderTimeline();
        };
        root.querySelector('#ovOk').onclick = function () {
          self.snapshot(); Store.persist(); App.closeModal();
          self.renderTimeline(); self.drawOnce(); self.renderPanel();
        };
        root.querySelector('#ovDel').onclick = function () { App.closeModal(); self.deleteOverlay(); };
      }
    );
  };
})();
