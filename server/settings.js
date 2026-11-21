// Settings you change from the HQ (AI keys, provider). Saved inside the office database
// (data/db.json locally, the Key-Value store in the cloud). Host environment variables always win.
const store = require('./store');

const KEYS = ['AI_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'TREND_TOPICS', 'CF_TURN_KEY_ID', 'CF_TURN_TOKEN', 'METERED_DOMAIN', 'METERED_API_KEY'];
const fromHost = new Set(KEYS.filter((k) => process.env[k]));

function load() {
  const s = store.db.settings || {};
  for (const k of KEYS) if (!fromHost.has(k) && s[k]) process.env[k] = s[k];
}
function save(patch) {
  const s = (store.db.settings ||= {});
  for (const k of KEYS) {
    if (patch[k] === undefined) continue;
    if (patch[k] === '') { delete s[k]; if (!fromHost.has(k)) delete process.env[k]; }
    else { s[k] = String(patch[k]).trim(); if (!fromHost.has(k)) process.env[k] = s[k]; }
  }
  store.save();
}
const mask = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-4)}` : '');
function view() {
  return {
    provider: process.env.AI_PROVIDER || 'auto',
    gemini: mask(process.env.GEMINI_API_KEY), groq: mask(process.env.GROQ_API_KEY), claude: mask(process.env.ANTHROPIC_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || '',
    cfTurn: mask(process.env.CF_TURN_TOKEN), cfTurnId: process.env.CF_TURN_KEY_ID ? mask(process.env.CF_TURN_KEY_ID) : '',
    metered: mask(process.env.METERED_API_KEY), meteredDomain: process.env.METERED_DOMAIN || '',
    fromHost: [...fromHost],
  };
}
module.exports = { load, save, view };
