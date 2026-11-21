// The agents' brain.
// 1) If a free/paid AI key is configured (Gemini, Groq, Ollama, Claude) agents talk fully naturally.
// 2) With no key, the built-in "office brain" still works: real task status, memories, live news, research.
const store = require('./store');
const { team, places, routineFor } = require('./team');

const UA = { 'User-Agent': 'MeetingRoom/0.1 (personal project)' };
const byId = Object.fromEntries(team.map((a) => [a.id, a]));

// ---------- name detection ----------
const hasArabic = (s) => /[؀-ۿ]/.test(s);
function detectMentions(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const a of team) {
    let idx = -1;
    for (const al of a.aliases) {
      const re = hasArabic(al) ? new RegExp(al) : new RegExp(`(^|[^a-z])${al}([^a-z]|$)`, 'i');
      const m = re.exec(lower);
      if (m && (idx === -1 || m.index < idx)) idx = m.index;
    }
    if (idx !== -1) found.push({ id: a.id, idx });
  }
  return found.sort((x, y) => x.idx - y.idx);
}
// Who is being spoken TO (not just mentioned). "Fadi, assign Ziad to X" -> only Fadi.
// "Liwaa and Hussien, ..." -> both. "What did you finish, Liwaa?" -> Liwaa.
function addressed(text) {
  const found = detectMentions(text);
  if (!found.length) return [];
  const first = found[0];
  const lead = text.slice(0, first.idx).replace(/[^\p{L}]/gu, '');
  if (lead.length <= 3) { // message starts with a name: take the names before the first comma/colon
    const cut = text.search(/[,:،]/);
    const head = cut === -1 ? [first] : found.filter((f) => f.idx < cut);
    return (head.length ? head : [first]).map((f) => f.id);
  }
  return found.map((f) => f.id);
}

// ---------- free internet tools ----------
async function news(query, n = 5) {
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) })).text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, n).map(([, it]) => {
    const get = (t) => (it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
    const clean = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    return { title: clean(get('title')), link: clean(get('link')), date: clean(get('pubDate')), source: clean(get('source')) };
  });
  return items;
}
async function wiki(query) {
  const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json`, { headers: UA, signal: AbortSignal.timeout(8000) })).json();
  const title = s?.[1]?.[0];
  if (!title) return null;
  const sum = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: UA, signal: AbortSignal.timeout(8000) })).json();
  return { title: sum.title, extract: sum.extract, url: sum.content_urls?.desktop?.page };
}

// ---------- helpers ----------
function stripNames(text) {
  let t = text;
  for (const a of team) for (const al of a.aliases) {
    t = t.replace(hasArabic(al) ? new RegExp(al, 'g') : new RegExp(`(^|[^a-z])${al}([^a-z]|$)`, 'ig'), '$1$2');
  }
  return t.replace(/^[\s,.:;!?-]+/, '').replace(/\s+/g, ' ').trim();
}
function placeOf(agent) {
  const o = store.db.overrides[agent.id];
  if (o) return o;
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Beirut', hour: 'numeric', hour12: false }));
  return routineFor(agent, hour % 24);
}
function findClient(nameOrId) {
  if (!nameOrId) return null;
  const n = String(nameOrId).toLowerCase().trim();
  return store.db.clients.find((c) => c.id === nameOrId || c.name.toLowerCase() === n || n.includes(c.name.toLowerCase())) || null;
}
function tasksFor({ agentId, clientId } = {}) {
  return store.db.tasks.filter((t) => (!agentId || t.agent === agentId) && (!clientId || t.client === clientId));
}
const clientName = (id) => store.db.clients.find((c) => c.id === id)?.name || 'no client';
const statusWord = { todo: 'not started yet', doing: 'in progress', done: 'done' };

function addTask({ agent, title, client, by = 'wissam' }) {
  const c = findClient(client);
  const t = { id: store.id('t'), agent, title: title.trim(), client: c?.id || null, status: 'todo', by, at: new Date().toISOString() };
  store.db.tasks.push(t); store.save();
  return t;
}
function remember(text) {
  const m = { id: store.id('m'), text: text.trim(), at: new Date().toISOString() };
  store.db.memories.push(m); store.save();
  return m;
}
function bestTaskMatch(text, list) {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 3));
  let best = null, score = 0;
  for (const t of list) {
    const s = t.title.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((w) => words.has(w)).length;
    if (s > score) { score = s; best = t; }
  }
  return best;
}

// ---------- AI providers ----------
function provider() {
  const want = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  const avail = {
    claude: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    ollama: !!process.env.OLLAMA_MODEL,
  };
  if (want !== 'auto') return avail[want] ? want : 'offline';
  return ['claude', 'gemini', 'groq', 'ollama'].find((p) => avail[p]) || 'offline';
}

// Ask Google which models this key can use, and pick the newest stable "flash" (fast + free tier).
let geminiPick = { key: null, model: null };
async function bestGeminiModel() {
  const key = process.env.GEMINI_API_KEY;
  if (geminiPick.key === key && geminiPick.model) return geminiPick.model;
  let model = 'gemini-2.5-flash';
  try {
    const j = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`, { signal: AbortSignal.timeout(10000) })).json();
    const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
    const flash = names.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
    const ver = (n) => parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)[1]);
    if (flash.length) model = flash.sort((a, b) => ver(b) - ver(a))[0];
    else if (names.includes('gemini-flash-latest')) model = 'gemini-flash-latest';
  } catch (e) { console.warn('[gemini] could not list models:', e.message); }
  geminiPick = { key, model };
  console.log(`[gemini] using model ${model}`);
  return model;
}

