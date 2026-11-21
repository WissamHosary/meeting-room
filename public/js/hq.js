(async function () {
  const { api, esc, avatar, speak, recognizer, toast, icons, KEY } = MR;
  const $ = (s) => document.querySelector(s);

  const who = await api('/api/whoami').catch(() => ({ owner: false }));
  if (!who.owner) {
    $('#locked').classList.remove('hidden');
    $('#unlockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const k = $('#unlockKey').value.trim();
      const ok = await fetch('/api/whoami', { headers: { 'x-owner-key': k } }).then((r) => r.json()).then((j) => j.owner).catch(() => false);
      if (!ok) { $('#unlockErr').classList.remove('hidden'); return; }
      try { localStorage.setItem('mr_owner_key', k); } catch {}
      location.reload();
    });
    return;
  }
  $('#app').classList.remove('hidden');

  let TEAM = [], PLACES = {}, CLIENTS = [], TASKS = [];
  const byId = (id) => TEAM.find((a) => a.id === id);
  const me = { id: 'me', name: 'Wissam', color: '#c8a46a' };
  let voiceOn = true;

  // ---------- navigation ----------
  document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('main > section').forEach((s) => s.classList.add('hidden'));
    $(`#view-${b.dataset.view}`).classList.remove('hidden');
    ({ office: renderOffice, tasks: loadTasks, meetings: loadMeetings, clients: loadClients, memory: () => { loadMemory(); loadKnowledge(); }, trends: loadFeed, settings: loadSettings, spending: loadSpending })[b.dataset.view]?.();
  }));

  // ---------- data ----------
  async function loadTeam() {
    const r = await api('/api/team');
    TEAM = r.team; PLACES = r.places;
    if (!loadTeam.langSet) { $('#lang').value = r.language === 'lebanese' ? 'ar-LB' : 'en-US'; loadTeam.langSet = true; }
    $('#brainName').textContent = r.provider === 'offline' ? 'Office brain (free, no AI key)' : `AI: ${r.provider}`;
    $('#brainPill').classList.toggle('offline', r.provider === 'offline');
    renderSeats();
    world?.update(TEAM);
  }

  // ---------- 3D office ----------
  let world = null;
  async function startWorld() {
    const W = window.World || await new Promise((res) => { addEventListener('world-ready', () => res(window.World), { once: true }); setTimeout(() => res(null), 10000); });
    try {
      if (!W) throw new Error('3D engine did not load');
      const w = W.init($('#world'), { onAgentClick: (id) => { const a = byId(id); $('#input').value = `${a.name}, `; $('#input').focus(); } });
      await w.load(TEAM);
      world = w;
      $('#worldLoading').remove();
      document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-cam]').forEach((x) => x.classList.toggle('active', x === b)); w.view(b.dataset.cam); }));
    } catch (e) {
      console.warn('3D office unavailable, using the 2D room', e);
      $('#world').classList.add('hidden'); $('#room').classList.remove('hidden');
      document.querySelector('.boardroom').style.gridTemplateRows = 'auto 1fr auto';
    }
  }
  async function loadClientsData() { CLIENTS = await api('/api/clients'); }

  // ---------- boardroom ----------
  function renderSeats() {
    const n = TEAM.length;
    $('#seats').innerHTML = TEAM.map((a, i) => {
      // spread around the ellipse, leaving the near (bottom) side open for you
      const ang = Math.PI * 0.72 + (i / (n - 1)) * Math.PI * 1.56;
      const x = 50 + Math.cos(ang) * 43, y = 60 + Math.sin(ang) * 33;
      const away = !['desk', 'boardroom'].includes(a.place);
      return `<button class="seat ${away ? 'away' : ''}" data-id="${a.id}" style="left:${x}%;top:${y}%;background:none;border:0;color:inherit" title="${esc(a.name)}, ${esc(a.role)} · ${esc(a.placeLabel)}" aria-label="Talk to ${esc(a.name)}, ${esc(a.role)}">${avatar(a)}<span class="nm">${esc(a.name)}</span><span class="rl">${esc(a.role)}</span></button>`;
    }).join('');
    document.querySelectorAll('.seat').forEach((s) => s.addEventListener('click', () => { const a = byId(s.dataset.id); $('#input').value = `${a.name}, `; $('#input').focus(); }));
  }
  const seat = (id) => document.querySelector(`.seat[data-id="${id}"]`);

  function addMsg(m, { say = false } = {}) {
    const a = m.who === 'wissam' ? me : byId(m.who) || { name: m.name };
    const mine = m.who === 'wissam';
    const links = (m.links || []).slice(0, 6).map((l) => `<a href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join('');
    const el = document.createElement('div');
    el.className = `msg ${mine ? 'me' : ''}`;
    el.innerHTML = `${avatar(a)}<div class="body" dir="auto"><div class="who"><b>${esc(a.name)}</b>${a.role ? ` · ${esc(a.role)}` : ''}</div>${esc(m.text)}${links ? `<div class="links">${links}</div>` : ''}</div>`;
    $('#chat').appendChild(el); $('#chat').scrollTop = 1e9;
    if (say && !mine && a.id) MR.speakMessage(m.id, m.text, a, { tts: m.tts, enabled: voiceOn });
  }
  MR.onSpeak((id, on) => { seat(id)?.classList.toggle('speaking', on); world?.speaking(id, on); if (on) rec?.pause(true); else setTimeout(() => rec?.pause(false), 400); });

  const socket = io();
  socket.on('connect', () => socket.emit('office:join', { key: KEY }));
  // Speak out loud ONLY when answering something you just said here, or once when a task is finished.
  let lastSent = 0;
  // After you talk over a question that's still being answered, that old answer is shown but not spoken.
  let skipNextReply = false, awaitingReply = false;
  socket.on('office:msg', (m) => {
    const fresh = Date.now() - lastSent < 90000;
    const agentReply = m.who !== 'wissam';
    if (agentReply && m.kind !== 'done') awaitingReply = false;
    const muted = agentReply && skipNextReply && m.kind !== 'done';
    if (muted) skipNextReply = false;
    addMsg(m, { say: !muted && (m.kind === 'done' || fresh) });
    if (agentReply) vc?.said(m.who, m.text);
    if (agentReply && fresh && !muted) { lastAgent = m.who; if (!voiceOn) vc?.replied(); }
  });
  socket.on('office:audio', ({ msgId, index, total, audio }) => MR.voiceArrived(msgId, audio, index, total));
  socket.on('agent:typing', ({ agentId, on }) => {
    world?.thinking(agentId, on);
    const s = seat(agentId); if (!s) return;
    s.querySelector('.typing')?.remove();
    if (on) s.insertAdjacentHTML('beforeend', '<span class="typing">…</span>');
  });
  socket.on('tasks:changed', () => { if (!$('#view-tasks').classList.contains('hidden')) loadTasks(); loadTeam(); }); // new work: they walk to their desk
  socket.on('team:changed', async () => { await loadTeam(); if (!$('#view-office').classList.contains('hidden')) renderOffice(); });

  const send = (text, interrupted) => { if (text.trim()) { lastSent = Date.now(); awaitingReply = true; socket.emit('office:say', { text, interrupted: interrupted || undefined }); } };
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); send($('#input').value); $('#input').value = ''; });
  $('#sendIcon').innerHTML = icons.send;

  // voice in / voice out
  $('#micBtn').innerHTML = icons.mic; $('#voiceBtn').innerHTML = icons.speaker;
  $('#voiceBtn').addEventListener('click', () => { voiceOn = !voiceOn; $('#voiceBtn').classList.toggle('on', voiceOn); if (!voiceOn) MR.stopAudio(); });
  // Voice chat: tap the mic once and just talk, hands-free, until you press End.
  // With no name said, you keep talking to whoever answered you last.
  const rec = null;
  let lastAgent = null;
  let vcWasThinking = false;
  const vc = MR.voiceChat({
    getLang: () => $('#lang').value,
    onInterim: (t) => { $('#vHeard').textContent = t; },
    onUtterance: (text, interrupted) => {
      const named = MR.ensureAddressed(text, TEAM) === text;
      // after an interruption, keep talking to the person you cut off
      const who = byId(interrupted?.agent) || byId(lastAgent);
      send(named || !who ? text : `${who.name}, ${text}`, interrupted && interrupted.agent ? interrupted : null);
    },
    onLevel: (v, s) => { // the orb breathes with your voice while listening
      if (s !== 'listening') { $('#vOrb').style.transform = ''; return; }
      $('#vOrb').style.transform = `scale(${1 + Math.min(0.35, v * 6)})`;
    },
    onState: (s, extra) => {
      $('#vOrb').className = `orb ${s}`;
      $('#micBtn').classList.toggle('on', s !== 'off' && s !== 'error');
      if (s === 'listening') {
        if (extra === 'barge') { skipNextReply = vcWasThinking && awaitingReply; world?.speaking(lastAgent, false); }
        $('#vState').textContent = lastAgent ? `Listening… (talking with ${byId(lastAgent).name})` : 'Listening…';
        $('#vHeard').textContent = extra === 'barge' ? 'Go ahead, I stopped.' : 'Just talk. Say a name to switch who you’re talking to.';
      }
      vcWasThinking = s === 'thinking';
      if (s === 'thinking') { $('#vState').textContent = 'Thinking…'; $('#vHeard').textContent = `You: ${extra}`; }
      if (s === 'speaking') { $('#vState').textContent = `${byId(extra)?.name || 'Agent'} is speaking… talk anytime to interrupt`; }
      if (s === 'off') $('#voicePanel').classList.add('hidden');
      if (s === 'error') { $('#voicePanel').classList.add('hidden'); toast(extra, 4000); }
    },
  });
  $('#micBtn').setAttribute('aria-label', 'Start voice chat with your team');
  $('#micBtn').addEventListener('click', () => {
    if (!vc) return toast('Voice chat needs Chrome or Edge (or Safari on iPhone).', 4000);
    if (vc.active) return vc.stop();
    voiceOn = true; $('#voiceBtn').classList.add('on');
    $('#voicePanel').classList.remove('hidden');
    vc.start();
  });
  $('#vEnd').addEventListener('click', () => vc?.stop());
  $('#lang').addEventListener('change', () => vc?.restartLang());

  // ---------- living office ----------
  function renderOffice() {
    const order = ['boardroom', 'desk', 'coffee', 'cafeteria', 'games', 'gym', 'pool', 'home'];
    $('#floors').innerHTML = order.map((p) => {
      const ppl = TEAM.filter((a) => a.place === p);
      return `<div class="card floor"><h3>${esc(PLACES[p])}</h3><div class="people">${ppl.map((a) => `<span title="${esc(a.name)}">${avatar(a)}</span>`).join('') || '<span class="sub" style="margin:0;font-size:13px">Empty</span>'}</div></div>`;
    }).join('');
    $('#teamCards').innerHTML = TEAM.map((a) => `<div class="card agent-card">${avatar(a, 'lg')}<div class="meta"><b>${esc(a.name)}</b><span>${esc(a.role)}</span><div class="where">${esc(a.placeLabel)}</div>
      <label class="hidden" for="ov-${a.id}">Move ${esc(a.name)}</label><select id="ov-${a.id}" data-id="${a.id}"><option value="">Follow routine</option>${Object.entries(PLACES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div></div>`).join('');
    document.querySelectorAll('#teamCards select').forEach((s) => s.addEventListener('change', async () => { await api('/api/override', { method: 'POST', body: { agent: s.dataset.id, place: s.value || null } }); toast(s.value ? `${byId(s.dataset.id).name} moved` : 'Back to routine'); }));
  }

  // ---------- tasks ----------
  const clientOpts = (sel, any) => (any ? `<option value="">${any}</option>` : '') + CLIENTS.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  async function loadTasks() {
    await loadClientsData();
    TASKS = await api('/api/tasks');
    $('#tAgent').innerHTML = TEAM.map((a) => `<option value="${a.id}">${esc(a.name)} · ${esc(a.role)}</option>`).join('');
    const f = $('#tFilter').value;
    $('#tClient').innerHTML = clientOpts(null, 'No client');
    $('#tFilter').innerHTML = clientOpts(f, 'All clients');
    const list = TASKS.filter((t) => !f || t.client === f);
    const cols = { todo: 'To do', doing: 'In progress', done: 'Done' };
    $('#kanban').innerHTML = Object.entries(cols).map(([k, label]) => {
      const items = list.filter((t) => t.status === k);
      return `<div class="card col"><h3>${label}<span class="pill">${items.length}</span></h3>${items.map((t) => {
        const a = byId(t.agent) || { name: '?' };
        const c = CLIENTS.find((x) => x.id === t.client);
        return `<div class="task"><div class="t">${esc(t.title)}</div><div class="m">${avatar(a)}${esc(a.name)}${c ? ` · ${esc(c.name)}` : ''}</div><div class="acts">
          ${k !== 'todo' ? `<button class="btn" data-mv="${t.id}" data-to="${k === 'done' ? 'doing' : 'todo'}">Back</button>` : ''}
          ${k !== 'done' ? `<button class="btn" data-mv="${t.id}" data-to="${k === 'todo' ? 'doing' : 'done'}">${k === 'todo' ? 'Start' : 'Mark done'}</button>` : ''}
          <button class="btn ghost" data-del="${t.id}" aria-label="Delete task">Delete</button></div></div>`;
      }).join('') || '<p class="sub" style="margin:0">Nothing here.</p>'}</div>`;
    }).join('');
    document.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/tasks/${b.dataset.mv}`, { method: 'PATCH', body: { status: b.dataset.to } }); loadTasks(); }));
    document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Delete this task?')) { await api(`/api/tasks/${b.dataset.del}`, { method: 'DELETE' }); loadTasks(); } }));
  }
  $('#tFilter').addEventListener('change', loadTasks);
  $('#taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/tasks', { method: 'POST', body: { title: $('#tTitle').value, agent: $('#tAgent').value, client: $('#tClient').value || null } });
    $('#tTitle').value = ''; loadTasks();
  });

  // ---------- meetings ----------
  async function loadMeetings() {
    await loadClientsData();
    $('#mClient').innerHTML = clientOpts(null, 'No client');
    if (!$('#mAgents').children.length) {
      $('#mAgents').innerHTML = TEAM.map((a) => `<label><input type="checkbox" value="${a.id}" ${['fadi', 'karim', 'jad'].includes(a.id) ? 'checked' : ''} ${['fadi', 'karim'].includes(a.id) ? 'disabled' : ''}>${esc(a.name)}</label>`).join('');
    }
    const ms = await api('/api/meetings');
    $('#meetList').innerHTML = ms.map((m) => {
      const c = CLIENTS.find((x) => x.id === m.client);
      const link = `${location.origin}/meet/${m.id}`;
      return `<div class="card"><div class="item"><div><b>${esc(m.title)}</b><div class="sub" style="margin:4px 0 0">${c ? esc(c.name) + ' · ' : ''}${new Date(m.at).toLocaleString()} · ${m.lines} lines · ${m.agents.map((id) => esc(byId(id)?.name || id)).join(', ')}</div></div>
        <div class="row"><button class="btn" data-copy="${esc(link)}">${icons.link}Copy invite</button><a class="btn primary" href="/meet/${m.id}" target="_blank" rel="noopener">Join</a>${m.summary || m.recordings.length ? `<button class="btn" data-open="${m.id}">Notes</button>` : ''}</div></div></div>`;
    }).join('') || '<p class="sub">No meetings yet.</p>';
    document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.copy); toast('Invite link copied'); }));
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openNotes(b.dataset.open)));
  }
  async function openNotes(id) {
    const m = await api(`/api/meetings/${id}`);
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `<div class="card" role="dialog" aria-label="Meeting notes"><div class="item"><h2 style="margin:0;font-family:var(--display);font-weight:500">${esc(m.title)}</h2><button class="btn ghost" data-x>Close</button></div>
      <h3>Karim's notes</h3><pre class="summary">${esc(m.summary || 'Not summarised yet. End the meeting to get notes.')}</pre>
      ${m.recordings.length ? `<h3>Recordings</h3>${m.recordings.map((f) => `<audio controls src="/recordings/${esc(f)}?key=${encodeURIComponent(KEY)}" style="width:100%"></audio>`).join('')}` : ''}
      <h3>Transcript</h3><div class="list">${m.transcript.map((l) => `<div class="line"><b>${esc(l.name)}:</b> ${esc(l.text)}</div>`).join('')}</div></div>`;
    d.addEventListener('click', (e) => { if (e.target === d || e.target.dataset.x !== undefined) d.remove(); });
    document.body.appendChild(d);
  }
  $('#meetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const agents = [...document.querySelectorAll('#mAgents input:checked')].map((i) => i.value);
    const m = await api('/api/meetings', { method: 'POST', body: { title: $('#mTitle').value, client: $('#mClient').value || null, agents } });
    $('#mTitle').value = '';
    navigator.clipboard?.writeText(`${location.origin}/meet/${m.id}`).catch(() => {});
    toast('Meeting created, invite link copied');
    loadMeetings();
  });

  // ---------- clients ----------
  async function loadClients() {
    await loadClientsData();
    $('#clientList').innerHTML = CLIENTS.map((c) => `<div class="card item"><div><b>${esc(c.name)}</b><div class="sub" style="margin:4px 0 0">${esc(c.notes || '')}</div></div><button class="btn ghost" data-dc="${c.id}">Remove</button></div>`).join('') || '<p class="sub">No clients yet.</p>';
    document.querySelectorAll('[data-dc]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Remove this client?')) { await api(`/api/clients/${b.dataset.dc}`, { method: 'DELETE' }); loadClients(); } }));
  }
  $('#clientForm').addEventListener('submit', async (e) => { e.preventDefault(); await api('/api/clients', { method: 'POST', body: { name: $('#cName').value, notes: $('#cNotes').value } }); $('#cName').value = $('#cNotes').value = ''; loadClients(); });

  // ---------- memory ----------
  async function loadMemory() {
    const ms = await api('/api/memories');
    $('#memList').innerHTML = ms.slice().reverse().map((m) => `<div class="card item"><div>${esc(m.text)}<div class="sub" style="margin:4px 0 0;font-size:12px">${new Date(m.at).toLocaleString()}</div></div><button class="btn ghost" data-dm="${m.id}">Forget</button></div>`).join('');
    document.querySelectorAll('[data-dm]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/memories/${b.dataset.dm}`, { method: 'DELETE' }); loadMemory(); }));
  }
  async function loadKnowledge() {
    const ks = await api('/api/knowledge');
    $('#kbList').innerHTML = ks.map((k) => `<div class="card"><div class="item"><div style="min-width:0"><b>${esc(k.title)}</b> <span class="pill" style="margin-left:6px">${k.audience === 'public' ? 'Public' : 'Internal'}</span>
      <div class="sub" dir="auto" style="margin:6px 0 0;white-space:pre-wrap">${esc(k.text)}</div></div>
      <div class="row" style="flex:none"><button class="btn" data-kaud="${k.id}" data-to="${k.audience === 'public' ? 'internal' : 'public'}">${k.audience === 'public' ? 'Make internal' : 'Make public'}</button><button class="btn ghost" data-kdel="${k.id}">Delete</button></div></div></div>`).join('') || '<p class="sub">No company knowledge yet.</p>';
    document.querySelectorAll('[data-kdel]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Delete this knowledge item?')) { await api(`/api/knowledge/${b.dataset.kdel}`, { method: 'DELETE' }); loadKnowledge(); } }));
    document.querySelectorAll('[data-kaud]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/knowledge/${b.dataset.kaud}`, { method: 'PATCH', body: { audience: b.dataset.to } }); loadKnowledge(); }));
  }
  $('#kbForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/knowledge', { method: 'POST', body: { title: $('#kbTitle').value, audience: $('#kbAud').value, text: $('#kbText').value } });
    $('#kbTitle').value = $('#kbText').value = ''; loadKnowledge();
  });
  $('#memForm').addEventListener('submit', async (e) => { e.preventDefault(); await api('/api/memories', { method: 'POST', body: { text: $('#memText').value } }); $('#memText').value = ''; loadMemory(); });

  // ---------- trends ----------
  async function loadFeed() {
    $('#feed').innerHTML = '<p class="sub">Liwaa is checking the news…</p>';
    try {
      const items = await api('/api/feed');
      $('#feed').innerHTML = items.map((i) => `<div class="card"><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a><small>${esc(i.source)} · ${esc(i.date)}</small></div>`).join('') || '<p class="sub">Nothing found.</p>';
    } catch (e) { $('#feed').innerHTML = `<p class="sub">Couldn't reach the news right now (${esc(e.message)}).</p>`; }
  }
  $('#refreshFeed').addEventListener('click', loadFeed);

  // ---------- spending ----------
  const money = (n) => (n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(4)}`);
  let tip = null;
  const showTip = (e, html) => { tip ||= Object.assign(document.createElement('div'), { className: 'tip' }); tip.innerHTML = html; document.body.appendChild(tip); tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 180)}px`; tip.style.top = `${e.clientY - 46}px`; };
  const hideTip = () => tip?.remove();
  async function refreshCreditPill() {
    try { const d = await api('/api/usage'); $('#creditPill').textContent = `Credit: ${money(Math.max(0, d.creditTotal - d.usage.usd))} left`; } catch {}
  }
  $('#creditPill').addEventListener('click', () => document.querySelector('[data-view=spending]').click());
  async function loadSpending() {
    const d = await api('/api/usage');
    const u = d.usage, left = Math.max(0, d.creditTotal - u.usd), pct = d.creditTotal ? Math.min(100, (u.usd / d.creditTotal) * 100) : 0;
    $('#spLeft').textContent = money(left);
    $('#spOf').textContent = `of ${money(d.creditTotal)} credit`;
    $('#spBar').style.width = `${pct}%`; $('#spMeter').setAttribute('aria-valuenow', pct.toFixed(1)); $('#spMeter').classList.toggle('low', pct > 80);
    $('#spUsedPct').textContent = `${pct.toFixed(pct < 1 ? 2 : 1)}% used`;
    const days = Math.ceil((new Date(`${d.creditExpires}T23:59:59`) - Date.now()) / 864e5);
    $('#spExpiry').textContent = days >= 0 ? `Expires ${new Date(d.creditExpires).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${days} days left` : 'Expired';
    const avg = u.calls ? u.usd / u.calls : 0;
    $('#spSpent').textContent = money(u.usd); $('#spCalls').textContent = u.calls.toLocaleString();
    $('#spAvg').textContent = u.calls ? money(avg) : '–';
    $('#spLeftReplies').textContent = avg ? Math.floor(left / avg).toLocaleString() : '–';
    const modelName = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' }[d.model] || d.model;
    $('#spModel').textContent = `Current model: ${modelName}`;
    // daily bars (one series, so no legend; the title names it)
    const daysArr = [...Array(14)].map((_, i) => { const dt = new Date(Date.now() - (13 - i) * 864e5); return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Beirut' }); });
    const vals = daysArr.map((k) => u.byDay[k] || { usd: 0, calls: 0 });
    const max = Math.max(...vals.map((v) => v.usd), 0.0001);
    const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
    $('#spDaily').innerHTML = [0.5, 1].map((f) => `<div class="gridline" style="bottom:${22 + f * (190 - 22)}px"><span>${money(nice * f)}</span></div>`).join('') +
      vals.map((v, i) => `<div class="b" tabindex="0" data-i="${i}" aria-label="${daysArr[i]}: ${money(v.usd)}, ${v.calls} replies"><i style="height:${(v.usd / nice) * 100}%"></i><small>${i % 2 === 1 ? daysArr[i].slice(5).replace('-', '/') : ''}</small></div>`).join('');
    $('#spDaily').querySelectorAll('.b').forEach((b) => {
      const v = vals[b.dataset.i], label = new Date(`${daysArr[b.dataset.i]}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      const html = `<b>${label}</b><br>${money(v.usd)} · ${v.calls} replies`;
      b.addEventListener('mousemove', (e) => showTip(e, html)); b.addEventListener('mouseleave', hideTip);
      b.addEventListener('focus', () => { const r = b.getBoundingClientRect(); showTip({ clientX: r.left, clientY: r.top }, html); }); b.addEventListener('blur', hideTip);
    });
    $('#spDailyTable').innerHTML = vals.map((v, i) => `${daysArr[i]}: ${money(v.usd)} (${v.calls} replies)`).join('<br>');
    // by team member
    const agents = Object.entries(u.byAgent).sort((a, b) => b[1].usd - a[1].usd);
    const amax = Math.max(...agents.map(([, v]) => v.usd), 0.0001);
    $('#spAgents').innerHTML = agents.map(([id, v]) => { const a = byId(id) || { name: { test: 'Connection tests', karim: 'Karim (notes)', other: 'Other' }[id] || id, color: '#4b2370' };
      return `<div class="hbar"><div class="who">${avatar(a)}<span>${esc(a.name)}</span></div><div class="track"><i style="width:${(v.usd / amax) * 100}%"></i></div><span class="v">${money(v.usd)} · ${v.calls}</span></div>`; }).join('') || '<p class="sub" style="margin:0">No Claude replies yet.</p>';
    const t = u.tokens;
    $('#spTokens').innerHTML = [['Read fresh (input)', t.in], ['Read from cache (90% cheaper)', t.cr], ['Saved to cache', t.cw], ['Written (replies + thinking)', t.out]]
      .map(([k, v]) => `<div class="item" style="font-size:14px"><span>${k}</span><b style="font-variant-numeric:tabular-nums">${v.toLocaleString()}</b></div>`).join('') +
      `<p class="fine" style="margin:4px 0 0">Tracking since ${u.since ? new Date(u.since).toLocaleDateString() : 'your first Claude reply'}.</p>`;
    $('#spTotal').value = d.creditTotal; $('#spExp').value = d.creditExpires;
    refreshCreditPill();
  }
  $('#spCreditForm').addEventListener('submit', async (e) => { e.preventDefault(); await api('/api/usage/credit', { method: 'POST', body: { total: $('#spTotal').value, expires: $('#spExp').value } }); toast('Credit details saved'); loadSpending(); });
  setInterval(refreshCreditPill, 60000);

  // ---------- settings ----------
  const showTest = (t) => {
    $('#sResult').innerHTML = t.ok
      ? `<span style="color:var(--ok)">Connected to ${esc(t.provider)}${t.model ? ` (${esc(t.model)})` : ''}.</span> Fadi says: “${esc(t.text)}”`
      : `<span style="color:var(--danger)">Not connected${t.provider ? ` (${esc(t.provider)})` : ''}: ${esc(t.error || 'unknown error')}</span>`;
  };
  async function loadSettings() {
    const s = await api('/api/settings');
    $('#sProvider').value = s.provider;
    $('#sLanguage').value = s.language || 'lebanese';
    $('#sClaudeModel').value = s.claudeModel || 'claude-opus-5-5';
    const now = (v, k) => (v ? `· saved ${v}${s.fromHost.includes(k) ? ' (set on server)' : ''}` : '· not set');
    $('#sCfIdNow').textContent = now(s.cfTurnId, 'CF_TURN_KEY_ID'); $('#sCfTokNow').textContent = now(s.cfTurn, 'CF_TURN_TOKEN');
    $('#sMetDomNow').textContent = s.meteredDomain ? `· ${s.meteredDomain}` : '· not set'; $('#sMetKeyNow').textContent = now(s.metered, 'METERED_API_KEY');
    $('#sGeminiNow').textContent = now(s.gemini, 'GEMINI_API_KEY');
    $('#sElevenNow').textContent = now(s.eleven, 'ELEVENLABS_API_KEY');
    $('#sAzureNow').textContent = now(s.azure, 'AZURE_SPEECH_KEY'); $('#sAzureRegionNow').textContent = s.azureRegion ? `· ${s.azureRegion}` : '· not set'; $('#sClaudeNow').textContent = now(s.claude, 'ANTHROPIC_API_KEY');
  }
  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#sResult').textContent = 'Saving and testing…';
    const body = { provider: $('#sProvider').value, language: $('#sLanguage').value, claudeModel: $('#sClaudeModel').value };
    for (const [k, id] of [['gemini', '#sGemini'], ['eleven', '#sEleven'], ['azure', '#sAzure'], ['azureRegion', '#sAzureRegion'], ['claude', '#sClaude'], ['cfTurnId', '#sCfId'], ['cfTurn', '#sCfTok'], ['meteredDomain', '#sMetDom'], ['metered', '#sMetKey']]) if ($(id).value.trim()) body[k] = $(id).value.trim();
    try {
      const r = await api('/api/settings', { method: 'POST', body });
      ['#sGemini', '#sEleven', '#sAzure', '#sAzureRegion', '#sClaude', '#sCfId', '#sCfTok', '#sMetDom', '#sMetKey'].forEach((id) => { $(id).value = ''; });
      showTest(r.test);
    } catch (err) { showTest({ ok: false, error: err.message }); }
    loadSettings(); loadTeam();
  });
  $('#sTest').addEventListener('click', async () => {
    $('#sResult').textContent = 'Testing…';
    try { showTest(await api('/api/settings/test', { method: 'POST' })); } catch (err) { showTest({ ok: false, error: err.message }); }
  });
  // Voice test: make a sample clip on the server and play it here.
  $('#sTestVoice').addEventListener('click', async () => {
    $('#sVoiceResult').textContent = 'Making a sample…';
    try {
      const r = await api('/api/voice/test', { method: 'POST' });
      if (r.ok) {
        $('#sVoiceResult').innerHTML = `<span style="color:var(--ok)">Voice works (${esc(r.provider)}, ${(r.ms / 1000).toFixed(1)}s).</span> Playing Fadi…`;
        MR.playClip(`/api/audio/${r.audio}`, byId('fadi') || { id: 'fadi' });
      } else $('#sVoiceResult').innerHTML = `<span style="color:var(--danger)">No voice: ${esc(r.lastError || 'add an ElevenLabs key above')}</span>`;
    } catch (err) { $('#sVoiceResult').textContent = err.message; }
  });
  // Ask the relay server for a relayed route from this browser: if it gives one, calls across networks will work.
  $('#sTestRelay').addEventListener('click', async () => {
    $('#sRelayResult').textContent = 'Testing…';
    try {
      const ice = await api('/api/ice');
      if (!ice.relay) { $('#sRelayResult').innerHTML = '<span style="color:var(--warn)">No relay set yet. Calls only work when people can connect directly (often fails on mobile data).</span>'; return; }
      const pc = new RTCPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: 'relay' });
      pc.createDataChannel('t'); let n = 0;
      pc.onicecandidate = (e) => { if (e.candidate) n++; };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((r) => setTimeout(r, 6000)); pc.close();
      $('#sRelayResult').innerHTML = n ? '<span style="color:var(--ok)">Relay works. Clients on any network can hear you.</span>' : '<span style="color:var(--danger)">Relay did not answer. Check the keys.</span>';
    } catch (err) { $('#sRelayResult').textContent = err.message; }
  });
  $('#sClearGemini').addEventListener('click', async () => { if (!confirm('Remove the saved Gemini key?')) return; await api('/api/settings', { method: 'POST', body: { gemini: '' } }); $('#sResult').textContent = 'Gemini key removed.'; loadSettings(); loadTeam(); });

  // ---------- start ----------
  await loadTeam();
  startWorld();
  MR.loadPortraits(TEAM);
  refreshCreditPill();
  const history = await api('/api/office');
  history.forEach((m) => addMsg(m));
  if (!history.length) addMsg({ who: 'fadi', name: 'Fadi', text: $('#lang').value === 'ar-LB'
    ? 'أهلا فيك بالمكتب يا وسيم. كل الفريق هون. نادي أي حدا باسمو، أو قلّي شو بدّك وأنا بوزّع الشغل عالشباب.'
    : "Welcome to the office, Wissam. The whole team is here. Call anyone by name, or just tell me what you need and I'll put the right people on it." });
})();
