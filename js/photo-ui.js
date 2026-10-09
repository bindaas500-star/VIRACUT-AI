/* ViraCut AI — photo-ui.js — Photo Editor screen (Phase 1).
 * Import → Adjust/Filters/HSL/Curves/Crop → Before/After → Projects → Export.
 */
(function () {
  'use strict';

  var PL = null; // window.PhotoLab (lazy)
  function lab() { return window.PhotoLab; }
  function toast(m, e) { if (window.toast) window.toast(m, e); }

  var UI = {
    tool: 'adjust', // adjust|filters|hsl|curves|crop
    adjKey: 'brightness',
    hslCh: 'red',
    curveCh: 'rgb',
    cropRatio: 'free',
    filterCat: null,
    filterThumbs: {}, // filterId -> dataURL (per photo)
    zoom: 1, panX: 0, panY: 0,
    renderTimer: null,
    compareHold: false
  };

  /* ================= screen HTML ================= */
  function buildScreen() {
    if (document.getElementById('screen-photo')) return;
    var s = document.createElement('section');
    s.className = 'screen'; s.id = 'screen-photo';
    s.innerHTML =
      '<div class="ph-top">' +
        '<button class="icon-btn" id="phBack">‹</button>' +
        '<button class="icon-btn" id="phUndo" title="Undo">↶</button>' +
        '<button class="icon-btn" id="phRedo" title="Redo">↷</button>' +
        '<span style="flex:1"></span>' +
        '<button class="icon-btn" id="phCompare" title="Hold to compare">👁</button>' +
        '<button class="icon-btn" id="phSave" title="Save project">💾</button>' +
        '<button class="btn primary sm" id="phExport">⬇ Export</button>' +
      '</div>' +
      '<div class="ph-stage" id="phStage">' +
        '<div class="ph-zoomwrap" id="phZoom">' +
          '<canvas id="phCanvas"></canvas>' +
          '<canvas id="phBefore" style="display:none"></canvas>' +
          '<div class="ph-cropover" id="phCropOver" style="display:none"><div class="ph-cropbox" id="phCropBox"><div class="ph-handle" id="phCropHandle"></div></div></div>' +
        '</div>' +
        '<input type="file" id="phFile" accept="image/*" style="display:none">' +
        '<input type="file" id="phFileCam" accept="image/*" capture="environment" style="display:none">' +
      '</div>' +
      '<div class="ph-tools" id="phTools">' +
        '<button data-t="adjust" class="on">🎚 Adjust</button>' +
        '<button data-t="filters">🎨 Filters</button>' +
        '<button data-t="hsl">🌈 HSL</button>' +
        '<button data-t="curves">〰 Curves</button>' +
        '<button data-t="crop">✂ Crop</button>' +
      '</div>' +
      '<div class="ph-panel" id="phPanel"></div>';
    document.getElementById('screens').appendChild(s);

    s.querySelector('#phBack').onclick = function () { App.show('screen-home'); };
    s.querySelector('#phUndo').onclick = function () { if (lab().undo()) UI.refresh(); };
    s.querySelector('#phRedo').onclick = function () { if (lab().redo()) UI.refresh(); };
    s.querySelector('#phSave').onclick = saveProject;
    s.querySelector('#phExport').onclick = function(){ window.PhotoUI.openExport(); };
    var cmp = s.querySelector('#phCompare');
    cmp.addEventListener('pointerdown', function () { showBefore(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      cmp.addEventListener(ev, function () { showBefore(false); });
    });
    s.querySelectorAll('#phTools button').forEach(function (b) {
      b.onclick = function () {
        var wasCrop = UI.tool === 'crop';
        UI.tool = b.getAttribute('data-t');
        s.querySelectorAll('#phTools button').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (wasCrop && UI.tool !== 'crop') { lab().renderPreview(); drawToScreen(); }
        window.PhotoUI.renderPanel();
      };
    });
    initGestures();
    window.PhotoUI.initCropDrag();
  }

  /* ================= import ================= */
  function importDialog() {
    App.modal(
      '<h3>📸 New photo edit</h3>' +
      '<div class="stack">' +
      '<button class="btn primary" id="piGallery">🖼️ Choose from gallery</button>' +
      '<button class="btn ghost" id="piCamera">📷 Take photo</button>' +
      '<button class="btn ghost" id="piRecent">🕘 Open recent photo project</button>' +
      '</div>',
      function (root) {
        root.querySelector('#piGallery').onclick = function () { App.closeModal(); pickFile(false); };
        root.querySelector('#piCamera').onclick = function () { App.closeModal(); openCamera(); };
        root.querySelector('#piRecent').onclick = function () { App.closeModal(); openRecentSheet(); };
      }
    );
  }
  function pickFile(cam) {
    buildScreen(); // file inputs live inside the photo screen
    var inp = document.getElementById(cam ? 'phFileCam' : 'phFile');
    inp.onchange = function () {
      if (inp.files && inp.files[0]) {
        loadImageFile(inp.files[0]).then(function (r) { openPhoto(r.img, r.name, r.url); },
          function () { toast('Could not load that image.', true); });
        inp.value = '';
      }
    };
    inp.click();
  }
  function loadImageFile(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res({ img: im, name: file.name || 'photo', url: url }); };
      im.onerror = rej; im.src = url;
    });
  }
  function openPhoto(img, name, url) {
    buildScreen();
    lab().open(img, name, url);
    UI.zoom = 1; UI.panX = 0; UI.panY = 0; UI.filterThumbs = {};
    UI.tool = 'adjust'; UI.adjKey = 'brightness';
    document.querySelectorAll('#phTools button').forEach(function (x) {
      x.classList.toggle('on', x.getAttribute('data-t') === 'adjust');
    });
    App.show('screen-photo');
    UI.refresh();
    window.PhotoUI.renderPanel();
  }

  function openRecentSheet() {
    var items = window.PhotoProjects.list();
    if (!items.length) { toast('No photo projects yet.'); return; }
    var html = '<h3>🕘 Photo projects</h3><div class="stack">' + items.map(function (p) {
      return '<div class="list-item"><div class="kv"><span>' +
        (p.thumb ? '<img src="' + p.thumb + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px;margin-right:8px;vertical-align:middle">' : '') +
        esc(p.name) + '</span><span>' +
        '<button class="icon-btn" data-open="' + p.id + '">📂</button>' +
        '<button class="icon-btn" data-dup="' + p.id + '">⧉</button>' +
        '<button class="icon-btn" data-del="' + p.id + '">🗑</button></span></div>';
    }).join('') + '</div>';
    App.modal(html, function (root) {
      root.querySelectorAll('[data-open]').forEach(function (b) {
        b.onclick = function () { App.closeModal(); buildScreen(); window.PhotoProjects.open(b.getAttribute('data-open')); App.show('screen-photo'); };
      });
      root.querySelectorAll('[data-dup]').forEach(function (b) {
        b.onclick = function () { window.PhotoProjects.dup(b.getAttribute('data-dup')); App.closeModal(); openRecentSheet(); };
      });
      root.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          App.confirm('Delete this photo project?', function (ok) {
            if (ok) { window.PhotoProjects.del(b.getAttribute('data-del')); App.closeModal(); openRecentSheet(); }
          });
        };
      });
    });
  }
  function saveProject() {
    if (!lab().img) return;
    var rec = window.PhotoProjects.save(lab().projectId);
    toast('Project saved ✓');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ================= in-app camera ================= */
  var camStream = null, camFacing = 'environment';
  function openCamera() {
    buildScreen();
    var ov = document.getElementById('phCamOver');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'phCamOver'; ov.className = 'ph-camover';
      ov.innerHTML =
        '<video id="phCamVideo" playsinline muted></video>' +
        '<div class="ph-cambar">' +
          '<button class="icon-btn big" id="phCamClose">✕</button>' +
          '<button class="ph-shutter" id="phCamShot"></button>' +
          '<button class="icon-btn big" id="phCamFlip">⇄</button>' +
        '</div>';
      document.getElementById('screen-photo').appendChild(ov);
      ov.querySelector('#phCamClose').onclick = stopCamera;
      ov.querySelector('#phCamShot').onclick = snapPhoto;
      ov.querySelector('#phCamFlip').onclick = function () {
        camFacing = camFacing === 'environment' ? 'user' : 'environment';
        startCam();
      };
    }
    ov.style.display = 'block';
    App.show('screen-photo');
    startCam();
  }
  function startCam() {
    stopTracks();
    var v = document.getElementById('phCamVideo');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFallback(); return; }
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; camFallback(t('cam.noperm')); }
    }, 9000);
    function ok(st) {
      if (done) { try { st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return; }
      done = true; clearTimeout(timer);
      camStream = st; v.srcObject = st;
      try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
    function bad() { if (!done) { done = true; clearTimeout(timer); camFallback(); } }
    try {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing }, audio: false })
        .then(ok, bad);
    } catch (e) { bad(); }
  }
  function stopTracks() {
    if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; }
    var v = document.getElementById('phCamVideo');
    if (v) v.srcObject = null;
  }
  function stopCamera() {
    stopTracks();
    var ov = document.getElementById('phCamOver');
    if (ov) ov.style.display = 'none';
  }
  function camFallback(msg) {
    stopCamera();
    toast(msg || t('cam.failed'));
    pickFile(true);
  }
  function snapPhoto() {
    var v = document.getElementById('phCamVideo');
    if (!v || !v.videoWidth) { toast(t('cam.notready'), true); return; }
    var c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    var g = c.getContext('2d');
    if (camFacing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); } // mirror fix
    g.drawImage(v, 0, 0);
    var url = c.toDataURL('image/jpeg', 0.92);
    stopCamera();
    var im = new Image();
    im.onload = function () { openPhoto(im, 'camera-photo.jpg', url); };
    im.src = url;
  }
  /* ================= render ================= */
  function drawToScreen() {
    var cv = document.getElementById('phCanvas');
    var pc = lab().previewCanvas;
    if (!cv || !pc) return;
    cv.width = pc.width; cv.height = pc.height;
    cv.getContext('2d').drawImage(pc, 0, 0);
    applyZoom();
  }
  UI.refresh = function () {
    lab().renderPreview();
    drawToScreen();
    if (UI.tool === 'filters') window.PhotoUI.paintFilterThumbs();
    syncUndoRedo();
  };
  UI.refreshAll = function () {
    UI.filterThumbs = {};
    UI.refresh(); window.PhotoUI.renderPanel();
  };
  function scheduleRender(commitLabel) {
    clearTimeout(UI.renderTimer);
    UI.renderTimer = setTimeout(function () {
      lab().renderPreview(); drawToScreen();
      if (commitLabel) { lab().commit(commitLabel); syncUndoRedo(); }
    }, 90);
  }
  function syncUndoRedo() {
    var u = document.getElementById('phUndo'), r = document.getElementById('phRedo');
    if (u) u.style.opacity = lab().hIndex > 0 ? 1 : 0.35;
    if (r) r.style.opacity = lab().hIndex < lab().history.length - 1 ? 1 : 0.35;
  }
  function showBefore(on) {
    var main = document.getElementById('phCanvas'), bef = document.getElementById('phBefore');
    if (!main || !bef) return;
    if (on) {
      var bc = lab().renderOriginalPreview();
      if (!bc) return;
      bef.width = bc.width; bef.height = bc.height;
      bef.getContext('2d').drawImage(bc, 0, 0);
      bef.style.display = 'block'; main.style.display = 'none';
    } else { bef.style.display = 'none'; main.style.display = 'block'; }
  }

  /* ================= pan & zoom gestures ================= */
  function initGestures() {
    var stage = document.getElementById('phStage'), wrap = document.getElementById('phZoom');
    if (!stage || stage._gz) return; stage._gz = true;
    var pts = {}, lastD = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (UI.tool === 'crop') return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pts).length === 2) {
        var k = Object.keys(pts);
        lastD = Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y);
      }
      stage.setPointerCapture(e.pointerId);
    });
    function mv(e) {
      if (!pts[e.pointerId]) return;
      var prev = pts[e.pointerId];
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var k = Object.keys(pts);
      if (k.length === 1) {
        UI.panX += e.clientX - prev.x; UI.panY += e.clientY - prev.y;
      } else if (k.length === 2) {
        var d = Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y);
        if (lastD > 0) UI.zoom = clamp(UI.zoom * d / lastD, 1, 6);
        lastD = d;
      }
      applyZoom();
    }
    function up(e) { delete pts[e.pointerId]; lastD = 0; if (!Object.keys(pts).length) clampPan(); }
    stage.addEventListener('pointermove', mv);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', function () { UI.zoom = 1; UI.panX = 0; UI.panY = 0; applyZoom(); });
  }
  function applyZoom() {
    var wrap = document.getElementById('phZoom');
    if (wrap) wrap.style.transform = 'translate(' + UI.panX + 'px,' + UI.panY + 'px) scale(' + UI.zoom + ')';
  }
  function clampPan() {
    var m = 400;
    UI.panX = clamp(UI.panX, -m, m); UI.panY = clamp(UI.panY, -m, m);
    applyZoom();
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  window.PhotoUI = { openPhoto: openPhoto, importDialog: importDialog, openCamera: openCamera, refreshAll: UI.refreshAll, refresh: UI.refresh, UI: UI };
})();