async function callLLM(system, user) {
  const p = provider();
  const timeout = AbortSignal.timeout(45000);
  if (p === 'gemini') {
    const model = process.env.GEMINI_MODEL || await bestGeminiModel();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: timeout,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 600 } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
  }
  if (p === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: timeout,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', temperature: 0.8, max_tokens: 600, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.choices?.[0]?.message?.content || '';
  }
  if (p === 'ollama') {
    const r = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/chat`, {
      method: 'POST', signal: AbortSignal.timeout(120000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await r.json();
    return j.message?.content || '';
  }
  if (p === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: timeout,
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 600, system, messages: [{ role: 'user', content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.content?.map((x) => x.text || '').join('') || '';
  }
  throw new Error('offline');
}

// ---------- context gathering (shared by AI + offline) ----------
async function gatherTools(agent, text) {
  const q = stripNames(text).replace(/\b(what'?s|whats|what|is|are|in|happening|going|today|new|latest|news|trends?|research|look up|find|about|on|can you|could you|please|tell me|me|the|any|anything)\b/gi, ' ').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  try {
    if (agent.id === 'liwaa') {
      const topic = q.length > 2 ? q : (process.env.TREND_TOPICS || 'Lebanon business OR AI apps OR social media marketing OR restaurant loyalty');
      return { kind: 'news', topic, items: await news(topic, 6) };
    }
    if (agent.id === 'sebahi' && q.length > 2) {
      const [w, n] = await Promise.all([wiki(q).catch(() => null), news(q, 4).catch(() => [])]);
      return { kind: 'research', topic: q, wiki: w, items: n };
    }
  } catch (e) { return { kind: 'error', error: e.message }; }
  return null;
}

function contextBlock({ agent, clientId, mode, meeting }) {
  const lines = [];
  lines.push(`Now (Beirut): ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Beirut' })}. You are currently: ${places[placeOf(agent)]}.`);
  lines.push(`Setting: ${mode === 'meeting' ? `a live call${meeting?.title ? ` titled "${meeting.title}"` : ''}${clientId ? ` with client ${clientName(clientId)}` : ''}. Humans may include Wissam (your boss) and his client.` : 'the office team chat with Wissam (your boss).'}`);
  lines.push('What Dana knows about Wissam:\n' + store.db.memories.slice(-40).map((m) => `- ${m.text}`).join('\n'));
  const relevant = agent.manager || agent.id === 'jad' || agent.id === 'karim' ? tasksFor({ clientId }) : tasksFor({ agentId: agent.id, clientId });
  lines.push('Task board (the ONLY source of truth for work status):\n' + (relevant.length ? relevant.map((t) => `- [${t.id}] ${byId[t.agent]?.name}: "${t.title}" for ${clientName(t.client)} — ${statusWord[t.status]}`).join('\n') : '- (no tasks)'));
  if (store.db.clients.length) lines.push('Clients: ' + store.db.clients.map((c) => `${c.name}${c.notes ? ` (${c.notes})` : ''}`).join('; '));
  return lines.join('\n\n');
}

