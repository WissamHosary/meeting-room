# Meeting Room

Your AI company in a 3D office. Fourteen agents live there. They walk between the boardroom, desks, coffee bar, cafeteria, game room, gym and pool. You can talk to them by voice or text, and bring clients into real meetings with them.

## Start it

```bash
npm install
npm start
```

The server window prints your **private HQ link** (`http://localhost:3000/?key=...`). Open it in **Microsoft Edge**, which has free natural-sounding voices, or in Chrome. Keep that link to yourself, because the key gives full control.

## The team

| Name | Role | Name | Role |
|---|---|---|---|
| Fadi | General Manager (runs everyone) | Jad | Client Success |
| Dana | Memory Keeper (everything about you) | Rita | QA Tester |
| Liwaa | Trend Scout (live news) | Rami | Head of Sales |
| Hussien | Video Editor | Lara | Social Media Lead |
| Sebahi | Researcher (Wikipedia + news) | Omar | Creative Director |
| Karim | Meeting Recorder | Nour / Ziad | Flutter / Web Engineer |
| | | Hadi | Finance & Legal |

## How they behave

- They **only speak when spoken to by name**. With no name, Fadi answers in the office. In a client meeting, nobody answers unless named.
- They speak out loud only when **answering you**, or **once when they finish a task**.
- When you call someone, they **walk to the boardroom** to talk to you, then go back to what they were doing.
- They never say work is done unless it's marked done on the **task board**.

Example commands:
- `Fadi, assign Ziad to build the QR menu for Wing House`
- `Dana, remember that I hate light designs`
- `Liwaa, what's new in TikTok marketing?`
- `Sebahi, research loyalty apps in Lebanon`
- In a client meeting: `Ziad, did you finish the QR menu?` or `Fadi, give the client the full update`

## AI brain: free options

With no key, a built-in "office brain" runs. It handles task status, memory, news and research, and costs nothing.
For fully natural conversation, put **one free key** in `.env` and restart:

- **Gemini (free):** https://aistudio.google.com/apikey → `GEMINI_API_KEY=...`
- **Groq (free):** https://console.groq.com/keys → `GROQ_API_KEY=...`
- **Claude (paid, best):** `ANTHROPIC_API_KEY=...`, for when you're ready to pay.

## Meetings with clients

1. HQ → **Meetings** → create a room and choose the client and agents. Fadi and Karim always attend.
2. Send the invite link. Guests join from their browser with nothing to install.
3. Press **record** and Karim announces it. Press **End meeting** and Karim writes the notes.

To let people **outside your Wi-Fi** join, you need a public https link. The free option is a Cloudflare quick tunnel:
`cloudflared tunnel --url http://localhost:3000`. It prints a `https://….trycloudflare.com` address to share.

## The characters

Every agent is an original, animated-movie-style 3D character drawn in code (`public/js/characters.js`), with their own face, hair, outfit and props. Their looks are defined in `server/team.js` under `looks`: change hair, colours, outfit or props there.
They walk, run on treadmills, swim laps, think with a hand on their chin, blink, and talk with their mouth and hands. Their profile pictures are rendered from the same 3D model.

## Going live on Render (free)

`render.yaml` sets up a free web service plus a free Key-Value store, so your data survives the free server sleeping.
1. Push this folder to a GitHub repository.
2. In Render: **New → Blueprint**, pick the repo, and approve.
3. Open the service → **Environment** → copy `OWNER_KEY`. Your HQ is `https://<your-app>.onrender.com/?key=<OWNER_KEY>`.
4. In the HQ go to **Settings** and paste your free Gemini key.

The free plan sleeps after 15 minutes without visitors, and the first visit after that takes about a minute. Meeting recordings are stored on the server's disk, which resets on restart, so download the ones you want to keep.

## Where things are saved

Everything stays on your PC in `data/`: memories, clients, tasks, transcripts and recordings.
