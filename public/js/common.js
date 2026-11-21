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
  const femaleHint = /(female|zira|aria|jenny|samantha|susan|hazel|libby|sonia|hoda|salma|zariyah|natasha|emma|michelle|ava|layla|laila|fatima|amany|amal|noura|rana|sana|mouna|iman|reem|google uk english female|google us english)/i;
  const maleHint = /(male|david|mark|guy|george|ryan|daniel|naayf|hamed|shakir|rami|hamdan|omar|taim|moaz|jamal|bassel|ali|fahed|christopher|eric|roger|andrew|brian|google uk english male)/i;
  function pickVoice(gender, arabic, seed) {
    let pool = voices.filter((v) => (arabic ? /^ar/i.test(v.lang) : /^en/i.test(v.lang)));
    // Lebanese voices first (free in Microsoft Edge: Layla and Rami, Arabic (Lebanon))
    if (arabic && pool.some((v) => /ar-LB/i.test(v.lang) || /Leban/i.test(v.name))) pool = pool.filter((v) => /ar-LB/i.test(v.lang) || /Leban/i.test(v.name));
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
      // Never let an English voice read Arabic (it sounds like gibberish): stay quiet instead.
      if (arabic && !voices.some((v) => /^ar/i.test(v.lang))) return resolve();
      const u = new SpeechSynthesisUtterance(text.replace(/https?:\S+/g, ''));
      const seed = (agent.id || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const v = pickVoice(agent.gender, arabic, seed);
      if (v) { u.voice = v; u.lang = v.lang; } else if (arabic) u.lang = 'ar-LB';
      u.pitch = agent.gender === 'f' ? 1.05 + (seed % 3) * 0.05 : 0.9 + (seed % 3) * 0.05;
      u.rate = arabic ? 0.98 : 1.02;
      u.onstart = () => speakListeners.forEach((f) => f(agent.id, true));
      u.onend = u.onerror = () => { speakListeners.forEach((f) => f(agent.id, false)); resolve(); };
      speechSynthesis.speak(u);
    });
  }
  // Server-generated voices (work in every browser): played one after another.
  const audioQueue = []; let playing = null;
  function playClip(url, agent) {
    return new Promise((resolve) => { audioQueue.push({ url, agent, resolve }); pump(); });
  }
  function pump() {
    if (playing || !audioQueue.length) return;
    const it = audioQueue.shift();
    const a = new Audio(it.url); playing = a;
    let finished = false;
    const done = () => { if (finished) return; finished = true; if (playing === a) playing = null; speakListeners.forEach((f) => f(it.agent.id, false)); it.resolve(); pump(); };
    a.onplay = () => speakListeners.forEach((f) => f(it.agent.id, true));
    a.onended = done; a.onerror = done; a._done = done;
    a.play().catch(() => { done(); toast('Tap anywhere on the page once to turn on the team’s sound.', 4000); });
  }
  const audioBusy = () => !!playing || audioQueue.length > 0;
  function stopAudio() { audioQueue.length = 0; if (playing) { const p = playing; p.pause(); p._done?.(); } if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  const isSpeaking = () => audioBusy() || 'speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending);

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
      rec.onerror = (e) => {
        const why = speechErrorText(e.error);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'network') { want = false; onState?.(false, why); }
      };
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

  // Plain-language reasons why the browser couldn't turn your voice into text.
  function speechErrorText(code) {
    return {
      'not-allowed': 'Microphone blocked. Click the lock icon next to the address bar and allow the microphone.',
      'service-not-allowed': 'This browser blocks voice recognition. Open the link in Google Chrome or Microsoft Edge.',
      'audio-capture': 'No microphone found. Plug one in or check your sound settings.',
      network: "Voice recognition isn't available here. Open the link in Google Chrome or Microsoft Edge (it doesn't work inside the Claude app's side pane).",
    }[code] || `Voice recognition error: ${code}`;
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
      rec.onerror = (e) => { if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error)) reject(new Error(speechErrorText(e.error))); };
      rec.onend = () => resolve((finalText || last).trim());
      try { rec.start(); } catch (e) { reject(e); }
      listenOnce.stop = () => { try { rec.stop(); } catch {} };
    });
  }
  // Is what the mic heard just the agent's own voice coming back from the speakers?
  // Compares the words: mostly the agent's words means echo; different words means a real person is talking.
  const normWords = (t) => String(t || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);
  function isEcho(heard, agentText) {
    const h = normWords(heard); if (!h.length) return true;
    const said = new Set(normWords(agentText)); if (!said.size) return false;
    const fresh = h.filter((w) => !said.has(w)).length;
    return fresh < 2 || fresh / h.length < 0.45;
  }

  // ---------- cloud hearing: ElevenLabs Scribe (much better with Lebanese Arabic than the browser) ----------
  // Is cloud hearing set up on the server? (owner, or anyone in an open meeting)
  async function cloudHearing(meetingId = '') {
    try { const r = await fetch(`/api/stt?m=${encodeURIComponent(meetingId)}`, { headers: { 'x-owner-key': KEY } }); return !!(await r.json()).ready; } catch { return false; }
  }
  // Listens on the mic, cuts out each thing you say (by voice detection, with a little audio from just before
  // you started so no words are lost), and sends it to Scribe. Same on/off/setLang shape as recognizer().
  function cloudEar({ stream = null, getLang, meetingId = '', onFinal, onSpeech, onBusy, onFail, canStart = () => true }) {
    let want = false, own = null, actx = null, proc = null, src = null, floor = 0.006, chain = Promise.resolve(), failed = false;
    const RATE = 16000, PRE = 2.0; // seconds of audio kept from before you started talking
    let pre = [], preLen = 0, seg = null, loud = 0, quiet = 0, voiced = 0;
    const toWav = (chunks) => {
      const n = chunks.reduce((a, c) => a + c.length, 0), out = new DataView(new ArrayBuffer(44 + n * 2));
      const w = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
      out.setUint32(24, RATE, true); out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
      let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const v = Math.max(-1, Math.min(1, c[i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
      return new Blob([out], { type: 'audio/wav' });
    };
    function send(chunks) {
      const blob = toWav(chunks), lang = (getLang?.() || '').slice(0, 2);
      onBusy?.(true);
      chain = chain.then(async () => {
        try {
          const r = await fetch(`/api/stt?m=${encodeURIComponent(meetingId)}&lang=${lang}`, { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-owner-key': KEY }, body: blob });
          const j = await r.json().catch(() => ({}));
          if (r.ok) { if (j.text && want) onFinal?.(j.text); }
          else if (r.status === 503 || j.fallback) { if (!failed) { failed = true; onFail?.(j.error || 'cloud hearing unavailable'); } }
        } catch {}
        onBusy?.(false);
      });
    }
    function block(e) {
      if (!want) return;
      const input = e.inputBuffer.getChannelData(0), ratio = actx.sampleRate / RATE, n = Math.floor(input.length / ratio), d = new Float32Array(n);
      let sum = 0;
      for (let i = 0; i < n; i++) { const v = input[Math.floor(i * ratio)]; d[i] = v; sum += v * v; }
      const rms = Math.sqrt(sum / Math.max(1, n));
      if (!seg) {
        pre.push(d); preLen += n; while (preLen - pre[0].length > PRE * RATE) preLen -= pre.shift().length;
        loud = rms > Math.max(floor * 3, 0.012) ? loud + 1 : 0;
        if (loud < 2) { floor = floor * 0.95 + Math.min(rms, 0.05) * 0.05; return; }
        if (!canStart()) { loud = 0; return; }
        seg = pre.slice(); pre = []; preLen = 0; quiet = 0; voiced = loud; loud = 0; onSpeech?.();
        return;
      }
      seg.push(d);
      if (rms > Math.max(floor * 2, 0.008)) { quiet = 0; voiced++; } else quiet++;
      const dur = seg.reduce((a, c) => a + c.length, 0) / RATE;
      if (quiet * (n / RATE) >= 0.75 || dur > 25) { // you paused (or talked a long time): send it
        const chunks = seg; seg = null; quiet = 0;
        if (voiced >= 3) send(chunks);
      }
    }
    async function start() {
      try {
        if (!stream) own = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const s = stream || own;
        actx = new AudioContext(); await actx.resume().catch(() => {});
        src = actx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
        proc = actx.createScriptProcessor(4096, 1, 1); proc.onaudioprocess = block;
        const mute = actx.createGain(); mute.gain.value = 0;
        src.connect(proc); proc.connect(mute); mute.connect(actx.destination);
      } catch (e) { want = false; onFail?.(speechErrorText('audio-capture')); }
    }
    function teardown() { try { proc && (proc.onaudioprocess = null); src?.disconnect(); proc?.disconnect(); } catch {} actx?.close().catch(() => {}); own?.getTracks().forEach((t) => t.stop()); actx = proc = src = own = null; seg = null; pre = []; preLen = 0; }
    return {
      on() { if (!want && !failed) { want = true; start(); } },
      off() { want = false; teardown(); },
      get active() { return want; },
      get failed() { return failed; },
      setLang() {}, pause() {},
      cloud: true,
    };
  }
  // Hands-free voice conversation, like a voice assistant:
  // - listens continuously and sends what you said when you pause;
  // - while an agent thinks or speaks, an echo-cancelled mic keeps watching for YOUR voice;
  //   as soon as you talk over them they stop instantly and listen (barge-in), and they're told
  //   they were interrupted so the next answer is a natural follow-up.
  function voiceChat({ getLang, onUtterance, onState, onInterim, onLevel, cloud = false }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR && !cloud) return null;
    // cloud = ElevenLabs Scribe writes down what you say; the browser recognizer then only watches for interruptions
    let cloudOn = cloud, ear = null, srBroken = false;
    function makeEar() {
      ear = cloudEar({
        getLang, canStart: () => state === 'listening' || state === 'thinking',
        onSpeech: () => { if (state === 'listening') onInterim?.('…'); },
        onBusy: (b) => { if (b && state === 'listening' && !buffer) onInterim?.('Understanding…'); },
        onFinal: heardCloud,
        onFail: () => { ear?.off(); ear = null; cloudOn = false; if (!SR || srBroken) { stop(); onState?.('error', 'Cloud hearing stopped working. Open Settings and press Test voice.'); } else startRec(); },
      });
      ear.on();
    }
    function heardCloud(t) {
      if (!active) return;
      const agentText = lastSaid.get(speakingAgent) || '';
      if ((state === 'speaking' || Date.now() - spokeUntil < 2500) && agentText && isEcho(t, agentText)) return; // the agent's own voice
      if (state === 'speaking' || state === 'thinking') bargeIn();
      buffer += ' ' + t; onInterim?.(buffer.trim());
      clearTimeout(sendTimer); sendTimer = setTimeout(flush, 350);
    }
    let active = false, rec = null, state = 'off', buffer = '', sendTimer = null, waitTimer = null, running = false;
    let speakingAgent = null, interrupted = null; // { agent, said } when you cut someone off
    // ---- voice activity detection on an echo-cancelled mic (so the agent's own voice doesn't trigger it)
    let micStream = null, actx = null, analyser = null, buf = null, vadTimer = null, floor = 0.01, echoFloor = 0.02, loudFrames = 0;
    async function startVad() {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        actx = new AudioContext(); analyser = actx.createAnalyser(); analyser.fftSize = 1024;
        actx.createMediaStreamSource(micStream).connect(analyser); buf = new Float32Array(analyser.fftSize);
      } catch { micStream = null; }
      vadTimer = setInterval(vadTick, 40);
    }
    function stopVad() { clearInterval(vadTimer); micStream?.getTracks().forEach((t) => t.stop()); actx?.close().catch(() => {}); micStream = actx = analyser = null; }
    function level() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    }
    function vadTick() {
      const v = level(); onLevel?.(v, state);
      if (state === 'listening') { if (!buffer) floor = floor * 0.97 + Math.min(v, 0.05) * 0.03; loudFrames = 0; return; }
      if (state !== 'speaking' && state !== 'thinking') { loudFrames = 0; return; }
      // while the agent talks, learn how much of its voice still leaks through, and require you to be clearly louder
      if (state === 'speaking' && loudFrames === 0) echoFloor = echoFloor * 0.95 + v * 0.05;
      const threshold = state === 'speaking' ? Math.max(floor * 4, echoFloor * 2.4, 0.03) : Math.max(floor * 3.5, 0.022);
      loudFrames = v > threshold ? loudFrames + 1 : Math.max(0, loudFrames - 1);
      if (loudFrames >= (state === 'speaking' ? 8 : 6)) bargeIn(); // ~300ms of your voice
    }
    function bargeIn() {
      loudFrames = 0;
      if (state === 'speaking') interrupted = { agent: speakingAgent, said: lastSaid.get(speakingAgent) || '' };
      cancelVoices(); // stop playback and drop any reply still on its way
      buffer = ''; set('listening', 'barge'); startRec();
    }
    const lastSaid = new Map();
    let spokeUntil = 0; // right after an agent stops, ignore the tail of its own voice
    const set = (s, extra) => { state = s; onState?.(s, extra); };
    function startRec() {
      if (!active || running || !SR || srBroken) return;
      rec = new SR(); rec.lang = getLang(); rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e) => {
        if (state === 'speaking' || state === 'thinking' || (state === 'listening' && Date.now() - spokeUntil < 2500)) {
          let heard = '', finals = '';
          for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; heard += ' ' + t; if (e.results[i].isFinal) finals += ' ' + t; }
          const agentText = lastSaid.get(speakingAgent) || '';
          if (state !== 'listening' || agentText) {
            if (isEcho(heard, state === 'thinking' ? '' : agentText)) return; // just the agent's voice: ignore
            if (state !== 'listening') { bargeIn(); buffer = cloudOn ? '' : finals; onInterim?.(cloudOn ? '…' : heard.trim()); return; } // a person talking: stop and listen (keep their words)
          }
        }
        if (state !== 'listening' || cloudOn) return; // with cloud hearing, Scribe writes down what you say
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) buffer += ' ' + t; else interim += t; }
        onInterim?.((buffer + ' ' + interim).trim());
        clearTimeout(sendTimer);
        if (buffer.trim() && !interim.trim()) sendTimer = setTimeout(flush, 800); // you paused
      };
      rec.onerror = (e) => {
        if (!['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error)) return;
        srBroken = true; if (cloudOn) return; // cloud hearing still works without the browser recognizer
        stop(); onState?.('error', speechErrorText(e.error));
      };
      rec.onend = () => { running = false; if (active && state !== 'off') setTimeout(startRec, 150); };
      try { rec.start(); running = true; } catch {}
    }
    const stopRec = () => { try { rec?.abort(); } catch {} running = false; };
    function flush() {
      const text = buffer.trim(); buffer = '';
      if (!text || !active) return;
      set('thinking', text); // keep listening: talking again while they think switches to your new question
      const info = interrupted; interrupted = null;
      onUtterance(text, info);
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => { if (state === 'thinking') resume(); }, 45000);
    }
    function resume() {
      if (!active) return;
      clearTimeout(waitTimer);
      if (audioBusy() || pendingVoice.size || ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending))) return;
      buffer = ''; set('listening'); startRec();
    }
    speakListeners.add((id, on) => {
      if (!active) return;
      if (on) { speakingAgent = id; set('speaking', id); startRec(); } // keep listening while they talk, so you can cut in
      else if (state === 'speaking') { spokeUntil = Date.now(); setTimeout(resume, 350); }
    });
    function stop() { active = false; clearTimeout(sendTimer); clearTimeout(waitTimer); stopRec(); stopVad(); ear?.off(); ear = null; set('off'); }
    return {
      async start() { if (active) return; active = true; buffer = ''; set('listening'); startRec(); if (cloudOn) makeEar(); await startVad(); },
      get cloud() { return cloudOn; },
      setCloud(on) { cloudOn = !!on; },
      stop,
      get active() { return active; },
      get state() { return state; },
      replied() { if (active && state === 'thinking') setTimeout(resume, 300); },
      said(agentId, text) { lastSaid.set(agentId, text); }, // remember what each agent said, for interruptions
      restartLang() { if (active) { stopRec(); if (state === 'listening') startRec(); } },
    };
  }
  // Stop any agent voice right now and drop replies that haven't started playing yet.
  function cancelVoices() {
    for (const [, p] of pendingVoice) clearTimeout(p.timer);
    pendingVoice.clear();
    for (const [, e] of earlyAudio) clearTimeout(e.timer);
    earlyAudio.clear();
    stopAudio();
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

  // Speak an agent message: wait for the server voice (if it's coming), else use the browser voice.
  const pendingVoice = new Map();
  function speakMessage(id, text, agent, { tts, enabled = true } = {}) {
    if (!enabled) return;
    // A natural voice in this browser for this language (e.g. Microsoft Edge's Lebanese voices) speaks instantly.
    const arabic = /[؀-ۿ]/.test(text);
    const local = voices.length ? pickVoice(agent.gender, arabic, 0) : null;
    const goodLocal = local && (!arabic || /^ar/i.test(local.lang)) && /natural|online|neural/i.test(local.name);
    if (!tts || goodLocal) { earlyAudio.delete(id); return speak(text, agent); }
    const timer = setTimeout(() => { pendingVoice.delete(id); speak(text, agent); }, 25000);
    pendingVoice.set(id, { text, agent, timer });
    // the first sentence's voice may have arrived before the text did: play it now
    const early = earlyAudio.get(id);
    if (early) { earlyAudio.delete(id); clearTimeout(early.timer); early.list.forEach((x) => voiceArrived(id, x.audio, x.index, x.total)); }
  }
  let noVoiceShown = 0;
  function noVoiceNotice() {
    if (Date.now() - noVoiceShown < 120000) return; noVoiceShown = Date.now();
    toast("Agents can't speak right now: the voice service didn't answer. The owner can check Settings → Voices → Test voice.", 6000);
  }
  // Voice pieces that arrive before their message is shown wait here (up to a minute).
  const earlyAudio = new Map();
  // Voice comes in pieces (first sentence first); play them strictly in order as they arrive.
  function voiceArrived(id, audio, index = 0, total = 1) {
    const p = pendingVoice.get(id);
    if (!p) {
      const e = earlyAudio.get(id) || { list: [], timer: setTimeout(() => earlyAudio.delete(id), 60000) };
      e.list.push({ audio, index, total }); earlyAudio.set(id, e);
      return;
    }
    clearTimeout(p.timer);
    p.got ||= {}; p.got[index] = audio || 'fail'; p.next ||= 0;
    while (p.got[p.next] !== undefined) {
      const a = p.got[p.next];
      if (p.abandoned) { p.next++; continue; }
      if (a === 'fail') {
        if (p.next === 0) { // the voice service failed: read the whole reply with the browser's voice instead
          p.abandoned = true;
          const arabic = /[؀-ۿ]/.test(p.text);
          if (arabic && !voices.some((v) => /^ar/i.test(v.lang))) noVoiceNotice();
          else speak(p.text, p.agent);
        }
      } else playClip(`/api/audio/${a}`, p.agent);
      p.next++;
    }
    if (p.next >= total) pendingVoice.delete(id);
    else p.timer = setTimeout(() => pendingVoice.delete(id), 30000);
  }

  window.MR = { KEY, api, esc, avatar, loadPortraits, listenOnce, ensureAddressed, voiceChat, cancelVoices, isEcho, playClip, stopAudio, speakMessage, voiceArrived, speak, isSpeaking, onSpeak: (f) => speakListeners.add(f), recognizer, cloudHearing, cloudEar, toast, icons };
})();
