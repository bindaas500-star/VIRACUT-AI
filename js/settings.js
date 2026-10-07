/* ViraCut AI — settings.js — Settings screen (CapCut-style rows, all real).
 * Account: edit profile (local), manage account, sign out.
 * Preferences: app language (EN/اردو), default ending card toggle.
 * Feedback & about: feedback (email), terms & policies, OSS notice,
 * clear cache, version + check for updates. */
(function () {
  'use strict';
  var LS = 'viracut_settings_v1';
  var PROFILE_LS = 'viracut_profile_v1';
  var VERSION = '1.1.0';

  function readLS(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  window.Settings = {
    version: VERSION,
    get: function (k, fb) {
      var s = readLS(LS, {});
      return (k in s) ? s[k] : fb;
    },
    set: function (k, v) {
      var s = readLS(LS, {});
      s[k] = v; writeLS(LS, s);
    },
    profile: function () { return readLS(PROFILE_LS, { name: '', avatar: '' }); },
    saveProfile: function (p) { writeLS(PROFILE_LS, p); },
    clearAllLocal: function () {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('viracut_') === 0) { try { localStorage.removeItem(k); } catch (e) {} }
      });
    }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function row(label, sub, right) {
    return '<button class="set-row" data-act="' + label.act + '">' +
      '<span style="flex:1;text-align:left"><b>' + label.t + '</b>' +
      (sub ? '<br><small class="muted">' + sub + '</small>' : '') + '</span>' +
      (right || '<span class="muted">›</span>') + '</button>';
  }
  function toggleRow(title, sub, on, act) {
    return '<div class="set-row"><span style="flex:1"><b>' + title + '</b>' +
      (sub ? '<br><small class="muted">' + sub + '</small>' : '') + '</span>' +
      '<button class="switch' + (on ? ' on' : '') + '" data-toggle="' + act + '"><span class="knob"></span></button></div>';
  }

  function termsHTML() {
    return '<h3>' + t('set.terms_title') + '</h3>' +
      '<h4>Privacy Policy</h4>' +
      '<p class="muted" style="font-size:13px">ViraCut AI stores your projects, templates, settings and media <b>on your device only</b>. Nothing is uploaded to our servers — there are no servers. Template catalog updates are fetched from a public file on GitHub. If you contact support by email, we see only what you send.</p>' +
      '<h4>Terms of Use</h4>' +
      '<p class="muted" style="font-size:13px">ViraCut AI is provided as-is for creating videos. You own the videos you make. Do not use the app to create misleading, hateful or illegal content. Template designs in this app are original creations; respect other creators\' rights when sharing your videos. Contact: bindaas500@gmail.com</p>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="tmOk" style="flex:1">OK</button></div>';
  }
  function ossHTML() {
    return '<h3>Open Source Software Notice</h3>' +
      '<p class="muted" style="font-size:13px">ViraCut AI is built with open web standards — HTML, CSS and vanilla JavaScript — with no third-party app frameworks. Text rendering may use the system font stack and "Noto Nastaliq Urdu" (SIL Open Font License) for Urdu script.</p>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="ossOk" style="flex:1">OK</button></div>';
  }

  window.SettingsScreen = {
    render: function () {
      var lang = I18N.lang();
      var ending = Settings.get('defaultEnding', false);
      var prof = Settings.profile();
      var cacheKB = 0;
      try {
        var rc = localStorage.getItem('viracut_tx_remote_v1') || '';
        cacheKB = Math.round(rc.length / 1024);
      } catch (e) {}
      var scr = document.getElementById('screen-settings');
      scr.innerHTML =
        '<button class="back-btn" id="setBack">' + t('btn.back') + '</button>' +
        '<h2 class="page-title">' + t('set.title') + '</h2>' +

        '<h3 class="sec-title">' + t('set.account') + '</h3>' +
        '<div class="card" style="padding:0">' +
        row({ act: 'profile', t: '👤 ' + t('set.editprofile') }, esc(prof.name || '—')) +
        row({ act: 'manage', t: '🔧 ' + t('set.manage') }) +
        '</div>' +

        '<h3 class="sec-title" style="margin-top:14px">' + t('set.prefs') + '</h3>' +
        '<div class="card" style="padding:0">' +
        '<div class="set-row"><span style="flex:1"><b>🌐 ' + t('set.lang') + '</b></span>' +
        '<span class="pills" style="margin:0"><button class="pill' + (lang === 'en' ? ' on' : '') + '" data-lang="en">English</button>' +
        '<button class="pill' + (lang === 'ur' ? ' on' : '') + '" data-lang="ur">اردو</button></span></div>' +
        toggleRow('🎬 ' + t('set.ending'), t('set.ending_sub'), ending, 'ending') +
        '</div>' +

        '<h3 class="sec-title" style="margin-top:14px">' + t('set.about') + '</h3>' +
        '<div class="card" style="padding:0">' +
        row({ act: 'feedback', t: '💬 ' + t('set.feedback') }) +
        row({ act: 'terms', t: '📄 ' + t('set.terms') }) +
        row({ act: 'oss', t: '🧩 ' + t('set.oss') }) +
        row({ act: 'clearcache', t: '🧹 ' + t('set.clearcache') }, cacheKB + ' KB') +
        row({ act: 'update', t: '⬆️ ' + t('set.checkupdate') }, 'v' + VERSION) +
        '</div>' +

        '<div class="stack" style="margin-top:14px">' +
        '<button class="btn ghost block" id="setSignOut">' + t('set.signout') + '</button>' +
        '</div>' +
        '<p class="fineprint">ViraCut AI v' + VERSION + '</p>';

      scr.querySelector('#setBack').onclick = function () { App.show('screen-profile'); };
      scr.querySelector('#setSignOut').onclick = function () {
        if (window.Auth) Auth.signOut();
        toast(t('set.saved')); App.show('screen-profile');
      };
      scr.querySelectorAll('[data-lang]').forEach(function (b) {
        b.onclick = function () {
          I18N.setLang(b.getAttribute('data-lang'));
          SettingsScreen.render();
          try { if (window.TXBrowse) TXBrowse.render(); } catch (e) {}
        };
      });
      scr.querySelectorAll('[data-toggle]').forEach(function (b) {
        b.onclick = function () {
          var act = b.getAttribute('data-toggle');
          if (act === 'ending') {
            var v = !Settings.get('defaultEnding', false);
            Settings.set('defaultEnding', v);
            b.classList.toggle('on', v);
            toast(t('set.saved'));
          }
        };
      });
      var self = this;
      scr.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function () { self.action(b.getAttribute('data-act')); };
      });
      App.show('screen-settings');
    },
    action: function (act) {
      var self = this;
      if (act === 'profile') {
        var prof = Settings.profile();
        App.modal('<h3>👤 ' + t('set.editprofile') + '</h3>' +
          '<label class="lbl">' + t('set.name') + '</label>' +
          '<input type="text" id="pfName" value="' + esc(prof.name) + '" placeholder="Your name">' +
          '<label class="lbl">Avatar emoji</label>' +
          '<input type="text" id="pfAvatar" value="' + esc(prof.avatar) + '" placeholder="😎" maxlength="4">' +
          '<div class="row" style="margin-top:12px"><button class="btn primary" id="pfSave" style="flex:1">' + t('set.save') + '</button>' +
          '<button class="btn ghost" id="pfCancel">' + t('set.cancel') + '</button></div>',
          function (root) {
            root.querySelector('#pfCancel').onclick = App.closeModal;
            root.querySelector('#pfSave').onclick = function () {
              Settings.saveProfile({ name: root.querySelector('#pfName').value.trim(), avatar: root.querySelector('#pfAvatar').value.trim() });
              App.closeModal(); toast(t('set.saved')); self.render();
            };
          });
      } else if (act === 'manage') {
        var keys = [];
        try {
          Object.keys(localStorage).forEach(function (k) { if (k.indexOf('viracut_') === 0) keys.push(k); });
        } catch (e) {}
        App.modal('<h3>🔧 ' + t('set.manage') + '</h3>' +
          '<p class="muted" style="font-size:13px">Stored on this device: ' + keys.length + ' records (projects, templates, settings).</p>' +
          '<div class="stack" style="margin-top:12px">' +
          '<button class="btn danger block" id="mgDel">' + t('set.delete_data') + '</button>' +
          '<button class="btn ghost block" id="mgOk">OK</button></div>',
          function (root) {
            root.querySelector('#mgOk').onclick = App.closeModal;
            root.querySelector('#mgDel').onclick = function () {
              if (confirm(t('set.delete_confirm'))) {
                Settings.clearAllLocal();
                App.closeModal(); toast(t('set.saved'));
                try { location.reload(); } catch (e) {}
              }
            };
          });
      } else if (act === 'feedback') {
        App.modal('<h3>💬 ' + t('set.fb_title') + '</h3>' +
          '<textarea id="fbText" rows="4" style="width:100%" placeholder="' + t('set.fb_ph') + '"></textarea>' +
          '<div class="row" style="margin-top:12px"><button class="btn primary" id="fbSend" style="flex:1">' + t('set.fb_send') + '</button>' +
          '<button class="btn ghost" id="fbCancel">' + t('set.cancel') + '</button></div>',
          function (root) {
            root.querySelector('#fbCancel').onclick = App.closeModal;
            root.querySelector('#fbSend').onclick = function () {
              var msg = root.querySelector('#fbText').value.trim() || '(no message)';
              App.closeModal();
              window.location.href = 'mailto:bindaas500@gmail.com?subject=' +
                encodeURIComponent('ViraCut AI Feedback') + '&body=' + encodeURIComponent(msg);
            };
          });
      } else if (act === 'terms') {
        App.modal(termsHTML(), function (root) { root.querySelector('#tmOk').onclick = App.closeModal; });
      } else if (act === 'oss') {
        App.modal(ossHTML(), function (root) { root.querySelector('#ossOk').onclick = App.closeModal; });
      } else if (act === 'clearcache') {
        try {
          localStorage.removeItem('viracut_tx_remote_v1');
          if (window.TXRemote) TXRemote.check(function () {});
        } catch (e) {}
        toast(t('set.cache_cleared')); self.render();
      } else if (act === 'update') {
        try {
          if (window.TXRemote) TXRemote.check(function (err, res) {
            toast(!err && res && res.changed ? t('set.new_arrived') : t('set.uptodate'));
          });
          else toast(t('set.uptodate'));
        } catch (e) { toast(t('set.uptodate')); }
        // also force the service worker to look for a new app version
        try {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.getRegistration().then(function (reg) {
              if (reg) reg.update();
            });
          }
        } catch (e2) {}
      }
    }
  };
})();
