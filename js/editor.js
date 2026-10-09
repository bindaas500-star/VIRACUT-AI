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
    trimModeId: null, // clip id currently showing trim handles (trim mode)
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
      p.clips = p.clips || [];
      p.texts = p.texts || [];
      p.captions = p.captions || [];
      p.voiceovers = p.voiceovers || [];
      p.overlays = p.overlays || [];
      p.ovLaneCount = Math.max(1, Math.min(3, p.ovLaneCount || 1));
      // Phase 7 migrations: keyframe arrays on all animatable items
      p.clips.forEach(function (c) { c.keyframes = c.keyframes || []; });
      p.texts.forEach(function (tx) { tx.keyframes = tx.keyframes || []; });
      p.overlays.forEach(function (ov) { ov.keyframes = ov.keyframes || []; });
      (p.stickers || []).forEach(function (s) { s.keyframes = s.keyframes || []; });
      // Phase 8: timeline effect segments
      p.effects = p.effects || [];
      // Phase 11: normalize legacy transitionIn + caption styles
      p.clips.forEach(function (c) {
        if (c.transitionIn === 'crossfade') c.transitionIn = { type: 'fade', dur: 0.5 };
        else if (c.transitionIn === 'none') c.transitionIn = null;
      });
      p.captions.forEach(function (cp) {
        cp.style = cp.style || { size: 1, color: '#ffffff', bg: '#000000', bgOp: 0.72, pos: 'bottom' };
      });
      this.project = p;
      // stop any previous session: stale video elements would keep playing
      this.vidEls.forEach(function (el) { try { el.pause(); } catch (e) {} });
      cancelAnimationFrame(this.rafId);
      this.vidEls = new Map(); this.imgEls = new Map(); this.stills = new Map();
      this.thumbStrips = new Map(); this.ovEls = new Map();
      this.t = 0; this.playing = false; this.selClipId = null; this.tool = null;
      this.trimModeId = null;
      this.selOvId = null; this.selTxId = null; this.selFxId = null;
      this._fxPreview = null; // {fxId, params} temporary live preview (not committed)
      this._fxPhotoPreview = null; // {target:'clip'|'overlay', id, fxId, params}
      this._transClipId = null; // Phase 11: clip id for transition picker (from junction tap)
      this._selCapId = null; // Phase 11: selected caption id
      // Phase 7: keyframe session state
      this._kfSel = null; this._kfDrag = null; this._kfDragTarget = null;
      this._kfPointers = {}; this._kfPinchD = 0;
      this.audioKept = null; this.placingSticker = null; this.selStickerId = null;
      this.staged = []; this.audioBufs = new Map();
      try { this.zoomPps = Math.max(8, Math.min(160, parseFloat(localStorage.getItem('viracut_tlzoom')) || 30)); } catch (e) { this.zoomPps = 30; }
      this.canvas = document.getElementById('edCanvas');
      if (!this.canvas) { toast('Editor UI not ready.', true); return; }
      this.ctx = this.canvas.getContext('2d');
      this.sizeCanvas();
      var edNameEl0 = document.getElementById('edName');
      if (edNameEl0) edNameEl0.textContent = p.name;
      this.syncMedia(); this.bindTimeline();
      this.renderTools(); this.setTool(null); this.renderTimeline(); this.renderClipStrip(); this.renderStickers(); this.updateUndoRedo();
      this.updateTransport();
      App.show('screen-editor');
      this.drawOnce();
      if (App.deepLink && App.deepLink.panel) { this.setTool(App.deepLink.panel); App.deepLink = null; }
    },
    teardown: function () {
      this.pause();
      try { if (window.AudioLab) AudioLab.Engine.stop(); } catch (e) {}
      this.vidEls.forEach(function (el) { try { el.pause(); } catch (e) {} });
      cancelAnimationFrame(this.rafId);
      this.playing = false;
    },
    sizeCanvas: function () {
      if (!this.canvas) return;
      var a = this.project ? this.project.aspect : null, W, H;
      if (a === '16:9') { W = 640; H = 360; }
      else if (a === '1:1') { W = 540; H = 540; }
      else { W = 405; H = 720; }
      this.canvas.width = W; this.canvas.height = H;
      this.canvas.style.aspectRatio = W + ' / ' + H;
    },

    /* ================= media elements ================= */
    syncMedia: function () {
      var self = this, seen = {};
      if (!this.project) return;
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
          // safety: never strand the listener if the seek never fires
          setTimeout(function () { el.removeEventListener('seeked', done); }, 8000);
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
      if (!this.project || !tm || !tm.items.length) { toast('Import media first.'); return; }
      if (this.t >= tm.total - 0.05) this.t = 0;
      // decode extracted-audio buffers first if needed
      this.ensureAudioBuffers().then(function () {
        if (self.playing) return;
        self.playing = true;
        var edPlayEl0 = document.getElementById('edPlay');
        if (edPlayEl0) edPlayEl0.textContent = '⏸';
        self.startAudio();
        self.lastTs = performance.now();
        var loop = function (now) {
          if (!self.playing) return;
          try {
            var dt = (now - self.lastTs) / 1000; self.lastTs = now;
            self.t += dt;
            var total = Store.timing().total;
            if (self.t >= total) { self.t = total; self.pause(); self.drawOnce(); self.updateTransport(); return; }
            self.syncClipPlayback();
            self.positionPlayhead();
            self.drawOnce();
            self.updateTransport();
          } catch (err) {
            try { console.warn('[ViraCut] frame error:', err && err.message); } catch (e) {}
          }
          self.rafId = requestAnimationFrame(loop);
        };
        self.rafId = requestAnimationFrame(loop);
      });
    },
    pause: function () {
      if (!this.playing) return;
      this.playing = false;
      cancelAnimationFrame(this.rafId);
      var edPlayEl1 = document.getElementById('edPlay');
      if (edPlayEl1) edPlayEl1.textContent = '▶';
      this.vidEls.forEach(function (el) { try { el.pause(); } catch (e) {} });
      try { this.audioKept = window.AudioLab ? AudioLab.Engine.pause() : null; } catch (e) { this.audioKept = null; }
      this.updateTransport();
    },
    seek: function (t, opts) {
      var total = Store.timing().total;
      this.t = Math.max(0, Math.min(total, t));
      var found = Store.clipAt(this.t);
      if (found) {
        var c = found.item.clip;
        if (c.type === 'video') {
          var el = this.vidEls.get(c.id);
          if (el && el.readyState >= 1) {
            try { el.currentTime = Math.min(window.EditorLogic.clipVideoTime(c, found.item.start, this.t), c.out - 0.05); } catch (e) {}
          }
        }
      }
      this.positionPlayhead();
      this.drawOnce(); this.updateTransport();
      if (!opts || !opts.noScroll) this.ensurePlayheadVisible();
    },
    syncClipPlayback: function () {
      var self = this;
      var found = Store.clipAt(this.t);
      var L = window.EditorLogic;
      this.vidEls.forEach(function (el, id) {
        var isCur = found && found.item.clip.id === id;
        try {
          if (isCur) {
            var c = found.item.clip;
            el.playbackRate = c.speed || 1;
            var exp = L.clipVideoTime(c, found.item.start, self.t);
            if (c.reversed) {
              /* Phase 9: video elements can't play backward natively — keep the
                 element paused and seek it to the reversed position as project
                 time advances. Audio keeps playing forward (documented). */
              if (!el.paused) el.pause();
              if (el.readyState >= 1 && Math.abs(el.currentTime - exp) > 0.12) el.currentTime = Math.min(exp, c.out - 0.05);
            } else {
              if (el.paused) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
              if (Math.abs(el.currentTime - exp) > 0.4 && el.readyState >= 1) el.currentTime = Math.min(exp, c.out - 0.05);
            }
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
      if (voices.length && window.AudioLab) { try { AudioLab.Engine.start(voices, false, baseT); } catch (e) {} }
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
      this.updateStickerKFDom();
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
      var L2 = window.EditorLogic;
      var tr = (idx > 0) ? L2.transitionAt(item.clip.transitionIn, t - item.start) : null;
      if (tr) {
        this.drawTransition(g, W, H, t, tr, Store.timing().items[idx - 1], item);
      } else {
        this.drawClipFX(g, item, W, H, t);
      }
      // Phase 9: crop mode overlay (preview only — never in export)
      if (!forExport && this.cropModeId === item.clip.id) this.drawCropOverlay(g, W, H);
      // text overlays (Pro kinetic-text FX hook)
      var self = this;
      var kfx = (window.FX && found) ? FX.get(found.item.clip.fx) : null;
      p.texts.forEach(function (tx) {
        if (t >= tx.start && t <= tx.end) {
          if (kfx && kfx.kineticText) kfx.kineticText(g, tx, W, H, t);
          else self.drawText(g, tx, W, H);
        }
      });
      // captions (Phase 11: per-caption styling)
      var cap = window.Captions ? Captions.at(t) : null;
      if (cap) {
        var cs = cap.style || { size: 1, color: '#ffffff', bg: '#000000', bgOp: 0.72, pos: 'bottom' };
        g.save();
        var fs = Math.round(W * 0.045 * (cs.size || 1));
        g.font = '700 ' + fs + 'px sans-serif'; g.textAlign = 'center';
        var tw = Math.min(W * 0.9, g.measureText(cap.text).width + 36);
        var bw = tw, bh = fs * 1.7, bx = (W - bw) / 2;
        var by = window.EditorLogic.captionY(cs.pos, H, bh);
        g.fillStyle = Editor._hexA(cs.bg || '#000000', cs.bgOp == null ? 0.72 : cs.bgOp);
        g.beginPath(); if (g.roundRect) g.roundRect(bx, by, bw, bh, 12); else g.rect(bx, by, bw, bh); g.fill();
        g.fillStyle = cs.color || '#ffffff';
        g.fillText(cap.text, W / 2, by + bh * 0.68, W * 0.88);
        g.restore();
      }
      // stickers (export only — preview uses DOM layer)
      if (forExport) {
        p.stickers.forEach(function (s) {
          g.save();
          // KEYFRAMES: animated sticker transform in export
          var skfp = self.kfForDraw('sticker', s, t, W, H);
          var sx = skfp ? skfp.x : s.x, sy = skfp ? skfp.y : s.y;
          var sscale = skfp ? skfp.scale : 1, srot = skfp ? skfp.rot : 0;
          if (skfp) g.globalAlpha *= window.EditorLogic.clamp01(skfp.opacity);
          g.font = Math.round(s.size * sscale * W) + 'px sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.translate(sx * W, sy * H);
          if (srot) g.rotate(srot * Math.PI / 180);
          g.fillText(s.emoji, 0, 0);
          g.restore();
        });
      }
      // overlays (photo/video picture-in-picture)
      self.drawOverlays(g, W, H, t);
      // Phase 8: timeline effect segments + live preview effect (preview & export share this path)
      self.drawEffectSegments(g, W, H, t);
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
          if (!media || !media.complete || !media.naturalWidth) return;
          mw = media.naturalWidth; mh = media.naturalHeight;
        }
        g.save();
        // KEYFRAMES: animated overlay transform (absolute native values)
        var kfp = self.kfForDraw('overlay', ov, t, W, H);
        var ex = kfp ? kfp.x : ov.x;
        var ey = kfp ? kfp.y : ov.y;
        var escale = kfp ? kfp.scale : (ov.scale || 0.4);
        var erot = kfp ? kfp.rot : (ov.rotation || 0);
        g.globalAlpha = Math.max(0, Math.min(1, kfp ? L.clamp01(kfp.opacity) : (ov.opacity == null ? 1 : ov.opacity)));
        g.translate(ex * W, ey * H);
        if (erot) g.rotate(erot * Math.PI / 180);
        var s = escale * W / mw;
        var dw = mw * s, dh = mh * s;
        // cover-fit into a 16:9-ish box? No — draw natural aspect
        // Phase 8: photo effect on overlay — render to offscreen, apply, draw back
        var pfx = (ov.type === 'photo' && ov.photoFx && window.FXLIB) ? FXLIB.get(ov.photoFx) : null;
        if (pfx) {
          try {
            var ocv = document.createElement('canvas');
            ocv.width = Math.max(2, Math.round(dw)); ocv.height = Math.max(2, Math.round(dh));
            var og2 = ocv.getContext('2d');
            if (pfx.css) {
              var sharp = document.createElement('canvas'); sharp.width = ocv.width; sharp.height = ocv.height;
              sharp.getContext('2d').drawImage(media, 0, 0, ocv.width, ocv.height);
              og2.filter = pfx.css; og2.drawImage(sharp, 0, 0); og2.filter = 'none';
            } else {
              og2.drawImage(media, 0, 0, ocv.width, ocv.height);
            }
            if (pfx.draw) pfx.draw(og2, ocv.width, ocv.height, t, ov, ov.photoFxParams || {});
            g.drawImage(ocv, -dw / 2, -dh / 2, dw, dh);
          } catch (e) { try { g.drawImage(media, -dw / 2, -dh / 2, dw, dh); } catch (e2) {} }
        } else {
          try { g.drawImage(media, -dw / 2, -dh / 2, dw, dh); } catch (e) {}
        }
        if (self.selOvId === ov.id) {
          g.strokeStyle = '#8B5CF6'; g.lineWidth = 3;
          g.strokeRect(-dw / 2, -dh / 2, dw, dh);
        }
        g.restore();
      });
    },
    /* Phase 8: render timeline effect segments active at t, in order (later = on top).
       Also renders the temporary live-preview effect (_fxPreview). Shared by
       preview and export, so committed effects are baked into the video. */
    drawEffectSegments: function (g, W, H, t) {
      var p = this.project;
      if (window.FXLIB && p && p.effects && p.effects.length) {
        FXLIB.renderSegments(g, W, H, t, p.effects);
      }
      var pv = this._fxPreview;
      if (window.FXLIB && pv) {
        var def = FXLIB.get(pv.fxId);
        if (def && def.apply) {
          try { def.apply(g, W, H, t, { start: 0, dur: 9999, params: pv.params }, null); } catch (e) {}
        }
      }
      // Phase 8: photo effects on selected photo clip / overlay
      this.drawPhotoFx(g, W, H, t);
    },
    /* apply item.photoFx for the photo clip under t (photo overlays handled in drawOverlays) */
    drawPhotoFx: function (g, W, H, t) {
      if (!window.FXLIB) return;
      // live photo-effect preview (not committed yet)
      var pp = this._fxPhotoPreview;
      if (pp && pp.target === 'clip') {
        var pdc = FXLIB.get(pp.fxId);
        if (pdc) { this._applyPhotoFxToFrame(g, W, H, t, pdc, pp.params); return; }
      }
      var found = window.Store ? Store.clipAt(t) : null;
      if (!found || found.item.clip.type !== 'photo' || !found.item.clip.photoFx) return;
      var pd = FXLIB.get(found.item.clip.photoFx);
      if (!pd) return;
      this._applyPhotoFxToFrame(g, W, H, t, pd, found.item.clip.photoFxParams || {});
    },
    _applyPhotoFxToFrame: function (g, W, H, t, pd, Pp) {
      try {
        var snap = document.createElement('canvas'); snap.width = W; snap.height = H;
        snap.getContext('2d').drawImage(g.canvas, 0, 0, W, H);
        g.save();
        // Photo Motion: slow Ken Burns zoom (time-based, deterministic)
        if (pd.id === 'p_motion') {
          var zm = Pp.intensity == null ? 15 : Pp.intensity;
          var z = 1 + (zm / 100) * (0.5 + 0.5 * (t % 6) / 6);
          var sw = W / z, sh = H / z;
          g.drawImage(snap, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, W, H);
        } else if (pd.css) {
          g.filter = pd.css; g.drawImage(snap, 0, 0, W, H); g.filter = 'none';
        } else {
          g.drawImage(snap, 0, 0, W, H);
        }
        if (pd.draw) pd.draw(g, W, H, t, null, Pp);
        g.restore();
      } catch (e) {}
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
    /* Phase 11: cached end-frame still image for a clip id (for transitions) */
    _stillImg: function (id) {
      var still = this.stills.get(id);
      if (!still) return null;
      var pre = this._stillImgs || (this._stillImgs = {});
      if (!pre[id] || pre[id]._src !== still) {
        var ni = new Image(); ni._src = still; ni.src = still; pre[id] = ni;
      }
      var sim = pre[id];
      return (sim && sim.complete && sim.naturalWidth) ? sim : null;
    },
    /* Phase 11: render a transition between prevItem (outgoing) and item (incoming).
       tr = {type:'fade'|'slide'|'zoom'|'wipe', dur, p:0..1}. Shared by preview & export. */
    drawTransition: function (g, W, H, t, tr, prevItem, item) {
      var p = Math.max(0, Math.min(1, tr.p));
      var sim = prevItem ? this._stillImg(prevItem.clip.id) : null;
      function drawPrev() {
        if (sim) { g.save(); this.drawCover(g, sim, W, H); g.restore(); }
      }
      if (tr.type === 'fade') {
        drawPrev.call(this);
        g.save(); g.globalAlpha = p; this.drawClipFX(g, item, W, H, t); g.restore();
      } else if (tr.type === 'slide') {
        g.save(); g.translate(-p * W, 0); drawPrev.call(this); g.restore();
        g.save(); g.translate((1 - p) * W, 0); this.drawClipFX(g, item, W, H, t); g.restore();
      } else if (tr.type === 'zoom') {
        drawPrev.call(this);
        var s = 1.4 - 0.4 * p;
        g.save(); g.globalAlpha = p;
        g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2);
        this.drawClipFX(g, item, W, H, t); g.restore();
      } else if (tr.type === 'wipe') {
        drawPrev.call(this);
        g.save(); g.beginPath(); g.rect(0, 0, Math.max(0, p * W), H); g.clip();
        this.drawClipFX(g, item, W, H, t); g.restore();
      } else {
        this.drawClipFX(g, item, W, H, t);
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
      // KEYFRAMES: animated offset / zoom / rotation / opacity on top of base
      var kfp = this.kfForDraw('clip', clip, t, W, H);
      if (kfp) {
        var kxs = W / (kfp.rw || W), kys = H / (kfp.rh || H);
        g.translate(kfp.x * kxs, kfp.y * kys);
        if (kfp.rot) g.rotate(kfp.rot * Math.PI / 180);
        if (kfp.scale && Math.abs(kfp.scale - 1) > 0.0005) g.scale(kfp.scale, kfp.scale);
        g.globalAlpha *= window.EditorLogic.clamp01(kfp.opacity);
      }
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
          if (clip.crop) this.drawFitCrop(g, el, window.EditorLogic.cropSrcRect(clip.crop, el.videoWidth, el.videoHeight), dw, dh, clip.fit || 'cover');
          else this.drawFit(g, el, el.videoWidth, el.videoHeight, dw, dh, clip.fit || 'cover');
        } else {
          g.fillStyle = '#141428'; g.fillRect(-dw / 2, -dh / 2, dw, dh);
          g.fillStyle = '#9AA0B4'; g.font = '400 15px sans-serif'; g.textAlign = 'center';
          g.fillText('Loading…', 0, 5);
        }
      } else {
        var im = this.imgEls.get(clip.id);
        if (im && im.complete && im.naturalWidth) {
          if (clip.crop) this.drawFitCrop(g, im, window.EditorLogic.cropSrcRect(clip.crop, im.naturalWidth, im.naturalHeight), dw, dh, clip.fit || 'cover');
          else if (clip.kb === false) { this.drawFit(g, im, im.width, im.height, dw, dh, clip.fit || 'cover'); }
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
    /* Phase 9: draw only the cropped source rect `sr` {x,y,w,h} (source px),
       fitted into the destination. Works for video elements and images. */
    drawFitCrop: function (g, src, sr, dw, dh, fit) {
      if (!sr || sr.w < 1 || sr.h < 1) return;
      var s = fit === 'contain' ? Math.min(dw / sr.w, dh / sr.h) : Math.max(dw / sr.w, dh / sr.h);
      var w = sr.w * s, h = sr.h * s;
      g.drawImage(src, sr.x, sr.y, sr.w, sr.h, -w / 2, -h / 2, w, h);
    },
    /* ================= Phase 9: CROP MODE =================
       Draggable crop rectangle over the preview. The rect is stored as
       fractions of the SOURCE dimensions; the overlay is drawn in screen
       space on the unrotated source frame (crop operates on source). */
    cropModeId: null,
    _cropDraft: null,
    _cropDrag: null,
    enterCropMode: function () {
      var c = this.selClip();
      if (!c) { toast('Select a clip first.', true); return; }
      if (c.type !== 'video' && c.type !== 'photo') { toast('Crop works on video/photo clips.', true); return; }
      this.cropModeId = c.id;
      var L = window.EditorLogic;
      if (c.crop) this._cropDraft = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };
      else this._cropDraft = L.cropFitAspect(this.project.aspect);
      this.trimModeId = null;
      this.setTool && this.setTool(null);
      this.bindCropMode();
      // jump playhead to the clip so the crop UI is visible
      var tm = Store.timing();
      for (var i = 0; i < tm.items.length; i++) {
        if (tm.items[i].clip.id === c.id) { this.seek(tm.items[i].start); break; }
      }
      this.renderTimeline(); this.renderClipStrip(); this.drawOnce();
      toast('Drag corners to resize, drag inside to move.');
    },
    exitCropMode: function () {
      this.cropModeId = null; this._cropDraft = null; this._cropDrag = null;
      this.renderClipStrip(); this.drawOnce();
    },
    applyCrop: function () {
      var c = this.selClip();
      if (!c || !this._cropDraft) { this.exitCropMode(); return; }
      var d = this._cropDraft;
      c.crop = { x: +d.x.toFixed(4), y: +d.y.toFixed(4), w: +d.w.toFixed(4), h: +d.h.toFixed(4) };
      this.snapshot(); Store.persist();
      this.exitCropMode();
      this.renderTimeline(); this.drawOnce();
      toast('Crop applied.');
    },
    cancelCrop: function () {
      this.exitCropMode();
      this.renderTimeline();
      toast('Crop cancelled.');
    },
    /* source dimensions for the crop UI */
    cropSourceDims: function (clip) {
      if (clip.type === 'video') {
        var el = this.vidEls.get(clip.id);
        if (el && el.videoWidth) return { sw: el.videoWidth, sh: el.videoHeight };
      } else {
        var im = this.imgEls.get(clip.id);
        if (im && im.naturalWidth) return { sw: im.naturalWidth, sh: im.naturalHeight };
      }
      return null;
    },
    /* screen-space rect of the (unrotated, cover-fit) source frame */
    cropFrameRect: function (clip, W, H) {
      var dims = this.cropSourceDims(clip);
      if (!dims) return null;
      var s = Math.max(W / dims.sw, H / dims.sh);
      var vw = dims.sw * s, vh = dims.sh * s;
      return { x: (W - vw) / 2, y: (H - vh) / 2, w: vw, h: vh, s: s, sw: dims.sw, sh: dims.sh };
    },
    /* draw the crop overlay in screen space; called from composite() */
    drawCropOverlay: function (g, W, H) {
      var c = this.selClip();
      if (!c || c.id !== this.cropModeId || !this._cropDraft) return;
      var fr = this.cropFrameRect(c, W, H);
      if (!fr) return;
      var r = this._cropDraft;
      var rx = fr.x + r.x * fr.sw * fr.s, ry = fr.y + r.y * fr.sh * fr.s;
      var rw = r.w * fr.sw * fr.s, rh = r.h * fr.sh * fr.s;
      g.save();
      // darken outside the rect
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.fillRect(0, 0, W, ry);
      g.fillRect(0, ry + rh, W, H - ry - rh);
      g.fillRect(0, ry, rx, rh);
      g.fillRect(rx + rw, ry, W - rx - rw, rh);
      // border
      g.strokeStyle = '#a78bfa'; g.lineWidth = Math.max(2, W * 0.006);
      g.strokeRect(rx, ry, rw, rh);
      // rule-of-thirds grid
      g.strokeStyle = 'rgba(167,139,250,0.45)'; g.lineWidth = 1;
      for (var i = 1; i <= 2; i++) {
        g.beginPath(); g.moveTo(rx + rw * i / 3, ry); g.lineTo(rx + rw * i / 3, ry + rh); g.stroke();
        g.beginPath(); g.moveTo(rx, ry + rh * i / 3); g.lineTo(rx + rw, ry + rh * i / 3); g.stroke();
      }
      // corner handles
      var hs = Math.max(14, W * 0.035);
      g.fillStyle = '#fff';
      [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]].forEach(function (pt) {
        g.fillRect(pt[0] - hs / 2, pt[1] - hs / 2, hs, hs);
      });
      g.restore();
    },
    /* pointer interaction for crop mode; bound once */
    bindCropMode: function () {
      var self = this;
      var cv = document.getElementById('edCanvas');
      if (!cv || cv._cropBound) return;
      cv._cropBound = true;
      function toCanvas(e) {
        var r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * cv.width / Math.max(1, r.width), y: (e.clientY - r.top) * cv.height / Math.max(1, r.height) };
      }
      function hitZone(px, py) {
        var c = self.selClip();
        if (!c || c.id !== self.cropModeId || !self._cropDraft) return null;
        var W = cv.width, H = cv.height;
        var fr = self.cropFrameRect(c, W, H);
        if (!fr) return null;
        var r = self._cropDraft;
        var rx = fr.x + r.x * fr.sw * fr.s, ry = fr.y + r.y * fr.sh * fr.s;
        var rw = r.w * fr.sw * fr.s, rh = r.h * fr.sh * fr.s;
        var tol = Math.max(20, W * 0.04);
        var corners = { tl: [rx, ry], tr: [rx + rw, ry], bl: [rx, ry + rh], br: [rx + rw, ry + rh] };
        for (var k in corners) {
          if (Math.abs(px - corners[k][0]) < tol && Math.abs(py - corners[k][1]) < tol) return { mode: 'resize', corner: k, fr: fr };
        }
        if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return { mode: 'move', fr: fr };
        return null;
      }
      cv.addEventListener('pointerdown', function (e) {
        if (!self.cropModeId) return;
        var pt = toCanvas(e);
        var z = hitZone(pt.x, pt.y);
        if (!z) return;
        try { cv.setPointerCapture(e.pointerId); } catch (e2) {}
        self._cropDrag = { zone: z, pid: e.pointerId, lastX: pt.x, lastY: pt.y };
        e.preventDefault(); e.stopPropagation();
      });
      cv.addEventListener('pointermove', function (e) {
        var d = self._cropDrag;
        if (!d || e.pointerId !== d.pid || !self._cropDraft) return;
        var pt = toCanvas(e);
        var L = window.EditorLogic;
        var fr = d.zone.fr;
        var dx = (pt.x - d.lastX) / (fr.sw * fr.s), dy = (pt.y - d.lastY) / (fr.sh * fr.s);
        d.lastX = pt.x; d.lastY = pt.y;
        if (d.zone.mode === 'resize') self._cropDraft = L.cropResize(self._cropDraft, d.zone.corner, dx, dy, self.project.aspect);
        else self._cropDraft = L.cropMove(self._cropDraft, dx, dy);
        self.drawOnce();
        e.preventDefault();
      });
      function end(e) {
        var d = self._cropDrag;
        if (d && e.pointerId === d.pid) self._cropDrag = null;
      }
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
    },
    drawCover: function (g, src, W, H) {
      var s = Math.max(W / src.naturalWidth, H / src.naturalHeight);
      var w = src.naturalWidth * s, h = src.naturalHeight * s;
      g.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
    },
    drawText: function (g, tx, W, H) {
      g.save();
      // KEYFRAMES: animated text offset / zoom / rotation / opacity
      var kfp = this.kfForDraw('text', tx, W, H);
      var kxs = kfp ? W / (kfp.rw || W) : 1, kys = kfp ? H / (kfp.rh || H) : 1;
      var tdx = kfp ? kfp.x * kxs : 0, tdy = kfp ? kfp.y * kys : 0;
      var tscale = kfp ? kfp.scale : 1, trot = kfp ? kfp.rot : 0;
      if (kfp) g.globalAlpha *= window.EditorLogic.clamp01(kfp.opacity);
      var fs = Math.round((tx.size || 5) * W / 100 * tscale);
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
      g.translate(W / 2 + tdx, y + tdy);
      if (trot) g.rotate(trot * Math.PI / 180);
      lines.forEach(function (l, i) { g.fillText(l, 0, (y0 - y) + i * lh); });
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
    /* Phase 11: transition progress. tr = clip.transitionIn ({type,dur}|null), dt = t - clipStart.
       Returns {type, dur, p} (p 0..1) or null. Handles legacy 'crossfade'/'none' strings. */
    transitionAt: function (tr, dt) {
      if (!tr || tr === 'none') return null;
      if (tr === 'crossfade') tr = { type: 'fade', dur: 0.5 };
      if (!tr.type || !(tr.dur > 0)) return null;
      if (dt < 0 || dt >= tr.dur) return null;
      return { type: tr.type, dur: tr.dur, p: dt / tr.dur };
    },
    /* Phase 11: caption vertical anchor for pos 'top'|'center'|'bottom' given canvas H and box height */
    captionY: function (pos, H, bh) {
      if (pos === 'top') return H * 0.08;
      if (pos === 'center') return (H - bh) / 2;
      return H - bh - H * 0.06; // bottom
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
    /* how many thumbnails for a clip of durSec seconds: 1 per ~2s, clamped 3..10 */
    thumbCount: function (durSec) {
      var n = Math.round((durSec || 3) / 2);
      return Math.max(3, Math.min(10, n));
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
    /* ---- Unified timeline coordinate model (CapCut-style) ----
       Content x of project time t inside .tl-inner = headW + t*pps.
       Track-relative x of time t inside a .tl-track    = t*pps.
       The playhead is pinned: while headW + t*pps < viewW/2 the timeline
       stays at scrollLeft=0 and the playhead sits at x = headW + t*pps
       (NOT centered); past that point the playhead stays centered and the
       content scrolls under it. At t=0 the first frame of clip 1 sits
       exactly under the playhead with no gap. */
    /* scrollLeft that puts project time t under the playhead */
    scrollForTime: function (t, viewW, pps, headW) {
      var hw = headW || 0;
      return Math.max(0, hw + t * pps - viewW / 2);
    },
    /* project time under the viewport center for a scroll position */
    timeFromScroll: function (scrollLeft, viewW, pps, total, headW) {
      var hw = headW || 0;
      var t = (scrollLeft + viewW / 2 - hw) / Math.max(1, pps);
      return Math.max(0, Math.min(total, t));
    },
    /* viewport x of the playhead for time t at a scroll position */
    playheadViewX: function (t, pps, headW, scrollLeft) {
      return (headW || 0) + t * pps - scrollLeft;
    },
    /* ---- Clip selection gesture model (CapCut-style) ----
       TAP (quick, minimal movement) on a clip = select clip + seek to tap time.
       LONG PRESS (finger held, then drag) on a clip = move/reorder the clip.
       SWIPE (fast move beyond threshold) = cancel tap, treat as scroll/scrub. */
    TAP_MAX_PX: 12,
    LONGPRESS_MS: 450,
    classifyPress: function (dtMs, movedPx) {
      if (movedPx > this.TAP_MAX_PX) return 'swipe';
      if (dtMs >= this.LONGPRESS_MS) return 'longpress';
      return 'tap';
    },
    /* pure split math: split `clip` at playhead time `t` (item starts at itemStart).
       Returns {a:{in,out}, b:{in,out}} or null when too close to an edge. */
    splitAt: function (clip, t, itemStart) {
      var speed = clip.speed || 1;
      var m = clip.in + (t - itemStart) * speed;
      if (m - clip.in < 0.25 || clip.out - m < 0.25) return null;
      return {
        a: { 'in': +clip.in.toFixed(2), out: +m.toFixed(2) },
        b: { 'in': +m.toFixed(2), out: +clip.out.toFixed(2) }
      };
    },
    /* project time from a clientX on the timeline:
       t = (scrollLeft + (cx - viewLeft) - headW) / pps */
    tapTimeFromClientX: function (cx, viewLeft, scrollLeft, headW, pps) {
      return (scrollLeft + (cx - viewLeft) - (headW || 0)) / Math.max(1, pps);
    },
    /* drop index for clip reorder drag: block whose center span contains cx */
    dropIndex: function (geom, cx, fromIdx) {
      var to = fromIdx;
      for (var i = 0; i < geom.length; i++) {
        if (cx < geom[i].x + geom[i].w / 2) { to = i; break; }
        to = i;
      }
      return to;
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
    },
    /* ---- Keyframe engine (pure) ----
       keyframes: [{t, x, y, scale, rot, opacity, rw, rh}] sorted by t.
       x/y: clip|text = px offset from center (at rw x rh canvas);
            overlay|sticker = fractions of W/H (native space).
       scale: multiplier (1 = 100%). rot: degrees. opacity: 0..1. */
    /* interpolated props at project time t; null when no keyframes */
    keyframeAt: function (kfs, t) {
      if (!kfs || !kfs.length) return null;
      function pick(k) {
        return { x: k.x, y: k.y, scale: k.scale, rot: k.rot, opacity: k.opacity, rw: k.rw, rh: k.rh };
      }
      var a = kfs[0], b = kfs[kfs.length - 1];
      if (t <= a.t) return pick(a);
      if (t >= b.t) return pick(b);
      for (var i = 0; i < kfs.length - 1; i++) {
        var k1 = kfs[i], k2 = kfs[i + 1];
        if (t >= k1.t && t <= k2.t) {
          var span = k2.t - k1.t;
          var r = span > 0 ? (t - k1.t) / span : 0;
          return {
            x: k1.x + (k2.x - k1.x) * r,
            y: k1.y + (k2.y - k1.y) * r,
            scale: k1.scale + (k2.scale - k1.scale) * r,
            rot: k1.rot + (k2.rot - k1.rot) * r,
            opacity: k1.opacity + (k2.opacity - k1.opacity) * r,
            rw: k1.rw, rh: k1.rh
          };
        }
      }
      return pick(b);
    },
    /* index of keyframe within eps seconds of t, else -1 */
    kfFindAt: function (kfs, t, eps) {
      if (!kfs) return -1;
      for (var i = 0; i < kfs.length; i++) {
        if (Math.abs(kfs[i].t - t) <= eps) return i;
      }
      return -1;
    },
    /* index of keyframe nearest to t, else -1 */
    kfNearest: function (kfs, t) {
      if (!kfs || !kfs.length) return -1;
      var bi = 0, bd = Math.abs(kfs[0].t - t);
      for (var i = 1; i < kfs.length; i++) {
        var d = Math.abs(kfs[i].t - t);
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    },
    /* {prev, next} keyframe times around t (null when none) */
    kfPrevNext: function (kfs, t) {
      var prev = null, next = null;
      if (!kfs) return { prev: prev, next: next };
      for (var i = 0; i < kfs.length; i++) {
        var kt = kfs[i].t;
        if (kt < t - 0.05) prev = kt;
        if (kt > t + 0.05 && next == null) next = kt;
      }
      return { prev: prev, next: next };
    },
    /* insert kf keeping the array sorted by t (mutates, returns kfs) */
    kfSortedInsert: function (kfs, kf) {
      var i = 0;
      while (i < kfs.length && kfs[i].t < kf.t) i++;
      kfs.splice(i, 0, kf);
      return kfs;
    },
    clamp01: function (v) { v = +v; if (isNaN(v)) return 1; return Math.max(0, Math.min(1, v)); },
    /* ---- Phase 9: Crop + Reverse (pure, testable) ---- */
    /* video element time for project time t within item starting at itemStart.
       Reversed clips play from clip.out backward. Result clamped to [in,out]. */
    clipVideoTime: function (clip, itemStart, t) {
      var dt = (t - itemStart) * (clip.speed || 1);
      var vt = clip.reversed ? (clip.out - dt) : ((clip.in || 0) + dt);
      var lo = Math.min(clip.in || 0, clip.out), hi = Math.max(clip.in || 0, clip.out);
      return Math.max(lo, Math.min(hi, vt));
    },
    /* project aspect string -> w/h ratio */
    projAspectRatio: function (aspect) {
      if (aspect === '16:9') return 16 / 9;
      if (aspect === '1:1') return 1;
      return 9 / 16;
    },
    /* largest centered rect with the given aspect inside the unit square */
    cropFitAspect: function (aspect) {
      var a = L.projAspectRatio(aspect);
      var w, h;
      if (a >= 1) { w = 1; h = 1 / a; } else { h = 1; w = a; }
      return { x: (1 - w) / 2, y: (1 - h) / 2, w: w, h: h };
    },
    /* resize rect by dragging `corner` ('tl','tr','bl','br') by (dx,dy) in
       fractions; keeps w/h = aspect, anchored at the opposite corner,
       clamped inside the unit square. Returns a new rect. */
    cropResize: function (r, corner, dx, dy, aspect) {
      var a = L.projAspectRatio(aspect);
      var ax = corner[1] === 'l' ? r.x + r.w : r.x;
      var ay = corner[0] === 't' ? r.y + r.h : r.y;
      var fx = (corner[1] === 'l' ? r.x : r.x + r.w) + dx;
      var fy = (corner[0] === 't' ? r.y : r.y + r.h) + dy;
      var nw = Math.abs(fx - ax), nh = Math.abs(fy - ay);
      if (nw / a > nh) nh = nw / a; else nw = nh * a;
      if (nw < 0.001 || nh < 0.001) return { x: r.x, y: r.y, w: r.w, h: r.h };
      var maxW = corner[1] === 'l' ? ax : 1 - ax;
      var maxH = corner[0] === 't' ? ay : 1 - ay;
      var s = Math.min(maxW / nw, maxH / nh);
      if (s < 1) { nw *= s; nh *= s; }
      if (nw < 0.05 || nh < 0.05) return { x: r.x, y: r.y, w: r.w, h: r.h };
      return {
        x: corner[1] === 'l' ? ax - nw : ax,
        y: corner[0] === 't' ? ay - nh : ay,
        w: nw, h: nh
      };
    },
    /* move rect by (dx,dy) fractions, clamped inside the unit square */
    cropMove: function (r, dx, dy) {
      return {
        x: Math.max(0, Math.min(1 - r.w, r.x + dx)),
        y: Math.max(0, Math.min(1 - r.h, r.y + dy)),
        w: r.w, h: r.h
      };
    },
    /* crop fractions -> source pixel rect {x,y,w,h} */
    cropSrcRect: function (crop, sw, sh) {
      return { x: crop.x * sw, y: crop.y * sh, w: crop.w * sw, h: crop.h * sh };
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
        self.snapshot(); Store.persist();
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
    if (!p) return;
    var items = idx == null ? this.staged.slice() : [this.staged[idx]];
    var added = 0;
    // insertion point: after the selected clip, else at the end
    var at = p.clips.length;
    if (self.selClipId) {
      for (var si0 = 0; si0 < p.clips.length; si0++) {
        if (p.clips[si0].id === self.selClipId) { at = si0 + 1; break; }
      }
    }
    items.forEach(function (item) {
      var id = Store.uid('clip');
      Store.mediaCache.set(id, item.url);
      var clip;
      if (item.kind === 'video') {
        var dur = item.duration || 5;
        clip = { id: id, type: 'video', name: item.name, url: item.url, duration: dur, in: 0, out: dur, speed: 1, rotation: 0, flipH: false, flipV: false, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, fit: 'cover', transitionIn: 'none' };
      } else {
        clip = { id: id, type: 'photo', name: item.name, url: item.url, duration: 3, in: 0, out: 3, speed: 1, rotation: 0, flipH: false, flipV: false, fit: 'cover', transitionIn: 'none', kb: true };
      }
      p.clips.splice(at, 0, clip);
      at++;
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
    var oldStarts = this._clipStarts();
    var nc = Object.assign({}, c, { id: Store.uid('clip'), name: (c.name || 'clip') + ' (copy)' });
    // KEYFRAMES: deep copy so the two clips animate independently
    if (c.keyframes) nc.keyframes = c.keyframes.map(function (kf) { return Object.assign({}, kf); });
    // Phase 9: deep copy crop so edits don't leak between copies
    if (c.crop) nc.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };
    // Phase 11: deep copy transitionIn (now an object)
    if (nc.transitionIn && typeof nc.transitionIn === 'object') nc.transitionIn = { type: nc.transitionIn.type, dur: nc.transitionIn.dur };
    if (c.type === 'audio') {
      var buf = this.audioBufs.get(c.id);
      if (buf) this.audioBufs.set(nc.id, buf);
    }
    if (c.url) Store.mediaCache.set(nc.id, c.url);
    p.clips.splice(p.clips.indexOf(c) + 1, 0, nc);
    this.selClipId = nc.id;
    this.snapshot();
    this._kfResyncClips(oldStarts);
    Store.persist();
    this.syncMedia(); this.renderTimeline(); this.drawOnce(); this.updateTransport();
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
    if (!p || from === to || from < 0 || from >= p.clips.length) return;
    var oldStarts = this._clipStarts();
    to = Math.max(0, Math.min(p.clips.length - 1, to));
    var x = p.clips.splice(from, 1)[0];
    p.clips.splice(to, 0, x);
    this.snapshot();
    this._kfResyncClips(oldStarts);
    Store.persist(); this.renderTimeline(); this.drawOnce(); this.updateTransport();
  };

  /* ================= Phase 2 timeline: absolute time-positioned tracks ================= */
  Editor.tlPad = function () { return 0; }; // legacy: no padding in unified model
  /* width of the lane icon head (must match CSS .tl-head flex-basis) */
  Editor.headW = function () {
    try {
      var h = document.querySelector('#edTlInner .tl-head');
      if (h && h.offsetWidth) return h.offsetWidth;
    } catch (e) {}
    return 26;
  };
  /* project time under a clientX on the timeline (DOM wrapper) */
  Editor.timelineTimeFromClientX = function (cx) {
    var sc = document.getElementById('edTlScroll');
    if (!sc) return null;
    var r = sc.getBoundingClientRect();
    return window.EditorLogic.tapTimeFromClientX(cx, r.left, sc.scrollLeft, this.headW(), this.zoomPps);
  };
  /* place the playhead at the current time (content coordinates) */
  Editor.positionPlayhead = function () {
    var ph = document.getElementById('edPlayhead');
    if (!ph) return;
    ph.style.left = Math.round(this.headW() + this.t * this.zoomPps) + 'px';
  };
  /* ============ UNIFIED TIMELINE (Phase 3): 4 lanes, one scroll, one playhead ============ */
  Editor.renderTimeline = function () {
    var self = this;
    var vTrack = document.getElementById('edTrackVideo');
    var aTrack = document.getElementById('edTrackAudio');
    var tTrack = document.getElementById('edTrackText');
    var oTrack = document.getElementById('edTrackOverlay');
    var fxTrack0 = document.getElementById('edTrackEffect');
    var inner = document.getElementById('edTlInner');
    var markers = document.getElementById('edMarkers');
    var p = this.project;
    if (!vTrack || !aTrack || !tTrack || !oTrack || !inner || !markers || !p) return;
    vTrack.innerHTML = ''; aTrack.innerHTML = ''; tTrack.innerHTML = ''; oTrack.innerHTML = '';
    if (fxTrack0) fxTrack0.innerHTML = '';
    markers.innerHTML = '';
    this._tlGeom = [];
    var pps = this.zoomPps, hw = this.headW();
    var L = window.EditorLogic;
    var tm = Store.timing(), total = tm.total;
    // time markers (shared ruler): inner coordinates = headW + t*pps
    var step = L.markerStep(pps), mhtml = '';
    for (var mt = 0; mt <= total + 0.01; mt += step) {
      mhtml += '<span class="ed2-marker" style="left:' + Math.round(hw + mt * pps) + 'px">' + L.fmtTime(mt) + '</span>';
    }
    markers.innerHTML = mhtml;
    var innerW = Math.max(Math.round(hw + total * pps + 120), 200);
    markers.style.width = innerW + 'px';
    inner.style.width = innerW + 'px';

    /* ---- VIDEO LANE: thumbnail strips, no cards ---- */
    if (!p || !p.clips.length) {
      vTrack.appendChild(this._addTile(function () { self.setTool('media'); }));
    } else {
      p.clips.forEach(function (c, i) {
        var it = tm.items[i]; if (!it) return;
        var playDur = Store.clipPlayDur(c);
        var gx = it.start * pps, gw = Math.max(40, Math.round(playDur * pps));
        self._tlGeom.push({ start: it.start, end: it.end, x: gx, w: gw });
        var blk = document.createElement('div');
        blk.className = 'clip-block' + (self.selClipId === c.id ? ' sel' : '');
        blk.style.left = Math.round(gx) + 'px';
        blk.style.width = Math.round(gw) + 'px';
        blk.setAttribute('data-id', c.id);
        var badgeIc = c.type === 'placeholder' ? '🎭' : c.type === 'video' ? '' : c.type === 'audio' ? '🎵' : '🖼';
        blk.innerHTML = (badgeIc ? '<span class="cbadge">' + badgeIc + '</span>' : '') +
          (c.reversed ? '<span class="cbadge rev">◀◀</span>' : '') + self.thumbStripHTML(c, gw) +
          (!c.url ? '<div class="relink">tap to re-link</div>' : '');
        if (self.trimModeId === c.id && c.url) {
          var hl = document.createElement('div'); hl.className = 'trim-handle l'; hl.title = 'Trim start';
          var hr = document.createElement('div'); hr.className = 'trim-handle r'; hr.title = 'Trim end';
          hl.addEventListener('pointerdown', function (e) { e.stopPropagation(); self.onTrimHandle(e, c, blk, 'l'); });
          hr.addEventListener('pointerdown', function (e) { e.stopPropagation(); self.onTrimHandle(e, c, blk, 'r'); });
          blk.appendChild(hl); blk.appendChild(hr);
        }
        // KEYFRAMES: ◇ diamonds on the selected clip's block
        if (self.selClipId === c.id && it) self._kfDiamonds(blk, c, it.start, it.end, pps);
        blk.addEventListener('pointerdown', function (e) { self.onCardDown(e, c, blk, i); });
        vTrack.appendChild(blk);
        // Phase 11: transition junction badge (tap → transition picker for this clip)
        if (i > 0) {
          (function (cc, bx) {
            var jb = document.createElement('div');
            var hasTr = cc.transitionIn && cc.transitionIn !== 'none';
            jb.className = 'tl-trans' + (hasTr ? ' on' : '');
            jb.style.left = Math.round(bx - 11) + 'px';
            jb.textContent = '⋈';
            jb.title = 'Transition into this clip';
            jb.addEventListener('click', function (e) {
              e.stopPropagation();
              self._transClipId = cc.id; self.setTool('transition');
            });
            vTrack.appendChild(jb);
          })(c, gx);
        }
        if (c.type === 'video' && c.url && !self.thumbStrips.get(c.id)) self.captureThumbStrip(c, gw);
      });
      // "+" tile at end of video track
      var add = document.createElement('div');
      add.className = 'tl-add';
      add.style.left = Math.round(total * pps + 8) + 'px';
      add.textContent = '＋'; add.title = 'Add media';
      add.addEventListener('click', function () { self.setTool('media'); });
      vTrack.appendChild(add);
    }

    /* ---- AUDIO LANE ---- */
    this._renderAudioLane(aTrack, tm, total, pps);
    /* ---- TEXT LANE ---- */
    this._renderTextLane(tTrack, pps);
    /* ---- OVERLAY LANE (single) ---- */
    this._renderOverlayLane(oTrack, pps);
    /* ---- EFFECT LANE (Phase 8) ---- */
    this._renderEffectLane(fxTrack0, pps);
    /* ---- CAPTIONS LANE (Phase 11) ---- */
    var cpTrack = document.getElementById('edTrackCaptions');
    if (cpTrack) { cpTrack.innerHTML = ''; this._renderCaptionsLane(cpTrack, pps); }

    this.renderClipStrip();
    this.positionPlayhead();
    this.ensurePlayheadVisible();
    this.renderEmptyImport();
    // keyframe panel follows the selected target
    if (this.tool === 'keyframe') this.renderPanel();
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  };

  /* small "+" tile for empty lanes (track-relative x) */
  Editor._addTile = function (cb, label) {
    var d = document.createElement('div');
    d.className = 'tl-add';
    d.style.left = '8px';
    d.textContent = label || '＋';
    d.addEventListener('click', cb);
    return d;
  };

  Editor._renderAudioLane = function (el, tm, total, pps) {
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
      block(g.x, g.w, '🎵 ' + esc(p.music.name || 'Music'), false, function () { self.setTool('audio'); });
    }
    tm.items.forEach(function (item) {
      var c = item.clip;
      if (c.type !== 'audio') return;
      hasAny = true;
      var g2 = L.laneGeom(item.start, item.end - item.start, pps);
      var d = block(g2.x, g2.w, '', self.selClipId === c.id, function () {
        self.selClipId = c.id; self.selOvId = null; self.selTxId = null; self.selFxId = null;
        self._kfSel = null;
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
    if (!hasAny) el.appendChild(this._addTile(function () { self.setTool('audio'); }, '＋ Add audio'));
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  };

  Editor._renderTextLane = function (el, pps) {
    var self = this, p = this.project, L = window.EditorLogic;
    if (!p.texts.length) {
      el.appendChild(this._addTile(function () { self.textDialog(); }));
      return;
    }
    p.texts.forEach(function (tx) {
      var g = L.laneGeom(tx.start, Math.max(0.5, tx.end - tx.start), pps);
      var d = document.createElement('div');
      d.className = 'tx-block' + (self.selTxId === tx.id ? ' sel' : '');
      d.style.left = Math.round(g.x) + 'px';
      d.style.width = Math.max(28, Math.round(g.w)) + 'px';
      d.textContent = 'T ' + String(tx.text || '').slice(0, 14);
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        self.selTxId = tx.id; self.selClipId = null; self.selOvId = null; self.selFxId = null;
        self._kfSel = null; self.renderKfBtn();
        self.renderTimeline(); self.textDialog(tx);
      });
      if (self.selTxId === tx.id) self._kfDiamonds(d, tx, tx.start, tx.end, pps);
      el.appendChild(d);
    });
  };

  Editor._renderOverlayLane = function (el, pps) {
    var self = this, p = this.project, L = window.EditorLogic;
    if (!p.overlays.length) {
      el.appendChild(this._addTile(function () { self.setTool('overlay'); }));
      return;
    }
    p.overlays.forEach(function (ov) {
      var g = L.laneGeom(ov.start, ov.dur, pps);
      var d = document.createElement('div');
      d.className = 'ov-block' + (self.selOvId === ov.id ? ' sel' : '');
      d.style.left = Math.round(g.x) + 'px';
      d.style.width = Math.max(28, Math.round(g.w)) + 'px';
      d.textContent = (ov.type === 'video' ? '🎞' : '🖼');
      d.title = String(ov.name || 'overlay');
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        self.selOvId = ov.id; self.selClipId = null; self.selTxId = null; self.selFxId = null;
        self._kfSel = null; self.renderKfBtn();
        self.renderTimeline(); self.setTool('overlay');
      });
      if (self.selOvId === ov.id) self._kfDiamonds(d, ov, ov.start, ov.start + ov.dur, pps);
      el.appendChild(d);
    });
  };

  /* Phase 8: EFFECT LANE — timeline segments for applied effects */
  Editor._renderEffectLane = function (el, pps) {
    var self = this, p = this.project, L = window.EditorLogic;
    var fxl = document.getElementById('edTrackEffect');
    if (fxl) fxl.innerHTML = '';
    el = fxl || el;
    if (!p.effects || !p.effects.length) {
      el.appendChild(this._addTile(function () { self.setTool('fx'); }));
      return;
    }
    p.effects.forEach(function (sg) {
      var g = L.laneGeom(sg.start, Math.max(0.5, sg.dur), pps);
      var d = document.createElement('div');
      d.className = 'fx-seg' + (self.selFxId === sg.id ? ' sel' : '');
      d.style.left = Math.round(g.x) + 'px';
      d.style.width = Math.max(28, Math.round(g.w)) + 'px';
      var def = window.FXLIB ? FXLIB.get(sg.fxId) : null;
      d.textContent = '✨ ' + String(sg.name || (def ? def.name : 'Effect')).slice(0, 16);
      d.title = String(sg.name || 'Effect');
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        self.selFxId = sg.id; self.selClipId = null; self.selTxId = null; self.selOvId = null;
        self._kfSel = null; self.renderKfBtn();
        self.renderTimeline(); self.setTool('fx_adjust');
      });
      // drag to move
      d.addEventListener('pointerdown', function (e) { self._fxSegDrag(e, sg, d, pps); });
      // trim handles on selected segment
      if (self.selFxId === sg.id) {
        var hl = document.createElement('div'); hl.className = 'trim-handle l'; hl.title = 'Trim start';
        var hr = document.createElement('div'); hr.className = 'trim-handle r'; hr.title = 'Trim end';
        hl.addEventListener('pointerdown', function (e) { e.stopPropagation(); self._fxSegTrim(e, sg, 'l', pps); });
        hr.addEventListener('pointerdown', function (e) { e.stopPropagation(); self._fxSegTrim(e, sg, 'r', pps); });
        d.appendChild(hl); d.appendChild(hr);
      }
      el.appendChild(d);
    });
  };

  /* Phase 11: hex color + opacity -> rgba() string */
  Editor._hexA = function (hex, op) {
    var h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, op == null ? 1 : op)) + ')';
  };

  /* Phase 11: captions lane — blocks positioned by time, tap to edit */
  Editor._renderCaptionsLane = function (el, pps) {
    var self = this, p = this.project, L = window.EditorLogic;
    if (!p.captions.length) {
      el.appendChild(this._addTile(function () { self.setTool('captions'); }));
      return;
    }
    p.captions.forEach(function (c) {
      var g = L.laneGeom(c.start, Math.max(0.5, c.end - c.start), pps);
      var d = document.createElement('div');
      d.className = 'cp-block' + (self._selCapId === c.id ? ' sel' : '');
      d.style.left = Math.round(g.x) + 'px';
      d.style.width = Math.max(28, Math.round(g.w)) + 'px';
      d.textContent = '💬 ' + String(c.text || '').slice(0, 16);
      d.title = String(c.text || 'Caption');
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        self._selCapId = c.id;
        self.renderTimeline(); self.captionDialog(c);
      });
      el.appendChild(d);
    });
  };

  /* Phase 11: caption edit dialog — text, timing sliders, style */
  Editor.captionDialog = function (c) {
    var self = this, st = c.style || { size: 1, color: '#ffffff', bg: '#000000', bgOp: 0.72, pos: 'bottom' };
    var total = Store.timing().total || 10;
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    App.modal('<h3>💬 Caption</h3>' +
      '<label class="lbl">Text</label><input type="text" id="cdT" value="' + esc(c.text) + '">' +
      '<div class="row"><div style="flex:1"><label class="lbl">Start: <span id="cdSV">' + c.start.toFixed(1) + 's</span></label>' +
      '<input type="range" id="cdS" min="0" max="' + total.toFixed(1) + '" step="0.1" value="' + c.start + '" style="width:100%"></div></div>' +
      '<div class="row"><div style="flex:1"><label class="lbl">End: <span id="cdEV">' + c.end.toFixed(1) + 's</span></label>' +
      '<input type="range" id="cdE" min="0" max="' + total.toFixed(1) + '" step="0.1" value="' + c.end + '" style="width:100%"></div></div>' +
      '<div class="row"><div style="flex:1"><label class="lbl">Size</label>' +
      '<input type="range" id="cdSize" min="0.6" max="2" step="0.1" value="' + (st.size || 1) + '" style="width:100%"></div></div>' +
      '<label class="lbl">Text color</label><div class="row" id="cdCol">' +
      ['#ffffff', '#000000', '#ffd60a', '#ff453a', '#0a84ff', '#30d158'].map(function (col) {
        return '<button class="sw" data-c="' + col + '" style="background:' + col + ';width:36px;height:36px;border-radius:50%;border:' + (st.color === col ? '3px solid #8B5CF6' : '1px solid #444') + '"></button>';
      }).join('') + '</div>' +
      '<label class="lbl">Position</label><div class="pills" id="cdPos">' +
      ['top', 'center', 'bottom'].map(function (p) {
        return '<button class="pill' + (st.pos === p ? ' on' : '') + '" data-p="' + p + '">' + p + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="cdOk" style="flex:1">Save</button>' +
      '<button class="btn danger" id="cdDel">Delete</button><button class="btn ghost" id="cdNo">Cancel</button></div>',
      function (root) {
        var col = st.color || '#ffffff', pos = st.pos || 'bottom';
        root.querySelector('#cdS').oninput = function () { root.querySelector('#cdSV').textContent = (+this.value).toFixed(1) + 's'; };
        root.querySelector('#cdE').oninput = function () { root.querySelector('#cdEV').textContent = (+this.value).toFixed(1) + 's'; };
        root.querySelectorAll('#cdCol .sw').forEach(function (b) {
          b.onclick = function () {
            col = b.getAttribute('data-c');
            root.querySelectorAll('#cdCol .sw').forEach(function (x) { x.style.border = '1px solid #444'; });
            b.style.border = '3px solid #8B5CF6';
          };
        });
        root.querySelectorAll('#cdPos .pill').forEach(function (b) {
          b.onclick = function () {
            pos = b.getAttribute('data-p');
            root.querySelectorAll('#cdPos .pill').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
          };
        });
        root.querySelector('#cdNo').onclick = App.closeModal;
        root.querySelector('#cdDel').onclick = function () {
          Captions.remove(c.id); self._selCapId = null;
          App.closeModal(); self.renderTimeline(); self.drawOnce(); self.renderPanel();
        };
        root.querySelector('#cdOk').onclick = function () {
          var t = root.querySelector('#cdT').value.trim();
          if (!t) { toast('Enter caption text.', true); return; }
          var s = +root.querySelector('#cdS').value, e = +root.querySelector('#cdE').value;
          if (e <= s) e = s + 0.5;
          Captions.update(c.id, {
            text: t, start: +s.toFixed(2), end: +e.toFixed(2),
            style: { size: +root.querySelector('#cdSize').value, color: col, bg: st.bg || '#000000', bgOp: st.bgOp == null ? 0.72 : st.bgOp, pos: pos }
          });
          self._selCapId = null;
          App.closeModal(); self.renderTimeline(); self.drawOnce(); self.renderPanel();
          toast('Caption saved.');
        };
      });
  };

  /* trim an effect segment's start/end via handles */
  Editor._fxSegTrim = function (e, sg, which, pps) {
    var self = this;
    if (e.button) return;
    var sx = e.clientX, oStart = sg.start, oDur = sg.dur, pid = e.pointerId;
    function mv(ev) {
      if (ev.pointerId !== pid) return;
      var dt = (ev.clientX - sx) / pps;
      if (which === 'l') {
        var ns = Math.max(0, Math.round((oStart + dt) * 100) / 100);
        var nd = Math.round((oDur - (ns - oStart)) * 100) / 100;
        if (nd >= 0.5) { sg.start = ns; sg.dur = nd; }
      } else {
        sg.dur = Math.max(0.5, Math.round((oDur + dt) * 100) / 100);
      }
      self.renderTimeline(); self.drawOnce();
    }
    function up() {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      self.snapshot(); Store.persist(); self.renderTimeline(); self.drawOnce(); self.renderPanel();
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };

  /* drag an effect segment along the timeline */
  Editor._fxSegDrag = function (e, sg, blk, pps) {
    var self = this;
    if (e.button) return;
    var sx = e.clientX, orig = sg.start, moved = false, pid = e.pointerId;
    function mv(ev) {
      if (ev.pointerId !== pid) return;
      var dt = (ev.clientX - sx) / pps;
      if (Math.abs(ev.clientX - sx) > 6) moved = true;
      if (moved) {
        sg.start = Math.max(0, Math.round((orig + dt) * 100) / 100);
        self.renderTimeline();
      }
    }
    function up(ev) {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (moved) { self.snapshot(); Store.persist(); self.renderTimeline(); self.drawOnce(); }
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  /* subtle "+" in preview when project is empty (not a card) */
  Editor.renderEmptyImport = function () {
    var wrap = document.getElementById('edPreviewWrap');
    var old = document.getElementById('edEmptyImport');
    if (old) old.remove();
    if (!wrap) return;
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
    var oldStarts = self._clipStarts(); // KEYFRAMES: resync after timing change
    function onMove(ev) {
      var dt = (ev.clientX - x0) / pps;
      var r = L.trimApply({ 'in': origIn, out: origOut, type: c.type, duration: c.duration }, which, dt);
      c.in = r['in']; c.out = r.out;
      var tm = Store.timing(), it = null;
      for (var i = 0; i < tm.items.length; i++) if (tm.items[i].clip.id === c.id) it = tm.items[i];
      if (it) {
        card.style.left = Math.round(it.start * pps) + 'px';
        card.style.width = Math.max(40, Math.round(Store.clipPlayDur(c) * pps)) + 'px';
      }
      self.drawOnce();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      self.snapshot();
      self._kfResyncClips(oldStarts);
      var tm2 = Store.timing();
      for (var i = 0; i < tm2.items.length; i++)
        if (tm2.items[i].clip.id === c.id) self._kfClipRangeFix(c, tm2.items[i].start, tm2.items[i].end);
      Store.persist();
      self.renderTimeline(); self.drawOnce(); self.updateTransport();
      if (self.tool === 'trim') self.renderPanel();
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /* tap = select clip + seek to tap position; long-press + drag = move clip.
     A simple tap never moves the clip: move starts only after LONGPRESS_MS
     with the finger still down. */
  Editor.onCardDown = function (e, c, card, idx) {
    var self = this, L = window.EditorLogic;
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
        if (Math.abs(dx) > L.TAP_MAX_PX) { moved = true; clear(); return; }
        return;
      }
      ev.preventDefault();
      card.style.transform = 'translateX(' + dx + 'px)';
      card.style.zIndex = '10';
      var geom = self._tlGeom || [];
      var gi = geom[idx] || { x: 0, w: 0 };
      var cx = gi.x + gi.w / 2 + dx;
      var to = window.EditorLogic.dropIndex(geom, cx, idx);
      card._dropTo = to;
      // insertion indicator line at the drop boundary
      var ind = document.getElementById('edDropInd');
      if (!ind) {
        ind = document.createElement('div');
        ind.id = 'edDropInd'; ind.className = 'tl-drop-ind';
        card.parentNode.appendChild(ind);
      }
      if (to === idx) { ind.style.display = 'none'; }
      else {
        var gt = geom[to];
        if (!gt) { ind.style.display = 'none'; }
        else {
          var ix = to < idx ? gt.x : gt.x + gt.w;
          ind.style.left = Math.round(ix) + 'px';
          ind.style.display = 'block';
        }
      }
    }
    function onUp(ev) {
      clear();
      card.style.transform = ''; card.style.zIndex = '';
      var ind = document.getElementById('edDropInd');
      if (ind) ind.style.display = 'none';
      if (dragging) {
        var to = card._dropTo != null ? card._dropTo : idx;
        card._dropTo = null;
        if (to !== idx) self.moveClipTo(idx, to);
        return;
      }
      if (moved) return; // it was a swipe — leave selection & playhead alone
      if (!c.url) { self.relinkClip(c.id); return; }
      // TAP: select this clip AND move the playhead to the exact tap position
      self.selClipId = c.id; self.selOvId = null; self.selTxId = null; self.selFxId = null;
      self._kfSel = null;
      if (self.trimModeId && self.trimModeId !== c.id) self.trimModeId = null;
      if (self.cropModeId && self.cropModeId !== c.id) self.exitCropMode(); // discard crop draft
      self.setTool(null);
      self.renderTimeline();
      var tapT = self.timelineTimeFromClientX(ev.clientX != null ? ev.clientX : x0);
      if (tapT != null) {
        var tm = Store.timing(), it = null;
        for (var i = 0; i < tm.items.length; i++) if (tm.items[i].clip.id === c.id) { it = tm.items[i]; break; }
        if (it) tapT = Math.max(it.start, Math.min(it.end - 0.01, tapT));
        tapT = Math.max(0, Math.min(tm.total, tapT));
        self.seek(tapT);
      } else {
        self.drawOnce(); self.updateTransport();
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    timer = setTimeout(function () {
      timer = null;
      if (moved) return;
      dragging = true;
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (e2) {}
    }, L.LONGPRESS_MS);
  };

  /* keep the playhead visible: pin timeline left edge at scrollLeft=0 while
     the playhead is in the left half of the viewport (CapCut-style);
     otherwise keep the playhead centered. */
  Editor.ensurePlayheadVisible = function () {
    var sc = document.getElementById('edTlScroll');
    if (!sc) return;
    var L = window.EditorLogic;
    var target = L.scrollForTime(this.t, sc.clientWidth || 320, this.zoomPps, this.headW());
    this._progScroll = true;
    try { if (Math.abs(sc.scrollLeft - target) > 1) sc.scrollLeft = Math.max(0, target); } catch (e) {}
    var self = this;
    setTimeout(function () { self._progScroll = false; }, 80);
  };
  Editor.centerPlayhead = function () { return this.ensurePlayheadVisible(); };

  /* bind once: scrub, playhead drag, pinch zoom, manual-scroll seek.
     Unified model: viewportX_of(t) = headW + t*pps - scrollLeft. */
  Editor.bindTimeline = function () {
    if (this._tlBound) return;
    this._tlBound = true;
    var self = this, L = window.EditorLogic;
    var sc = document.getElementById('edTlScroll');
    var inner = document.getElementById('edTlInner');
    var ph = document.getElementById('edPlayhead');
    if (!sc || !inner || !ph) return;
    var scrubbing = false;
    function seekFromClientX(cx) {
      var total = Store.timing().total; if (!total) return;
      var r = sc.getBoundingClientRect();
      var t = (sc.scrollLeft + (cx - r.left) - self.headW()) / self.zoomPps;
      self.seek(Math.max(0, Math.min(total, t)));
    }
    inner.addEventListener('pointerdown', function (e) {
      if (e.target.closest && (e.target.closest('.clip-block') || e.target.closest('#edPlayhead') || e.target.closest('.tl-add'))) return;
      // tapping empty timeline = move playhead only (selection stays); exits trim mode
      if (self.trimModeId) { self.trimModeId = null; self.renderTimeline(); }
      scrubbing = true; self._seeking = true; seekFromClientX(e.clientX);
    });
    window.addEventListener('pointermove', function (e) { if (scrubbing) seekFromClientX(e.clientX); });
    window.addEventListener('pointerup', function () { if (scrubbing) { scrubbing = false; self._seeking = false; self.ensurePlayheadVisible(); } });
    // drag the playhead itself: playhead follows the finger; settle on release
    var phDrag = null;
    ph.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      phDrag = true;
      if (self.playing) self.pause();
    });
    window.addEventListener('pointermove', function (e) {
      if (!phDrag) return;
      var total = Store.timing().total; if (!total) return;
      var r = sc.getBoundingClientRect();
      var t = (sc.scrollLeft + (e.clientX - r.left) - self.headW()) / self.zoomPps;
      self.seek(Math.max(0, Math.min(total, t)), { noScroll: true });
    });
    window.addEventListener('pointerup', function () { if (phDrag) { phDrag = null; self.ensurePlayheadVisible(); } });
    // manual scroll (not programmatic) = scrub to viewport center; pause if playing
    var scrollT = null;
    sc.addEventListener('scroll', function () {
      if (self._progScroll) return;
      if (scrollT) clearTimeout(scrollT);
      scrollT = setTimeout(function () {
        if (self.playing) self.pause();
        var total = Store.timing().total; if (!total) return;
        var t = L.timeFromScroll(sc.scrollLeft, sc.clientWidth || 320, self.zoomPps, total, self.headW());
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
    var shX = document.getElementById('edSheetX');
    var shB = document.getElementById('edSheetBackdrop');
    var shG = document.getElementById('edSheetGrip');
    if (shX) shX.onclick = function () { self.closeSheet(); };
    if (shB) shB.onclick = function () { self.closeSheet(); };
    if (shG) shG.onclick = function () { self.closeSheet(); };
    // keyframe quick-add button (◇) in transport
    var kfb = document.getElementById('edKf');
    if (kfb) kfb.onclick = function () { self.kfAdd(); };
    self.bindKfPreview();
  };

  Editor.selClip = function () { return this.selClipId ? this.findClip(this.selClipId) : null; };

  /* ================= clip ops ================= */
  Editor.moveClip = function (dir) {
    var p = this.project, c = this.selClip();
    if (!p || !c) { toast('Select a clip first.'); return; }
    var i = p.clips.indexOf(c), j = i + dir;
    if (j < 0 || j >= p.clips.length) return;
    var oldStarts = this._clipStarts();
    p.clips.splice(i, 1); p.clips.splice(j, 0, c);
    this.snapshot();
    this._kfResyncClips(oldStarts);
    Store.persist(); this.renderTimeline(); this.drawOnce();
  };
  Editor.deleteClip = function () {
    var p = this.project, c = this.selClip();
    if (!p || !c) { toast('Select a clip first.'); return; }
    var self = this;
    App.confirm('Delete this clip?', function (ok) {
      if (!ok) return;
      var oldStarts = self._clipStarts();
      p.clips = p.clips.filter(function (x) { return x.id !== c.id; });
      if (self.selClipId === c.id) self.selClipId = null;
      if (self.trimModeId === c.id) self.trimModeId = null;
      self.snapshot();
      self._kfResyncClips(oldStarts);
      Store.persist(); self.syncMedia(); self.renderTimeline(); self.drawOnce(); self.updateTransport();
      toast('Clip deleted.');
    });
  };
  Editor.splitAtPlayhead = function () {
    var p = this.project, L = window.EditorLogic;
    if (!p) return;
    var found = Store.clipAt(this.t);
    if (!found) { toast('Nothing to split — playhead is past the end.'); return; }
    var c = found.item.clip, idx = found.index;
    var r = L.splitAt(c, this.t, found.item.start);
    if (!r) { toast('Move the playhead a bit inside the clip to split.'); return; }
    var a = Object.assign({}, c, { id: Store.uid('clip'), out: r.a.out, name: c.name });
    var b = Object.assign({}, c, { id: Store.uid('clip'), 'in': r.b['in'], transitionIn: 'none' });
    // Phase 9: deep copy crop (Object.assign is shallow); reversed flag copies via assign
    [a, b].forEach(function (x) { if (c.crop) x.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h }; });
    var self = this;
    [a, b].forEach(function (x) { if (c.url) Store.mediaCache.set(x.id, c.url); x.url = c.url; });
    // KEYFRAMES: distribute by absolute time; add boundary keyframes at the
    // cut so the animation stays continuous across both new clips.
    (function () {
      var splitT = +self.t.toFixed(2);
      var ck = c.keyframes || [];
      a.keyframes = []; b.keyframes = [];
      if (!ck.length) return;
      function cp(kf) {
        var o = { t: kf.t, x: kf.x, y: kf.y, scale: kf.scale, rot: kf.rot, opacity: kf.opacity };
        if (kf.rw) { o.rw = kf.rw; o.rh = kf.rh; }
        return o;
      }
      ck.forEach(function (kf) { (kf.t < splitT ? a : b).keyframes.push(cp(kf)); });
      var bv = L.keyframeAt(ck, splitT);
      if (!bv) return;
      function mk(t) {
        var k = { t: t, x: +bv.x.toFixed(3), y: +bv.y.toFixed(3), scale: +bv.scale.toFixed(3), rot: +bv.rot.toFixed(1), opacity: +bv.opacity.toFixed(3) };
        if (bv.rw) { k.rw = bv.rw; k.rh = bv.rh; }
        return k;
      }
      if (L.kfFindAt(a.keyframes, splitT, 0.06) < 0) a.keyframes.push(mk(splitT));
      var bi = L.kfFindAt(b.keyframes, splitT, 0.06);
      if (bi < 0) L.kfSortedInsert(b.keyframes, mk(splitT));
      else b.keyframes[bi].t = splitT;
      a.keyframes.sort(function (x, y) { return x.t - y.t; });
    })();
    p.clips.splice(idx, 1, a, b);
    this.trimModeId = null;
    this.selClipId = a.id; // select the LEFT clip (contains the playhead position)
    this.snapshot(); Store.persist(); this.syncMedia(); this.renderTimeline(); this.drawOnce();
    toast('Clip split.');
  };
  Editor.trimSel = function (which, delta) {
    var c = this.selClip();
    if (!c) { toast('Select a clip first.'); return; }
    var oldStarts = this._clipStarts();
    if (which === 'in') c.in = Math.max(0, Math.min(c.in + delta, c.out - 0.25));
    else c.out = Math.min(c.duration, Math.max(c.out + delta, c.in + 0.25));
    c.in = +c.in.toFixed(2); c.out = +c.out.toFixed(2);
    this.snapshot();
    this._kfResyncClips(oldStarts);
    var tm = Store.timing();
    for (var i = 0; i < tm.items.length; i++)
      if (tm.items[i].clip.id === c.id) this._kfClipRangeFix(c, tm.items[i].start, tm.items[i].end);
    Store.persist(); this.renderTimeline(); this.drawOnce(); this.updateTransport(); this.renderPanel();
  };
  Editor.setTrimAtPlayhead = function (which) {
    var p = this.project;
    var found = Store.clipAt(this.t);
    if (!found) return;
    var c = found.item.clip;
    var oldStarts = this._clipStarts();
    var m = c.in + (this.t - found.item.start) * (c.speed || 1);
    this.selClipId = c.id;
    if (which === 'in') c.in = Math.max(0, Math.min(m, c.out - 0.25));
    else c.out = Math.min(c.duration, Math.max(m, c.in + 0.25));
    c.in = +c.in.toFixed(2); c.out = +c.out.toFixed(2);
    this.snapshot();
    this._kfResyncClips(oldStarts);
    var tm = Store.timing();
    for (var i = 0; i < tm.items.length; i++)
      if (tm.items[i].clip.id === c.id) this._kfClipRangeFix(c, tm.items[i].start, tm.items[i].end);
    Store.persist(); this.renderTimeline(); this.drawOnce(); this.updateTransport(); this.renderPanel();
    toast((which === 'in' ? 'In-point' : 'Out-point') + ' set at playhead.');
  };

  /* ================= KEYFRAME ENGINE (CapCut-style) =================
     Each animatable item (video/photo clip, overlay, text, sticker) may carry
     `keyframes: [{t, x, y, scale, rot, opacity, rw, rh}]`, t = absolute project
     seconds. clip|text: x/y = px offset from center at rw x rh canvas.
     overlay|sticker: x/y = fractions (native space). scale = multiplier,
     rot = degrees, opacity = 0..1. Interpolated per frame in the compositor,
     so preview AND export animate identically. */
  Editor.KF_EPS = 0.05;

  /* {kind:'clip'|'overlay'|'text'|'sticker', item, name} or null.
     Audio clips are not animatable. */
  Editor.kfTarget = function () {
    var p = this.project, i;
    var c = this.selClip();
    if (c && (c.type === 'video' || c.type === 'photo'))
      return { kind: 'clip', item: c, name: c.name || 'Clip' };
    if (p) {
      if (this.selOvId) {
        for (i = 0; i < p.overlays.length; i++)
          if (p.overlays[i].id === this.selOvId)
            return { kind: 'overlay', item: p.overlays[i], name: p.overlays[i].name || 'Overlay' };
      }
      if (this.selTxId) {
        for (i = 0; i < p.texts.length; i++)
          if (p.texts[i].id === this.selTxId)
            return { kind: 'text', item: p.texts[i], name: 'Text' };
      }
      if (this.selStickerId) {
        for (i = 0; i < (p.stickers || []).length; i++)
          if (p.stickers[i].id === this.selStickerId)
            return { kind: 'sticker', item: p.stickers[i], name: 'Sticker' };
      }
    }
    return null;
  };

  /* base (non-animated) props in the keyframe value space */
  Editor.kfBaseProps = function (kind, item) {
    if (kind === 'overlay')
      return { x: +item.x || 0, y: +item.y || 0, scale: +(item.scale || 0.4), rot: +(item.rotation || 0), opacity: item.opacity == null ? 1 : +item.opacity };
    if (kind === 'sticker')
      return { x: +item.x || 0, y: +item.y || 0, scale: 1, rot: 0, opacity: 1 };
    return { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 }; // clip | text: identity
  };

  /* effective props at time t: interpolated keyframes, else base */
  Editor.kfEffectiveProps = function (tg, t) {
    var kfs = tg.item.keyframes || [];
    if (kfs.length) return window.EditorLogic.keyframeAt(kfs, t == null ? this.t : t);
    return this.kfBaseProps(tg.kind, tg.item);
  };

  /* props for the draw path at time t on a W x H canvas.
     Returns null when nothing to animate (fast path). Includes live
     preview-drag offset when the item is being dragged. */
  Editor.kfForDraw = function (kind, item, t, W, H) {
    var kfs = item.keyframes;
    var has = !!(kfs && kfs.length);
    var drag = (this._kfDrag && this._kfDragTarget === item) ? this._kfDrag : null;
    if (!has && !drag) return null;
    var p;
    if (has) {
      p = window.EditorLogic.keyframeAt(kfs, t);
      p = { x: p.x, y: p.y, scale: p.scale, rot: p.rot, opacity: p.opacity, rw: p.rw, rh: p.rh };
    } else {
      var b = this.kfBaseProps(kind, item);
      p = { x: b.x, y: b.y, scale: b.scale, rot: b.rot, opacity: b.opacity, rw: W, rh: H };
    }
    if (drag) {
      if (kind === 'overlay' || kind === 'sticker') { p.x += drag.dx / W; p.y += drag.dy / H; }
      else { var rw = p.rw || W, rh = p.rh || H; p.x += drag.dx * (rw / W); p.y += drag.dy * (rh / H); }
      if (drag.scaleMul && drag.scaleMul !== 1) p.scale *= drag.scaleMul;
    }
    return p;
  };

  /* selected keyframe: {itemId, t} or null */
  Editor.kfSelected = function () {
    var tg = this.kfTarget();
    if (!tg || !this._kfSel || this._kfSel.itemId !== tg.item.id) return null;
    return this._kfSel.t;
  };

  /* ◇ button / strip: add keyframe at playhead capturing CURRENT values.
     If a keyframe already exists within EPS, select it instead (no dupes). */
  Editor.kfAdd = function () {
    var L = window.EditorLogic;
    var tg = this.kfTarget();
    if (!tg) { toast('Select a clip, text, overlay or sticker first.', true); return; }
    if (!this.canvas) return;
    var item = tg.item;
    item.keyframes = item.keyframes || [];
    var t = +this.t.toFixed(2);
    var idx = L.kfFindAt(item.keyframes, t, this.KF_EPS);
    if (idx >= 0) {
      this._kfSel = { itemId: item.id, t: item.keyframes[idx].t };
      toast('Keyframe selected — edit its values below.');
      if (this.tool !== 'keyframe') this.setTool('keyframe'); else this.renderPanel();
    } else {
      var cur = this.kfEffectiveProps(tg, t);
      var kf = {
        t: t,
        x: +cur.x.toFixed(3), y: +cur.y.toFixed(3),
        scale: +cur.scale.toFixed(3), rot: +cur.rot.toFixed(1),
        opacity: +L.clamp01(cur.opacity).toFixed(3)
      };
      if (tg.kind === 'clip' || tg.kind === 'text') { kf.rw = this.canvas.width; kf.rh = this.canvas.height; }
      L.kfSortedInsert(item.keyframes, kf);
      this._kfSel = { itemId: item.id, t: t };
      this.snapshot(); Store.persist();
      toast('◇ Keyframe added at ' + L.fmtTime(t) + ' (' + item.keyframes.length + ').');
    }
    this.renderTimeline(); this.drawOnce(); this.renderKfBtn();
    if (this.tool === 'keyframe') this.renderPanel();
  };

  /* set one animated property with the CapCut rule:
     playhead on existing KF (within EPS) -> update it; else create new KF. */
  Editor.kfSetProp = function (prop, value, commit) {
    var L = window.EditorLogic;
    var tg = this.kfTarget();
    if (!tg) return;
    if (!this.canvas) return;
    var item = tg.item;
    item.keyframes = item.keyframes || [];
    var t = +this.t.toFixed(2);
    var idx = L.kfFindAt(item.keyframes, t, this.KF_EPS);
    var kf;
    if (idx >= 0) {
      kf = item.keyframes[idx];
    } else {
      var cur = this.kfEffectiveProps(tg, t);
      kf = { t: t, x: cur.x, y: cur.y, scale: cur.scale, rot: cur.rot, opacity: cur.opacity };
      if (tg.kind === 'clip' || tg.kind === 'text') { kf.rw = this.canvas.width; kf.rh = this.canvas.height; }
      L.kfSortedInsert(item.keyframes, kf);
    }
    kf[prop] = value;
    this._kfSel = { itemId: item.id, t: kf.t };
    if (commit !== false) {
      this.snapshot(); Store.persist();
      this.renderTimeline(); this.renderKfBtn();
    }
    this.drawOnce();
    if (this.tool === 'keyframe' && commit !== false) this.renderPanel();
  };

  /* delete the keyframe at/near the playhead (or the selected one) */
  Editor.kfDelete = function () {
    var L = window.EditorLogic;
    var tg = this.kfTarget();
    if (!tg || !tg.item.keyframes || !tg.item.keyframes.length) { toast('No keyframes to delete.', true); return; }
    var kfs = tg.item.keyframes;
    var idx = L.kfFindAt(kfs, this.t, this.KF_EPS);
    if (idx < 0) {
      var sel = this.kfSelected();
      if (sel != null) idx = L.kfFindAt(kfs, sel, this.KF_EPS);
    }
    if (idx < 0) idx = L.kfNearest(kfs, this.t);
    var gone = kfs.splice(idx, 1)[0];
    this._kfSel = null;
    this.snapshot(); Store.persist();
    this.renderTimeline(); this.drawOnce(); this.renderKfBtn();
    if (this.tool === 'keyframe') this.renderPanel();
    toast('Keyframe at ' + L.fmtTime(gone.t) + ' deleted.');
  };

  /* ◀ Prev | Next ▶ navigation */
  Editor.kfNav = function (dir) {
    var tg = this.kfTarget();
    if (!tg || !tg.item.keyframes || !tg.item.keyframes.length) { toast('No keyframes yet — tap ◇ to add one.', true); return; }
    var r = window.EditorLogic.kfPrevNext(tg.item.keyframes, this.t);
    var nt = dir < 0 ? r.prev : r.next;
    if (nt == null) { toast(dir < 0 ? 'No previous keyframe.' : 'No next keyframe.', true); return; }
    this._kfSel = { itemId: tg.item.id, t: nt };
    this.seek(nt);
    if (this.tool === 'keyframe') this.renderPanel(); else this.renderTimeline();
  };

  /* commit a preview drag/pinch into the keyframe stream */
  Editor.kfCommitDrag = function () {
    var L = window.EditorLogic;
    var tg = this.kfTarget();
    var d = this._kfDrag, target = this._kfDragTarget;
    this._kfDrag = null; this._kfDragTarget = null; this._kfPinchD = 0; this._kfPointers = {};
    if (!this.canvas || !tg || !d || !target || target !== tg.item) { this.drawOnce(); return; }
    var moved = Math.abs(d.dx) >= 1 || Math.abs(d.dy) >= 1;
    var scaled = d.scaleMul && Math.abs(d.scaleMul - 1) >= 0.01;
    if (!moved && !scaled) { this.drawOnce(); return; }
    var item = tg.item;
    item.keyframes = item.keyframes || [];
    var t = +this.t.toFixed(2);
    var W = this.canvas.width, H = this.canvas.height;
    var cur = this.kfEffectiveProps(tg, t);
    var nx, ny;
    if (tg.kind === 'overlay' || tg.kind === 'sticker') { nx = cur.x + d.dx / W; ny = cur.y + d.dy / H; }
    else { var rw0 = cur.rw || W, rh0 = cur.rh || H; nx = cur.x + d.dx * (rw0 / W); ny = cur.y + d.dy * (rh0 / H); }
    var nscale = cur.scale * (scaled ? d.scaleMul : 1);
    var idx = L.kfFindAt(item.keyframes, t, this.KF_EPS);
    var kf;
    if (idx >= 0) {
      kf = item.keyframes[idx];
    } else {
      kf = { t: t, x: cur.x, y: cur.y, scale: cur.scale, rot: cur.rot, opacity: cur.opacity };
      if (tg.kind === 'clip' || tg.kind === 'text') { kf.rw = W; kf.rh = H; }
      L.kfSortedInsert(item.keyframes, kf);
    }
    if (moved) { kf.x = +nx.toFixed(3); kf.y = +ny.toFixed(3); }
    if (scaled) kf.scale = +Math.max(0.05, Math.min(8, nscale)).toFixed(3);
    if (tg.kind === 'clip' || tg.kind === 'text') { kf.rw = W; kf.rh = H; }
    this._kfSel = { itemId: item.id, t: kf.t };
    this.snapshot(); Store.persist();
    this.renderTimeline(); this.drawOnce(); this.renderKfBtn();
    if (this.tool === 'keyframe') this.renderPanel();
  };

  /* route an overlay dialog slider edit through the keyframe rule when the
     overlay already has keyframes; otherwise edit the base value (legacy).
     commit=false for live slider drags (snapshot happens on Done). */
  Editor.kfOverlayEdit = function (ov, key, value, commit) {
    var map = { scale: 'scale', opacity: 'opacity', rotation: 'rot', x: 'x', y: 'y' };
    var prop = map[key];
    if (ov.keyframes && ov.keyframes.length && prop) {
      var keep = this.selOvId; this.selOvId = ov.id;
      this.kfSetProp(prop, value, commit);
      this.selOvId = keep;
    } else {
      ov[key] = value;
      this.drawOnce();
    }
  };

  /* ---- keyframe-aware clip timing maintenance ----
     Keyframe t is absolute project time, so when a clip's project position
     changes we shift its keyframes by the same delta. */
  Editor._clipStarts = function () {
    var m = {};
    Store.timing().items.forEach(function (it) { m[it.clip.id] = it.start; });
    return m;
  };
  Editor._kfResyncClips = function (oldStarts) {
    var tm = Store.timing();
    tm.items.forEach(function (it) {
      var c = it.clip, os = oldStarts[c.id];
      if (os == null || !c.keyframes || !c.keyframes.length) return;
      var d = it.start - os;
      if (Math.abs(d) > 0.001) {
        c.keyframes.forEach(function (kf) { kf.t = +(kf.t + d).toFixed(2); });
        c.keyframes.sort(function (a, b) { return a.t - b.t; });
      }
    });
  };
  /* drop keyframes outside [start, end] (after trim/speed) */
  Editor._kfClipRangeFix = function (clip, start, end) {
    if (!clip.keyframes || !clip.keyframes.length) return;
    clip.keyframes = clip.keyframes.filter(function (kf) { return kf.t >= start - 0.01 && kf.t <= end + 0.01; });
  };

  /* ◇ transport button visibility */
  Editor.renderKfBtn = function () {
    var b = document.getElementById('edKf');
    if (!b) return;
    var tg = this.kfTarget();
    b.style.display = tg ? '' : 'none';
    if (tg) b.classList.toggle('on', !!(tg.item.keyframes && tg.item.keyframes.length));
  };

  /* DOM sticker layer: apply keyframe animation in preview (stickers are DOM,
     not canvas, in preview; export draws them on canvas) */
  Editor.updateStickerKFDom = function () {
    var layer = document.getElementById('edStickerLayer');
    if (!layer || !this.project || !this.canvas) return;
    var self = this, W = this.canvas.width, H = this.canvas.height;
    (this.project.stickers || []).forEach(function (s) {
      var el = layer.querySelector('[data-id="' + s.id + '"]');
      if (!el) return;
      var kfp = self.kfForDraw('sticker', s, self.t, W, H);
      if (!kfp) { el.style.transform = ''; el.style.opacity = ''; return; }
      var parts = [];
      if (kfp.rot) parts.push('rotate(' + kfp.rot.toFixed(1) + 'deg)');
      if (kfp.scale && Math.abs(kfp.scale - 1) > 0.001) parts.push('scale(' + kfp.scale.toFixed(3) + ')');
      el.style.transform = parts.join(' ');
      el.style.opacity = window.EditorLogic.clamp01(kfp.opacity);
      // position override while keyframes exist (fractions -> %)
      el.style.left = (kfp.x * 100) + '%';
      el.style.top = (kfp.y * 100) + '%';
    });
  };

  /* render ◇ diamonds for an item's keyframes inside its timeline block.
     kfAbsT = absolute project time; blockStart = item's project start. */
  Editor._kfDiamonds = function (blk, item, blockStart, blockEnd, pps) {
    var self = this, L = window.EditorLogic;
    var kfs = item.keyframes;
    if (!kfs || !kfs.length) return;
    kfs.forEach(function (kf) {
      if (kf.t < blockStart - 0.01 || kf.t > blockEnd + 0.01) return;
      var dm = document.createElement('div');
      var sel = self._kfSel && self._kfSel.itemId === item.id && Math.abs(self._kfSel.t - kf.t) < self.KF_EPS + 0.001;
      dm.className = 'kf-dia' + (sel ? ' sel' : '');
      dm.style.left = Math.round((kf.t - blockStart) * pps) + 'px';
      dm.title = '◇ ' + L.fmtTime(kf.t);
      dm.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      dm.addEventListener('click', function (e) {
        e.stopPropagation();
        self._kfSel = { itemId: item.id, t: kf.t };
        self.seek(kf.t);
        if (self.tool === 'keyframe') self.renderPanel(); else self.renderTimeline();
      });
      blk.appendChild(dm);
    });
  };

  /* preview drag/pinch on the canvas -> keyframe-tracked transform.
     Single-finger drag = position; two-finger pinch = scale. */
  Editor.bindKfPreview = function () {
    var self = this;
    var cv = document.getElementById('edCanvas');
    if (!cv || cv._kfBound) return;
    cv._kfBound = true;
    self._kfPointers = {};
    function cssScale() {
      var r = cv.getBoundingClientRect();
      return { x: cv.width / Math.max(1, r.width), y: cv.height / Math.max(1, r.height) };
    }
    cv.addEventListener('pointerdown', function (e) {
      if (self.cropModeId) return; // Phase 9: crop mode owns canvas gestures
      var tg = self.kfTarget();
      if (!tg || self.placingSticker) return;
      try { cv.setPointerCapture(e.pointerId); } catch (e2) {}
      self._kfPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var n = Object.keys(self._kfPointers).length;
      if (n === 1) {
        self._kfDragTarget = tg.item;
        self._kfDrag = { dx: 0, dy: 0, scaleMul: 1, lastX: e.clientX, lastY: e.clientY };
        self._kfPinchD = 0;
      } else if (n === 2) {
        var pts = Object.keys(self._kfPointers).map(function (k) { return self._kfPointers[k]; });
        self._kfPinchD = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!self._kfPointers[e.pointerId] || !self._kfDrag) return;
      self._kfPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var n = Object.keys(self._kfPointers).length;
      var sc = cssScale();
      if (n === 1) {
        var d = self._kfDrag;
        d.dx += (e.clientX - d.lastX) * sc.x;
        d.dy += (e.clientY - d.lastY) * sc.y;
        d.lastX = e.clientX; d.lastY = e.clientY;
      } else if (n === 2 && self._kfPinchD > 0) {
        var pts2 = Object.keys(self._kfPointers).map(function (k) { return self._kfPointers[k]; });
        var nd = Math.hypot(pts2[0].x - pts2[1].x, pts2[0].y - pts2[1].y);
        if (nd > 0) {
          self._kfDrag.scaleMul *= nd / self._kfPinchD;
          self._kfPinchD = nd;
        }
      }
      self.drawOnce();
    });
    function end(e) {
      if (self._kfPointers[e.pointerId]) delete self._kfPointers[e.pointerId];
      if (Object.keys(self._kfPointers).length === 0 && self._kfDrag) self.kfCommitDrag();
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  };

  Editor.updateUndoRedo = function () {
    var eu = document.getElementById('edUndo'), er = document.getElementById('edRedo');
    if (eu) eu.disabled = !Store.canUndo();
    if (er) er.disabled = !Store.canRedo();
  };
  Editor.doUndo = function () {
    if (Store.undo()) {
      this.project = Store.current;
      this.selClipId = null; this.trimModeId = null; this._kfSel = null; this.cropModeId = null; this._cropDraft = null;
      this.sizeCanvas(); this.syncMedia();
      this.renderTimeline(); this.renderStickers(); this.drawOnce(); this.updateTransport(); this.renderPanel();
      var edNameEl = document.getElementById('edName');
      if (edNameEl && this.project) edNameEl.textContent = this.project.name;
    }
    this.updateUndoRedo();
  };
  Editor.doRedo = function () {
    if (Store.redo()) {
      this.project = Store.current;
      this.selClipId = null; this.trimModeId = null; this._kfSel = null; this.cropModeId = null; this._cropDraft = null;
      this.sizeCanvas(); this.syncMedia();
      this.renderTimeline(); this.renderStickers(); this.drawOnce(); this.updateTransport(); this.renderPanel();
      var edNameEl = document.getElementById('edName');
      if (edNameEl && this.project) edNameEl.textContent = this.project.name;
    }
    this.updateUndoRedo();
  };
})();
