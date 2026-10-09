/* ViraCut AI — audio.js
   - Music file import (decoded to buffer, volume control)
   - Mic voiceover recording via MediaRecorder (list of takes, per-take volume)
   - AudioEngine: mixes music + voiceover takes during preview, and can
     route everything into a MediaStreamDestination for export. */
(function () {
  'use strict';

  var ctx = null;
  function ac() {
    if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ============ music ============ */
  var Music = {
    set: function (file, project) {
      if (!file || !project) return;
      var url = URL.createObjectURL(file);
      Store.mediaCache.set('music_' + project.id, url);
      project.music = { name: file.name, url: url, volume: 0.6, buffer: null };
      var c;
      try { c = ac(); } catch (e) { toast('Audio not supported on this device.', true); return; }
      file.arrayBuffer().then(function (ab) { return c.decodeAudioData(ab); }).then(function (buf) {
        if (project.music) project.music.buffer = buf;
        toast('Music loaded: ' + file.name);
 Store.snapshot(); Store.persist();
        if (window.Editor) Editor.renderAudioPanel();
      }).catch(function () { toast('Could not decode audio file.', true); });
    },
    clear: function (project) {
      if (!project) return;
      project.music = null;
      Store.snapshot(); Store.persist();
    }
  };

  /* ============ voiceover recorder ============ */
  var Voice = {
    rec: null, chunks: [], recStart: 0,
    recording: function () { return !!this.rec; },
    start: function () {
      var self = this;
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        self.chunks = [];
        var mr = new MediaRecorder(stream);
        self.rec = mr; self.recStart = Date.now();
        mr.ondataavailable = function (e) { if (e.data && e.data.size) self.chunks.push(e.data); };
        mr.start();
        // stop mic tracks when done is handled in stop()
        self._stream = stream;
        return true;
      }).catch(function () {
        toast('Mic access denied or unavailable.', true);
        return false;
      });
    },
    stop: function (project) {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.rec) return resolve(null);
        var mr = self.rec;
        mr.onstop = function () {
          if (self._stream) self._stream.getTracks().forEach(function (t) { t.stop(); });
          self.rec = null;
          var blob = new Blob(self.chunks, { type: mr.mimeType || 'audio/webm' });
          var url = URL.createObjectURL(blob);
          var take = { id: Store.uid('vo'), name: 'Take ' + ((project && project.voiceovers ? project.voiceovers.length : 0) + 1), url: url, volume: 0.9, buffer: null };
          Store.mediaCache.set(take.id, url);
          blob.arrayBuffer().then(function (ab) { return ac().decodeAudioData(ab); }).then(function (buf) {
            take.buffer = buf;
          }).catch(function () {});
          if (project && project.voiceovers) {
            project.voiceovers.push(take);
            Store.snapshot(); Store.persist();
          }
          resolve(take);
        };
        try { mr.stop(); } catch (e) {
          // recorder already inactive — release mic and bail out cleanly
          self.rec = null;
          if (self._stream) { try { self._stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {} self._stream = null; }
          resolve(null);
        }
      });
    },
    remove: function (project, id) {
      project.voiceovers = project.voiceovers.filter(function (v) { return v.id !== id; });
      Store.snapshot(); Store.persist();
    }
  };

  /* ============ playback engine (preview + export) ============ */
  // voices: [{buffer, volume, loop}]
  var Engine = {
    _nodes: [], _monitor: null, _exportDest: null,
    context: ac,
    monitor: function () {
      var c = ac();
      if (!this._monitor) { this._monitor = c.createGain(); this._monitor.gain.value = 1; this._monitor.connect(c.destination); }
      return this._monitor;
    },
    exportDest: function () {
      var c = ac();
      if (!this._exportDest) this._exportDest = c.createMediaStreamDestination();
      return this._exportDest;
    },
    setMonitorLevel: function (v) { this.monitor().gain.value = v; },
    // start all voices; toExport=true routes into the export stream (monitor muted separately)
    // voices: [{buffer, volume, loop, offset, at (project-time start), dur, fadeIn, fadeOut}]
    // baseTime = current project time in seconds (voices with at>baseTime start later)
    start: function (voices, toExport, baseTime) {
      this.stop();
      var c = ac(), mon = this.monitor(), dest = toExport ? this.exportDest() : null;
      var self = this;
      baseTime = baseTime || 0;
      voices.forEach(function (v) {
        if (!v.buffer) return;
        var src = c.createBufferSource();
        src.buffer = v.buffer; src.loop = !!v.loop;
        /* BUG2 FIX: honor clip speed for audio clips (was always 1x) */
        try { src.playbackRate.value = v.speed || 1; } catch (e) {}
        var g = c.createGain();
        var vol = (v.volume == null ? 0.8 : v.volume);
        src.connect(g);
        if (toExport && dest) { g.connect(dest); }
        g.connect(mon);
        var at = v.at || 0;
        var delay = Math.max(0, at - baseTime);
        var startAt = c.currentTime + delay + 0.02;
        var off;
        if (v.loop) { off = (v.offset || 0) % v.buffer.duration; g.gain.value = vol; }
        else {
          // resumed (offset already at pause position) vs fresh (seek forward)
          off = v.resumed ? (v.offset || 0) : Math.min((v.offset || 0) + Math.max(0, baseTime - at), Math.max(0, v.buffer.duration - 0.05));
          if (off >= v.buffer.duration - 0.03) return; // already finished
          // gain with optional fade in/out (baked into export too)
          var fi = Math.max(0, v.fadeIn || 0), fo = Math.max(0, v.fadeOut || 0), dur = v.dur || 0;
          g.gain.setValueAtTime(vol, startAt);
          if (fi > 0) { g.gain.setValueAtTime(0.0001, startAt); g.gain.linearRampToValueAtTime(vol, startAt + fi); }
          if (fo > 0 && dur > fo) {
            var fe = startAt + dur - fo;
            g.gain.setValueAtTime(vol, fe); g.gain.linearRampToValueAtTime(0.0001, fe + fo);
          }
        }
        try { src.start(startAt, off % v.buffer.duration); } catch (e) { try { src.start(startAt); } catch (e2) { return; } }
        self._nodes.push({ src: src, gain: g, buf: v.buffer, loop: !!v.loop, startAt: startAt, at: at, off0: off });
      });
    },
    pause: function () {
      var c = ac(), kept = [];
      this._nodes.forEach(function (n) {
        var elapsed = c.currentTime - n.startAt;
        var pos = elapsed < 0 ? n.off0 : n.off0 + elapsed;
        if (!n.loop) pos = Math.min(pos, n.buf.duration - 0.05);
        kept.push({ buffer: n.buf, volume: n.gain.gain.value, loop: n.loop, offset: Math.max(0, pos), at: n.at });
        try { n.src.stop(); } catch (e) {}
        try { n.src.disconnect(); n.gain.disconnect(); } catch (e) {}
      });
      this._nodes = [];
      return kept;
    },
    stop: function () {
      this._nodes.forEach(function (n) {
        try { n.src.stop(); } catch (e) {}
        try { n.src.disconnect(); n.gain.disconnect(); } catch (e) {}
      });
      this._nodes = [];
    },
    // route a <video> element's audio into monitor (+export when exporting)
    routeVideo: function (el, toExport) {
      var c = ac();
      if (!el._audSrc) {
        try {
          el._audSrc = c.createMediaElementSource(el);
          el._audMon = c.createGain();
          el._audSrc.connect(el._audMon);
          el._audMon.connect(this.monitor());
        } catch (e) { return; }
      }
      var dest = toExport ? this.exportDest() : null;
      if (dest && !el._audExp) {
        /* BUG1 FIX: route through _audMon (gain node) so clip volume/fade/mute
           applies to export too — previously _audSrc bypassed it. */
        try { el._audMon.connect(dest); } catch (e) {}
        el._audExp = true;
      } else if (!dest && el._audExp) {
        try { el._audMon.disconnect(this.exportDest()); } catch (e) {}
        el._audExp = false;
      }
    }
  };

  window.AudioLab = { Music: Music, Voice: Voice, Engine: Engine };
})();
