// Server-side voices: turns an agent's reply into speech so every browser and phone hears it.
// Main voice: ElevenLabs (your account; Fadi speaks with your Lebanese voice). Backup: Gemini text-to-speech.
const crypto = require('crypto');
const { team } = require('./team');

let lastError = null; // shown in Settings so you can see why a voice failed
let lastProvider = null;
const clips = new Map(); // id -> { buf, type, at }
setInterval(() => { const now = Date.now(); for (const [k, v] of clips) if (now - v.at > 15 * 60e3) clips.delete(k); }, 60e3).unref();

const hasAzure = () => !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
const hasEleven = () => !!process.env.ELEVENLABS_API_KEY;
const hasGemini = () => !!process.env.GEMINI_API_KEY;
const enabled = () => (hasAzure() || hasEleven() || hasGemini()) && process.env.SERVER_VOICE !== 'off';

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

// ---------------- Microsoft Azure (free tier: 500,000 characters a month) ----------------
// Real Lebanese neural voices (Rami, Layla) first, then other Levantine voices so every agent sounds different.
const AZ_MALE = ['ar-LB-RamiNeural', 'ar-SY-LaithNeural', 'ar-JO-TaimNeural'];
const AZ_FEMALE = ['ar-LB-LaylaNeural', 'ar-SY-AmanyNeural', 'ar-JO-SanaNeural'];
const AZ_PITCH = ['+0%', '-6%', '+6%', '-3%', '+3%']; // same voice twice? a slightly different pitch keeps them apart
const azureVoiceFor = (() => {
  const map = {}; let m = 0, f = 0;
  const order = ['fadi', 'dana', ...team.map((a) => a.id).filter((id) => id !== 'fadi' && id !== 'dana')]; // Fadi & Dana get the Lebanese voices
  for (const id of order) {
    const a = team.find((x) => x.id === id); if (!a) continue;
    const i = a.gender === 'f' ? f++ : m++;
    const list = a.gender === 'f' ? AZ_FEMALE : AZ_MALE;
    map[id] = { name: list[i % list.length], pitch: AZ_PITCH[Math.floor(i / list.length) % AZ_PITCH.length] };
  }
  return (id) => map[id] || { name: 'ar-LB-RamiNeural', pitch: '+0%' };
})();
const xml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
async function azure(text, agentId) {
  const arabic = /[؀-ۿ]/.test(text);
  const v = arabic ? azureVoiceFor(agentId) : { name: team.find((a) => a.id === agentId)?.gender === 'f' ? 'en-US-AvaMultilingualNeural' : 'en-US-AndrewMultilingualNeural', pitch: '+0%' };
  const lang = v.name.slice(0, 5);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${v.name}"><prosody rate="+4%" pitch="${v.pitch}">${xml(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'meeting-room' },
    body: ssml,
  });
  if (!r.ok) {
    const msg = r.status === 401 ? 'key or region is wrong' : r.status === 429 ? 'free monthly limit or rate limit reached' : (await r.text().catch(() => '')).slice(0, 160) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return keep(Buffer.from(await r.arrayBuffer()), 'audio/mpeg');
}

// ---------------- ElevenLabs ----------------
// Each agent gets their own voice from your ElevenLabs account. Fadi gets your Lebanese voice; Lebanese/Arabic
// voices are preferred for everyone else, then other voices by gender.
let elevenVoices = { key: null, at: 0, map: {} };
// Free ElevenLabs plans can't use voices from the Voice Library through the API (only the built-in "premade"
// voices). Once we see that refusal, we only pick built-in voices until the plan is upgraded (re-checked hourly).
let libraryBlocked = { key: null, at: 0 };
async function elevenVoiceFor(agentId) {
  const key = process.env.ELEVENLABS_API_KEY;
  const blocked = libraryBlocked.key === key && Date.now() - libraryBlocked.at < 3600e3;
  if (elevenVoices.key !== key || elevenVoices.blocked !== blocked || Date.now() - elevenVoices.at > 3600e3) {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail?.message || j.detail?.status || `voices ${r.status}`);
    const voices = (j.voices || []).filter((v) => !blocked || v.category === 'premade');
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
    elevenVoices = { key, at: Date.now(), map, count: voices.length, blocked };
  }
  return elevenVoices.map[agentId] || Object.values(elevenVoices.map)[0];
}
async function eleven(text, agentId, retried = false) {
  try { return await elevenOnce(text, agentId); }
  catch (e) {
    // free plan + a Voice Library voice: switch to built-in voices and try again once
    if (!retried && /library voices|upgrade your subscription/i.test(e.message)) {
      libraryBlocked = { key: process.env.ELEVENLABS_API_KEY, at: Date.now() };
      return eleven(text, agentId, true);
    }
    throw e;
  }
}
async function elevenOnce(text, agentId) {
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
  if (hasAzure()) {
    try { const id = await azure(say, agentId); lastProvider = 'azure'; lastError = null; return id; }
    catch (e) { errors.push(`Azure: ${e.message}`); }
  }
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

const status = () => ({ enabled: enabled(), provider: lastProvider, azure: hasAzure(), elevenlabs: hasEleven(), gemini: hasGemini(), voices: elevenVoices.count || null,
  builtInOnly: libraryBlocked.key === process.env.ELEVENLABS_API_KEY && Date.now() - libraryBlocked.at < 3600e3, lastError });

// Forget cached voice choices (e.g. right after upgrading the ElevenLabs plan) so the next clip re-checks.
function refresh() { elevenVoices = { key: null, at: 0, map: {} }; libraryBlocked = { key: null, at: 0 }; }

module.exports = { synthesize, speakInChunks, clips, enabled, status, refresh };