/* ================= panels ================= */
(function () {
  'use strict';
  var UI = window.PhotoUI.UI;
  function lab() { return window.PhotoLab; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var ADJUSTS = [
    { k: 'brightness', n: 'Brightness', min: -100, max: 100 },
    { k: 'exposure', n: 'Exposure', min: -100, max: 100 },
    { k: 'contrast', n: 'Contrast', min: -100, max: 100 },
    { k: 'highlights', n: 'Highlights', min: -100, max: 100 },
    { k: 'shadows', n: 'Shadows', min: -100, max: 100 },
    { k: 'whites', n: 'Whites', min: -100, max: 100 },
    { k: 'blacks', n: 'Blacks', min: -100, max: 100 },
    { k: 'saturation', n: 'Saturation', min: -100, max: 100 },
    { k: 'vibrance', n: 'Vibrance', min: -100, max: 100 },
    { k: 'temperature', n: 'Temperature', min: -100, max: 100 },
    { k: 'tint', n: 'Tint', min: -100, max: 100 },
    { k: 'sharpness', n: 'Sharpness', min: -100, max: 100 },
    { k: 'clarity', n: 'Clarity', min: -100, max: 100 },
    { k: 'texture', n: 'Texture', min: -100, max: 100 },
    { k: 'dehaze', n: 'Dehaze', min: -100, max: 100 },
    { k: 'fade', n: 'Fade', min: 0, max: 100 },
    { k: 'grain', n: 'Grain', min: 0, max: 100 },
    { k: 'vignette', n: 'Vignette', min: -100, max: 100 }
  ];

  function sliderRow(def, get, set, onDone) {
    var val = get();
    var row = document.createElement('div');
    row.className = 'ph-adjrow';
    row.innerHTML =
      '<div class="ph-adjhead"><span>' + def.n + '</span>' +
      '<span><b class="ph-val">' + Math.round(val) + '</b> ' +
      '<button class="icon-btn sm" data-rst>↺</button></span></div>' +
      '<input type="range" min="' + def.min + '" max="' + def.max + '" value="' + val + '" step="1">';
    var inp = row.querySelector('input'), valEl = row.querySelector('.ph-val');
    inp.addEventListener('input', function () {
      set(parseFloat(inp.value)); valEl.textContent = inp.value;
      scheduleRenderUI();
    });
    inp.addEventListener('change', function () { if (onDone) onDone(); });
    row.querySelector('[data-rst]').onclick = function () {
      set(0); inp.value = 0; valEl.textContent = '0';
      scheduleRenderUI(); if (onDone) onDone();
    };
    return row;
  }
  var _rt = null;
  function scheduleRenderUI(commit) {
    clearTimeout(_rt);
    _rt = setTimeout(function () {
      lab().renderPreview();
      var cv = document.getElementById('phCanvas'), pc = lab().previewCanvas;
      if (cv && pc) { cv.width = pc.width; cv.height = pc.height; cv.getContext('2d').drawImage(pc, 0, 0); }
      if (commit) lab().commit(commit);
    }, 90);
  }

  function renderPanel() {
    var p = document.getElementById('phPanel');
    if (!p) return;
    p.innerHTML = '';
    var _co = document.getElementById('phCropOver');
    if (_co) _co.style.display = UI.tool === 'crop' ? 'block' : 'none';
    if (UI.tool === 'adjust') panelAdjust(p);
    else if (UI.tool === 'filters') panelFilters(p);
    else if (UI.tool === 'hsl') panelHSL(p);
    else if (UI.tool === 'curves') panelCurves(p);
    else if (UI.tool === 'crop') panelCrop(p);
  }
  window.PhotoUI.renderPanel = renderPanel;

  /* ---------- Adjust ---------- */
  function panelAdjust(p) {
    var chips = document.createElement('div'); chips.className = 'ph-chips';
    ADJUSTS.forEach(function (a) {
      var b = document.createElement('button');
      b.textContent = a.n; b.className = UI.adjKey === a.k ? 'on' : '';
      var v = lab().getParam(a.k);
      if (v) b.classList.add('mod');
      b.onclick = function () { UI.adjKey = a.k; renderPanel(); };
      chips.appendChild(b);
    });
    p.appendChild(chips);
    var def = ADJUSTS.find(function (a) { return a.k === UI.adjKey; });
    p.appendChild(sliderRow(def,
      function () { return lab().getParam(def.k); },
      function (v) { lab().setParam(def.k, v); },
      function () { lab().commit('adjust ' + def.n); }
    ));
    var resetAll = document.createElement('button');
    resetAll.className = 'btn ghost sm'; resetAll.textContent = '↺ Reset all adjustments';
    resetAll.style.marginTop = '8px';
    resetAll.onclick = function () { lab().resetAll(); lab().renderPreview(); window.PhotoUI.refresh(); renderPanel(); };
    p.appendChild(resetAll);
  }

  /* ---------- Filters ---------- */
  function panelFilters(p) {
    var PF = window.PhotoFilters;
    var cats = ['All'].concat(PF.cats());
    var bar = document.createElement('div'); bar.className = 'ph-chips';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.textContent = c; b.className = (UI.filterCat || 'All') === c ? 'on' : '';
      b.onclick = function () { UI.filterCat = c === 'All' ? null : c; renderPanel(); };
      bar.appendChild(b);
    });
    p.appendChild(bar);
    var cur = lab().params.filter;
    // intensity slider for active filter
    if (cur && cur.id) {
      var f = PF.get(cur.id);
      var box = document.createElement('div'); box.className = 'ph-adjrow';
      box.innerHTML = '<div class="ph-adjhead"><span>🎨 ' + esc(f ? f.n : cur.id) + ' — intensity</span>' +
        '<span><b class="ph-val">' + Math.round(cur.intensity == null ? 80 : cur.intensity) + '</b> ' +
        '<button class="icon-btn sm" data-off>✕</button></span></div>' +
        '<input type="range" min="0" max="100" value="' + (cur.intensity == null ? 80 : cur.intensity) + '">';
      var inp = box.querySelector('input'), valEl = box.querySelector('.ph-val');
      inp.addEventListener('input', function () {
        lab().params.filter.intensity = parseFloat(inp.value); valEl.textContent = inp.value;
        scheduleRenderUI();
      });
      inp.addEventListener('change', function () { lab().commit('filter intensity'); });
      box.querySelector('[data-off]').onclick = function () {
        lab().params.filter = null; lab().commit('filter off'); window.PhotoUI.refresh(); renderPanel();
      };
      p.appendChild(box);
    }
    var grid = document.createElement('div'); grid.className = 'ph-fgrid';
    var list = UI.filterCat ? PF.byCat(UI.filterCat) : PF.list();
    list.forEach(function (f) {
      var d = document.createElement('button');
      d.className = 'ph-fcard' + (cur && cur.id === f.id ? ' on' : '');
      d.innerHTML = '<img alt=""><span>' + esc(f.name) + '</span>';
      d.onclick = function () {
        lab().params.filter = { id: f.id, intensity: (cur && cur.id === f.id && cur.intensity != null) ? cur.intensity : 80 };
        lab().commit('filter ' + f.name);
        window.PhotoUI.refresh(); renderPanel();
      };
      grid.appendChild(d);
      paintThumb(d.querySelector('img'), f.id);
    });
    p.appendChild(grid);
  }
  // render a tiny filtered preview for the filter card (real pipeline)
  function paintThumb(img, fid) {
    if (UI.filterThumbs[fid]) { img.src = UI.filterThumbs[fid]; return; }
    setTimeout(function () {
      try {
        var src = lab().img;
        if (!src || img._done) return;
        img._done = true;
        var s = Math.min(1, 140 / Math.max(src.naturalWidth, src.naturalHeight));
        var w = Math.max(1, Math.round(src.naturalWidth * s)), h = Math.max(1, Math.round(src.naturalHeight * s));
        var P = window.PhotoLabDefault();
        P.filter = { id: fid, intensity: 85 };
        var c = lab().renderWith(P, w, h);
        var url = c.toDataURL('image/jpeg', 0.72);
        UI.filterThumbs[fid] = url; img.src = url;
      } catch (e) { /* leave placeholder */ }
    }, 40);
  }
  function paintFilterThumbs() {
    document.querySelectorAll('.ph-fcard img').forEach(function (img, i) {
      var card = img.closest('.ph-fcard');
    });
  }
  window.PhotoUI.paintFilterThumbs = paintFilterThumbs;

  /* ---------- HSL ---------- */
  var HSL_CH = [
    { k: 'red', n: '🔴 Red' }, { k: 'orange', n: '🟠 Orange' }, { k: 'yellow', n: '🟡 Yellow' },
    { k: 'green', n: '🟢 Green' }, { k: 'aqua', n: '🩵 Aqua' }, { k: 'blue', n: '🔵 Blue' },
    { k: 'purple', n: '🟣 Purple' }, { k: 'magenta', n: '🩷 Magenta' }
  ];
  function panelHSL(p) {
    var chips = document.createElement('div'); chips.className = 'ph-chips';
    HSL_CH.forEach(function (c) {
      var b = document.createElement('button');
      b.textContent = c.n; b.className = UI.hslCh === c.k ? 'on' : '';
      var v = lab().params.hsl[c.k];
      if (v.h || v.s || v.l) b.classList.add('mod');
      b.onclick = function () { UI.hslCh = c.k; renderPanel(); };
      chips.appendChild(b);
    });
    p.appendChild(chips);
    [['h', 'Hue'], ['s', 'Saturation'], ['l', 'Luminance']].forEach(function (pr) {
      p.appendChild(sliderRow({ n: pr[1], min: -100, max: 100 },
        function () { return lab().params.hsl[UI.hslCh][pr[0]]; },
        function (v) { lab().params.hsl[UI.hslCh][pr[0]] = v; },
        function () { lab().commit('hsl'); }
      ));
    });
    var cb = document.createElement('div'); cb.className = 'ph-adjrow';
    cb.innerHTML = '<div class="ph-adjhead"><span>⚖️ Color balance (warm ↔ cool)</span></div>';
    p.appendChild(cb);
    [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights']].forEach(function (pr) {
      p.appendChild(sliderRow({ n: pr[1], min: -100, max: 100 },
        function () { return lab().params.colorBalance[pr[0]]; },
        function (v) { lab().params.colorBalance[pr[0]] = v; },
        function () { lab().commit('color balance'); }
      ));
    });
  }
})();

