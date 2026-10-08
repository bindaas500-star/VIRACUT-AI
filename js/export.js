/* ViraCut AI — export.js
   Real export: replays the project in real time onto an offscreen canvas
   (720p free / 1080p pro), captures canvas + mixed audio via MediaRecorder,
   produces a downloadable .webm. Free plan gets a "ViraCut AI" watermark. */
(function () {
  'use strict';

  function pickMime() {
    var cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', ''];
    for (var i = 0; i < cands.length; i++) {
      try { if (!cands[i] || MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (e) {}
    }
    return '';
  }

  var Exporter = {
    exporting: false, _cancel: false,

    cancelExport: function () { this._cancel = true; },

    export: function (opts, onProgress) {
      var self = this;
      // backward compat: export(onProgress)
      if (typeof opts === 'function') { onProgress = opts; opts = {}; }
      opts = opts || {};
      return new Promise(function (resolve, reject) {
        if (self.exporting) return reject(new Error('Export already running.'));
        var p = Editor.project;
        if (!p) return reject(new Error('No project open.'));
        var tm = Store.timing();
        if (!tm.items.length || tm.total < 0.3) return reject(new Error('Add clips first — nothing to export.'));
        if (typeof MediaRecorder === 'undefined') return reject(new Error('MediaRecorder not supported on this device.'));

        // make sure extracted-audio buffers are decoded before we start
        Editor.ensureAudioBuffers().then(runExport).catch(function (e) { reject(e); });

        function runExport() {
        self.exporting = true; self._cancel = false;
        Editor.pause();

        var size = opts.size || Plans.exportSize(p.aspect);
        var fps = opts.fps || 30;
        var vbps = opts.videoBps || 6000000;
        var cv = document.createElement('canvas');
        cv.width = size.w; cv.height = size.h;
        var g = cv.getContext('2d');

        var eng = AudioLab.Engine;
        var dest = eng.exportDest();
        eng.setMonitorLevel(0); // silent while rendering
        Editor.vidEls.forEach(function (el) { eng.routeVideo(el, true); });

        // voices → export stream (music + takes + extracted audio clips)
        var voices = [];
        if (p.music && p.music.buffer) voices.push({ buffer: p.music.buffer, volume: p.music.volume, loop: true, offset: 0 });
        p.voiceovers.forEach(function (v) { if (v.buffer) voices.push({ buffer: v.buffer, volume: v.volume, loop: false, offset: 0 }); });
        tm.items.forEach(function (item) {
          var c = item.clip;
          if (c.type !== 'audio') return;
          var buf = Editor.audioBufs.get(c.id);
          if (!buf) return;
          voices.push({
            buffer: buf, volume: (c.volume == null ? 1 : c.volume), loop: false,
            offset: c.in || 0, at: item.start, dur: window.EditorLogic ? EditorLogic.playDur(c) : 0,
            fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0
          });
        });
        if (voices.length) eng.start(voices, true, 0);

        var stream = cv.captureStream(fps);
        dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
        var mime = pickMime();
        var rec;
        try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: vbps } : undefined); }
        catch (e) { cleanup(); return reject(new Error('Could not start recorder: ' + e.message)); }

        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        var stopped = new Promise(function (res) { rec.onstop = res; });
        rec.start(250);

        var t = 0, total = tm.total, last = performance.now(), finished = false;

        function driveVideos() {
          var found = Store.clipAt(t);
          Editor.vidEls.forEach(function (el, id) {
            try {
              var isCur = found && found.item.clip.id === id;
              if (isCur) {
                var c = found.item.clip;
                el.playbackRate = c.speed || 1;
                var exp = window.EditorLogic ? window.EditorLogic.clipVideoTime(c, found.item.start, t) : (c.in + (t - found.item.start) * (c.speed || 1));
                if (c.reversed) {
                  /* Phase 9: reversed clips are seek-driven in export too */
                  if (!el.paused) el.pause();
                  if (el.readyState >= 1 && Math.abs(el.currentTime - exp) > 0.12) el.currentTime = Math.min(exp, c.out - 0.05);
                } else {
                  if (el.paused) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); }
                  if (el.readyState >= 1 && Math.abs(el.currentTime - exp) > 0.4) el.currentTime = Math.min(exp, c.out - 0.05);
                }
              } else if (!el.paused) el.pause();
            } catch (e) {}
          });
          // per-clip volume / fade / mute baked into export via the gain node
          Editor.vidEls.forEach(function (el, id) {
            try {
              var mon = el._audMon;
              if (!mon) return;
              var target = 0;
              if (found && found.item.clip.id === id && window.EditorLogic) {
                target = EditorLogic.fadeGain(found.item.clip, t - found.item.start);
              }
              if (Math.abs(mon.gain.value - target) > 0.02) mon.gain.value = target;
            } catch (e) {}
          });
        }
        function watermark() {
          if (!Plans.watermark()) return;
          g.save();
          g.font = '700 ' + Math.round(size.w * 0.035) + 'px sans-serif';
          g.textAlign = 'right';
          g.fillStyle = 'rgba(255,255,255,.55)';
          g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
          g.fillText('ViraCut AI', size.w - 18, size.h - 20);
          g.restore();
        }
        function frame(now) {
          if (finished) return;
          if (self._cancel) { finish(true); return; }
          var dt = (now - last) / 1000; last = now;
          t += dt;
          if (t >= total) { t = total; finish(false); return; }
          driveVideos();
          Editor.composite(g, size.w, size.h, t, true);
          watermark();
          if (onProgress) { try { onProgress(t / total); } catch (e) {} }
          requestAnimationFrame(frame);
        }
        function finish(cancelled) {
          finished = true;
          if (!cancelled) {
            driveVideos();
            Editor.composite(g, size.w, size.h, total - 0.03, true);
            watermark();
          }
          if (onProgress) { try { onProgress(1); } catch (e) {} }
          setTimeout(function () {
            try { rec.stop(); } catch (e) {}
            stopped.then(function () {
              var blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
              var url = URL.createObjectURL(blob);
              var wasCancel = self._cancel;
              cleanup();
              if (wasCancel) reject(new Error('Export cancelled.'));
              else resolve({ url: url, blob: blob, size: size, fps: fps, vbps: vbps });
            });
          }, 400);
        }
        function cleanup() {
          self.exporting = false;
          eng.stop();
          eng.setMonitorLevel(1);
          Editor.vidEls.forEach(function (el) { eng.routeVideo(el, false); try { el.pause(); } catch (e) {} });
          stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e) {} });
        }

        // draw first frame immediately so the video isn't black at start
        driveVideos();
        Editor.composite(g, size.w, size.h, 0, true);
        watermark();
        requestAnimationFrame(function (now) { last = now; requestAnimationFrame(frame); });
        } // end runExport
      });
    },

    download: function (url, name) {
      var a = document.createElement('a');
      a.href = url;
      a.download = (name || 'viracut').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.webm';
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); }, 500);
    }
  };

  window.Exporter = Exporter;
})();
