// Server-side voices: turns an agent's reply into speech so every browser and phone hears it.
// Main voice: ElevenLabs (your account; Fadi speaks with your Lebanese voice). Backup: Gemini text-to-speech.
const crypto = require('crypto');
const { team } = require('./team');

let lastError = null; // shown in Settings so you can see why a voice failed
let lastProvider = null;
const clips = new Map(); // id -> { buf, type, at }
setInterval(() => { const now = Date.now(); for (const [k, v] of clips) if (now - v.at > 15 * 60e3) clips.delete(k); }, 60e3).unref();

const hasEleven = () => !!process.env.ELEVENLABS_API_KEY;
const hasGemini = () => !!process.env.GEMINI_API_KEY;
const enabled = () => (hasEleven() || hasGemini()) && process.env.SERVER_VOICE !== 'off';

// Strip things that sound wrong when read aloud: links, hidden action tags, markdown, emojis, list bullets.
function cleanForSpeech(text) {
  return String(text || '')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#`>~|]+/g, ' ')
    .replace(/^\s*[-•\d]+[.)]?\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const keep = (buf, type) => { const id = crypto.randomBytes(12).toString('base64url'); clips.set(id, { buf, type, at: Date.now() }); return id; };

// ---------------- ElevenLabs ----------------
// Each agent gets their own voice from your ElevenLabs account. Fadi gets your Lebanese voice; Lebanese/Arabic
// voices are preferred for everyone else, then other voices by gender.
let elevenVoices = { key: null, at: 0, map: {} };
async function elevenVoiceFor(agentId) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (elevenVoices.key !== key || Date.now() - elevenVoices.at > 3600e3) {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail?.message || j.detail?.status || `voices ${r.status}`);
    const voices = j.voices || [];
    const text = (v) => `${v.name} ${Object.values(v.labels || {}).join(' ')} ${v.description || ''}`.toLowerCase();
    const isLeb = (v) => /leban|beirut|levant|لبنان/.test(text(v));
    const isArab = (v) => /arab|عرب/.test(text(v));
    const gender = (v) => (v.labels?.gender || (/female|woman|girl/.test(text(v)) ? 'female' : /male|man|guy/.test(text(v)) ? 'male' : '')).toLowerCase();
    const rank = (v) => (isLeb(v) ? 0 : isArab(v) ? 1 : 2);
    const pool = (g) => voices.filter((v) => gender(v) === g).sort((a, b) => rank(a) - rank(b));
    const males = pool('male'), females = pool('female'), any = [...voices].sort((a, b) => rank(a) - rank(b));
    const map = {};
    // your own Lebanese voice (e.g. "Fadi - Lebanese Conversational") goes to Fadi
    const fadiVoice = voices.find((v) => /fadi/i.test(v.name)) || males.find(isLeb) || any.find(isLeb);
    if (fadiVoice) map.fadi = fadiVoice.voice_id;
    let mi = 0, fi = 0;
    for (const a of team) {
      if (map[a.id]) continue;
      const list = a.gender === 'f' ? (females.length ? females : any) : (males.length ? males : any);
      const usable = list.filter((v) => v.voice_id !== map.fadi);
      const pick = (usable.length ? usable : list)[(a.gender === 'f' ? fi++ : mi++) % Math.max(1, (usable.length ? usable : list).length)];
      if (pick) map[a.id] = pick.voice_id;
    }
    elevenVoices = { key, at: Date.now(), map, count: voices.length };
  }
  return elevenVoices.map[agentId] || Object.values(elevenVoices.map)[0];
}
async function eleven(text, agentId) {
  const voiceId = await elevenVoiceFor(agentId);
  if (!voiceId) throw new Error('no voices found in your ElevenLabs account');
  const model = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5'; // fastest; speaks Arabic; half the credits
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail?.message || j.detail?.status || `ElevenLabs ${r.status}`); }
  return keep(Buffer.from(await r.arrayBuffer()), 'audio/mpeg');
}

// ---------------- Gemini (backup) ----------------
const FEMALE = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome'];
const MALE = ['Charon', 'Puck', 'Fenrir', 'Orus', 'Iapetus', 'Algieba', 'Alnilam', 'Schedar', 'Enceladus', 'Achird'];
const geminiVoiceFor = (() => {
  const map = {}; let f = 0, m = 0;
  for (const a of team) map[a.id] = a.gender === 'f' ? FEMALE[f++ % FEMALE.length] : MALE[m++ % MALE.length];
  return (id) => map[id] || 'Kore';
})();
const GEMINI_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];
let geminiWorking = null;
function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function gemini(text, agentId) {
  const order = geminiWorking ? [geminiWorking, ...GEMINI_MODELS.filter((m) => m !== geminiWorking)] : GEMINI_MODELS;
  let err = 'no audio';
  for (const model of order) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoiceFor(agentId) } } } } }),
      });
      const j = await r.json().catch(() => ({}));
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!r.ok || !part) { err = `${model}: ${j.error?.message || 'no audio returned'}`; continue; }
      let buf = Buffer.from(part.data, 'base64');
      const rate = Number((part.mimeType.match(/rate=(\d+)/) || [])[1] || 24000);
      if (!/wav/i.test(part.mimeType)) buf = pcmToWav(buf, rate);
      geminiWorking = model;
      return keep(buf, 'audio/wav');
    } catch (e) { err = `${model}: ${e.message}`; }
  }
  throw new Error(err);
}

// ---------------- main ----------------
async function synthesize(text, agentId) {
  if (!enabled() || !text) return null;
  // Send ONLY the words to say (no instructions), so the voice never reads stage directions out loud.
  const say = cleanForSpeech(text).slice(0, 1200);
  if (!say) return null;
  const errors = [];
  if (hasEleven()) {
    try { const id = await eleven(say, agentId); lastProvider = 'elevenlabs'; lastError = null; return id; }
    catch (e) { errors.push(`ElevenLabs: ${e.message}`); }
  }
  if (hasGemini()) {
    try { const id = await gemini(say, agentId); lastProvider = 'gemini'; lastError = null; return id; }
    catch (e) { errors.push(`Gemini: ${e.message}`); }
  }
  lastError = errors.join(' | ').slice(0, 400);
  console.warn(`[voice] ${lastError}`);
  return null;
}

// Split a reply so the first sentence can start playing while the rest is still being generated.
function chunks(text) {
  const clean = cleanForSpeech(text);
  const parts = clean.split(/(?<=[.!?؟…\n])\s+/).filter((p) => p.trim());
  if (parts.length <= 1 || clean.length < 90) return [clean];
  let first = parts.shift();
  while (first.length < 40 && parts.length > 1) first += ' ' + parts.shift(); // avoid a tiny first clip
  return [first, parts.join(' ')];
}
// Calls onChunk(index, total, audioIdOrNull) as each piece is ready (pieces are generated in parallel).
function speakInChunks(text, agentId, onChunk) {
  if (!enabled()) return;
  const list = chunks(text);
  list.forEach((piece, i) => synthesize(piece, agentId).then((id) => onChunk(i, list.length, id)).catch(() => onChunk(i, list.length, null)));
}

const status = () => ({ enabled: enabled(), provider: lastProvider, elevenlabs: hasEleven(), gemini: hasGemini(), voices: elevenVoices.count || null, lastError });

module.exports = { synthesize, speakInChunks, clips, enabled, status };
