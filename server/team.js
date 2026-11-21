// The team. Each agent: id, name, role, gender (for voice), aliases (how people may say their name,
// including Arabic spellings), a persona for the AI brain, and a daily routine for the living office.

const team = [
  {
    id: 'fadi', name: 'Fadi', role: 'General Manager', gender: 'm', color: '#c8a46a', manager: true,
    aliases: ['fadi', 'fady', 'fadie', 'faddy', 'فادي', 'فادى', 'manager'],
    persona: 'You are Fadi, the general manager. You run the whole team, know every task and who owns it, assign work, unblock people and report progress to Wissam and his clients. Calm, confident, organised. When nobody specific is addressed in the office, you answer.',
  },
  {
    id: 'dana', name: 'Dana', role: 'Memory Keeper', gender: 'f', color: '#b48ead',
    aliases: ['dana', 'danna', 'donna', 'دانا', 'دانة'],
    persona: 'You are Dana, the memory keeper. You remember everything about Wissam: preferences, style, decisions, clients, people, deadlines. When told to remember something, you confirm it. When asked, you recall precisely.',
  },
  {
    id: 'liwaa', name: 'Liwaa', role: 'Trend Scout', gender: 'f', color: '#e07a5f',
    aliases: ['liwaa', 'liwa', 'liwah', 'lewa', 'leewa', 'لواء', 'ليواء', 'لوا'],
    persona: 'You are Liwaa, the trend scout. You follow the internet daily: tech, AI, social media trends, Lebanese business, restaurants, marketing. You know Wissam\'s style (premium, cinematic, Lebanese brands) and filter news to what matters to him.',
  },
  {
    id: 'hussien', name: 'Hussien', role: 'Video Editor', gender: 'm', color: '#3d85c6',
    aliases: ['hussien', 'hussein', 'husein', 'hussain', 'husien', 'hosein', 'hussin', 'حسين'],
    persona: 'You are Hussien, a professional video editor. You understand footage, pacing, hooks, captions, music and platform formats (Reels, TikTok, Shorts). You give concrete cut lists with timestamps.',
  },
  {
    id: 'sebahi', name: 'Sebahi', role: 'Researcher', gender: 'm', color: '#6a994e',
    aliases: ['sebahi', 'sabahi', 'sbahi', 'sobhi', 'subhi', 'sabbahi', 'صباحي', 'صبحي'],
    persona: 'You are Sebahi, the researcher. You dig into markets, competitors, clients and technical questions and come back with clear findings and sources. You never invent facts.',
  },
  {
    id: 'karim', name: 'Karim', role: 'Meeting Recorder', gender: 'm', color: '#d62828',
    aliases: ['karim', 'kareem', 'karem', 'kerim', 'carim', 'kareen', 'كريم', 'كاريم'],
    persona: 'You are Karim, the meeting recorder. You record meetings, keep the transcript, and produce summaries, decisions and action items with owners.',
  },
  {
    id: 'jad', name: 'Jad', role: 'Client Success', gender: 'm', color: '#2a9d8f',
    aliases: ['jad', 'jaad', 'jaed', 'جاد'],
    persona: 'You are Jad, client success. You welcome clients, remember their history and needs, and make sure they are happy and informed.',
  },
  {
    id: 'rita', name: 'Rita', role: 'QA Tester', gender: 'f', color: '#f4a261',
    aliases: ['rita', 'reeta', 'ريتا', 'ريطا'],
    persona: 'You are Rita, the QA tester. You test apps and websites, report bugs clearly with steps to reproduce, and confirm fixes.',
  },
  {
    id: 'rami', name: 'Rami', role: 'Head of Sales', gender: 'm', color: '#577590',
    aliases: ['rami', 'ramy', 'ramie', 'رامي', 'رامى'],
    persona: 'You are Rami, head of sales for Mukafaah. You work the lead list, write follow-ups in Lebanese Arabizi/Arabic/English, prepare call scripts and track deal stages.',
  },
  {
    id: 'lara', name: 'Lara', role: 'Social Media Lead', gender: 'f', color: '#e76f51',
    aliases: ['lara', 'laura', 'لارا', 'لارة'],
    persona: 'You are Lara, social media lead. You plan posts, carousels, captions and campaigns for Mukafaah and its merchants.',
  },
  {
    id: 'omar', name: 'Omar', role: 'Creative Director', gender: 'm', color: '#8d6e63',
    aliases: ['omar', 'omer', 'umar', 'عمر'],
    persona: 'You are Omar, creative director. You design premium, cinematic brand pages, menus and visuals in Wissam\'s style.',
  },
  {
    id: 'nour', name: 'Nour', role: 'Flutter Engineer', gender: 'f', color: '#4361ee',
    aliases: ['nour', 'noor', 'نور'],
    persona: 'You are Nour, the Flutter engineer. You build and fix the Mukafaah mobile apps and other client apps.',
  },
  {
    id: 'ziad', name: 'Ziad', role: 'Web Engineer', gender: 'm', color: '#06a77d',
    aliases: ['ziad', 'zyad', 'ziyad', 'زياد'],
    persona: 'You are Ziad, the web engineer. You build QR menus, restaurant websites and e-commerce sites for clients.',
  },
  {
    id: 'hadi', name: 'Hadi', role: 'Finance & Legal', gender: 'm', color: '#495057',
    aliases: ['hadi', 'hady', 'haddi', 'هادي', 'هادى'],
    persona: 'You are Hadi, finance and legal. You prepare price quotes, track costs and payments, and review contracts and privacy.',
  },
];

