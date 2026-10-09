/* ViraCut AI — tx-flow.js (1/2) — TemplateX engine: shared painter, overlays,
 * animated thumbnails, browse, detail. Uses window.FX, TXFILTERS, TX, TXMusic. */
(function () {
  'use strict';

  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ---------- overlays ---------- */
  function particlesFor(kind) {
    var n = kind === 'confetti' ? 60 : kind === 'rain' ? 90 : 40, arr = [];
    for (var i = 0; i < n; i++) arr.push({ x: rnd(i * 3 + 1), y: rnd(i * 7 + 2), s: rnd(i * 13 + 3), c: Math.floor(rnd(i * 29 + 4) * 6) });
    return arr;
  }
  var OVL = {
    particles: function (g, W, H, t, P) {
      g.save(); g.fillStyle = '#fff';
      P.forEach(function (p) {
        var y = (((p.y - t * 0.03 * (0.5 + p.s)) % 1) + 1) % 1;
        g.globalAlpha = 0.5;
        g.beginPath(); g.arc(p.x * W, y * H, 1.5 + p.s * 2.5, 0, 7); g.fill();
      });
      g.restore();
    },
    bokeh: function (g, W, H, t, P) {
      var cols = ['#f9a8d4', '#ffffff', '#fda4af'];
      g.save();
      P.forEach(function (p) {
        var x = (((p.x + t * 0.02 * (p.s - 0.5)) % 1) + 1) % 1;
        var y = (((p.y - t * 0.015) % 1) + 1) % 1;
        g.globalAlpha = 0.22; g.fillStyle = cols[p.c % 3];
        g.beginPath(); g.arc(x * W, y * H, 8 + p.s * 22, 0, 7); g.fill();
      });
      g.restore();
    },
    confetti: function (g, W, H, t, P) {
      var cols = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#fde047'];
      g.save();
      P.forEach(function (p, i) {
        var y = ((p.y + t * 0.25 * (0.4 + p.s)) % 1.2) - 0.1;
        g.globalAlpha = 0.9; g.fillStyle = cols[p.c % 6];
        g.save(); g.translate(p.x * W, y * H); g.rotate(t * 2 + i);
        g.fillRect(-4, -2.5, 8, 5); g.restore();
      });
      g.restore();
    },
    rain: function (g, W, H, t, P) {
      g.save(); g.strokeStyle = 'rgba(165,200,255,.5)'; g.lineWidth = 1.5;
      P.forEach(function (p) {
        var y = ((p.y + t * 0.9 * (0.5 + p.s)) % 1.2) - 0.1;
        var x = p.x * W, yy = y * H;
        g.beginPath(); g.moveTo(x, yy); g.lineTo(x - 4, yy + 16); g.stroke();
      });
      g.restore();
    },
    grain: function (g, W, H, t) { var fx = FX.get('grain'); g.save(); fx.over(g, null, { start: 0, end: 1 }, W, H, t); g.restore(); },
    gloworbs: function (g, W, H, t) { var fx = FX.get('gloworbs'); g.save(); fx.over(g, null, { start: 0, end: 1 }, W, H, t); g.restore(); },
    streak: function (g, W, H, t) { var fx = FX.get('streak'); g.save(); fx.over(g, null, { start: 0, end: 1 }, W, H, t); g.restore(); },
    smoke: function (g, W, H, t) { var fx = FX.get('smoke'); g.save(); fx.over(g, null, { start: 0, end: 1 }, W, H, t); g.restore(); }
  };

  /* ---------- placeholder art (frame coords) ---------- */
  function placeholderArt(g, slot, W, H, icon) {
    var hue = (slot * 47 + 200) % 360;
    var gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, 'hsl(' + hue + ',55%,30%)');
    gr.addColorStop(1, 'hsl(' + ((hue + 60) % 360) + ',60%,16%)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'center';
    g.font = '700 ' + Math.round(W * 0.085) + 'px sans-serif';
    g.fillText((icon || '◈') + ' ' + slot, W / 2, H * 0.46);
    g.font = '500 ' + Math.round(W * 0.042) + 'px sans-serif';
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillText('your photo / video', W / 2, H * 0.54);
  }

  /* ---------- procedural art (original) ---------- */
  var TXArt = {
    mosque: function (g, W, H) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#060a1c'); gr.addColorStop(0.62, '#0b1230'); gr.addColorStop(1, '#04060e');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var i, sx, sy;
      g.fillStyle = '#fff';
      for (i = 0; i < 70; i++) {
        sx = rnd(i * 3.7) * W; sy = rnd(i * 9.1) * H * 0.55;
        g.globalAlpha = 0.25 + rnd(i * 7.7) * 0.6;
        g.beginPath(); g.arc(sx, sy, 0.4 + rnd(i * 5.3) * 1.4, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
      var mx = W * 0.5, my = H * 0.19, mr = W * 0.11;
      var mg = g.createRadialGradient(mx, my, 0, mx, my, mr * 3.2);
      mg.addColorStop(0, 'rgba(255,244,200,0.55)'); mg.addColorStop(1, 'rgba(255,244,200,0)');
      g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr * 3.2, 0, 7); g.fill();
      g.fillStyle = '#f7efc8'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
      g.fillStyle = 'rgba(215,205,165,.45)'; g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.72, 0, 7); g.fill();
      var by = H * 0.76;
      g.fillStyle = '#04060d';
      g.fillRect(0, by, W, H - by);
      g.beginPath(); g.arc(W * 0.5, by, W * 0.13, Math.PI, 0); g.fill();
      g.fillRect(W * 0.5 - 2, by - W * 0.13 - 26, 4, 26);
      g.beginPath(); g.arc(W * 0.5, by - W * 0.13 - 28, 6, 0, 7); g.fill();
      [0.30, 0.70].forEach(function (px) {
        var x = W * px;
        g.fillRect(x - 8, by - H * 0.22, 16, H * 0.22);
        g.beginPath(); g.arc(x, by - H * 0.22, 14, Math.PI, 0); g.fill();
        g.fillRect(x - 2, by - H * 0.22 - 30, 4, 20);
        g.beginPath(); g.arc(x, by - H * 0.22 - 32, 5, 0, 7); g.fill();
      });
      [0.36, 0.64].forEach(function (px) {
        g.beginPath(); g.arc(W * px, by, W * 0.07, Math.PI, 0); g.fill();
      });
      g.fillStyle = 'rgba(255,200,90,.8)';
      for (i = 0; i < 5; i++) g.fillRect(W * (0.42 + i * 0.04), by + 10, 6, 14);
    }
  };

  /* ---------- text ---------- */
  function drawText(g, tx, W, H, local) {
    var fs = Math.round((tx.size || 7) * W / 100);
    g.save();
    var stack = tx.urdu ? '"Noto Nastaliq Urdu","Urdu Typesetting",serif' : 'sans-serif';
    g.font = '800 ' + fs + 'px ' + stack; g.textAlign = 'center';
    var y = tx.pos === 'top' ? H * 0.15 : tx.pos === 'bottom' ? H * 0.85 : H * 0.5;
    var a = 1, dy = 0, sc = 1, str = String(tx.content);
    if (tx.anim === 'fadeup') { var k = Math.min(1, local / 0.6); a = k; dy = (1 - k) * 30; }
    else if (tx.anim === 'pop') { var k2 = Math.min(1, local / 0.45); sc = 0.6 + 0.4 * (1 - Math.pow(1 - k2, 3)); a = k2; }
    else if (tx.anim === 'type') { str = str.slice(0, Math.min(str.length, Math.floor(local / 0.06))); }
    else if (tx.anim === 'words') {
      var _w = str.split(' '), _n = Math.min(_w.length, Math.floor(local / 0.55) + 1);
      str = _w.slice(0, _n).join(' ');
      var _k = Math.min(1, (local % 0.55) / 0.3); a = Math.max(a, _k);
    }
    g.globalAlpha = Math.max(0, Math.min(1, a));
    g.translate(W / 2, y + dy); g.scale(sc, sc); g.translate(-W / 2, -y);
    g.shadowColor = tx.glow || 'rgba(0,0,0,.85)'; g.shadowBlur = tx.glow ? 26 : 10;
    g.fillStyle = tx.color || '#fff';
    var words = str.split(' '), lines = [], line = '';
    words.forEach(function (w) {
      var t2 = line + w + ' ';
      if (g.measureText(t2).width > W * 0.86 && line) { lines.push(line); line = w + ' '; } else line = t2;
    });
    lines.push(line);
    var lh = fs * (tx.urdu ? 1.7 : 1.25), y0 = y - (lines.length - 1) * lh / 2;
    lines.forEach(function (l, i) { g.fillText(l, W / 2, y0 + i * lh); });
    g.restore();
  }

  /* ---------- media (centered coords) ---------- */
  function drawCoverAnim(g, media, W, H, anim, pr) {
    var sw = media.sw, sh = media.sh;
    var s = Math.max(W / sw, H / sh), z = 1, dx = 0;
    if (anim === 'kenburns-in') z = 1 + 0.15 * pr;
    else if (anim === 'kenburns-out') z = 1.15 - 0.15 * pr;
    else if (anim === 'slow-zoom') z = 1 + 0.08 * pr;
    else if (anim === 'pan-left') { z = 1.18; dx = (0.5 - pr) * 0.12 * W; }
    else if (anim === 'pan-right') { z = 1.18; dx = (pr - 0.5) * 0.12 * W; }
    var w = sw * s * z, h = sh * s * z;
    g.drawImage(media.el, dx - w / 2, -h / 2, w, h);
  }
  function paintFlat(x, sc, media, W, H, local, artFn) {
    x.filter = TXFILTERS[sc.filter] || 'none';
    if (media && media.ok) {
      var pr = Math.max(0, Math.min(1, local / sc.dur));
      drawCoverAnim(x, media, W, H, sc.anim || 'kenburns-in', pr);
    } else {
      x.save(); x.translate(-W / 2, -H / 2);
      if (artFn) artFn(x, W, H);
      else placeholderArt(x, sc.slot, W, H);
      x.restore();
    }
    x.filter = 'none';
  }

  /* full scene into tg (frame coords). flatC/flatX = scratch. */
  function composeScene(tg, flatX, flatC, tpl, ovlParts, mediaBySlot, idx, local, t, W, H) {
    var sc = tpl.scenes[idx], fx = FX.get(sc.fx);
    /* framed-photo templates: photo inside a decorative frame (frame static, photo slow-zooms) */
    if (tpl.frame && window.TXFrame) {
      var m0 = mediaBySlot[sc.slot];
      tg.save(); tg.fillStyle = '#000'; tg.fillRect(0, 0, W, H); tg.restore();
      TXFrame.render(tg, W, H, tpl, (m0 && m0.ok) ? m0.el : null, t, local, sc.dur);
      if (sc.text) drawText(tg, sc.text, W, H, local);
      (tpl.overlays || []).forEach(function (o) { if (OVL[o]) OVL[o](tg, W, H, t, ovlParts[o]); });
      return;
    }
    var artFn = tpl.art && TXArt[tpl.art];
    tg.save();
    tg.fillStyle = '#000'; tg.fillRect(0, 0, W, H);
    if (fx.post) {
      flatX.save();
      flatX.fillStyle = '#000'; flatX.fillRect(0, 0, W, H);
      fxPre(fx, flatX, sc, W, H, local);
      flatX.translate(W / 2, H / 2);
      paintFlat(flatX, sc, mediaBySlot[sc.slot], W, H, local, artFn);
      flatX.restore();
      fxPost(fx, tg, flatC, sc, W, H, local);
    } else {
      fxPre(fx, tg, sc, W, H, local);
      tg.save(); tg.translate(W / 2, H / 2);
      paintFlat(tg, sc, mediaBySlot[sc.slot], W, H, local, artFn);
      tg.restore();
    }
    tg.restore();
    fxOver(fx, tg, sc, W, H, local);
    if (sc.text) drawText(tg, sc.text, W, H, local);
    (tpl.overlays || []).forEach(function (o) { if (OVL[o]) OVL[o](tg, W, H, t, ovlParts[o]); });
  }

  function ovlPartsFor(tpl) {
    var o = {};
    (tpl.overlays || []).forEach(function (k) { o[k] = particlesFor(k); });
    return o;
  }

  /* ViraCut FX calling convention: pre/over/post take (g, clip, item, W, H, t)
     with item = {start, end}. This adapts template scenes to it. */
  function fxItem(sc) { return { start: 0, end: sc.dur }; }
  function fxPre(fx, g, sc, W, H, local) { if (fx.pre) fx.pre(g, null, fxItem(sc), W, H, local); }
  function fxOver(fx, g, sc, W, H, local) { if (fx.over) { g.save(); fx.over(g, null, fxItem(sc), W, H, local); g.restore(); } }
  function fxPost(fx, g, off, sc, W, H, local) { if (fx.post) fx.post(g, off, null, fxItem(sc), W, H, local); }

  function sceneAt(tpl, starts, t) {
    for (var i = tpl.scenes.length - 1; i >= 0; i--) if (t >= starts[i]) return i;
    return 0;
  }
  function startsFor(tpl) {
    var s = [], acc = 0;
    tpl.scenes.forEach(function (sc) { s.push(acc); acc += sc.dur; });
    return s;
  }

  window.TXCore = {
    composeScene: composeScene, ovlPartsFor: ovlPartsFor, sceneAt: sceneAt,
    startsFor: startsFor, placeholderArt: placeholderArt, drawText: drawText
  };

  /* ================= animated thumbnails (one shared raf) ================= */
  var thumbs = [], thumbRaf = 0, thumbT0 = 0;
  function thumbLoop(now) {
    var scr = document.getElementById('screen-templates');
    if (!scr || !scr.classList.contains('active')) { thumbRaf = 0; return; }
    var t = (now - thumbT0) / 1000;
    for (var i = 0; i < thumbs.length; i++) {
      (function (th) {
        if (!th.cv.isConnected || th.visible === false) return;
        try {
        var tpl = th.tpl, g = th.g, W = th.cv.width, H = th.cv.height;
        // loop first 3 scenes (or fewer)
        var n = Math.min(3, tpl.scenes.length), total = 0, j;
        for (j = 0; j < n; j++) total += tpl.scenes[j].dur;
        var tt = t % total, acc = 0, idx = 0, local = 0;
        for (j = 0; j < n; j++) {
          if (tt < acc + tpl.scenes[j].dur) { idx = j; local = tt - acc; break; }
          acc += tpl.scenes[j].dur;
        }
        composeScene(g, th.fx, th.fc, tpl, th.ovl, {}, idx, local, t, W, H);
        } catch (e) {}
      })(thumbs[i]);
    }
    thumbRaf = requestAnimationFrame(thumbLoop);
  }
  window.TXThumb = {
    register: function (cv, tpl) {
      var fc = document.createElement('canvas'); fc.width = cv.width; fc.height = cv.height;
      var rec = { cv: cv, g: cv.getContext('2d'), fx: fc.getContext('2d'), fc: fc, tpl: tpl, ovl: ovlPartsFor(tpl), visible: true };
      thumbs.push(rec);
      try {
        if (!window._txIO) {
          window._txIO = new IntersectionObserver(function (es) {
            es.forEach(function (en) { if (en.target._txRec) en.target._txRec.visible = en.isIntersecting; });
          }, { threshold: 0.12 });
        }
        cv._txRec = rec;
        window._txIO.observe(cv);
      } catch (e) {}
      if (!thumbRaf) { thumbT0 = performance.now(); thumbRaf = requestAnimationFrame(thumbLoop); }
    },
    clear: function () {
      try {
        thumbs.forEach(function (th) { if (window._txIO && th.cv._txRec) window._txIO.unobserve(th.cv); th.cv._txRec = null; });
      } catch (e) {}
      thumbs = [];
    }
  };

  /* ================= BROWSE ================= */
  var txQuery = '', txCat = 'all', txSort = 'trending';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function fmtNum(n) {
    n = Math.round(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return '' + n;
  }
  function cardEl(tpl) {
    var card = document.createElement('div');
    card.className = 'tx-card';
    var cv = document.createElement('canvas');
    cv.className = 'tx-thumb'; cv.width = 180; cv.height = 240;
    cv.onclick = function () { TXDetail.open(tpl.id); };
    var like = document.createElement('button');
    like.className = 'tx-like' + (window.TXStats && TXStats.liked(tpl.id) ? ' on' : '');
    like.innerHTML = '❤';
    like.onclick = function (e) {
      e.stopPropagation();
      if (window.TXStats) like.classList.toggle('on', TXStats.toggleLike(tpl.id));
    };
    var info = document.createElement('div');
    info.className = 'tx-info';
    var uses = window.TXStats ? fmtNum(TXStats.displayUses(tpl.id)) : '';
    info.innerHTML = '<b>' + (tpl.remote ? '🆕 ' : '') + esc(tpl.title) + '</b>' +
      '<small>' + tpl.slots + ' clips · ' + tpl.duration.toFixed(0) + 's' + (uses ? ' · ▶ ' + uses : '') + '</small>';
    card.appendChild(cv); card.appendChild(like); card.appendChild(info);
    TXThumb.register(cv, tpl);
    return card;
  }
  /* featured carousel item: big 9:16 autoplay preview */
  function featEl(tpl) {
    var item = document.createElement('div');
    item.className = 'tx-feat';
    var cv = document.createElement('canvas');
    cv.width = 216; cv.height = 340; cv.className = 'tx-feat-cv';
    var meta = document.createElement('div');
    meta.className = 'tx-feat-meta';
    meta.innerHTML = '<b>' + esc(tpl.title) + '</b><small>by ' + esc(TX.creator(tpl)) + ' · ' + tpl.slots + ' clips</small>';
    var btn = document.createElement('button');
    btn.className = 'btn primary sm'; btn.textContent = 'Use Template';
    btn.onclick = function (e) { e.stopPropagation(); TXSlots.open(tpl.id); };
    item.appendChild(cv); item.appendChild(meta); item.appendChild(btn);
    item.onclick = function () { TXDetail.open(tpl.id); };
    TXThumb.register(cv, tpl);
    return item;
  }

  window.TXBrowse = {
    setCat: function (c) { txCat = c; },
    render: function () {
      TXThumb.clear();
      var scr = document.getElementById('screen-templates');
      var backBtn = scr.querySelector(':scope > .vc-back');
      scr.innerHTML =
        '<h2 style="margin:0 0 2px">' + t('tpl.title') + '</h2>' +
        '<p class="muted" style="margin:0 0 10px">' + t('tpl.sub') + '</p>' +
        '<div class="search-row"><input type="text" id="txSearch" placeholder="' + t('tpl.search') + '"></div>' +
        '<div class="pills" id="txSortPills" style="margin-bottom:6px"></div>' +
        '<div class="pills" id="txCatPills" style="margin-bottom:6px"></div>' +
        '<div id="txSections"></div>' +
        '<div class="card" style="margin-top:14px"><div class="kv"><span>' + t('creator.title') + '<br><span class="muted">' + t('creator.sub') + '</span></span>' +
        '<button class="btn primary sm" id="txGoCreate">' + t('creator.open') + '</button></div></div>' +
        '<p class="fineprint">' + t('tpl.fine') + '</p>';
      var sorts = [['trending', t('sort.trending')], ['new', t('sort.new')], ['popular', t('sort.popular')]];
      var sp = document.getElementById('txSortPills');
      sorts.forEach(function (s) {
        var b = document.createElement('button');
        b.className = 'pill' + (txSort === s[0] ? ' on' : '');
        b.textContent = s[1];
        b.onclick = function () { txSort = s[0]; TXBrowse.render(); };
        sp.appendChild(b);
      });
      var pills = document.getElementById('txCatPills');
      [{ id: 'all', name: 'All', icon: '✨' }].concat(TX.categories()).forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'pill' + (txCat === c.id ? ' on' : '');
        b.textContent = c.icon + ' ' + c.name;
        b.onclick = function () { txCat = c.id; TXBrowse.render(); };
        pills.appendChild(b);
      });
      var si = document.getElementById('txSearch');
      si.value = txQuery;
      si.oninput = function () { txQuery = si.value.trim().toLowerCase(); TXBrowse.sections(); };
      document.getElementById('txGoCreate').onclick = function () { App.show('screen-txcreate'); TXCreate.render(); };
      this.sections();
      if (backBtn) scr.insertBefore(backBtn, scr.firstChild);
      else if (window.App) App.ensureBackBtn('screen-templates');
      // silent check for new templates (free, via GitHub)
      try {
        TXRemote.check(function (err, res) {
          if (!err && res && res.changed) {
            var el = document.getElementById('screen-templates');
            if (el && el.classList.contains('active')) { TXBrowse.sections(); toast('🆕 New templates arrived!'); }
          }
        });
      } catch (e) {}
    },
    sections: function () {
      TXThumb.clear();
      var host = document.getElementById('txSections');
      host.innerHTML = '';
      function match(t) {
        var okC = txCat === 'all' || t.category === txCat;
        var okQ = !txQuery || t.title.toLowerCase().indexOf(txQuery) >= 0;
        return okC && okQ;
      }
      if (txCat !== 'all' || txQuery) {
        var list = TX.sorted(txSort).filter(match);
        var sec = document.createElement('div');
        sec.innerHTML = '<h3 class="sec-title">' + t('sec.count', { n: list.length }) + '</h3>';
        var row = document.createElement('div'); row.className = 'tx-grid';
        list.forEach(function (t) { row.appendChild(cardEl(t)); });
        sec.appendChild(row); host.appendChild(sec);
        if (!list.length) host.innerHTML = '<div class="empty">' + t('sec.empty') + '</div>';
        return;
      }
      var self = this;
      /* featured carousel */
      try {
        var feat = TX.featured();
        if (feat.length) {
          var fsec = document.createElement('div');
          fsec.innerHTML = t('sec.featured');
          var car = document.createElement('div'); car.className = 'tx-featured';
          feat.forEach(function (t) { car.appendChild(featEl(t)); });
          fsec.appendChild(car); host.appendChild(fsec);
        }
      } catch (e) {}
      /* sorted discovery list */
      var sortTitles = { trending: t('sec.trending_week'), new: t('sec.newest'), popular: t('sec.loved') };
      var sorted = TX.sorted(txSort).slice(0, 12);
      var ssec = document.createElement('div');
      ssec.innerHTML = '<h3 class="sec-title" style="margin:14px 0 8px">' + sortTitles[txSort] + '</h3>';
      var srow = document.createElement('div'); srow.className = 'tx-grid';
      sorted.forEach(function (t) { srow.appendChild(cardEl(t)); });
      ssec.appendChild(srow); host.appendChild(ssec);
      var fresh = TX.remote();
      if (fresh.length && txSort === 'new') {
        var nsec = document.createElement('div');
        nsec.innerHTML = t('sec.arrivals');
        var nrow = document.createElement('div'); nrow.className = 'tx-row';
        fresh.forEach(function (t) { nrow.appendChild(cardEl(t)); });
        nsec.appendChild(nrow); host.appendChild(nsec);
      }
      this.section(host, 'trending', '🔥 Trending Now');
      TX.categories().forEach(function (c) {
        if (c.id === 'trending' || c.id === 'my') return;
        self.section(host, c.id, c.icon + ' ' + c.name);
      });
      var mine = TX.custom();
      if (mine.length) {
        var sec2 = document.createElement('div');
        sec2.innerHTML = '<h3 class="sec-title">' + t('sec.my') + '</h3>';
        var row2 = document.createElement('div'); row2.className = 'tx-row';
        mine.forEach(function (t) { row2.appendChild(cardEl(t)); });
        sec2.appendChild(row2); host.appendChild(sec2);
      }
    },
    section: function (host, catId, title) {
      var list = TX.all().filter(function (t) { return t.category === catId; });
      if (!list.length) return;
      var sec = document.createElement('div');
      sec.innerHTML = '<div class="tx-sec-head"><h3 class="sec-title" style="margin:14px 0 8px">' + title + '</h3></div>';
      var row = document.createElement('div'); row.className = 'tx-row';
      (catId === 'trending' ? list.slice(0, 6) : list).forEach(function (t) { row.appendChild(cardEl(t)); });
      sec.appendChild(row); host.appendChild(sec);
    }
  };

  /* ================= DETAIL ================= */
  var dtTpl = null, dtRaf = 0, dtOvl = null, dtStarts = [];
  var dtFlat = null, dtFlatX = null;
  window.TXDetail = {
    open: function (id) {
      var tpl = TX.get(id);
      if (!tpl) { toast('Template not found.', true); return; }
      this.stop();
      dtTpl = tpl; dtOvl = ovlPartsFor(tpl); dtStarts = startsFor(tpl);
      var scr = document.getElementById('screen-txdetail');
      var cat = TX.categories().filter(function (c) { return c.id === tpl.category; })[0];
      var liked = window.TXStats && TXStats.liked(tpl.id);
      var uses = window.TXStats ? fmtNum(TXStats.displayUses(tpl.id)) : '';
      scr.innerHTML =
        '<button class="back-btn" id="txDtBack">' + t('btn.back') + '</button>' +
        '<h2 class="page-title">' + tpl.icon + ' ' + esc(tpl.title) + '</h2>' +
        '<p class="page-sub">' + t('det.by') + ' ' + esc(TX.creator(tpl)) + (uses ? ' · ▶ ' + uses + ' ' + t('det.uses') : '') +
        ' <button class="tx-like inline' + (liked ? ' on' : '') + '" id="txDtLike">❤</button></p>' +
        '<div class="tx-detail-wrap"><canvas id="txDtPreview" width="216" height="384"></canvas>' +
        '<div class="tx-meta">' +
        '<div class="meta-row"><small>' + t('det.duration') + '</small><b>' + tpl.duration.toFixed(1) + 's</b></div>' +
        '<div class="meta-row"><small>' + t('det.slots') + '</small><b>' + tpl.slots + ' clips</b></div>' +
        '<div class="meta-row"><small>' + t('det.music') + '</small><b>' + esc(tpl.music.name) + '</b></div>' +
        '<div class="meta-row"><small>' + t('det.format') + '</small><b>' + tpl.aspect + '</b></div>' +
        '<div class="meta-row"><small>' + t('det.category') + '</small><b>' + (cat ? cat.name : tpl.category) + '</b></div>' +
        '</div></div>' +
        '<div class="card"><h4>' + t('det.required') + '</h4><div class="slot-chips" id="txDtSlots"></div></div>' +
        '<button class="btn primary block big" id="txDtUse">' + t('btn.use') + '</button>';
      var chips = scr.querySelector('#txDtSlots');
      for (var i = 1; i <= tpl.slots; i++) {
        var s = document.createElement('span');
        s.className = 'slot-chip'; s.textContent = t('slot.chip', { n: i });
        chips.appendChild(s);
      }
      scr.querySelector('#txDtBack').onclick = function () { App.show('screen-templates'); TXBrowse.render(); };
      scr.querySelector('#txDtUse').onclick = function () { TXSlots.open(tpl.id); };
      var lk = scr.querySelector('#txDtLike');
      if (lk) lk.onclick = function () { if (window.TXStats) lk.classList.toggle('on', TXStats.toggleLike(tpl.id)); };
      App.show('screen-txdetail');
      dtFlat = document.createElement('canvas');
      var cv = document.getElementById('txDtPreview');
      dtFlat.width = cv.width; dtFlat.height = cv.height;
      dtFlatX = dtFlat.getContext('2d');
      var t0 = performance.now();
      function frame(now) {
        var el = document.getElementById('screen-txdetail');
        if (!el || !el.classList.contains('active') || !dtTpl) return;
        var t = (now - t0) / 1000, tt = t % tpl.duration;
        var idx = sceneAt(tpl, dtStarts, tt), local = tt - dtStarts[idx];
        composeScene(cv.getContext('2d'), dtFlatX, dtFlat, tpl, dtOvl, {}, idx, local, t, cv.width, cv.height);
        dtRaf = requestAnimationFrame(frame);
      }
      dtRaf = requestAnimationFrame(frame);
    },
    stop: function () { cancelAnimationFrame(dtRaf); dtRaf = 0; dtTpl = null; }
  };
})();
