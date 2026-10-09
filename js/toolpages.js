/* ViraCut AI — toolpages.js — CapCut-style tool category pages.
   A page stack (push/pop) of tool pages: tapping a category on Home pushes
   a full page listing that category's tools (icon + name + description).
   "All Tools" shows every tool grouped by section. Every page gets a ← back
   button that pops the stack. Integrates with App.show()/App.back(). */
(function () {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  /* ---------- actions (reuse real app functionality, nothing faked) ---------- */
  function openEditor() {
    if (window.Store && Store.current) Editor.open(Store.current.id);
    else if (window.Projects) Projects.newProjectDialog();
  }
  function needProject(panel, hint) {
    return function () {
      if (window.Store && Store.current) {
        if (panel && window.App) App.deepLink = { panel: panel };
        Editor.open(Store.current.id);
      } else {
        toast(hint || 'Open a project first — this tool lives in the editor.');
        App.show('screen-projects');
      }
    };
  }
  function openTemplates() {
    App.show('screen-templates');
    try { if (window.TXBrowse) TXBrowse.render(); } catch (e) { toast('Templates failed to load.', true); }
  }

  /* ---------- categories ---------- */
  var CATS = [
    { id: 'video', icon: '🎬', name: 'Video Tools', desc: 'Edit, create and enhance videos' },
    { id: 'photo', icon: '📸', name: 'Photo Tools', desc: 'Edit photos like a pro' },
    { id: 'audio', icon: '🎵', name: 'Audio Tools', desc: 'Voice, music and sound' },
    { id: 'ai', icon: '🤖', name: 'AI Tools', desc: 'Create with artificial intelligence' },
    { id: 'all', icon: '🧰', name: 'All Tools', desc: 'Every tool, organized by type' }
  ];
  function catById(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return CATS[0];
  }

  /* ---------- tools (every entry maps to real functionality) ---------- */
  var TOOLS = {
    video: [
      { icon: '✂️', name: 'Video Editor', desc: 'Timeline, effects, captions and export', go: openEditor },
      { icon: '🎬', name: 'Create Video', desc: 'Import clips and start a new project', go: function () { Projects.newProjectDialog(); } },
      { icon: '🖼️', name: 'Photo to Video', desc: 'Slideshow with Ken Burns motion', go: function () { App.show('screen-photovideo'); } },
      { icon: '🧍', name: 'Body Effects', desc: 'Background blur, glow and spotlight', go: needProject('fx') },
      { icon: '💬', name: 'Auto Captions', desc: 'Speech to subtitles, Urdu + English', go: needProject('captions') },
      { icon: '🎭', name: 'Templates', desc: 'One-tap video styles', go: openTemplates }
    ],
    photo: [
      { icon: '📸', name: 'Photo Editor', desc: 'Adjust, filters, crop and export', go: function () { if (window.PhotoUI) PhotoUI.importDialog(); } },
      { icon: '🖼️', name: 'Photo to Video', desc: 'Slideshow with Ken Burns motion', go: function () { App.show('screen-photovideo'); } }
    ],
    audio: [
      { icon: '🎙️', name: 'AI Voiceover', desc: 'Text to speech, Urdu + English', go: function () { App.show('screen-aivoice'); } },
      { icon: '🎵', name: 'Music', desc: 'Add background music in the editor', go: needProject('audio') },
      { icon: '🔊', name: 'Extract Audio', desc: 'Pull audio out of a video clip', go: needProject(null, 'Open a project, tap a video clip, then choose Extract audio.') }
    ],
    ai: [
      { icon: '✨', name: 'AI Video Generator', desc: 'Describe it — AI renders the video', tag: 'needs API', go: function () { App.show('screen-aivideo'); } },
      { icon: '✍️', name: 'AI Story', desc: 'Idea to full story, scenes and script', tag: 'offline', go: function () { App.show('screen-aistory'); } },
      { icon: '🧍', name: 'Body Effects', desc: 'AI person segmentation, runs on-device', tag: 'on-device', go: needProject('fx') },
      { icon: '🎙️', name: 'Auto Transcribe', desc: 'Speech to captions while video plays', tag: 'free', go: needProject('captions') },
      { icon: '🔥', name: 'Trending Ideas', desc: 'Fresh video ideas, updated daily', tag: 'offline', go: function () { App.show('screen-trending'); } }
    ]
  };
  var QUICK = [
    { icon: '📁', name: 'My Projects', desc: 'Open your saved work', go: function () { App.show('screen-projects'); } },
    { icon: '⚙️', name: 'Settings', desc: 'Language, profile and app options', go: function () { if (window.SettingsScreen) SettingsScreen.render(); } }
  ];
  /* All Tools page sections; section -> category id for the "View all" drill-down */
  var ALL_SECTIONS = [
    { title: 'Video editing', catId: 'video', tools: TOOLS.video },
    { title: 'Photo editing', catId: 'photo', tools: TOOLS.photo },
    { title: 'Audio', catId: 'audio', tools: TOOLS.audio },
    { title: 'AI tools', catId: 'ai', tools: TOOLS.ai },
    { title: 'Quick actions', catId: null, tools: QUICK }
  ];

  /* ---------- rendering ---------- */
  function renderToolList(box, tools) {
    tools.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tp-item';
      b.innerHTML = '<span class="tp-ic">' + t.icon + '</span>' +
        '<span class="tp-tx"><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small></span>' +
        (t.tag ? '<span class="tag">' + esc(t.tag) + '</span>' : '') +
        '<span class="tp-chev">›</span>';
      b.onclick = t.go;
      box.appendChild(b);
    });
  }
  function renderAll(scr) {
    ALL_SECTIONS.forEach(function (sec) {
      var h = document.createElement('div');
      h.className = 'tp-sec';
      h.innerHTML = '<span>' + esc(sec.title.toUpperCase()) + '</span>' +
        (sec.catId ? '<button class="tp-more">View all ›</button>' : '');
      if (sec.catId) {
        (function (id) {
          h.querySelector('.tp-more').onclick = function () { ToolPages.open(id); };
        })(sec.catId);
      }
      scr.appendChild(h);
      var list = document.createElement('div');
      list.className = 'tp-list';
      renderToolList(list, sec.tools);
      scr.appendChild(list);
    });
  }
  function render() {
    var top = ToolPages._stack[ToolPages._stack.length - 1];
    if (!top) return;
    var scr = document.getElementById('screen-toolpage');
    if (!scr) return;
    scr.innerHTML = '';
    // Back button: direct child with .vc-back so App.ensureBackBtn() skips
    // adding its own duplicate; ours pops the ToolPages stack first.
    var back = document.createElement('button');
    back.className = 'vc-back icon-btn';
    back.id = 'tpBack';
    back.innerHTML = '←';
    back.setAttribute('aria-label', 'Back');
    back.onclick = function () { ToolPages.back(); };
    scr.appendChild(back);
    var cat = catById(top.catId);
    var head = document.createElement('div');
    head.className = 'tp-head';
    head.innerHTML = '<h2 class="page-title">' + cat.icon + ' ' + esc(cat.name) + '</h2>' +
      '<p class="page-sub">' + esc(cat.desc) + '</p>';
    scr.appendChild(head);
    if (top.catId === 'all') renderAll(scr);
    else {
      var list = document.createElement('div');
      list.className = 'tp-list';
      renderToolList(list, TOOLS[top.catId] || []);
      scr.appendChild(list);
    }
  }

  /* ---------- page stack ---------- */
  var ToolPages = {
    _stack: [],
    CATS: CATS,
    TOOLS: TOOLS,
    open: function (catId) {
      var cur = document.querySelector('.screen.active');
      // fresh stack when arriving from another screen; keep drilling within tool pages
      if (!cur || cur.id !== 'screen-toolpage') this._stack = [];
      this._stack.push({ catId: catId });
      if (this._stack.length > 10) this._stack.shift();
      render();
      App.show('screen-toolpage');
    },
    back: function () {
      this._stack.pop();
      if (!this._stack.length) { App.back(); return; }
      render();
      var sc = document.getElementById('screens');
      if (sc) sc.scrollTop = 0;
    },
    render: render
  };
  window.ToolPages = ToolPages;

  /* ---------- Home: category strip (CapCut-style entry points) ---------- */
  function injectHomeCats() {
    var home = document.getElementById('screen-home');
    if (!home || document.getElementById('toolCats')) return;
    var greet = home.querySelector('.greet');
    if (!greet) return;
    var wrap = document.createElement('div');
    wrap.id = 'toolCats';
    var h = document.createElement('h3');
    h.className = 'sec-title';
    h.textContent = 'Browse tools';
    wrap.appendChild(h);
    var row = document.createElement('div');
    row.className = 'cat-row';
    CATS.forEach(function (c) {
      (function (cat) {
        var b = document.createElement('button');
        b.className = 'cat-tile';
        b.setAttribute('data-cat', cat.id);
        b.innerHTML = '<span class="ct-ic">' + cat.icon + '</span><span>' + esc(cat.name) + '</span>';
        b.onclick = function () { ToolPages.open(cat.id); };
        row.appendChild(b);
      })(c);
    });
    wrap.appendChild(row);
    greet.parentNode.insertBefore(wrap, greet.nextSibling);
  }

  function init() { injectHomeCats(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