function systemPrompt(agent) {
  const roster = team.map((a) => `${a.name} (${a.role}, id=${a.id})`).join(', ');
  return `${agent.persona}

You work at Wissam's company (he is the founder of Mukafaah and builds apps and websites for clients in Lebanon). Your colleagues: ${roster}.

How you talk:
- Like a real person on a call: natural, warm, short (1-4 sentences unless asked for detail). No bullet lists unless asked. No emojis. Never say you are an AI model unless directly asked.
- Mirror the language of the person speaking: English, Arabic, or Lebanese Arabizi.
- Only claim work is finished if the task board says done. If something is not done, say so honestly and give the status.
- In front of a client, be professional and positive.

Actions (optional, put them at the very end, each on its own line, they are hidden from people):
[[TASK: agent=<id>; client=<client name or none>; title=<what to do>]]  -> when someone assigns new work
[[STATUS: id=<task id>; status=todo|doing|done]]                       -> when a status changes
[[REMEMBER: <fact about Wissam>]]                                       -> when told to remember something`;
}

function applyActions(raw, agent) {
  const actions = [];
  const text = raw.replace(/\[\[(TASK|STATUS|REMEMBER):([^\]]*)\]\]/g, (_, kind, body) => {
    const kv = Object.fromEntries(body.split(';').map((p) => p.split('=').map((s) => s.trim())).filter((p) => p.length === 2));
    if (kind === 'TASK' && kv.title && byId[kv.agent]) actions.push({ type: 'task', task: addTask({ agent: kv.agent, title: kv.title, client: kv.client !== 'none' ? kv.client : null, by: agent.id }) });
    if (kind === 'STATUS') { const t = store.db.tasks.find((x) => x.id === kv.id); if (t && statusWord[kv.status]) { t.status = kv.status; store.save(); actions.push({ type: 'status', task: t }); } }
    if (kind === 'REMEMBER' && body.trim()) actions.push({ type: 'memory', memory: remember(body.trim()) });
    return '';
  }).trim();
  return { text, actions };
}

