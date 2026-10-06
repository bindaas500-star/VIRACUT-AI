/* ViraCut AI — auth.js — demo local auth (no server, no real accounts) */
(function () {
  'use strict';
  var LS_USER = 'viracut_user_v1';

  var Auth = {
    user: function () {
      try { return JSON.parse(localStorage.getItem(LS_USER) || 'null'); }
      catch (e) { return null; }
    },
    signIn: function (name, email) {
      var u = { name: name, email: email, since: Date.now() };
      try { localStorage.setItem(LS_USER, JSON.stringify(u)); } catch (e) {}
      return u;
    },
    signOut: function () {
      try { localStorage.removeItem(LS_USER); } catch (e) {}
    },
    // modal sign-in form; resolves with user or null
    promptSignIn: function () {
      var self = this;
      return new Promise(function (resolve) {
        var ex = self.user();
        App.modal(
          '<h3>👋 Welcome to ViraCut AI</h3>' +
          '<p class="muted" style="margin-bottom:12px">Demo sign-in — saved only on this device.</p>' +
          '<label class="lbl">Name</label><input type="text" id="auName" value="' + (ex ? esc(ex.name) : '') + '" placeholder="Your name">' +
          '<label class="lbl">Email</label><input type="email" id="auEmail" value="' + (ex ? esc(ex.email) : '') + '" placeholder="you@email.com">' +
          '<div class="row"><button class="btn primary" id="auGo" style="flex:1">Continue</button>' +
          '<button class="btn ghost" id="auCancel">Cancel</button></div>',
          function (root) {
            root.querySelector('#auCancel').onclick = function () { App.closeModal(); resolve(null); };
            root.querySelector('#auGo').onclick = function () {
              var n = root.querySelector('#auName').value.trim() || 'Creator';
              var e = root.querySelector('#auEmail').value.trim() || 'creator@viracut.app';
              var u = self.signIn(n, e);
              App.closeModal();
              toast('Welcome, ' + n + '!');
              resolve(u);
            };
          }
        );
      });
      function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    }
  };

  window.Auth = Auth;
})();
