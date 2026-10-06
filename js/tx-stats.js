/* ViraCut AI — tx-stats.js — template usage stats, likes, trending sorts.
 * All on-device (localStorage). Free, no backend. */
(function () {
  'use strict';
  var LS = 'viracut_tx_stats_v1';
  function read() {
    try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; }
  }
  function write(d) {
    try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) {}
  }
  function num(v) { return typeof v === 'number' && v > 0 ? v : 0; }

  window.TXStats = {
    use: function (id) {
      var d = read(); d.uses = d.uses || {};
      d.uses[id] = num(d.uses[id]) + 1; write(d);
    },
    toggleLike: function (id) {
      var d = read(); d.likes = d.likes || {};
      if (d.likes[id]) delete d.likes[id]; else d.likes[id] = 1;
      write(d); return !!d.likes[id];
    },
    liked: function (id) { var d = read(); return !!(d.likes && d.likes[id]); },
    uses: function (id) { var d = read(); return num(d.uses && d.uses[id]); },
    likes: function (id) { var d = read(); return (d.likes && d.likes[id]) ? 1 : 0; },
    /* trending score: uses weigh 2, likes weigh 5 */
    score: function (id) { return this.uses(id) * 2 + this.likes(id) * 5; },
    /* seed some baseline popularity so lists feel alive */
    seed: function (id) {
      var h = 0, i;
      for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return 20 + (h % 400);
    },
    displayUses: function (id) { return this.uses(id) + this.seed(id); },
    /* sort helpers */
    byTrending: function (list) {
      var S = this;
      return list.slice().sort(function (a, b) { return (S.score(b.id) + S.seed(b.id)) - (S.score(a.id) + S.seed(a.id)); });
    },
    byPopular: function (list) {
      var S = this;
      return list.slice().sort(function (a, b) { return (S.likes(b.id) * 10 + S.uses(b.id)) - (S.likes(a.id) * 10 + S.uses(a.id)); });
    },
    byNew: function (list) {
      function added(t) { return t.added || '2026-10-06'; }
      return list.slice().sort(function (a, b) { return added(b) < added(a) ? -1 : 1; });
    }
  };
})();
