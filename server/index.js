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
const voice = require('./voice');

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
app.get('/api/team', (req, res) => res.json({ team: teamView(), places, provider: brain.provider(), language: process.env.AGENT_LANGUAGE || 'lebanese' }));
// Servers that help two devices find each other (STUN) and relay audio/video when a direct
// connection is blocked, e.g. Wi-Fi <-> mobile data (TURN). Set TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL
// to use your own (e.g. a free Metered or Cloudflare TURN account); otherwise free public relays are used.
let iceCache = { at: 0, key: '', servers: null };
async function relayServers() {
  const e = process.env;
  const key = [e.CF_TURN_KEY_ID, e.CF_TURN_TOKEN, e.METERED_DOMAIN, e.METERED_API_KEY, e.TURN_URLS].join('|');
  if (iceCache.servers && iceCache.key === key && Date.now() - iceCache.at < 3600e3) return iceCache.servers;
  let servers = [];
  try {
    if (e.CF_TURN_KEY_ID && e.CF_TURN_TOKEN) { // Cloudflare TURN (free 1,000 GB/month)
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${e.CF_TURN_KEY_ID}/credentials/generate-ice-servers`, { method: 'POST', headers: { authorization: `Bearer ${e.CF_TURN_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }), signal: AbortSignal.timeout(8000) });
      const j = await r.json(); servers = j.iceServers ? [].concat(j.iceServers) : [];
      if (!r.ok) console.warn('[turn] cloudflare:', JSON.stringify(j).slice(0, 200));
    } else if (e.METERED_DOMAIN && e.METERED_API_KEY) { // Metered (free 20 GB/month)
      const dom = e.METERED_DOMAIN.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const r = await fetch(`https://${dom}/api/v1/turn/credentials?apiKey=${encodeURIComponent(e.METERED_API_KEY)}`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json(); servers = Array.isArray(j) ? j : [];
      if (!r.ok) console.warn('[turn] metered:', JSON.stringify(j).slice(0, 200));
    } else if (e.TURN_URLS) {
      servers = [{ urls: e.TURN_URLS.split(',').map((s) => s.trim()), username: e.TURN_USERNAME, credential: e.TURN_CREDENTIAL }];
    }
  } catch (err) { console.warn('[turn] could not get relay credentials:', err.message); }
  iceCache = { at: Date.now(), key, servers };
  return servers;
}
// Only the owner, or someone with a link to an open meeting, gets relay credentials (protects your bandwidth).
const openMeeting = (id) => store.db.meetings.find((m) => m.id === id && !m.endedAt);
app.get('/api/ice', async (req, res) => {
  if (!isOwnerKey(req.get('x-owner-key')) && !openMeeting(String(req.query.m || ''))) return res.status(403).json({ error: 'meeting link required' });
  const relays = await relayServers();
  res.json({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...relays], relay: relays.length > 0 });
});
app.get('/api/audio/:id', (req, res) => {
  const c = voice.clips.get(req.params.id);
  if (!c) return res.status(404).end();
  res.set('content-type', c.type).set('cache-control', 'private, max-age=900').send(c.buf);
});
app.get('/api/whoami', (req, res) => res.json({ owner: isOwnerKey(req.get('x-owner-key')) }));

