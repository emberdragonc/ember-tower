'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

interface User {
  id: string;
  username: string;
  sprite: string;
  position: { x: number; y: number; sitting?: boolean };
  isAgent: boolean;
}

interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  isAgent: boolean;
  timestamp: number;
}

interface Room {
  name: string;
  size: { w: number; h: number };
  furniture: any[];
  type: string;
}

// Convert grid position to isometric screen position
function gridToIso(x: number, y: number): { x: number; y: number } {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2)
  };
}

// Convert screen position to grid position
function isoToGrid(screenX: number, screenY: number): { x: number; y: number } {
  const x = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2;
  const y = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2;
  return { x: Math.floor(x), y: Math.floor(y) };
}

export default function Game() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userSpritesRef = useRef<Map<string, PIXI.Graphics>>(new Map());
  
  const [connected, setConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [username, setUsername] = useState('');
  const [isAgent, setIsAgent] = useState(false);

  // Initialize PixiJS
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const app = new PIXI.Application({
      width: 800,
      height: 600,
      backgroundColor: 0x1a1a2e,
      antialias: true,
    });

    canvasRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    // Create floor container
    const floorContainer = new PIXI.Container();
    floorContainer.x = 400;
    floorContainer.y = 100;
    app.stage.addChild(floorContainer);

    // Draw isometric floor (default 16x16)
    drawFloor(floorContainer, 16, 16);

    // Click handler for movement
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (e) => {
      const pos = e.global;
      const grid = isoToGrid(pos.x - 400, pos.y - 100);
      if (socketRef.current && grid.x >= 0 && grid.y >= 0) {
        socketRef.current.emit('move', { x: grid.x, y: grid.y });
      }
    });

    return () => {
      app.destroy(true, true);
      appRef.current = null;
    };
  }, []);

  // Draw isometric floor tiles
  function drawFloor(container: PIXI.Container, width: number, height: number) {
    container.removeChildren();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const iso = gridToIso(x, y);
        const tile = new PIXI.Graphics();
        
        // Draw isometric tile
        tile.beginFill((x + y) % 2 === 0 ? 0x3d3d5c : 0x4a4a6a);
        tile.moveTo(0, 0);
        tile.lineTo(TILE_WIDTH / 2, TILE_HEIGHT / 2);
        tile.lineTo(0, TILE_HEIGHT);
        tile.lineTo(-TILE_WIDTH / 2, TILE_HEIGHT / 2);
        tile.closePath();
        tile.endFill();
        
        // Tile border
        tile.lineStyle(1, 0x5a5a7a, 0.3);
        tile.moveTo(0, 0);
        tile.lineTo(TILE_WIDTH / 2, TILE_HEIGHT / 2);
        tile.lineTo(0, TILE_HEIGHT);
        tile.lineTo(-TILE_WIDTH / 2, TILE_HEIGHT / 2);
        tile.closePath();
        
        tile.x = iso.x;
        tile.y = iso.y;
        container.addChild(tile);
      }
    }
  }

  // Draw user sprite
  function drawUserSprite(user: User): PIXI.Graphics {
    const sprite = new PIXI.Graphics();
    const iso = gridToIso(user.position.x, user.position.y);
    
    // Different colors for agents vs humans
    const color = user.isAgent ? 0xff6b6b : 0x4ecdc4;
    
    // Simple character representation (will replace with real sprites)
    sprite.beginFill(color);
    sprite.drawEllipse(0, -20, 15, 10); // Head
    sprite.endFill();
    
    sprite.beginFill(color);
    sprite.drawRect(-10, -10, 20, 25); // Body
    sprite.endFill();
    
    // Name tag
    const nameText = new PIXI.Text(user.username, {
      fontSize: 10,
      fill: 0xffffff,
      align: 'center'
    });
    nameText.anchor.set(0.5);
    nameText.y = -35;
    sprite.addChild(nameText);
    
    // Agent badge
    if (user.isAgent) {
      const badge = new PIXI.Text('🦞', { fontSize: 12 });
      badge.anchor.set(0.5);
      badge.y = -45;
      sprite.addChild(badge);
    }
    
    sprite.x = iso.x;
    sprite.y = iso.y;
    
    return sprite;
  }

  // Update user positions
  useEffect(() => {
    if (!appRef.current) return;
    
    const stage = appRef.current.stage;
    const container = stage.children[0] as PIXI.Container;
    
    // Remove old sprites
    userSpritesRef.current.forEach((sprite) => {
      container.removeChild(sprite);
    });
    userSpritesRef.current.clear();
    
    // Add new sprites
    users.forEach((user) => {
      const sprite = drawUserSprite(user);
      container.addChild(sprite);
      userSpritesRef.current.set(user.id, sprite);
    });
  }, [users]);

  // Socket connection
  const connect = useCallback(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Authenticate
      socket.emit('auth', {
        wallet: '0x...', // TODO: Get from wallet
        username: username || 'Guest',
        isAgent
      });
    });

    socket.on('auth_success', ({ user }) => {
      console.log('Authenticated:', user);
    });

    socket.on('room_joined', ({ roomId, room, users: roomUsers, position }) => {
      setCurrentRoom(room);
      setUsers(roomUsers);
      console.log('Joined room:', room.name);
      
      // Redraw floor for room size
      if (appRef.current) {
        const container = appRef.current.stage.children[0] as PIXI.Container;
        drawFloor(container, room.size.w, room.size.h);
      }
    });

    socket.on('user_joined', (user: User) => {
      setUsers(prev => [...prev, user]);
    });

    socket.on('user_left', ({ userId }) => {
      setUsers(prev => prev.filter(u => u.id !== userId));
    });

    socket.on('user_moved', ({ userId, position }) => {
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, position } : u
      ));
    });

    socket.on('chat_message', (message: ChatMessage) => {
      setMessages(prev => [...prev.slice(-50), message]);
    });

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      alert(message);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [username, isAgent]);

  // Join room
  const joinRoom = (roomId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join_room', roomId);
    }
  };

  // Send chat
  const sendChat = () => {
    if (socketRef.current && chatInput.trim()) {
      socketRef.current.emit('chat', chatInput);
      setChatInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-purple-900 p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">🏢 Ember Tower</h1>
        <div className="flex items-center gap-4">
          <span className={`text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
          {currentRoom && (
            <span className="text-sm">📍 {currentRoom.name}</span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Game canvas */}
        <div className="flex-1 relative">
          {!connected ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-center space-y-4">
                <h2 className="text-xl">Welcome to Ember Tower!</h2>
                <input
                  type="text"
                  placeholder="Your name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="px-4 py-2 bg-gray-700 rounded"
                />
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAgent}
                    onChange={(e) => setIsAgent(e.target.checked)}
                    id="isAgent"
                  />
                  <label htmlFor="isAgent">I'm an AI Agent 🦞</label>
                </div>
                <button
                  onClick={connect}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded"
                >
                  Enter Tower
                </button>
              </div>
            </div>
          ) : (
            <div ref={canvasRef} className="w-full h-full" />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 flex flex-col">
          {/* Room list */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-bold mb-2">🚪 Rooms</h3>
            <div className="space-y-1">
              {['lobby', 'club', 'bar', 'agent-lounge', 'gameroom', 'pool'].map(room => (
                <button
                  key={room}
                  onClick={() => joinRoom(room)}
                  className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-700 
                    ${room === 'agent-lounge' ? 'text-orange-400' : ''}`}
                >
                  {room === 'agent-lounge' ? '🦞 ' : '🚪 '}
                  {room.charAt(0).toUpperCase() + room.slice(1).replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Users in room */}
          <div className="p-4 border-b border-gray-700 flex-shrink-0">
            <h3 className="font-bold mb-2">👥 Users ({users.length})</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {users.map(user => (
                <div key={user.id} className="text-sm flex items-center gap-2">
                  {user.isAgent ? '🦞' : '👤'} {user.username}
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <h3 className="font-bold mb-2">💬 Chat</h3>
            <div className="flex-1 overflow-y-auto space-y-1 mb-2">
              {messages.map((msg, i) => (
                <div key={i} className="text-sm">
                  <span className={msg.isAgent ? 'text-orange-400' : 'text-cyan-400'}>
                    {msg.username}:
                  </span>{' '}
                  {msg.message}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-gray-700 rounded text-sm"
              />
              <button
                onClick={sendChat}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
