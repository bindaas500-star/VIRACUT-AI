/* ViraCut AI — tx-remote.js — remote template catalog (free, via GitHub).
 * New templates published in templates-catalog.json appear in the app
 * automatically (New Arrivals). Works offline from cache. */
(function () {
  'use strict';
  var LS = 'viracut_tx_remote_v1';
  var URL = 'templates-catalog.json';

  function readCache() {
    try { var v = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function writeCache(list) {
    try { localStorage.setItem(LS, JSON.stringify(list)); } catch (e) {}
  }

  window.TXRemote = {
    /* cached remote templates (also used by TX.all) */
    cached: readCache,
    /* fetch catalog; cb(err, templates) */
    check: function (cb) {
      cb = cb || function () {};
      var done = false;
      function finish(err, list) { if (!done) { done = true; cb(err, list); } }
      setTimeout(function () { finish('timeout', null); }, 12000);
      fetch(URL, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function (j) {
        var list = (j && Array.isArray(j.templates)) ? j.templates : [];
        // keep only valid-looking templates
        list = list.filter(function (t) { return t && t.id && t.scenes && t.scenes.length; });
        // normalize: renderer/detail/slots assume these fields exist
        list = list.map(function (t) {
          t.title = t.title || 'Untitled';
          t.icon = t.icon || '✨';
          t.category = t.category || 'trending';
          t.aspect = t.aspect || '9:16';
          t.music = (t.music && t.music.name) ? t.music : { name: 'Custom Mix (AI loop)', mood: (t.music && t.music.mood) || 'soft' };
          t.overlays = t.overlays || [];
          var maxSlot = 0, dur = 0;
          t.scenes.forEach(function (s) {
            s.slot = Math.max(1, parseInt(s.slot, 10) || 1);
            s.dur = Math.min(10, Math.max(0.5, parseFloat(s.dur) || 1.2));
            s.anim = s.anim || 'kenburns-in';
            s.fx = s.fx || 'punch';
            s.filter = s.filter || 'none';
            s.trans = s.trans || 'cut';
            maxSlot = Math.max(maxSlot, s.slot);
            dur += s.dur;
          });
          t.slots = Math.max(maxSlot, parseInt(t.slots, 10) || 0);
          t.duration = dur;
          t.remote = true;
          return t;
        });
        var old = readCache().map(function (t) { return t.id; }).join(',');
        var cur = list.map(function (t) { return t.id; }).join(',');
        writeCache(list);
        finish(null, { templates: list, changed: old !== cur });
      }).catch(function (e) { finish(e, null); });
    }
  };
})();
