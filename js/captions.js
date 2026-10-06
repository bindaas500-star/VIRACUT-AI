/* ViraCut AI — captions.js — caption model ops + auto-from-script */
(function () {
  'use strict';

  var Captions = {
    add: function (text, start, end) {
      var p = Store.current;
      if (!p) return null;
      var c = { id: Store.uid('cap'), text: text, start: +start || 0, end: (end == null ? (+start || 0) + 2 : +end) };
      if (c.end <= c.start) c.end = c.start + 2;
      p.captions.push(c);
      Store.snapshot(); Store.persist();
      return c;
    },
    remove: function (id) {
      var p = Store.current;
      if (!p) return;
      p.captions = p.captions.filter(function (c) { return c.id !== id; });
      Store.snapshot(); Store.persist();
    },
    clear: function () {
      var p = Store.current;
      if (!p || !p.captions.length) return;
      p.captions = [];
      Store.snapshot(); Store.persist();
    },
    /* Split script into sentences, spread evenly across project duration */
    autoFromScript: function (scriptText) {
      var p = Store.current;
      if (!p) return 0;
      var total = Store.timing().total;
      if (total <= 0) { toast('Add clips first — captions need a timeline.', true); return 0; }
      var text = (scriptText || p.script || '').trim();
      if (!text) { toast('No script text found. Add one in AI Voiceover or AI Story.', true); return 0; }
      var sentences = text.split(/\n+/).join(' ').split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 2; });
      if (!sentences.length) { toast('Could not split script into sentences.', true); return 0; }
      p.captions = [];
      var per = total / sentences.length;
      sentences.forEach(function (s, i) {
        p.captions.push({
          id: Store.uid('cap'), text: s.slice(0, 90),
          start: +(i * per).toFixed(2), end: +((i + 1) * per - 0.05).toFixed(2)
        });
      });
      Store.snapshot(); Store.persist();
      return sentences.length;
    },
    at: function (t) {
      var p = Store.current;
      if (!p) return null;
      for (var i = 0; i < p.captions.length; i++) {
        var c = p.captions[i];
        if (t >= c.start && t <= c.end) return c;
      }
      return null;
    }
  };

  window.Captions = Captions;
})();
