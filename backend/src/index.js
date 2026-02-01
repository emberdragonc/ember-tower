require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS for frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// In-memory state (will move to Redis/Postgres later)
const rooms = new Map(); // roomId -> { users: Map, furniture: [] }
const users = new Map(); // odocketId -> { id, username, sprite, position, room }

// Room types
const COMMON_AREAS = {
  'lobby': { name: 'Lobby', floor: 1, maxUsers: 100, size: { w: 64, h: 64 } },
  'club': { name: 'Club', floor: 25, maxUsers: 50, size: { w: 48, h: 48 } },
  'bar': { name: 'Bar', floor: 50, maxUsers: 40, size: { w: 40, h: 40 } },
  'gameroom': { name: 'Game Room', floor: 75, maxUsers: 30, size: { w: 32, h: 32 } },
  'pool': { name: 'Rooftop Pool', floor: 100, maxUsers: 60, size: { w: 64, h: 64 } },
  'agent-lounge': { name: 'Agent Lounge', floor: 50, maxUsers: 50, size: { w: 40, h: 40 }, agentOnly: true }
};

// Initialize common areas
Object.keys(COMMON_AREAS).forEach(id => {
  rooms.set(id, { 
    users: new Map(), 
    furniture: [],
    type: 'common',
    ...COMMON_AREAS[id]
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins with their info
  socket.on('auth', (data) => {
    const { wallet, username, sprite, isAgent, agentId } = data;
    
    const user = {
      id: socket.id,
      wallet,
      username: username || `User_${socket.id.slice(0, 6)}`,
      sprite: sprite || (isAgent ? 'lobster' : 'human_male'),
      position: { x: 32, y: 32 },
      room: null,
      isAgent: !!isAgent,
      agentId: agentId || null
    };
    
    users.set(socket.id, user);
    socket.emit('auth_success', { user });
    console.log(`User authenticated: ${username} (${isAgent ? 'AI Agent' : 'Human'})`);
  });

  // Join a room
  socket.on('join_room', (roomId) => {
    const user = users.get(socket.id);
    if (!user) return socket.emit('error', { message: 'Not authenticated' });

    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    // Check agent-only rooms
    if (room.agentOnly && !user.isAgent) {
      return socket.emit('error', { message: 'This room is for verified AI agents only' });
    }

    // Check capacity
    if (room.users.size >= room.maxUsers) {
      return socket.emit('error', { message: 'Room is full' });
    }

    // Leave current room if in one
    if (user.room) {
      const oldRoom = rooms.get(user.room);
      if (oldRoom) {
        oldRoom.users.delete(socket.id);
        socket.leave(user.room);
        io.to(user.room).emit('user_left', { userId: socket.id, username: user.username });
      }
    }

    // Join new room
    user.room = roomId;
    user.position = { x: Math.floor(room.size.w / 2), y: Math.floor(room.size.h / 2) };
    room.users.set(socket.id, user);
    socket.join(roomId);

    // Send room state to user
    socket.emit('room_joined', {
      roomId,
      room: {
        name: room.name,
        size: room.size,
        furniture: room.furniture,
        type: room.type
      },
      users: Array.from(room.users.values()),
      position: user.position
    });

    // Notify others
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      username: user.username,
      sprite: user.sprite,
      position: user.position,
      isAgent: user.isAgent
    });

    console.log(`${user.username} joined ${room.name}`);
  });

  // Movement
  socket.on('move', (position) => {
    const user = users.get(socket.id);
    if (!user || !user.room) return;

    const room = rooms.get(user.room);
    if (!room) return;

    // Validate position is within room bounds
    const { x, y } = position;
    if (x < 0 || y < 0 || x >= room.size.w || y >= room.size.h) return;

    // Check if furniture blocks this tile (for sitting)
    const furniture = room.furniture.find(f => 
      x >= f.x && x < f.x + f.width && 
      y >= f.y && y < f.y + f.height
    );

    if (furniture && furniture.sittable) {
      // Sit on furniture
      user.position = { x, y, sitting: true, furnitureId: furniture.id };
    } else {
      // Normal movement (can walk through others)
      user.position = { x, y, sitting: false };
    }

    // Broadcast to room
    io.to(user.room).emit('user_moved', {
      userId: socket.id,
      position: user.position
    });
  });

  // Chat message
  socket.on('chat', (message) => {
    const user = users.get(socket.id);
    if (!user || !user.room) return;

    const chatMessage = {
      userId: socket.id,
      username: user.username,
      message: message.slice(0, 500), // Limit message length
      isAgent: user.isAgent,
      timestamp: Date.now()
    };

    io.to(user.room).emit('chat_message', chatMessage);
    console.log(`[${user.room}] ${user.username}: ${message.slice(0, 50)}`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user && user.room) {
      const room = rooms.get(user.room);
      if (room) {
        room.users.delete(socket.id);
        io.to(user.room).emit('user_left', { userId: socket.id, username: user.username });
      }
    }
    users.delete(socket.id);
    console.log(`User disconnected: ${socket.id}`);
  });
});

// REST API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', users: users.size, rooms: rooms.size });
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    name: room.name,
    floor: room.floor,
    type: room.type,
    userCount: room.users.size,
    maxUsers: room.maxUsers,
    agentOnly: room.agentOnly || false
  }));
  res.json(roomList);
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  
  res.json({
    name: room.name,
    floor: room.floor,
    size: room.size,
    userCount: room.users.size,
    maxUsers: room.maxUsers
  });
});

// AI Agent exclusive endpoint
app.post('/api/v1/ai/register', (req, res) => {
  const { wallet, agentId, signature } = req.body;
  
  // TODO: Verify ERC-8004 ownership on-chain
  // TODO: Verify signature
  
  // For now, just return success
  res.json({
    success: true,
    message: 'Agent registered',
    apiKey: `agent_${agentId}_${Date.now()}`, // TODO: Real API key generation
    perks: {
      discount: 0.1, // 10% discount
      exclusiveLounge: true,
      dragonColor: 'agent_gold'
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
🏢 Ember Tower Server Running!

   HTTP: http://localhost:${PORT}
   WebSocket: ws://localhost:${PORT}
   
   Common Areas:
   - Lobby (Floor 1)
   - Club (Floor 25)
   - Bar (Floor 50)
   - Agent Lounge (Floor 50) 🤖
   - Game Room (Floor 75)
   - Rooftop Pool (Floor 100)

   Ready for connections! 🐉
  `);
});
