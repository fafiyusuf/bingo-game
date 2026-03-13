import Database from "better-sqlite3";
import express from "express";
import fs from "fs";
import { createServer } from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_FILE ?? path.join(__dirname, "bingo.db");

// Ensure the DB directory exists when using a mounted disk
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    creator_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY(room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, name),
    FOREIGN KEY(room_id) REFERENCES rooms(id)
  );
`);

// Migration: Add room_id to winners if it doesn't exist (for older DBs)
try {
  db.prepare("SELECT room_id FROM winners LIMIT 1").get();
} catch (e) {
  // Column doesn't exist, we need to handle it. 
  // Since this is a dev environment and schema changed significantly, 
  // it's safer to just drop and recreate if it's broken, 
  // but let's try a simple add column first if possible.
  try {
    db.exec("ALTER TABLE winners ADD COLUMN room_id INTEGER DEFAULT 0");
  } catch (err) {
    console.error("Migration failed, you might need to delete bingo.db manually");
  }
}

const DEFAULT_STATEMENTS = [
  "Knows Python", "Built a Website", "Loves Cybersecurity", "First-Year Student",
  "Has Joined a Hackathon", "Wants to Learn AI", "Has Felt Imposter Syndrome",
  "Uses GitHub", "Loves Math", "Interested in UX/UI", "Dream Job in Tech",
  "Watches Tech YouTube", "Wants to Work Abroad", "Has a LinkedIn Profile",
  "Participated in a Contest", "Loves Frontend", "Loves Backend",
  "Has Done a Group Project", "Wants to Start a Startup", "Learning JavaScript",
  "Loves Data Science", "Has a Tech Role Model", "Stayed Up Debugging",
  "Mentors Someone"
];

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

  app.use(express.json());

  // Rooms API
  app.post("/api/rooms", (req, res) => {
    const { creatorName } = req.body;
    if (!creatorName) return res.status(400).json({ error: "Creator name is required" });
    
    const code = generateRoomCode();
    const insert = db.prepare("INSERT INTO rooms (code, creator_name) VALUES (?, ?)");
    const result = insert.run(code, creatorName);
    const roomId = Number(result.lastInsertRowid);

    // Seed room with default questions
    const insertQ = db.prepare("INSERT INTO questions (room_id, text) VALUES (?, ?)");
    DEFAULT_STATEMENTS.forEach(q => insertQ.run(roomId, q));

    res.json({ code, roomId });
  });

  app.get("/api/rooms/:code", (req, res) => {
    const room = db.prepare("SELECT * FROM rooms WHERE code = ?").get(req.params.code.toUpperCase()) as any;
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  });

  app.get("/api/rooms/:roomId/players", (req, res) => {
    const players = db.prepare("SELECT name FROM players WHERE room_id = ? ORDER BY joined_at ASC, id ASC").all(req.params.roomId);
    res.json(players.map((p: any) => p.name));
  });

  app.post("/api/rooms/:roomId/join", (req, res) => {
    const { roomId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    
    try {
      const result = db.prepare("INSERT OR IGNORE INTO players (room_id, name) VALUES (?, ?)").run(roomId, name);
      if (result.changes === 0) {
        return res.status(409).json({ error: "That name is already taken in this room." });
      }
      io.to(`room_${roomId}`).emit("player_joined", { name });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to join room" });
    }
  });

  app.get("/api/rooms/:roomId/stats", (req, res) => {
    const { roomId } = req.params;
    const playersCount = db.prepare("SELECT COUNT(*) as count FROM players WHERE room_id = ?").get(roomId) as { count: number };
    const winnersCount = db.prepare("SELECT COUNT(*) as count FROM winners WHERE room_id = ?").get(roomId) as { count: number };
    
    const bingoRate = playersCount.count > 0 ? Math.round((winnersCount.count / playersCount.count) * 100) : 0;
    
    res.json({
      totalPlayers: playersCount.count,
      bingoRate: `${bingoRate}%`
    });
  });

  // Questions API
  app.get("/api/questions/:roomId", (req, res) => {
    const questions = db.prepare("SELECT * FROM questions WHERE room_id = ?").all(req.params.roomId);
    res.json(questions);
  });

  app.post("/api/questions", (req, res) => {
    const { roomId, text } = req.body;
    if (!roomId || !text) return res.status(400).json({ error: "Room ID and text are required" });
    const insert = db.prepare("INSERT INTO questions (room_id, text) VALUES (?, ?)");
    const result = insert.run(roomId, text);
    res.json({ id: Number(result.lastInsertRowid), text });
  });

  app.delete("/api/questions/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM questions WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // API Routes
  app.get("/api/winners/:roomId", (req, res) => {
    const winners = db.prepare("SELECT * FROM winners WHERE room_id = ? ORDER BY timestamp ASC LIMIT 10").all(req.params.roomId);
    res.json(winners);
  });

  app.post("/api/winners", (req, res) => {
    const { roomId, name } = req.body;
    if (!roomId || !name) return res.status(400).json({ error: "Room ID and name are required" });

    const insert = db.prepare("INSERT INTO winners (room_id, name) VALUES (?, ?)");
    const result = insert.run(roomId, name);
    
    const newWinner = { id: Number(result.lastInsertRowid), roomId, name, timestamp: new Date().toISOString() };
    
    // Broadcast to specific room
    io.to(`room_${roomId}`).emit("new_winner", newWinner);
    
    res.json(newWinner);
  });

  io.on("connection", (socket) => {
    socket.on("join_room", (roomId) => {
      socket.join(`room_${roomId}`);
    });
  });

  app.post("/api/reset-winners/:roomId", (req, res) => {
    const { roomId } = req.params;
    db.prepare("DELETE FROM winners WHERE room_id = ?").run(roomId);
    io.to(`room_${roomId}`).emit("winners_reset");
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
