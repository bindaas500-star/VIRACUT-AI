# ViraCut AI

A mobile-first, offline-capable AI video editor. **Vanilla HTML/CSS/JS, no build step** — open `index.html` on any static host and it runs. Original branding and UI (not a clone of any existing editor).

## Quick start

Serve the folder (or just open `index.html` — everything uses relative paths):

```bash
cd viracut
python3 -m http.server 8000
# open http://localhost:8000
```

No npm, no build, no API keys needed for the offline features.

## What's REAL (works fully offline)

| Feature | Details |
|---|---|
| Video/photo editor | Import files, timeline, trim in/out, split, reorder, delete, per-clip speed, rotate, fit modes, crossfade transitions |
| Text / stickers / captions | Overlays with position/color/size, emoji sticker set, manual captions + "Auto from script" |
| Audio | Import music file + volume, mic voiceover recording (MediaRecorder), WebAudio mixing in preview |
| Filters | CSS presets: none / warm / cool / mono / vivid / vintage |
| Export | 720p canvas capture + mixed audio → WebM download, with progress bar (see limitations) |
| AI Story generator | 100% offline template engine (English + Urdu), produces title, hook, story, scene breakdown with visual prompts, voiceover script, ending |
| Trending Ideas | Offline generator: 10 categories × 5 fresh ideas each |
| Social Kit | Offline templates: YT Shorts title, TikTok/IG captions, description, hashtags, thumbnail text + copy buttons |
| AI Voiceover preview | Browser SpeechSynthesis (Urdu/English/Arabic); honest note that preview voice is NOT baked into export |
| Projects | localStorage grid: open / rename / delete (with confirm) / duplicate, thumbnails |
| Demo auth + plans | Local name/email sign-in; Free = 5 AI gens/day, 720p export, watermark label; Pro = unlimited, 1080p, no watermark (demo "Go Pro" dialog, no payment) |
| Undo/redo | Full history stack for all model edits in the editor |

## What's MOCK / demo-only (honestly labeled in the UI)

| Feature | Label in app |
|---|---|
| AI Video Generator | Runs a staged mock progress bar, then shows: **"API not connected yet — add backend endpoint in js/ai-adapter.js"**. No video is produced. Saving the prompt as a project note works. |
| "Generate Full Video" (AI Story) | Creates a real project with scene cards + captions, but the scenes are **styled placeholder cards, not AI-rendered video**. Labeled as such on screen. |
| Go Pro | Demo dialog only — no payment is processed, plan flips locally. |
| Voiceover in export | Mic takes play in preview via WebAudio. Export captures preview audio via `captureStream`, so takes recorded **in the same session** are included; SpeechSynthesis preview audio cannot be captured by browsers and is excluded (noted on screen). |

## How to connect a real AI video API later

**Never put API keys in this frontend.** The adapter layer is ready:

1. Deploy a small backend endpoint (any stack) that accepts `{ prompt, duration, aspect, style, language }`, calls your video provider with **your secret key kept server-side**, and returns `{ videoUrl }` (or a job id you poll).
2. Open `js/ai-adapter.js`, find the `config` comment at the top, and set:
   ```js
   AIAdapter.config.backendUrl = 'https://your-server.example.com/api/generate-video';
   AIAdapter.config.provider = 'backend'; // was 'mock'
   AIAdapter.config.pollIntervalMs = 3000;
   ```
3. Make your endpoint return either `{ status:'done', videoUrl:'...' }` directly, or `{ status:'processing', jobId:'...' }` — the adapter already polls `backendUrl + '?jobId=...'` until done.
4. No UI changes needed — the Generate button, progress stages, and result panel work with both providers.

`js/ai-adapter.js` also exposes `recordUsage()` hooks already wired into `js/plans.js` daily AI-generation limits.

## File map

```
index.html          all screens (home/create/projects/aitools/profile/editor/aivideo/
                    aistory/photovideo/aivoice/autocap/trending/social)
css/app.css         dark navy/indigo→violet→pink theme, mobile-first 360–430px
js/app.js           router, bottom nav, toasts, dialogs, home/create/aitools/profile
                    screens, photo→video, AI voice, export orchestration
js/store.js         project model, localStorage, undo/redo, timing engine
js/editor.js        canvas compositor, transport, timeline, trim/split/speed/rotate/
                    filters/transitions/text/stickers/captions/audio panels
js/audio.js         music import + volume, mic voiceover recorder, WebAudio mix engine
js/captions.js      manual captions + auto-from-script
js/export.js        720p/1080p canvas + captureStream + mixed audio → WebM download
js/ai-adapter.js    mock provider + backend config (keys stay server-side)
js/ai-story.js      offline EN/UR story generator
js/ai-video.js      generator UI + mock progress flow
js/social.js        offline title/caption/hashtag generator
js/trending.js      offline idea generator (10 categories)
js/projects.js      project grid: open/rename/delete/duplicate
js/auth.js          demo local auth
js/plans.js         free/pro limits, usage counters, export sizes
```

## Known limitations

- Export uses `canvas.captureStream()` + `MediaRecorder` → **WebM** output (browser-native; no MP4 without a backend encoder).
- Very long projects export in real time (a 60s video takes ~60s to export).
- Media files are held as object URLs — they don't persist across reloads; project *structure* does.
- Tested in Chromium; Safari/Firefox should work but mic + captureStream behavior varies by browser.
