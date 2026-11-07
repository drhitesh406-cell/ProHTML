/* ProHTML bookmarks — one standalone runtime shared by the HTML Reader shell and
 * every MCQ iframe (local HTML files, code-searched MCQs and custom modules).
 *
 * BOOKMARK_SETUP is deliberately self-contained: its .toString() is injected into
 * the <head> of each reader frame, where no other script from this file exists.
 * The parent window is the single source of truth; frames send small messages and
 * receive the authoritative list of saved keys, so bookmarks survive deleting the
 * custom module (or any other HTML file) they came from.
 */
(() => {
  'use strict';

  window.BOOKMARK_SETUP = function () {
    'use strict';
    var KEY = 'htmlReader.bookmarks.v1';
    var SUBJECTS = ['Anatomy','Biochemistry','Physiology','Pharmacology','Microbiology','Pathology','Community Medicine','Forensic Medicine','Ophthalmology','ENT','Anaesthesia','Dermatology','Psychiatry','Radiology','Medicine','Surgery','Orthopaedics','Paediatrics','Obstetrics & Gynaecology'];
    var ALIAS = {
      'community medicine (psm)':'Community Medicine','psm':'Community Medicine','community medicine':'Community Medicine',
      'ent':'ENT','ear nose throat':'ENT','otorhinolaryngology':'ENT',
      'obstetrics & gynaecology':'Obstetrics & Gynaecology','obstetrics and gynaecology':'Obstetrics & Gynaecology',
      'obstetrics & gynecology':'Obstetrics & Gynaecology','obg':'Obstetrics & Gynaecology','obs gynae':'Obstetrics & Gynaecology',
      'ophthalmology':'Ophthalmology','ophthal':'Ophthalmology','forensic medicine':'Forensic Medicine','forensic':'Forensic Medicine',
      'anaesthesia':'Anaesthesia','anesthesia':'Anaesthesia','anesthesiology':'Anaesthesia',
      'paediatrics':'Paediatrics','pediatrics':'Paediatrics','orthopaedics':'Orthopaedics','orthopedics':'Orthopaedics',
      'radiology':'Radiology','psychiatry':'Psychiatry','dermatology':'Dermatology','medicine':'Medicine','surgery':'Surgery',
      'pharmacology':'Pharmacology','pathology':'Pathology','microbiology':'Microbiology','physiology':'Physiology',
      'biochemistry':'Biochemistry','anatomy':'Anatomy'
    };
    /* Only used when an MCQ has no decided / unclassified subject in the review screen. */
    var KEYWORDS = [
      ['Forensic Medicine',['autopsy','postmortem','rigor mortis','forensic','poisoning','toxicology','abrasion','ligature','strangulation','diatom','thanatology']],
      ['Community Medicine',['vaccine','immunization','incidence','prevalence','epidemiol','screening test','herd immunity','sanitation','who guideline','biostatistics','odds ratio','relative risk']],
      ['Obstetrics & Gynaecology',['pregnan','gestat','placenta','uterus','cervix','eclampsia','amenorrh','fetal','foetal','labour','labor','ovarian','menstrua']],
      ['Paediatrics',['neonate','newborn','infant','child','pediatric','paediatric','kawasaki','vaccination schedule','birth weight']],
      ['Ophthalmology',['retina','cornea','glaucoma','cataract','visual acuity','conjunctiv','optic nerve','lens','intraocular']],
      ['ENT',['tympanic','otosclerosis','larynx','sinusitis','epistaxis','tonsil','hearing loss','nasal','vestibular']],
      ['Anaesthesia',['anaesthesia','anesthesia','intubation','epidural','spinal anaesthesia','ventilator','muscle relaxant','local anaesthetic']],
      ['Dermatology',['dermat','skin lesion','psoriasis','eczema','melanoma','rash','mucous membrane','pemphigus']],
      ['Psychiatry',['schizophren','depression','mania','psychosis','antidepress','delirium','dementia','anxiety disorder']],
      ['Radiology',['x-ray','ct scan','mri finding','radiograph','ultrasonograph','contrast','computed tomography','sonographic']],
      ['Orthopaedics',['fracture','dislocation','osteomyelitis','bone tumour','joint replacement','orthopaedic','ligament','arthritis']],
      ['Pharmacology',['drug of choice','adverse effect','mechanism of action','pharmacokinetic','receptor antagonist','dose','contraindication']],
      ['Pathology',['histopath','biopsy shows','staining','granuloma','necrosis','immunohistochem','morphology']],
      ['Microbiology',['bacteria','virus','culture','gram stain','organism','serotype','antibiotic sensitivity','parasite']],
      ['Biochemistry',['enzyme','amino acid','metabol','glycolysis','vitamin deficiency','hormone synthesis','lipid profile']],
      ['Physiology',['action potential','cardiac output','renal clearance','respiratory centre','reflex','homeostasis','membrane potential']],
      ['Anatomy',['nerve supply','artery arises','muscle originates','foramen','fascia','anatomical','brachial plexus']],
      ['Medicine',['diabetes','hypertension','myocardial','pneumonia','cirrhosis','anaemia','thyroid','clinical feature','diagnosis']],
      ['Surgery',['laparotomy','resection','incision','operative','postoperative','hernia','appendicectomy','cholecystectomy','surgical']]
    ];

    function norm(s) {
      return String(s == null ? '' : s)
        .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&').replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
    }
    function fnv(s, seed) {
      var h = seed >>> 0;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return ('00000000' + h.toString(16)).slice(-8);
    }
    function hash(s) { return fnv(s, 2166136261) + fnv(s, 2773677413); }
    function keyOf(question, options) {
      return 'bm_' + hash(norm(question) + '||' + (options || []).map(norm).join('||'));
    }
    function canon(s) {
      var v = String(s == null ? '' : s).trim().toLowerCase();
      if (!v || v === 'unclassified' || v === 'unknown' || v === 'other' || v === 'general') return '';
      if (ALIAS[v]) return ALIAS[v];
      for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].toLowerCase() === v) return SUBJECTS[i];
      return '';
    }
    /* Keywords are a fallback ONLY for MCQs whose review subject is undecided. */
    function classify(subject, text) {
      var c = canon(subject);
      if (c) return c;
      var t = norm(text), best = '', bestN = 0;
      for (var i = 0; i < KEYWORDS.length; i++) {
        var words = KEYWORDS[i][1], n = 0;
        for (var j = 0; j < words.length; j++) if (t.indexOf(words[j]) !== -1) n++;
        if (n > bestN) { bestN = n; best = KEYWORDS[i][0]; }
      }
      return best || 'Unclassified';
    }
    function readAll() {
      try {
        var v = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(v) ? v.filter(function (x) { return x && x.key && Array.isArray(x.options); }) : [];
      } catch (e) { return []; }
    }
    function writeAll(list) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
    }

    var isFrame = window.parent !== window;
    var saved = {};
    function stateKeys() { return Object.keys(saved); }

    function broadcast() {
      if (isFrame) return;
      var keys = readAll().map(function (b) { return b.key; });
      try {
        var fr = document.querySelector('#rframe iframe');
        if (fr && fr.contentWindow) fr.contentWindow.postMessage({type:'prohtml-bookmark:state',keys:keys}, '*');
      } catch (e) {}
      if (typeof window.onProBookmarksChanged === 'function') {
        try { window.onProBookmarksChanged(keys.length); } catch (e) {}
      }
    }
    function put(bookmark) {
      var list = readAll(), b = bookmark || {};
      b.key = b.key || keyOf(b.question, b.options);
      b.subject = classify(b.subject, b.question);
      b.savedAt = b.savedAt || Date.now();
      var i = list.findIndex(function (x) { return x.key === b.key; });
      if (i >= 0) list[i] = b; else list.push(b);
      var ok = writeAll(list);
      broadcast();
      return ok;
    }
    function remove(key) {
      var list = readAll().filter(function (b) { return b.key !== key; });
      var ok = writeAll(list);
      broadcast();
      return ok;
    }

    window.ProBookmarks = {
      key: KEY, SUBJECTS: SUBJECTS, readAll: readAll, put: put, remove: remove, broadcast: broadcast,
      keyOf: keyOf, classify: classify, canon: canon, norm: norm, hash: hash,
      contains: function (key) {
        if (isFrame) return !!saved[key];
        return readAll().some(function (b) { return b.key === key; });
      },
      toggle: function (bookmark) {
        var b = bookmark || {};
        b.key = b.key || keyOf(b.question, b.options);
        b.subject = classify(b.subject, b.question);
        b.savedAt = b.savedAt || Date.now();
        var on = !window.ProBookmarks.contains(b.key);
        if (isFrame) {
          /* Also mirror to local storage: harmless when shared, a fallback when not. */
          try {
            var list = readAll().filter(function (x) { return x.key !== b.key; });
            if (on) list.push(b);
            writeAll(list);
          } catch (e) {}
          try {
            window.parent.postMessage(on
              ? {type:'prohtml-bookmark:set', bookmark:b}
              : {type:'prohtml-bookmark:remove', key:b.key}, '*');
          } catch (e) {}
          if (on) saved[b.key] = true; else delete saved[b.key];
          refresh();
          return on;
        }
        if (on) put(b); else remove(b.key);
        return on;
      }
    };

    if (!isFrame) {
      window.addEventListener('message', function (event) {
        var d = event.data;
        if (!d || typeof d.type !== 'string' || d.type.indexOf('prohtml-bookmark:') !== 0) return;
        var fr = document.querySelector('#rframe iframe');
        if (!fr || event.source !== fr.contentWindow) return;
        if (d.type === 'prohtml-bookmark:hello') broadcast();
        else if (d.type === 'prohtml-bookmark:set' && d.bookmark) put(d.bookmark);
        else if (d.type === 'prohtml-bookmark:remove' && d.key) remove(d.key);
      });
      return;
    }

    /* ---------- Frame side: the review-section bookmark control ---------- */
    var BM_CSS = '.bm-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;margin-left:auto;border:1px solid #d9e0e4;border-radius:8px;background:#fff;color:#7b8790;cursor:pointer;flex:none;padding:0;vertical-align:middle}' +
      '.bm-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}' +
      '.bm-btn.on{color:#2d6ae3;border-color:#2d6ae3;background:#eef4ff}.bm-btn.on svg{fill:#2d6ae3}' +
      '.bm-btn:focus-visible{outline:2px solid #2d6ae3;outline-offset:2px}' +
      '.bm-line{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:0 0 8px}' +
      '.mcq-tag-row{align-items:center}';
    try {
      var style = document.createElement('style');
      style.textContent = BM_CSS;
      document.head.appendChild(style);
    } catch (e) {}

    var BM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.2L5.5 21V4.5a1 1 0 0 1 1-1z"/></svg>';

    function post(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) {} }

    function gather(btn, kind) {
      var card = btn.closest ? btn.closest('.card.rv') : null;
      var meta = window.__PROHTML_MCQ__ || null;
      var question = '', options = [], correct = -1, explanation = '', tags = [], subject = '', topic = '', code = '', source = '';
      if (meta && kind === 'lookup') {
        question = meta.question || ''; options = (meta.options || []).slice();
        correct = Number.isInteger(meta.correct) ? meta.correct : -1;
        explanation = meta.explanation || ''; subject = meta.subject || ''; topic = meta.topic || '';
        code = meta.code || ''; source = 'MCQ code search';
      } else if (card) {
        var qEl = card.querySelector('.q');
        question = qEl ? qEl.innerHTML : '';
        var opts = Array.prototype.slice.call(card.querySelectorAll('.opt'));
        options = opts.map(function (el) {
          var spans = el.querySelectorAll('span');
          var pick = null;
          for (var i = 0; i < spans.length; i++) {
            if (!spans[i].classList.contains('l') && !spans[i].classList.contains('mk')) { pick = spans[i]; break; }
          }
          return (pick || el).innerHTML;
        });
        correct = opts.findIndex(function (el) { return el.classList.contains('ok'); });
        var exs = Array.prototype.slice.call(card.querySelectorAll('.ex'));
        explanation = exs.map(function (el) {
          var c = el.cloneNode(true);
          Array.prototype.slice.call(c.querySelectorAll('.bm-btn,.bm-line')).forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
          return c.innerHTML;
        }).join('');
        tags = Array.prototype.slice.call(card.querySelectorAll('.mcq-tag')).map(function (el) { return el.textContent.trim(); });
        var sel = card.querySelector('#chedit');
        subject = sel ? sel.value : '';
        var qn = card.querySelector('.qn-row .qn');
        var txt = qn ? qn.textContent : '';
        var idm = txt.match(/\b[0-9a-f]{24}\b/) || txt.match(/\b[A-Z]{1,3}\d{4,6}\b/);
        code = idm ? idm[0] : '';
        source = document.title || 'HTML page';
      } else if (meta) {
        question = meta.question || ''; options = (meta.options || []).slice();
        correct = meta.correct; explanation = meta.explanation || '';
        subject = meta.subject || ''; topic = meta.topic || ''; code = meta.code || ''; source = 'MCQ code search';
      }
      var options4 = options.slice(0, 4);
      while (options4.length < 4) options4.push('');
      var b = {
        key: keyOf(question, options4), code: code || '', subject: classify(subject, question),
        topic: topic, question: question, options: options4,
        correct: correct >= 0 && correct < 4 ? correct : 0,
        explanation: explanation, tags: tags, source: source, savedAt: Date.now()
      };
      return b;
    }

    function refresh() {
      Array.prototype.slice.call(document.querySelectorAll('.bm-btn')).forEach(function (b) {
        var on = !!saved[b.getAttribute('data-key')];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark this MCQ');
        b.title = on ? 'Remove bookmark' : 'Bookmark this MCQ';
      });
    }

    function ensure(line, kind) {
      var btn = line.querySelector('.bm-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'bm-btn';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', 'Bookmark this MCQ');
        btn.title = 'Bookmark this MCQ';
        btn.innerHTML = BM_SVG;
        btn.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          var b = gather(btn, kind);
          var on = window.ProBookmarks.toggle(b);
          btn.setAttribute('data-key', b.key);
          refresh();
          post({type:'prohtml-bookmark:toast', saved:on});
        });
        line.appendChild(btn);
      }
      btn.setAttribute('data-key', gather(btn, kind).key);
      return btn;
    }

    function scan() {
      Array.prototype.slice.call(document.querySelectorAll('.card.rv')).forEach(function (card) {
        /* Review-runner placement: tag-chip row when the MCQ has tags, otherwise a
           right-aligned line at the start of the explanation box. Never put the
           control in the question-number row. */
        var line = card.querySelector('.mcq-tag-row');
        if (!line) {
          var exBox = card.querySelector('.ex');
          if (exBox) {
            line = exBox.querySelector('.bm-line');
            if (!line) {
              line = document.createElement('div'); line.className = 'bm-line';
              exBox.insertBefore(line, exBox.firstChild);
            }
          }
        }
        if (line) ensure(line, 'runner');
      });
      var ex = document.getElementById('explanation');
      if (ex) {
        var line = ex.querySelector('.bm-line');
        if (!line) {
          line = document.createElement('div'); line.className = 'bm-line';
          ex.insertBefore(line, ex.firstChild);
        }
        ensure(line, 'lookup');
      }
      refresh();
    }

    var pending = false;
    function schedule() {
      if (pending) return; pending = true;
      setTimeout(function () { pending = false; try { scan(); } catch (e) {} }, 0);
    }
    window.addEventListener('message', function (event) {
      if (event.source !== window.parent || !event.data || event.data.type !== 'prohtml-bookmark:state') return;
      saved = {};
      (event.data.keys || []).forEach(function (k) { saved[k] = true; });
      refresh();
    });
    try { readAll().forEach(function (b) { saved[b.key] = true; }); } catch (e) {}
    post({type:'prohtml-bookmark:hello'});

    function start() {
      try { new MutationObserver(schedule).observe(document.documentElement, {childList:true, subtree:true}); } catch (e) {}
      scan();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    if (typeof window.onProBookmarksChanged === 'function') { /* frame has no menu */ }
    void stateKeys;
  };

  /* ---------- Parent side: full-screen Bookmarks pages (not a dropdown) ---------- */
  window.ProBookmarkMenu = {
    create: function (options) {
      var store = window.ProBookmarks;
      var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
      var overlay = null, panel = null, body = null, anchor = null, restoreFocus = null, currentSubject = null, sequence = null;

      var CSS = '#bookmarkOverlay{position:fixed;inset:0;z-index:97;background:var(--lg-menu,var(--card));}' +
        '#bookmarkOverlay[hidden]{display:none}' +
        '.bm-panel{position:absolute;inset:0;max-width:900px;margin:0 auto;box-sizing:border-box;display:flex;flex-direction:column;background:var(--lg-menu,var(--card));color:var(--ink);border-left:1px solid var(--lg-edge,var(--line));border-right:1px solid var(--lg-edge,var(--line))}' +
        '.bm-head{display:flex;align-items:center;gap:10px;flex:none;padding:14px 18px;border-bottom:1px solid var(--line);background:inherit}.bm-head h2{margin:0;flex:1;text-align:center;font-size:19px;letter-spacing:-.02em}' +
        '.bm-back,.bm-close{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:22px/1 var(--ui);color:var(--mut);background:var(--lg-hover,var(--pill-on))}' +
        '.bm-back[hidden]{visibility:hidden}.bm-count{flex:none;min-width:26px;text-align:center;font-size:12px;font-weight:700;color:#fff;background:#2d6ae3;border-radius:999px;padding:3px 7px}' +
        '.bm-count[hidden]{display:none}.bm-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px 18px calc(24px + env(safe-area-inset-bottom))}' +
        '.bm-subject{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:18px 4px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);font:500 16px var(--ui);text-align:left;cursor:pointer}' +
        '.bm-subject:hover{color:#2d6ae3}.bm-chev{font-size:22px;color:var(--mut);line-height:1}' +
        '.bm-items{padding:4px 0 10px}.bm-item{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)}' +
        '.bm-open{flex:1;min-width:0;display:block;text-align:left;padding:12px 2px;background:transparent;color:var(--ink);cursor:pointer}' +
        '.bm-code{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;color:#2d6ae3;text-transform:uppercase}' +
        '.bm-snippet{display:block;margin-top:3px;font-size:13.5px;line-height:1.4;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.bm-remove{flex:none;width:30px;height:30px;border-radius:50%;font:20px/1 var(--ui);color:var(--mut);background:var(--lg-hover,var(--pill-on));cursor:pointer}' +
        '.bm-empty{padding:34px 10px;text-align:center;color:var(--mut);font:14px/1.6 var(--ui)}' +
        '.mcq-tool-pill{display:flex;align-items:center;gap:6px;flex:none;margin-top:-3px}' +
        '.bm-trigger{flex:0 0 44px;width:44px;height:44px;min-width:44px;color:var(--accent);border:1px solid var(--lg-edge,var(--line));background:var(--lg-surface,var(--card));box-shadow:var(--lg-shadow);position:relative}' +
        '.bm-trigger .i{width:21px;height:21px}.bm-trigger:hover{background:var(--lg-hover,var(--pill-on))}' +
        '.bm-trigger:focus-visible{outline:3px solid var(--accent);outline-offset:3px}' +
        '.bm-badge{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#2d6ae3;color:#fff;font:700 11px/20px var(--ui);text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.2)}' +
        '.bm-badge[hidden]{display:none}' +
        '@media(max-width:620px){.bm-panel{border:0}.bm-head{padding:12px 16px}.bm-body{padding:8px 16px calc(24px + env(safe-area-inset-bottom))}}' +
        '@media(prefers-reduced-motion:reduce){.bm-panel{animation:none}}';
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

      function plain(s) {
        return String(s == null ? '' : s)
          .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
          .replace(/&amp;/gi, '&').replace(/&[a-z#0-9]+;/gi, ' ')
          .replace(/\s+/g, ' ').trim();
      }
      function snippet(b) { return plain(b.question).slice(0, 110) || 'Bookmarked question'; }
      function toQuestion(b) {
        var opts = (b.options || []).slice(0, 4);
        while (opts.length < 4) opts.push('');
        var code = /^[A-Z]{1,8}\d{1,14}$/.test(b.code || '') ? b.code
          : 'BM' + ('000000' + (parseInt(store.hash(b.key).slice(0, 8), 16) % 1000000)).slice(-6);
        var sig = (store.hash(b.key) + store.hash(b.key + '|sig')).slice(0, 24);
        return {
          code: code, signature: sig, correct: Number.isInteger(b.correct) ? b.correct : 0,
          subject: b.subject || '', topic: b.topic || 'Bookmarks',
          question: b.question || '', options: opts, explanation: b.explanation || ''
        };
      }
      /* Full-screen page: no anchor-relative dropdown positioning. */
      function position() {
        if (!overlay || overlay.hidden) return;
        panel.style.width = ''; panel.style.maxHeight = ''; panel.style.left = ''; panel.style.top = '';
      }
      function badge(list) {
        var n = list ? list.length : store.readAll().length;
        var el = document.getElementById('bookmarkCount');
        if (el) { el.textContent = n > 99 ? '99+' : String(n); el.hidden = !n; }
        var btn = document.getElementById('bookmarkButton');
        if (btn) btn.setAttribute('aria-label', n ? 'Bookmarks (' + n + ' saved)' : 'Bookmarks');
      }
      function groupsOf(list) {
        var groups = {};
        list.forEach(function (b) { var s = b.subject || 'Unclassified'; (groups[s] = groups[s] || []).push(b); });
        var names = store.SUBJECTS.filter(function (s) { return groups[s]; });
        Object.keys(groups).sort().forEach(function (s) { if (names.indexOf(s) < 0) names.push(s); });
        return {groups: groups, names: names};
      }
      function navFor(items, index, subject) {
        return {subject: subject, index: index, total: items.length, hasNext: index + 1 < items.length};
      }
      function openBookmarkAt(items, index, subject) {
        var b = items[index];
        if (!b) return {action: 'none'};
        sequence = {subject: subject, key: b.key, index: index};
        close();
        try { options.onOpen(toQuestion(b), navFor(items, index, subject)); }
        catch (e) { options.toast('Could not open this bookmark.'); sequence = null; return {action: 'none'}; }
        return {action: 'next'};
      }
      function next() {
        if (!sequence) return {action: 'none'};
        var subject = sequence.subject, key = sequence.key;
        var grouped = groupsOf(store.readAll()), list = grouped.groups[subject] || [];
        var index = list.findIndex(function (b) { return b.key === key; });
        if (index < 0) index = Math.max(0, Math.min(sequence.index, list.length - 1));
        if (!list.length || index + 1 >= list.length) {
          sequence = null;
          return {action: 'back', subject: subject};
        }
        return openBookmarkAt(list, index + 1, subject);
      }
      function openSubject(subject) {
        if (!overlay) build();
        var grouped = groupsOf(store.readAll());
        if (!grouped.groups[subject]) subject = null;
        anchor = document.getElementById('bookmarkButton'); restoreFocus = anchor;
        if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
        sequence = null; currentSubject = subject; render();
        overlay.hidden = false;
        badge(); position();
        var backFocus = panel.querySelector('.bm-back');
        var first = backFocus && !backFocus.hidden ? backFocus : panel.querySelector('.bm-close');
        if (first) first.focus({preventScroll:true});
      }
      function render() {
        var list = store.readAll();
        badge(list);
        if (!body) return;
        var grouped = groupsOf(list), groups = grouped.groups, names = grouped.names;
        var title = overlay.querySelector('#bmTitle'), count = overlay.querySelector('#bmCount'), back = overlay.querySelector('.bm-back');
        if (!names.length) {
          currentSubject = null;
          title.textContent = 'Bookmarks'; count.hidden = true; back.hidden = true;
          body.innerHTML = '<div class="bm-empty">No bookmarks yet.<br>Open any MCQ, go to its review section and tap the bookmark icon in the explanation.<br>Bookmarks stay here even after you delete the module.</div>';
          return;
        }
        if (currentSubject && !groups[currentSubject]) currentSubject = null;
        if (currentSubject) {
          var items = groups[currentSubject];
          title.textContent = currentSubject;
          count.textContent = items.length > 99 ? '99+' : String(items.length); count.hidden = false;
          back.hidden = false;
          body.innerHTML = '<div class="bm-items">' + items.map(function (b) {
            return '<div class="bm-item"><button class="bm-open" data-k="' + esc(b.key) + '"><span class="bm-code">' + esc(b.code || 'MCQ') + (b.topic ? ' · ' + esc(b.topic) : '') + '</span><span class="bm-snippet">' + esc(snippet(b)) + '</span></button><button class="bm-remove" data-r="' + esc(b.key) + '" aria-label="Remove bookmark" title="Remove bookmark">×</button></div>';
          }).join('') + '</div>';
          Array.prototype.slice.call(body.querySelectorAll('.bm-open')).forEach(function (el, idx) {
            el.onclick = function () { openBookmarkAt(items, idx, currentSubject); };
          });
          Array.prototype.slice.call(body.querySelectorAll('.bm-remove')).forEach(function (el) {
            el.onclick = function (ev) {
              ev.stopPropagation();
              store.remove(el.getAttribute('data-r'));
              store.broadcast(); render(); options.toast('Bookmark removed.');
            };
          });
          return;
        }
        title.textContent = 'Bookmarks';
        count.textContent = list.length > 99 ? '99+' : String(list.length); count.hidden = false;
        back.hidden = true;
        body.innerHTML = names.map(function (s) {
          var items = groups[s];
          return '<button class="bm-subject" data-s="' + esc(s) + '" aria-label="Open ' + esc(s) + ' bookmarks"><span>' + esc(s) + ' (' + items.length + ')</span><span class="bm-chev" aria-hidden="true">›</span></button>';
        }).join('');
        Array.prototype.slice.call(body.querySelectorAll('.bm-subject')).forEach(function (el) {
          el.onclick = function () { currentSubject = el.getAttribute('data-s'); render(); };
        });
      }
      function build() {
        overlay = document.createElement('div'); overlay.id = 'bookmarkOverlay'; overlay.hidden = true;
        overlay.innerHTML = '<section class="bm-panel" role="dialog" aria-modal="true" aria-labelledby="bmTitle"><div class="bm-head"><button class="bm-back" type="button" aria-label="Back to subjects" hidden>‹</button><h2 id="bmTitle">Bookmarks</h2><span class="bm-count" id="bmCount" hidden>0</span><button class="bm-close" type="button" aria-label="Close bookmarks">×</button></div><div class="bm-body" id="bmBody"></div></section>';
        document.body.appendChild(overlay);
        panel = overlay.querySelector('.bm-panel'); body = overlay.querySelector('#bmBody');
        overlay.querySelector('.bm-close').onclick = function () { close(); };
        overlay.querySelector('.bm-back').onclick = function () { currentSubject = null; render(); };
        overlay.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopImmediatePropagation();
            if (currentSubject) { currentSubject = null; render(); } else close();
            return;
          }
          if (event.key !== 'Tab') return;
          var f = Array.prototype.slice.call(panel.querySelectorAll('button')).filter(function (el) { return !el.disabled && !el.hidden; });
          if (!f.length) return;
          if (event.shiftKey && document.activeElement === f[0]) { event.preventDefault(); f[f.length - 1].focus(); }
          else if (!event.shiftKey && document.activeElement === f[f.length - 1]) { event.preventDefault(); f[0].focus(); }
        }, true);
        window.addEventListener('resize', position, {passive:true});
      }
      function open(element) {
        if (!overlay) build();
        anchor = element && (element.currentTarget || element) || document.getElementById('bookmarkButton');
        restoreFocus = anchor;
        if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
        sequence = null; currentSubject = null; render();
        overlay.hidden = false;
        badge(); position();
        var first = panel.querySelector('.bm-close'); if (first) first.focus({preventScroll:true});
      }
      function close() {
        if (!overlay || overlay.hidden) return;
        if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'false');
        overlay.hidden = true; currentSubject = null;
        if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus({preventScroll:true});
      }
      window.addEventListener('storage', function (event) {
        if (event.key === store.key) { render(); badge(); }
      });
      window.onProBookmarksChanged = function () { render(); badge(); };
      badge();
      return {
        open: open, close: close, refresh: render, updateBadge: badge,
        next: next, openSubject: openSubject,
        get isOpen() { return !!overlay && !overlay.hidden; }
      };
    }
  };
})();