/* ================= curves / crop / export ================= */
(function () {
  'use strict';
  var UI = window.PhotoUI.UI;
  function lab() { return window.PhotoLab; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function renderPanel() { window.PhotoUI.renderPanel(); }

  var CURVE_PRESETS = {
    soft: { n: 'Soft', pts: [[0, 0], [64, 70], [192, 186], [255, 255]] },
    contrast: { n: 'High Contrast', pts: [[0, 0], [64, 40], [192, 215], [255, 255]] },
    matte: { n: 'Matte', pts: [[0, 28], [255, 232]] },
    fade: { n: 'Fade', pts: [[0, 34], [128, 132], [255, 224]] },
    cine: { n: 'Cinematic', pts: [[0, 12], [64, 58], [128, 128], [192, 198], [255, 244]] }
  };

  function panelCurves(p) {
    var tabs = document.createElement('div'); tabs.className = 'ph-chips';
    [['rgb', 'RGB'], ['r', '🔴 R'], ['g', '🟢 G'], ['b', '🔵 B']].forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t[1]; b.className = UI.curveCh === t[0] ? 'on' : '';
      b.onclick = function () { UI.curveCh = t[0]; renderPanel(); };
      tabs.appendChild(b);
    });
    p.appendChild(tabs);
    var cv = document.createElement('canvas');
    cv.width = 560; cv.height = 560; cv.className = 'ph-curve';
    p.appendChild(cv);
    drawCurve(cv);
    initCurveGestures(cv);
    var pr = document.createElement('div'); pr.className = 'ph-chips'; pr.style.marginTop = '8px';
    Object.keys(CURVE_PRESETS).forEach(function (k) {
      var b = document.createElement('button');
      b.textContent = CURVE_PRESETS[k].n;
      b.onclick = function () {
        lab().params.curves[UI.curveCh] = CURVE_PRESETS[k].pts.map(function (pt) { return pt.slice(); });
        lab().commit('curve preset'); refreshPreview(); drawCurve(cv);
      };
      pr.appendChild(b);
    });
    var rst = document.createElement('button'); rst.textContent = '↺ Reset';
    rst.onclick = function () {
      lab().params.curves[UI.curveCh] = [[0, 0], [255, 255]];
      lab().commit('curve reset'); refreshPreview(); drawCurve(cv);
    };
    pr.appendChild(rst);
    p.appendChild(pr);
  }
  function curvePts() { return lab().params.curves[UI.curveCh]; }
  function drawCurve(cv) {
    var g = cv.getContext('2d'), S = cv.width;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#14141f'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (var i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo(S * i / 4, 0); g.lineTo(S * i / 4, S); g.stroke();
      g.beginPath(); g.moveTo(0, S * i / 4); g.lineTo(S, S * i / 4); g.stroke();
    }
    var pts = curvePts().slice().sort(function (a, b) { return a[0] - b[0]; });
    var col = UI.curveCh === 'r' ? '#ff5a5a' : UI.curveCh === 'g' ? '#5aff7a' : UI.curveCh === 'b' ? '#5aa5ff' : '#ffffff';
    g.strokeStyle = col; g.lineWidth = 5; g.beginPath();
    for (var x = 0; x <= 255; x += 4) {
      var y = interpY(pts, x), px = x / 255 * S, py = S - y / 255 * S;
      if (x === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    pts.forEach(function (pt) {
      g.fillStyle = col;
      g.beginPath(); g.arc(pt[0] / 255 * S, S - pt[1] / 255 * S, 14, 0, 6.283); g.fill();
      g.fillStyle = '#0b0b16';
      g.beginPath(); g.arc(pt[0] / 255 * S, S - pt[1] / 255 * S, 6, 0, 6.283); g.fill();
    });
  }
  function interpY(pts, x) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0]; }), k = 0;
    while (k < p.length - 2 && x > p[k + 1][0]) k++;
    var p0 = p[k], p1 = p[k + 1], t = p1[0] === p0[0] ? 0 : (x - p0[0]) / (p1[0] - p0[0]);
    return p0[1] + (p1[1] - p0[1]) * clamp(t, 0, 1);
  }
  function initCurveGestures(cv) {
    var drag = -1;
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width * 255, 0, 255),
              clamp((1 - (e.clientY - r.top) / r.height) * 255, 0, 255)];
    }
    function nearest(p) {
      var pts = curvePts(), bi = 0, bd = 1e9;
      pts.forEach(function (pt, i) {
        var d = Math.hypot(pt[0] - p[0], pt[1] - p[1]);
        if (d < bd) { bd = d; bi = i; }
      });
      return bd < 40 ? bi : -1;
    }
    cv.addEventListener('pointerdown', function (e) {
      var p = pos(e), i = nearest(p), pts = curvePts();
      if (i >= 0) { drag = i; }
      else if (pts.length < 10) { pts.push([Math.round(p[0]), Math.round(p[1])]); drag = pts.length - 1; lab().commit('curve add'); }
      else return;
      cv.setPointerCapture(e.pointerId);
      drawCurve(cv); refreshPreview(true);
    });
    cv.addEventListener('pointermove', function (e) {
      if (drag < 0) return;
      var p = pos(e), pts = curvePts();
      pts[drag] = [Math.round(p[0]), Math.round(p[1])];
      drawCurve(cv); refreshPreview(true);
    });
    cv.addEventListener('pointerup', function () {
      if (drag >= 0) { lab().commit('curve edit'); drag = -1; refreshPreview(); }
    });
    cv.addEventListener('dblclick', function (e) {
      var p = pos(e), i = nearest(p), pts = curvePts();
      if (i >= 0 && pts.length > 2) { pts.splice(i, 1); lab().commit('curve del'); drawCurve(cv); refreshPreview(); }
    });
  }
  function refreshPreview(light) {
    clearTimeout(refreshPreview._t);
    refreshPreview._t = setTimeout(function () {
      lab().renderPreview();
      var cv = document.getElementById('phCanvas'), pc = lab().previewCanvas;
      if (cv && pc) { cv.width = pc.width; cv.height = pc.height; cv.getContext('2d').drawImage(pc, 0, 0); }
      if (!light) lab().commit('curves');
    }, light ? 120 : 60);
  }

  /* ---------- Crop ---------- */
  var RATIOS = [
    { k: 'free', n: 'Free', r: 0 }, { k: '11', n: '1:1', r: 1 },
    { k: '45', n: '4:5', r: 4 / 5 }, { k: '34', n: '3:4', r: 3 / 4 },
    { k: '169', n: '16:9', r: 16 / 9 }, { k: '916', n: '9:16', r: 9 / 16 },
    { k: 'orig', n: 'Original', r: -1 }
  ];
  function panelCrop(p) {
    UI.zoom = 1; UI.panX = 0; UI.panY = 0;
    var _zw = document.getElementById('phZoom');
    if (_zw) _zw.style.transform = '';
    var chips = document.createElement('div'); chips.className = 'ph-chips';
    RATIOS.forEach(function (r) {
      var b = document.createElement('button');
      b.textContent = r.n; b.className = UI.cropRatio === r.k ? 'on' : '';
      b.onclick = function () { UI.cropRatio = r.k; applyRatio(r); };
      chips.appendChild(b);
    });
    p.appendChild(chips);
    var row = document.createElement('div'); row.className = 'ph-croprow';
    row.innerHTML =
      '<button class="btn ghost sm" data-a="rot">⟳ 90°</button>' +
      '<button class="btn ghost sm" data-a="fh">⇋ Flip</button>' +
      '<button class="btn ghost sm" data-a="fv">⇅ Flip</button>' +
      '<button class="btn ghost sm" data-a="rst">↺ Reset</button>';
    row.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        var P = lab().params, a = b.getAttribute('data-a');
        if (a === 'rot') P.rotate = (P.rotate + 90) % 360;
        else if (a === 'fh') P.flipH = !P.flipH;
        else if (a === 'fv') P.flipV = !P.flipV;
        else if (a === 'rst') { P.crop = { x: 0, y: 0, w: 1, h: 1 }; P.rotate = 0; P.flipH = P.flipV = false; P.straighten = 0; }
        lab().commit('transform'); enterCropBase(); layoutCropBox();
      };
    });
    p.appendChild(row);
    var st = document.createElement('div'); st.className = 'ph-adjrow';
    st.innerHTML = '<div class="ph-adjhead"><span>Straighten</span><b class="ph-val">' + Math.round(lab().params.straighten) + '°</b></div>' +
      '<input type="range" min="-10" max="10" step="0.5" value="' + lab().params.straighten + '">';
    var inp = st.querySelector('input'), vv = st.querySelector('.ph-val');
    inp.addEventListener('input', function () {
      lab().params.straighten = parseFloat(inp.value); vv.textContent = inp.value + '°';
      enterCropBase();
    });
    inp.addEventListener('change', function () { lab().commit('straighten'); });
    p.appendChild(st);
    var hint = document.createElement('p'); hint.className = 'muted';
    hint.textContent = 'Drag the box to move • drag the corner to resize';
    p.appendChild(hint);
    enterCropBase(); layoutCropBox();
  }
  // show full (uncropped) image under the crop box
  function enterCropBase() {
    if (!lab().img) return; // no photo yet (e.g. camera cancelled) — nothing to draw under
    var cv = document.getElementById('phCanvas');
    if (!cv) return;
    var P2 = JSON.parse(JSON.stringify(lab().params));
    P2.crop = { x: 0, y: 0, w: 1, h: 1 };
    var ns = { w: lab().img.naturalWidth, h: lab().img.naturalHeight };
    var rot = ((P2.rotate % 360) + 360) % 360;
    var bw = (rot === 90 || rot === 270) ? ns.h : ns.w, bh = (rot === 90 || rot === 270) ? ns.w : ns.h;
    var s = Math.min(1, 1600 / Math.max(bw, bh));
    var c = lab().renderWith(P2, Math.max(1, Math.round(bw * s)), Math.max(1, Math.round(bh * s)));
    cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').drawImage(c, 0, 0);
    var _co2 = document.getElementById('phCropOver');
    if (_co2) _co2.style.display = 'block';
  }
  function applyRatio(r) {
    var P = lab().params;
    if (r.r === 0) return; // free: keep current box
    var target = r.r;
    if (r.r === -1) { // original: full image aspect after rotation
      if (!lab().img) return;
      var ns = { w: lab().img.naturalWidth, h: lab().img.naturalHeight };
      var rot = ((P.rotate % 360) + 360) % 360;
      target = ((rot === 90 || rot === 270) ? ns.h : ns.w) / ((rot === 90 || rot === 270) ? ns.w : ns.h);
    }
    // fit target aspect box centered inside current crop
    var c = P.crop, ca = c.w / c.h, nw, nh;
    if (target > ca) { nw = c.w; nh = c.w / target; } else { nh = c.h; nw = c.h * target; }
    P.crop = { x: c.x + (c.w - nw) / 2, y: c.y + (c.h - nh) / 2, w: nw, h: nh };
    lab().commit('crop ratio'); layoutCropBox();
  }
  function layoutCropBox() {
    var box = document.getElementById('phCropBox');
    if (!box) return;
    var c = lab().params.crop;
    box.style.left = (c.x * 100) + '%'; box.style.top = (c.y * 100) + '%';
    box.style.width = (c.w * 100) + '%'; box.style.height = (c.h * 100) + '%';
  }
  function initCropDrag() {
    // delegated: elements exist after buildScreen
    document.addEventListener('pointerdown', function (e) {
      if (e.target.id === 'phCropHandle' || e.target.id === 'phCropBox') {
        e.preventDefault();
        var mode = e.target.id === 'phCropHandle' ? 'resize' : 'move';
        var over = document.getElementById('phCropOver');
        var r = over.getBoundingClientRect();
        var sx = e.clientX, sy = e.clientY;
        var c0 = JSON.parse(JSON.stringify(lab().params.crop));
        function mv(ev) {
          var dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
          var c = lab().params.crop;
          if (mode === 'move') {
            c.x = clamp(c0.x + dx, 0, 1 - c0.w); c.y = clamp(c0.y + dy, 0, 1 - c0.h);
          } else {
            var ratio = UI.cropRatio === 'free' ? 0 : RATIOS.find(function (x) { return x.k === UI.cropRatio; }).r;
            var nw = clamp(c0.w + dx, 0.05, 1 - c0.x), nh = clamp(c0.h + dy, 0.05, 1 - c0.y);
            if (ratio > 0) { nh = nw / ratio; if (c0.y + nh > 1) { nh = 1 - c0.y; nw = nh * ratio; } }
            else if (ratio === -1) { /* original: keep free on resize */ }
            c.w = nw; c.h = nh;
          }
          layoutCropBox();
        }
        function up() {
          document.removeEventListener('pointermove', mv);
          document.removeEventListener('pointerup', up);
          lab().commit('crop');
        }
        document.addEventListener('pointermove', mv);
        document.addEventListener('pointerup', up);
      }
    });
  }
  window.PhotoUI.initCropDrag = initCropDrag;

  /* ---------- Export ---------- */
  var EXP = { format: 'jpg', quality: 'high', size: 'orig' };
  var QUALITY = { standard: 70, high: 85, max: 95 };
  var SIZES = [
    { k: 'orig', n: 'Original', max: 0 },
    { k: '1080', n: '1080p', max: 1080 },
    { k: '2k', n: '2K', max: 2048 },
    { k: '4k', n: '4K', max: 4096 },
    { k: '8k', n: '8K Upscale', max: 7680 }
  ];
  function openExport() {
    if (!lab().img) return;
    var sz = SIZES.find(function (x) { return x.k === EXP.size; });
    var est = estimateExport(sz);
    App.modal(
      '<h3>⬇ Export photo</h3>' +
      '<label class="lbl">Format</label><div class="ph-chips" id="exFmt">' +
        ['jpg|JPG', 'png|PNG', 'webp|WebP'].map(function (o) {
          var kv = o.split('|');
          return '<button data-v="' + kv[0] + '" class="' + (EXP.format === kv[0] ? 'on' : '') + '">' + kv[1] + '</button>';
        }).join('') + '</div>' +
      '<label class="lbl">Quality</label><div class="ph-chips" id="exQ">' +
        ['standard|Standard', 'high|High', 'max|Maximum'].map(function (o) {
          var kv = o.split('|');
          return '<button data-v="' + kv[0] + '" class="' + (EXP.quality === kv[0] ? 'on' : '') + '">' + kv[1] + '</button>';
        }).join('') + '</div>' +
      '<label class="lbl">Resolution</label><div class="ph-chips" id="exS">' +
        SIZES.map(function (s) {
          return '<button data-v="' + s.k + '" class="' + (EXP.size === s.k ? 'on' : '') + '">' + s.n + '</button>';
        }).join('') + '</div>' +
      '<p class="muted" id="exEst">≈ ' + est.size + ' • ' + est.dim + '</p>' +
      (EXP.size === '8k' ? '<p class="muted">8K Upscale: high-quality upscaling of your photo (not native 8K capture).</p>' : '') +
      '<div class="row" style="margin-top:10px"><button class="btn primary" id="exSave" style="flex:1">⬇ Save to gallery</button>' +
      '<button class="btn ghost" id="exShare">📤 Share</button></div>',
      function (root) {
        function pick(id, key) {
          root.querySelectorAll('#' + id + ' button').forEach(function (b) {
            b.onclick = function () { EXP[key] = b.getAttribute('data-v'); App.closeModal(); openExport(); };
          });
        }
        pick('exFmt', 'format'); pick('exQ', 'quality'); pick('exS', 'size');
        root.querySelector('#exSave').onclick = function () { doExport(false); };
        root.querySelector('#exShare').onclick = function () { doExport(true); };
      }
    );
  }
  function estimateExport(sz) {
    var ns = { w: lab().img.naturalWidth, h: lab().img.naturalHeight };
    var rot = ((lab().params.rotate % 360) + 360) % 360;
    var bw = (rot === 90 || rot === 270) ? ns.h : ns.w, bh = (rot === 90 || rot === 270) ? ns.w : ns.h;
    var cw = bw * lab().params.crop.w, ch = bh * lab().params.crop.h;
    var s = sz.max ? Math.min(8, sz.max / Math.max(cw, ch)) : 1; // allow upscale to 8K
    // note: renderExport caps at 1 — for upscale we render then scale
    var w = Math.round(cw * s), h = Math.round(ch * s);
    var bytes = lab().estimateBytes(w, h, EXP.format, QUALITY[EXP.quality]);
    var size = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
    return { size: size, dim: w + ' × ' + h, w: w, h: h };
  }
  function doExport(share) {
    var sz = SIZES.find(function (x) { return x.k === EXP.size; });
    var est = estimateExport(sz);
    toast('Rendering ' + est.dim + '…');
    setTimeout(function () {
      var maxDim = sz.max || 0;
      var base = lab().renderExport(maxDim >= 4096 ? 4096 : maxDim);
      if (!base) { toast('Export failed.', true); return; }
      var out = base;
      if (maxDim > 4096 || (maxDim && Math.max(base.width, base.height) < Math.max(est.w, est.h))) {
        // upscale step for 8K / large targets
        out = document.createElement('canvas');
        out.width = est.w; out.height = est.h;
        var g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(base, 0, 0, est.w, est.h);
      }
      var mime = EXP.format === 'png' ? 'image/png' : EXP.format === 'webp' ? 'image/webp' : 'image/jpeg';
      var q = QUALITY[EXP.quality] / 100;
      out.toBlob(function (blob) {
        if (!blob) { toast('Export failed.', true); return; }
        var fname = (lab().imgName.replace(/\.[^.]+$/, '') || 'photo') + '-edited.' + EXP.format;
        if (share && navigator.share) {
          var file = new File([blob], fname, { type: mime });
          navigator.share({ files: [file], title: 'PixMaster edit' }).catch(function () {});
          App.closeModal();
        } else {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = fname;
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
          toast('Saved ✓'); App.closeModal();
        }
      }, mime, q);
    }, 60);
  }
  window.PhotoUI.openExport = openExport;
})();
