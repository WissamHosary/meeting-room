require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const multer = require('multer');
const { Server } = require('socket.io');

const store = require('./store');
const settings = require('./settings');
const { team, places } = require('./team');
const brain = require('./brain');

const PORT = Number(process.env.PORT || 3000);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });
app.use(express.json({ limit: '2mb' }));

// ---------- owner key (only you can open HQ and control things) ----------
const KEY_FILE = path.join(store.DATA_DIR, 'owner.key');
const OWNER_KEY = process.env.OWNER_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : (() => { const k = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(KEY_FILE, k); return k; })());
const isOwnerKey = (k) => typeof k === 'string' && k.length === OWNER_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(OWNER_KEY));
const owner = (req, res, next) => (isOwnerKey(req.get('x-owner-key')) ? next() : res.status(401).json({ error: 'owner key required' }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/meet/:id', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'meet.html')));

// ---------- REST API ----------
const hasPhoto = (id) => fs.existsSync(path.join(__dirname, '..', 'public', 'avatars', `${id}.jpg`));
const hasModel = (id) => fs.existsSync(path.join(__dirname, '..', 'public', 'models', `${id}.glb`));
const teamView = () => team.map((a) => ({ look: a.look, photo: hasPhoto(a.id), model: hasModel(a.id), id: a.id, name: a.name, role: a.role, color: a.color, gender: a.gender, manager: !!a.manager, place: brain.placeOf(a), placeLabel: places[brain.placeOf(a)], aliases: a.aliases }));
app.get('/api/team', (req, res) => res.json({ team: teamView(), places, provider: brain.provider() }));
app.get('/api/whoami', (req, res) => res.json({ owner: isOwnerKey(req.get('x-owner-key')) }));

app.get('/api/settings', owner, (req, res) => res.json(settings.view()));
app.post('/api/settings', owner, async (req, res) => {
  const b = req.body || {};
  settings.save({ AI_PROVIDER: b.provider, GEMINI_API_KEY: b.gemini, GROQ_API_KEY: b.groq, ANTHROPIC_API_KEY: b.claude, GEMINI_MODEL: b.geminiModel });
  io.to('office').emit('team:changed');
  res.json({ ...settings.view(), test: await brain.testBrain() });
});
app.post('/api/settings/test', owner, async (req, res) => res.json(await brain.testBrain()));

app.get('/api/memories', owner, (req, res) => res.json(store.db.memories));
app.post('/api/memories', owner, (req, res) => res.json(brain.remember(String(req.body.text || ''))));
app.delete('/api/memories/:id', owner, (req, res) => { store.db.memories = store.db.memories.filter((m) => m.id !== req.params.id); store.save(); res.json({ ok: true }); });

app.get('/api/clients', owner, (req, res) => res.json(store.db.clients));
app.post('/api/clients', owner, (req, res) => {
  const c = { id: store.id('c'), name: String(req.body.name || '').trim(), notes: String(req.body.notes || '').trim(), at: new Date().toISOString() };
  if (!c.name) return res.status(400).json({ error: 'name required' });
  store.db.clients.push(c); store.save(); res.json(c);
});
app.delete('/api/clients/:id', owner, (req, res) => { store.db.clients = store.db.clients.filter((c) => c.id !== req.params.id); store.save(); res.json({ ok: true }); });

app.get('/api/tasks', owner, (req, res) => res.json(store.db.tasks));
app.post('/api/tasks', owner, (req, res) => { const t = brain.addTask(req.body); io.to('office').emit('tasks:changed'); res.json(t); });
app.patch('/api/tasks/:id', owner, (req, res) => {
  const t = store.db.tasks.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).end();
  const wasDone = t.status === 'done';
  for (const k of ['status', 'title', 'agent', 'client']) if (req.body[k] !== undefined) t[k] = req.body[k];
  store.save(); io.to('office').emit('tasks:changed'); res.json(t);
  if (!wasDone && t.status === 'done') { // the agent tells you once, when they finish
    const a = team.find((x) => x.id === t.agent);
    const c = store.db.clients.find((x) => x.id === t.client);
    const msg = { id: store.id('o'), who: a.id, name: a.name, kind: 'done', text: `Wissam, I just finished "${t.title}"${c ? ` for ${c.name}` : ''}.`, at: now() };
    store.db.office.push(msg); store.save(); io.to('office').emit('office:msg', msg);
  }
});
app.delete('/api/tasks/:id', owner, (req, res) => { store.db.tasks = store.db.tasks.filter((t) => t.id !== req.params.id); store.save(); io.to('office').emit('tasks:changed'); res.json({ ok: true }); });

app.get('/api/office', owner, (req, res) => res.json(store.db.office.slice(-200)));
app.post('/api/override', owner, (req, res) => {
  const { agent, place } = req.body;
  if (place) store.db.overrides[agent] = place; else delete store.db.overrides[agent];
  store.save(); io.to('office').emit('team:changed'); res.json({ ok: true });
});
app.get('/api/feed', owner, async (req, res) => {
  try { res.json(await brain.news(process.env.TREND_TOPICS || 'Lebanon business OR AI apps OR social media marketing OR restaurant loyalty', 10)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/meetings', owner, (req, res) => res.json(store.db.meetings.map(({ transcript, ...m }) => ({ ...m, lines: transcript.length })).reverse()));
app.post('/api/meetings', owner, (req, res) => {
  const agents = Array.isArray(req.body.agents) ? req.body.agents.filter((id) => team.some((a) => a.id === id)) : [];
  for (const must of ['fadi', 'karim']) if (!agents.includes(must)) agents.push(must);
  const m = { id: crypto.randomBytes(5).toString('hex'), title: String(req.body.title || 'Meeting').trim(), client: req.body.client || null, agents, transcript: [], recordings: [], summary: null, at: new Date().toISOString() };
  store.db.meetings.push(m); store.save(); res.json(m);
});
app.get('/api/meetings/:id', (req, res) => {
  const m = store.db.meetings.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  const client = store.db.clients.find((c) => c.id === m.client);
  const base = { id: m.id, title: m.title, clientName: client?.name || null, agents: m.agents };
  res.json(isOwnerKey(req.get('x-owner-key')) ? { ...base, transcript: m.transcript, summary: m.summary, recordings: m.recordings } : base);
});

const upload = multer({ storage: multer.diskStorage({ destination: path.join(store.DATA_DIR, 'recordings'), filename: (req, f, cb) => cb(null, `${req.params.id}-${Date.now()}.webm`) }), limits: { fileSize: 500e6 } });
app.post('/api/meetings/:id/recording', owner, upload.single('file'), (req, res) => {
  const m = store.db.meetings.find((x) => x.id === req.params.id);
  if (!m || !req.file) return res.status(400).end();
  m.recordings.push(req.file.filename); store.save(); res.json({ file: req.file.filename });
});
app.get('/recordings/:file', (req, res) => {
  if (!isOwnerKey(String(req.query.key || ''))) return res.status(401).end();
  res.sendFile(path.join(store.DATA_DIR, 'recordings', path.basename(req.params.file)));
});

// ---------- realtime ----------
const queues = new Map(); // one speaker at a time per room
const enqueue = (room, fn) => { const p = (queues.get(room) || Promise.resolve()).then(fn).catch((e) => console.error(e)); queues.set(room, p); return p; };
const now = () => new Date().toISOString();

io.on('connection', (socket) => {
  socket.data.owner = false;

  // ----- Office (HQ) -----
  socket.on('office:join', ({ key }) => {
    if (!isOwnerKey(key)) return socket.emit('error:auth');
    socket.data.owner = true; socket.join('office');
  });
  socket.on('office:say', ({ text }) => {
    if (!socket.data.owner || !text?.trim()) return;
    const msg = { id: store.id('o'), who: 'wissam', name: 'Wissam', text: text.trim(), at: now() };
    store.db.office.push(msg); store.save(); io.to('office').emit('office:msg', msg);
    let targets = brain.addressed(text);
    if (/\b(everyone|everybody|team|guys|kellkon|kelkon)\b|كلكن|الكل/i.test(text) && !targets.length) targets = ['fadi'];
    if (!targets.length) targets = ['fadi'];
    for (const agentId of targets.slice(0, 4)) {
      enqueue('office', async () => {
        io.to('office').emit('agent:typing', { agentId, on: true });
        const history = store.db.office.slice(-14).map((m) => ({ name: m.name, text: m.text }));
        const r = await brain.respond({ agentId, text, mode: 'office', history, isOwner: true });
        io.to('office').emit('agent:typing', { agentId, on: false });
        const out = { id: store.id('o'), who: agentId, name: team.find((a) => a.id === agentId).name, text: r.text, links: r.links, at: now() };
        store.db.office.push(out); store.save();
        io.to('office').emit('office:msg', out);
        if (r.actions?.length) io.to('office').emit('tasks:changed');
      });
    }
  });

  // ----- Meetings -----
  socket.on('meet:join', ({ meetingId, name, key }) => {
    const m = store.db.meetings.find((x) => x.id === meetingId);
    if (!m) return socket.emit('meet:error', 'Meeting not found');
    socket.data.owner = isOwnerKey(key);
    socket.data.name = (socket.data.owner ? name || 'Wissam' : String(name || 'Guest')).slice(0, 40);
    socket.data.meetingId = meetingId;
    const room = `meet:${meetingId}`;
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])].map((sid) => { const s = io.sockets.sockets.get(sid); return { id: sid, name: s?.data.name, owner: s?.data.owner }; });
    socket.join(room);
    socket.emit('meet:welcome', { you: socket.id, owner: socket.data.owner, peers, agents: m.agents, recording: !!m.recordingOn });
    socket.to(room).emit('meet:peer-joined', { id: socket.id, name: socket.data.name, owner: socket.data.owner });
  });
  socket.on('rtc:signal', ({ to, data }) => { if (socket.data.meetingId) io.to(to).emit('rtc:signal', { from: socket.id, data }); });

  socket.on('meet:say', ({ text, via }) => {
    const m = store.db.meetings.find((x) => x.id === socket.data.meetingId);
    if (!m || !text?.trim()) return;
    const room = `meet:${m.id}`;
    const line = { name: socket.data.name, peer: socket.id, owner: socket.data.owner, text: text.trim().slice(0, 2000), via: via || 'chat', at: now() };
    m.transcript.push(line); store.save(); io.to(room).emit('meet:line', line);
    // Agents stay silent unless their name is mentioned.
    const targets = brain.addressed(text).filter((id) => m.agents.includes(id));
    for (const agentId of targets.slice(0, 3)) {
      enqueue(room, async () => {
        io.to(room).emit('agent:typing', { agentId, on: true });
        const history = m.transcript.slice(-16).map((l) => ({ name: l.name, text: l.text }));
        const r = await brain.respond({ agentId, text, mode: 'meeting', clientId: m.client, meeting: m, history: history.slice(0, -1), speaker: socket.data.name, isOwner: socket.data.owner });
        io.to(room).emit('agent:typing', { agentId, on: false });
        const a = team.find((x) => x.id === agentId);
        const out = { name: a.name, agent: agentId, answer: true, text: r.text, links: r.links, at: now() };
        m.transcript.push(out); store.save(); io.to(room).emit('meet:line', out);
        if (r.actions?.length) io.to('office').emit('tasks:changed');
      });
    }
  });

  socket.on('meet:agents', ({ agents }) => {
    const m = store.db.meetings.find((x) => x.id === socket.data.meetingId);
    if (!m || !socket.data.owner) return;
    m.agents = agents.filter((id) => team.some((a) => a.id === id));
    for (const must of ['fadi', 'karim']) if (!m.agents.includes(must)) m.agents.push(must);
    store.save(); io.to(`meet:${m.id}`).emit('meet:agents', m.agents);
  });

  socket.on('meet:record', ({ on }) => {
    const m = store.db.meetings.find((x) => x.id === socket.data.meetingId);
    if (!m || !socket.data.owner) return;
    m.recordingOn = !!on; store.save();
    const room = `meet:${m.id}`;
    io.to(room).emit('meet:recording', m.recordingOn);
    const line = { name: 'Karim', agent: 'karim', silent: true, text: on ? "Hi everyone, Karim here. Just so you know, I'm recording this meeting from now on so I can share the notes after." : "Recording stopped. I'll have the notes ready when we wrap up.", at: now() };
    m.transcript.push(line); store.save(); io.to(room).emit('meet:line', line);
  });

  socket.on('meet:end', async () => {
    const m = store.db.meetings.find((x) => x.id === socket.data.meetingId);
    if (!m || !socket.data.owner) return;
    const room = `meet:${m.id}`;
    m.recordingOn = false;
    io.to(room).emit('agent:typing', { agentId: 'karim', on: true });
    m.summary = await brain.summarize(m);
    m.endedAt = now(); store.save();
    io.to(room).emit('agent:typing', { agentId: 'karim', on: false });
    io.to(room).emit('meet:ended', { summary: m.summary });
  });

  socket.on('disconnect', () => {
    if (socket.data.meetingId) io.to(`meet:${socket.data.meetingId}`).emit('meet:peer-left', { id: socket.id });
  });
});

// refresh "living office" positions every minute
setInterval(() => io.to('office').emit('team:changed'), 60_000);

(async () => {
  await store.init();
  settings.load();
  server.listen(PORT, onListen);
})().catch((e) => { console.error('Failed to start:', e); process.exit(1); });

function onListen() {
  console.log(`\n  Meeting Room is running`);
  const base = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  console.log(`  Your HQ (keep this link private):  ${base}/?key=${OWNER_KEY}`);
  console.log(`  AI brain: ${brain.provider()}${brain.provider() === 'offline' ? ' (free built-in office brain; add a free Gemini key in Settings for full conversation)' : ''}\n`);
}