app.get('/api/settings', owner, (req, res) => res.json(settings.view()));
app.post('/api/settings', owner, async (req, res) => {
  const b = req.body || {};
  settings.save({ AI_PROVIDER: b.provider, GEMINI_API_KEY: b.gemini, GROQ_API_KEY: b.groq, ANTHROPIC_API_KEY: b.claude, GEMINI_MODEL: b.geminiModel,
    AGENT_LANGUAGE: b.language, CLAUDE_MODEL: b.claudeModel, CF_TURN_KEY_ID: b.cfTurnId, CF_TURN_TOKEN: b.cfTurn, METERED_DOMAIN: b.meteredDomain, METERED_API_KEY: b.metered });
  iceCache.at = 0;
  io.to('office').emit('team:changed');
  res.json({ ...settings.view(), test: await brain.testBrain() });
});
// ---------- Claude spending (tracked from the token counts Claude returns with every reply) ----------
app.get('/api/usage', owner, (req, res) => {
  const u = store.db.usage || { since: null, calls: 0, usd: 0, tokens: { in: 0, out: 0, cr: 0, cw: 0 }, byDay: {}, byAgent: {}, byModel: {} };
  res.json({
    usage: u,
    creditTotal: Number(process.env.CREDIT_TOTAL || 200),
    creditExpires: process.env.CREDIT_EXPIRES || '2026-12-15',
    model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
    prices: brain.PRICES,
  });
});
app.post('/api/usage/credit', owner, (req, res) => {
  const total = Number(req.body?.total), expires = String(req.body?.expires || '');
  settings.save({ CREDIT_TOTAL: total > 0 ? String(total) : undefined, CREDIT_EXPIRES: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : undefined });
  res.json({ ok: true });
});
app.post('/api/usage/reset', owner, (req, res) => { delete store.db.usage; store.save(); res.json({ ok: true }); });
// Voice self-test: makes one short clip and reports what happened.
app.post('/api/voice/test', owner, async (req, res) => {
  const t0 = Date.now();
  const id = await voice.synthesize('أهلا وسام، هيدا اختبار للصوت.', 'fadi');
  res.json({ ok: !!id, audio: id, ms: Date.now() - t0, ...voice.status() });
});
app.post('/api/settings/test', owner, async (req, res) => res.json(await brain.testBrain()));

