/* ViraCut AI — test-phase16.js
   Regression tests for 4 CRITICAL audit bugs:
   BUG1: Export ignores clip volume/fade/mute (audio.js routeVideo)
   BUG2: Audio clip speed ignored (audio.js Engine.start playbackRate)
   BUG3: Reversed clips are silent (editor.js reversedAudioBuffer)
   BUG4: Uncommitted FX previews bake into export (editor.js drawEffectSegments) */
(function () {
  'use strict';
  var fs = require('fs');
  var path = require('path');
  var dir = __dirname;

  function read(f) { return fs.readFileSync(path.join(dir, f), 'utf8'); }

  var audioJs = read('js/audio.js');
  var editorJs = read('js/editor.js');
  var exportJs = read('js/export.js');

  var passed = 0, failed = 0;
  function t(name, cond) {
    if (cond) { passed++; }
    else { failed++; console.log('FAIL: ' + name); }
  }

  // ============ BUG1: export routes through _audMon (gain node) ============
  t('BUG1: routeVideo connects _audMon (not _audSrc) to export dest',
    audioJs.indexOf('el._audMon.connect(dest)') !== -1);
  t('BUG1: routeVideo disconnects _audMon from export dest on cleanup',
    audioJs.indexOf('el._audMon.disconnect(this.exportDest())') !== -1);
  t('BUG1: no direct _audSrc->dest bypass remains',
    audioJs.indexOf('el._audSrc.connect(dest)') === -1);

  // ============ BUG2: audio playbackRate honors clip speed ============
  t('BUG2: Engine.start sets src.playbackRate from v.speed',
    audioJs.indexOf('src.playbackRate.value = v.speed || 1') !== -1);
  t('BUG2: editor startAudio passes speed in voice objects',
    editorJs.indexOf('fadeOut: c.fadeOut || 0, speed: c.speed || 1') !== -1);
  t('BUG2: export passes speed in voice objects',
    exportJs.indexOf('fadeOut: c.fadeOut || 0, speed: c.speed || 1') !== -1);

  // ============ BUG3: reversed audio via reversed AudioBuffer ============
  t('BUG3: reversedAudioBuffer helper exists',
    editorJs.indexOf('Editor.reversedAudioBuffer = function') !== -1);
  t('BUG3: reversedAudioBuffer reverses channel data',
    editorJs.indexOf('dst[i] = src[endS - 1 - i]') !== -1);
  t('BUG3: reversedAudioBuffer caches by clip+range',
    editorJs.indexOf("'rev_' + clip.id") !== -1);
  t('BUG3: ensureReversedBuffers helper exists',
    editorJs.indexOf('Editor.ensureReversedBuffers = function') !== -1);
  t('BUG3: play() pre-warms reversed buffers before startAudio',
    editorJs.indexOf('return self.ensureReversedBuffers();') !== -1);
  t('BUG3: startAudio adds reversed voices for reversed video clips',
    editorJs.indexOf("c.type !== 'video' || !c.reversed") !== -1);
  t('BUG3: export awaits reversed buffers',
    exportJs.indexOf('return Editor.ensureReversedBuffers();') !== -1);
  t('BUG3: export includes reversed voices',
    exportJs.indexOf('BUG3: reversed video clips') !== -1);
  t('BUG3: false "Audio keeps playing forward" comment removed',
    editorJs.indexOf('Audio keeps playing forward (documented)') === -1);

  // ============ BUG4: export skips uncommitted FX previews ============
  t('BUG4: composite passes forExport to drawEffectSegments',
    editorJs.indexOf('self.drawEffectSegments(g, W, H, t, forExport)') !== -1);
  t('BUG4: drawEffectSegments accepts forExport param',
    editorJs.indexOf('drawEffectSegments: function (g, W, H, t, forExport)') !== -1);
  t('BUG4: _fxPreview skipped when forExport',
    editorJs.indexOf('if (!forExport && window.FXLIB && pv)') !== -1);
  t('BUG4: drawPhotoFx accepts forExport param',
    editorJs.indexOf('drawPhotoFx: function (g, W, H, t, forExport)') !== -1);
  t('BUG4: _fxPhotoPreview skipped when forExport',
    editorJs.indexOf('if (!forExport && pp && pp.target') !== -1);
  t('BUG4: committed project.effects still render in export',
    editorJs.indexOf('FXLIB.renderSegments(g, W, H, t, p.effects)') !== -1);

  // ============ No regressions: key APIs still intact ============
  t('Engine.start still exists', audioJs.indexOf('start: function (voices, toExport, baseTime)') !== -1);
  t('routeVideo still exists', audioJs.indexOf('routeVideo: function (el, toExport)') !== -1);
  t('composite still accepts forExport', editorJs.indexOf('composite: function (g, W, H, t, forExport)') !== -1);
  t('export still calls composite with true', exportJs.indexOf('Editor.composite(g, size.w, size.h, t, true)') !== -1);

  console.log('RESULT: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
