/* ViraCut AI — tx-flow2.js — TemplateX: slots, generator, creator */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  /* ================= SLOTS ================= */
  var slTpl = null, slSlots = [], slMood = null, slMusicFile = null, slQuality = 720;
  window.TXSlots = {
    open: function (id) {
      var tpl = TX.get(id);
      if (!tpl) return;
      slTpl = tpl; slSlots = [];
      for (var i = 1; i <= tpl.slots; i++) slSlots.push({ n: i, file: null, url: null, type: null });
      slMood = tpl.music.mood || 'soft'; slMusicFile = null; slQuality = 720;
      var scr = document.getElementById('screen-txslots');
      scr.innerHTML =
        '<button class="back-btn" id="txSlBack">‹ Back</button>' +
        '<h2 class="page-title">📷 ' + esc(tpl.title) + '</h2>' +
        '<p class="page-sub">Add ' + tpl.slots + ' photos/videos — tap a slot to pick, tap again to replace.</p>' +
        '<div id="txSlotGrid" class="tx-slot-grid"></div>' +
        '<div class="card"><h4>🎵 Music</h4><div class="pills" id="txMusicPills"></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="txMusicUp">＋ Upload my music</button></div></div>' +
        '<div class="card"><h4>⚙️ Quality</h4><div class="pills" id="txQuality">' +
        '<button class="pill on" data-q="720">720p</button><button class="pill" data-q="1080">1080p</button></div></div>' +
        '<button class="btn primary block big" id="txGenerate">▶ Generate Video</button>';
      scr.querySelector('#txSlBack').onclick = function () { TXDetail.open(tpl.id); };
      this.renderMusic(); this.renderQuality(); this.render();
      var self = this;
      scr.querySelector('#txGenerate').onclick = function () { self.generate(); };
      App.show('screen-txslots');
    },
    render: function () {
      var grid = document.getElementById('txSlotGrid');
      if (!grid) return;
      grid.innerHTML = '';
      slSlots.forEach(function (s) {
        var d = document.createElement('button');
        d.className = 'tx-slot' + (s.url ? ' filled' : '');
        if (s.url) {
          d.innerHTML = s.type === 'video'
            ? '<video src="' + s.url + '" muted playsinline preload="metadata"></video>'
            : '<img src="' + s.url + '" alt="">';
          d.innerHTML += '<span class="slot-label">Slot ' + s.n + '</span><span class="slot-replace">↺ replace</span>';
        } else {
          d.innerHTML = '<span class="slot-plus">＋</span><span class="slot-label">Slot ' + s.n + '</span>';
        }
        d.onclick = function () { TXSlots.pick(s); };
        grid.appendChild(d);
      });
      var done = slSlots.filter(function (s) { return s.url; }).length;
      var btn = document.getElementById('txGenerate');
      if (btn) btn.textContent = done >= slTpl.slots ? '▶ Generate Video' : '▶ Generate (' + done + '/' + slTpl.slots + ')';
    },
    pick: function (s) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'video/*,image/*';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        if (s.url) { try { URL.revokeObjectURL(s.url); } catch (e) {} }
        s.file = f; s.url = URL.createObjectURL(f);
        s.type = f.type.indexOf('video') === 0 ? 'video' : 'photo';
        TXSlots.render();
      };
      inp.click();
    },
    renderMusic: function () {
      var box = document.getElementById('txMusicPills');
      if (!box) return;
      box.innerHTML = '';
      TXMusic.moods().forEach(function (m) {
        var b = document.createElement('button');
        b.className = 'pill' + (slMood === m && !slMusicFile ? ' on' : '');
        b.textContent = '🎵 ' + TXMusic.moodName(m);
        b.onclick = function () { slMood = m; slMusicFile = null; TXSlots.renderMusic(); };
        box.appendChild(b);
      });
      if (slMusicFile) {
        var tag = document.createElement('span');
        tag.className = 'pill on'; tag.textContent = '🎵 ' + slMusicFile.name.slice(0, 18);
        box.appendChild(tag);
      }
      document.getElementById('txMusicUp').onclick = function () {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = function () {
          if (inp.files[0]) { slMusicFile = inp.files[0]; slMood = null; TXSlots.renderMusic(); toast('Music attached.'); }
        };
        inp.click();
      };
    },
    renderQuality: function () {
      var box = document.getElementById('txQuality');
      if (!box) return;
      box.querySelectorAll('.pill').forEach(function (b) {
        b.classList.toggle('on', +b.dataset.q === slQuality);
        b.onclick = function () { slQuality = +b.dataset.q; TXSlots.renderQuality(); };
      });
    },
    generate: function () {
      var missing = slSlots.filter(function (s) { return !s.url; }).length;
      var go = function () { TXGen.start({ tpl: slTpl, slots: slSlots, musicMood: slMood, musicFile: slMusicFile, quality: slQuality }); };
      if (missing) {
        App.modal('<h3>📷 ' + missing + ' slot' + (missing > 1 ? 's' : '') + ' empty</h3>' +
          '<p class="muted">Fill all slots for the best result — or generate anyway and empty slots show stylish placeholders.</p>' +
          '<div class="row" style="margin-top:12px"><button class="btn primary" id="sgGo" style="flex:1">Generate anyway</button>' +
          '<button class="btn ghost" id="sgNo">Keep editing</button></div>',
          function (root) {
            root.querySelector('#sgNo').onclick = App.closeModal;
            root.querySelector('#sgGo').onclick = function () { App.closeModal(); go(); };
          });
      } else go();
    }
  };

  /* ================= GENERATOR ================= */
  var genRunning = false, genBlob = null, genUrl = null;
  var TRANS_DUR = 0.45;
  window.TXGen = {
    start: function (state) {
      if (genRunning) return;
      genRunning = true;
      var tpl = state.tpl, C = TXCore;
      TXGen._lastState = state;
      try { if (window.TXStats) TXStats.use(tpl.id); } catch (e) {}
      var _s = state.quality === 1080 ? 1080 : 720;
      var _d = tpl.aspect === '1:1' ? [_s, _s] : tpl.aspect === '16:9' ? [_s, Math.round(_s * 9 / 16)] : [_s, Math.round(_s * 16 / 9)];
      var W = _d[0], H = _d[1], total = tpl.duration;
      var starts = C.startsFor(tpl);

      var scr = document.getElementById('screen-txgen');
      scr.innerHTML =
        '<h2 class="page-title">✨ Creating your video</h2>' +
        '<div class="tx-gen-wrap"><canvas id="txGenCanvas" width="216" height="384"></canvas>' +
        '<div class="prog"><div class="prog-fill" id="txGenFill"></div></div>' +
        '<p class="muted" id="txGenLabel">Rendering scenes…</p></div>';
      App.show('screen-txgen');

      function mkC() { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
      var cv = mkC(), g = cv.getContext('2d');
      var frame = mkC(), fg = frame.getContext('2d');
      var prevF = mkC(), pg2 = prevF.getContext('2d');
      var flatC = mkC(), flatX = flatC.getContext('2d');
      var pv = document.getElementById('txGenCanvas'), pg = pv.getContext('2d');

      var mediaBySlot = {};
      state.slots.forEach(function (s) {
        if (!s.url) return;
        if (s.type === 'video') {
          var v = document.createElement('video');
          v.src = s.url; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
          var rec = mediaBySlot[s.n] = { el: v, sw: 1280, sh: 720, ok: false, video: true };
          v.onloadedmetadata = function () { rec.sw = v.videoWidth || 1280; rec.sh = v.videoHeight || 720; rec.ok = true; };
          v.onerror = function () { mediaBySlot[s.n] = null; };
        } else {
          var im = new Image();
          var rec2 = mediaBySlot[s.n] = { el: im, sw: 720, sh: 1280, ok: false };
          im.onload = function () { rec2.sw = im.naturalWidth; rec2.sh = im.naturalHeight; rec2.ok = true; };
          im.onerror = function () { mediaBySlot[s.n] = null; };
          im.src = s.url;
        }
      });

      var AC = window.AudioContext || window.webkitAudioContext;
      var actx = new AC(), dest = actx.createMediaStreamDestination();
      var musicReady = state.musicFile
        ? state.musicFile.arrayBuffer().then(function (b) { return actx.decodeAudioData(b); }).catch(function () { return null; })
        : TXMusic.buildLoop(state.musicMood || 'soft', total + 1);

      var stream = cv.captureStream(30);
      var mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].filter(function (m) {
        try { return window.MediaRecorder && MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
      })[0] || '';
      var chunks = [], rec = null;
      try {
        var combined = new MediaStream(stream.getVideoTracks().concat(dest.stream.getAudioTracks()));
        rec = new MediaRecorder(combined, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined);
      } catch (e) { toast('Recording not supported on this device.', true); genRunning = false; return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

      var ovlParts = C.ovlPartsFor(tpl);
      var fill = document.getElementById('txGenFill'), label = document.getElementById('txGenLabel');
      var t0 = performance.now(), curScene = -1, finished = false;

      function draw(t) {
        var idx = C.sceneAt(tpl, starts, Math.min(t, total - 0.001));
        var local = t - starts[idx], sc = tpl.scenes[idx];
        if (idx !== curScene) {
          curScene = idx;
          var m = mediaBySlot[sc.slot];
          if (m && m.video) { try { m.el.currentTime = 0; m.el.play(); } catch (e) {} }
          label.textContent = 'Scene ' + (idx + 1) + ' / ' + tpl.scenes.length + '…';
        }
        var tr = sc.trans || 'cut';
        if (idx > 0 && tr !== 'cut' && local < TRANS_DUR) {
          var k = local / TRANS_DUR, pi = idx - 1;
          var pl = Math.max(0, tpl.scenes[pi].dur - (TRANS_DUR - local));
          C.composeScene(pg2, flatX, flatC, tpl, ovlParts, mediaBySlot, pi, pl, t, W, H);
          C.composeScene(fg, flatX, flatC, tpl, ovlParts, mediaBySlot, idx, local, t, W, H);
          g.save();
          g.drawImage(prevF, 0, 0);
          if (tr === 'fade') { g.globalAlpha = k; g.drawImage(frame, 0, 0); }
          else if (tr === 'slide') { g.drawImage(frame, W * (1 - k), 0); }
          else if (tr === 'zoom') {
            g.globalAlpha = k;
            var z = 1.25 - 0.25 * k;
            g.translate(W / 2, H / 2); g.scale(z, z);
            g.drawImage(frame, -W / 2, -H / 2);
          }
          g.restore();
        } else {
          C.composeScene(fg, flatX, flatC, tpl, ovlParts, mediaBySlot, idx, local, t, W, H);
          g.drawImage(frame, 0, 0);
        }
        pg.drawImage(cv, 0, 0, pv.width, pv.height);
        fill.style.width = Math.min(100, (t / total) * 100).toFixed(1) + '%';
      }

      function finish() {
        if (finished) return;
        finished = true; genRunning = false;
        try { rec.stop(); } catch (e) {}
        try { actx.close(); } catch (e) {}
        setTimeout(function () {
          genBlob = new Blob(chunks, { type: 'video/webm' });
          if (genUrl) { try { URL.revokeObjectURL(genUrl); } catch (e) {} }
          genUrl = URL.createObjectURL(genBlob);
          TXGen.showResult(tpl, total, state);
        }, 400);
      }

      musicReady.then(function (buf) {
        if (!genRunning) return;
        if (buf) {
          var src = actx.createBufferSource();
          src.buffer = buf; src.loop = true; src.connect(dest);
          try { src.start(0); } catch (e) {}
        }
        try { actx.resume(); } catch (e) {}
        rec.start(250);
        (function loop() {
          if (!genRunning) return;
          var t = (performance.now() - t0) / 1000;
          if (t >= total) { finish(); return; }
          try { draw(t); } catch (e) { finish(); return; }
          requestAnimationFrame(loop);
        })();
      });

      TXGen._cancel = function () { genRunning = false; try { rec.stop(); } catch (e) {} try { actx.close(); } catch (e) {} };
    },
    showResult: function (tpl, total, state) {
      var scr = document.getElementById('screen-txresult');
      scr.innerHTML =
        '<button class="back-btn" id="txRsBack">‹ Templates</button>' +
        '<h2 class="page-title">🎉 Your video is ready</h2>' +
        '<video id="txRsVideo" src="' + genUrl + '" controls playsinline></video>' +
        '<div class="row"><button class="btn primary" id="txRsSave" style="flex:1">⬇ Save</button>' +
        '<button class="btn ghost" id="txRsShare" style="flex:1">📤 Share</button></div>' +
        '<div class="row" style="margin-top:8px">' +
        '<button class="btn ghost sm" id="txRsRestart" style="flex:1">↺ Restart template</button>' +
        '<button class="btn ghost sm" id="txRsEdit" style="flex:1">✏️ Edit media</button></div>' +
        '<div class="row" style="margin-top:8px">' +
        '<button class="btn ghost sm" id="txRsTplEdit" style="flex:1">🎬 Edit template</button></div>' +
        '<p class="fineprint">WebM format — MP4 comes with the native build.</p>';
      scr.querySelector('#txRsBack').onclick = function () { App.show('screen-templates'); TXBrowse.render(); };
      scr.querySelector('#txRsSave').onclick = function () {
        var a = document.createElement('a');
        a.href = genUrl; a.download = 'viracut-template-' + Date.now() + '.webm';
        document.body.appendChild(a); a.click(); a.remove();
        toast('Video saved.');
      };
      scr.querySelector('#txRsShare').onclick = function () {
        var f = new File([genBlob], 'viracut-template.webm', { type: 'video/webm' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: 'ViraCut template video' }).catch(function () {});
        } else {
          App.modal('<h3>📤 Share</h3><p class="muted">Direct share isn\'t available here — save the video, then share it from your gallery to TikTok, Instagram or Facebook.</p>' +
            '<div class="row" style="margin-top:12px"><button class="btn primary" id="shOk" style="flex:1">OK</button></div>',
            function (root) { root.querySelector('#shOk').onclick = App.closeModal; });
        }
      };
      scr.querySelector('#txRsRestart').onclick = function () { TXSlots.open(tpl.id); };
      scr.querySelector('#txRsEdit').onclick = function () { TXSlots.open(tpl.id); };
      var te = scr.querySelector('#txRsTplEdit');
      if (te) te.onclick = function () { TXEdit.open(); };
      App.show('screen-txresult');
    },
    cancel: function () { if (TXGen._cancel) TXGen._cancel(); }
  };

  /* ================= CREATOR ================= */
  var crCat = 'trending', crAspect = '9:16';
  function crSelOpts(list, cur) {
    return list.map(function (o) {
      return '<option value="' + o.id + '"' + (o.id === cur ? ' selected' : '') + '>' + esc(o.name) + '</option>';
    }).join('');
  }
  function crSceneBox(n) {
    var d = document.createElement('div');
    d.className = 'scene-box';
    d.innerHTML =
      '<div class="row" style="align-items:center"><h5 style="flex:1;margin:0">Scene ' + n + '</h5>' +
      '<button class="btn danger sm" data-del>✕</button></div>' +
      '<div class="scene-grid" style="margin-top:8px">' +
      '<div><label class="lbl">Slot #</label><input type="number" data-f="slot" min="1" max="20" value="' + n + '"></div>' +
      '<div><label class="lbl">Duration (s)</label><input type="number" data-f="dur" min="0.5" max="10" step="0.5" value="1.2"></div>' +
      '<div><label class="lbl">Animation</label><select data-f="anim">' + crSelOpts(TXANIMS, 'kenburns-in') + '</select></div>' +
      '<div><label class="lbl">Effect</label><select data-f="fx">' +
      FX.list().map(function (f) { return '<option value="' + f.id + '"' + (f.id === 'punch' ? ' selected' : '') + '>' + f.icon + ' ' + esc(f.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lbl">Filter</label><select data-f="filter">' +
      Object.keys(TXFILTERS).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lbl">Transition in</label><select data-f="trans">' + crSelOpts(TXTRANS, 'cut') + '</select></div>' +
      '<div class="full"><label class="lbl">Text (optional)</label><input type="text" data-f="text" placeholder="Your caption…"></div>' +
      '<div><label class="lbl">Text pos</label><select data-f="tpos"><option value="top">Top</option><option value="mid" selected>Middle</option><option value="bottom">Bottom</option></select></div>' +
      '<div><label class="lbl">Text color</label><input type="color" data-f="tcolor" value="#ffffff" style="height:38px"></div>' +
      '</div>';
    d.querySelector('[data-del]').onclick = function () { d.remove(); TXCreate.renumber(); };
    return d;
  }
  window.TXCreate = {
    render: function () {
      var scr = document.getElementById('screen-txcreate');
      scr.innerHTML =
        '<button class="back-btn" id="txCrBack">‹ Templates</button>' +
        '<h2 class="page-title">🛠️ Template Creator</h2>' +
        '<p class="page-sub">Design once — everyone reuses it.</p>' +
        '<div class="card"><label class="lbl">Template title</label><input type="text" id="txCrTitle" placeholder="My awesome template">' +
        '<label class="lbl">Category</label><div class="pills" id="txCrCats"></div>' +
        '<label class="lbl">Aspect</label><div class="pills" id="txCrAspect">' +
        '<button class="pill on" data-a="9:16">9:16</button><button class="pill" data-a="1:1">1:1</button><button class="pill" data-a="16:9">16:9</button></div>' +
        '<label class="lbl">Music name</label><input type="text" id="txCrMusic" placeholder="e.g. Party Drop"></div>' +
        '<div class="card"><div class="row" style="align-items:center"><h4 style="flex:1;margin:0">🎞️ Scenes</h4>' +
        '<button class="btn primary sm" id="txCrAddScene">＋ Add scene</button></div><div id="txCrScenes"></div></div>' +
        '<button class="btn primary block big" id="txCrSave">💾 Save Template</button>';
      var cc = scr.querySelector('#txCrCats');
      TX.categories().filter(function (c) { return c.id !== 'my'; }).forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'pill' + (crCat === c.id ? ' on' : '');
        b.textContent = c.icon + ' ' + c.name;
        b.onclick = function () { crCat = c.id; cc.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); };
        cc.appendChild(b);
      });
      scr.querySelectorAll('#txCrAspect .pill').forEach(function (b) {
        b.classList.toggle('on', b.dataset.a === crAspect);
        b.onclick = function () {
          crAspect = b.dataset.a;
          scr.querySelectorAll('#txCrAspect .pill').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        };
      });
      var box = scr.querySelector('#txCrScenes');
      scr.querySelector('#txCrAddScene').onclick = function () { box.appendChild(crSceneBox(box.children.length + 1)); };
      for (var i = 1; i <= 3; i++) box.appendChild(crSceneBox(i));
      scr.querySelector('#txCrBack').onclick = function () { App.show('screen-templates'); TXBrowse.render(); };
      scr.querySelector('#txCrSave').onclick = function () { TXCreate.save(); };
      App.show('screen-txcreate');
    },
    renumber: function () {
      document.querySelectorAll('#txCrScenes .scene-box h5').forEach(function (h, i) { h.textContent = 'Scene ' + (i + 1); });
    },
    save: function () {
      var scr = document.getElementById('screen-txcreate');
      var title = scr.querySelector('#txCrTitle').value.trim();
      if (!title) { toast('Give your template a title.', true); return; }
      var boxes = scr.querySelectorAll('#txCrScenes .scene-box');
      if (!boxes.length) { toast('Add at least one scene.', true); return; }
      var scenes = [], maxSlot = 0;
      boxes.forEach(function (b) {
        function v(f) { var el = b.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; }
        var slot = Math.max(1, parseInt(v('slot'), 10) || 1);
        var dur = Math.min(10, Math.max(0.5, parseFloat(v('dur')) || 1.2));
        maxSlot = Math.max(maxSlot, slot);
        var sc = { slot: slot, dur: dur, anim: v('anim'), fx: v('fx'), filter: v('filter'), trans: v('trans') };
        var tx = v('text').trim();
        if (tx) sc.text = { content: tx, pos: v('tpos'), color: v('tcolor'), size: 8, anim: 'pop' };
        scenes.push(sc);
      });
      var tpl = {
        id: 'custom_' + Date.now().toString(36),
        title: title, icon: '🛠️', category: crCat, aspect: crAspect,
        slots: maxSlot,
        music: { name: scr.querySelector('#txCrMusic').value.trim() || 'Custom Mix (AI loop)', mood: 'soft' },
        scenes: scenes, overlays: [], custom: true,
        duration: scenes.reduce(function (a, s) { return a + s.dur; }, 0)
      };
      TX.saveCustom(tpl);
      toast('Template saved! 🎉');
      App.show('screen-templates');
      TXBrowse.setCat('my'); TXBrowse.render();
    }
  };
})();

