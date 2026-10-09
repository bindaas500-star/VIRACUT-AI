/* ViraCut — test-phase14.js — Phase 14: CapCut-style tool category pages.
   Run: node test-phase14.js
   Tests: ToolPages module structure, 5 categories, tools per category (all map
   to real functionality), page stack push/pop logic (functional, stubbed DOM),
   back button on every page, no duplicate IDs, index.html + CSS wiring. */
'use strict';
var fs = require('fs');
var src = fs.readFileSync(__dirname + '/js/toolpages.js', 'utf8');
var html = fs.readFileSync(__dirname + '/index.html', 'utf8');
var css = fs.readFileSync(__dirname + '/css/app.css', 'utf8');
var appSrc = fs.readFileSync(__dirname + '/js/app.js', 'utf8');

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL: ' + name); }
}
function has(s, sub, name) { ok(s.indexOf(sub) >= 0, name || sub); }
function count(s, sub) { return s.split(sub).length - 1; }

/* ---------- module structure ---------- */
has(src, 'window.ToolPages', 'ToolPages exposes window.ToolPages');
has(src, "'use strict'", 'toolpages.js uses strict mode');
has(src, '_stack: []', 'ToolPages has a page stack array');
has(src, 'open: function', 'ToolPages.open defined (push)');
has(src, 'back: function', 'ToolPages.back defined (pop)');
has(src, 'this._stack.push', 'open() pushes onto the stack');
has(src, 'this._stack.pop()', 'back() pops the stack');
has(src, 'render: render', 'ToolPages exposes render');

/* ---------- categories ---------- */
['video', 'photo', 'audio', 'ai', 'all'].forEach(function (id) {
  has(src, "id: '" + id + "'", 'category defined: ' + id);
});
has(src, 'Video Tools', 'Video Tools category named');
has(src, 'Photo Tools', 'Photo Tools category named');
has(src, 'Audio Tools', 'Audio Tools category named');
has(src, 'AI Tools', 'AI Tools category named');
has(src, 'All Tools', 'All Tools category named');

/* ---------- tools map to REAL functionality (nothing faked) ---------- */
has(src, 'Editor.open', 'Video Editor opens the real editor');
has(src, 'Projects.newProjectDialog()', 'Create Video uses real new-project dialog');
has(src, 'screen-photovideo', 'Photo to Video goes to real screen');
has(src, "needProject('fx')", 'Body Effects deep-links to real fx panel');
has(src, "needProject('captions')", 'Auto Captions deep-links to real captions panel');
has(src, "needProject('audio')", 'Music deep-links to real audio panel');
has(src, 'TXBrowse.render', 'Templates uses real TXBrowse renderer');
has(src, 'PhotoUI.importDialog', 'Photo Editor uses real PhotoUI');
has(src, 'screen-aivoice', 'AI Voiceover goes to real screen');
has(src, 'screen-aivideo', 'AI Video Generator goes to real screen');
has(src, 'screen-aistory', 'AI Story goes to real screen');
has(src, 'screen-trending', 'Trending Ideas goes to real screen');
has(src, 'screen-projects', 'My Projects goes to real screen');
has(src, 'SettingsScreen.render', 'Settings uses real SettingsScreen');
has(src, "tag: 'needs API'", 'AI Video Generator honestly tagged needs API');

/* ---------- All Tools sections ---------- */
['Video editing', 'Photo editing', 'Audio', 'AI tools', 'Quick actions'].forEach(function (t) {
  has(src, "'" + t + "'", 'All Tools section: ' + t);
});
has(src, 'tp-more', 'All Tools sections have View-all drill-down');
has(src, 'ToolPages.open(id)', 'View-all drills into the category page');

/* ---------- back button ---------- */
has(src, "id = 'tpBack'", 'back button has stable id tpBack');
has(src, "'vc-back icon-btn'", 'back button uses vc-back class');
has(src, "'←'", 'back button shows ← glyph');
has(src, 'ToolPages.back()', 'back button pops the ToolPages stack');
// App.ensureBackBtn must not inject a duplicate: it skips screens that
// already have a direct-child .vc-back.
has(appSrc, "querySelector(':scope > .vc-back')", 'App.ensureBackBtn skips screens with own .vc-back');

/* ---------- Home integration ---------- */
has(src, 'toolCats', 'Home category strip has id toolCats');
has(src, 'cat-row', 'Home uses cat-row for category tiles');
has(src, 'cat-tile', 'Home category tiles use cat-tile class');
has(src, 'data-cat', 'tiles carry data-cat for debugging');
has(src, "getElementById('toolCats')", 'inject is idempotent (no duplicates)');

/* ---------- index.html wiring ---------- */
has(html, 'id="screen-toolpage"', 'index.html has screen-toolpage section');
ok(count(html, 'id="screen-toolpage"') === 1, 'screen-toolpage id appears exactly once');
has(html, 'js/toolpages.js?v=4', 'index.html loads toolpages.js');
ok(count(html, 'js/toolpages.js') === 1, 'toolpages.js script tag appears exactly once');
ok(count(html, 'id="tpBack"') === 0, 'tpBack is created dynamically, not hardcoded in HTML');

/* ---------- CSS ---------- */
['.cat-row', '.cat-tile', '.tp-head', '.tp-list', '.tp-item', '.tp-sec', '.tp-more', '.tp-chev', '.tp-tx', '.tp-ic'].forEach(function (c) {
  has(css, c, 'CSS defines ' + c);
});

/* ---------- no duplicate IDs introduced ---------- */
ok(count(src, "'tpBack'") === 1, 'tpBack id assigned exactly once in source');

