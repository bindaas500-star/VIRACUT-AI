/* ViraCut AI — editor.js (3/3): tool buttons + panels */
(function () {
  'use strict';
  var Editor = window.Editor;

  var TOOLS = [
    { id: 'edit', label: '✂️ Edit' }, { id: 'audio', label: '🎵 Audio' },
    { id: 'text', label: '🔤 Text' }, { id: 'fx', label: '✨ Effects' },
    { id: 'overlay', label: '🖼️ Overlay' }, { id: 'captions', label: '💬 Captions' },
    { id: 'filter', label: '🎨 Filters' }, { id: 'adjust', label: '🎚️ Adjust' },
    { id: 'transition', label: '⋈ Transitions' }, { id: 'sticker', label: '😀 Stickers' },
    { id: 'ai', label: '🤖 AI' }
  ];

  Editor.renderTools = function () {
    var self = this, el = document.getElementById('edTools');
    el.innerHTML = '';
    TOOLS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tb-btn' + (self.tool === t.id ? ' on' : '');
      var parts = t.label.split(' ');
      b.innerHTML = '<span class="ic">' + parts[0] + '</span><span>' + parts.slice(1).join(' ') + '</span>';
      b.onclick = function () { self.onToolTap(t.id); };
      el.appendChild(b);
    });
  };
  Editor.onToolTap = function (id) {
    if (id === 'edit') {
      var c = this.selClip();
      if (!c) {
        // select clip under playhead if any
        var found = Store.clipAt(this.t);
        if (found && found.item.clip.url) {
          this.selClipId = found.item.clip.id;
          this.renderTimeline(); this.drawOnce();
          toast('Clip selected — edit actions above.');
        } else toast('Select a clip in the timeline first.', true);
        return;
      }
      this.setTool(null); // strip is already visible
      var strip = document.getElementById('edClipStrip');
      if (strip) strip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    this.setTool(this.tool === id ? null : id);
  };
  Editor.setTool = function (id) {
    this.tool = id; this.placingSticker = null;
    document.getElementById('edStickerLayer').style.pointerEvents = 'none';
    this.renderTools(); this.renderPanel(); this.renderClipStrip();
  };

  Editor.renderPanel = function () {
    var el = document.getElementById('edPanel');
    var sheet = document.getElementById('edSheet');
    var backdrop = document.getElementById('edSheetBackdrop');
    var fn = this['panel_' + this.tool];
    el.innerHTML = '';
    if (!fn) { this.closeSheet(); return; }
    fn.call(this, el);
    sheet.style.display = 'flex';
    backdrop.style.display = 'block';
    this.updateUndoRedo();
  };

  Editor.closeSheet = function () {
    document.getElementById('edSheet').style.display = 'none';
    document.getElementById('edSheetBackdrop').style.display = 'none';
    if (this.tool) { this.tool = null; this.renderTools(); }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }

  /* ---------- MEDIA ---------- */
  Editor.panel_media = function (el) {
    var self = this;
    el.appendChild(h(
      '<h4>📥 Import media</h4>' +
      '<div class="row"><button class="btn primary sm" id="mPick">＋ Videos / Photos</button></div>' +
      '<p class="muted" style="margin-top:8px">MP4 / WebM / JPG / PNG work best. Files stay on this device. Preview first, then add.</p>' +
      (this.project.clips.length ?
        '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="mLeft">◀ Move clip</button>' +
        '<button class="btn ghost sm" id="mRight">Move clip ▶</button>' +
        '<button class="btn ghost sm" id="mDup">⧉ Duplicate clip</button>' +
        '<button class="btn danger sm" id="mDel">Delete clip</button></div>' : '')
    ));
    el.querySelector('#mPick').onclick = function () { document.getElementById('edFileInput').click(); };
    var l = el.querySelector('#mLeft'), r = el.querySelector('#mRight'), d = el.querySelector('#mDel'), dp = el.querySelector('#mDup');
    if (l) l.onclick = function () { self.moveClip(-1); };
    if (r) r.onclick = function () { self.moveClip(1); };
    if (d) d.onclick = function () { self.deleteClip(); };
    if (dp) dp.onclick = function () { self.duplicateClip(); };
    // staging: preview before adding
    if (this.staged.length) {
      var box = h('<h4 style="margin-top:12px">👀 Preview — add what you want</h4><div class="pv-grid" id="pvGrid"></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="pvAll">＋ Add all</button></div>');
      el.appendChild(box);
      var grid = box.querySelector('#pvGrid');
      this.staged.forEach(function (item, i) {
        var d2 = document.createElement('div');
        d2.className = 'pv-item';
        var media = item.kind === 'video'
          ? '<div class="pv-thumb"><video src="' + item.url + '" muted preload="metadata" playsinline></video></div>'
          : '<div class="pv-thumb"><img src="' + item.url + '"></div>';
        d2.innerHTML = media +
          '<div class="pv-name">' + esc(item.name) + (item.kind === 'video' && item.duration ? ' · ' + item.duration.toFixed(1) + 's' : '') + (item.ready ? '' : ' · …') + '</div>' +
          '<div class="pv-btns"><button class="btn primary" data-a="add">Add</button><button class="btn ghost" data-a="rm">✕</button></div>';
        d2.querySelector('[data-a="add"]').onclick = function () { self.commitStaged(i); };
        d2.querySelector('[data-a="rm"]').onclick = function () { self.discardStaged(i); };
        grid.appendChild(d2);
      });
      box.querySelector('#pvAll').onclick = function () { self.commitStaged(null); };
    }
  };

  /* ---------- TRIM ---------- */
  Editor.panel_trim = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip in the timeline first.</p>'; return; }
    el.appendChild(h(
      '<h4>✂️ Trim — ' + esc(c.name) + '</h4>' +
      '<div class="kv"><span>In-point <b>' + c.in.toFixed(2) + 's</b></span>' +
      '<span><button class="icon-btn" data-t="in" data-d="-0.5">−</button> <button class="icon-btn" data-t="in" data-d="0.5">＋</button></span></div>' +
      '<div class="kv"><span>Out-point <b>' + c.out.toFixed(2) + 's</b></span>' +
      '<span><button class="icon-btn" data-t="out" data-d="-0.5">−</button> <button class="icon-btn" data-t="out" data-d="0.5">＋</button></span></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="tInPh">Set In = ▶ playhead</button>' +
      '<button class="btn ghost sm" id="tOutPh">Set Out = ▶ playhead</button></div>' +
      '<p class="muted" style="margin-top:8px">Steps are 0.5s. Playhead: ' + this.t.toFixed(2) + 's</p>'
    ));
    el.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () { self.trimSel(b.getAttribute('data-t'), parseFloat(b.getAttribute('data-d'))); };
    });
    el.querySelector('#tInPh').onclick = function () { self.setTrimAtPlayhead('in'); };
    el.querySelector('#tOutPh').onclick = function () { self.setTrimAtPlayhead('out'); };
  };

  /* ---------- KEYFRAMES ---------- */
  Editor.panel_keyframe = function (el) {
    var self = this, L = window.EditorLogic;
    var tg = this.kfTarget();
    if (!tg) { el.innerHTML = '<p class="hint">Select a clip, text, overlay or sticker first.</p>'; return; }
    var kfs = tg.item.keyframes || [];
    var cur = this.kfEffectiveProps(tg, this.t);
    var isPx = (tg.kind === 'clip' || tg.kind === 'text');
    function srow(id, label, min, max, step, val, unit) {
      return '<div class="adj-row"><div class="lbl"><span>' + label + '</span><span id="' + id + 'V">' + val + unit + '</span></div>' +
        '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
    }
    var html = '<h4>◇ Keyframes — ' + esc(tg.name) + '</h4>' +
      '<div class="row">' +
      '<button class="btn ghost sm" id="kfPrev">◀ Prev</button>' +
      '<button class="btn primary sm" id="kfAddB">◇ Add</button>' +
      '<button class="btn ghost sm" id="kfNext">Next ▶</button></div>' +
      '<p class="muted" style="margin:6px 0">' + kfs.length + ' keyframe(s) · playhead ' + L.fmtTime(this.t) + '</p>';
    if (isPx) {
      html += srow('kfX', 'Position X (px)', -320, 320, 1, Math.round(cur.x), 'px');
      html += srow('kfY', 'Position Y (px)', -320, 320, 1, Math.round(cur.y), 'px');
      html += srow('kfS', 'Scale', 0.1, 3, 0.01, (+cur.scale).toFixed(2), 'x');
    } else {
      html += srow('kfX', 'Position X', 0, 1, 0.01, (+cur.x).toFixed(2), '');
      html += srow('kfY', 'Position Y', 0, 1, 0.01, (+cur.y).toFixed(2), '');
      html += srow('kfS', 'Scale', tg.kind === 'overlay' ? 0.1 : 0.2, tg.kind === 'overlay' ? 1.5 : 4, 0.01, (+cur.scale).toFixed(2), 'x');
    }
    html += srow('kfR', 'Rotation', -180, 180, 1, Math.round(cur.rot), '°');
    html += srow('kfO', 'Opacity', 0, 1, 0.01, (+L.clamp01(cur.opacity)).toFixed(2), '');
    html += '<div class="row" style="margin-top:6px"><button class="btn danger sm" id="kfDel">Delete keyframe</button></div>' +
      '<p class="muted" style="margin-top:8px">Move the playhead, change a value — a ◇ is created automatically. ' +
      'On a ◇, edits update that keyframe. Pinch the preview to zoom, drag to move.</p>';
    el.appendChild(h(html));
    el.querySelector('#kfPrev').onclick = function () { self.kfNav(-1); };
    el.querySelector('#kfNext').onclick = function () { self.kfNav(1); };
    el.querySelector('#kfAddB').onclick = function () { self.kfAdd(); };
    el.querySelector('#kfDel').onclick = function () { self.kfDelete(); };
    function wire(id, prop, fmt) {
      var input = el.querySelector('#' + id);
      var lab = el.querySelector('#' + id + 'V');
      if (!input) return;
      input.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        lab.textContent = fmt(v);
        self.kfSetProp(prop, +v.toFixed(3), false);
      });
      input.addEventListener('change', function () {
        self.snapshot(); Store.persist();
        self.renderTimeline(); self.renderKfBtn(); self.renderPanel();
      });
    }
    wire('kfX', 'x', function (v) { return (isPx ? Math.round(v) + 'px' : v.toFixed(2)); });
    wire('kfY', 'y', function (v) { return (isPx ? Math.round(v) + 'px' : v.toFixed(2)); });
    wire('kfS', 'scale', function (v) { return v.toFixed(2) + 'x'; });
    wire('kfR', 'rot', function (v) { return Math.round(v) + '°'; });
    wire('kfO', 'opacity', function (v) { return v.toFixed(2); });
  };

  /* ---------- SPEED ---------- */
  Editor.panel_speed = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    var d = h('<h4>⏩ Speed — ' + esc(c.name) + '</h4><div class="pills" id="spPills"></div>' +
      '<div class="row" style="margin-top:10px;align-items:flex-end"><div style="flex:1"><label class="lbl">Custom speed (0.1–8x)</label>' +
      '<input type="number" id="spCustom" min="0.1" max="8" step="0.05" value="' + c.speed + '" style="min-height:44px"></div>' +
      '<button class="btn primary sm" id="spApply" style="min-height:44px">Apply</button></div>' +
      '<p class="muted" style="margin-top:8px">Speed changes clip length on the timeline.</p>');
    el.appendChild(d);
    function setSpeed(s) {
      var oldStarts = self._clipStarts();
      c.speed = s; self.snapshot();
      self._kfResyncClips(oldStarts);
      var tm = Store.timing();
      for (var i = 0; i < tm.items.length; i++)
        if (tm.items[i].clip.id === c.id) self._kfClipRangeFix(c, tm.items[i].start, tm.items[i].end);
      Store.persist();
      self.renderTimeline(); self.drawOnce(); self.updateTransport(); self.renderPanel();
    }
    [0.25, 0.5, 1, 1.5, 2, 4].forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'pill' + (c.speed === s ? ' on' : ''); b.textContent = s + 'x';
      b.onclick = function () { setSpeed(s); };
      d.querySelector('#spPills').appendChild(b);
    });
    d.querySelector('#spApply').onclick = function () {
      var v = window.EditorLogic ? EditorLogic.clampSpeed(d.querySelector('#spCustom').value) : null;
      if (v == null) { toast('Enter a speed between 0.1 and 8.', true); return; }
      setSpeed(v);
    };
  };

  /* ---------- ROTATE / FLIP / FIT ---------- */
  Editor.panel_rotate = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    el.appendChild(h(
      '<h4>🔄 Rotate & Flip — ' + esc(c.name) + '</h4>' +
      '<div class="row"><button class="btn ghost sm" id="rL">⟲ 90°</button>' +
      '<button class="btn ghost sm" id="rR">⟳ 90°</button>' +
      '<button class="btn ghost sm" id="rFit">' + (c.fit === 'cover' ? 'Fit: Cover' : 'Fit: Contain') + '</button></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="rFH">' + (c.flipH ? '✓ ' : '') + '⇋ Flip H</button>' +
      '<button class="btn ghost sm" id="rFV">' + (c.flipV ? '✓ ' : '') + '⇅ Flip V</button></div>' +
      '<p class="muted" style="margin-top:8px">Rotation: ' + (c.rotation || 0) + '°</p>'
    ));
    function rot(dgr) { c.rotation = (((c.rotation || 0) + dgr) % 360 + 360) % 360; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); }
    function flip(k) { c[k] = !c[k]; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); }
    el.querySelector('#rL').onclick = function () { rot(-90); };
    el.querySelector('#rR').onclick = function () { rot(90); };
    el.querySelector('#rFH').onclick = function () { flip('flipH'); };
    el.querySelector('#rFV').onclick = function () { flip('flipV'); };
    el.querySelector('#rFit').onclick = function () {
      c.fit = c.fit === 'cover' ? 'contain' : 'cover'; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel();
    };
  };

  /* ---------- FILTER ---------- */
  Editor.panel_filter = function (el) {
    var self = this, p = this.project;
    var names = { none: 'None', warm: '☀ Warm', cool: '❄ Cool', mono: 'Mono', vivid: '✨ Vivid', vintage: '📼 Vintage' };
    var d = h('<h4>🎨 Filter (whole project)</h4><div class="pills" id="fPills"></div>');
    el.appendChild(d);
    Object.keys(names).forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'pill' + (p.filter === k ? ' on' : ''); b.textContent = names[k];
      b.onclick = function () { p.filter = k; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); };
      d.querySelector('#fPills').appendChild(b);
    });
  };

  /* ---------- TRANSITION ---------- */
  Editor.panel_transition = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    var idx = this.project.clips.indexOf(c);
    if (idx === 0) { el.innerHTML = '<p class="hint">The first clip has no incoming transition — select a later clip.</p>'; return; }
    el.appendChild(h(
      '<h4>⋈ Transition into — ' + esc(c.name) + '</h4>' +
      '<div class="pills"><button class="pill' + (c.transitionIn !== 'crossfade' ? ' on' : '') + '" id="trNone">None (cut)</button>' +
      '<button class="pill' + (c.transitionIn === 'crossfade' ? ' on' : '') + '" id="trX">Crossfade 0.5s</button></div>' +
      '<p class="muted" style="margin-top:8px">Blends the end of the previous clip into this one in preview & export.</p>'
    ));
    function set(v) { c.transitionIn = v; self.snapshot(); Store.persist(); self.renderTimeline(); self.drawOnce(); self.renderPanel(); }
    el.querySelector('#trNone').onclick = function () { set('none'); };
    el.querySelector('#trX').onclick = function () { set('crossfade'); };
  };

  /* ---------- FX (Smart Effects) ---------- */
  Editor.panel_fx = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip in the timeline first.</p>'; return; }
    el.appendChild(h('<h4>✨ Smart FX — ' + esc(c.name) + '</h4>'));
    var grid = document.createElement('div');
    grid.className = 'fx-grid';
    FX.list().forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'fx-btn' + ((c.fx || 'none') === f.id ? ' on' : '') + (f.pro ? ' pro' : '');
      b.innerHTML = '<span class="fx-ic">' + f.icon + '</span><span>' + f.name + '</span>' +
        (f.pro ? '<span class="fx-lock">🔒</span>' : '');
      b.onclick = function () {
        if (f.pro) { toast(window.t ? t('fx.pro_locked') : '🔒 Pro effect — coming soon in ViraCut Pro'); return; }
        c.fx = f.id === 'none' ? undefined : f.id;
        self.snapshot(); Store.persist(); self.drawOnce(); self.renderTimeline(); self.renderPanel();
      };
      grid.appendChild(b);
    });
    el.appendChild(grid);
    el.insertAdjacentHTML('beforeend', '<p class="muted" style="margin-top:8px">Original ViraCut effects — baked into export.</p>');
  };

  /* ---------- TEXT ---------- */
  Editor.panel_text = function (el) {
    var self = this, p = this.project;
    var total = Store.timing().total;
    var d = h('<h4>🔤 Text overlays</h4><div id="txList"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="txAdd">＋ Add text</button></div>');
    el.appendChild(d);
    var list = d.querySelector('#txList');
    if (!p.texts.length) list.innerHTML = '<p class="muted">No text yet.</p>';
    p.texts.forEach(function (tx) {
      var row = document.createElement('div');
      row.className = 'kv';
      row.innerHTML = '<span>' + esc(tx.text).slice(0, 28) + ' <span class="muted">(' + tx.start.toFixed(1) + '–' + tx.end.toFixed(1) + 's)</span></span>';
      var del = document.createElement('button'); del.className = 'icon-btn'; del.textContent = '🗑'; del.title = 'Delete';
      del.onclick = function () { p.texts = p.texts.filter(function (x) { return x.id !== tx.id; }); self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel(); };
      var edt = document.createElement('button'); edt.className = 'icon-btn'; edt.textContent = '✎'; edt.title = 'Edit';
      edt.onclick = function () { self.textDialog(tx); };
      var sp = document.createElement('span'); sp.appendChild(edt); sp.appendChild(del);
      row.appendChild(sp); list.appendChild(row);
    });
    d.querySelector('#txAdd').onclick = function () { self.textDialog(null); };
  };
  Editor.textDialog = function (tx) {
    var self = this, p = this.project;
    var isNew = !tx;
    var total = Store.timing().total || 10;
    var cur = tx || { text: '', position: 'mid', color: '#ffffff', size: 6, start: 0, end: total };
    App.modal(
      '<h3>' + (isNew ? '＋ Add text' : '✎ Edit text') + '</h3>' +
      '<label class="lbl">Text</label><input type="text" id="txT" value="' + esc(cur.text) + '" placeholder="Your text…">' +
      '<label class="lbl">Position</label><div class="pills" id="txPos"></div>' +
      '<div class="row" style="margin-top:10px"><div style="flex:1"><label class="lbl">Color</label><input type="color" id="txC" value="' + esc(cur.color) + '" style="height:42px;padding:4px"></div>' +
      '<div style="flex:2"><label class="lbl">Size: <span id="txSv">' + cur.size + '</span></label><input type="range" id="txS" min="3" max="12" value="' + cur.size + '"></div></div>' +
      '<div class="row"><div style="flex:1"><label class="lbl">Start (s)</label><input type="text" id="txSt" value="' + cur.start + '"></div>' +
      '<div style="flex:1"><label class="lbl">End (s)</label><input type="text" id="txEn" value="' + cur.end + '"></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="txOk" style="flex:1">Save</button>' +
      '<button class="btn ghost" id="txNo">Cancel</button></div>',
      function (root) {
        ['top', 'mid', 'bottom'].forEach(function (pos) {
          var b = document.createElement('button');
          b.className = 'pill' + (cur.position === pos ? ' on' : ''); b.textContent = pos;
          b.onclick = function () { cur.position = pos; root.querySelectorAll('#txPos .pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); };
          root.querySelector('#txPos').appendChild(b);
        });
        root.querySelector('#txS').oninput = function (e) { root.querySelector('#txSv').textContent = e.target.value; };
        root.querySelector('#txNo').onclick = App.closeModal;
        root.querySelector('#txOk').onclick = function () {
          var t = root.querySelector('#txT').value.trim();
          if (!t) { toast('Enter some text.', true); return; }
          var obj = {
            text: t, position: cur.position, color: root.querySelector('#txC').value,
            size: +root.querySelector('#txS').value,
            start: Math.max(0, parseFloat(root.querySelector('#txSt').value) || 0),
            end: Math.max(0.5, parseFloat(root.querySelector('#txEn').value) || total)
          };
          if (obj.end <= obj.start) obj.end = obj.start + 2;
          if (isNew) { obj.id = Store.uid('tx'); p.texts.push(obj); }
          else {
            // KEYFRAMES: shift with start change; drop those outside the new range
            var dtx = obj.start - tx.start;
            if (tx.keyframes && tx.keyframes.length) {
              if (Math.abs(dtx) > 0.001) tx.keyframes.forEach(function (kf) { kf.t = +(kf.t + dtx).toFixed(2); });
              tx.keyframes = tx.keyframes.filter(function (kf) { return kf.t >= obj.start - 0.01 && kf.t <= obj.end + 0.01; });
            }
            Object.assign(tx, obj);
          }
          self.snapshot(); Store.persist(); App.closeModal(); self.drawOnce(); self.renderPanel();
          toast('Text saved.');
        };
      }
    );
  };

  /* ---------- STICKERS ---------- */
  var EMOJIS = ['😀', '😂', '😍', '🔥', '⭐', '✨', '💯', '🎉', '👏', '❤️', '👍', '🤯', '😱', '🥳', '💡', '🎬', '🎵', '👑', '💎', '🚀', '🌟', '💥', '😎', '🤖'];
  Editor.panel_sticker = function (el) {
    var self = this;
    var d = h('<h4>😀 Stickers — tap one, then tap the preview to place. Drag to move.</h4><div class="pills" id="stGrid" style="gap:6px"></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="stBigger">A＋ bigger</button>' +
      '<button class="btn ghost sm" id="stSmaller">A− smaller</button>' +
      '<button class="btn danger sm" id="stDel">Delete selected</button></div>');
    el.appendChild(d);
    var grid = d.querySelector('#stGrid');
    EMOJIS.forEach(function (e) {
      var b = document.createElement('button');
      b.className = 'pill'; b.style.fontSize = '20px'; b.textContent = e;
      b.onclick = function () {
        self.placingSticker = e;
        document.getElementById('edStickerLayer').style.pointerEvents = 'auto';
        toast('Tap the preview to place ' + e);
      };
      grid.appendChild(b);
    });
    d.querySelector('#stBigger').onclick = function () { self.stickerSize(1.2); };
    d.querySelector('#stSmaller').onclick = function () { self.stickerSize(0.85); };
    d.querySelector('#stDel').onclick = function () {
      if (!self.selStickerId) { toast('Tap a sticker to select it first.'); return; }
      self.project.stickers = self.project.stickers.filter(function (s) { return s.id !== self.selStickerId; });
      self.selStickerId = null; self.snapshot(); Store.persist(); self.renderStickers();
    };
  };
  Editor.stickerSize = function (f) {
    if (!this.selStickerId) { toast('Tap a sticker to select it first.'); return; }
    var s = this.project.stickers.filter(function (x) { return x.id === this.selStickerId; }, this)[0];
    if (!s) return;
    s.size = Math.max(0.03, Math.min(0.4, s.size * f));
    this.snapshot(); Store.persist(); this.renderStickers();
  };
  Editor.renderStickers = function () {
    var self = this, layer = document.getElementById('edStickerLayer');
    layer.innerHTML = '';
    layer.style.pointerEvents = this.placingSticker ? 'auto' : 'none';
    this.project.stickers.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'stk'; d.textContent = s.emoji;
      d.setAttribute('data-id', s.id);
      d.style.left = (s.x * 100) + '%'; d.style.top = (s.y * 100) + '%';
      d.style.fontSize = (s.size * layer.clientWidth || 40) + 'px';
      if (s.id === self.selStickerId) d.style.outline = '2px solid #8B5CF6';
      d.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        self.selStickerId = s.id;
        self.renderKfBtn();
        // effective (possibly keyframed) position at drag start
        var stg = { kind: 'sticker', item: s };
        var seff = self.kfEffectiveProps(stg, self.t);
        var hasKf = !!(s.keyframes && s.keyframes.length);
        var finX = seff.x, finY = seff.y;
        var move = function (ev) {
          var r = layer.getBoundingClientRect();
          finX = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
          finY = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
          d.style.left = (finX * 100) + '%'; d.style.top = (finY * 100) + '%';
        };
        var up = function () {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          if (hasKf) {
            // keyframed sticker: drag edits the animation, not the base
            var L = window.EditorLogic;
            var t = +self.t.toFixed(2);
            var idx = L.kfFindAt(s.keyframes, t, self.KF_EPS);
            var kf;
            if (idx >= 0) kf = s.keyframes[idx];
            else {
              kf = { t: t, x: seff.x, y: seff.y, scale: seff.scale, rot: seff.rot, opacity: seff.opacity };
              L.kfSortedInsert(s.keyframes, kf);
            }
            kf.x = +finX.toFixed(3); kf.y = +finY.toFixed(3);
            self._kfSel = { itemId: s.id, t: kf.t };
            self.snapshot(); Store.persist();
          } else {
            s.x = finX; s.y = finY;
            self.snapshot(); Store.persist();
          }
          self.renderStickers(); self.drawOnce();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
      layer.appendChild(d);
    });
    // placement clicks
    layer.onclick = function (e) {
      if (!self.placingSticker) return;
      if (e.target !== layer) return;
      var r = layer.getBoundingClientRect();
      var st = { id: Store.uid('st'), emoji: self.placingSticker, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, size: 0.12 };
      self.project.stickers.push(st);
      self.placingSticker = null;
      self.snapshot(); Store.persist(); self.renderStickers();
      toast('Sticker placed — drag to move.');
    };
  };

  /* ---------- CAPTIONS ---------- */
  Editor.panel_captions = function (el) {
    var self = this, p = this.project;
    var d = h('<h4>💬 Captions</h4><div id="cpList"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary sm" id="cpAdd">＋ Add</button>' +
      '<button class="btn ghost sm" id="cpAuto">✨ Auto from script</button>' +
      '<button class="btn danger sm" id="cpClear">Clear</button></div>');
    el.appendChild(d);
    var list = d.querySelector('#cpList');
    if (!p.captions.length) list.innerHTML = '<p class="muted">No captions yet.</p>';
    p.captions.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'kv';
      row.innerHTML = '<span>' + esc(c.text).slice(0, 34) + ' <span class="muted">(' + c.start.toFixed(1) + '–' + c.end.toFixed(1) + 's)</span></span>';
      var del = document.createElement('button'); del.className = 'icon-btn'; del.textContent = '🗑';
      del.onclick = function () { Captions.remove(c.id); self.drawOnce(); self.renderPanel(); };
      row.appendChild(del); list.appendChild(row);
    });
    d.querySelector('#cpAdd').onclick = function () {
      App.modal('<h3>＋ Caption</h3>' +
        '<label class="lbl">Text</label><input type="text" id="cpT" placeholder="Caption text…">' +
        '<div class="row"><div style="flex:1"><label class="lbl">Start (s)</label><input type="text" id="cpS" value="' + self.t.toFixed(1) + '"></div>' +
        '<div style="flex:1"><label class="lbl">End (s)</label><input type="text" id="cpE" value="' + (self.t + 2).toFixed(1) + '"></div></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="cpOk" style="flex:1">Add</button><button class="btn ghost" id="cpNo">Cancel</button></div>',
        function (root) {
          root.querySelector('#cpNo').onclick = App.closeModal;
          root.querySelector('#cpOk').onclick = function () {
            var t = root.querySelector('#cpT').value.trim();
            if (!t) { toast('Enter caption text.', true); return; }
            Captions.add(t, root.querySelector('#cpS').value, root.querySelector('#cpE').value);
            App.closeModal(); self.drawOnce(); self.renderPanel(); toast('Caption added.');
          };
        });
    };
    d.querySelector('#cpAuto').onclick = function () {
      var n = Captions.autoFromScript();
      if (n) { self.drawOnce(); self.renderPanel(); toast(n + ' captions created from script.'); }
    };
    d.querySelector('#cpClear').onclick = function () {
      App.confirm('Clear all captions?', function (ok) { if (ok) { Captions.clear(); self.drawOnce(); self.renderPanel(); } });
    };
  };

  /* ---------- AUDIO ---------- */
  Editor.panel_audio = function (el) {
    this.renderAudioPanel(el);
  };
  Editor.renderAudioPanel = function (el) {
    var self = this, p = this.project;
    el = el || document.getElementById('edPanel');
    if (this.tool !== 'audio') return;
    el.innerHTML = '';
    // ---- per-clip audio (volume / fade / mute / extract) ----
    var c = this.selClip();
    var ca = h('<h4>🎚 Clip audio</h4><div id="caBox"></div>');
    el.appendChild(ca);
    var cab = ca.querySelector('#caBox');
    if (!c) cab.innerHTML = '<p class="muted">Select a clip in the timeline to adjust its audio.</p>';
    else if (c.type === 'photo') cab.innerHTML = '<p class="muted">Photos have no audio — select a video or audio clip.</p>';
    else {
      cab.innerHTML =
        '<div class="kv"><span>' + esc(c.name) + '</span>' +
        '<button class="btn ghost sm" id="caMute">' + (c.muted ? '🔈 Unmute' : '🔇 Mute') + '</button></div>' +
        '<label class="lbl">Volume: <span id="caVv">' + Math.round((c.volume == null ? 1 : c.volume) * 100) + '</span>%</label>' +
        '<input type="range" id="caV" min="0" max="100" value="' + Math.round((c.volume == null ? 1 : c.volume) * 100) + '">' +
        '<div class="row"><div style="flex:1"><label class="lbl">Fade in (s)</label>' +
        '<input type="number" id="caFi" min="0" max="5" step="0.5" value="' + (c.fadeIn || 0) + '" style="min-height:44px"></div>' +
        '<div style="flex:1"><label class="lbl">Fade out (s)</label>' +
        '<input type="number" id="caFo" min="0" max="5" step="0.5" value="' + (c.fadeOut || 0) + '" style="min-height:44px"></div></div>' +
        (c.type === 'video' ? '<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="caExt">🎵 Extract audio</button></div>' : '') +
        '<p class="muted" style="margin-top:6px">Volume & fades apply in preview and are baked into export.</p>';
      cab.querySelector('#caV').oninput = function (e) {
        c.volume = e.target.value / 100;
        cab.querySelector('#caVv').textContent = e.target.value;
        Store.persist();
      };
      cab.querySelector('#caV').onchange = function () { self.snapshot(); };
      function fadeWire(id, key) {
        cab.querySelector(id).onchange = function (e) {
          var v = Math.max(0, Math.min(5, parseFloat(e.target.value) || 0));
          e.target.value = v; c[key] = v; self.snapshot(); Store.persist();
        };
      }
      fadeWire('#caFi', 'fadeIn'); fadeWire('#caFo', 'fadeOut');
      cab.querySelector('#caMute').onclick = function () {
        c.muted = !c.muted; self.snapshot(); Store.persist(); self.renderAudioPanel();
      };
      var ex = cab.querySelector('#caExt');
      if (ex) ex.onclick = function () { self.extractAudio(); };
    }
    var d = h('<h4>🎵 Music</h4><div id="muBox"></div>' +
      '<div class="row" style="margin:8px 0"><button class="btn ghost sm" id="muPick">＋ Import music</button></div>' +
      '<h4 style="margin-top:14px">🎙️ Voiceover takes</h4><div id="voBox"></div>' +
      '<div class="row" style="margin:8px 0"><button class="btn primary sm" id="voRec">⏺ Record</button></div>' +
      '<p class="muted">Music & takes mix automatically in preview and export.</p>');
    el.appendChild(d);
    // music
    var mb = d.querySelector('#muBox');
    if (p.music) {
      mb.innerHTML = '<div class="kv"><span>🎵 ' + esc(p.music.name) + '</span><button class="icon-btn" id="muX">🗑</button></div>' +
        '<label class="lbl">Music volume</label><input type="range" id="muV" min="0" max="100" value="' + Math.round(p.music.volume * 100) + '">';
      mb.querySelector('#muX').onclick = function () { AudioLab.Music.clear(p); self.renderAudioPanel(); };
      mb.querySelector('#muV').oninput = function (e) { p.music.volume = e.target.value / 100; Store.persist(); };
    } else mb.innerHTML = '<p class="muted">No music yet.</p>';
    d.querySelector('#muPick').onclick = function () { document.getElementById('edMusicInput').click(); };
    // voice takes
    var vb = d.querySelector('#voBox');
    if (!p.voiceovers.length) vb.innerHTML = '<p class="muted">No takes yet — record with the mic.</p>';
    p.voiceovers.forEach(function (v) {
      var row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = '<div class="kv"><span>🎙 ' + esc(v.name) + '</span><button class="icon-btn">🗑</button></div>' +
        (v.url ? '<audio controls src="' + v.url + '"></audio>' : '<p class="muted">encoding…</p>') +
        '<label class="lbl">Volume</label><input type="range" min="0" max="100" value="' + Math.round(v.volume * 100 + '') + '">';
      var btns = row.querySelectorAll('button');
      row.querySelector('input').oninput = function (e) { v.volume = e.target.value / 100; Store.persist(); };
      btns[0].onclick = function () { AudioLab.Voice.remove(p, v.id); self.renderAudioPanel(); };
      vb.appendChild(row);
    });
    var recB = d.querySelector('#voRec');
    if (AudioLab.Voice.recording()) {
      recB.textContent = '⏹ Stop (' + Math.round((Date.now() - AudioLab.Voice.recStart) / 1000) + 's)';
      recB.onclick = function () {
        AudioLab.Voice.stop(p).then(function (take) {
          self.renderAudioPanel();
          if (take) toast('Take saved.');
        });
      };
    } else {
      recB.onclick = function () {
        AudioLab.Voice.start().then(function (ok) {
          if (ok) { toast('Recording… tap Stop when done.'); self.renderAudioPanel(); }
        });
      };
    }
  };
})();

