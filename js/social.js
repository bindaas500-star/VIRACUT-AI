/* ViraCut AI — social.js — offline template-based Social Kit generator */
(function () {
  'use strict';

  function kws(title) {
    var stop = ('a,an,the,and,or,of,to,in,on,my,your,this,that,with,for,video,short,viral').split(',');
    return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length > 2 && stop.indexOf(w) < 0; }).slice(0, 4);
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function generate(project) {
    var title = (project && project.name ? project.name : 'My Viral Video').replace(/\(copy\)/g, '').trim() || 'My Viral Video';
    var kw = kws(title);
    var tag = kw.length ? kw.map(cap).join(' ') : 'Viral Story';
    var hash = kw.map(function (w) { return '#' + w.replace(/\s/g, ''); });

    var ytTitle = '🔥 ' + cap(title).slice(0, 60) + ' #shorts';
    var tiktok = 'POV: ' + title + ' 😱🔥\nWait for the end… 👀\n.\n.\n#fyp #viral #shorts ' + hash.slice(0, 3).join(' ');
    var ig = '🎬 ' + cap(title) + '\n\nDouble tap if you felt that ❤️\nFollow for daily videos ✦\n.\n.\n#reels #reelsinstagram #viralreels ' + hash.slice(0, 3).join(' ');
    var desc = cap(title) + ' — a ViraCut AI short.\n\n' +
      'Watch till the end for the twist!\n\n' +
      '🔔 Subscribe for daily AI shorts\n' +
      '💬 Comment your favorite moment\n\n' +
      '#shorts #viral ' + hash.join(' ');
    var hashtags = ['#shorts', '#viral', '#fyp', '#reels', '#trending', '#aiart', '#storytime']
      .concat(hash).slice(0, 15);
    var thumbs = [
      'YOU WON\'T BELIEVE THIS 😱',
      cap(tag).toUpperCase().slice(0, 28),
      'WAIT FOR THE END… 👀'
    ];

    return { ytTitle: ytTitle, tiktok: tiktok, ig: ig, description: desc, hashtags: hashtags, thumbs: thumbs, title: title };
  }

  window.SocialKit = { generate: generate };
})();
