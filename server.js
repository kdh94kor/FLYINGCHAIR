const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static files (index.html, etc.) from the root directory for local testing
app.use(express.static(__dirname));

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
    const { roomCode, payload } = data;
    const room = rooms[roomCode];
    if (room) {
      socket.join(roomCode);
      // Notify host that a guest is trying to join
      io.to(room.hostId).emit('GUEST_JOINING', { guestId: socket.id, payload });
      callback({ success: true });
    } else {
      callback({ success: false, message: '방 코드를 다시 확인해 주세요.' });
    }
  });

  // Guest sends data to Host
  socket.on('SEND_TO_HOST', (data) => {
    const { roomCode, type, payload } = data;
    const room = rooms[roomCode];
    if (room) {
      io.to(room.hostId).emit('DATA_FROM_GUEST', { guestId: socket.id, type, payload });
    }
  });

  // Host sends data to a specific Guest
  socket.on('SEND_TO_GUEST', (data) => {
    const { guestId, type, payload } = data;
    io.to(guestId).emit('DATA_FROM_HOST', { type, payload });
  });

  // Host broadcasts data to all Guests in the room
  socket.on('BROADCAST_TO_ROOM', (data) => {
    const { roomCode, type, payload } = data;
    socket.to(roomCode).emit('DATA_FROM_HOST', { type, payload });
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