// ---------- company knowledge (what the agents know about Mukafaah and the business) ----------
const cleanKnowledge = (k) => ({ id: k.id || store.id('k'), title: String(k.title || '').trim().slice(0, 120), audience: k.audience === 'public' ? 'public' : 'internal', text: String(k.text || '').trim().slice(0, 4000) });
app.get('/api/knowledge', owner, (req, res) => res.json(store.db.knowledge || []));
app.post('/api/knowledge', owner, (req, res) => {
  const k = cleanKnowledge(req.body || {});
  if (!k.title || !k.text) return res.status(400).json({ error: 'title and text required' });
  (store.db.knowledge ||= []).push(k); store.save(); res.json(k);
});
app.post('/api/knowledge/import', owner, (req, res) => { // bulk load; replace=true swaps the whole set
  const items = (Array.isArray(req.body?.items) ? req.body.items : []).map(cleanKnowledge).filter((k) => k.title && k.text);
  store.db.knowledge = req.body?.replace ? items : [...(store.db.knowledge || []), ...items];
  store.save(); res.json({ count: store.db.knowledge.length });
});
app.patch('/api/knowledge/:id', owner, (req, res) => {
  const k = (store.db.knowledge || []).find((x) => x.id === req.params.id);
  if (!k) return res.status(404).end();
  Object.assign(k, cleanKnowledge({ ...k, ...req.body, id: k.id })); store.save(); res.json(k);
});
app.delete('/api/knowledge/:id', owner, (req, res) => { store.db.knowledge = (store.db.knowledge || []).filter((k) => k.id !== req.params.id); store.save(); res.json({ ok: true }); });

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
    const msg = { id: store.id('o'), who: a.id, name: a.name, kind: 'done', tts: voice.enabled(), text: `Wissam, I just finished "${t.title}"${c ? ` for ${c.name}` : ''}.`, at: now() };
    store.db.office.push(msg); store.save(); io.to('office').emit('office:msg', msg);
    if (msg.tts) voice.speakInChunks(msg.text, a.id, (index, total, audio) => io.to('office').emit('office:audio', { msgId: msg.id, index, total, audio }));
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
  // long, unguessable link id
  const m = { id: crypto.randomBytes(9).toString('base64url'), title: String(req.body.title || 'Meeting').trim(), client: req.body.client || null, agents, transcript: [], recordings: [], summary: null, at: new Date().toISOString() };
  store.db.meetings.push(m); store.save(); res.json(m);
});
app.get('/api/meetings/:id', (req, res) => {
  const m = store.db.meetings.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  const isOwnerReq = isOwnerKey(req.get('x-owner-key'));
  if (m.endedAt && !isOwnerReq) return res.status(410).json({ error: 'This meeting has ended' });
  const client = store.db.clients.find((c) => c.id === m.client);
  const base = { id: m.id, title: m.title, clientName: client?.name || null, agents: m.agents };
  res.json(isOwnerReq ? { ...base, transcript: m.transcript, summary: m.summary, recordings: m.recordings } : base);
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

// Voice the first sentence the moment Claude has written it, then the rest when the answer is complete.
function earlyVoice(agentId, emit) {
  let first = null;
  return {
    onEarly: (sentence) => {
      if (!voice.enabled()) return;
      first = sentence;
      voice.synthesize(sentence, agentId).then((audio) => emit(0, 2, audio)).catch(() => emit(0, 2, null));
    },
    finish: (text) => {
      if (!voice.enabled()) return;
      if (first && text.startsWith(first)) {
        const rest = text.slice(first.length).trim();
        if (!rest) return emit(1, 2, null);
        voice.synthesize(rest, agentId).then((audio) => emit(1, 2, audio)).catch(() => emit(1, 2, null));
      } else if (!first) voice.speakInChunks(text, agentId, emit);
    },
  };
}

// ---------- meetings: agents joining and answering ----------
function joinAgent(m, agentId, why) {
  if (m.agents.includes(agentId) || !team.some((a) => a.id === agentId)) return false;
  m.agents.push(agentId); store.save();
  const room = `meet:${m.id}`;
  io.to(room).emit('meet:agents', m.agents);
  const a = team.find((x) => x.id === agentId);
  const line = { id: store.id('l'), name: a.name, agent: agentId, silent: true, joined: true, text: `${a.name} (${a.role}) joined the meeting${why ? ` · ${why}` : ''}`, at: now() };
  m.transcript.push(line); store.save(); io.to(room).emit('meet:line', line);
  return true;
}
// One agent answers in a meeting. If the answer brings a colleague in ([[INVITE: id]]), that colleague joins
// and answers the same question right after (at most two hand-offs, so it never loops).
function agentAnswer(m, agentId, text, speaker, isOwner, depth, broughtBy = null) {
  const room = `meet:${m.id}`;
  enqueue(room, async () => {
    io.to(room).emit('agent:typing', { agentId, on: true });
    const history = m.transcript.slice(-16).map((l) => ({ name: l.name, text: l.text }));
    const lineId = store.id('l');
    const ev = earlyVoice(agentId, (index, total, audio) => io.to(room).emit('meet:audio', { lineId, index, total, audio }));
    const r = await brain.respond({ agentId, text, mode: 'meeting', clientId: m.client, meeting: m, history: depth ? history : history.slice(0, -1), speaker, isOwner, onEarly: ev.onEarly, broughtBy });
    io.to(room).emit('agent:typing', { agentId, on: false });
    const a = team.find((x) => x.id === agentId);
    const out = { id: lineId, name: a.name, agent: agentId, answer: true, text: r.text, links: r.links, tts: voice.enabled(), at: now() };
    m.transcript.push(out); store.save(); io.to(room).emit('meet:line', out);
    ev.finish(out.text);
    if (r.actions?.some((x) => x.type === 'task' || x.type === 'status')) io.to('office').emit('tasks:changed');
    if (depth < 2) for (const inv of (r.actions || []).filter((x) => x.type === 'invite')) {
      if (inv.agent === agentId) continue;
      joinAgent(m, inv.agent, `${a.name} brought them in`);
      agentAnswer(m, inv.agent, text, speaker, isOwner, depth + 1, a.name);
    }
  });
}

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
  socket.on('office:say', ({ text, interrupted }) => {
    if (!socket.data.owner || !text?.trim()) return;
    // you talked over an agent: tell them, so they follow up naturally instead of repeating themselves
    const cut = interrupted && typeof interrupted.agent === 'string' ? { agent: interrupted.agent, said: String(interrupted.said || '').slice(0, 400) } : null;
    const msg = { id: store.id('o'), who: 'wissam', name: 'Wissam', text: text.trim(), at: now() };
    store.db.office.push(msg); store.save(); io.to('office').emit('office:msg', msg);
    let targets = brain.addressed(text);
    if (/\b(everyone|everybody|team|guys|kellkon|kelkon)\b|كلكن|الكل/i.test(text) && !targets.length) targets = ['fadi'];
    if (!targets.length) targets = ['fadi'];
    for (const agentId of targets.slice(0, 4)) {
      enqueue('office', async () => {
        io.to('office').emit('agent:typing', { agentId, on: true });
        const history = store.db.office.slice(-14).map((m) => ({ name: m.name, text: m.text }));
        const msgId = store.id('o');
        const ev = earlyVoice(agentId, (index, total, audio) => io.to('office').emit('office:audio', { msgId, index, total, audio }));
        const r = await brain.respond({ agentId, text, mode: 'office', history, isOwner: true, interrupted: cut && cut.agent === agentId ? cut.said : null, onEarly: ev.onEarly });
        io.to('office').emit('agent:typing', { agentId, on: false });
        const out = { id: msgId, who: agentId, name: team.find((a) => a.id === agentId).name, text: r.text, links: r.links, tts: voice.enabled(), at: now() };
        store.db.office.push(out); store.save();
        io.to('office').emit('office:msg', out);
        ev.finish(out.text);
        if (r.actions?.length) io.to('office').emit('tasks:changed');
      });
    }
  });

  // ----- Meetings -----
  socket.on('meet:join', ({ meetingId, name, key }) => {
    const m = store.db.meetings.find((x) => x.id === meetingId);
    if (!m) return socket.emit('meet:error', 'Meeting not found');
    socket.data.owner = isOwnerKey(key);
    if (m.endedAt && !socket.data.owner) return socket.emit('meet:error', 'This meeting has ended');
    socket.data.name = (socket.data.owner ? name || 'Wissam' : String(name || 'Guest')).slice(0, 40);
    socket.data.meetingId = meetingId;
    const room = `meet:${meetingId}`;
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])].map((sid) => { const s = io.sockets.sockets.get(sid); return { id: sid, name: s?.data.name, owner: s?.data.owner }; });
    socket.join(room);
    socket.emit('meet:welcome', { you: socket.id, owner: socket.data.owner, peers, agents: m.agents, recording: !!m.recordingOn });
    socket.to(room).emit('meet:peer-joined', { id: socket.id, name: socket.data.name, owner: socket.data.owner });
  });
  // call signals only go to people in the SAME meeting
  socket.on('rtc:signal', ({ to, data }) => {
    const target = io.sockets.sockets.get(to);
    if (!socket.data.meetingId || !target || target.data.meetingId !== socket.data.meetingId) return;
    target.emit('rtc:signal', { from: socket.id, data });
  });

  socket.on('meet:say', ({ text, via }) => {
    const m = store.db.meetings.find((x) => x.id === socket.data.meetingId);
    if (!m || !text?.trim()) return;
    const room = `meet:${m.id}`;
    const line = { name: socket.data.name, peer: socket.id, owner: socket.data.owner, text: text.trim().slice(0, 2000), via: via || 'chat', at: now() };
    m.transcript.push(line); store.save(); io.to(room).emit('meet:line', line);
    // Agents stay silent unless their name is mentioned. If you (the host) name someone who isn't in the
    // call yet, they join automatically and answer.
    const named = brain.addressed(text);
    if (socket.data.owner) for (const id of named) if (!m.agents.includes(id)) joinAgent(m, id, `${socket.data.name} called them in`);
    let targets = named.filter((id) => m.agents.includes(id));
    // guests get a fair limit on agent questions (protects your AI credit from spam)
    if (targets.length && !socket.data.owner) {
      const now = Date.now();
      socket.data.asks = (socket.data.asks || []).filter((t) => now - t < 60000);
      if (socket.data.asks.length >= 6) { socket.emit('meet:error', 'Please give the team a moment before asking again.'); targets = []; }
      else socket.data.asks.push(now);
    }
    for (const agentId of targets.slice(0, 3)) agentAnswer(m, agentId, text, socket.data.name, socket.data.owner, 0);
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
