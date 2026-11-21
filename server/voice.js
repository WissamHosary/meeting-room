// Server-side voices: turns an agent's reply into speech with Gemini's text-to-speech (free with your key),
// so every browser and phone hears it, even ones with no Arabic voice installed.
const crypto = require('crypto');
const { team } = require('./team');

// Gemini prebuilt voices, picked per agent so everyone sounds different.
const FEMALE = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome'];
const MALE = ['Charon', 'Puck', 'Fenrir', 'Orus', 'Iapetus', 'Algieba', 'Alnilam', 'Schedar', 'Enceladus', 'Achird'];
const voiceFor = (() => {
  const map = {}; let f = 0, m = 0;
  for (const a of team) map[a.id] = a.gender === 'f' ? FEMALE[f++ % FEMALE.length] : MALE[m++ % MALE.length];
  return (id) => map[id] || 'Kore';
})();

const MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];
let working = null;
const clips = new Map(); // id -> { buf, type, at }
setInterval(() => { const now = Date.now(); for (const [k, v] of clips) if (now - v.at > 15 * 60e3) clips.delete(k); }, 60e3).unref();

const enabled = () => !!process.env.GEMINI_API_KEY && process.env.SERVER_VOICE !== 'off';

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

// raw 16-bit PCM -> WAV so every browser can play it
function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function synthesize(text, agentId) {
  if (!enabled() || !text) return null;
  // Send ONLY the words to say (no instructions), so the voice never reads stage directions out loud.
  const prompt = cleanForSpeech(text).slice(0, 1200);
  if (!prompt) return null;
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS;
  for (const model of order) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceFor(agentId) } } } } }),
      });
      const j = await r.json().catch(() => ({}));
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!r.ok || !part) { console.warn(`[voice] ${model}: ${j.error?.message || 'no audio'}`.slice(0, 160)); continue; }
      let buf = Buffer.from(part.data, 'base64');
      const rate = Number((part.mimeType.match(/rate=(\d+)/) || [])[1] || 24000);
      if (!/wav/i.test(part.mimeType)) buf = pcmToWav(buf, rate);
      working = model;
      const id = crypto.randomBytes(12).toString('base64url');
      clips.set(id, { buf, type: 'audio/wav', at: Date.now() });
      return id;
    } catch (e) { console.warn(`[voice] ${model}: ${e.message}`); }
  }
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

module.exports = { synthesize, speakInChunks, clips, enabled };
