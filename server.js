const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Security Headers (CSP disabled temporarily due to AdSense issues) ────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ── HTTP Rate Limiting ────────────────────────────────────────────────────────
const httpLimiter = rateLimit({
  windowMs: 15 * 1000,  // 15 seconds
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
app.use(httpLimiter);

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));

// Serve static files (index.html, etc.) from the root directory for local testing
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for Vercel deployment
    methods: ['GET', 'POST']
  }
});

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const rooms = {}; // { roomCode: { hostId: socket.id } }

// Per-socket limiter for high-frequency game events (chat, movement, inputs)
const gameEventLimiter = rateLimit({
  windowMs: 1000,   // 1 second
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => req.socket.id,
  handler: () => {}, // silently drop excess
});

// ── Server-side validation of guest payloads ───────────────────────────────
const VALID_GUEST_TYPES = new Set(['CHAT', 'MOVE', 'INPUT', 'PING']);

function sanitizeGuestPayload(data) {
  if (!data || typeof data !== 'object') return null;
  const { type, payload } = data;
  if (typeof type !== 'string' || !VALID_GUEST_TYPES.has(type)) return null;
  if (payload !== undefined && typeof payload !== 'object') return null;
  if (payload) {
    const json = JSON.stringify(payload);
    if (json.length > 4096) return null; // 4KB cap on payload
  }
  return { type, payload: payload || null };
}

function sanitizeRoomCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{1,8}$/.test(code) ? code : null;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Host creates a room
  socket.on('CREATE_ROOM', (callback) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }
    rooms[roomCode] = { hostId: socket.id };
    socket.join(roomCode);
    callback({ success: true, roomCode });
  });

  // Guest joins a room
  socket.on('JOIN_ROOM', (data, callback) => {
    const roomCode = sanitizeRoomCode(data && data.roomCode);
    if (!roomCode) return callback({ success: false, message: '방 코드를 다시 확인해 주세요.' });
    const room = rooms[roomCode];
    if (room) {
      socket.join(roomCode);
      // Notify host that a guest is trying to join (payload capped at 4KB)
      let payload = data && data.payload;
      if (payload && JSON.stringify(payload).length > 4096) payload = null;
      io.to(room.hostId).emit('GUEST_JOINING', { guestId: socket.id, payload });
      callback({ success: true });
    } else {
      callback({ success: false, message: '방 코드를 다시 확인해 주세요.' });
    }
  });

  // Guest sends data to Host
  socket.on('SEND_TO_HOST', (data) => {
    const cleaned = sanitizeGuestPayload(data);
    if (!cleaned) return;
    const roomCode = sanitizeRoomCode(data.roomCode);
    if (!roomCode) return;
    const room = rooms[roomCode];
    if (room) {
      io.to(room.hostId).emit('DATA_FROM_GUEST', { guestId: socket.id, type: cleaned.type, payload: cleaned.payload });
    }
  });

  // Host sends data to a specific Guest
  socket.on('SEND_TO_GUEST', (data) => {
    const cleaned = sanitizeGuestPayload(data);
    if (!cleaned) return;
    if (typeof data.guestId !== 'string' || data.guestId.length > 64) return;
    io.to(data.guestId).emit('DATA_FROM_HOST', { type: cleaned.type, payload: cleaned.payload });
  });

  // Host broadcasts data to all Guests in the room
  socket.on('BROADCAST_TO_ROOM', (data) => {
    const cleaned = sanitizeGuestPayload(data);
    if (!cleaned) return;
    const roomCode = sanitizeRoomCode(data.roomCode);
    if (!roomCode) return;
    socket.to(roomCode).emit('DATA_FROM_HOST', { type: cleaned.type, payload: cleaned.payload });
  });

  // Handle Disconnection
  socket.on('disconnecting', () => {
    for (const roomCode of socket.rooms) {
      if (rooms[roomCode]) {
        if (rooms[roomCode].hostId === socket.id) {
          // If Host disconnects, notify all guests and delete room
          socket.to(roomCode).emit('HOST_DISCONNECTED');
          delete rooms[roomCode];
        } else {
          // If Guest disconnects, notify Host
          io.to(rooms[roomCode].hostId).emit('GUEST_DISCONNECTED', { guestId: socket.id });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});
