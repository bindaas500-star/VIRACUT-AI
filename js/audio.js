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
      var url = URL.createObjectURL(file);
      Store.mediaCache.set('music_' + project.id, url);
      project.music = { name: file.name, url: url, volume: 0.6, buffer: null };
      var c = ac();
      file.arrayBuffer().then(function (ab) { return c.decodeAudioData(ab); }).then(function (buf) {
        if (project.music) project.music.buffer = buf;
        toast('Music loaded: ' + file.name);
 Store.snapshot(); Store.persist();
        if (window.Editor) Editor.renderAudioPanel();
      }).catch(function () { toast('Could not decode audio file.', true); });
    },
    clear: function (project) {
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
        mr.ondataavailable = function (e) { if (e.data.size) self.chunks.push(e.data); };
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
          var take = { id: Store.uid('vo'), name: 'Take ' + (project.voiceovers.length + 1), url: url, volume: 0.9, buffer: null };
          Store.mediaCache.set(take.id, url);
          blob.arrayBuffer().then(function (ab) { return ac().decodeAudioData(ab); }).then(function (buf) {
            take.buffer = buf;
          }).catch(function () {});
          project.voiceovers.push(take);
          Store.snapshot(); Store.persist();
          resolve(take);
        };
        mr.stop();
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
    start: function (voices, toExport) {
      this.stop();
      var c = ac(), mon = this.monitor(), dest = toExport ? this.exportDest() : null;
      var self = this;
      voices.forEach(function (v) {
        if (!v.buffer) return;
        var src = c.createBufferSource();
        src.buffer = v.buffer; src.loop = !!v.loop;
        var g = c.createGain(); g.gain.value = (v.volume == null ? 0.8 : v.volume);
        src.connect(g);
        if (toExport && dest) { g.connect(dest); }
        g.connect(mon);
        try { src.start(0, (v.offset || 0) % v.buffer.duration); } catch (e) { try { src.start(0); } catch (e2) { return; } }
        self._nodes.push({ src: src, gain: g, buf: v.buffer, loop: !!v.loop, t0: c.currentTime, off: (v.offset || 0) % v.buffer.duration });
      });
    },
    pause: function () {
      var c = ac(), kept = [];
      this._nodes.forEach(function (n) {
        var pos;
        if (n.loop) pos = (n.off + (c.currentTime - n.t0)) % n.buf.duration;
        else pos = Math.min(n.off + (c.currentTime - n.t0), n.buf.duration - 0.05);
        kept.push({ buffer: n.buf, volume: n.gain.gain.value, loop: n.loop, offset: pos });
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
      if (dest) { try { el._audSrc.connect(dest); el._audExp = true; } catch (e) {} }
      else if (el._audExp) { try { el._audSrc.disconnect(dest); } catch (e) {} el._audExp = false; }
    }
  };

  window.AudioLab = { Music: Music, Voice: Voice, Engine: Engine };
})();