/* ---------- functional: page stack push/pop with stubbed DOM ---------- */
(function () {
  // minimal DOM stub sufficient for ToolPages.open/back/render
  function makeEl(tag) {
    var el = {
      tagName: (tag || 'div').toUpperCase(), children: [], parentNode: null,
      className: '', id: '', _innerHTML: '', textContent: '', style: {},
      onclick: null,
      set innerHTML(v) { this._innerHTML = v; this.children = []; },
      get innerHTML() { return this._innerHTML; },
      appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = this;
        var i = this.children.indexOf(ref);
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        return c;
      },
      setAttribute: function (k, v) { this[k] = v; },
      querySelector: function (sel) {
        if (sel === '.greet') return makeEl('div');
        if (sel === '.tp-more') { var b = makeEl('button'); return b; }
        if (sel === '.screen.active') return null;
        return null;
      },
      querySelectorAll: function () { return []; },
      addEventListener: function () {}
    };
    return el;
  }
  var toolScreen = makeEl('section'); toolScreen.id = 'screen-toolpage';
  var screensEl = makeEl('main'); screensEl.id = 'screens'; screensEl.scrollTop = 0;
  var homeEl = makeEl('section'); homeEl.id = 'screen-home';
  // home > .greet structure so injectHomeCats can insertAfter greet
  var greetEl = makeEl('div'); greetEl.className = 'greet';
  homeEl.appendChild(greetEl);
  homeEl.querySelector = function (sel) {
    if (sel === '.greet') return greetEl;
    return null;
  };
  var shown = [], backed = 0;
  var sandbox = {
    document: {
      readyState: 'complete',
      querySelector: function (sel) {
        if (sel === '.screen.active') return null; // simulate "coming from Home"
        return null;
      },
      querySelectorAll: function () { return []; },
      getElementById: function (id) {
        if (id === 'screen-toolpage') return toolScreen;
        if (id === 'screens') return screensEl;
        if (id === 'screen-home') return homeEl;
        return null;
      },
      createElement: makeEl,
      addEventListener: function () {}
    },
    window: {},
    console: console,
    toast: function () {},
    App: {
      show: function (id) { shown.push(id); },
      back: function () { backed++; },
      deepLink: null
    },
    Store: { current: null },
    Editor: { open: function () {} },
    Projects: { newProjectDialog: function () {} }
  };
  sandbox.window = sandbox;
  var vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'toolpages.js' });
  var TP = sandbox.window.ToolPages;
  ok(!!TP, 'ToolPages loads in stubbed DOM');
  ok(Array.isArray(TP._stack) && TP._stack.length === 0, 'stack starts empty');

  // open a category: pushes, renders, shows screen
  TP.open('video');
  ok(TP._stack.length === 1 && TP._stack[0].catId === 'video', 'open(video) pushes {catId:video}');
  ok(shown[shown.length - 1] === 'screen-toolpage', 'open() shows screen-toolpage');
  var hasBack = toolScreen.children.some(function (c) { return c.id === 'tpBack'; });
  ok(hasBack, 'rendered page has ← back button (tpBack)');
  var items = toolScreen.children.filter(function (c) { return c.className === 'tp-list'; });
  ok(items.length === 1, 'video category renders exactly one tool list');
  ok(items[0].children.length === TP.TOOLS.video.length,
    'video list has all ' + TP.TOOLS.video.length + ' tools (' + items[0].children.length + ' rendered)');

  // drill down: Video -> All Tools -> Video Tools via View-all (stack grows)
  sandbox.document.querySelector = function () { return toolScreen; }; // now "on" toolpage
  TP.open('all');
  ok(TP._stack.length === 2 && TP._stack[1].catId === 'all', 'drill-down pushes: stack depth 2');
  TP.open('video'); // simulate View-all tap
  ok(TP._stack.length === 3, 'View-all drill-down pushes: stack depth 3');
  TP.back();
  ok(TP._stack.length === 2 && TP._stack[1].catId === 'all', 'back() pops to All Tools page');
  // back button still present after re-render
  hasBack = toolScreen.children.some(function (c) { return c.id === 'tpBack'; });
  ok(hasBack, 'back button survives re-render after pop');

  // All Tools page renders 5 sections
  TP.open('all');
  var secs = toolScreen.children.filter(function (c) { return c.className === 'tp-sec'; });
  ok(secs.length === 5, 'All Tools page renders 5 sections (' + secs.length + ' found)');

  // photo category tools
  TP.open('photo');
  var plist = toolScreen.children.filter(function (c) { return c.className === 'tp-list'; })[0];
  ok(plist.children.length === TP.TOOLS.photo.length, 'photo list renders all tools');

  // empty stack -> goes directly home (loop fix: history-based back caused loops)
  TP._stack = [];
  var s4 = shown.length;
  TP.back();
  ok(shown.length === s4 + 1 && shown[shown.length - 1] === 'screen-home', 'back() on empty stack goes directly home');

  // every category in CATS has a tools array (except 'all' which uses sections)
  TP.CATS.forEach(function (c) {
    if (c.id === 'all') return;
    ok(Array.isArray(TP.TOOLS[c.id]) && TP.TOOLS[c.id].length > 0, 'category "' + c.id + '" has tools');
  });
  // every tool has icon + name + desc + go function
  Object.keys(TP.TOOLS).forEach(function (k) {
    TP.TOOLS[k].forEach(function (t) {
      ok(t.icon && t.name && t.desc && typeof t.go === 'function', 'tool "' + t.name + '" complete');
    });
  });
})();

console.log('\nRESULT: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
