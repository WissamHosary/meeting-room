(async function () {
  const { api, esc, avatar, speak, recognizer, toast, icons, KEY } = MR;
  const $ = (s) => document.querySelector(s);
  const meetingId = location.pathname.split('/').pop();

  let meeting, TEAM = [];
  try {
    [meeting, { team: TEAM }] = await Promise.all([api(`/api/meetings/${meetingId}`), api('/api/team')]);
  } catch (e) { $('#jTitle').textContent = /ended/i.test(e.message) ? 'This meeting has ended' : 'Meeting not found'; $('#jClient').textContent = 'Ask the host for a new invite link.'; $('#joinBtn').disabled = true; return; }
  const byId = (id) => TEAM.find((a) => a.id === id);
  const who = await api('/api/whoami').catch(() => ({ owner: false }));
  const isOwner = who.owner;

  $('#jTitle').textContent = meeting.title;
  $('#jClient').textContent = meeting.clientName ? `with ${meeting.clientName}` : '';
  $('#jName').value = isOwner ? 'Wissam' : (localStorage.getItem('mr_name') || '');

  // ---------- local media ----------
  let local = new MediaStream();
  async function getMedia() {
    for (const c of [{ audio: true, video: { width: 1280, height: 720 } }, { audio: true }]) {
      try { return await navigator.mediaDevices.getUserMedia(c); } catch {}
    }
    toast('No camera or microphone available. You can still listen and type.', 4000);
    return new MediaStream();
  }
  if (navigator.mediaDevices?.getUserMedia) { local = await getMedia(); $('#preview').srcObject = local; }
  else toast('Camera and mic need https or localhost', 4000);

  $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); try { localStorage.setItem('mr_name', $('#jName').value); } catch {} start($('#jName').value.trim()); });

  async function start(name) {
    $('#joinScreen').classList.add('hidden'); $('#meet').classList.remove('hidden');
    $('#mTitle').textContent = meeting.title;
    $('#mClient').textContent = meeting.clientName ? `Client: ${meeting.clientName}` : '';
    if (isOwner) document.querySelector('.owner-only').classList.remove('hidden');
    ['mic', 'cam', 'voice', 'rec', 'invite', 'agents', 'leave'].forEach((k) => { $(`#${k}Btn`).innerHTML = icons[{ mic: 'mic', cam: 'cam', voice: 'speaker', rec: 'rec', invite: 'link', agents: 'users', leave: 'phone' }[k]]; });
    $('#chatSend').innerHTML = icons.send;

    const socket = io();
    const peers = new Map(); // id -> { pc, name, stream, tile }
    let agents = meeting.agents.slice();
    let voiceOn = true;

    // ---------- tiles ----------
    const stage = $('#stage');
    // Some browsers block incoming sound until you tap the page: show a button when that happens.
    function needTap() {
      if (document.getElementById('tapToHear')) return;
      const b = document.createElement('button');
      b.id = 'tapToHear'; b.className = 'btn primary'; b.textContent = 'Tap to hear everyone';
      b.style.cssText = 'position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:20;min-height:52px;font-size:16px';
      b.addEventListener('click', () => { document.querySelectorAll('.tile video').forEach((v) => { if (!v.muted) v.play().catch(() => {}); }); b.remove(); });
      document.body.appendChild(b);
    }
    function setStatus(id, text) {
      const t = document.getElementById(`tile-${id}`); if (!t) return;
      let s = t.querySelector('.status');
      if (!text) { s?.remove(); return; }
      if (!s) { s = document.createElement('div'); s.className = 'status'; s.style.cssText = 'position:absolute;right:10px;top:10px;background:rgba(0,0,0,.65);padding:3px 9px;border-radius:8px;font-size:12px'; t.appendChild(s); }
      s.textContent = text;
    }
    function humanTile(id, name, stream, self) {
      let t = document.getElementById(`tile-${id}`);
      if (!t) { t = document.createElement('div'); t.className = 'tile'; t.id = `tile-${id}`; stage.prepend(t); }
      t.innerHTML = `${avatar({ name, color: '#3a4250' }, 'xl')}<video autoplay playsinline ${self ? 'muted' : ''}></video><div class="label">${esc(name)}${self ? '<small>You</small>' : ''}</div>`;
      const v = t.querySelector('video');
      if (stream && !self) { v.srcObject = stream; v.play().catch(() => needTap()); }
      if (stream) { v.srcObject = stream; const hasVideo = () => stream.getVideoTracks().some((tr) => tr.enabled && tr.readyState === 'live'); v.style.display = hasVideo() ? '' : 'none'; stream.onaddtrack = () => { v.style.display = hasVideo() ? '' : 'none'; }; }
      else v.style.display = 'none';
      return t;
    }
    function renderAgents() {
      stage.querySelectorAll('.tile.agent').forEach((t) => t.remove());
      for (const id of agents) {
        const a = byId(id); if (!a) continue;
        const t = document.createElement('div'); t.className = 'tile agent'; t.id = `agent-${id}`;
        t.innerHTML = `${avatar(a, 'xl')}<div class="label">${esc(a.name)}<small>${esc(a.role)}</small></div>`;
        stage.appendChild(t);
      }
      $('#peopleCount').textContent = `${peers.size + 1} people · ${agents.length} agents`;
    }
    humanTile('self', name, local, true);
    renderAgents();
    MR.loadPortraits(TEAM);

    // ---------- conversation ----------
    function addLine(l) {
      const el = document.createElement('div');
      el.className = `line ${l.agent ? '' : 'human'}`;
      const links = (l.links || []).slice(0, 4).map((x) => `<div><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a></div>`).join('');
      el.innerHTML = `<b>${esc(l.name)}</b>${l.via === 'voice' ? '<span class="v">voice</span>' : ''}: ${esc(l.text)}${links}`;
      $('#lines').appendChild(el); $('#lines').scrollTop = 1e9;
    }
    function caption(tile, text) {
      if (!tile) return;
      tile.querySelector('.caption')?.remove();
      tile.insertAdjacentHTML('beforeend', `<div class="caption">${esc(text)}</div>`);
      clearTimeout(tile._cap); tile._cap = setTimeout(() => tile.querySelector('.caption')?.remove(), 6000);
    }
    MR.onSpeak((id, on) => { document.getElementById(`agent-${id}`)?.classList.toggle('speaking', on); rec?.pause(on); });

    socket.on('meet:line', (l) => {
      addLine(l);
      if (l.agent) {
        const a = byId(l.agent);
        caption(document.getElementById(`agent-${l.agent}`), l.text);
        if (l.answer && !l.silent) speak(l.text, a, { enabled: voiceOn });
        if (recorder) recNote(`${l.name}: ${l.text}`);
      } else if (l.peer && l.peer !== socket.id) caption(document.getElementById(`tile-${l.peer}`), l.text);
    });
    socket.on('agent:typing', ({ agentId, on }) => {
      const t = document.getElementById(`agent-${agentId}`); if (!t) return;
      t.querySelector('.label small').textContent = on ? 'thinking…' : byId(agentId).role;
    });
    const say = (text, via) => { if (text.trim()) socket.emit('meet:say', { text, via }); };
    $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); say($('#chatInput').value, 'chat'); $('#chatInput').value = ''; });

    // live captions from your own mic -> transcript (agents only react when named)
    const rec = recognizer({
      lang: $('#lang').value,
      onFinal: (t) => say(t, 'voice'),
      onInterim: (t) => caption(document.getElementById('tile-self'), t),
      onState: (on, err) => { if (err) toast(err); },
    });
    // On phones, speech captions take the microphone away from the call, so they start OFF there.
    const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    let captionsOn = !!rec && !isPhone && local.getAudioTracks().length > 0;
    const ccBtn = document.createElement('button');
    ccBtn.className = 'btn'; ccBtn.textContent = 'Hands-free'; ccBtn.style.minHeight = '52px';
    const syncCC = () => { ccBtn.classList.toggle('on', captionsOn); ccBtn.setAttribute('aria-label', captionsOn ? 'Hands-free on: agents hear you, say their name to ask them' : 'Turn on hands-free: agents hear you and answer when you say their name'); ccBtn.title = captionsOn ? 'Hands-free on: just talk, say an agent name to ask them' : 'Hands-free off'; };
    ccBtn.addEventListener('click', () => {
      if (!rec) return toast('Live captions need Chrome or Edge. You can type to the agents instead.');
      captionsOn = !captionsOn; syncCC();
      const micOn = local.getAudioTracks()[0]?.enabled;
      if (captionsOn && micOn) rec.on(); else rec.off();
      if (captionsOn && isPhone) toast('On some phones captions can mute your mic for others. Turn CC off if they stop hearing you.', 5000);
    });
    $('#lang').before(ccBtn); syncCC();
    if (captionsOn) rec.on();

    // Push-to-talk to the agents: tap, speak one sentence, the agent answers out loud.
    const pttBtn = document.createElement('button');
    pttBtn.className = 'btn'; pttBtn.style.minHeight = '52px';
    pttBtn.innerHTML = `${icons.mic}<span>Talk to agents</span>`;
    pttBtn.setAttribute('aria-label', 'Talk to agents: tap and speak');
    let listening = false;
    pttBtn.addEventListener('click', async () => {
      if (listening) { MR.listenOnce.stop?.(); return; }
      listening = true; pttBtn.classList.add('on'); pttBtn.querySelector('span').textContent = 'Listening… tap to send';
      const wasCaptions = captionsOn && rec?.active; if (wasCaptions) rec.off();
      speechSynthesis.cancel();
      try {
        const text = await MR.listenOnce({ lang: $('#lang').value, onInterim: (t) => caption(document.getElementById('tile-self'), t) });
        if (text) say(MR.ensureAddressed(text, TEAM.filter((a) => agents.includes(a.id))), 'voice');
        else toast("Didn't catch that. Tap and try again.");
      } catch (e) { toast(e.message, 4000); }
      listening = false; pttBtn.classList.remove('on'); pttBtn.querySelector('span').textContent = 'Talk to agents';
      if (wasCaptions && local.getAudioTracks()[0]?.enabled) rec.on();
    });
    $('#lang').after(pttBtn);
    $('#lang').addEventListener('change', () => rec?.setLang($('#lang').value));

    // ---------- controls ----------
    $('#micBtn').addEventListener('click', () => {
      const tr = local.getAudioTracks()[0]; if (!tr) return toast('No microphone');
      tr.enabled = !tr.enabled; $('#micBtn').classList.toggle('on', tr.enabled); $('#micBtn').classList.toggle('off', !tr.enabled);
      tr.enabled && captionsOn ? rec?.on() : rec?.off();
    });
    $('#camBtn').addEventListener('click', () => {
      const tr = local.getVideoTracks()[0]; if (!tr) return toast('No camera');
      tr.enabled = !tr.enabled; $('#camBtn').classList.toggle('on', tr.enabled); $('#camBtn').classList.toggle('off', !tr.enabled);
      document.querySelector('#tile-self video').style.display = tr.enabled ? '' : 'none';
    });
    if (!local.getVideoTracks().length) { $('#camBtn').classList.replace('on', 'off'); }
    $('#voiceBtn').addEventListener('click', () => { voiceOn = !voiceOn; $('#voiceBtn').classList.toggle('on', voiceOn); if (!voiceOn) speechSynthesis.cancel(); });
    $('#leaveBtn').addEventListener('click', () => { if (recorder) stopRecording(); socket.disconnect(); local.getTracks().forEach((t) => t.stop()); location.href = isOwner ? '/' : 'about:blank'; });
    $('#inviteBtn').addEventListener('click', () => { navigator.clipboard.writeText(location.origin + location.pathname); toast('Invite link copied'); });
    $('#endBtn').addEventListener('click', () => { if (confirm('End the meeting and have Karim write the notes?')) { if (recorder) stopRecording(); socket.emit('meet:end'); } });
    $('#agentsBtn').addEventListener('click', () => {
      const d = document.createElement('div'); d.className = 'modal';
      d.innerHTML = `<div class="card" role="dialog" aria-label="Agents in this meeting"><h2 style="margin:0 0 12px;font-family:var(--display);font-weight:500">Agents in this meeting</h2><div class="picker">${TEAM.map((a) => `<label><input type="checkbox" value="${a.id}" ${agents.includes(a.id) ? 'checked' : ''} ${['fadi', 'karim'].includes(a.id) ? 'disabled' : ''}>${esc(a.name)} · ${esc(a.role)}</label>`).join('')}</div><div class="row" style="margin-top:16px"><button class="btn primary" data-ok>Save</button><button class="btn ghost" data-x>Cancel</button></div></div>`;
      d.addEventListener('click', (e) => {
        if (e.target.dataset.ok !== undefined) socket.emit('meet:agents', { agents: [...d.querySelectorAll('input:checked')].map((i) => i.value) });
        if (e.target === d || e.target.dataset.x !== undefined || e.target.dataset.ok !== undefined) d.remove();
      });
      document.body.appendChild(d);
    });
    socket.on('meet:agents', (list) => { agents = list; renderAgents(); });

    // ---------- recording (Karim) — mixes everyone's audio, free, in the browser ----------
    let recorder = null, chunks = [], mixCtx = null, mixDest = null;
    const mixed = new Set();
    function mixIn(stream) {
      if (!mixCtx || !stream?.getAudioTracks().length || mixed.has(stream.id)) return;
      mixed.add(stream.id); mixCtx.createMediaStreamSource(stream).connect(mixDest);
    }
    function recNote() { /* agent voices are browser speech; their words are saved in the transcript */ }
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
    socket.on('meet:recording', (on) => { $('#recBadge').classList.toggle('hidden', !on); $('#recBtn').classList.toggle('off', on); $('#recBtn').setAttribute('aria-label', on ? 'Stop recording' : 'Start recording'); });
    socket.on('meet:ended', ({ summary }) => {
      const d = document.createElement('div'); d.className = 'modal';
      d.innerHTML = `<div class="card" role="dialog" aria-label="Meeting notes"><h2 style="margin:0;font-family:var(--display);font-weight:500">Karim's notes</h2><pre class="summary">${esc(summary)}</pre><div class="row" style="margin-top:12px"><button class="btn primary" data-x>Close</button></div></div>`;
      d.addEventListener('click', (e) => { if (e.target === d || e.target.dataset.x !== undefined) d.remove(); });
      document.body.appendChild(d);
    });

    // ---------- WebRTC mesh (free, peer to peer) ----------
    const ICE = await fetch(`/api/ice?m=${encodeURIComponent(meetingId)}`, { headers: { 'x-owner-key': KEY } }).then((r) => r.json()).catch(() => ({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] }));
    function makePeer(id, peerName, initiator = false) {
      const pc = new RTCPeerConnection(ICE);
      const stream = new MediaStream();
      const p = { pc, name: peerName, stream, initiator, restarts: 0 };
      peers.set(id, p);
      if (local.getAudioTracks().length) local.getAudioTracks().forEach((t) => pc.addTrack(t, local)); else pc.addTransceiver('audio', { direction: 'recvonly' });
      if (local.getVideoTracks().length) local.getVideoTracks().forEach((t) => pc.addTrack(t, local)); else pc.addTransceiver('video', { direction: 'recvonly' });
      pc.onicecandidate = (e) => e.candidate && socket.emit('rtc:signal', { to: id, data: { candidate: e.candidate } });
      pc.ontrack = (e) => { if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track); humanTile(id, p.name, stream); mixIn(stream); };
      pc.onconnectionstatechange = async () => {
        const st = pc.connectionState;
        if (st === 'connecting' || st === 'new') setStatus(id, 'Connecting…');
        else if (st === 'connected') setStatus(id, '');
        else if (st === 'disconnected') setStatus(id, 'Reconnecting…');
        else if (st === 'failed') {
          // try once more through the relay server before giving up
          if (p.initiator && p.restarts < 2) {
            p.restarts++; setStatus(id, 'Retrying…');
            try { pc.restartIce(); await pc.setLocalDescription(await pc.createOffer({ iceRestart: true })); socket.emit('rtc:signal', { to: id, data: { sdp: pc.localDescription, name } }); } catch {}
          } else setStatus(id, "Can't connect: network blocked");
        }
      };
      humanTile(id, peerName, null);
      setStatus(id, 'Connecting…');
      renderAgents();
      return p;
    }
    function dropPeer(id) { const p = peers.get(id); if (!p) return; p.pc.close(); peers.delete(id); document.getElementById(`tile-${id}`)?.remove(); renderAgents(); }

    const join = () => socket.emit('meet:join', { meetingId, name, key: KEY });
    socket.on('connect', join);
    if (socket.connected) join();
    socket.on('meet:error', (m) => toast(m, 5000));
    socket.on('meet:welcome', async ({ peers: existing, agents: list, recording }) => {
      agents = list; renderAgents();
      $('#recBadge').classList.toggle('hidden', !recording);
      for (const ex of existing) { // newcomer calls everyone already in the room
        const p = makePeer(ex.id, ex.name, true);
        await p.pc.setLocalDescription(await p.pc.createOffer());
        socket.emit('rtc:signal', { to: ex.id, data: { sdp: p.pc.localDescription, name } });
      }
    });
    socket.on('meet:peer-joined', ({ id, name: n }) => { toast(`${n} joined`); });
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

    if (isOwner && meeting.transcript) meeting.transcript.forEach(addLine);
  }
})();
