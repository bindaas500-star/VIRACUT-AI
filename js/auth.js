/* ViraCut AI — auth.js — real OAuth sign-in (Google + Facebook)
 *
 * Uses Google Identity Services and the Facebook JS SDK directly in the
 * browser. No backend, no API keys in code — OAuth client IDs live in
 * js/auth-config.js (public by design). Session is stored only on this
 * device (localStorage). Sign out wipes it.
 */
(function () {
  'use strict';
  var LS_USER = 'viracut_user_v1';

  function cfg() { return window.VIRACUT_AUTH || {}; }
  function save(u) { try { localStorage.setItem(LS_USER, JSON.stringify(u)); } catch (e) {} }

  function loadScript(src, id) {
    return new Promise(function (resolve, reject) {
      if (id && document.getElementById(id)) return resolve();
      var s = document.createElement('script');
      if (id) s.id = id;
      s.src = src; s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var Auth = {
    user: function () {
      try { return JSON.parse(localStorage.getItem(LS_USER) || 'null'); }
      catch (e) { return null; }
    },

    configured: function (provider) {
      var c = cfg();
      if (provider === 'google') return !!(c.googleClientId && c.googleClientId.indexOf('apps.googleusercontent.com') > -1);
      if (provider === 'facebook') return !!(c.facebookAppId && /^\d+$/.test(c.facebookAppId));
      return false;
    },

    /* ---------- Google ---------- */
    ensureGoogle: function () {
      return loadScript('https://accounts.google.com/gsi/client', 'viracut-gsi');
    },
    signInWithGoogle: function () {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!self.configured('google')) return reject({ needSetup: true, provider: 'google' });
        self.ensureGoogle().then(function () {
          var client;
          try {
            client = google.accounts.oauth2.initTokenClient({
              client_id: cfg().googleClientId,
              scope: 'openid email profile',
              callback: function (resp) {
                if (resp && resp.access_token) {
                  fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: 'Bearer ' + resp.access_token }
                  }).then(function (r) { return r.json(); }).then(function (p) {
                    var u = { provider: 'google', sub: p.sub, name: p.name || 'Creator', email: p.email || '', picture: p.picture || '', since: Date.now() };
                    save(u); resolve(u);
                  }).catch(function (e) { reject(e); });
                } else {
                  reject({ cancelled: true });
                }
              }
            });
          } catch (e) { return reject(e); }
          client.requestAccessToken();
        }).catch(reject);
      });
    },

    /* ---------- Facebook ---------- */
    ensureFacebook: function () {
      var self = this;
      return loadScript('https://connect.facebook.net/en_US/sdk.js', 'viracut-fbsdk').then(function () {
        return new Promise(function (resolve) {
          window.fbAsyncInit = function () {
            FB.init({ appId: cfg().facebookAppId, cookie: true, xfbml: false, version: 'v21.0' });
            resolve();
          };
          // SDK may already be ready if fbAsyncInit fired before assignment
          if (window.FB) { window.fbAsyncInit(); }
        });
      });
    },
    signInWithFacebook: function () {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!self.configured('facebook')) return reject({ needSetup: true, provider: 'facebook' });
        self.ensureFacebook().then(function () {
          FB.login(function (resp) {
            if (resp && resp.authResponse) {
              FB.api('/me', { fields: 'name,email,picture.width(200)' }, function (p) {
                if (!p || p.error) return reject(p && p.error ? p.error : new Error('Facebook profile failed'));
                var u = { provider: 'facebook', sub: p.id, name: p.name || 'Creator', email: p.email || '', picture: (p.picture && p.picture.data && p.picture.data.url) || '', since: Date.now() };
                save(u); resolve(u);
              });
            } else {
              reject({ cancelled: true });
            }
          }, { scope: 'public_profile,email' });
        }).catch(reject);
      });
    },

    /* ---------- Sign out ---------- */
    signOut: function () {
      try { localStorage.removeItem(LS_USER); } catch (e) {}
      try {
        if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
      } catch (e) {}
      try {
        if (window.FB) FB.getLoginStatus(function (r) { if (r && r.status === 'connected') FB.logout(); });
      } catch (e) {}
    }
  };

  window.Auth = Auth;
})();
