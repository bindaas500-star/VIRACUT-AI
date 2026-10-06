/* ViraCut AI — templates.js — original one-tap video styles
 *
 * A template is a pre-timed project: scene durations, per-scene smart FX,
 * text overlays and a grade. You add YOUR clips into the placeholder
 * scenes (tap a scene in the timeline to attach media).
 * All templates are original ViraCut designs.
 */
(function () {
  'use strict';

  var TPLS = [
    {
      id: 'viral-hook', name: 'Viral Hook', icon: '⚡', aspect: '9:16',
      desc: '5 rapid-fire cuts with zoom punches. Built for retention.',
      scenes: [
        { d: 1.4, fx: 'punch', text: 'WAIT FOR IT…', tpos: 'mid', tcolor: '#ffffff', tsize: 8 },
        { d: 1.2, fx: 'punch' },
        { d: 1.2, fx: 'shake', text: 'THIS CHANGES EVERYTHING', tpos: 'mid', tcolor: '#fde047', tsize: 7 },
        { d: 1.4, fx: 'glitch' },
        { d: 2.2, fx: 'none', text: 'FOLLOW FOR PART 2 ✦', tpos: 'bottom', tcolor: '#ffffff', tsize: 6 }
      ]
    },
    {
      id: 'cinematic', name: 'Cinematic Story', icon: '🎬', aspect: '16:9',
      desc: 'Slow, filmic scenes with a vintage grade. For storytelling.',
      filter: 'vintage',
      scenes: [
        { d: 4, fx: 'none', text: 'A STORY IN FOUR SCENES', tpos: 'top', tcolor: '#f5eeda', tsize: 6 },
        { d: 4, fx: 'vignette' },
        { d: 4, fx: 'vignette', text: 'EVERY FRAME MATTERS', tpos: 'bottom', tcolor: '#f5eeda', tsize: 6 },
        { d: 4, fx: 'focus' }
      ]
    },
    {
      id: 'lyric-pop', name: 'Lyric Pop', icon: '🎤', aspect: '9:16',
      desc: 'Beat-synced flashes and neon pops. For music & lyrics.',
      scenes: [
        { d: 1.0, fx: 'flash', text: 'TURN IT UP', tpos: 'mid', tcolor: '#ffffff', tsize: 8 },
        { d: 1.0, fx: 'neon' },
        { d: 1.0, fx: 'flash', text: 'FEEL THE BEAT', tpos: 'mid', tcolor: '#67e8f9', tsize: 8 },
        { d: 1.0, fx: 'neon' },
        { d: 1.0, fx: 'punch', text: 'DROP THE BASS', tpos: 'mid', tcolor: '#f0abfc', tsize: 8 },
        { d: 2.0, fx: 'none', text: '🔥', tpos: 'mid', tcolor: '#ffffff', tsize: 10 }
      ]
    },
    {
      id: 'product-pop', name: 'Product Pop', icon: '🛍️', aspect: '1:1',
      desc: 'Bold product showcase with mirror and punch moves.',
      scenes: [
        { d: 1.6, fx: 'punch', text: 'NEW ARRIVAL', tpos: 'top', tcolor: '#ffffff', tsize: 7 },
        { d: 1.6, fx: 'mirror' },
        { d: 1.6, fx: 'flash', text: '50% OFF TODAY', tpos: 'bottom', tcolor: '#fde047', tsize: 8 },
        { d: 2.0, fx: 'none', text: 'LINK IN BIO 🛒', tpos: 'bottom', tcolor: '#ffffff', tsize: 6 }
      ]
    },
    {
      id: 'horror-teaser', name: 'Horror Teaser', icon: '👻', aspect: '9:16',
      desc: 'Dark grain, shakes and glitches. For thrillers & teasers.',
      scenes: [
        { d: 2.0, fx: 'grain', text: 'DON’T WATCH ALONE', tpos: 'mid', tcolor: '#ef4444', tsize: 7 },
        { d: 1.6, fx: 'shake' },
        { d: 1.6, fx: 'glitch', text: 'IT SEES YOU', tpos: 'mid', tcolor: '#ef4444', tsize: 8 },
        { d: 1.4, fx: 'grain' },
        { d: 2.4, fx: 'vignette', text: 'COMING SOON…', tpos: 'bottom', tcolor: '#e6e1f7', tsize: 6 }
      ]
    }
  ];

  function get(id) {
    for (var i = 0; i < TPLS.length; i++) if (TPLS[i].id === id) return TPLS[i];
    return null;
  }

  window.Templates = {
    list: function () { return TPLS; },
    get: get,
    apply: function (id) {
      var t = get(id);
      if (!t) return;
      var p = Store.newProject(t.name + ' (template)', t.aspect);
      var cur = 0;
      t.scenes.forEach(function (s, i) {
        p.clips.push({
          id: Store.uid('clip'), type: 'placeholder',
          name: 'Scene ' + (i + 1),
          hint: 'Scene ' + (i + 1) + ' — tap to add your clip',
          duration: s.d, in: 0, out: s.d, speed: 1, rotation: 0, fit: 'cover',
          transitionIn: s.trans || 'none',
          fx: s.fx && s.fx !== 'none' ? s.fx : undefined
        });
        if (s.text) {
          p.texts.push({
            id: Store.uid('tx'), text: s.text, position: s.tpos || 'mid',
            color: s.tcolor || '#ffffff', size: s.tsize || 7,
            start: cur, end: cur + s.d
          });
        }
        cur += s.d;
      });
      if (t.filter) p.filter = t.filter;
      Store.persist();
      Editor.open(p.id);
      toast('Template applied — tap each scene to add your media.');
    }
  };
})();
