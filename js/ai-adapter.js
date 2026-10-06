/* ViraCut AI — ai-adapter.js
   =====================================================================
   AI VIDEO PROVIDER ADAPTER
   ---------------------------------------------------------------------
   SECURITY RULE: never put provider API keys in this frontend code.
   Real video generation must go through YOUR backend server, which
   holds the key and calls the provider (e.g. Runway / Pika / Luma /
   Kling / Veo). The browser only talks to your backend.

   TO CONNECT A REAL API LATER:
     1. Deploy a tiny backend endpoint, e.g. POST https://your-server/api/ai-video
        Body: { prompt, duration, aspect, style, language }
        It calls the provider with YOUR secret key and returns
        { videoUrl } (or a job id you poll).
     2. Set AIAdapter.config.backendUrl to that URL.
     3. Set AIAdapter.config.provider = 'backend'.
   That's it — the UI (js/ai-video.js) needs no changes.

   Until then, provider 'mock' simulates staged progress so the full
   UX (progress bar, stages, error handling, usage limits) can be
   tested honestly.
   ===================================================================== */
(function () {
  'use strict';

  function AINotConnectedError() {
    this.name = 'AINotConnectedError';
    this.message = 'No AI video backend connected yet. Set AIAdapter.config.backendUrl in js/ai-adapter.js (see the comment at the top of that file).';
  }
  AINotConnectedError.prototype = Object.create(Error.prototype);

  var MOCK_STAGES = [
    'Analyzing prompt…', 'Writing script…', 'Planning scenes…',
    'Generating visuals…', 'Rendering frames…', 'Adding voiceover…',
    'Mixing music…', 'Finalizing video…'
  ];

  var AIAdapter = {
    config: {
      provider: 'mock',   // 'mock' | 'backend'
      backendUrl: null,   // <-- PUT YOUR BACKEND ENDPOINT URL HERE, e.g. 'https://api.yourserver.com/ai-video'
      pollIntervalMs: 2500
    },

    /* opts: {prompt,duration,aspect,style,language}  onProgress(stage, pct) */
    generateVideo: function (opts, onProgress) {
      var self = this;
      if (!opts || !opts.prompt || !opts.prompt.trim()) {
        return Promise.reject(new Error('Please enter a prompt first.'));
      }
      if (!Plans.canUseAI()) {
        return Promise.reject(new Error('Daily AI limit reached on the Free plan. Try tomorrow or Go Pro (Demo).'));
      }
      if (self.config.provider === 'backend' && self.config.backendUrl) {
        return self._backendGenerate(opts, onProgress);
      }
      return self._mockGenerate(opts, onProgress);
    },

    /* ---- mock: honest simulation, always ends "not connected" ---- */
    _mockGenerate: function (opts, onProgress) {
      return new Promise(function (resolve) {
        var i = 0;
        function step() {
          var pct = Math.round(((i + 1) / MOCK_STAGES.length) * 92);
          if (onProgress) onProgress(MOCK_STAGES[i], pct);
          i++;
          if (i < MOCK_STAGES.length) { setTimeout(step, 700 + Math.random() * 700); }
          else {
            setTimeout(function () {
              resolve({ ok: false, reason: 'not_connected', error: new AINotConnectedError() });
            }, 600);
          }
        }
        step();
      });
    },

    /* ---- backend: real implementation, used when configured ---- */
    _backendGenerate: function (opts, onProgress) {
      var url = this.config.backendUrl;
      if (onProgress) onProgress('Sending to your backend…', 5);
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      }).then(function (r) {
        if (!r.ok) throw new Error('Backend error ' + r.status);
        return r.json();
      }).then(function (data) {
        // Expect { videoUrl } or { jobId } — adapt to your backend.
        if (data.videoUrl) {
          Plans.recordAI();
          if (onProgress) onProgress('Done', 100);
          return { ok: true, videoUrl: data.videoUrl };
        }
        throw new Error('Backend did not return a videoUrl.');
      }).catch(function (err) {
        throw new Error('AI request failed: ' + err.message);
      });
    }
  };

  window.AIAdapter = AIAdapter;
  window.AINotConnectedError = AINotConnectedError;
})();
