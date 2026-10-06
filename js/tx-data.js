/* ViraCut AI — tx-data.js — TemplateX engine inside ViraCut.
 * Original templates in the styles Imran likes: cinematic glow-reveal photo
 * edits, Islamic night themes with Urdu glow text, sad Urdu poetry edits.
 * Schema:
 * { id,title,icon,category,aspect,slots,music:{name,mood},overlays,art,scenes }
 *   art: 'mosque' | null — procedural placeholder art for empty slots
 *   overlays: particles|bokeh|confetti|rain|grain|gloworbs|streak|smoke
 * scene: { slot,dur,anim,fx,filter,trans,text? }
 *   anim: kenburns-in|kenburns-out|pan-left|pan-right|static|slow-zoom
 *   fx: none|punch|shake|mirror|flash|glitch|focus|neon|vignette|grain|vintage|reveal|gloworbs|streak|smoke
 *   filter: none|warm|cool|mono|vivid|vintage
 *   trans: cut|fade|slide|zoom
 *   text: { content,pos,color,size,anim,urdu?,glow? } anim: fadeup|pop|type|words|none
 * Add a template: push one T({...}) into TXDATA. Nothing else changes.
 */
(function () {
  'use strict';

  window.TXFILTERS = {
    none: 'none', warm: 'sepia(0.35) saturate(1.35)', cool: 'saturate(1.1) hue-rotate(-18deg) brightness(1.06)',
    mono: 'grayscale(1)', vivid: 'saturate(1.8) contrast(1.15)', vintage: 'sepia(0.55) contrast(0.95) brightness(0.96)'
  };
  window.TXANIMS = [
    { id: 'kenburns-in', name: 'Zoom In' }, { id: 'kenburns-out', name: 'Zoom Out' },
    { id: 'pan-left', name: 'Pan Left' }, { id: 'pan-right', name: 'Pan Right' },
    { id: 'static', name: 'Static' }, { id: 'slow-zoom', name: 'Slow Zoom' }
  ];
  window.TXTRANS = [
    { id: 'cut', name: 'Cut' }, { id: 'fade', name: 'Fade' },
    { id: 'slide', name: 'Slide' }, { id: 'zoom', name: 'Zoom' }
  ];

  function T(o) {
    o.duration = o.scenes.reduce(function (a, s) { return a + s.dur; }, 0);
    return o;
  }
  function UT(content, pos, color, size, anim) {
    return { content: content, pos: pos || 'mid', color: color || '#fde68a', size: size || 10, anim: anim || 'fadeup', urdu: true, glow: color || '#fde68a' };
  }

  var TXDATA = [
    /* ---------- glow reveal: cinematic photo edit (6 clips, ~22s) ---------- */
    T({ id: 'glow-reveal', title: 'Glow Reveal', icon: '🔥', category: 'trending', aspect: '9:16',
      slots: 6, music: { name: 'Midnight Glow (AI loop)', mood: 'emotional' },
      overlays: ['gloworbs', 'streak', 'smoke', 'particles'],
      scenes: [
        { slot: 1, dur: 3.7, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'cut' },
        { slot: 2, dur: 3.7, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'cut' },
        { slot: 3, dur: 3.7, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'cut' },
        { slot: 4, dur: 3.7, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'cut' },
        { slot: 5, dur: 3.7, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'cut' },
        { slot: 6, dur: 3.5, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'fade' }
      ] }),
    /* ---------- velocity: hard-cut trending ---------- */
    T({ id: 'velocity', title: 'Velocity', icon: '⚡', category: 'trending', aspect: '9:16',
      slots: 5, music: { name: 'Velocity (AI loop)', mood: 'upbeat' }, overlays: [],
      scenes: [
        { slot: 1, dur: 1.0, anim: 'kenburns-in', fx: 'punch', filter: 'vivid', trans: 'cut', text: { content: 'WAIT FOR IT', pos: 'mid', color: '#ffffff', size: 9, anim: 'pop' } },
        { slot: 2, dur: 1.0, anim: 'pan-left', fx: 'shake', filter: 'vivid', trans: 'cut' },
        { slot: 3, dur: 1.0, anim: 'kenburns-out', fx: 'flash', filter: 'vivid', trans: 'cut', text: { content: 'THIS HITS', pos: 'mid', color: '#67e8f9', size: 9, anim: 'pop' } },
        { slot: 4, dur: 1.0, anim: 'pan-right', fx: 'glitch', filter: 'cool', trans: 'cut' },
        { slot: 5, dur: 2.4, anim: 'slow-zoom', fx: 'neon', filter: 'vivid', trans: 'zoom', text: { content: 'FOLLOW ✦', pos: 'bottom', color: '#ffffff', size: 7, anim: 'fadeup' } }
      ] }),
    /* ---------- islamic: noor ---------- */
    T({ id: 'noor', title: 'Noor', icon: '🌙', category: 'islamic', aspect: '9:16',
      slots: 5, music: { name: 'Sahar (AI loop)', mood: 'soft' }, overlays: ['particles'], art: 'mosque',
      scenes: [
        { slot: 1, dur: 3.0, anim: 'slow-zoom', fx: 'vignette', filter: 'warm', trans: 'cut', text: UT('سُبْحَانَ اللَّهِ') },
        { slot: 2, dur: 3.0, anim: 'kenburns-in', fx: 'none', filter: 'warm', trans: 'fade', text: UT('اَلْحَمْدُ لِلَّهِ') },
        { slot: 3, dur: 3.0, anim: 'pan-left', fx: 'vignette', filter: 'warm', trans: 'fade', text: UT('اللَّهُ أَكْبَرُ') },
        { slot: 4, dur: 3.0, anim: 'kenburns-out', fx: 'none', filter: 'warm', trans: 'fade', text: UT('مَاشَاءَ اللَّهُ') },
        { slot: 5, dur: 3.0, anim: 'static', fx: 'focus', filter: 'warm', trans: 'fade', text: { content: '🌙', pos: 'mid', color: '#ffffff', size: 12, anim: 'pop' } }
      ] }),
    /* ---------- islamic: darood ---------- */
    T({ id: 'darood', title: 'Darood', icon: '🤲', category: 'islamic', aspect: '9:16',
      slots: 4, music: { name: 'Sukoon (AI loop)', mood: 'soft' }, overlays: ['particles', 'smoke'], art: 'mosque',
      scenes: [
        { slot: 1, dur: 3.5, anim: 'slow-zoom', fx: 'reveal', filter: 'warm', trans: 'cut', text: UT('درود پاک', 'mid', '#a7f3d0', 11) },
        { slot: 2, dur: 3.5, anim: 'kenburns-in', fx: 'vignette', filter: 'warm', trans: 'fade', text: UT('صلوٰۃ و سلام', 'mid', '#a7f3d0', 10) },
        { slot: 3, dur: 3.5, anim: 'pan-right', fx: 'none', filter: 'warm', trans: 'fade', text: UT(' پڑھتے جائیے', 'mid', '#fde68a', 10) },
        { slot: 4, dur: 3.5, anim: 'static', fx: 'focus', filter: 'warm', trans: 'fade', text: { content: '🤲', pos: 'mid', color: '#ffffff', size: 12, anim: 'pop' } }
      ] }),
    /* ---------- sad: dard ---------- */
    T({ id: 'dard', title: 'Dard', icon: '🌧️', category: 'sad', aspect: '9:16',
      slots: 5, music: { name: 'Tears in Rain (AI loop)', mood: 'emotional' }, overlays: ['rain'],
      scenes: [
        { slot: 1, dur: 2.8, anim: 'slow-zoom', fx: 'vignette', filter: 'mono', trans: 'cut', text: UT('تنہا', 'mid', '#e2e8f0', 12, 'words') },
        { slot: 2, dur: 2.8, anim: 'pan-left', fx: 'grain', filter: 'cool', trans: 'cut', text: UT('درد', 'mid', '#e2e8f0', 12, 'words') },
        { slot: 3, dur: 2.8, anim: 'kenburns-out', fx: 'vignette', filter: 'mono', trans: 'cut', text: UT('یادیں', 'mid', '#e2e8f0', 12, 'words') },
        { slot: 4, dur: 2.8, anim: 'pan-right', fx: 'grain', filter: 'cool', trans: 'cut', text: UT('خاموشی', 'mid', '#e2e8f0', 12, 'words') },
        { slot: 5, dur: 3.0, anim: 'static', fx: 'focus', filter: 'mono', trans: 'fade', text: { content: '💔', pos: 'mid', color: '#ffffff', size: 11, anim: 'fadeup' } }
      ] }),
    /* ---------- sad: yaadein ---------- */
    T({ id: 'yaadein', title: 'Yaadein', icon: '🖤', category: 'sad', aspect: '9:16',
      slots: 4, music: { name: 'Empty Streets (AI loop)', mood: 'emotional' }, overlays: ['grain'],
      scenes: [
        { slot: 1, dur: 3.0, anim: 'slow-zoom', fx: 'vintage', filter: 'vintage', trans: 'cut', text: UT('یادیں رہ جاتی ہیں', 'mid', '#f5eeda', 9) },
        { slot: 2, dur: 3.0, anim: 'pan-left', fx: 'vignette', filter: 'mono', trans: 'fade', text: UT('وقت گزر جاتا ہے', 'mid', '#e2e8f0', 9) },
        { slot: 3, dur: 3.0, anim: 'kenburns-in', fx: 'grain', filter: 'cool', trans: 'fade' },
        { slot: 4, dur: 3.0, anim: 'static', fx: 'focus', filter: 'mono', trans: 'fade', text: { content: '🖤', pos: 'mid', color: '#ffffff', size: 11, anim: 'fadeup' } }
      ] }),
    /* ---------- love: mohabbat ---------- */
    T({ id: 'mohabbat', title: 'Mohabbat', icon: '💖', category: 'love', aspect: '9:16',
      slots: 5, music: { name: 'Heartbeat (AI loop)', mood: 'emotional' }, overlays: ['bokeh'],
      scenes: [
        { slot: 1, dur: 2.4, anim: 'slow-zoom', fx: 'punch', filter: 'warm', trans: 'cut', text: UT('محبت', 'top', '#ffe4ec', 11) },
        { slot: 2, dur: 2.4, anim: 'kenburns-in', fx: 'focus', filter: 'warm', trans: 'fade', text: UT('دل سے دل تک', 'mid', '#ffffff', 10) },
        { slot: 3, dur: 2.4, anim: 'pan-left', fx: 'punch', filter: 'warm', trans: 'cut' },
        { slot: 4, dur: 2.4, anim: 'kenburns-out', fx: 'vignette', filter: 'warm', trans: 'fade', text: UT('ہر دھڑکن میں تم', 'mid', '#fbcfe8', 9, 'words') },
        { slot: 5, dur: 2.6, anim: 'slow-zoom', fx: 'none', filter: 'warm', trans: 'fade', text: { content: '💖', pos: 'mid', color: '#ffffff', size: 13, anim: 'pop' } }
      ] }),
    /* ---------- birthday ---------- */
    T({ id: 'birthday-drop', title: 'Birthday Drop', icon: '🎂', category: 'birthday', aspect: '9:16',
      slots: 5, music: { name: 'Party Drop (AI loop)', mood: 'upbeat' }, overlays: ['confetti'],
      scenes: [
        { slot: 1, dur: 1.4, anim: 'kenburns-in', fx: 'punch', filter: 'vivid', trans: 'cut', text: { content: 'IT’S YOUR DAY!', pos: 'mid', color: '#fde047', size: 9, anim: 'pop' } },
        { slot: 2, dur: 1.2, anim: 'pan-left', fx: 'flash', filter: 'vivid', trans: 'cut' },
        { slot: 3, dur: 1.4, anim: 'kenburns-out', fx: 'punch', filter: 'vivid', trans: 'cut', text: { content: 'MAKE A WISH 🎂', pos: 'mid', color: '#ffffff', size: 8, anim: 'pop' } },
        { slot: 4, dur: 1.2, anim: 'pan-right', fx: 'shake', filter: 'vivid', trans: 'cut' },
        { slot: 5, dur: 2.6, anim: 'slow-zoom', fx: 'flash', filter: 'vivid', trans: 'zoom', text: { content: 'HAPPY BIRTHDAY! 🥳', pos: 'bottom', color: '#fde047', size: 8, anim: 'pop' } }
      ] }),
    /* ---------- travel ---------- */
    T({ id: 'wander', title: 'Wander', icon: '✈️', category: 'travel', aspect: '9:16',
      slots: 6, music: { name: 'Open Road (AI loop)', mood: 'upbeat' }, overlays: [],
      scenes: [
        { slot: 1, dur: 1.4, anim: 'pan-right', fx: 'punch', filter: 'vivid', trans: 'cut', text: { content: 'WANDER OFTEN', pos: 'top', color: '#ffffff', size: 7, anim: 'pop' } },
        { slot: 2, dur: 1.2, anim: 'kenburns-in', fx: 'flash', filter: 'vivid', trans: 'slide' },
        { slot: 3, dur: 1.4, anim: 'pan-left', fx: 'punch', filter: 'cool', trans: 'slide', text: { content: 'WONDER ALWAYS', pos: 'mid', color: '#bae6fd', size: 8, anim: 'pop' } },
        { slot: 4, dur: 1.2, anim: 'kenburns-out', fx: 'shake', filter: 'vivid', trans: 'slide' },
        { slot: 5, dur: 1.4, anim: 'pan-right', fx: 'flash', filter: 'vivid', trans: 'slide' },
        { slot: 6, dur: 2.6, anim: 'slow-zoom', fx: 'vignette', filter: 'vivid', trans: 'fade', text: { content: '✈️ NEXT STOP?', pos: 'bottom', color: '#ffffff', size: 7, anim: 'fadeup' } }
      ] }),
    /* ---------- photo: slam ---------- */
    T({ id: 'photo-slam', title: 'Photo Slam', icon: '🖼️', category: 'photo', aspect: '9:16',
      slots: 6, music: { name: 'Slam Beat (AI loop)', mood: 'upbeat' }, overlays: [],
      scenes: [
        { slot: 1, dur: 1.2, anim: 'kenburns-in', fx: 'punch', filter: 'vivid', trans: 'cut' },
        { slot: 2, dur: 1.2, anim: 'kenburns-in', fx: 'flash', filter: 'warm', trans: 'cut' },
        { slot: 3, dur: 1.2, anim: 'kenburns-in', fx: 'punch', filter: 'vivid', trans: 'cut' },
        { slot: 4, dur: 1.2, anim: 'kenburns-in', fx: 'shake', filter: 'warm', trans: 'cut' },
        { slot: 5, dur: 1.2, anim: 'kenburns-in', fx: 'flash', filter: 'vivid', trans: 'cut' },
        { slot: 6, dur: 2.4, anim: 'slow-zoom', fx: 'vignette', filter: 'warm', trans: 'fade', text: { content: 'MEMORIES ✦', pos: 'bottom', color: '#ffffff', size: 8, anim: 'fadeup' } }
      ] }),
    /* ---------- cinematic ---------- */
    T({ id: 'cine-cut', title: 'Cine Cut', icon: '🎬', category: 'cinematic', aspect: '9:16',
      slots: 6, music: { name: 'Eternal Piano (AI loop)', mood: 'emotional' }, overlays: ['grain'],
      scenes: [
        { slot: 1, dur: 1.6, anim: 'pan-right', fx: 'vintage', filter: 'vintage', trans: 'cut', text: { content: 'A STORY IN SIX CUTS', pos: 'top', color: '#f5eeda', size: 6, anim: 'fadeup' } },
        { slot: 2, dur: 1.4, anim: 'kenburns-in', fx: 'punch', filter: 'vintage', trans: 'cut' },
        { slot: 3, dur: 1.6, anim: 'pan-left', fx: 'vintage', filter: 'vintage', trans: 'fade', text: { content: 'EVERY FRAME', pos: 'bottom', color: '#f5eeda', size: 7, anim: 'pop' } },
        { slot: 4, dur: 1.4, anim: 'kenburns-out', fx: 'flash', filter: 'vintage', trans: 'cut' },
        { slot: 5, dur: 1.6, anim: 'slow-zoom', fx: 'vintage', filter: 'vintage', trans: 'fade', text: { content: 'MATTERS', pos: 'mid', color: '#ffffff', size: 9, anim: 'pop' } },
        { slot: 6, dur: 2.6, anim: 'static', fx: 'focus', filter: 'vintage', trans: 'fade', text: { content: 'THE END ✦', pos: 'bottom', color: '#f5eeda', size: 6, anim: 'fadeup' } }
      ] })
  ];

  window.TX = {
    builtin: function () { return TXDATA; },
    custom: function () {
      try { return JSON.parse(localStorage.getItem('viracut_tx_custom') || '[]'); } catch (e) { return []; }
    },
    saveCustom: function (t) {
      var all = TX.custom();
      var i = -1;
      for (var j = 0; j < all.length; j++) if (all[j].id === t.id) i = j;
      if (i >= 0) all[i] = t; else all.unshift(t);
      try { localStorage.setItem('viracut_tx_custom', JSON.stringify(all)); } catch (e) {}
    },
    remote: function () { return (window.TXRemote && TXRemote.cached()) || []; },
    all: function () {
      // remote overrides builtin/custom by id
      var seen = {}, out = [];
      TXDATA.concat(TX.custom()).concat(TX.remote()).forEach(function (t) {
        if (seen[t.id]) { for (var i = 0; i < out.length; i++) if (out[i].id === t.id) out[i] = t; }
        else { seen[t.id] = 1; out.push(t); }
      });
      return out;
    },
    get: function (id) {
      var all = TX.all();
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    },
    categories: function () {
      return [
        { id: 'trending', name: 'Trending', icon: '🔥' },
        { id: 'photo', name: 'Photo', icon: '🖼️' },
        { id: 'love', name: 'Love', icon: '💖' },
        { id: 'cinematic', name: 'Cinematic', icon: '🎬' },
        { id: 'birthday', name: 'Birthday', icon: '🎂' },
        { id: 'travel', name: 'Travel', icon: '✈️' },
        { id: 'sad', name: 'Sad / Emotional', icon: '🌧️' },
        { id: 'islamic', name: 'Islamic', icon: '🌙' },
        { id: 'my', name: 'My Templates', icon: '🛠️' }
      ];
    }
  };
})();
