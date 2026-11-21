// Small database for the whole office.
// Locally: a JSON file in data/. In the cloud (REDIS_URL set): a free Render Key-Value store,
// so memories, tasks and clients survive the free server going to sleep.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const REDIS_KEY = 'meeting-room:db';
fs.mkdirSync(path.join(DATA_DIR, 'recordings'), { recursive: true });

const seed = {
  memories: [
    { id: 'm1', text: 'Wissam is the founder of Mukafaah, a loyalty points app for restaurants, retail and salons.', at: new Date().toISOString() },
    { id: 'm2', text: 'Wissam likes premium, cinematic, brand-driven designs, never plain.', at: new Date().toISOString() },
    { id: 'm3', text: 'Wissam speaks English, Arabic and Lebanese Arabizi, often mixed together.', at: new Date().toISOString() },
  ],
  clients: [],
  tasks: [],
  office: [],      // office chat messages
  meetings: [],
  overrides: {},   // god-mode: agentId -> place
  settings: {},    // keys and options saved from the HQ Settings screen
};

let db = structuredClone(seed);
let redis = null;
const fill = () => { for (const k of Object.keys(seed)) if (db[k] === undefined) db[k] = structuredClone(seed[k]); };

async function init() {
  if (process.env.REDIS_URL) {
    const { createClient } = require('redis');
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', (e) => console.error('[store] redis', e.message));
    await redis.connect();
    const raw = await redis.get(REDIS_KEY);
    if (raw) db = JSON.parse(raw);
    console.log(`[store] using cloud key-value store (${raw ? 'loaded' : 'new'})`);
  } else {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = structuredClone(seed); }
  }
  fill(); save();
}

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const json = JSON.stringify(db, null, redis ? 0 : 2);
    if (redis) redis.set(REDIS_KEY, json).catch((e) => console.error('[store] save failed', e.message));
    else fs.writeFileSync(DB_FILE, json);
  }, 150);
}
const id = (p) => p + Math.random().toString(36).slice(2, 9);

module.exports = { get db() { return db; }, init, save, id, DATA_DIR };
