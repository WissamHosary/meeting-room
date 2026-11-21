(async function () {
  const { api, esc, avatar, recognizer, toast, icons, KEY } = MR;
  const $ = (s) => document.querySelector(s);
  const meetingId = location.pathname.split('/').pop();
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ic = {
    ...icons,
    micOff: svg('<path d="M2 2l20 20M9 9v3a3 3 0 0 0 5 2.2M15 9.3V5a3 3 0 0 0-5.9-.7M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 11 5.7M12 19v3"/>'),
    camOff: svg('<path d="M2 2l20 20M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1M9.7 5H14a2 2 0 0 1 2 2v3.3l1 1 5-3.3v8"/>'),
    wave: svg('<path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h0"/>'),
    spark: svg('<path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
    chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    speakerOff: svg('<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>'),
  };

  // ---------- load meeting ----------
  let meeting, TEAM = [], LANG = 'lebanese';
  try {
    [meeting, { team: TEAM, language: LANG }] = await Promise.all([api(`/api/meetings/${meetingId}`), api('/api/team')]);
  } catch (e) {
    $('#lTitle').textContent = /ended/i.test(e.message) ? 'This meeting has ended' : 'Meeting not found';
    $('#lStatus').textContent = 'Unavailable'; $('#lAgentsText').textContent = 'Ask the host for a new invite link.';
    $('#joinBtn').disabled = true; return;
  }
  const byId = (id) => TEAM.find((a) => a.id === id);
  const who = await api('/api/whoami').catch(() => ({ owner: false }));
  const isOwner = who.owner;
  let agents = meeting.agents.slice();

  // ---------- lobby ----------
  $('#lTitle').textContent = meeting.title;
  if (meeting.clientName) { $('#lClient').textContent = meeting.clientName; $('#lClient').classList.remove('hidden'); }
  const renderStack = (el, max = 6) => { el.innerHTML = agents.slice(0, max).map((id) => byId(id)).filter(Boolean).map((a) => avatar(a)).join(''); };
  renderStack($('#lAgents'));
  $('#lAgentsText').textContent = agents.map((id) => byId(id)?.name).filter(Boolean).join(', ');
  $('#jName').value = isOwner ? 'Wissam' : (() => { try { return localStorage.getItem('mr_name') || ''; } catch { return ''; } })();
  $('#lobbyAvatar').textContent = ($('#jName').value || '?').slice(0, 1).toUpperCase();
  $('#jName').addEventListener('input', () => { $('#lobbyAvatar').textContent = ($('#jName').value || '?').slice(0, 1).toUpperCase(); });
  MR.loadPortraits(TEAM);

  let local = new MediaStream();
  async function getMedia() {
    for (const c of [{ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: 1280, height: 720 } }, { audio: true }]) {
      try { return await navigator.mediaDevices.getUserMedia(c); } catch {}
    }
    toast('No camera or microphone found. You can still listen and type.', 4000);
    return new MediaStream();
  }
  if (navigator.mediaDevices?.getUserMedia) local = await getMedia();
  else toast('Camera and mic need a secure (https) link', 4000);
  const hasVideo = () => local.getVideoTracks().some((t) => t.enabled);
  const syncPreview = () => { $('#preview').srcObject = local; $('#preview').style.display = hasVideo() ? '' : 'none'; $('#camOff').style.display = hasVideo() ? 'none' : ''; };
  syncPreview();
  const setBtn = (el, on, onIcon, offIcon, label) => { el.innerHTML = on ? onIcon : offIcon; el.classList.toggle('on', on); el.classList.toggle('off', !on); el.setAttribute('aria-label', `${label} ${on ? 'on' : 'off'}`); };
  const micOn = () => local.getAudioTracks()[0]?.enabled ?? false;
  setBtn($('#lMic'), micOn(), ic.mic, ic.micOff, 'Microphone');
  setBtn($('#lCam'), hasVideo(), ic.cam, ic.camOff, 'Camera');
  $('#lMic').addEventListener('click', () => { const t = local.getAudioTracks()[0]; if (!t) return toast('No microphone'); t.enabled = !t.enabled; setBtn($('#lMic'), t.enabled, ic.mic, ic.micOff, 'Microphone'); });
  $('#lCam').addEventListener('click', () => { const t = local.getVideoTracks()[0]; if (!t) return toast('No camera'); t.enabled = !t.enabled; setBtn($('#lCam'), t.enabled, ic.cam, ic.camOff, 'Camera'); syncPreview(); });

  // live mic meter (also used for "who is talking" glow in the call)
  let actx = null;
  const level = (stream) => {
    if (!stream?.getAudioTracks().length) return () => 0;
    try {
      actx ||= new AudioContext();
      const an = actx.createAnalyser(); an.fftSize = 256; actx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      return () => { an.getByteFrequencyData(buf); let s = 0; for (const v of buf) s += v; return s / buf.length / 255; };
    } catch { return () => 0; }
  };
  const lobbyLevel = level(local);
  const bars = [...document.querySelectorAll('#micMeter i')];
  let lobbyOn = true;
  (function meter() { if (!lobbyOn) return; const v = micOn() ? lobbyLevel() : 0; bars.forEach((b, i) => { b.style.height = `${4 + Math.max(0, v * 120 - i * 6) }px`; }); requestAnimationFrame(meter); })();
  document.addEventListener('click', () => actx?.resume?.(), { once: true });

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#jName').value.trim(); if (!name) return;
    try { localStorage.setItem('mr_name', name); } catch {}
    actx?.resume?.(); start(name);
  });

  // =====================================================================
  async function start(name) {
    lobbyOn = false;
    $('#lobby').classList.add('hidden'); $('#meet').classList.remove('hidden');
    $('#mTitle').textContent = meeting.title;
    if (meeting.clientName) { $('#mClient').textContent = meeting.clientName; $('#mClient').classList.remove('hidden'); }
    if (isOwner) document.querySelectorAll('.owner-only').forEach((e) => e.classList.remove('hidden'));
    $('#lang').value = LANG === 'lebanese' ? 'ar-LB' : 'en-US';
    if (window.innerWidth < 960) $('#meet').classList.add('side-closed');
    const t0 = Date.now();
    setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);

    const socket = io();
    const peers = new Map();
    let voiceOn = true;

    // ---------- 3D boardroom ----------
    let room = null;
    (async () => {
      const R = window.MeetRoom || await new Promise((r) => { addEventListener('meetroom-ready', () => r(window.MeetRoom), { once: true }); setTimeout(() => r(null), 12000); });
      try {
        if (!R) throw new Error('3D engine unavailable');
        room = R.createRoom($('#room3d'), { title: meeting.title, client: meeting.clientName || '' });
        room.setAgents(agents.map(byId).filter(Boolean));
      } catch (e) { console.warn(e); $('#stageFallback').classList.remove('hidden'); }
    })();

    // ---------- people cards (real cameras) ----------
    const levels = new Map();
    function personCard(id, pname, stream, self) {
      let c = document.getElementById(`p-${id}`);
      if (!c) { c = document.createElement('div'); c.className = `pcard${self ? ' self' : ''}`; c.id = `p-${id}`; $('#people').appendChild(c); }
      c.innerHTML = `${avatar({ name: pname, color: '#4b2370' })}<video autoplay playsinline ${self ? 'muted' : ''}></video><div class="nm">${esc(pname)}${self ? '<small>You</small>' : ''}</div>`;
      const v = c.querySelector('video');
      if (stream) {
        v.srcObject = stream;
        if (!self) v.play().catch(() => needTap());
        const showVid = () => { v.style.display = stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live') ? '' : 'none'; };
        showVid(); stream.onaddtrack = showVid;
        if (stream.getAudioTracks().length) levels.set(id, level(stream));
      } else v.style.display = 'none';
      renderPeople();
      return c;
    }
    // gold glow on whoever is talking
    setInterval(() => {
      for (const [id, fn] of levels) {
        const on = (id === 'self' ? micOn() : true) && fn() > 0.06;
        document.getElementById(`p-${id}`)?.classList.toggle('talking', on);
      }
    }, 150);
    function setStatus(id, text) {
      const c = document.getElementById(`p-${id}`); if (!c) return;
      let s = c.querySelector('.status');
      if (!text) { s?.remove(); return; }
      if (!s) { s = document.createElement('div'); s.className = 'status'; c.appendChild(s); }
      s.textContent = text;
    }
    function caption(id, text) {
      const c = document.getElementById(`p-${id}`); if (!c) return;
      c.querySelector('.caption')?.remove();
      c.insertAdjacentHTML('beforeend', `<div class="caption" dir="auto">${esc(text)}</div>`);
      clearTimeout(c._cap); c._cap = setTimeout(() => c.querySelector('.caption')?.remove(), 5000);
    }
    function needTap() {
      if (document.getElementById('tapToHear')) return;
      const b = document.createElement('button');
      b.id = 'tapToHear'; b.className = 'btn primary'; b.textContent = 'Tap to hear everyone';
      b.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:20;min-height:52px;font-size:16px';
      b.addEventListener('click', () => { document.querySelectorAll('.pcard video').forEach((v) => { if (!v.muted) v.play().catch(() => {}); }); actx?.resume?.(); b.remove(); });
      document.body.appendChild(b);
    }

    // ---------- side panel ----------
    const thinking = new Set(), talkingAgents = new Set();
    function renderPeople() {
      const humans = [{ id: 'self', name: `${name} (you)` }, ...[...peers].map(([id, p]) => ({ id, name: p.name }))];
      $('#peopleList').innerHTML = `<div class="section-label">People · ${humans.length}</div>` +
        humans.map((h) => `<div class="person-row">${avatar({ name: h.name, color: '#4b2370' })}<div class="info"><b>${esc(h.name)}</b><span>In the call</span></div></div>`).join('') +
        `<div class="section-label">AI team · ${agents.length}</div>` +
        agents.map(byId).filter(Boolean).map((a) => `<div class="person-row">${avatar(a)}<div class="info"><b>${esc(a.name)}</b><span>${talkingAgents.has(a.id) ? 'Speaking…' : thinking.has(a.id) ? 'Thinking…' : esc(a.role)}</span></div></div>`).join('');
      $('#topStack').innerHTML = [...humans.slice(0, 3).map((h) => avatar({ name: h.name, color: '#4b2370' })), ...agents.slice(0, 3).map(byId).filter(Boolean).map((a) => avatar(a))].join('');
    }
    document.querySelectorAll('.m-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.m-tabs [data-tab]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
      $('#lines').classList.toggle('hidden', b.dataset.tab !== 'chat'); $('#peopleList').classList.toggle('hidden', b.dataset.tab !== 'people');
      $('#chatForm').classList.toggle('hidden', b.dataset.tab !== 'chat');
    }));
    personCard('self', name, local, true);
    const toggleSide = () => $('#meet').classList.toggle('side-closed');
    $('#chatToggle').addEventListener('click', toggleSide); $('#sideClose').addEventListener('click', toggleSide);

    // ---------- conversation ----------
    function addLine(l) {
      $('#emptyHint')?.remove();
      const a = l.agent ? byId(l.agent) : null;
      const el = document.createElement('div');
      el.className = `bubble ${a ? 'agent' : ''} ${l.silent ? 'system' : ''}`;
      const links = (l.links || []).slice(0, 4).map((x) => `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join('');
      el.innerHTML = `${avatar(a || { name: l.name, color: '#4b2370' })}<div class="bb" dir="auto"><div class="who"><b>${esc(l.name)}</b>${a ? `<span>${esc(a.role)}</span>` : ''}${l.via === 'voice' ? '<span>· voice</span>' : ''}</div>${esc(l.text)}${links ? `<div class="links">${links}</div>` : ''}</div>`;
      $('#lines').appendChild(el); $('#lines').scrollTop = 1e9;
    }
    // film-style subtitles for agents
    let subTimer;
    function subtitle(nameText, text, holdMs = 7000) {
      $('#subtitle').innerHTML = `<b>${esc(nameText)}</b>${esc(text)}`;
      $('#subtitle').classList.add('show');
      clearTimeout(subTimer); subTimer = setTimeout(() => $('#subtitle').classList.remove('show'), holdMs);
    }
    const lastLine = new Map();
    MR.onSpeak((id, on) => {
      room?.speaking(id, on);
      if (on) { talkingAgents.add(id); const l = lastLine.get(id); if (l) subtitle(byId(id)?.name || '', l, 60000); }
      else { talkingAgents.delete(id); clearTimeout(subTimer); subTimer = setTimeout(() => $('#subtitle').classList.remove('show'), 1200); }
      renderPeople();
      rec?.pause(on);
    });

    socket.on('meet:line', (l) => {
      addLine(l);
      if (l.joined) toast(l.text, 3500);
      if (l.agent) {
        const a = byId(l.agent);
        lastLine.set(l.agent, l.text);
        if (!l.silent) subtitle(l.name, l.text);
        if (l.answer && !l.silent) MR.speakMessage(l.id, l.text, a, { tts: l.tts, enabled: voiceOn });
      } else if (l.peer && l.peer !== socket.id) caption(l.peer, l.text);
    });
    socket.on('meet:audio', ({ lineId, index, total, audio }) => MR.voiceArrived(lineId, audio, index, total));
    socket.on('agent:typing', ({ agentId, on }) => { room?.thinking(agentId, on); on ? thinking.add(agentId) : thinking.delete(agentId); renderPeople(); });
    const say = (text, via) => { if (text.trim()) socket.emit('meet:say', { text, via }); };
    $('#chatSend').innerHTML = ic.send;
    $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); say($('#chatInput').value, 'chat'); $('#chatInput').value = ''; });

    // ---------- hands-free (agents hear you; they answer when named) ----------
    // what the mic heard, shown live above the controls so you always know it understood you
    let heardTimer;
    const heard = (t, final) => {
      const el = $('#heard'); el.textContent = `${final ? 'You said' : 'Hearing'}: ${t}`; el.classList.add('show'); el.classList.toggle('final', !!final);
      clearTimeout(heardTimer); heardTimer = setTimeout(() => el.classList.remove('show'), final ? 3500 : 6000);
    };
    const rec = recognizer({
      lang: $('#lang').value,
      onFinal: (t) => { heard(t, true); say(t, 'voice'); },
      onInterim: (t) => { heard(t, false); caption('self', t); },
      onState: (on, err) => { if (err) toast(err); },
    });
    const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    // On by default whenever you have a mic. (On some phones it can mute your mic for other PEOPLE in the call,
    // so you get a heads-up when someone joins.)
    let handsFree = !!rec && local.getAudioTracks().length > 0;
    const syncHands = () => { $('#handsBtn').innerHTML = `${ic.wave}<span>${handsFree ? 'Hands-free on' : 'Hands-free'}</span>`; $('#handsBtn').classList.toggle('on', handsFree); $('#handsBtn').setAttribute('aria-pressed', handsFree); };
    $('#handsBtn').addEventListener('click', () => {
      if (!rec) return toast('Hands-free needs Chrome or Edge. You can type to the agents instead.');
      handsFree = !handsFree; syncHands();
      if (handsFree && micOn()) rec.on(); else rec.off();
      if (handsFree && isPhone) toast('On some phones hands-free can mute your mic for others. Turn it off if they stop hearing you.', 5000);
    });
    syncHands(); if (handsFree && micOn()) rec.on();

    // ---------- ask an agent (one sentence) ----------
    let listening = false;
    const syncPtt = () => { $('#pttBtn').innerHTML = `${ic.spark}<span>${listening ? 'Listening… tap to send' : 'Ask an agent'}</span>`; $('#pttBtn').classList.toggle('on', listening); };
    syncPtt();
    $('#pttBtn').addEventListener('click', async () => {
      if (listening) { MR.listenOnce.stop?.(); return; }
      listening = true; syncPtt();
      const was = handsFree && rec?.active; if (was) rec.off();
      MR.stopAudio();
      try {
        const text = await MR.listenOnce({ lang: $('#lang').value, onInterim: (t) => caption('self', t) });
        if (text) say(MR.ensureAddressed(text, TEAM.filter((a) => agents.includes(a.id))), 'voice');
        else toast("Didn't catch that. Tap and try again.");
      } catch (e) { toast(e.message, 4000); }
      listening = false; syncPtt();
      if (was && micOn()) rec.on();
    });
    $('#lang').addEventListener('change', () => rec?.setLang($('#lang').value));

    // ---------- controls ----------
    const syncMic = () => setBtn($('#micBtn'), micOn(), ic.mic, ic.micOff, 'Microphone');
    const syncCam = () => setBtn($('#camBtn'), hasVideo(), ic.cam, ic.camOff, 'Camera');
    syncMic(); syncCam();
    $('#micBtn').addEventListener('click', () => {
      const t = local.getAudioTracks()[0]; if (!t) return toast('No microphone');
      t.enabled = !t.enabled; syncMic();
      document.querySelector('#p-self .nm').innerHTML = `${esc(name)}<small>${t.enabled ? 'You' : 'Muted'}</small>`;
      if (t.enabled && handsFree) rec?.on(); else rec?.off();
    });
    $('#camBtn').addEventListener('click', () => {
      const t = local.getVideoTracks()[0]; if (!t) return toast('No camera');
      t.enabled = !t.enabled; syncCam();
      document.querySelector('#p-self video').style.display = t.enabled ? '' : 'none';
    });
    const syncVoice = () => { $('#voiceBtn').innerHTML = voiceOn ? ic.speaker : ic.speakerOff; $('#voiceBtn').classList.toggle('on', voiceOn); $('#voiceBtn').setAttribute('aria-label', `Agent voices ${voiceOn ? 'on' : 'off'}`); };
    syncVoice();
    $('#voiceBtn').addEventListener('click', () => { voiceOn = !voiceOn; syncVoice(); if (!voiceOn) MR.stopAudio(); });
    $('#chatToggle').innerHTML = ic.chat;
    $('#leaveBtn').innerHTML = ic.phone;
    $('#recBtn').innerHTML = ic.rec; $('#agentsBtn').innerHTML = ic.users;
    $('#endBtn').innerHTML = `${svg('<rect x="6" y="6" width="12" height="12" rx="2"/>')}<span>End for all</span>`; $('#endBtn').dataset.tip = 'End meeting for everyone';
    $('#leaveBtn').dataset.tip = 'Leave';
    $('#leaveBtn').addEventListener('click', () => { if (recorder) stopRecording(); socket.disconnect(); local.getTracks().forEach((t) => t.stop()); location.href = isOwner ? '/' : 'about:blank'; });
    $('#inviteBtn').addEventListener('click', () => { navigator.clipboard.writeText(location.origin + location.pathname); toast('Invite link copied'); });
    $('#endBtn').addEventListener('click', () => { if (confirm('End the meeting for everyone and have Karim write the notes?')) { if (recorder) stopRecording(); socket.emit('meet:end'); } });
    $('#agentsBtn').addEventListener('click', () => {
      const d = document.createElement('div'); d.className = 'modal';
      d.innerHTML = `<div class="card" role="dialog" aria-label="Agents in this meeting"><h2 style="margin:0 0 12px;font-weight:700">Agents in this meeting</h2><div class="picker">${TEAM.map((a) => `<label><input type="checkbox" value="${a.id}" ${agents.includes(a.id) ? 'checked' : ''} ${['fadi', 'karim'].includes(a.id) ? 'disabled' : ''}>${esc(a.name)} · ${esc(a.role)}</label>`).join('')}</div><div class="row" style="margin-top:16px"><button class="btn primary" data-ok>Save</button><button class="btn ghost" data-x>Cancel</button></div></div>`;
      d.addEventListener('click', (e) => {
        if (e.target.dataset.ok !== undefined) socket.emit('meet:agents', { agents: [...d.querySelectorAll('input:checked')].map((i) => i.value) });
        if (e.target === d || e.target.dataset.x !== undefined || e.target.dataset.ok !== undefined) d.remove();
      });
      document.body.appendChild(d);
    });
    socket.on('meet:agents', (list) => { agents = list; room?.setAgents(agents.map(byId).filter(Boolean)); renderPeople(); });

    // ---------- recording (Karim): mixes everyone's audio in the browser ----------
    let recorder = null, chunks = [], mixCtx = null, mixDest = null;
    const mixed = new Set();
    function mixIn(stream) { if (!mixCtx || !stream?.getAudioTracks().length || mixed.has(stream.id)) return; mixed.add(stream.id); mixCtx.createMediaStreamSource(stream).connect(mixDest); }
    function startRecording() {
      mixCtx = new AudioContext(); mixDest = mixCtx.createMediaStreamDestination(); mixed.clear();
      mixIn(local); peers.forEach((p) => mixIn(p.stream));
      recorder = new MediaRecorder(mixDest.stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '' });
      chunks = []; recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        const fd = new FormData(); fd.append('file', new Blob(chunks, { type: 'audio/webm' }), 'meeting.webm');
        await fetch(`/api/meetings/${meetingId}/recording`, { method: 'POST', headers: { 'x-owner-key': KEY }, body: fd }).then(() => toast('Recording saved')).catch(() => toast('Could not save recording'));
        mixCtx.close(); mixCtx = null;
      };
      recorder.start(2000);
      socket.emit('meet:record', { on: true });
    }
    function stopRecording() { if (!recorder) return; recorder.stop(); recorder = null; socket.emit('meet:record', { on: false }); }
    $('#recBtn').addEventListener('click', () => (recorder ? stopRecording() : startRecording()));
    socket.on('meet:recording', (on) => { $('#recBadge').classList.toggle('hidden', !on); $('#recBtn').classList.toggle('off', on); $('#recBtn').dataset.tip = on ? 'Stop recording' : 'Record (Karim)'; });
    socket.on('meet:ended', ({ summary }) => {
      const d = document.createElement('div'); d.className = 'modal';
      d.innerHTML = `<div class="card" role="dialog" aria-label="Meeting notes"><span class="eyebrow">Meeting ended</span><h2 style="margin:8px 0 0;font-weight:700">Karim's notes</h2><pre class="summary" dir="auto">${esc(summary)}</pre><div class="row" style="margin-top:12px"><button class="btn primary" data-x>Close</button></div></div>`;
      d.addEventListener('click', (e) => { if (e.target === d || e.target.dataset.x !== undefined) d.remove(); });
      document.body.appendChild(d);
    });

    // ---------- calls: WebRTC between people (relay when networks block direct links) ----------
    const ICE = await fetch(`/api/ice?m=${encodeURIComponent(meetingId)}`, { headers: { 'x-owner-key': KEY } }).then((r) => r.json()).catch(() => ({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] }));
    function makePeer(id, peerName, initiator = false) {
      const pc = new RTCPeerConnection(ICE);
      const stream = new MediaStream();
      const p = { pc, name: peerName, stream, initiator, restarts: 0 };
      peers.set(id, p);
      if (local.getAudioTracks().length) local.getAudioTracks().forEach((t) => pc.addTrack(t, local)); else pc.addTransceiver('audio', { direction: 'recvonly' });
      if (local.getVideoTracks().length) local.getVideoTracks().forEach((t) => pc.addTrack(t, local)); else pc.addTransceiver('video', { direction: 'recvonly' });
      pc.onicecandidate = (e) => e.candidate && socket.emit('rtc:signal', { to: id, data: { candidate: e.candidate } });
      pc.ontrack = (e) => { if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track); personCard(id, p.name, stream); mixIn(stream); };
      pc.onconnectionstatechange = async () => {
        const st = pc.connectionState;
        if (st === 'connecting' || st === 'new') setStatus(id, 'Connecting…');
        else if (st === 'connected') setStatus(id, '');
        else if (st === 'disconnected') setStatus(id, 'Reconnecting…');
        else if (st === 'failed') {
          if (p.initiator && p.restarts < 2) {
            p.restarts++; setStatus(id, 'Retrying…');
            try { pc.restartIce(); await pc.setLocalDescription(await pc.createOffer({ iceRestart: true })); socket.emit('rtc:signal', { to: id, data: { sdp: pc.localDescription, name } }); } catch {}
          } else setStatus(id, "Can't connect: network blocked");
        }
      };
      personCard(id, peerName, null);
      setStatus(id, 'Connecting…');
      return p;
    }
    function dropPeer(id) { const p = peers.get(id); if (!p) return; p.pc.close(); peers.delete(id); levels.delete(id); document.getElementById(`p-${id}`)?.remove(); renderPeople(); }

    const join = () => socket.emit('meet:join', { meetingId, name, key: KEY });
    socket.on('connect', join);
    if (socket.connected) join();
    socket.on('meet:error', (m) => toast(m, 5000));
    socket.on('meet:welcome', async ({ peers: existing, agents: list, recording }) => {
      agents = list; room?.setAgents(agents.map(byId).filter(Boolean)); renderPeople();
      $('#recBadge').classList.toggle('hidden', !recording);
      for (const ex of existing) {
        const p = makePeer(ex.id, ex.name, true);
        await p.pc.setLocalDescription(await p.pc.createOffer());
        socket.emit('rtc:signal', { to: ex.id, data: { sdp: p.pc.localDescription, name } });
      }
    });
    socket.on('meet:peer-joined', ({ name: n }) => {
      toast(`${n} joined`);
      if (isPhone && handsFree) setTimeout(() => toast('On some phones Hands-free can mute you for others. If they can’t hear you, turn Hands-free off.', 6000), 2600);
    });
    socket.on('meet:peer-left', ({ id }) => { const p = peers.get(id); if (p) toast(`${p.name} left`); dropPeer(id); });
    socket.on('rtc:signal', async ({ from, data }) => {
      let p = peers.get(from);
      if (data.sdp) {
        if (!p) p = makePeer(from, data.name || 'Guest', false);
        await p.pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') { await p.pc.setLocalDescription(await p.pc.createAnswer()); socket.emit('rtc:signal', { to: from, data: { sdp: p.pc.localDescription, name } }); }
        (p.pending || []).forEach((c) => p.pc.addIceCandidate(c).catch(() => {})); p.pending = null;
      } else if (data.candidate && p) {
        if (p.pc.remoteDescription) p.pc.addIceCandidate(data.candidate).catch(() => {}); else (p.pending ||= []).push(data.candidate);
      }
    });

    renderPeople();
    if (isOwner && meeting.transcript) meeting.transcript.forEach(addLine);
  }
})();
