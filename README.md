<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/52e11641-ce04-4535-8704-4e835e5b87b2

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
- The same server serves the built Vite assets in production. The `start` script runs `NODE_ENV=production node --loader tsx server.ts`, which serves `dist/` after `npm run build`.

## SEO additions
- Added descriptive meta tags (title, description, keywords, Open Graph, Twitter card) in `index.html`.
- Added `robots.txt` and `sitemap.xml` in `public/` for crawler friendliness.
