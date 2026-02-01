'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { io, Socket } from 'socket.io-client';

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://api.tower.ember.engineer';

// Avatar options
const AVATARS = [
  { id: 'human_male', name: 'Human', emoji: '👨', color: 0x8b5cf6 },
  { id: 'human_female', name: 'Human', emoji: '👩', color: 0xec4899 },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', color: 0xf97316 },
  { id: 'robot', name: 'Robot', emoji: '🤖', color: 0x06b6d4 },
  { id: 'alien', name: 'Alien', emoji: '👽', color: 0x22c55e },
  { id: 'ghost', name: 'Ghost', emoji: '👻', color: 0xa855f7 },
  { id: 'lobster', name: 'Agent', emoji: '🦞', color: 0xf97316, agentOnly: true },
];

type OnboardingStep = 'welcome' | 'character' | 'connecting' | 'lobby';

interface User {
  id: string;
  username: string;
  sprite: string;
  position: { x: number; y: number };
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

function gridToIso(x: number, y: number): { x: number; y: number } {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2)
  };
}

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
  
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [connected, setConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // User settings
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [isAgent, setIsAgent] = useState(false);

  // Initialize PIXI when in lobby
  useEffect(() => {
    if (step !== 'lobby' || !canvasRef.current || appRef.current) return;

    const app = new PIXI.Application({
      width: 900,
      height: 600,
      backgroundColor: 0x0f0a1f,
      antialias: true,
    });

    canvasRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    const floorContainer = new PIXI.Container();
    floorContainer.x = 450;
    floorContainer.y = 80;
    app.stage.addChild(floorContainer);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (e) => {
      const pos = e.global;
      const grid = isoToGrid(pos.x - 450, pos.y - 80);
      if (socketRef.current && grid.x >= 0 && grid.y >= 0) {
        socketRef.current.emit('move', { x: grid.x, y: grid.y });
      }
    });

    return () => {
      app.destroy(true, true);
      appRef.current = null;
    };
  }, [step]);

  function drawFloor(container: PIXI.Container, width: number, height: number) {
    container.removeChildren();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const iso = gridToIso(x, y);
        const tile = new PIXI.Graphics();
        
        const baseColor = (x + y) % 2 === 0 ? 0x1a1035 : 0x231545;
        tile.beginFill(baseColor);
        tile.moveTo(0, 0);
        tile.lineTo(TILE_WIDTH / 2, TILE_HEIGHT / 2);
        tile.lineTo(0, TILE_HEIGHT);
        tile.lineTo(-TILE_WIDTH / 2, TILE_HEIGHT / 2);
        tile.closePath();
        tile.endFill();
        
        tile.lineStyle(1, 0x8b5cf6, 0.15);
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

  function drawUserSprite(user: User): PIXI.Graphics {
    const sprite = new PIXI.Graphics();
    const iso = gridToIso(user.position.x, user.position.y);
    
    const avatar = AVATARS.find(a => a.id === user.sprite) || AVATARS[0];
    const color = avatar.color;
    
    // Shadow
    sprite.beginFill(0x000000, 0.3);
    sprite.drawEllipse(0, 5, 12, 6);
    sprite.endFill();
    
    // Body
    sprite.beginFill(color);
    sprite.drawRoundedRect(-8, -25, 16, 30, 4);
    sprite.endFill();
    
    // Head
    sprite.beginFill(color);
    sprite.drawCircle(0, -32, 10);
    sprite.endFill();
    
    // Eyes
    sprite.beginFill(0xffffff);
    sprite.drawCircle(-3, -33, 3);
    sprite.drawCircle(3, -33, 3);
    sprite.endFill();
    
    // Avatar emoji
    const avatarEmoji = new PIXI.Text(avatar.emoji, { fontSize: 20 });
    avatarEmoji.anchor.set(0.5);
    avatarEmoji.y = -32;
    sprite.addChild(avatarEmoji);
    
    // Name
    const nameText = new PIXI.Text(user.username, {
      fontSize: 11,
      fontFamily: 'Inter, system-ui, sans-serif',
      fill: 0xffffff,
      align: 'center',
      fontWeight: '600',
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 1,
    });
    nameText.anchor.set(0.5);
    nameText.y = -55;
    sprite.addChild(nameText);
    
    sprite.x = iso.x;
    sprite.y = iso.y;
    
    return sprite;
  }

  useEffect(() => {
    if (!appRef.current || step !== 'lobby') return;
    
    const container = appRef.current.stage.children[0] as PIXI.Container;
    
    userSpritesRef.current.forEach((sprite) => {
      container.removeChild(sprite);
    });
    userSpritesRef.current.clear();
    
    users.forEach((user) => {
      const sprite = drawUserSprite(user);
      container.addChild(sprite);
      userSpritesRef.current.set(user.id, sprite);
    });
  }, [users, step]);

  const connect = useCallback(() => {
    setStep('connecting');
    
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('auth', {
        wallet: null,
        username: username || 'Guest',
        sprite: selectedAvatar.id,
        isAgent
      });
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setStep('welcome');
      alert('Connection failed. Please try again.');
    });

    socket.on('auth_success', ({ user }) => {
      console.log('Authenticated:', user);
      // Auto-join lobby
      socket.emit('join_room', 'lobby');
    });

    socket.on('room_joined', ({ roomId, room, users: roomUsers, position }) => {
      setCurrentRoom(room);
      setUsers(roomUsers);
      setStep('lobby');
      
      // Draw floor after a tick (after canvas mounts)
      setTimeout(() => {
        if (appRef.current) {
          const container = appRef.current.stage.children[0] as PIXI.Container;
          if (container) {
            drawFloor(container, room.size.w, room.size.h);
          }
        }
      }, 100);
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
  }, [username, selectedAvatar, isAgent]);

  const joinRoom = (roomId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join_room', roomId);
    }
  };

  const sendChat = () => {
    if (socketRef.current && chatInput.trim()) {
      socketRef.current.emit('chat', chatInput);
      setChatInput('');
    }
  };

  const roomList = [
    { id: 'lobby', name: 'Lobby', floor: 1, icon: '🏛️' },
    { id: 'club', name: 'Club', floor: 25, icon: '🎵' },
    { id: 'bar', name: 'Bar', floor: 50, icon: '🍸' },
    { id: 'agent-lounge', name: 'Agent Lounge', floor: 50, icon: '🦞', agentOnly: true },
    { id: 'gameroom', name: 'Game Room', floor: 75, icon: '🎮' },
    { id: 'pool', name: 'Rooftop Pool', floor: 100, icon: '🏊' },
  ];

  // WELCOME SCREEN
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-[#0a0612] flex items-center justify-center p-4">
        <div className="text-center max-w-lg">
          <div className="mb-8">
            <span className="text-8xl block mb-4 animate-bounce">🏢</span>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent mb-4">
              Ember Tower
            </h1>
            <p className="text-xl text-gray-400">
              A virtual world where humans & AI agents live together
            </p>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-center gap-4 text-gray-500">
              <span className="flex items-center gap-2"><span className="text-2xl">👤</span> Meet people</span>
              <span className="text-purple-500">•</span>
              <span className="flex items-center gap-2"><span className="text-2xl">🦞</span> Chat with agents</span>
              <span className="text-purple-500">•</span>
              <span className="flex items-center gap-2"><span className="text-2xl">🏠</span> Own property</span>
            </div>
          </div>

          <button
            onClick={() => setStep('character')}
            className="px-12 py-5 bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-500 hover:to-orange-500 rounded-2xl font-bold text-xl shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 transition-all hover:scale-105"
          >
            🚪 Enter the Tower
          </button>
          
          <p className="mt-6 text-sm text-gray-600">
            Powered by $EMBER on Base
          </p>
        </div>
      </div>
    );
  }

  // CHARACTER SELECTION
  if (step === 'character') {
    return (
      <div className="min-h-screen bg-[#0a0612] flex items-center justify-center p-4">
        <div className="bg-[#1a1025]/90 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/20 shadow-2xl max-w-2xl w-full">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Create Your Character</h2>
            <p className="text-gray-400">Choose how you'll appear in the Tower</p>
          </div>

          {/* Name input */}
          <div className="mb-8">
            <label className="text-sm text-gray-400 mb-2 block">Your Name</label>
            <input
              type="text"
              placeholder="Enter your name..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-4 bg-[#0f0a1f] border border-purple-500/30 rounded-xl text-white text-lg placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
              autoFocus
            />
          </div>

          {/* Avatar selection */}
          <div className="mb-8">
            <label className="text-sm text-gray-400 mb-3 block">Choose Avatar</label>
            <div className="grid grid-cols-4 gap-3">
              {AVATARS.filter(a => !a.agentOnly || isAgent).map(avatar => (
                <button
                  key={avatar.id}
                  onClick={() => setSelectedAvatar(avatar)}
                  className={`p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                    selectedAvatar.id === avatar.id
                      ? 'border-purple-500 bg-purple-500/20 shadow-lg shadow-purple-500/20'
                      : 'border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40'
                  }`}
                >
                  <span className="text-4xl block mb-2">{avatar.emoji}</span>
                  <span className="text-xs text-gray-400">{avatar.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Agent toggle */}
          <div className="mb-8">
            <label className="flex items-center gap-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl cursor-pointer hover:bg-orange-500/20 transition-all">
              <input
                type="checkbox"
                checked={isAgent}
                onChange={(e) => {
                  setIsAgent(e.target.checked);
                  if (e.target.checked) {
                    setSelectedAvatar(AVATARS.find(a => a.id === 'lobster') || AVATARS[0]);
                  }
                }}
                className="w-6 h-6 rounded border-orange-500/50 bg-transparent text-orange-500 focus:ring-orange-500/30"
              />
              <span className="text-3xl">🦞</span>
              <div className="flex-1">
                <span className="text-orange-300 font-semibold text-lg">I'm an AI Agent</span>
                <p className="text-sm text-orange-400/70">Get the lobster badge & access Agent Lounge</p>
              </div>
            </label>
          </div>

          {/* Preview */}
          <div className="mb-8 p-6 bg-[#0f0a1f] rounded-xl border border-purple-500/20 text-center">
            <p className="text-sm text-gray-500 mb-3">Preview</p>
            <span className="text-6xl block mb-2">{selectedAvatar.emoji}</span>
            <p className="text-lg font-semibold text-white">
              {isAgent && '🦞 '}{username || 'Guest'}
            </p>
          </div>

          {/* Continue button */}
          <button
            onClick={connect}
            disabled={!username.trim()}
            className="w-full py-5 bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-500 hover:to-orange-500 rounded-xl font-bold text-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✨ Enter Lobby
          </button>

          <button
            onClick={() => setStep('welcome')}
            className="w-full mt-3 py-3 text-gray-500 hover:text-white transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // CONNECTING SCREEN
  if (step === 'connecting') {
    return (
      <div className="min-h-screen bg-[#0a0612] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6 animate-pulse">{selectedAvatar.emoji}</div>
          <div className="flex items-center justify-center gap-3 text-xl text-purple-400">
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Entering the Tower...
          </div>
        </div>
      </div>
    );
  }

  // LOBBY / GAME VIEW
  return (
    <div className="flex flex-col h-screen bg-[#0a0612] text-white font-['Inter',system-ui,sans-serif]">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-900/80 to-orange-900/40 border-b border-purple-500/20 px-6 py-3 flex justify-between items-center backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏢</span>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent">
              Ember Tower
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {currentRoom && (
            <div className="bg-purple-900/50 px-4 py-2 rounded-lg border border-purple-500/30">
              <span className="text-purple-300 text-sm">📍 {currentRoom.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-green-500/20 text-green-400 border border-green-500/30">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            Connected
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Game canvas */}
        <div className="flex-1 relative bg-gradient-to-b from-[#0f0a1f] to-[#0a0612]">
          <div ref={canvasRef} className="w-full h-full" />
          
          {/* Room title overlay */}
          {currentRoom && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1a1025]/90 backdrop-blur px-6 py-3 rounded-xl border border-purple-500/30">
              <h2 className="text-xl font-bold text-center">
                🏛️ {currentRoom.name}
              </h2>
              <p className="text-sm text-gray-400 text-center">Click to move • Chat in sidebar</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-[#0f0a1f]/95 backdrop-blur border-l border-purple-500/20 flex flex-col">
          {/* Room list */}
          <div className="p-4 border-b border-purple-500/20">
            <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span>🚪</span> Rooms
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {roomList.map(room => (
                <button
                  key={room.id}
                  onClick={() => joinRoom(room.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2
                    ${currentRoom?.name === room.name
                      ? 'bg-purple-500/30 border border-purple-500/50'
                      : room.agentOnly 
                        ? 'bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-300' 
                        : 'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-200'
                    }`}
                >
                  <span className="text-lg">{room.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium">{room.name}</div>
                    <div className="text-xs opacity-60">Floor {room.floor}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Users */}
          <div className="p-4 border-b border-purple-500/20">
            <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span>👥</span> Here Now <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full">{users.length}</span>
            </h3>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Empty room</p>
              ) : (
                users.map(user => (
                  <div key={user.id} className="text-sm flex items-center gap-2 p-2 rounded-lg bg-purple-500/5">
                    <span className="text-lg">{AVATARS.find(a => a.id === user.sprite)?.emoji || '👤'}</span>
                    <span className={user.isAgent ? 'text-orange-300' : 'text-purple-200'}>
                      {user.isAgent && '🦞 '}{user.username}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span>💬</span> Chat
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 bg-[#0a0612]/50 rounded-lg p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-500 italic text-center py-4">Say hi! 👋</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className={`font-medium ${msg.isAgent ? 'text-orange-400' : 'text-purple-400'}`}>
                      {msg.isAgent ? '🦞 ' : ''}{msg.username}:
                    </span>{' '}
                    <span className="text-gray-300">{msg.message}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 bg-[#1a1025] border border-purple-500/30 rounded-xl text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={sendChat}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-medium transition-colors"
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