// ---------- offline office brain ----------
const STATUS_RE = /(finish|done|complete|progress|status|update|working on|what did you|what have you|have you|did you|where are you|khalast|5alast|5alas|khalas|خلص|شو عملت|وين صرت|شو صار)/i;
const REMEMBER_RE = /(?:remember|note that|save that|don'?t forget|تذكر|احفظ)\s*(?:that\s*)?[:,-]?\s*(.+)/i;

function offline(agent, text, { clientId, tools, speaker, isOwner }) {
  const msg = stripNames(text);
  const mine = tasksFor({ agentId: agent.id, clientId });
  const forClient = clientId ? ` for ${clientName(clientId)}` : '';

  if (agent.id === 'dana') {
    const r = REMEMBER_RE.exec(msg);
    if (r) { const m = remember(r[1]); return { text: `Got it, I'll remember that: "${m.text}".`, actions: [{ type: 'memory', memory: m }] }; }
    const mem = store.db.memories.slice(-8).map((m) => m.text).join(' ');
    return { text: `Here's what I have on you: ${mem}` };
  }
  if (agent.id === 'liwaa' && tools?.kind === 'news') {
    if (!tools.items.length) return { text: `Nothing fresh on "${tools.topic}" right now. I'll keep watching.` };
    return { text: `Fresh on ${tools.topic}: ` + tools.items.slice(0, 4).map((i) => `${i.title}`).join(' | ') + '. Links are in the feed panel.', links: tools.items };
  }
  if (agent.id === 'sebahi' && tools?.kind === 'research') {
    const w = tools.wiki?.extract ? `${tools.wiki.extract.split('. ').slice(0, 2).join('. ').replace(/\.*$/, '')}.` : `I couldn't find a solid reference page on "${tools.topic}".`;
    const n = tools.items.length ? ` Latest coverage: ${tools.items.slice(0, 2).map((i) => i.title).join(' | ')}.` : '';
    return { text: w + n, links: [tools.wiki && { title: `Wikipedia: ${tools.wiki.title}`, link: tools.wiki.url }, ...tools.items].filter(Boolean) };
  }
  if (agent.id === 'fadi' && isOwner) {
    const raw = text.replace(/^\s*(fadi|fady|فادي)[\s,:]*/i, '');
    const m = /assign\s+([^\s,]+),?\s+(?:to\s+)?(.+?)(?:\s+for\s+(.+?))?[.!]?$/i.exec(raw);
    if (m) {
      const target = team.find((a) => a.aliases.includes(m[1].toLowerCase()));
      if (target) { const t = addTask({ agent: target.id, title: m[2], client: m[3] || clientId, by: 'fadi' }); return { text: `Done, ${target.name} now owns "${t.title}"${t.client ? ` for ${clientName(t.client)}` : ''}.`, actions: [{ type: 'task', task: t }] }; }
    }
  }
  if (agent.manager || agent.id === 'jad') {
    const all = tasksFor({ clientId });
    if (!all.length) return { text: `There's nothing on the board${forClient} yet. Give me the tasks and I'll put the team on them.` };
    const done = all.filter((t) => t.status === 'done'), doing = all.filter((t) => t.status === 'doing'), todo = all.filter((t) => t.status === 'todo');
    const fmt = (l) => l.map((t) => `${byId[t.agent].name} – ${t.title}`).join(', ');
    return { text: `Quick update${forClient}: ${done.length} done${done.length ? ` (${fmt(done)})` : ''}, ${doing.length} in progress${doing.length ? ` (${fmt(doing)})` : ''}, and ${todo.length} still to start${todo.length ? ` (${fmt(todo)})` : ''}.` };
  }
  if (agent.id === 'karim' && /(summary|summar|minutes|record)/i.test(msg)) {
    const last = [...store.db.meetings].reverse().find((m) => m.summary);
    return { text: last ? `Last summary I have is from "${last.title}": ${last.summary.slice(0, 400)}` : `I record when you hit the record button in a meeting, and I'll write the summary when it ends.` };
  }
  if (agent.id === 'hussien' && /(video|edit|clip|reel)/i.test(msg)) {
    return { text: `Send me the footage and tell me the platform, Reels, TikTok or YouTube. I'll come back with a cut list: hook in the first 2 seconds, captions, music cue and the final length.` };
  }
  if (STATUS_RE.test(msg)) {
    if (!mine.length) return { text: `I don't have anything assigned${forClient} yet.` };
    const hit = bestTaskMatch(msg, mine);
    if (hit) return { text: `"${hit.title}"${hit.client ? ` for ${clientName(hit.client)}` : ''} is ${statusWord[hit.status]}.` };
    return { text: `Here's where I am${forClient}: ` + mine.map((t) => `"${t.title}" is ${statusWord[t.status]}`).join('; ') + '.' };
  }
  if (isOwner && msg.length > 6 && !/\?\s*$/.test(msg)) {
    const t = addTask({ agent: agent.id, title: msg, client: clientId, by: 'wissam' });
    return { text: `On it. I've added "${t.title}" to my list${forClient}.`, actions: [{ type: 'task', task: t }] };
  }
  return { text: `Good question${speaker ? `, ${speaker}` : ''}. Let me get back to you on that properly. (Tip: add a free AI key in .env so I can answer anything naturally.)` };
}

// ---------- main entry ----------
async function respond({ agentId, text, mode = 'office', clientId = null, meeting = null, history = [], speaker = 'Wissam', isOwner = true }) {
  const agent = byId[agentId];
  const tools = await gatherTools(agent, text);
  const p = provider();
  if (p !== 'offline') {
    try {
      const toolText = tools?.kind === 'news' ? `\n\nLive news you just pulled on "${tools.topic}":\n` + tools.items.map((i) => `- ${i.title} (${i.source}, ${i.date})`).join('\n')
        : tools?.kind === 'research' ? `\n\nResearch you just pulled on "${tools.topic}":\n${tools.wiki ? `Wikipedia: ${tools.wiki.extract}\n` : ''}` + tools.items.map((i) => `- ${i.title} (${i.source})`).join('\n') : '';
      const convo = history.slice(-14).map((h) => `${h.name}: ${h.text}`).join('\n');
      const user = `${contextBlock({ agent, clientId, mode, meeting })}${toolText}\n\nConversation so far:\n${convo}\n${speaker}: ${text}\n\nReply now as ${agent.name}, speaking directly.`;
      const out = applyActions(await callLLM(systemPrompt(agent), user), agent);
      return { ...out, links: tools?.items?.length ? [tools.wiki && { title: `Wikipedia: ${tools.wiki.title}`, link: tools.wiki.url }, ...tools.items].filter(Boolean) : undefined, provider: p };
    } catch (e) {
      console.warn(`[brain] ${p} failed, falling back to office brain:`, e.message);
    }
  }
  return { ...offline(agent, text, { clientId, tools, speaker, isOwner }), provider: 'offline' };
}

// Karim: summarise a meeting transcript
async function summarize(meeting) {
  const transcript = meeting.transcript.map((l) => `${l.name}: ${l.text}`).join('\n');
  if (!transcript.trim()) return 'The meeting had no spoken transcript.';
  if (provider() !== 'offline') {
    try {
      return (await callLLM(systemPrompt(byId.karim), `Write the meeting minutes for "${meeting.title}"${meeting.client ? ` with client ${clientName(meeting.client)}` : ''}. Sections: Summary (3-5 sentences), Decisions, Action items (owner + task). Plain text.\n\nTranscript:\n${transcript}`)).trim();
    } catch (e) { console.warn('[karim] summary fallback:', e.message); }
  }
  const people = [...new Set(meeting.transcript.map((l) => l.name))];
  const actions = meeting.transcript.filter((l) => /(will|i'll|we'll|need to|should|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|deadline|send|deliver)/i.test(l.text)).map((l) => `- ${l.name}: ${l.text}`);
  return `Participants: ${people.join(', ')}. ${meeting.transcript.length} lines spoken.\n\nAction items spotted:\n${actions.length ? actions.join('\n') : '- none detected'}\n\n(Add a free AI key for full written minutes.)`;
}

async function testBrain() {
  const p = provider();
  if (p === 'offline') return { ok: false, provider: p, error: 'No AI key set' };
  try {
    const text = await callLLM('You are Fadi, a friendly general manager. Reply in one short sentence.', 'Wissam just connected your brain. Say hi to him.');
    return { ok: true, provider: p, model: p === 'gemini' ? (process.env.GEMINI_MODEL || geminiPick.model) : undefined, text: text.trim() };
  } catch (e) { return { ok: false, provider: p, error: e.message }; }
}

module.exports = { testBrain, detectMentions, addressed, respond, summarize, provider, placeOf, addTask, remember, news };
