/* ViraCut AI — autocap.js — FREE auto captions via Web Speech API.
 * No paid API, no API key. Flow: user taps Auto-transcribe -> picks language
 * -> project plays from 0 while the mic listens -> final transcripts become
 * caption blocks via Captions.add() (undo/redo safe).
 *
 * HONEST LIMITATIONS (surfaced to user, never faked):
 * - Needs internet (audio goes to the browser's speech servers).
 * - Needs microphone permission; captures via mic while video plays.
 * - Accuracy depends on audio clarity / background noise.
 * - Android WebView often lacks SpeechRecognition -> supported() false,
 *   and the UI shows an honest "not available on this device" message.
 */
(function () {
  'use strict';

  var SR = (typeof window !== 'undefined') &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  var _rec = null;
  var _active = false;
  var _lang = 'en-US';
  var _onEvent = null;
  var _lastEnd = 0;

  function supported() { return !!SR; }
  function isActive() { return _active; }

  /* Start a transcription session.
     lang: 'en-US' | 'ur-PK'. onEvent(evt) receives:
       {type:'interim', text} | {type:'final', text, atTime}
       | {type:'error', msg} | {type:'end'} */
  function start(lang, onEvent) {
    if (!SR || _active) return false;
    _lang = lang || 'en-US';
    _onEvent = onEvent || null;
    _lastEnd = 0;
    try {
      _rec = new SR();
    } catch (e) {
      emit({ type: 'error', msg: 'Speech recognition failed to start.' });
      return false;
    }
    _rec.lang = _lang;
    _rec.continuous = true;
    _rec.interimResults = true;
    _rec.maxAlternatives = 1;
    _rec.onresult = function (ev) {
      var i, res, txt;
      for (i = ev.resultIndex; i < ev.results.length; i++) {
        res = ev.results[i];
        txt = res[0] && res[0].transcript ? res[0].transcript.trim() : '';
        if (!txt) continue;
        if (res.isFinal) {
          var at = currentProjectTime();
          emit({ type: 'final', text: txt, atTime: at, fromTime: _lastEnd });
          _lastEnd = at;
        } else {
          emit({ type: 'interim', text: txt });
        }
      }
    };
    _rec.onerror = function (ev) {
      var k = ev && ev.error ? ev.error : 'unknown';
      var msg = 'Speech error: ' + k;
      if (k === 'not-allowed' || k === 'service-not-allowed')
        msg = 'Microphone blocked — allow mic permission and retry.';
      else if (k === 'network')
        msg = 'Speech needs internet — check connection and retry.';
      else if (k === 'no-speech')
        msg = 'No speech heard — play louder or move closer.';
      emit({ type: 'error', msg: msg });
    };
    _rec.onend = function () {
      // auto-restart while session is active (continuous mode gaps)
      if (_active) { try { _rec.start(); } catch (e) { finish(); } }
      else finish();
    };
    try {
      _rec.start();
      _active = true;
      return true;
    } catch (e) {
      emit({ type: 'error', msg: 'Could not start speech recognition.' });
      return false;
    }
  }

  function finish() {
    _active = false;
    emit({ type: 'end' });
    _onEvent = null;
  }

  function stop() {
    _active = false;
    try { if (_rec) _rec.stop(); } catch (e) {}
    try { if (_rec) _rec.abort(); } catch (e) {}
    _rec = null;
    emit({ type: 'end' });
    _onEvent = null;
  }

  function emit(evt) {
    try { if (_onEvent) _onEvent(evt); } catch (e) {}
  }

  function currentProjectTime() {
    try {
      if (window.Editor && typeof window.Editor.t === 'number') return Math.max(0, window.Editor.t);
    } catch (e) {}
    return 0;
  }

  window.AutoCap = {
    supported: supported,
    isActive: isActive,
    start: start,
    stop: stop
  };
})();