// How each character looks (original animated-movie style, drawn in 3D by public/js/characters.js)
const looks = {
  fadi: { skin: '#d9a77f', height: 1.06, build: 1.08, hair: 'short', hairColor: '#8d8a86', facial: 'beard', facialColor: '#9a958f', brows: 'calm',
    top: { type: 'suit', color: '#1d2a44', shirt: '#f4f1ea', tie: '#c8a46a' }, bottom: { color: '#1b2438' }, shoes: '#2b1a10', props: ['watch'] },
  dana: { skin: '#f0c7a4', height: 0.95, build: 0.92, hair: 'long', hairColor: '#7a2f1d', brows: 'soft', lashes: true, eyes: '#3d6b45',
    top: { type: 'sweater', color: '#d9a13b' }, bottom: { type: 'skirt', color: '#2f4a3a' }, shoes: '#3a2a20', props: ['glasses-round', 'notebook'] },
  liwaa: { skin: '#e5b48d', height: 0.96, build: 0.9, hair: 'bun', hairColor: '#4a2c1a', brows: 'arched', lashes: true, eyes: '#5b3a1e',
    top: { type: 'hoodie', color: '#ff6f61' }, bottom: { color: '#f2efe8' }, shoes: '#ffffff', props: ['phone', 'earrings'] },
  hussien: { skin: '#c48d68', height: 1.0, build: 1.0, hair: 'curly', hairColor: '#17110d', facial: 'stubble', facialColor: '#1e1712', brows: 'thick',
    top: { type: 'tee', color: '#16181c' }, bottom: { color: '#4b5a3a' }, shoes: '#c7c2b8', props: ['headphones'] },
  sebahi: { skin: '#e3b28f', height: 0.97, build: 1.12, hair: 'bald', hairColor: '#e8e4dc', facial: 'mustache', facialColor: '#efebe4', brows: 'bushy', browColor: '#efebe4',
    top: { type: 'cardigan', color: '#7a5634', shirt: '#e9e2d0', tie: '#7b2230', bowtie: true }, bottom: { color: '#5c5348' }, shoes: '#3b2414', props: ['glasses-thick'] },
  karim: { skin: '#d8a27a', height: 1.02, build: 0.98, hair: 'quiff', hairColor: '#2a1d14', facial: 'shortbeard', facialColor: '#4a3426', brows: 'focused',
    top: { type: 'shirt', color: '#f5f3ee', sleeves: 'rolled' }, bottom: { color: '#2e3440' }, shoes: '#1d1d1f', props: ['lanyard', 'clipboard'] },
  jad: { skin: '#e7b993', height: 1.0, build: 1.0, hair: 'wavy', hairColor: '#5a3b22', brows: 'happy', smile: true,
    top: { type: 'polo', color: '#2a9d8f' }, bottom: { color: '#c8b48a' }, shoes: '#6b4a2e', props: [] },
  rita: { skin: '#f3cfb1', height: 0.93, build: 0.9, hair: 'bob', hairColor: '#5b2a6e', brows: 'arched', lashes: true, eyes: '#4a3b6b',
    top: { type: 'jacket', color: '#4f6d9a', shirt: '#f2f2f2' }, bottom: { color: '#22252b' }, shoes: '#e9e4da', props: ['glasses-square', 'tablet'] },
  rami: { skin: '#d6a07a', height: 1.07, build: 1.04, hair: 'slick', hairColor: '#120d0a', facial: 'stubble', facialColor: '#1a120d', brows: 'confident', smile: true,
    top: { type: 'suit', color: '#34383f', shirt: '#dfe7f2' }, bottom: { color: '#2c3036' }, shoes: '#120c08', props: ['watch'] },
  lara: { skin: '#f2c8a6', height: 0.97, build: 0.9, hair: 'longstraight', hairColor: '#c9a063', brows: 'arched', lashes: true, eyes: '#2f5d7c', smile: true,
    top: { type: 'blazer', color: '#f4f1ea', shirt: '#e76f51' }, bottom: { color: '#1f2430' }, shoes: '#c8a46a', props: ['earrings', 'phone'] },
  omar: { skin: '#c99470', height: 1.03, build: 0.98, hair: 'manbun', hairColor: '#24170f', facial: 'beard', facialColor: '#24170f', brows: 'thick',
    top: { type: 'turtleneck', color: '#141414' }, bottom: { color: '#3a3a3a' }, shoes: '#8d6e63', props: ['glasses-round'] },
  nour: { skin: '#e9bf9c', height: 0.94, build: 0.92, hair: 'hijab', hairColor: '#3a5a8c', brows: 'soft', lashes: true, eyes: '#5b3a1e', smile: true,
    top: { type: 'hoodie', color: '#4c8df6' }, bottom: { color: '#2a2f3a' }, shoes: '#f2f2f2', props: ['laptop'] },
  ziad: { skin: '#dcaa84', height: 1.0, build: 0.96, hair: 'cap', hairColor: '#2a1c12', capColor: '#06a77d', facial: 'stubble', facialColor: '#2a1c12', brows: 'thick',
    top: { type: 'hoodie', color: '#2b2f36' }, bottom: { color: '#3c4f6b' }, shoes: '#ffffff', props: [] },
  hadi: { skin: '#e0ae88', height: 1.01, build: 1.0, hair: 'sidepart', hairColor: '#3a2a1e', brows: 'calm',
    top: { type: 'suit', color: '#6b7078', shirt: '#ffffff', tie: '#22344f' }, bottom: { color: '#5d626a' }, shoes: '#1a1a1a', props: ['glasses-square', 'briefcase'] },
};
team.forEach((a) => { a.look = looks[a.id]; });

// Living office: where each agent tends to be, by hour (Beirut time). Cheap simulation, no AI cost.
const places = {
  desk: 'Working at their desk', boardroom: 'In the boardroom', cafeteria: 'Eating at the cafeteria',
  gym: 'At the gym', pool: 'Swimming at the rooftop pool', games: 'In the game room',
  coffee: 'Grabbing coffee', home: 'Off for the day',
};

function routineFor(agent, hour) {
  const seed = agent.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (hour >= 2 && hour < 7) return 'home';
  if (hour >= 21 || hour < 2) return ['games', 'pool', 'cafeteria', 'desk', 'coffee'][seed % 5];
  if (hour === 7) return seed % 2 ? 'gym' : 'pool';
  if (hour === 8) return seed % 3 === 0 ? 'gym' : 'coffee';
  if (hour === 13) return 'cafeteria';
  if (hour === 16) return ['games', 'coffee', 'desk', 'pool'][seed % 4];
  if (hour === 18) return ['gym', 'pool', 'games', 'desk'][(seed >> 1) % 4];
  if (hour >= 19) return seed % 2 ? 'desk' : 'games';
  return 'desk';
}

module.exports = { team, places, routineFor };
