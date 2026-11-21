// Shared helpers: owner key, API, avatars, voices (free browser speech), speech recognition.
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get('key')) { try { localStorage.setItem('mr_owner_key', params.get('key')); } catch {} history.replaceState(null, '', location.pathname); }
  const KEY = (() => { try { return localStorage.getItem('mr_owner_key') || ''; } catch { return ''; } })();

  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-owner-key': KEY, ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  // Drop a realistic photo at /avatars/<id>.jpg and it is used automatically.
  const portraits = {};
  function avatar(person, cls = '') {
    const color = person.color || '#5b6470';
    const src = person.id && (person.photo ? `/avatars/${person.id}.jpg` : portraits[person.id]);
    const img = src ? `<img src="${esc(src)}" alt="">` : '';
    return `<div class="avatar ${cls}" data-pid="${esc(person.id || '')}" style="--c:${esc(color)}" aria-hidden="true">${esc(initials(person.name || '?'))}${img}</div>`;
  }
  function setPortrait(id, url) {
    portraits[id] = url;
    document.querySelectorAll(`.avatar[data-pid="${id}"]`).forEach((el) => { const i = el.querySelector('img'); if (i) i.src = url; else el.insertAdjacentHTML('beforeend', `<img src="${url}" alt="">`); });
  }
  // Render every agent's 3D character as their profile picture
  async function loadPortraits(team) {
    const C = window.Characters || await new Promise((r) => { addEventListener('characters-ready', () => r(window.Characters), { once: true }); setTimeout(() => r(null), 12000); });
    if (!C) return;
    for (const a of team) {
      if (!a.look || a.photo) continue;
      try { setPortrait(a.id, C.portrait(a.look)); } catch (e) { console.warn('portrait failed', a.id, e); }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ---------- voices ----------
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  const femaleHint = /(female|zira|aria|jenny|samantha|susan|hazel|libby|sonia|hoda|salma|zariyah|natasha|emma|michelle|ava|google uk english female|google us english)/i;
  const maleHint = /(male|david|mark|guy|george|ryan|daniel|naayf|hamed|shakir|christopher|eric|roger|andrew|brian|google uk english male)/i;
  function pickVoice(gender, arabic, seed) {
    const pool = voices.filter((v) => (arabic ? /^ar/i.test(v.lang) : /^en/i.test(v.lang)));
    if (!pool.length) return null;
    const g = pool.filter((v) => (gender === 'f' ? femaleHint.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, '')) : maleHint.test(v.name) && !femaleHint.test(v.name)));
    // Prefer human-sounding neural voices (free in Microsoft Edge: "... Online (Natural)")
    const natural = (l) => l.filter((v) => /natural|neural|online/i.test(v.name));
    const list = natural(g).length ? natural(g) : g.length ? g : natural(pool).length ? natural(pool) : pool;
    return list[seed % list.length];
  }
  const speakListeners = new Set();
  function speak(text, agent, { enabled = true } = {}) {
    return new Promise((resolve) => {
      if (!enabled || !('speechSynthesis' in window) || !text) return resolve();
      const arabic = /[؀-ۿ]/.test(text);
      const u = new SpeechSynthesisUtterance(text.replace(/https?:\S+/g, ''));
      const seed = (agent.id || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const v = pickVoice(agent.gender, arabic, seed);
      if (v) { u.voice = v; u.lang = v.lang; } else if (arabic) u.lang = 'ar-LB';
      u.pitch = agent.gender === 'f' ? 1.05 + (seed % 3) * 0.05 : 0.9 + (seed % 3) * 0.05;
      u.rate = 1.02;
      u.onstart = () => speakListeners.forEach((f) => f(agent.id, true));
      u.onend = u.onerror = () => { speakListeners.forEach((f) => f(agent.id, false)); resolve(); };
      speechSynthesis.speak(u);
    });
  }
  const isSpeaking = () => 'speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending);

  // ---------- speech recognition (free in Chrome / Edge) ----------
  function recognizer({ lang = 'en-US', onFinal, onInterim, onState }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let want = false, rec = null, paused = false;
    const start = () => {
      rec = new SR(); rec.lang = lang; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e) => {
        if (paused) return;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.trim();
          if (!t) continue;
          if (e.results[i].isFinal) onFinal?.(t); else onInterim?.(t);
        }
      };
      rec.onend = () => { if (want) setTimeout(() => { try { start(); } catch {} }, 250); else onState?.(false); };
      rec.onerror = (e) => { if (e.error === 'not-allowed') { want = false; onState?.(false, 'Microphone permission denied'); } };
      rec.start(); onState?.(true);
    };
    return {
      on() { if (!want) { want = true; start(); } },
      off() { want = false; try { rec?.stop(); } catch {} },
      get active() { return want; },
      setLang(l) { lang = l; if (want) { try { rec.stop(); } catch {} } },
      pause(p) { paused = p; },
    };
  }

  // Push-to-talk: listen for one sentence, resolve with the text ('' if nothing was heard).
  function listenOnce({ lang = 'en-US', onInterim } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return Promise.reject(new Error('Voice needs Chrome or Edge (or Safari on iPhone)'));
    return new Promise((resolve, reject) => {
      const rec = new SR(); rec.lang = lang; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
      let finalText = '', last = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; }
        last = (finalText + interim).trim(); onInterim?.(last);
      };
      rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') reject(new Error('Microphone permission denied')); };
      rec.onend = () => resolve((finalText || last).trim());
      try { rec.start(); } catch (e) { reject(e); }
      listenOnce.stop = () => { try { rec.stop(); } catch {} };
    });
  }
  // If nobody is named, address the manager so someone always answers a push-to-talk question.
  function ensureAddressed(text, team) {
    const low = text.toLowerCase();
    const named = team.some((a) => (a.aliases || [a.name.toLowerCase()]).some((al) => (/[؀-ۿ]/.test(al) ? low.includes(al) : new RegExp(`(^|[^a-z])${al}([^a-z]|$)`, 'i').test(low))));
    return named ? text : `Fadi, ${text}`;
  }

  function toast(text, ms = 2600) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  }

  const icons = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A20 20 0 0 1 2.3 4.2 2 2 0 0 1 4.3 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.7" transform="rotate(135 12 12)"/></svg>',
  };

  window.MR = { KEY, api, esc, avatar, loadPortraits, listenOnce, ensureAddressed, speak, isSpeaking, onSpeak: (f) => speakListeners.add(f), recognizer, toast, icons };
})();
