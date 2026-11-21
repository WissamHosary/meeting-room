(async function () {
  const { api, esc, avatar, speak, recognizer, toast, icons, KEY } = MR;
  const $ = (s) => document.querySelector(s);

  const who = await api('/api/whoami').catch(() => ({ owner: false }));
  if (!who.owner) { $('#locked').classList.remove('hidden'); return; }
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
    ({ office: renderOffice, tasks: loadTasks, meetings: loadMeetings, clients: loadClients, memory: loadMemory, trends: loadFeed, settings: loadSettings })[b.dataset.view]?.();
  }));

  // ---------- data ----------
  async function loadTeam() {
    const r = await api('/api/team');
    TEAM = r.team; PLACES = r.places;
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
      const w = W.init($('#world'), { onAgentClick: (id) => { const a = byId(id); $('#input').value = `${a.name}, `; $('#input').focus(); w.summon(id); } });
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
    el.innerHTML = `${avatar(a)}<div class="body"><div class="who"><b>${esc(a.name)}</b>${a.role ? ` · ${esc(a.role)}` : ''}</div>${esc(m.text)}${links ? `<div class="links">${links}</div>` : ''}</div>`;
    $('#chat').appendChild(el); $('#chat').scrollTop = 1e9;
    if (say && !mine && a.id) speak(m.text, a, { enabled: voiceOn });
  }
  MR.onSpeak((id, on) => { seat(id)?.classList.toggle('speaking', on); world?.speaking(id, on); if (on) rec?.pause(true); else setTimeout(() => rec?.pause(false), 400); });

  const socket = io();
  socket.on('connect', () => socket.emit('office:join', { key: KEY }));
  // Speak out loud ONLY when answering something you just said here, or once when a task is finished.
  let lastSent = 0;
  socket.on('office:msg', (m) => addMsg(m, { say: m.kind === 'done' || Date.now() - lastSent < 90000 }));
  socket.on('agent:typing', ({ agentId, on }) => {
    if (on) world?.summon(agentId); // they walk to the boardroom to answer you
    world?.thinking(agentId, on);
    const s = seat(agentId); if (!s) return;
    s.querySelector('.typing')?.remove();
    if (on) s.insertAdjacentHTML('beforeend', '<span class="typing">…</span>');
  });
  socket.on('tasks:changed', () => { if (!$('#view-tasks').classList.contains('hidden')) loadTasks(); });
  socket.on('team:changed', async () => { await loadTeam(); if (!$('#view-office').classList.contains('hidden')) renderOffice(); });

  const send = (text) => { if (text.trim()) { lastSent = Date.now(); socket.emit('office:say', { text }); } };
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); send($('#input').value); $('#input').value = ''; });
  $('#sendIcon').innerHTML = icons.send;

  // voice in / voice out
  $('#micBtn').innerHTML = icons.mic; $('#voiceBtn').innerHTML = icons.speaker;
  $('#voiceBtn').addEventListener('click', () => { voiceOn = !voiceOn; $('#voiceBtn').classList.toggle('on', voiceOn); if (!voiceOn) speechSynthesis.cancel(); });
  const rec = recognizer({
    lang: $('#lang').value,
    onInterim: (t) => { $('#input').value = t; },
    onFinal: (t) => { $('#input').value = ''; send(t); },
    onState: (on, err) => { $('#micBtn').classList.toggle('on', on); if (err) toast(err); },
  });
  $('#micBtn').addEventListener('click', () => { if (!rec) return toast('Voice input needs Chrome or Edge'); rec.active ? rec.off() : rec.on(); });
  $('#lang').addEventListener('change', () => rec?.setLang($('#lang').value));

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

  // ---------- settings ----------
  const showTest = (t) => {
    $('#sResult').innerHTML = t.ok
      ? `<span style="color:var(--ok)">Connected to ${esc(t.provider)}${t.model ? ` (${esc(t.model)})` : ''}.</span> Fadi says: “${esc(t.text)}”`
      : `<span style="color:var(--danger)">Not connected${t.provider ? ` (${esc(t.provider)})` : ''}: ${esc(t.error || 'unknown error')}</span>`;
  };
  async function loadSettings() {
    const s = await api('/api/settings');
    $('#sProvider').value = s.provider;
    const now = (v, k) => (v ? `· saved ${v}${s.fromHost.includes(k) ? ' (set on server)' : ''}` : '· not set');
    $('#sGeminiNow').textContent = now(s.gemini, 'GEMINI_API_KEY'); $('#sGroqNow').textContent = now(s.groq, 'GROQ_API_KEY'); $('#sClaudeNow').textContent = now(s.claude, 'ANTHROPIC_API_KEY');
  }
  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#sResult').textContent = 'Saving and testing…';
    const body = { provider: $('#sProvider').value };
    for (const [k, id] of [['gemini', '#sGemini'], ['groq', '#sGroq'], ['claude', '#sClaude']]) if ($(id).value.trim()) body[k] = $(id).value.trim();
    const r = await api('/api/settings', { method: 'POST', body });
    ['#sGemini', '#sGroq', '#sClaude'].forEach((id) => { $(id).value = ''; });
    showTest(r.test); loadSettings(); loadTeam();
  });
  $('#sTest').addEventListener('click', async () => { $('#sResult').textContent = 'Testing…'; showTest(await api('/api/settings/test', { method: 'POST' })); });
  $('#sClearGemini').addEventListener('click', async () => { if (!confirm('Remove the saved Gemini key?')) return; await api('/api/settings', { method: 'POST', body: { gemini: '' } }); $('#sResult').textContent = 'Gemini key removed.'; loadSettings(); loadTeam(); });

  // ---------- start ----------
  await loadTeam();
  startWorld();
  MR.loadPortraits(TEAM);
  const history = await api('/api/office');
  history.forEach((m) => addMsg(m));
  if (!history.length) addMsg({ who: 'fadi', name: 'Fadi', text: "Welcome to the office, Wissam. The whole team is here. Call anyone by name, or just tell me what you need and I'll put the right people on it." });
})();
