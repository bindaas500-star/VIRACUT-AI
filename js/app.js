/* ViraCut AI — app.js — router, bottom nav, toast/modal/confirm,
   home dashboard, create hub, AI tools hub, photo→video, AI voiceover,
   trending, social kit, profile, editor chrome, export flow. */
(function () {
  'use strict';

  /* ================= toast ================= */
  function toast(msg, isErr) {
    var root = document.getElementById('toastRoot');
    var d = document.createElement('div');
    d.className = 'toast' + (isErr ? ' err' : '');
    d.textContent = msg;
    root.appendChild(d);
    setTimeout(function () { d.style.opacity = '0'; d.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(function () { d.remove(); }, 3100);
  }
  window.toast = toast;

  /* ================= modal / confirm ================= */
  function modal(html, wire) {
    closeModal();
    var bg = document.createElement('div');
    bg.className = 'modal-bg'; bg.id = 'modalBg';
    bg.innerHTML = '<div class="modal">' + html + '</div>';
    bg.addEventListener('click', function (e) { if (e.target === bg) closeModal(); });
    document.getElementById('modalRoot').appendChild(bg);
    if (wire) wire(bg);
    var inp = bg.querySelector('input[type=text],textarea');
    if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 100);
  }
  function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
  function confirmDlg(msg, cb) {
    modal('<h3>Confirm</h3><p style="font-size:14px;margin-bottom:6px">' + esc(msg) + '</p>' +
      '<div class="row"><button class="btn danger" id="cfY" style="flex:1">Yes</button>' +
      '<button class="btn ghost" id="cfN" style="flex:1">Cancel</button></div>',
      function (root) {
        root.querySelector('#cfY').onclick = function () { closeModal(); cb(true); };
        root.querySelector('#cfN').onclick = function () { closeModal(); cb(false); };
      });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  /* Real OAuth sign-in with friendly error handling */
  function oauthSignIn(provider) {
    if (!Auth.configured(provider)) {
      modal('<h3>🔑 Sign-in not connected yet</h3>' +
        '<p style="font-size:13.5px">' + (provider === 'google' ? 'Google' : 'Facebook') + ' sign-in needs a Client/App ID from the app owner.</p>' +
        '<p class="muted" style="margin-top:8px">Owner: add the ID in <b>js/auth-config.js</b> (steps in OAUTH-SETUP.md), then it goes live.</p>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="soOk" style="flex:1">OK</button></div>',
        function (root) { root.querySelector('#soOk').onclick = closeModal; });
      return;
    }
    toast('Opening ' + (provider === 'google' ? 'Google' : 'Facebook') + '…');
    var p = provider === 'google' ? Auth.signInWithGoogle() : Auth.signInWithFacebook();
    p.then(function (u) {
      toast('Welcome, ' + u.name.split(' ')[0] + '!');
      renderProfile(); renderHome();
    }).catch(function (e) {
      if (e && e.cancelled) return; // user closed the popup — stay silent
      toast('Sign-in failed — try again.');
    });
  }

  /* ================= router ================= */
  var NAV_IDS = ['screen-home', 'screen-create', 'screen-projects', 'screen-aitools', 'screen-profile'];
  var App = {
    deepLink: null,
    show: function (id) {
      // stop per-screen loops
      if (id !== 'screen-photovideo' && window.PV && PV.stopPreview) PV.stopPreview();
      if (id !== 'screen-editor' && window.Editor && Editor.playing) Editor.pause();
      if (id !== 'screen-txdetail' && window.TXDetail) TXDetail.stop();
      if (id !== 'screen-txgen' && window.TXGen) TXGen.cancel();
      document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
      var el = document.getElementById(id);
      if (el) el.classList.add('active');
      document.getElementById('screens').scrollTop = 0;
      document.querySelectorAll('#bottomnav button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-nav') === id);
      });
      if (id === 'screen-projects' || id === 'screen-home') Projects.render();
      if (id === 'screen-profile') renderProfile();
      if (id === 'screen-photovideo' && window.PV) PV.startPreview();
    },
    modal: modal, closeModal: closeModal, confirm: confirmDlg,
    refreshPlanBadge: function () {
      var b = document.getElementById('planBadge');
      var pro = Plans.isPro();
      b.textContent = pro ? 'PRO' : 'FREE';
      b.className = 'plan-badge ' + (pro ? 'pro' : 'free');
    }
  };
  window.App = App;

  window.addEventListener('error', function (e) {
    if (e && e.message) toast('Error: ' + e.message.slice(0, 120), true);
  });

  /* ================= HOME ================= */
  var HOME_BTNS = [
    { ic: '🎬', t: 'Create Video', s: 'new project', go: function () { Projects.newProjectDialog(); } },
    { ic: '📸', t: 'Photo Editor', s: 'PixMaster inside', go: function () { if (window.PhotoUI) PhotoUI.importDialog(); } },
    { ic: '✨', t: 'AI Video Generator', s: 'prompt → video', go: function () { App.show('screen-aivideo'); } },
    { ic: '🖼️', t: 'Photo to Video', s: 'slideshow', go: function () { App.show('screen-photovideo'); } },
    { ic: '✍️', t: 'AI Story', s: 'idea → script', go: function () { App.show('screen-aistory'); } },
    { ic: '🎙️', t: 'AI Voiceover', s: 'text → voice', go: function () { App.show('screen-aivoice'); } },
    { ic: '📝', t: 'Auto Captions', s: 'in editor', go: autoCaptionsGo },
    { ic: '✂️', t: 'Video Editor', s: 'timeline', go: openEditorGo },
    { ic: '🎭', t: 'Templates', s: 'one-tap styles', go: function () { App.show('screen-templates'); renderTemplates(); } },
    { ic: '🔥', t: 'Trending Ideas', s: 'fresh daily', go: function () { App.show('screen-trending'); } },
    { ic: '📁', t: 'My Projects', s: 'on device', go: function () { App.show('screen-projects'); } }
  ];
  function openEditorGo() {
    if (Store.current) Editor.open(Store.current.id);
    else Projects.newProjectDialog();
  }
  function autoCaptionsGo() {
    if (Store.current) { App.deepLink = { panel: 'captions' }; Editor.open(Store.current.id); }
    else { toast('Open a project first — captions live in the editor.'); App.show('screen-projects'); }
  }
  function renderHome() {
    var g = document.getElementById('homeGrid');
    g.innerHTML = '';
    HOME_BTNS.forEach(function (b) {
      var d = document.createElement('button');
      d.className = 'home-btn';
      d.innerHTML = '<span class="hb-ic">' + b.ic + '</span><span>' + b.t + '</span><small>' + b.s + '</small>';
      d.onclick = b.go;
      g.appendChild(d);
    });
    var u = Auth.user();
    document.getElementById('homeGreet').textContent = u ? 'Hi ' + u.name.split(' ')[0] + ' — create something viral ✦' : 'Create something viral ✦';
  }

  /* ================= CREATE HUB ================= */
  function renderCreate() {
    var box = document.getElementById('createOptions');
    var opts = [
      { ic: '🎬', t: 'New video project', s: 'Import clips & edit on the timeline', go: function () { Projects.newProjectDialog(); } },
      { ic: '📸', t: 'Photo editor', s: 'Adjust, filters, crop & export', go: function () { if (window.PhotoUI) PhotoUI.importDialog(); } },
      { ic: '🖼️', t: 'Photo to video', s: 'Slideshow with Ken Burns motion', go: function () { App.show('screen-photovideo'); } },
      { ic: '✨', t: 'AI video generator', s: 'Describe it — AI renders it (needs API)', go: function () { App.show('screen-aivideo'); } },
      { ic: '🎭', t: 'Templates', s: 'One-tap original styles — add your clips', go: function () { App.show('screen-templates'); renderTemplates(); } },
      { ic: '✍️', t: 'AI story', s: 'Idea → full story pack (offline)', go: function () { App.show('screen-aistory'); } }
    ];
    box.innerHTML = '';
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'sheet-opt';
      b.innerHTML = '<span class="so-ic">' + o.ic + '</span><span>' + o.t + '<br><small class="muted">' + o.s + '</small></span>';
      b.onclick = o.go;
      box.appendChild(b);
    });
  }

  /* ================= TEMPLATES (TemplateX engine) ================= */
  function renderTemplates() {
    try { TXBrowse.render(); } catch (e) { toast('Templates failed: ' + e.message, true); }
  }

  /* ================= AI TOOLS HUB ================= */
  function renderAITools() {
    var box = document.getElementById('aiToolsList');
    var tools = [
      { ic: '✨', t: 'AI Video Generator', s: 'Prompt → video', tag: 'needs API', go: function () { App.show('screen-aivideo'); } },
      { ic: '✍️', t: 'AI Story', s: 'Idea → title, story, scenes, script', tag: 'offline ✓', go: function () { App.show('screen-aistory'); } },
      { ic: '🎙️', t: 'AI Voiceover', s: 'Text → device voice preview', tag: 'device', go: function () { App.show('screen-aivoice'); } },
      { ic: '📝', t: 'Auto Captions', s: 'Script → timed captions in editor', tag: 'offline ✓', go: autoCaptionsGo },
      { ic: '🔥', t: 'Trending Ideas', s: 'Fresh ideas per category', tag: 'offline ✓', go: function () { App.show('screen-trending'); } }
    ];
    box.innerHTML = '';
    tools.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'sheet-opt';
      b.innerHTML = '<span class="so-ic">' + t.ic + '</span><span style="flex:1">' + t.t + '<br><small class="muted">' + t.s + '</small></span><span class="tag">' + t.tag + '</span>';
      b.onclick = t.go;
      box.appendChild(b);
    });
  }

  /* ================= PHOTO TO VIDEO ================= */
  var PV = {
    photos: [], dur: 3, kb: true, aspect: '9:16', raf: 0, imgs: [],
    stopPreview: function () { cancelAnimationFrame(this.raf); this.raf = 0; },
    startPreview: function () {
      var self = this;
      this.stopPreview();
      this.imgs = this.photos.map(function (p) { var im = new Image(); im.src = p.url; return im; });
      var cv = document.getElementById('pvCanvas');
      var dims = this.aspect === '16:9' ? [480, 270] : this.aspect === '1:1' ? [420, 420] : [360, 640];
      cv.width = dims[0]; cv.height = dims[1];
      cv.style.aspectRatio = dims[0] + ' / ' + dims[1];
      var g = cv.getContext('2d');
      var t0 = performance.now();
      function loop(now) {
        self.raf = requestAnimationFrame(loop);
        g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
        if (!self.imgs.length) {
          g.fillStyle = '#9AA0B4'; g.font = '15px sans-serif'; g.textAlign = 'center';
          g.fillText('Add photos to preview', cv.width / 2, cv.height / 2);
          return;
        }
        var total = self.imgs.length * self.dur;
        var t = ((now - t0) / 1000) % total;
        var idx = Math.min(self.imgs.length - 1, Math.floor(t / self.dur));
        var im = self.imgs[idx];
        if (!im.complete || !im.naturalWidth) return;
        var pr = (t - idx * self.dur) / self.dur;
        var W = cv.width, H = cv.height;
        var s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
        if (self.kb) { s *= (1 + 0.15 * pr); }
        var w = im.naturalWidth * s, h = im.naturalHeight * s;
        var ox = self.kb ? (pr - 0.5) * 0.1 * W : 0;
        g.drawImage(im, (W - w) / 2 + ox, (H - h) / 2, w, h);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '13px sans-serif'; g.textAlign = 'left';
        g.fillText((idx + 1) + ' / ' + self.imgs.length, 10, 20);
      }
      loop(t0);
    },
    renderList: function () {
      var self = this, box = document.getElementById('pvList');
      box.innerHTML = '';
      this.photos.forEach(function (p, i) {
        var d = document.createElement('div');
        d.className = 'pv-item';
        d.innerHTML = '<img src="' + p.url + '"><button>✕</button>';
        d.querySelector('button').onclick = function () { self.photos.splice(i, 1); self.renderList(); self.startPreview(); };
        box.appendChild(d);
      });
      if (!this.photos.length) box.innerHTML = '<div class="empty" style="min-width:100%">No photos yet.</div>';
    },
    sendToEditor: function () {
      if (!this.photos.length) { toast('Add photos first.', true); return; }
      var p = Store.newProject('Photo Story', this.aspect);
      var self = this;
      this.photos.forEach(function (ph, i) {
        var id = Store.uid('clip');
        Store.mediaCache.set(id, ph.url);
        p.clips.push({ id: id, type: 'photo', name: ph.name || ('Photo ' + (i + 1)), url: ph.url, duration: self.dur, in: 0, out: self.dur, speed: 1, rotation: 0, fit: 'cover', transitionIn: i === 0 ? 'none' : 'crossfade', kb: self.kb });
      });
      Store.snapshot(); Store.persist();
      toast(p.clips.length + ' photos → editor.');
      Editor.open(p.id);
    }
  };
  window.PV = PV;
  function initPhotoVideo() {
    document.getElementById('pvPick').onclick = function () { document.getElementById('pvInput').click(); };
    document.getElementById('pvInput').onchange = function (e) {
      Array.prototype.forEach.call(e.target.files, function (f) {
        PV.photos.push({ url: URL.createObjectURL(f), name: f.name });
      });
      e.target.value = '';
      PV.renderList(); PV.startPreview();
    };
    document.getElementById('pvDurMinus').onclick = function () { PV.dur = Math.max(1, PV.dur - 1); document.getElementById('pvDurVal').textContent = PV.dur; };
    document.getElementById('pvDurPlus').onclick = function () { PV.dur = Math.min(10, PV.dur + 1); document.getElementById('pvDurVal').textContent = PV.dur; };
    document.getElementById('pvKenburns').onchange = function (e) { PV.kb = e.target.checked; };
    var ab = document.getElementById('pvAspect');
    ['9:16', '16:9', '1:1'].forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'pill' + (PV.aspect === a ? ' on' : ''); b.textContent = a;
      b.onclick = function () { PV.aspect = a; ab.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); PV.startPreview(); };
      ab.appendChild(b);
    });
    document.getElementById('pvSend').onclick = function () { PV.sendToEditor(); };
    PV.renderList();
  }

  /* ================= AI STORY screen ================= */
  function initAIStory() {
    var lg = document.getElementById('asLang');
    var lang = 'en';
    [['en', 'English'], ['ur', 'اردو']].forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'pill' + (lang === l[0] ? ' on' : ''); b.textContent = l[1];
      b.onclick = function () { lang = l[0]; lg.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); };
      lg.appendChild(b);
    });
    document.getElementById('asGenerate').onclick = function () {
      var idea = document.getElementById('asIdea').value.trim();
      if (!idea) { toast('Type your idea first.', true); return; }
      var story;
      try { story = AIStory.generate(idea, lang); }
      catch (e) { toast('Story failed: ' + e.message, true); return; }
      renderStoryResult(story);
    };
  }
  function renderStoryResult(story) {
    var box = document.getElementById('asResult');
    function esc2(s) { return esc(s); }
    var html = '<div class="story-block"><h4>📌 TITLE</h4><p><b>' + esc2(story.title) + '</b></p></div>' +
      '<div class="story-block"><h4>🪝 HOOK</h4><p>' + esc2(story.hook) + '</p></div>' +
      '<div class="story-block"><h4>📖 STORY</h4><p>' + esc2(story.story) + '</p></div>' +
      '<div class="story-block"><h4>🎬 SCENES</h4>' +
      story.scenes.map(function (s) {
        return '<div class="scene"><b>Scene ' + s.n + '</b><p>🎥 ' + esc2(s.visual) + '</p><p>🎙 ' + esc2(s.voice) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="story-block"><h4>🎙 VOICEOVER SCRIPT</h4><p>' + esc2(story.script) + '</p></div>' +
      '<div class="story-block"><h4>🔚 ENDING</h4><p>' + esc2(story.ending) + '</p></div>' +
      '<button class="btn primary block" id="asFull">🎬 Generate Full Video (project)</button>' +
      '<p class="muted center" style="margin-top:8px">Creates an editable project: scene cards + timed captions. Swap cards for AI visuals later.</p>';
    box.innerHTML = html;
    box.querySelector('#asFull').onclick = function () {
      try {
        var p = AIStory.buildProject(story, '9:16');
        toast('Project created: ' + p.name);
        Editor.open(p.id);
      } catch (e) { toast('Could not build project: ' + e.message, true); }
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ================= AI VOICEOVER screen ================= */
  var VO_LANGS = [['ur', 'Urdu', 'ur'], ['en', 'English', 'en-US'], ['ar', 'Arabic', 'ar-SA']];
  function initAIVoice() {
    var box = document.getElementById('voLang'), lang = 'ur';
    VO_LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'pill' + (lang === l[0] ? ' on' : ''); b.textContent = l[1];
      b.onclick = function () { lang = l[0]; box.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); };
      box.appendChild(b);
    });
    function pickVoice(bcp) {
      try {
        var vs = speechSynthesis.getVoices();
        for (var i = 0; i < vs.length; i++) if (vs[i].lang && vs[i].lang.toLowerCase().indexOf(bcp.split('-')[0]) === 0) return vs[i];
      } catch (e) {}
      return null;
    }
    if (window.speechSynthesis) speechSynthesis.getVoices();
    document.getElementById('voPreview').onclick = function () {
      var t = document.getElementById('voText').value.trim();
      if (!t) { toast('Type a script first.', true); return; }
      if (!window.speechSynthesis) { toast('Speech not supported on this device.', true); return; }
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(t);
      var bcp = VO_LANGS.filter(function (l) { return l[0] === lang; })[0][2];
      u.lang = bcp;
      var v = pickVoice(bcp); if (v) u.voice = v;
      speechSynthesis.speak(u);
    };
    document.getElementById('voStop').onclick = function () { try { speechSynthesis.cancel(); } catch (e) {} };
    document.getElementById('voSave').onclick = function () {
      var t = document.getElementById('voText').value.trim();
      if (!t) { toast('Type a script first.', true); return; }
      var p = Store.current || Store.newProject('Voiceover Project', '9:16');
      p.script = t;
      Store.snapshot(); Store.persist();
      document.getElementById('voSaved').innerHTML = '<div class="note-card">💾 Saved to project <b>' + esc(p.name) + '</b> — use “Auto from script” in Editor → Captions.</div>';
      toast('Script saved to project.');
    };
  }

  /* ================= TRENDING ================= */
  function initTrending() {
    var chips = document.getElementById('trendChips');
    Trending.CATEGORIES.forEach(function (c, i) {
      var b = document.createElement('button');
      b.className = 'chip' + (i === 0 ? ' on' : ''); b.textContent = c.icon + ' ' + c.name;
      b.onclick = function () {
        chips.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        renderTrendIdeas(c.id);
      };
      chips.appendChild(b);
    });
    renderTrendIdeas(Trending.CATEGORIES[0].id);
  }
  function renderTrendIdeas(catId) {
    var box = document.getElementById('trendList');
    box.innerHTML = '';
    Trending.ideas(catId).forEach(function (idea) {
      var d = document.createElement('div');
      d.className = 'list-item';
      d.innerHTML = '<b>' + esc(idea.title) + '</b><p class="muted" style="margin-top:4px">' + esc(idea.hook) + '</p>' +
        '<div class="row"><button class="btn ghost sm">✍️ Use in AI Story</button></div>';
      d.querySelector('button').onclick = function () {
        document.getElementById('asIdea').value = idea.idea;
        App.show('screen-aistory');
        toast('Idea loaded — hit Generate Story.');
      };
      box.appendChild(d);
    });
  }

  /* ================= SOCIAL KIT ================= */
  function renderSocial(project) {
    var k = SocialKit.generate(project);
    document.getElementById('socialSub').textContent = 'For: ' + k.title;
    var box = document.getElementById('socialKit');
    box.innerHTML = '';
    var blocks = [
      ['📺 YouTube Shorts title', k.ytTitle], ['🎵 TikTok caption', k.tiktok],
      ['📸 Instagram Reels caption', k.ig], ['📝 Description', k.description],
      ['#️⃣ Hashtags', k.hashtags.join(' ')],
      ['🖼 Thumbnail text options', k.thumbs.join('\n')]
    ];
    blocks.forEach(function (b) {
      var d = document.createElement('div');
      d.className = 'soc-block';
      d.innerHTML = '<h4>' + b[0] + '</h4><p>' + esc(b[1]) + '</p><button class="btn ghost sm">📋 Copy</button>';
      d.querySelector('button').onclick = function () { copyText(b[1]); };
      box.appendChild(d);
    });
  }
  function copyText(t) {
    function done() { toast('Copied to clipboard.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — long-press to copy.', true); }
      ta.remove();
    }
  }

  /* ================= PROFILE ================= */
  function renderProfile() {
    var u = Auth.user();
    var pc = document.getElementById('profileCard');
    if (u) {
      var pic = u.picture ? '<img src="' + esc(u.picture) + '" alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover">' : '<span style="font-size:34px">👤</span>';
      var prov = u.provider === 'google' ? '<span class="tag">Google</span>' : u.provider === 'facebook' ? '<span class="tag">Facebook</span>' : '<span class="tag">demo</span>';
      pc.innerHTML = '<div class="kv"><span style="display:flex;gap:12px;align-items:center">' + pic +
        '<span><b>' + esc(u.name) + '</b><br><span class="muted">' + esc(u.email || '') + '</span></span></span>' + prov + '</div>';
    } else {
      pc.innerHTML =
        '<p style="margin-bottom:12px">Sign in to sync your creator profile.</p>' +
        '<div class="stack">' +
        '<button class="btn block" id="pfGoogle" style="background:#fff;color:#1a1a1a;font-weight:700">🔵 Continue with Google</button>' +
        '<button class="btn block" id="pfFb" style="background:#1877F2;color:#fff;font-weight:700">📘 Continue with Facebook</button>' +
        '</div>';
      var g = pc.querySelector('#pfGoogle');
      var f = pc.querySelector('#pfFb');
      if (g) g.onclick = function () { oauthSignIn('google'); };
      if (f) f.onclick = function () { oauthSignIn('facebook'); };
    }
    var pro = Plans.isPro();
    document.getElementById('planCard').innerHTML =
      '<div class="kv"><span><b>' + (pro ? '⭐ Pro' : 'Free plan') + '</b><br><span class="muted">' + esc(Plans.describe()) + '</span></span></div>' +
      '<div class="kv"><span>Export quality</span><b>' + (pro ? '1080p' : '720p') + (pro ? '' : ' · watermark') + '</b></div>' +
      '<div class="kv"><span>AI generations today</span><b>' + (pro ? 'unlimited' : Plans.aiUsedToday() + ' / ' + Plans.FREE_DAILY_AI) + '</b></div>';
    var go = document.getElementById('btnGoPro');
    go.textContent = pro ? '⬇ Downgrade to Free (Demo)' : '⭐ Go Pro (Demo)';
    go.onclick = function () {
      if (Plans.isPro()) {
        Plans.setPlan('free'); toast('Back on Free (demo).'); renderProfile();
      } else {
        modal('<h3>⭐ ViraCut Pro (Demo)</h3>' +
          '<p style="font-size:13.5px">Unlimited AI generations · 1080p export · no watermark · premium tools.</p>' +
          '<p class="muted" style="margin-top:8px">This is a demo — no payment is processed.</p>' +
          '<div class="row" style="margin-top:12px"><button class="btn primary" id="gpY" style="flex:1">Activate Pro (Demo)</button>' +
          '<button class="btn ghost" id="gpN">Cancel</button></div>',
          function (root) {
            root.querySelector('#gpN').onclick = closeModal;
            root.querySelector('#gpY').onclick = function () { Plans.setPlan('pro'); closeModal(); renderProfile(); toast('Pro activated (demo).'); };
          });
      }
    };
    document.getElementById('btnSignOut').onclick = function () {
      Auth.signOut(); toast('Signed out.'); renderProfile(); renderHome();
    };
    var bs = document.getElementById('btnSettings');
    if (bs) bs.onclick = function () { SettingsScreen.render(); };
  }

  /* ================= EDITOR chrome ================= */
  function initEditorChrome() {
    document.getElementById('edBack').onclick = function () { Editor.teardown(); App.show('screen-projects'); };
    document.getElementById('edName').onclick = function () {
      var p = Editor.project; if (!p) return;
      modal('<h3>Rename</h3><input type="text" id="enV" value="' + esc(p.name) + '">' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="enOk" style="flex:1">Save</button><button class="btn ghost" id="enNo">Cancel</button></div>',
        function (root) {
          root.querySelector('#enNo').onclick = closeModal;
          root.querySelector('#enOk').onclick = function () {
            var v = root.querySelector('#enV').value.trim();
            if (v) { p.name = v; Store.snapshot(); Store.persist(); document.getElementById('edName').textContent = v; }
            closeModal();
          };
        });
    };
    document.getElementById('edUndo').onclick = function () { Editor.doUndo(); };
    document.getElementById('edRedo').onclick = function () { Editor.doRedo(); };
    document.getElementById('edPlay').onclick = function () { Editor.toggle(); };
    var seek = document.getElementById('edSeek');
    seek.addEventListener('pointerdown', function () { Editor._seeking = true; });
    seek.addEventListener('pointerup', function () { Editor._seeking = false; });
    seek.addEventListener('input', function () {
      var total = Store.timing().total;
      Editor.seek(total * (seek.value / 1000));
    });
    document.getElementById('edFileInput').onchange = function (e) {
      Editor.stageFiles(e.target.files); e.target.value = '';
    };
    document.getElementById('edFull').onclick = function () {
      var wrap = document.getElementById('edPreviewWrap');
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (wrap.requestFullscreen) wrap.requestFullscreen();
        else toast('Fullscreen not supported on this device.', true);
      } catch (e) { toast('Fullscreen not supported on this device.', true); }
    };
    document.getElementById('edZoomIn').onclick = function () { Editor.setZoom(1); };
    document.getElementById('edZoomOut').onclick = function () { Editor.setZoom(-1); };
    document.getElementById('edMusicInput').onchange = function (e) {
      var f = e.target.files[0];
      if (f && Editor.project) AudioLab.Music.set(f, Editor.project);
      e.target.value = '';
    };
    document.getElementById('edExport').onclick = startExport;
    document.addEventListener('visibilitychange', function () { if (document.hidden && Editor.playing) Editor.pause(); });
  }

  /* ---------- export screen ---------- */
  var EX_RES = { '480p': 480, '720p': 720, '1080p': 1080 };
  var EX_QUALITY = { Low: 2500000, Medium: 6000000, High: 12000000 };
  function exportSizeFor(pick, aspect) {
    var s = EX_RES[pick] || 720;
    if (aspect === '16:9') return { w: Math.round(s * 16 / 9), h: s };
    if (aspect === '1:1') return { w: s, h: s };
    return { w: Math.round(s * 9 / 16), h: s }; // 9:16
  }
  function fmtMB(bytes) {
    var mb = bytes / 1048576;
    return mb >= 100 ? Math.round(mb) + ' MB' : mb.toFixed(1) + ' MB';
  }
  function startExport() {
    if (Exporter.exporting) return;
    var p = Editor.project;
    if (!p || !Store.timing().total) { toast('Add clips before exporting.', true); return; }
    var total = Store.timing().total;
    var sel = { res: '720p', fps: 30, q: 'Medium' };
    function estText() {
      var size = exportSizeFor(sel.res, p.aspect);
      var bytes = window.EditorLogic
        ? EditorLogic.estBytes(total, EX_QUALITY[sel.q], 128000)
        : total * (EX_QUALITY[sel.q] + 128000) / 8;
      return size.w + '×' + size.h + ' · ' + sel.fps + 'fps · ~' + fmtMB(bytes) + (Plans.watermark() ? ' · watermark' : ' · no watermark');
    }
    function pills(list, cur, cb) {
      return list.map(function (x) {
        return '<button class="pill' + (x === cur ? ' on' : '') + '" data-v="' + x + '">' + x + '</button>';
      }).join('');
    }
    modal('<h3>📤 Export video</h3>' +
      '<label class="lbl">Resolution</label><div class="pills" id="exRes">' + pills(['480p', '720p', '1080p'], sel.res) + '</div>' +
      '<label class="lbl" style="margin-top:10px">Frame rate</label><div class="pills" id="exFps">' + pills([24, 30, 60], sel.fps) + '</div>' +
      '<label class="lbl" style="margin-top:10px">Quality</label><div class="pills" id="exQ">' + pills(['Low', 'Medium', 'High'], sel.q) + '</div>' +
      '<p class="muted" id="exEst" style="margin-top:10px">' + esc(estText()) + '</p>' +
      '<div class="stack" style="margin-top:8px">' +
      '<button class="btn primary block" id="exGo">▶ Start export</button>' +
      '<button class="btn ghost block" id="exNo">Cancel</button></div>',
      function (root) {
        function wire(id, key, parse) {
          root.querySelectorAll('#' + id + ' .pill').forEach(function (b) {
            b.onclick = function () {
              sel[key] = parse ? parse(b.getAttribute('data-v')) : b.getAttribute('data-v');
              root.querySelectorAll('#' + id + ' .pill').forEach(function (x) { x.classList.remove('on'); });
              b.classList.add('on');
              root.querySelector('#exEst').textContent = estText();
            };
          });
        }
        wire('exRes', 'res'); wire('exFps', 'fps', function (v) { return +v; }); wire('exQ', 'q');
        root.querySelector('#exNo').onclick = closeModal;
        root.querySelector('#exGo').onclick = function () { runExportNow(sel); };
      });
  }

  function runExportNow(sel) {
    var p = Editor.project;
    var size = exportSizeFor(sel.res, p.aspect);
    var opts = { size: size, fps: sel.fps, videoBps: EX_QUALITY[sel.q] };
    modal('<h3>⏳ Exporting…</h3>' +
      '<div class="prog"><div class="prog-fill" id="exFill" style="width:0%"></div></div>' +
      '<p class="muted center" id="exPct">0%</p>' +
      '<button class="btn danger block" id="exCancel">Cancel export</button>',
      function (root) {
        var cancelled = false;
        root.querySelector('#exCancel').onclick = function () {
          cancelled = true;
          Exporter.cancelExport();
          root.querySelector('#exPct').textContent = 'Cancelling…';
        };
        Exporter.export(opts, function (r) {
          var pct = Math.round(r * 100);
          var f = root.querySelector('#exFill'); if (f) f.style.width = pct + '%';
          var t = root.querySelector('#exPct'); if (t && !cancelled) t.textContent = pct + '%';
        }).then(function (out) {
          showExportResult(out, p);
        }).catch(function (err) {
          closeModal();
          if (!/cancelled/i.test(err && err.message || '')) toast('Export failed: ' + (err.message || err), true);
          else toast('Export cancelled.');
        });
      });
  }

  function showExportResult(out, p) {
    var fname = (p.name || 'viracut').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'viracut';
    modal('<h3>✅ Export ready</h3>' +
      '<video src="' + out.url + '" controls style="width:100%;border-radius:12px"></video>' +
      '<p class="muted center">' + out.size.w + '×' + out.size.h + ' · ' + fmtMB(out.blob.size) + '</p>' +
      '<div class="stack" style="margin-top:12px">' +
      '<button class="btn primary block" id="exDl">⬇ Save to gallery</button>' +
      '<button class="btn ghost block" id="exShare">📤 Share</button>' +
      '<button class="btn ghost block" id="exSoc">📣 Open Social Kit</button>' +
      '<button class="btn ghost block" id="exClose">Close</button></div>',
      function (root) {
        root.querySelector('#exDl').onclick = function () { Exporter.download(out.url, p.name); toast('Download started — check your gallery/downloads.'); };
        root.querySelector('#exShare').onclick = function () {
          var file = null;
          try { file = new File([out.blob], fname + '.webm', { type: out.blob.type || 'video/webm' }); } catch (e) {}
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: p.name }).catch(function () {});
          } else {
            toast('Sharing is not supported on this device — use Download instead.', true);
          }
        };
        root.querySelector('#exSoc').onclick = function () { closeModal(); renderSocial(p); App.show('screen-social'); };
        root.querySelector('#exClose').onclick = closeModal;
      });
    toast('Export finished.');
  }

  /* ================= init ================= */
  function init() {
    try { if (window.I18N) I18N.applyStatic(); } catch (e) {}
    // native feel: block long-press context menu except in text fields
    document.addEventListener('contextmenu', function (e) {
      if (!e.target.closest('input,textarea,[contenteditable]')) e.preventDefault();
    });
    // block text selection via long-press drag on UI
    document.addEventListener('selectstart', function (e) {
      if (!e.target.closest('input,textarea,[contenteditable]')) e.preventDefault();
    });
    document.querySelectorAll('#bottomnav button').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-nav');
        App.show(id);
        if (id === 'screen-templates') renderTemplates();
      };
    });
    document.getElementById('btnNewProject2').onclick = function () { Projects.newProjectDialog(); };
    document.getElementById('socialBack').onclick = function () {
      if (Store.current) Editor.open(Store.current.id); else App.show('screen-projects');
    };
    renderHome(); renderCreate(); renderAITools();
    initPhotoVideo(); initAIStory(); initAIVoice(); initTrending();
    AIVideo.init();
    initEditorChrome();
    App.refreshPlanBadge();
    Projects.render();
    // resume last project context (not auto-open; just remember)
    var last = Store.lastOpenId();
    if (last) {
      var all = Store.getProjects(), found = all.filter(function (p) { return p.id === last; })[0];
      if (found) Store.current = found;
    }
    App.show('screen-home');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
