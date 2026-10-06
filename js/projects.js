/* ViraCut AI — projects.js — project grid: open/rename/delete/duplicate */
(function () {
  'use strict';

  function thumbFor(p) {
    if (p.clips && p.clips.length) {
      var c = p.clips[0];
      if (c.type === 'photo' && c.url && c.url.indexOf('blob:') !== 0) {
        return '<img src="' + c.url + '">';
      }
    }
    return '🎬';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function dt(ts) {
    try { return new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function render() {
    var grid = document.getElementById('projectGrid');
    var recent = document.getElementById('homeRecent');
    var all = Store.getProjects();
    grid.innerHTML = '';
    recent.innerHTML = '';
    if (!all.length) {
      grid.innerHTML = '<div class="empty">No projects yet — create your first one!</div>';
      recent.innerHTML = '<div class="empty" style="min-width:100%">Nothing here yet.</div>';
      return;
    }
    all.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'proj-card';
      card.innerHTML = '<div class="thumb">' + thumbFor(p) + '</div>' +
        '<div class="body"><div class="nm">' + esc(p.name) + '</div>' +
        '<div class="dt">' + esc(p.aspect) + ' · ' + dt(p.updatedAt) + '</div>' +
        '<div class="acts"><button data-a="open">Open</button><button data-a="ren">Rename</button>' +
        '<button data-a="dup">Duplicate</button><button data-a="del">Delete</button></div></div>';
      card.querySelector('[data-a=open]').onclick = function (e) { e.stopPropagation(); Editor.open(p.id); };
      card.querySelector('[data-a=ren]').onclick = function (e) {
        e.stopPropagation();
        App.modal('<h3>Rename project</h3><input type="text" id="rnV" value="' + esc(p.name) + '">' +
          '<div class="row" style="margin-top:12px"><button class="btn primary" id="rnOk" style="flex:1">Save</button><button class="btn ghost" id="rnNo">Cancel</button></div>',
          function (root) {
            root.querySelector('#rnNo').onclick = App.closeModal;
            root.querySelector('#rnOk').onclick = function () {
              var v = root.querySelector('#rnV').value.trim();
              if (v) { Store.renameProject(p.id, v); toast('Renamed.'); }
              App.closeModal(); render();
            };
          });
      };
      card.querySelector('[data-a=dup]').onclick = function (e) {
        e.stopPropagation();
        var nid = Store.duplicateProject(p.id);
        if (nid) { toast('Duplicated.'); render(); }
      };
      card.querySelector('[data-a=del]').onclick = function (e) {
        e.stopPropagation();
        App.confirm('Delete "' + p.name + '" permanently?', function (ok) {
          if (ok) { Store.deleteProject(p.id); toast('Project deleted.'); render(); }
        });
      };
      card.onclick = function () { Editor.open(p.id); };
      grid.appendChild(card);
    });
    // home recents (first 6)
    all.slice(0, 6).forEach(function (p) {
      var c = document.createElement('div');
      c.className = 'recent-card';
      c.innerHTML = '<div class="thumb">' + thumbFor(p) + '</div><div class="nm">' + esc(p.name) + '</div>';
      c.onclick = function () { Editor.open(p.id); };
      recent.appendChild(c);
    });
  }

  function newProjectDialog(aspectDefault, cb) {
    App.modal(
      '<h3>＋ New Project</h3>' +
      '<label class="lbl">Name</label><input type="text" id="npName" placeholder="My awesome video" value="">' +
      '<label class="lbl">Aspect ratio</label><div class="pills" id="npAspect"></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" id="npGo" style="flex:1">Create</button>' +
      '<button class="btn ghost" id="npNo">Cancel</button></div>',
      function (root) {
        var aspect = aspectDefault || '9:16';
        ['9:16', '16:9', '1:1'].forEach(function (a) {
          var b = document.createElement('button');
          b.className = 'pill' + (aspect === a ? ' on' : ''); b.textContent = a;
          b.onclick = function () { aspect = a; root.querySelectorAll('#npAspect .pill').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); };
          root.querySelector('#npAspect').appendChild(b);
        });
        root.querySelector('#npNo').onclick = App.closeModal;
        root.querySelector('#npGo').onclick = function () {
          var name = root.querySelector('#npName').value.trim() || 'Untitled Project';
          App.closeModal();
          var p = Store.newProject(name, aspect);
          render();
          if (cb) cb(p); else Editor.open(p.id);
        };
      }
    );
  }

  window.Projects = { render: render, newProjectDialog: newProjectDialog };
})();
