/* ViraCut AI — auth-config.js
 *
 * REAL OAuth credentials go here. These IDs are PUBLIC by design
 * (they are exposed in the page anyway) — the secret stays on the
 * provider's side, so there is nothing sensitive in this file.
 *
 * HOW TO GET THEM (full steps in OAUTH-SETUP.md):
 *  1. Google: console.cloud.google.com → OAuth client ID (Web application)
 *     → Authorized JavaScript origin: https://bindaas500-star.github.io
 *  2. Facebook: developers.facebook.com → create app → Facebook Login → App ID
 *
 * Paste the values below, push, and sign-in buttons go live.
 */
window.VIRACUT_AUTH = {
  googleClientId: '',   // e.g. '1234567890-abc123.apps.googleusercontent.com'
  facebookAppId: ''     // e.g. '1234567890123456'
};
