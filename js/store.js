/* ViraCut AI — store.js
   Project model, localStorage persistence, undo/redo history.
   Media blobs are NOT stored in localStorage (quota) — they live in
   Store.mediaCache (in-memory object URLs) for this session. After a
   page reload, clips keep their metadata and ask for re-link. */
(function () {
  'use strict';

  var LS_PROJECTS = 'viracut_projects_v1';
  var LS_CURRENT = 'viracut_current_v1';

  var uidc = 0;
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + '_' + (uidc++); }

  function blankProject(name, aspect) {
    return {
      id: uid('proj'), name: name || 'Untitled Project', aspect: aspect || '9:16',
      createdAt: Date.now(), updatedAt: Date.now(),
      clips: [],        // {id,type:'video'|'photo',name,url,duration,in,out,speed,rotation,fit,transitionIn,kb}
      texts: [],        // {id,text,position:'top'|'mid'|'bottom',color,size,start,end}
      stickers: [],     // {id,emoji,x,y,size}
      captions: [],     // {id,text,start,end}
      filter: 'none',
      music: null,      // {name,url,volume,buffer?}
      voiceovers: [],   // {id,name,url,volume,buffer?}
      script: '',       // voiceover script text (from AI voice / story)
      notes: ''
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var Store = {
    mediaCache: new Map(), // clipId -> objectURL (session only)
    current: null,
    history: [], hIndex: -1,

    /* ---------- projects ---------- */
    newProject: function (name, aspect) {
      var p = blankProject(name, aspect);
      this.current = p;
      this.history = []; this.hIndex = -1;
      this.pushHistory('init');
      this.persist();
      try { localStorage.setItem(LS_CURRENT, p.id); } catch (e) {}
      return p;
    },
    openProject: function (id) {
      var all = this.getProjects();
      var found = null;
      for (var i = 0; i < all.length; i++) if (all[i].id === id) found = all[i];
      if (!found) return null;
      this.current = found;
      this.history = []; this.hIndex = -1;
      this.pushHistory('open');
      try { localStorage.setItem(LS_CURRENT, id); } catch (e) {}
      return found;
    },
    getProjects: function () {
      try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '[]'); }
      catch (e) { return []; }
    },
    _saveAll: function (list) {
      try { localStorage.setItem(LS_PROJECTS, JSON.stringify(list)); }
      catch (e) { if (window.toast) toast('Storage full — oldest projects may not save.', true); }
    },
    persist: function () {
      if (!this.current) return;
      this.current.updatedAt = Date.now();
      var all = this.getProjects();
      var done = false;
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === this.current.id) { all[i] = clone(this.current); done = true; break; }
      }
      if (!done) all.unshift(clone(this.current));
      this._saveAll(all);
    },
    deleteProject: function (id) {
      var all = this.getProjects().filter(function (p) { return p.id !== id; });
      this._saveAll(all);
      if (this.current && this.current.id === id) {
        this.current = null;
        try { localStorage.removeItem(LS_CURRENT); } catch (e) {}
      }
    },
    duplicateProject: function (id) {
      var all = this.getProjects();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          var c = clone(all[i]);
          c.id = uid('proj'); c.name = c.name + ' (copy)'; c.createdAt = Date.now();
          // duplicate keeps media urls if session cache has them
          all.unshift(c);
          this._saveAll(all);
          return c.id;
        }
      }
      return null;
    },
    renameProject: function (id, name) {
      var all = this.getProjects();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { all[i].name = name; all[i].updatedAt = Date.now(); }
      }
      this._saveAll(all);
      if (this.current && this.current.id === id) this.current.name = name;
    },
    lastOpenId: function () {
      try { return localStorage.getItem(LS_CURRENT); } catch (e) { return null; }
    },

    /* ---------- undo / redo ---------- */
    pushHistory: function () {
      if (!this.current) return;
      this.history = this.history.slice(0, this.hIndex + 1);
      this.history.push(clone(this.current));
      if (this.history.length > 60) this.history.shift();
      this.hIndex = this.history.length - 1;
    },
    // Call AFTER mutating: commits the new state, then persist().
    // (Undo restores the previously committed state.)
    snapshot: function () { this.pushHistory(); },
    undo: function () {
      if (this.hIndex <= 0) return false;
      this.hIndex--;
      this.current = clone(this.history[this.hIndex]);
      this._relinkMedia();
      this.persist();
      return true;
    },
    redo: function () {
      if (this.hIndex >= this.history.length - 1) return false;
      this.hIndex++;
      this.current = clone(this.history[this.hIndex]);
      this._relinkMedia();
      this.persist();
      return true;
    },
    canUndo: function () { return this.hIndex > 0; },
    canRedo: function () { return this.hIndex < this.history.length - 1; },
    // restore live object URLs from session cache after undo/redo/load
    _relinkMedia: function () {
      if (!this.current) return;
      var self = this;
      this.current.clips.forEach(function (c) {
        var u = self.mediaCache.get(c.id);
        if (u) c.url = u;
      });
      if (this.current.music) {
        var m = self.mediaCache.get('music_' + this.current.id);
        if (m) this.current.music.url = m;
      }
      var self2 = this;
      this.current.voiceovers.forEach(function (v) {
        var u = self2.mediaCache.get(v.id);
        if (u) v.url = u;
      });
    },

    /* ---------- timing ---------- */
    clipPlayDur: function (clip) {
      var d = Math.max(0.1, (clip.out - clip.in)) / (clip.speed || 1);
      return d;
    },
    timing: function () {
      // returns [{clip,start,end}] and total
      var t = 0, out = [];
      if (!this.current) return { items: [], total: 0 };
      this.current.clips.forEach(function (c) {
        var d = Store.clipPlayDur(c);
        out.push({ clip: c, start: t, end: t + d });
        t += d;
      });
      return { items: out, total: t };
    },
    clipAt: function (t) {
      var tm = this.timing();
      for (var i = 0; i < tm.items.length; i++) {
        if (t < tm.items[i].end) return { item: tm.items[i], index: i };
      }
      return tm.items.length ? { item: tm.items[tm.items.length - 1], index: tm.items.length - 1 } : null;
    },

    uid: uid
  };

  window.Store = Store;
})();
