/* ViraCut AI — tx-remote.js — remote template catalog (free, via GitHub).
 * New templates published in templates-catalog.json appear in the app
 * automatically (New Arrivals). Works offline from cache. */
(function () {
  'use strict';
  var LS = 'viracut_tx_remote_v1';
  var URL = 'templates-catalog.json';

  function readCache() {
    try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; }
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
        var list = (j && j.templates) || [];
        // keep only valid-looking templates
        list = list.filter(function (t) { return t && t.id && t.scenes && t.scenes.length; });
        var old = readCache().map(function (t) { return t.id; }).join(',');
        var cur = list.map(function (t) { return t.id; }).join(',');
        writeCache(list);
        finish(null, { templates: list, changed: old !== cur });
      }).catch(function (e) { finish(e, null); });
    }
  };
})();
