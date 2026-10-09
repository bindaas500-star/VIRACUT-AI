/* ViraCut AI — ai-story.js
   100% OFFLINE template-based story generator. This genuinely works:
   idea in → title, hook, story, scene breakdown, voiceover script, ending.
   buildProject() turns a story into an editable project (title-card clips
   + timed captions) so "Generate Full Video" gives a real starting point. */
(function () {
  'use strict';

  /* ---------- utils ---------- */
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
  function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fill(tpl, k) {
    return tpl.replace(/\{a\}/g, k[0]).replace(/\{b\}/g, k[1]).replace(/\{c\}/g, k[2]);
  }

  var EN_STOP = ('a,an,the,and,or,but,of,to,in,on,at,for,with,about,into,my,your,his,her,its,our,their,' +
    'is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,' +
    'i,you,he,she,we,they,it,this,that,these,those,make,makes,making,video,story,short,viral,' +
    'lost,last,new,old,big,small,good,bad,first,dark,mysterious,abandoned,haunted,creepy,scary,funny').split(',');

  function keywords(idea, stop, fallback, asciiOnly) {
    var words = (idea || '').toLowerCase().replace(/[^a-z\u0600-\u06FF\s]/g, ' ').split(/\s+/);
    var out = [];
    words.forEach(function (w) {
      if (asciiOnly && !/^[a-z]+$/.test(w)) return;
      if (w.length > 2 && stop.indexOf(w) < 0 && out.indexOf(w) < 0) out.push(w);
    });
    while (out.length < 3) out.push(fallback[out.length % fallback.length]);
    return out.slice(0, 3);
  }

  /* ================= ENGLISH BANK ================= */
  var EN = {
    titles: [
      'The {A} Secret', 'What the {A} Was Hiding', 'The Last {A}', '{A}: A Short Mystery',
      'Nobody Expected the {A}', 'The {A} Changed Everything', 'Midnight and the {A}',
      'The Truth About the {A}'
    ],
    hooks: [
      'Nobody believed it — until the {a} proved them wrong.',
      'It started like any other day. Then the {a} appeared.',
      'Three seconds. That is all it took for the {a} to change everything.',
      'Everyone ignored the {a}. That was their first mistake.',
      'The {a} had been waiting. And tonight, it would not wait anymore.'
    ],
    openers: [
      'In a quiet place forgotten by time, a {a} held a secret no one dared to ask about.',
      'Every evening, the {a} appeared in the same spot — and nobody knew why.',
      'People whispered about the {a}, but whispers never told the whole story.'
    ],
    middles: [
      'Then one {b}, everything shifted. The {a} was no longer just a {a}.',
      'The {c} came without warning, and the {a} finally revealed its true face.',
      'Fear mixed with curiosity as the {b} drew closer to the {a}.',
      'What looked like a simple {a} turned out to be the key to the {b}.',
      'The {a} remembered every {c} — and it was done staying silent.'
    ],
    twists: [
      'But the real shock was not the {a}. It was what the {a} had been protecting all along.',
      'In the end, the {a} was never the danger. The danger was ignoring it.',
      'And just like that, the {b} understood: the {a} had been a gift, not a curse.'
    ],
    endings: [
      'Some stories end. This one just begins — with you.',
      'The {a} is still out there. Waiting. Watching. Remember that.',
      'If you ever see the {a}, do not run. Listen.',
      'And that is why, to this day, no one speaks of the {a} lightly.'
    ],
    visuals: [
      'Cinematic vertical 9:16 shot of {a}, dramatic low angle, volumetric fog, teal-orange grade, shallow depth of field',
      'Close-up of {a} under flickering light, suspenseful mood, film grain, dark shadows, anamorphic feel',
      'Wide establishing shot revealing {a} and {b}, storm clouds gathering, epic scale, cinematic color',
      'Slow push-in on {a}, dust particles floating, warm rim light against deep blue night',
      'Overhead drone-style shot of {a} near {c}, mysterious atmosphere, moonlight, ultra detailed',
      'Extreme close-up: texture of {a}, heartbeat pacing, tension building, noir lighting'
    ],
    voices: [
      'Nobody saw it coming. Not the {b}. Not even me.',
      'The {a} was closer than we thought. Much closer.',
      'Every {c} led to this single moment.',
      'I should have listened. We all should have.',
      'This is the part they never tell you about the {a}.'
    ]
  };

  /* ================= URDU BANK ================= */
  var UR_STOP = ('ka,ki,ke,ko,se,me,ne,par,aur,ya,lekin,magar,jo,ye,wo,yhe,woh,hai,hain,tha,thi,the,ho,ga,gi,ge,' +
    'ek,do,mera,meri,mere,tum,ap,video,story,banayo,banao,ki,ka').split(',');
  var UR = {
    titles: [
      '{A} Ka Raaz', '{A} Ki Haqeeqat', 'Aakhri {A}', '{A} — Ek Mukhtasir Kahani',
      '{A} Ne Sab Badal Diya', 'Aadhi Raat Aur {A}', '{A} Ka Sach'
    ],
    hooks: [
      'Kisi ne yaqeen na kiya — jab tak {a} ne sab saabit na kar diya.',
      'Din aam sa tha. Phir {a} saamne aa gaya.',
      'Sirf teen second. Itne me {a} ne sab kuch badal diya.',
      'Sab ne {a} ko nazar-andaaz kiya. Yehi unki pehli ghalti thi.'
    ],
    openers: [
      'Waqt ke bhoole hue ek konay me, {a} ek aisa raaz liye tha jise poochne ki himmat kisi me na thi.',
      'Har shaam {a} usi jagah nazar aata — aur koi na jaanta ke kyun.',
      'Log {a} ke baare me sargoshiyan karte, magar sargoshiyan poori kahani kab batati hain.'
    ],
    middles: [
      'Phir ek {b} ne sab badal diya. {a} ab sirf {a} na raha.',
      '{c} ne dastak di, aur {a} ne aakhir apna asal chehra dikha diya.',
      'Dar aur tajassus ek saath, jab {b} {a} ke qareeb aaya.',
      'Jo mamuli {a} lagta tha, wahi {b} ki kunji nikla.',
      '{a} ko har {c} yaad tha — aur ab woh khamosh rehne wala na tha.'
    ],
    twists: [
      'Magar asal hairat {a} na tha. Asal hairat woh tha jise {a} bacha raha tha.',
      'Aakhir me {a} khatra na tha. Khatra use nazar-andaaz karna tha.',
      'Aur yun {b} samajh gaya: {a} aafat nahi, nemat tha.'
    ],
    endings: [
      'Kuch kahaniyan khatam hoti hain. Ye wahan se shuru hoti hai — tum se.',
      '{a} ab bhi kahin hai. Intezaar me. Yaad rakhna.',
      'Agar kabhi {a} dekho to bhaagna mat. Sunna.',
      'Isi liye aaj tak koi {a} ka zikr halka nahi leta.'
    ],
    visuals: [
      '{a} ka cinematic vertical 9:16 shot, dramatic angle, halki dhund, gehray rang, film jaisa mood',
      '{a} ka close-up, tiddi roshni me, suspense bhara mahol, gehray saaye',
      '{a} aur {b} ka wide shot, kaale baadal, pur-israr faza, cinematic rang',
      '{a} ki taraf slow push-in, hawa me gard, raat ka neela ujala',
      '{a} ka oopar se shot, chaand ki roshni me {c}, pur-asrar mahol'
    ],
    voices: [
      'Kisi ne socha na tha. Na {b} ne. Na maine.',
      '{a} humare khayal se kahin qareeb tha. Bohat qareeb.',
      'Har {c} isi lamhe tak le aaya tha.',
      'Mujhe sun lena chahiye tha. Hum sab ko.',
      'Ye woh hissa hai jo {a} ke baare me koi nahi batata.'
    ]
  };

  /* ================= GENERATOR ================= */
  function gen(idea, lang) {
    lang = (lang === 'ur') ? 'ur' : 'en';
    var B = (lang === 'ur') ? UR : EN;
    var stop = (lang === 'ur') ? UR_STOP : EN_STOP;
    var fallback = (lang === 'ur') ? ['raaz', 'raat', 'kahani'] : ['mystery', 'night', 'secret'];
    var kw = keywords(idea, stop, fallback, lang === 'ur'); // [a,b,c] lowercase
    var K = { 0: kw[0], 1: kw[1], 2: kw[2] };
    var KC = [cap(kw[0]), cap(kw[1]), cap(kw[2])];

    var rnd = mulberry(hash(idea + '|' + lang + '|' + kw.join(',')));
    function F(tpl) {
      return fill(tpl, kw)
        .replace(/\{A\}/g, KC[0]).replace(/\{B\}/g, KC[1]).replace(/\{C\}/g, KC[2]);
    }

    var title = F(pick(rnd, B.titles));
    var hook = F(pick(rnd, B.hooks));
    var storyParts = [hook, F(pick(rnd, B.openers)), F(pick(rnd, B.middles)), F(pick(rnd, B.middles)), F(pick(rnd, B.twists))];
    var story = storyParts.join(' ');
    var ending = F(pick(rnd, B.endings));

    var nScenes = 5;
    var scenes = [];
    var usedV = [], usedVo = [];
    function uniqPick(list, used) {
      var rest = list.filter(function (x) { return used.indexOf(x) < 0; });
      var tpl = pick(rnd, rest.length ? rest : list);
      used.push(tpl);
      return F(tpl);
    }
    for (var i = 0; i < nScenes; i++) {
      var v = uniqPick(B.visuals, usedV);
      var vo = uniqPick(B.voices, usedVo);
      scenes.push({ n: i + 1, visual: cap(v), voice: vo });
    }

    var script = hook + '\n\n' + scenes.map(function (s) { return 'Scene ' + s.n + ': ' + s.voice; }).join('\n') + '\n\n' + ending;

    return { title: title, hook: hook, story: story, scenes: scenes, script: script, ending: ending, lang: lang, idea: idea, keywords: kw };
  }

  /* ---------- title card renderer (canvas → dataURL) ---------- */
  function wrapText(ctx, text, x, y, maxW, lh) {
    var words = text.split(' '), line = '', yy = y;
    for (var i = 0; i < words.length; i++) {
      var t = line + words[i] + ' ';
      if (ctx.measureText(t).width > maxW && i > 0) { ctx.fillText(line, x, yy); line = words[i] + ' '; yy += lh; }
      else line = t;
    }
    ctx.fillText(line, x, yy);
    return yy;
  }
  function sceneCard(story, scene, W, H) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    if (!ctx) return '';
    var g = ctx.createLinearGradient(0, 0, W, H);
    var hue = (scene.n * 47) % 360;
    g.addColorStop(0, 'hsl(' + hue + ',45%,14%)');
    g.addColorStop(1, 'hsl(' + ((hue + 60) % 360) + ',55%,24%)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '800 ' + Math.round(W * 0.075) + 'px sans-serif';
    ctx.fillText('SCENE ' + scene.n, W / 2, H * 0.30);
    ctx.font = '700 ' + Math.round(W * 0.055) + 'px sans-serif';
    ctx.fillStyle = '#C4B5FD';
    wrapText(ctx, story.title, W / 2, H * 0.40, W * 0.84, W * 0.075);
    ctx.font = '400 ' + Math.round(W * 0.042) + 'px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    wrapText(ctx, scene.voice, W / 2, H * 0.58, W * 0.84, W * 0.062);
    ctx.font = '400 ' + Math.round(W * 0.034) + 'px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('Replace with AI visuals later', W / 2, H * 0.90);
    return cv.toDataURL('image/png');
  }

  /* ---------- build a real editable project from a story ---------- */
  function buildProject(story, aspect) {
    if (!story || !story.title || !story.scenes) return null;
    aspect = aspect || '9:16';
    var dims = aspect === '16:9' ? { w: 640, h: 360 } : aspect === '1:1' ? { w: 640, h: 640 } : { w: 540, h: 960 };
    var p = Store.newProject(story.title.slice(0, 40), aspect);
    story.scenes.forEach(function (s) {
      var url = sceneCard(story, s, dims.w, dims.h);
      var id = Store.uid('clip');
      Store.mediaCache.set(id, url); // dataURL works as-is
      p.clips.push({
        id: id, type: 'photo', name: 'Scene ' + s.n, url: url,
        duration: 3, in: 0, out: 3, speed: 1, rotation: 0, fit: 'cover',
        transitionIn: 'none', kb: true
      });
    });
    // captions from script sentences, spread across timeline
    var tm = Store.timing();
    var sentences = story.script.split(/\n+/).join(' ').split(/(?<=[.!?])\s+/).filter(function (s) { return s.trim().length > 3; });
    var per = tm.total / Math.max(1, sentences.length);
    sentences.forEach(function (s, i) {
      p.captions.push({ id: Store.uid('cap'), text: s.trim().slice(0, 90), start: +(i * per).toFixed(2), end: +((i + 1) * per - 0.05).toFixed(2) });
    });
    p.script = story.script;
    p.notes = 'IDEA: ' + story.idea + '\n\nHOOK: ' + story.hook + '\n\nSTORY: ' + story.story +
      '\n\nSCENES:\n' + story.scenes.map(function (s) { return s.n + '. VISUAL: ' + s.visual + '\n   VOICE: ' + s.voice; }).join('\n') +
      '\n\nENDING: ' + story.ending;
    Store.snapshot(); Store.persist();
    return p;
  }

  window.AIStory = { generate: gen, buildProject: buildProject };
})();
