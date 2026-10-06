/* TemplateX AI — music.js — original generated music loops (WebAudio)
 * No audio files needed: moods are synthesized live. User can also upload
 * their own music file per video. */
(function () {
  'use strict';

  // chord progressions (Hz) per mood; each chord lasts `step` seconds
  var MOODS = {
    soft:      { wave: 'triangle', step: 4, gain: 0.16, chords: [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]] },
    upbeat:    { wave: 'square', step: 0.5, gain: 0.07, arp: [261.6, 329.6, 392, 523.3, 392, 329.6] },
    emotional: { wave: 'sine', step: 5, gain: 0.2, chords: [[220, 261.6, 329.6], [174.6, 207.7, 261.6], [196, 246.9, 293.7], [146.8, 174.6, 220]] }
  };

  function midi() {}

  var Music = {
    moods: function () { return Object.keys(MOODS); },
    moodName: function (m) { return { soft: 'Soft Pad', upbeat: 'Upbeat Arp', emotional: 'Emotional Pad' }[m] || m; },

    // Build an AudioBuffer of `dur` seconds for a mood (OfflineAudioContext)
    buildLoop: function (mood, dur) {
      var cfg = MOODS[mood] || MOODS.soft;
      var sr = 44100, len = Math.floor(sr * dur);
      var off = new OfflineAudioContext(2, len, sr);
      var master = off.createGain(); master.gain.value = 1;
      var lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      master.connect(lp); lp.connect(off.destination);
      var t = 0;
      if (cfg.arp) {
        var i = 0;
        while (t < dur) {
          var f = cfg.arp[i % cfg.arp.length];
          note(off, master, f, t, cfg.step * 0.95, cfg.wave, cfg.gain);
          t += cfg.step; i++;
        }
      } else {
        var ci = 0;
        while (t < dur) {
          var ch = cfg.chords[ci % cfg.chords.length];
          for (var k = 0; k < ch.length; k++) note(off, master, ch[k], t, cfg.step * 1.05, cfg.wave, cfg.gain);
          t += cfg.step; ci++;
        }
      }
      return off.startRendering();
    }
  };

  function note(ctx, dest, freq, t, dur, wave, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  window.TXMusic = Music;
})();
