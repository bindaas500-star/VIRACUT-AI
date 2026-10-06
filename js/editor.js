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

    /* ================= open / teardown ================= */
    open: function (id) {
      var p = Store.openProject(id);
      if (!p) { toast('Project not found.', true); return; }
      this.project = p;
      this.vidEls = new Map(); this.imgEls = new Map(); this.stills = new Map();
      this.t = 0; this.playing = false; this.selClipId = null; this.tool = null;
      this.audioKept = null; this.placingSticker = null; this.selStickerId = null;
      this.canvas = document.getElementById('edCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.sizeCanvas();
      document.getElementById('edName').textContent = p.name;
      this.syncMedia();
      this.renderTools(); this.setTool(null); this.renderTimeline(); this.renderStickers(); this.updateUndoRedo();
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
      // drop stale
      this.vidEls.forEach(function (el, id) { if (!seen[id]) { try { el.pause(); } catch (e) {} self.vidEls.delete(id); } });
      this.imgEls.forEach(function (im, id) { if (!seen[id]) self.imgEls.delete(id); });
    },
    makeVideoEl: function (clip) {
      var self = this;
      var el = document.createElement('video');
      el.src = clip.url; el.preload = 'auto'; el.playsInline = true;
      el.muted = false;
      el.addEventListener('loadeddata', function () { self.captureStill(clip); });
      this.vidEls.set(clip.id, el);
    },
    captureStill: function (clip) {
      // end-frame still for crossfade + timeline thumb fallback
      var self = this;
      try {
        if (clip.type === 'video') {
          var el = this.vidEls.get(clip.id);
          if (!el) return;
          var done = function () {
            try {
              var cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
              cv.getContext('2d').drawImage(el, 0, 0, 96, 54);
              self.stills.set(clip.id, cv.toDataURL('image/jpeg', 0.6));
              self.renderTimeline();
            } catch (e) {}
            el.removeEventListener('seeked', done);
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
      var tm = Store.timing();
      if (!this.project || !tm.items.length) { toast('Import media first.'); return; }
      if (this.t >= tm.total - 0.05) this.t = 0;
      this.playing = true;
      document.getElementById('edPlay').textContent = '⏸';
      this.startAudio();
      this.lastTs = performance.now();
      var self = this;
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
      this.rafId = requestAnimationFrame(loop);
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
    },
    startAudio: function () {
      var p = this.project, voices = [], kept = this.audioKept, ki = 0;
      if (p.music && p.music.buffer) {
        var mo = kept && kept[0] && kept[0].buffer === p.music.buffer ? kept[0].offset : 0;
        voices.push({ buffer: p.music.buffer, volume: p.music.volume, loop: true, offset: mo });
        ki = 1;
      }
      p.voiceovers.forEach(function (v) {
        if (!v.buffer) return;
        var k = kept && kept[ki];
        var off = (k && k.buffer === v.buffer) ? k.offset : 0;
        voices.push({ buffer: v.buffer, volume: v.volume, loop: false, offset: off });
        ki++;
      });
      if (voices.length) AudioLab.Engine.start(voices, false);
      this.audioKept = null;
    },
    updateTransport: function () {
      var total = Store.timing().total;
      document.getElementById('edTime').textContent = this.t.toFixed(1) + 's / ' + total.toFixed(1) + 's';
      document.getElementById('edDur').textContent = total.toFixed(1) + 's total';
      if (!this._seeking) document.getElementById('edSeek').value = total ? Math.round(this.t / total * 1000) : 0;
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
      this.drawClipMedia(g, item.clip, item, W, H, t, 1);
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
      // text overlays
      var self = this;
      p.texts.forEach(function (tx) {
        if (t >= tx.start && t <= tx.end) self.drawText(g, tx, W, H);
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
      g.restore();
    },
    drawClipMedia: function (g, clip, item, W, H, t, alpha) {
      g.save();
      g.globalAlpha = alpha == null ? 1 : alpha;
      g.filter = FILTERS[this.project.filter] || 'none';
      var rot = ((clip.rotation || 0) % 360 + 360) % 360;
      g.translate(W / 2, H / 2);
      if (rot) g.rotate(rot * Math.PI / 180);
      var swap = rot === 90 || rot === 270;
      var dw = swap ? H : W, dh = swap ? W : H;
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
          p.clips.push({ id: id, type: 'video', name: f.name, url: url, duration: dur, in: 0, out: dur, speed: 1, rotation: 0, fit: 'cover', transitionIn: 'none' });
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

  Editor.relinkClip = function (clipId) {
    var self = this;
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/*,image/*';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var url = URL.createObjectURL(f);
      var c = self.findClip(clipId);
      if (c) { c.url = url; Store.mediaCache.set(clipId, url); }
      self.snapshot(); Store.persist(); self.syncMedia(); self.renderTimeline(); self.drawOnce();
      toast('Media re-linked.');
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
  Editor.renderTimeline = function () {
    var self = this, el = document.getElementById('edTimeline');
    var p = this.project;
    el.innerHTML = '';
    if (!p || !p.clips.length) {
      el.innerHTML = '<div class="empty" style="min-width:100%">No clips yet — use Media to import.</div>';
      return;
    }
    p.clips.forEach(function (c, i) {
      var card = document.createElement('div');
      card.className = 'clip-card' + (self.selClipId === c.id ? ' sel' : '');
      var dur = Store.clipPlayDur(c).toFixed(1) + 's';
      var thumb;
      if (!c.url) thumb = '<div class="thumb"></div>';
      else if (c.type === 'video') {
        var st = self.stills.get(c.id);
        thumb = st ? '<div class="thumb"><img src="' + st + '"></div>'
          : '<div class="thumb"><video src="' + c.url + '" muted preload="metadata" playsinline></video></div>';
      } else thumb = '<div class="thumb"><img src="' + c.url + '"></div>';
      card.innerHTML = '<span class="badge">' + (c.type === 'video' ? '🎞' : '🖼') + ' ' + (i + 1) + '</span>' + thumb +
        '<div class="meta">' + esc(c.name) + ' · ' + dur + (c.speed !== 1 ? ' · ' + c.speed + 'x' : '') + (c.transitionIn === 'crossfade' ? ' · ⋈' : '') + '</div>' +
        (!c.url ? '<div class="relink">Media missing<br>(tap to re-link)</div>' : '');
      card.onclick = function () {
        if (!c.url) { self.relinkClip(c.id); return; }
        self.selClipId = c.id;
        self.renderTimeline();
        if (self.tool === 'trim' || self.tool === 'speed' || self.tool === 'rotate' || self.tool === 'transition') self.renderPanel();
      };
      el.appendChild(card);
    });
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
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
    { id: 'media', label: '📥 Media' }, { id: 'trim', label: '✂️ Trim' },
    { id: 'split', label: '🔪 Split' }, { id: 'speed', label: '⏩ Speed' },
    { id: 'rotate', label: '🔄 Rotate' }, { id: 'filter', label: '🎨 Filter' },
    { id: 'transition', label: '⋈ Trans.' }, { id: 'text', label: '🔤 Text' },
    { id: 'sticker', label: '😀 Sticker' }, { id: 'captions', label: '💬 Captions' },
    { id: 'audio', label: '🎵 Audio' }
  ];

  Editor.renderTools = function () {
    var self = this, el = document.getElementById('edTools');
    el.innerHTML = '';
    TOOLS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tool-btn' + (self.tool === t.id ? ' on' : '');
      b.textContent = t.label;
      b.onclick = function () {
        if (t.id === 'split') { self.splitAtPlayhead(); return; }
        self.setTool(self.tool === t.id ? null : t.id);
      };
      el.appendChild(b);
    });
  };
  Editor.setTool = function (id) {
    this.tool = id; this.placingSticker = null;
    document.getElementById('edStickerLayer').style.pointerEvents = 'none';
    this.renderTools(); this.renderPanel();
  };

  Editor.renderPanel = function () {
    var el = document.getElementById('edPanel');
    var fn = this['panel_' + this.tool];
    el.innerHTML = '';
    if (!fn) { el.innerHTML = '<p class="hint">Pick a tool above, or import media to begin.</p>'; return; }
    fn.call(this, el);
    this.updateUndoRedo();
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }

  /* ---------- MEDIA ---------- */
  Editor.panel_media = function (el) {
    var self = this;
    el.appendChild(h(
      '<h4>📥 Import media</h4>' +
      '<div class="row"><button class="btn primary sm" id="mPick">＋ Videos / Photos</button></div>' +
      '<p class="muted" style="margin-top:8px">MP4 / WebM / JPG / PNG work best. Files stay on this device.</p>' +
      (this.project.clips.length ?
        '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="mLeft">◀ Move clip</button>' +
        '<button class="btn ghost sm" id="mRight">Move clip ▶</button>' +
        '<button class="btn danger sm" id="mDel">Delete clip</button></div>' : '')
    ));
    el.querySelector('#mPick').onclick = function () { document.getElementById('edFileInput').click(); };
    var l = el.querySelector('#mLeft'), r = el.querySelector('#mRight'), d = el.querySelector('#mDel');
    if (l) l.onclick = function () { self.moveClip(-1); };
    if (r) r.onclick = function () { self.moveClip(1); };
    if (d) d.onclick = function () { self.deleteClip(); };
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
    var d = h('<h4>⏩ Speed — ' + esc(c.name) + '</h4><div class="pills" id="spPills"></div><p class="muted" style="margin-top:8px">Speed changes clip length on the timeline.</p>');
    el.appendChild(d);
    [0.5, 1, 1.5, 2].forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'pill' + (c.speed === s ? ' on' : ''); b.textContent = s + 'x';
      b.onclick = function () {
 c.speed = s; self.snapshot(); Store.persist();
        self.renderTimeline(); self.drawOnce(); self.updateTransport(); self.renderPanel();
      };
      d.querySelector('#spPills').appendChild(b);
    });
  };

  /* ---------- ROTATE / FIT ---------- */
  Editor.panel_rotate = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    el.appendChild(h(
      '<h4>🔄 Rotate & Fit — ' + esc(c.name) + '</h4>' +
      '<div class="row"><button class="btn ghost sm" id="rL">⟲ 90°</button>' +
      '<button class="btn ghost sm" id="rR">⟳ 90°</button>' +
      '<button class="btn ghost sm" id="rFit">' + (c.fit === 'cover' ? 'Fit: Cover' : 'Fit: Contain') + '</button></div>' +
      '<p class="muted" style="margin-top:8px">Rotation: ' + (c.rotation || 0) + '°</p>'
    ));
    function rot(dgr) { c.rotation = (((c.rotation || 0) + dgr) % 360 + 360) % 360; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); }
    el.querySelector('#rL').onclick = function () { rot(-90); };
    el.querySelector('#rR').onclick = function () { rot(90); };
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
