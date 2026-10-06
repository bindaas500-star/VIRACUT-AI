/* ViraCut AI — trending.js — offline idea generator (10 categories).
   Live trend data would need a trends API; these are generated on-device. */
(function () {
  'use strict';

  var CATS = [
    { id: 'trending', name: 'Trending stories', icon: '📈', topics: ['viral challenge twist', 'overnight fame', 'comment-section drama', 'plot twist prank', 'unexpected reunion'] },
    { id: 'funny', name: 'Funny videos', icon: '😂', topics: ['pet fails', 'dad jokes battle', 'expectation vs reality', 'awkward moments', 'sibling pranks'] },
    { id: 'horror', name: 'Horror', icon: '👻', topics: ['haunted room', 'midnight call', 'cursed object', 'shadow figure', 'abandoned house'] },
    { id: 'mystery', name: 'Mystery', icon: '🔍', topics: ['unsolved riddle', 'hidden room', 'strange disappearance', 'coded message', 'the last clue'] },
    { id: 'motivation', name: 'Motivation', icon: '💪', topics: ['zero to hero', 'morning discipline', 'never give up', 'small wins', 'comeback story'] },
    { id: 'islamic', name: 'Islamic content', icon: '🕌', topics: ['prophet stories', 'daily dua reminder', 'gratitude', 'patience in hardship', 'kindness deeds'] },
    { id: 'animals', name: 'Animals', icon: '🐾', topics: ['rescue story', 'funny cat moments', 'wildlife facts', 'loyal dog', 'baby animals'] },
    { id: 'aivideos', name: 'AI videos', icon: '🤖', topics: ['AI vs human art', 'talking pet', 'time travel vlog', 'cartoon yourself', 'impossible places'] },
    { id: 'sports', name: 'Sports', icon: '⚽', topics: ['last-minute goal', 'training grind', 'underdog win', 'top 5 skills', 'comeback match'] },
    { id: 'news', name: 'News-style', icon: '📰', topics: ['60-second explainer', 'tech in 30 seconds', 'myth vs fact', 'today in history', 'quick recap'] }
  ];

  var FORMATS = [
    'POV: {t} — film it in one continuous take',
    'The untold story of {t}, in 30 seconds',
    '{T} but with a shocking twist ending',
    '3 things nobody tells you about {t}',
    'Day in the life: {t} edition',
    'What if {t} happened to you?',
    '{T} — part 1 (cliffhanger ending)'
  ];

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ideas(catId) {
    var cat = null;
    CATS.forEach(function (c) { if (c.id === catId) cat = c; });
    if (!cat) return [];
    var rnd = mulberry(hash(catId + '|' + new Date().toISOString().slice(0, 10)));
    var topics = cat.topics.slice().sort(function () { return rnd() - 0.5; });
    var out = [];
    for (var i = 0; i < 5; i++) {
      var t = topics[i % topics.length];
      var f = FORMATS[Math.floor(rnd() * FORMATS.length)];
      var title = f.replace('{t}', t).replace('{T}', t.charAt(0).toUpperCase() + t.slice(1));
      out.push({
        title: title,
        hook: 'Hook: open with the most intense 2 seconds of "' + t + '" — no intro, straight in.',
        idea: title
      });
    }
    return out;
  }

  window.Trending = { CATEGORIES: CATS, ideas: ideas };
})();
