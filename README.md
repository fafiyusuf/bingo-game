

# Run and deploy your AI Studio app
## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) If you add Gemini-powered features later, set `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key. The current bingo app does not use it.
3. Run the app:
   `npm run dev`

## Deploy to Render

Render supports long‑lived Node processes, WebSockets, and persistent disks, which fits this Express + Socket.IO + SQLite app.

**Service type:** Web Service (Node)

**Build command:**
```
npm install && npm run build
```

**Start command:**
```
npm run start
```

**Environment variables:**
- `GEMINI_API_KEY` – only needed if you enable Gemini features (not used by the current bingo app).
- `DATABASE_FILE` – absolute path to the SQLite file on your persistent disk. Example: `/opt/render/project/.data/bingo.db`.

**Persistent disk:**
- Add a disk in Render and mount it at `/opt/render/project/.data` (or your chosen path).
- Set `DATABASE_FILE` to that path so the SQLite file persists across deploys.

**Ports and networking:**
- The server reads `PORT` automatically; Render injects it.
- WebSockets work by default on Render; no extra config needed.

**Frontend:**
- The same server serves the built Vite assets in production. The `start` script runs `NODE_ENV=production node --import tsx server.ts`, which serves `dist/` after `npm run build`.

**Common local issue:** If you see `EADDRINUSE 0.0.0.0:3000`, set a free port when starting, e.g. `PORT=3001 npm run start`.

## SEO additions
- Added descriptive meta tags (title, description, keywords, Open Graph, Twitter card) in `index.html`.
- Added `robots.txt` and `sitemap.xml` in `public/` for crawler friendliness.
