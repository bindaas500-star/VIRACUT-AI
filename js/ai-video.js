/* ViraCut AI — ai-video.js — AI Video Generator screen wiring */
(function () {
  'use strict';

  var SEL = {
    dur: { el: 'avDur', opts: ['5s', '10s', '30s', '60s'], val: '30s' },
    aspect: { el: 'avAspect', opts: ['9:16', '16:9', '1:1'], val: '9:16' },
    style: { el: 'avStyle', opts: ['Cinematic', 'Realistic', 'Anime', 'Cartoon'], val: 'Cinematic' },
    lang: { el: 'avLang', opts: ['Urdu', 'English', 'Arabic'], val: 'English' }
  };

  function renderPills() {
    Object.keys(SEL).forEach(function (k) {
      var s = SEL[k], box = document.getElementById(s.el);
      box.innerHTML = '';
      s.opts.forEach(function (o) {
        var b = document.createElement('button');
        b.className = 'pill' + (s.val === o ? ' on' : '');
        b.textContent = o;
        b.onclick = function () { s.val = o; renderPills(); };
        box.appendChild(b);
      });
    });
  }

  function init() {
    renderPills();
    document.getElementById('avGenerate').onclick = generate;
    document.getElementById('avSave').onclick = saveNote;
  }

  function generate() {
    var prompt = document.getElementById('avPrompt').value.trim();
    var prog = document.getElementById('avProgress');
    var fill = document.getElementById('avProgFill');
    var stage = document.getElementById('avStage');
    var res = document.getElementById('avResult');
    var btn = document.getElementById('avGenerate');
    res.innerHTML = '';
    btn.disabled = true;
    prog.classList.remove('hidden');

    AIAdapter.generateVideo({
      prompt: prompt,
      duration: SEL.dur.val, aspect: SEL.aspect.val,
      style: SEL.style.val, language: SEL.lang.val
    }, function (st, pct) {
      stage.textContent = st;
      fill.style.width = pct + '%';
    }).then(function (out) {
      btn.disabled = false;
      fill.style.width = '100%';
      stage.textContent = 'Finished.';
      if (out && out.ok && out.videoUrl) {
        res.innerHTML = '<div class="card"><h4>✅ Video ready</h4>' +
          '<video src="' + out.videoUrl + '" controls style="width:100%;border-radius:12px;margin-top:8px"></video></div>';
        toast('AI video generated.');
      } else {
        // honest "not connected" panel
        res.innerHTML =
          '<div class="note-card" style="border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.07)">' +
          '🔌 <b>API not connected yet.</b><br>The mock run finished — in production this is where your rendered video would appear.<br><br>' +
          'To connect a real AI video API:<ol style="margin:8px 0 0 18px;font-size:12.5px">' +
          '<li>Deploy a backend endpoint (it holds your secret API key — never in the app).</li>' +
          '<li>Set <b>AIAdapter.config.backendUrl</b> in <b>js/ai-adapter.js</b> (instructions are in the file comments).</li>' +
          '<li>Set provider to <b>\'backend\'</b> — done, no UI changes needed.</li></ol></div>';
      }
    }).catch(function (err) {
      btn.disabled = false;
      prog.classList.add('hidden');
      toast(err.message || 'Generation failed.', true);
    });
  }

  function saveNote() {
    var prompt = document.getElementById('avPrompt').value.trim();
    if (!prompt) { toast('Write a prompt first.', true); return; }
    var p = Store.current || Store.newProject('AI Video — ' + new Date().toLocaleDateString(), SEL.aspect.val);
    Store.snapshot();
    p.notes = (p.notes ? p.notes + '\n\n' : '') + 'AI VIDEO PROMPT (' + SEL.dur.val + ', ' + SEL.aspect.val + ', ' + SEL.style.val + ', ' + SEL.lang.val + '):\n' + prompt;
    Store.persist();
    toast('Saved to project: ' + p.name);
  }

  window.AIVideo = { init: init, SEL: SEL };
})();
