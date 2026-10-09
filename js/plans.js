/* ViraCut AI — plans.js — Free/Pro limits, tracked locally (demo) */
(function () {
  'use strict';
  var LS_PLAN = 'viracut_plan_v1';
  var LS_AI = 'viracut_aiuse_v1';

  var Plans = {
    FREE_DAILY_AI: 5,

    plan: function () {
      try { return localStorage.getItem(LS_PLAN) || 'free'; } catch (e) { return 'free'; }
    },
    isPro: function () { return this.plan() === 'pro'; },
    setPlan: function (p) {
      try { localStorage.setItem(LS_PLAN, p); } catch (e) {}
      if (window.App && typeof App.refreshPlanBadge === 'function') App.refreshPlanBadge();
    },
    _today: function () { return new Date().toISOString().slice(0, 10); },
    _usage: function () {
      try { return JSON.parse(localStorage.getItem(LS_AI) || '{}'); }
      catch (e) { return {}; }
    },
    aiUsedToday: function () {
      var u = this._usage();
      return u[this._today()] || 0;
    },
    aiLeftToday: function () {
      if (this.isPro()) return Infinity;
      return Math.max(0, this.FREE_DAILY_AI - this.aiUsedToday());
    },
    canUseAI: function () { return this.isPro() || this.aiLeftToday() > 0; },
    // Call only after a REAL backend generation succeeds (mock runs don't count)
    recordAI: function () {
      var u = this._usage(), t = this._today();
      u[t] = (u[t] || 0) + 1;
      try { localStorage.setItem(LS_AI, JSON.stringify(u)); } catch (e) {}
    },
    exportHeight: function (aspect) {
      var pro = this.isPro();
      if (aspect === '16:9') return pro ? 1080 : 720;
      if (aspect === '1:1') return pro ? 1080 : 720;
      return pro ? 1920 : 1280; // 9:16 long edge
    },
    exportSize: function (aspect) {
      if (aspect === '16:9') { var h = this.exportHeight(aspect); return { w: Math.round(h * 16 / 9), h: h }; }
      if (aspect === '1:1') { var s = this.exportHeight(aspect); return { w: s, h: s }; }
      var l = this.exportHeight(aspect); return { w: Math.round(l * 9 / 16), h: l };
    },
    watermark: function () { return !this.isPro(); }, // free exports get "ViraCut AI" label
    describe: function () {
      return this.isPro()
        ? 'Pro — unlimited AI, 1080p export, no watermark'
        : 'Free — ' + this.aiLeftToday() + '/' + this.FREE_DAILY_AI + ' AI gens left today · 720p export · watermark';
    }
  };

  window.Plans = Plans;
})();