/* ViraCut AI — editor.js (4/4): Phase 2 lanes, clip strip, adjust/AI/overlay panels, cover, freeze */
(function () {
  'use strict';
  var Editor = window.Editor;
  var L = window.EditorLogic;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  Editor.addOverlayLane = function () { this.setTool('overlay'); };

  Editor.addOverlay = function (lane) {
    var self = this;
    this._ovLanePick = lane == null ? 0 : lane;
    document.getElementById('edOverlayInput').click();
  };
  Editor.commitOverlayFile = function (file) {
    var self = this, p = this.project;
    var isVid = /^video\//.test(file.type || '');
    var url = URL.createObjectURL(file);
    var id = Store.uid('ov');
    Store.mediaCache.set(id, url);
    var ov = {
      id: id, type: isVid ? 'video' : 'photo', name: file.name, url: url,
      start: +this.t.toFixed(2), dur: 3, x: 0.5, y: 0.5, scale: 0.4,
      rotation: 0, opacity: 1, lane: this._ovLanePick || 0
    };
    function done(dur) {
      if (isVid && dur) ov.dur = Math.min(8, Math.max(1, dur));
      p.overlays.push(ov);
      self.selOvId = id; self.selClipId = null; self.selTxId = null;
      self.snapshot(); Store.persist(); self.syncMedia();
      self.renderTimeline(); self.drawOnce(); self.setTool('overlay');
      toast('Overlay added.');
    }
    if (isVid) {
      var v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.src = url;
      v.addEventListener('loadedmetadata', function () { done(v.duration || 5); });
      v.addEventListener('error', function () { done(5); });
      setTimeout(function () { if (!p.overlays.some(function (o) { return o.id === id; })) done(5); }, 8000);
    } else done(3);
  };

  Editor.selOverlay = function () {
    var p = this.project; if (!p || !this.selOvId) return null;
    for (var i = 0; i < p.overlays.length; i++) if (p.overlays[i].id === this.selOvId) return p.overlays[i];
    return null;
  };
  Editor.deleteOverlay = function () {
    var p = this.project, ov = this.selOverlay();
    if (!ov) return;
    var self = this;
    App.confirm('Delete this overlay?', function (ok) {
      if (!ok) return;
      p.overlays = p.overlays.filter(function (o) { return o.id !== ov.id; });
      self.selOvId = null;
      self.snapshot(); Store.persist(); self.syncMedia();
      self.renderTimeline(); self.drawOnce(); self.renderPanel();
      toast('Overlay deleted.');
    });
  };

  /* ================= CLIP STRIP ================= */
  var STRIP = [
    { id: 'mute', ic: '🔇', label: 'Mute' },
    { id: 'split', ic: '🔪', label: 'Split' },
    { id: 'trim', ic: '✂️', label: 'Trim' },
    { id: 'speed', ic: '⏩', label: 'Speed' },
    { id: 'volume', ic: '🔊', label: 'Volume' },
    { id: 'animation', ic: '✨', label: 'Animation', soon: true },
    { id: 'crop', ic: '◫', label: 'Crop', soon: true },
    { id: 'rotate', ic: '🔄', label: 'Rotate' },
    { id: 'reverse', ic: '◀◀', label: 'Reverse', soon: true },
    { id: 'freeze', ic: '❄️', label: 'Freeze' },
    { id: 'keyframe', ic: '◇', label: 'Keyframe' },
    { id: 'duplicate', ic: '⧉', label: 'Duplicate' },
    { id: 'delete', ic: '🗑️', label: 'Delete' },
    { id: 'flip', ic: '⇄', label: 'Flip' },
    { id: 'adjust', ic: '🎚️', label: 'Adjust' },
    { id: 'filter', ic: '🎨', label: 'Filter' },
    { id: 'cover', ic: '🖼️', label: 'Cover' }
  ];
  Editor.renderClipStrip = function () {
    var el = document.getElementById('edClipStrip');
    var c = this.selClip();
    this.renderKfBtn();
    // tool panel takes priority over the strip
    if (!c || this.tool) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var self = this;
    el.style.display = 'flex'; el.innerHTML = '';
    STRIP.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'cs-btn' + (s.soon ? ' soon' : '');
      var label = s.label, ic = s.ic;
      if (s.id === 'mute') { label = c.muted ? 'Unmute' : 'Mute'; ic = c.muted ? '🔈' : '🔇'; }
      b.innerHTML = '<span class="ic">' + ic + '</span><span>' + label + '</span>';
      b.onclick = function () { self.clipStripAction(s.id); };
      el.appendChild(b);
    });
  };
  Editor.clipStripAction = function (id) {
    var self = this, c = this.selClip();
    if (!c) { toast('Select a clip first.', true); return; }
    switch (id) {
      case 'mute':
        c.muted = !c.muted;
        this.snapshot(); Store.persist(); this.drawOnce(); this.renderTimeline();
        toast(c.muted ? 'Clip muted.' : 'Clip unmuted.');
        break;
      case 'split': this.splitAtPlayhead(); break;
      case 'trim': this.toggleTrimMode(); break;
      case 'speed': this.setTool('speed'); break;
      case 'volume': this.setTool('audio'); break;
      case 'animation': toast('Clip animation is coming soon.', true); break;
      case 'delete': this.deleteClip(); break;
      case 'duplicate': this.duplicateClip(); break;
      case 'crop': toast('Crop is coming soon.', true); break;
      case 'rotate': this.setTool('rotate'); break;
      case 'flip':
        c.flipH = !c.flipH;
        this.snapshot(); Store.persist(); this.drawOnce(); this.renderTimeline();
        toast(c.flipH ? 'Flipped horizontally.' : 'Flip off.');
        break;
      case 'reverse': toast('Reverse is coming soon.', true); break;
      case 'freeze': this.freezeFrame(); break;
      case 'keyframe': this.setTool('keyframe'); break;
      case 'adjust': this.setTool('adjust'); break;
      case 'filter': this.setTool('filter'); break;
      case 'cover': this.openCoverPicker(); break;
    }
  };
  /* Trim mode: draggable ◀ ▶ handles on the selected clip. Toggle via the
     Trim button; exits when another clip is tapped, when tapped outside,
     or when the clip is split/deleted. */
  Editor.toggleTrimMode = function () {
    var c = this.selClip();
    if (!c) { toast('Select a clip first.', true); return; }
    if (this.trimModeId === c.id) {
      this.trimModeId = null;
      toast('Trim done.');
    } else {
      this.trimModeId = c.id;
      this.setTool(null);
      toast('Drag the ◀ ▶ handles to trim.');
    }
    this.renderTimeline(); this.drawOnce();
  };
  Editor.exitTrimMode = function () {
    if (this.trimModeId) { this.trimModeId = null; this.renderTimeline(); }
  };
  Editor.freezeFrame = function () {
    var self = this, p = this.project;
    var found = Store.clipAt(this.t);
    if (!found) { toast('Nothing to freeze at the playhead.', true); return; }
    var idx = found.index;
    try {
      var url = this.canvas.toDataURL('image/jpeg', 0.85);
      var id = Store.uid('clip');
      Store.mediaCache.set(id, url);
      var nc = {
        id: id, type: 'photo', name: '❄ Freeze frame', url: url,
        duration: 2, in: 0, out: 2, speed: 1, rotation: 0, fit: 'cover',
        transitionIn: 'none', kb: false, volume: 1, muted: true
      };
      p.clips.splice(idx + 1, 0, nc);
      this.snapshot(); Store.persist(); this.syncMedia();
      this.renderTimeline(); this.drawOnce(); this.updateTransport();
      toast('Freeze frame added (2s).');
    } catch (e) { toast('Could not capture frame.', true); }
  };

  /* ================= COVER PICKER ================= */
  Editor.openCoverPicker = function () {
    var self = this;
    var total = Store.timing().total || 1;
    App.modal(
      '<h3>🖼️ Project cover</h3>' +
      '<p class="muted">Scrub to pick a frame, then save it as the project cover.</p>' +
      '<input type="range" id="cvSeek" min="0" max="1000" value="' + Math.round(this.t / total * 1000) + '" style="width:100%;min-height:44px">' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="cvOk" style="flex:1">Save cover</button>' +
      '<button class="btn ghost" id="cvNo">Cancel</button></div>',
      function (root) {
        root.querySelector('#cvSeek').oninput = function (e) {
          self.seek(total * (e.target.value / 1000));
        };
        root.querySelector('#cvNo').onclick = App.closeModal;
        root.querySelector('#cvOk').onclick = function () {
          try {
            var url = self.canvas.toDataURL('image/jpeg', 0.8);
            self.project.cover = url;
            self.snapshot(); Store.persist(); App.closeModal();
            toast('Cover saved.');
          } catch (e) { toast('Could not save cover.', true); }
        };
      }
    );
  };

  /* ================= PANEL: ADJUST ================= */
  var ADJUSTS = [
    { k: 'b', label: 'Brightness', min: 0.3, max: 2, def: 1, css: function (v) { return 'brightness(' + v + ')'; } },
    { k: 'c', label: 'Contrast', min: 0.3, max: 2, def: 1, css: function (v) { return 'contrast(' + v + ')'; } },
    { k: 's', label: 'Saturation', min: 0, max: 2.5, def: 1, css: function (v) { return 'saturate(' + v + ')'; } },
    { k: 'h', label: 'Hue', min: -180, max: 180, def: 0, css: function (v) { return 'hue-rotate(' + v + 'deg)'; } },
    { k: 'sep', label: 'Warmth', min: 0, max: 1, def: 0, css: function (v) { return 'sepia(' + v + ')'; } },
    { k: 'gray', label: 'B&W', min: 0, max: 1, def: 0, css: function (v) { return 'grayscale(' + v + ')'; } },
    { k: 'blur', label: 'Blur', min: 0, max: 8, def: 0, css: function (v) { return 'blur(' + v + 'px)'; } }
  ];
  Editor.adjustFilter = function (clip) {
    var a = clip.adjust; if (!a) return '';
    var parts = [];
    ADJUSTS.forEach(function (d) {
      var v = a[d.k];
      if (v != null && v !== d.def) parts.push(d.css(+v.toFixed(3)));
    });
    return parts.join(' ');
  };
  Editor.panel_adjust = function (el) {
    var self = this, c = this.selClip();
    if (!c) { el.innerHTML = '<p class="hint">Select a clip first.</p>'; return; }
    c.adjust = c.adjust || {};
    var d = document.createElement('div');
    d.innerHTML = '<h4>🎚️ Adjust — ' + esc(c.name) + '</h4>';
    ADJUSTS.forEach(function (a) {
      var v = c.adjust[a.k] != null ? c.adjust[a.k] : a.def;
      var row = document.createElement('div');
      row.className = 'adj-row';
      row.innerHTML = '<div class="lbl"><span>' + a.label + '</span><span>' + v + '</span></div>';
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = a.min; inp.max = a.max; inp.step = '0.01'; inp.value = v;
      inp.oninput = function (e) {
        c.adjust[a.k] = +e.target.value;
        row.querySelector('.lbl span:last-child').textContent = e.target.value;
        self.drawOnce();
      };
      inp.onchange = function () { self.snapshot(); Store.persist(); };
      row.appendChild(inp);
      d.appendChild(row);
    });
    var rb = document.createElement('button');
    rb.className = 'btn ghost sm'; rb.textContent = 'Reset adjustments';
    rb.onclick = function () {
      c.adjust = {}; self.snapshot(); Store.persist(); self.drawOnce(); self.renderPanel();
      toast('Adjustments reset.');
    };
    d.appendChild(rb);
    el.appendChild(d);
  };

  /* ================= PANEL: AI ================= */
  Editor.panel_ai = function (el) {
    var rows = [
      { ic: '✂️', t: 'AI Clipper', d: 'Analyzes video and suggests the best sections to keep. Needs an AI backend — architecture ready, not connected yet.' },
      { ic: '💬', t: 'Auto Captions', d: 'Speech-to-text captions. Needs a transcription backend — not available on this device.' },
      { ic: '🪄', t: 'Background Removal', d: 'AI person segmentation. Needs a vision backend — not available on this device.' },
      { ic: '🔍', t: 'AI Enhance', d: 'AI upscaling/denoise. Needs a GPU backend — not available on this device.' }
    ];
    var d = document.createElement('div');
    d.innerHTML = '<h4>🤖 AI Tools</h4><p class="muted" style="margin-bottom:10px">These need an online AI backend. Nothing here is faked — unavailable features are marked honestly.</p>';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'ai-row';
      row.innerHTML = '<span class="ic">' + r.ic + '</span><span class="tx"><b>' + esc(r.t) + '</b>' + esc(r.d) + '</span><span class="ai-badge">UNAVAILABLE</span>';
      d.appendChild(row);
    });
    el.appendChild(d);
  };

  /* ================= PANEL: OVERLAY ================= */
  Editor.panel_overlay = function (el) {
    var self = this, p = this.project;
    var d = document.createElement('div');
    d.innerHTML = '<h4>🖼️ Overlays</h4>';
    if (!p.overlays.length) d.innerHTML += '<p class="muted">No overlays yet.</p>';
    p.overlays.forEach(function (ov) {
      var row = document.createElement('div');
      row.className = 'ov-row' + (self.selOvId === ov.id ? ' sel' : '');
      row.innerHTML = '<span class="nm">' + (ov.type === 'video' ? '🎞 ' : '🖼 ') + esc(ov.name || '') + '</span>';
      var eb = document.createElement('button'); eb.className = 'btn ghost xs'; eb.textContent = 'Edit';
      eb.onclick = function () { self.selOvId = ov.id; self.ovEditDialog(ov); };
      var db = document.createElement('button'); db.className = 'btn danger xs'; db.textContent = '✕';
      db.onclick = function () { self.selOvId = ov.id; self.deleteOverlay(); };
      row.appendChild(eb); row.appendChild(db);
      row.addEventListener('click', function (e) {
        if (e.target === eb || e.target === db) return;
        self.selOvId = ov.id; self.selClipId = null; self.selTxId = null;
        self.renderTimeline();
      });
      d.appendChild(row);
    });
    var ab = document.createElement('button');
    ab.className = 'btn primary sm'; ab.textContent = '＋ Add overlay';
    ab.style.marginTop = '6px';
    ab.onclick = function () { self.addOverlay(0); };
    d.appendChild(ab);
    el.appendChild(d);
  };
  Editor.ovEditDialog = function (ov) {
    var self = this;
    App.modal(
      '<h3>🖼️ Overlay</h3>' +
      '<div class="adj-row"><div class="lbl"><span>Size</span><span id="ovSv">' + ov.scale + '</span></div><input type="range" id="ovS" min="0.1" max="1.5" step="0.01" value="' + ov.scale + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>Opacity</span><span id="ovOv">' + ov.opacity + '</span></div><input type="range" id="ovO" min="0.05" max="1" step="0.01" value="' + ov.opacity + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>Rotation°</span><span id="ovRv">' + ov.rotation + '</span></div><input type="range" id="ovR" min="-180" max="180" step="1" value="' + ov.rotation + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>X position</span><span id="ovXv">' + ov.x + '</span></div><input type="range" id="ovX" min="0" max="1" step="0.01" value="' + ov.x + '"></div>' +
      '<div class="adj-row"><div class="lbl"><span>Y position</span><span id="ovYv">' + ov.y + '</span></div><input type="range" id="ovY" min="0" max="1" step="0.01" value="' + ov.y + '"></div>' +
      '<div class="row"><div style="flex:1"><label class="lbl">Duration (s)</label><input type="number" id="ovD" min="0.5" max="60" step="0.5" value="' + ov.dur + '"></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="ovOk" style="flex:1">Done</button>' +
      '<button class="btn danger" id="ovDel">Delete</button></div>',
      function (root) {
        function wire(id, key, lab) {
          root.querySelector('#' + id).oninput = function (e) {
            // KEYFRAMES: routed through the animation stream when they exist
            self.kfOverlayEdit(ov, key, +e.target.value, false);
            root.querySelector('#' + lab).textContent = e.target.value;
          };
        }
        wire('ovS', 'scale', 'ovSv'); wire('ovO', 'opacity', 'ovOv');
        wire('ovR', 'rotation', 'ovRv'); wire('ovX', 'x', 'ovXv'); wire('ovY', 'y', 'ovYv');
        root.querySelector('#ovD').onchange = function (e) {
          ov.dur = Math.max(0.5, Math.min(60, parseFloat(e.target.value) || 3));
          if (ov.keyframes) ov.keyframes = ov.keyframes.filter(function (kf) { return kf.t <= ov.start + ov.dur + 0.01; });
          self.renderTimeline();
        };
        root.querySelector('#ovOk').onclick = function () {
          self.snapshot(); Store.persist(); App.closeModal();
          self.renderTimeline(); self.drawOnce(); self.renderPanel();
        };
        root.querySelector('#ovDel').onclick = function () { App.closeModal(); self.deleteOverlay(); };
      }
    );
  };
})();
