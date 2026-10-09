/* ViraCut AI — i18n.js — App language: English / اردو.
 * t(key, params) — Urdu script dictionary for main UI. Extensible. */
(function () {
  'use strict';
  var LS = 'viracut_lang';
  var D = {
    en: {
      'nav.home': 'Home', 'nav.create': 'Create', 'nav.templates': 'Templates',
      'nav.projects': 'Projects', 'nav.aitools': 'AI Tools', 'nav.profile': 'Profile',
      'tpl.title': '🎭 Templates', 'tpl.sub': 'Pick a style → add your clips → video ready.',
      'tpl.search': 'Search templates…',
      'sort.trending': '🔥 Trending', 'sort.new': '🆕 New', 'sort.popular': '❤️ Popular',
      'sec.featured': '⭐ Featured', 'sec.trending_week': '🔥 Trending this week',
      'sec.newest': '🆕 Newest', 'sec.loved': '❤️ Most loved',
      'sec.arrivals': '📥 New Arrivals', 'sec.my': '🛠️ My Templates',
      'sec.count': '{n} templates', 'sec.empty': 'No templates found.',
      'creator.title': '🛠️ <b>Template Creator</b>', 'creator.sub': 'Design your own reusable template',
      'creator.open': 'Open',
      'tpl.fine': 'Original ViraCut designs — timed scenes, smart FX, text & music. Your media stays on your device.',
      'btn.use': 'Use Template', 'btn.back': '‹ Back',
      'det.duration': '⏱️ Duration', 'det.slots': '📷 Media slots', 'det.music': '🎵 Music',
      'det.format': '📐 Format', 'det.category': '🗂️ Category', 'det.required': '📷 Required media',
      'det.by': 'by', 'det.uses': 'uses',
      'slot.chip': '📷 Slot {n}',
      'slots.sub': 'Add {n} photos/videos — tap a slot to pick, tap again to replace.',
      'slots.music': '🎵 Music', 'slots.upload': '＋ Upload my music',
      'slots.quality': '⚙️ Quality', 'slots.generate': '▶ Generate Video',
      'slots.generate_n': '▶ Generate ({d}/{n})',
      'slots.multi': '🖼️ Select all photos at once',
      'gen.title': '✨ Creating your video', 'gen.rendering': 'Rendering scenes…',
      'gen.scene': 'Scene {i} / {n}…',
      'res.title': '🎉 Your video is ready', 'res.save': '⬇ Save', 'res.share': '📤 Share',
      'res.restart': '↺ Restart template', 'res.editmedia': '✏️ Edit media', 'res.edittpl': '🎬 Edit template',
      'set.title': 'Settings', 'set.account': 'Account', 'set.prefs': 'Preferences', 'set.about': 'Feedback & about',
      'set.editprofile': 'Edit profile', 'set.manage': 'Manage account',
      'set.lang': 'App language', 'set.ending': 'Add default ending',
      'set.ending_sub': 'ViraCut card at the end of videos',
      'set.feedback': 'Feedback', 'set.terms': 'Terms and Policies', 'set.oss': 'Open Source Software Notice',
      'set.clearcache': 'Clear cache', 'set.version': 'Version', 'set.checkupdate': 'Check for updates',
      'set.signout': 'Sign out',
      'fx.pro': 'PRO', 'fx.pro_locked': '🔒 Pro effect — coming soon in ViraCut Pro',
      'fx.yourtext': 'Your Text', 'fx.yourtextsub': 'Write your own poetry, quote, or anything.',
      'fx.yourtextph': 'Type your text here...', 'fx.apply': 'Apply', 'fx.entertext': 'Please enter some text.',
      'set.saved': 'Saved ✓', 'set.cache_cleared': 'Cache cleared ✓',
      'set.uptodate': "You're up to date ✓", 'set.new_arrived': '🆕 New templates arrived!',
      'set.name': 'Name', 'set.save': 'Save', 'set.cancel': 'Cancel',
      'set.delete_data': 'Delete my local data', 'set.delete_confirm': 'All local data (projects, settings) will be deleted. Continue?',
      'set.fb_title': 'Send feedback', 'set.fb_ph': 'Write your feedback…', 'set.fb_send': 'Send',
      'set.terms_title': 'Terms and Policies',
      'cam.notready': 'Camera not ready.',
      'cam.failed': "Couldn't open the camera \u2014 choose from gallery.",
      'cam.noperm': 'Camera permission not granted \u2014 choose from gallery.',
      'gen.failed': 'Video failed: {e}. Please try again.'
    },
    ur: {
      'nav.home': 'ہوم', 'nav.create': 'بنائیں', 'nav.templates': 'ٹیمپلیٹس',
      'nav.projects': 'پروجیکٹس', 'nav.aitools': 'AI ٹولز', 'nav.profile': 'پروفائل',
      'tpl.title': '🎭 ٹیمپلیٹس', 'tpl.sub': 'اسٹائل چنیں → اپنی کلپس لگائیں → ویڈیو تیار۔',
      'tpl.search': 'ٹیمپلیٹس تلاش کریں…',
      'sort.trending': '🔥 ٹرینڈنگ', 'sort.new': '🆕 نئے', 'sort.popular': '❤️ مقبول',
      'sec.featured': '⭐ نمایاں', 'sec.trending_week': '🔥 اس ہفتے ٹرینڈنگ',
      'sec.newest': '🆕 جدید ترین', 'sec.loved': '❤️ سب سے پسندیدہ',
      'sec.arrivals': '📥 نئی آمد', 'sec.my': '🛠️ میرے ٹیمپلیٹس',
      'sec.count': '{n} ٹیمپلیٹس', 'sec.empty': 'کوئی ٹیمپلیٹ نہیں ملا۔',
      'creator.title': '🛠️ <b>ٹیمپلیٹ کریئیٹر</b>', 'creator.sub': 'اپنا ڈیزائن بنائیں',
      'creator.open': 'کھولیں',
      'tpl.fine': 'اصل ViraCut ڈیزائن — ٹائمڈ سینز، اسمارٹ ایفیکٹس، ٹیکسٹ اور موسیقی۔ آپ کا میڈیا آپ کے ڈیوائس پر رہتا ہے۔',
      'btn.use': 'ٹیمپلیٹ استعمال کریں', 'btn.back': '‹ واپس',
      'det.duration': '⏱️ دورانیہ', 'det.slots': '📷 میڈیا سلاٹس', 'det.music': '🎵 موسیقی',
      'det.format': '📐 فارمیٹ', 'det.category': '🗂️ کیٹیگری', 'det.required': '📷 درکار میڈیا',
      'det.by': 'از', 'det.uses': 'استعمال',
      'slot.chip': '📷 سلاٹ {n}',
      'slots.sub': '{n} فوٹو/ویڈیو لگائیں — چننے کے لیے سلاٹ پر ٹیپ کریں، بدلنے کے لیے دوبارہ ٹیپ کریں۔',
      'slots.music': '🎵 موسیقی', 'slots.upload': '＋ اپنی موسیقی لگائیں',
      'slots.quality': '⚙️ کوالٹی', 'slots.generate': '▶ ویڈیو بنائیں',
      'slots.generate_n': '▶ بنائیں ({d}/{n})',
      'slots.multi': '🖼️ سب فوٹوز ایک ساتھ منتخب کریں',
      'gen.title': '✨ آپ کی ویڈیو بن رہی ہے', 'gen.rendering': 'سینز رینڈر ہو رہے ہیں…',
      'gen.scene': 'سین {i} / {n}…',
      'res.title': '🎉 آپ کی ویڈیو تیار ہے', 'res.save': '⬇ محفوظ کریں', 'res.share': '📤 شیئر کریں',
      'res.restart': '↺ ٹیمپلیٹ دوبارہ', 'res.editmedia': '✏️ میڈیا بدلیں', 'res.edittpl': '🎬 ٹیمپلیٹ ایڈٹ کریں',
      'set.title': 'سیٹنگز', 'set.account': 'اکاؤنٹ', 'set.prefs': 'ترجیحات', 'set.about': 'فیڈبیک اور معلومات',
      'set.editprofile': 'پروفائل ایڈٹ کریں', 'set.manage': 'اکاؤنٹ مینیج کریں',
      'set.lang': 'ایپ کی زبان', 'set.ending': 'ڈیفالٹ اینڈنگ لگائیں',
      'set.ending_sub': 'ویڈیو کے آخر میں ViraCut کارڈ',
      'set.feedback': 'فیڈبیک', 'set.terms': 'شرائط و پالیسیز', 'set.oss': 'اوپن سورس نوٹس',
      'set.clearcache': 'کیش صاف کریں', 'set.version': 'ورژن', 'set.checkupdate': 'اپڈیٹس چیک کریں',
      'set.signout': 'سائن آؤٹ',
      'fx.pro': 'پرو', 'fx.pro_locked': '🔒 پرو ایفیکٹ — جلد ViraCut Pro میں',
      'fx.yourtext': 'آپ کا متن', 'fx.yourtextsub': 'اپنی شاعری، قول یا کچھ بھی لکھیں۔',
      'fx.yourtextph': 'یہاں اپنا متن لکھیں...', 'fx.apply': 'لاگو کریں', 'fx.entertext': 'براہ کرم کچھ متن درج کریں۔',
      'set.saved': 'محفوظ ہو گیا ✓', 'set.cache_cleared': 'کیش صاف ہو گیا ✓',
      'set.uptodate': 'آپ اپ ٹو ڈیٹ ہیں ✓', 'set.new_arrived': '🆕 نئے ٹیمپلیٹس آ گئے!',
      'set.name': 'نام', 'set.save': 'محفوظ کریں', 'set.cancel': 'منسوخ کریں',
      'set.delete_data': 'میرا مقامی ڈیٹا ڈیلیٹ کریں', 'set.delete_confirm': 'سارا مقامی ڈیٹا (پروجیکٹس، سیٹنگز) ڈیلیٹ ہو جائے گا۔ جاری رکھیں؟',
      'set.fb_title': 'فیڈبیک بھیجیں', 'set.fb_ph': 'اپنی رائے لکھیں…', 'set.fb_send': 'بھیجیں',
      'set.terms_title': 'شرائط و پالیسیز',
      'cam.notready': 'کیمرہ تیار نہیں ہے۔',
      'cam.failed': 'کیمرہ نہیں کھل سکا — گیلری سے منتخب کریں۔',
      'cam.noperm': 'کیمرہ کی اجازت نہیں ملی — گیلری سے منتخب کریں۔',
      'gen.failed': 'ویڈیو بنانے میں مسئلہ: {e}۔ دوبارہ کوشش کریں۔'
    }
  };
  function lang() {
    try { return localStorage.getItem(LS) || 'en'; } catch (e) { return 'en'; }
  }
  window.I18N = {
    lang: lang,
    setLang: function (l) {
      try { localStorage.setItem(LS, l); } catch (e) {}
      this.applyStatic();
    },
    t: function (key, params) {
      var l = lang();
      var s = (D[l] && D[l][key]) || D.en[key] || key;
      if (params) Object.keys(params).forEach(function (k) { s = s.split('{' + k + '}').join(params[k]); });
      return s;
    },
    applyStatic: function () {
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var k = el.getAttribute('data-i18n');
        el.textContent = window.I18N.t(k);
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
        el.placeholder = window.I18N.t(el.getAttribute('data-i18n-ph'));
      });
    }
  };
  window.t = function (k, p) { return window.I18N.t(k, p); };
})();