/* ================= TEMPLATE EDITOR =================
 * Post-generate editing: reorder scenes, timing, transition, filter,
 * effect, text, add/remove scenes, change music. Regenerates video. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  var draft = null, baseState = null;

  function selOpts(list, cur, label) {
    return list.map(function (o) {
      var id = o.id || o, name = o.name || o;
      return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(label ? label(o) : name) + '</option>';
    }).join('');
  }

  function renderList() {
    var box = document.getElementById('txEdScenes');
    if (!box || !draft) return;
    box.innerHTML = '';
    draft.scenes.forEach(function (sc, i) {
      var d = document.createElement('div');
      d.className = 'scene-box';
      d.innerHTML =
        '<div class="row" style="align-items:center"><h5 style="flex:1;margin:0">Scene ' + (i + 1) + '</h5>' +
        '<button class="btn ghost sm" data-mv="-1">▲</button>' +
        '<button class="btn ghost sm" data-mv="1">▼</button>' +
        '<button class="btn danger sm" data-del>✕</button></div>' +
        '<div class="scene-grid" style="margin-top:8px">' +
        '<div><label class="lbl">Clip slot #</label><input type="number" data-f="slot" min="1" max="20" value="' + sc.slot + '"></div>' +
        '<div><label class="lbl">Duration (s)</label><div class="row"><button class="btn ghost sm" data-dur="-0.5">−</button>' +
        '<b style="flex:1;text-align:center" data-durv>' + sc.dur.toFixed(1) + '</b>' +
        '<button class="btn ghost sm" data-dur="0.5">＋</button></div></div>' +
        '<div><label class="lbl">Animation</label><select data-f="anim">' + selOpts(TXANIMS, sc.anim) + '</select></div>' +
        '<div><label class="lbl">Effect</label><select data-f="fx">' +
        FX.list().map(function (f) { return '<option value="' + f.id + '"' + (f.id === sc.fx ? ' selected' : '') + '>' + f.icon + ' ' + esc(f.name) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="lbl">Filter</label><select data-f="filter">' +
        Object.keys(TXFILTERS).map(function (k) { return '<option value="' + k + '"' + (k === sc.filter ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="lbl">Transition in</label><select data-f="trans">' + selOpts(TXTRANS, sc.trans || 'cut') + '</select></div>' +
        '<div class="full"><label class="lbl">Text</label><input type="text" data-f="text" value="' + esc((sc.text && sc.text.content) || '') + '" placeholder="Caption…"></div>' +
        '</div>';
      d.querySelector('[data-del]').onclick = function () {
        if (draft.scenes.length <= 1) { toast('A template needs at least 1 scene.', true); return; }
        draft.scenes.splice(i, 1); renderList();
      };
      d.querySelectorAll('[data-mv]').forEach(function (b) {
        b.onclick = function () {
          var j = i + (+b.getAttribute('data-mv'));
          if (j < 0 || j >= draft.scenes.length) return;
          var tmp = draft.scenes[i]; draft.scenes[i] = draft.scenes[j]; draft.scenes[j] = tmp;
          renderList();
        };
      });
      d.querySelectorAll('[data-f]').forEach(function (el) {
        el.onchange = function () {
          var f = el.getAttribute('data-f');
          if (f === 'slot') sc.slot = Math.max(1, parseInt(el.value, 10) || 1);
          else if (f === 'text') {
            var v = el.value.trim();
            if (v) sc.text = Object.assign({ pos: 'mid', color: '#ffffff', size: 8, anim: 'pop' }, sc.text, { content: v });
            else delete sc.text;
          } else sc[f] = el.value;
        };
      });
      d.querySelectorAll('[data-dur]').forEach(function (b) {
        b.onclick = function () {
          sc.dur = Math.min(10, Math.max(0.5, Math.round((sc.dur + parseFloat(b.getAttribute('data-dur'))) * 10) / 10));
          d.querySelector('[data-durv]').textContent = sc.dur.toFixed(1);
        };
      });
      box.appendChild(d);
    });
  }

  function recompute() {
    draft.duration = draft.scenes.reduce(function (a, s) { return a + s.dur; }, 0);
    draft.slots = draft.scenes.reduce(function (a, s) { return Math.max(a, s.slot); }, 0);
  }

  window.TXEdit = {
    open: function () {
      var st = TXGen._lastState;
      if (!st || !st.tpl) { toast('Generate a video first.', true); return; }
      baseState = st;
      draft = JSON.parse(JSON.stringify(st.tpl));
      var scr = document.getElementById('screen-txedit');
      scr.innerHTML =
        '<button class="back-btn" id="txEdBack">‹ Result</button>' +
        '<h2 class="page-title">🎬 Edit Template</h2>' +
        '<p class="page-sub">' + esc(draft.title) + ' — tweak scenes, then regenerate.</p>' +
        '<div class="card"><label class="lbl">Music mood</label><div class="pills" id="txEdMoods"></div></div>' +
        '<div class="card"><div class="row" style="align-items:center"><h4 style="flex:1;margin:0">🎞️ Scenes</h4>' +
        '<button class="btn primary sm" id="txEdAdd">＋ Add scene</button></div><div id="txEdScenes"></div></div>' +
        '<button class="btn primary block big" id="txEdRegen">▶ Regenerate Video</button>' +
        '<button class="btn ghost block" id="txEdSaveAs" style="margin-top:8px">💾 Save as my template</button>';
      var moods = scr.querySelector('#txEdMoods');
      var curMood = st.musicMood || (draft.music && draft.music.mood) || 'soft';
      TXMusic.moods().forEach(function (m) {
        var b = document.createElement('button');
        b.className = 'pill' + (m === curMood ? ' on' : '');
        b.textContent = '🎵 ' + TXMusic.moodName(m);
        b.onclick = function () {
          baseState.musicMood = m; baseState.musicFile = null;
          moods.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        };
        moods.appendChild(b);
      });
      scr.querySelector('#txEdBack').onclick = function () { App.show('screen-txresult'); };
      scr.querySelector('#txEdAdd').onclick = function () {
        var maxSlot = draft.scenes.reduce(function (a, s) { return Math.max(a, s.slot); }, 0);
        draft.scenes.push({ slot: maxSlot + 1, dur: 1.5, anim: 'kenburns-in', fx: 'punch', filter: 'none', trans: 'cut' });
        renderList(); toast('Scene added — pick media for slot ' + (maxSlot + 1) + ' or it shows a placeholder.');
      };
      scr.querySelector('#txEdRegen').onclick = function () {
        recompute();
        TXGen.start({ tpl: draft, slots: baseState.slots, musicMood: baseState.musicMood, musicFile: baseState.musicFile, quality: baseState.quality });
      };
      scr.querySelector('#txEdSaveAs').onclick = function () {
        recompute();
        var copy = JSON.parse(JSON.stringify(draft));
        copy.id = 'custom_' + Date.now().toString(36);
        copy.custom = true; copy.icon = '🛠️'; copy.title = draft.title + ' (edit)';
        TX.saveCustom(copy);
        toast('Saved to My Templates 🎉');
      };
      renderList();
      App.show('screen-txedit');
    }
  };
})();
