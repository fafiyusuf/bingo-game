/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, User, CheckCircle2, PartyPopper, Info, Settings, Plus, Trash2, X, LayoutGrid, Copy } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

const FREE_SPACE = "FREE SPACE 💜";

interface Question {
  id: number;
  text: string;
}

interface Cell {
  id: number;
  text: string;
  isMarked: boolean;
  markedBy?: string;
}

interface Winner {
  id: number;
  name: string;
  timestamp: string;
}

export default function App() {
  const [grid, setGrid] = useState<Cell[]>([]);
  const [hasBingo, setHasBingo] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const [tempName, setTempName] = useState('');
  
  const [activeTab, setActiveTab] = useState<'play' | 'manage'>('play');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');

  const [roomCode, setRoomCode] = useState('');
  const [roomId, setRoomId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [lobbyMode, setLobbyMode] = useState<'initial' | 'create' | 'join' | 'success'>('initial');
  const [stats, setStats] = useState<{ totalPlayers: number; bingoRate: string }>({ totalPlayers: 0, bingoRate: '0%' });

  // Auto-fill room from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      setRoomCode(code.toUpperCase());
      setLobbyMode('join');
    }
  }, []);

  // Fetch Questions
  const fetchQuestions = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/questions/${roomId}`);
      const data = await res.json();
      setQuestions(data);
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    }
  }, [roomId]);

  const fetchStats = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [roomId]);

  // Initialize Socket
  useEffect(() => {
    if (!roomId) return;

    const newSocket = io();
    setSocket(newSocket);

    newSocket.emit('join_room', roomId);

    newSocket.on('new_winner', (winner: Winner) => {
      setWinners(prev => {
        const exists = prev.find(w => w.id === winner.id);
        if (exists) return prev;
        return [...prev, winner].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
      fetchStats();
    });

    newSocket.on('winners_reset', () => {
      setWinners([]);
      fetchStats();
    });

    // Fetch initial data
    fetch(`/api/winners/${roomId}`)
      .then(res => res.json())
      .then(data => setWinners(data))
      .catch(err => console.error("Failed to fetch winners:", err));
    
    fetchQuestions();
    fetchStats();

    return () => {
      newSocket.close();
    };
  }, [roomId, fetchQuestions]);

  // Initialize Grid
  const initializeGrid = useCallback(() => {
    if (questions.length < 24) {
      // Fallback if not enough questions yet
      return;
    }
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    const newGrid: Cell[] = [];
    let statementIndex = 0;

    for (let i = 0; i < 25; i++) {
      if (i === 12) {
        newGrid.push({ id: i, text: FREE_SPACE, isMarked: true });
      } else {
        newGrid.push({ id: i, text: shuffled[statementIndex++].text, isMarked: false });
      }
    }
    setGrid(newGrid);
    setHasBingo(false);
    setShowWinnerModal(false);
  }, [questions]);

  useEffect(() => {
    if (questions.length >= 24) {
      initializeGrid();
    }
  }, [questions, initializeGrid]);

  const checkBingo = (currentGrid: Cell[]) => {
    const size = 5;
    const lines: number[][] = [];

    // Rows
    for (let i = 0; i < size; i++) {
      lines.push(Array.from({ length: size }, (_, j) => i * size + j));
    }
    // Columns
    for (let i = 0; i < size; i++) {
      lines.push(Array.from({ length: size }, (_, j) => j * size + i));
    }
    // Diagonals
    lines.push([0, 6, 12, 18, 24]);
    lines.push([4, 8, 12, 16, 20]);

    const isBingo = lines.some(line => line.every(index => currentGrid[index].isMarked));
    
    if (isBingo && !hasBingo) {
      setHasBingo(true);
      setShowWinnerModal(true);
      // Report winner to server
      if (isRegistered && roomId) {
        fetch('/api/winners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: playerName, roomId }),
        });
      }
    }
  };

  const toggleCell = (id: number) => {
    if (id === 12) return; // Can't unmark free space

    const cell = grid.find(c => c.id === id);
    if (!cell) return;

    if (cell.isMarked) {
      // Unmark
      setGrid(prev => prev.map(c => c.id === id ? { ...c, isMarked: false, markedBy: undefined } : c));
      setHasBingo(false);
    } else {
      // Open modal to ask for name
      setSelectedCellId(id);
      setTempName('');
      setIsNameModalOpen(true);
    }
  };

  const confirmMarkCell = () => {
    if (selectedCellId === null || !tempName.trim()) return;

    setGrid(prevGrid => {
      const newGrid = prevGrid.map(cell => {
        if (cell.id === selectedCellId) {
          return { ...cell, isMarked: true, markedBy: tempName };
        }
        return cell;
      });
      
      setTimeout(() => checkBingo(newGrid), 0);
      return newGrid;
    });

    setIsNameModalOpen(false);
    setSelectedCellId(null);
    setTempName('');
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim() || !roomId) return;
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newQuestionText, roomId }),
      });
      if (res.ok) {
        setNewQuestionText('');
        fetchQuestions();
      }
    } catch (err) {
      console.error("Failed to add question:", err);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    try {
      const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchQuestions();
      }
    } catch (err) {
      console.error("Failed to delete question:", err);
    }
  };

  const handleCreateRoom = async () => {
    if (!playerName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorName: playerName }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        alert(`Error: ${errorData.error || 'Failed to create room'}`);
        return;
      }

      const data = await res.json();
      setRoomCode(data.code);
      setRoomId(data.roomId);
      setIsAdmin(true);
      
      // Register player
      await fetch(`/api/rooms/${data.roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      });

      setLobbyMode('success');
    } catch (err) {
      console.error("Failed to create room:", err);
      alert("Network error: Could not connect to the server.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim() || isJoining) return;
    setIsJoining(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Room not found!");
        return;
      }
      const data = await res.json();
      setRoomId(data.id);
      setRoomCode(data.code); // Ensure correct casing
      setIsAdmin(false);

      // Register player
      await fetch(`/api/rooms/${data.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      });

      setIsRegistered(true);
    } catch (err) {
      console.error("Failed to join room:", err);
      alert("Network error: Could not connect to the server.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleResetWinners = async () => {
    if (!roomId || !window.confirm("Are you sure you want to reset the leaderboard for this room?")) return;
    try {
      await fetch(`/api/reset-winners/${roomId}`, { method: 'POST' });
    } catch (err) {
      console.error("Failed to reset winners:", err);
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert("Room code copied to clipboard!");
  };

  const copyShareLink = () => {
    const link = `${window.location.origin}?room=${roomCode}`;
    navigator.clipboard.writeText(link);
    alert("Share link copied to clipboard!");
  };

  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4 font-sans selection:bg-pink-100">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 md:p-12 border-4 border-black shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full"
        >
          <div className="flex justify-center mb-10">
            <div className="bg-black text-white p-6 rotate-[-5deg] shadow-[8px_8px_0px_0px_rgba(236,72,153,1)]">
              <PartyPopper className="w-12 h-12" />
            </div>
          </div>
          
          <h1 className="text-4xl font-black text-center uppercase tracking-tighter mb-2 italic">Tech Bingo</h1>
          <p className="text-center text-gray-400 font-bold uppercase tracking-widest text-xs mb-10">Multiplayer Event Edition</p>
          
          <div className="space-y-8">
            <div className="bg-gray-50 p-6 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3 ml-1">1. Your Identity</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full px-6 py-4 border-2 border-black font-black focus:outline-none focus:border-pink-500 transition-colors bg-white"
              />
            </div>

            <AnimatePresence mode="wait">
              {!playerName.trim() ? (
                <motion.div 
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-4 border-2 border-dashed border-gray-200"
                >
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Type your name to continue</p>
                </motion.div>
              ) : lobbyMode === 'initial' ? (
                <motion.div 
                  key="initial"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <button
                    onClick={() => setLobbyMode('create')}
                    className="bg-black text-white font-black uppercase tracking-widest py-5 hover:bg-pink-600 transition-colors shadow-[6px_6px_0px_0px_rgba(236,72,153,1)]"
                  >
                    Create Room
                  </button>
                  <button
                    onClick={() => setLobbyMode('join')}
                    className="bg-white text-black border-2 border-black font-black uppercase tracking-widest py-5 hover:bg-gray-100 transition-colors shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Join Room
                  </button>
                </motion.div>
              ) : lobbyMode === 'create' ? (
                <motion.div 
                  key="create"
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="bg-pink-50 border-2 border-pink-200 p-4 text-center">
                    <p className="text-xs font-bold text-pink-600 uppercase tracking-widest">You will be the room admin</p>
                  </div>
                  <button
                    onClick={handleCreateRoom}
                    disabled={isCreating}
                    className="w-full bg-black text-white font-black uppercase tracking-widest py-5 hover:bg-pink-600 disabled:opacity-50 transition-colors shadow-[6px_6px_0px_0px_rgba(236,72,153,1)]"
                  >
                    {isCreating ? 'Generating...' : 'Generate Room & Start'}
                  </button>
                  <button 
                    onClick={() => setLobbyMode('initial')} 
                    className="w-full text-xs font-bold uppercase text-gray-400 hover:text-black transition-colors py-2"
                  >
                    ← Go Back
                  </button>
                </motion.div>
              ) : lobbyMode === 'success' ? (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-6 text-center"
                >
                  <div className="bg-green-50 border-2 border-green-500 p-6 shadow-[4px_4px_0px_0px_rgba(34,197,94,1)]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-green-600 mb-2">Room Created Successfully!</p>
                    <h3 className="text-4xl font-black tracking-tighter text-black mb-4">{roomCode}</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={copyRoomCode}
                        className="flex-1 bg-white border-2 border-black py-2 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-colors"
                      >
                        Copy Code
                      </button>
                      <button 
                        onClick={copyShareLink}
                        className="flex-1 bg-black text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-pink-600 transition-colors"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsRegistered(true)}
                    className="w-full bg-pink-500 text-white font-black uppercase tracking-widest py-5 hover:bg-pink-600 transition-colors shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                  >
                    Enter Game Board →
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="join"
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3 ml-1">2. Room Code</label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="E.G. AB12CD"
                      className="w-full px-6 py-4 border-2 border-black font-black focus:outline-none focus:border-pink-500 transition-colors uppercase bg-white"
                    />
                  </div>
                  <button
                    onClick={handleJoinRoom}
                    disabled={!roomCode.trim() || isJoining}
                    className="w-full bg-black text-white font-black uppercase tracking-widest py-5 hover:bg-pink-600 disabled:opacity-50 transition-colors shadow-[6px_6px_0px_0px_rgba(236,72,153,1)]"
                  >
                    {isJoining ? 'Joining...' : 'Enter Room'}
                  </button>
                  <button 
                    onClick={() => setLobbyMode('initial')} 
                    className="w-full text-xs font-bold uppercase text-gray-400 hover:text-black transition-colors py-2"
                  >
                    ← Go Back
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    );
  }

  if (isRegistered && grid.length === 0) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4 font-sans">
        <div className="text-center space-y-6">
          <div className="relative inline-block">
            <div className="w-20 h-20 border-4 border-black border-t-pink-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RotateCcw className="w-8 h-8 text-black" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">Generating Board</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Fetching event statements...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-sans pb-12 selection:bg-pink-100 selection:text-pink-900">
      {/* Header - Brutalist/Clean Pairings */}
      <header className="bg-white border-b-2 border-black sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-black text-white p-2.5 rotate-[-3deg] shadow-[4px_4px_0px_0px_rgba(236,72,153,1)]">
              <PartyPopper className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">
                Tech Bingo
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mt-1">
                Event Edition 2026
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold uppercase text-gray-400">Player</span>
              <span className="text-sm font-black">{playerName}</span>
            </div>
            
            <nav className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button 
                onClick={() => setActiveTab('play')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'play' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                Play
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveTab('manage')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'manage' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
                >
                  <Settings className="w-4 h-4" />
                  Setup
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <AnimatePresence mode="wait">
          {activeTab === 'play' ? (
            <motion.div 
              key="play"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-10"
            >
              {/* Left Column: Grid */}
              <div className="lg:col-span-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black tracking-tight">Your Board</h2>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-pink-50 px-3 py-1 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <span className="text-[10px] font-black uppercase text-gray-400">Room</span>
                        <span className="text-sm font-black text-pink-600">{roomCode}</span>
                        <button onClick={copyRoomCode} className="p-1 hover:bg-pink-100 transition-colors" title="Copy Code">
                          <Copy className="w-3 h-3 text-pink-400" />
                        </button>
                      </div>
                      <button 
                        onClick={copyShareLink}
                        className="flex items-center gap-2 bg-black text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-pink-600 transition-colors shadow-[2px_2px_0px_0px_rgba(236,72,153,1)]"
                      >
                        Share Link
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={initializeGrid}
                    className="group flex items-center gap-2 bg-white border-2 border-black px-5 py-2.5 font-bold text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                  >
                    <RotateCcw className="w-4 h-4 group-hover:rotate-[-45deg] transition-transform" />
                    New Board
                  </button>
                </div>

                <div className="bg-white border-2 border-black p-4 sm:p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.05)]">
                  <div className="grid grid-cols-5 gap-3 sm:gap-4 aspect-square">
                    {grid.map((cell) => (
                      <motion.button
                        key={cell.id}
                        whileHover={cell.id === 12 ? {} : { scale: 1.02 }}
                        whileTap={cell.id === 12 ? {} : { scale: 0.98 }}
                        onClick={() => toggleCell(cell.id)}
                        className={`
                          relative flex flex-col items-center justify-center p-2 rounded-none text-[9px] sm:text-xs md:text-sm font-bold text-center transition-all border-2
                          ${cell.isMarked 
                            ? 'bg-pink-500 border-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-10' 
                            : 'bg-white border-gray-200 text-gray-800 hover:border-black hover:bg-gray-50'
                          }
                          ${cell.id === 12 ? 'cursor-default' : 'cursor-pointer'}
                        `}
                      >
                        <span className="line-clamp-3 leading-tight uppercase tracking-tighter">{cell.text}</span>
                        {cell.markedBy && (
                          <div className="absolute bottom-1 left-0 right-0 px-1">
                            <p className="text-[7px] sm:text-[8px] opacity-90 truncate font-black uppercase bg-black/20 py-0.5 rounded">
                              {cell.markedBy}
                            </p>
                          </div>
                        )}
                        {cell.isMarked && cell.id !== 12 && (
                          <div className="absolute top-1 right-1">
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="bg-black text-white p-6 flex items-start gap-4 border-l-8 border-pink-500">
                  <Info className="w-6 h-6 text-pink-500 shrink-0" />
                  <div>
                    <h4 className="font-black uppercase text-xs tracking-widest mb-1">How to play</h4>
                    <p className="text-sm text-gray-400 leading-relaxed font-medium">
                      Find a participant matching a square. Tap it, enter their name, and confirm. 
                      Complete any row, column, or diagonal to win.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Leaderboard */}
              <div className="lg:col-span-4 space-y-8">
                <div className="bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(236,72,153,1)] overflow-hidden">
                  <div className="bg-black p-6 text-white border-b-2 border-black">
                    <div className="flex items-center gap-3">
                      <Trophy className="w-6 h-6 text-pink-500" />
                      <h2 className="text-xl font-black uppercase tracking-tighter">Leaderboard</h2>
                    </div>
                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-2">Top 10 Event Legends</p>
                  </div>
                  
                  <div className="p-4">
                    {winners.length === 0 ? (
                      <div className="py-16 text-center">
                        <div className="inline-block p-4 rounded-full bg-gray-50 mb-4 border border-dashed border-gray-300">
                          <Trophy className="w-8 h-8 text-gray-200" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">No winners yet</p>
                        <p className="text-[10px] text-gray-400 mt-1">Be the first to claim glory!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {winners.map((winner, index) => (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={winner.id}
                            className={`flex items-center justify-between p-4 border-2 ${
                              index === 0 ? 'bg-yellow-50 border-yellow-400' : 
                              index === 1 ? 'bg-gray-50 border-gray-300' : 
                              index === 2 ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <span className={`
                                w-8 h-8 flex items-center justify-center font-black text-xs border-2
                                ${index === 0 ? 'bg-yellow-400 border-black text-black' : 
                                  index === 1 ? 'bg-gray-300 border-black text-black' : 
                                  index === 2 ? 'bg-orange-400 border-black text-black' : 'bg-white border-gray-200 text-gray-400'}
                              `}>
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-black text-sm uppercase tracking-tight">{winner.name}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                  {new Date(winner.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            {index < 3 && (
                              <div className={`p-1.5 border-2 border-black ${
                                index === 0 ? 'bg-yellow-400' : 
                                index === 1 ? 'bg-gray-300' : 'bg-orange-400'
                              }`}>
                                <Trophy className="w-3 h-3 text-black" />
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-pink-50 border-2 border-pink-200 p-6">
                  <h4 className="font-black uppercase text-xs tracking-widest mb-3 text-pink-600">Event Stats</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-pink-100 p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Total Players</p>
                      <p className="text-xl font-black">{stats.totalPlayers}</p>
                    </div>
                    <div className="bg-white border border-pink-100 p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Bingo Rate</p>
                      <p className="text-xl font-black">{stats.bingoRate}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="manage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto space-y-10"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black tracking-tighter uppercase">Manage Questions</h2>
                  <p className="text-gray-500 font-medium">Add or remove statements that appear on the bingo boards.</p>
                </div>
                <button
                  onClick={handleResetWinners}
                  className="bg-red-50 text-red-600 border-2 border-red-200 px-6 py-3 font-black uppercase tracking-widest text-xs hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                >
                  Reset Leaderboard
                </button>
              </div>

              <div className="bg-white border-2 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.05)]">
                <form onSubmit={handleAddQuestion} className="flex gap-4 mb-10">
                  <input
                    type="text"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Enter a new bingo statement (e.g. Loves Open Source)"
                    className="flex-1 px-6 py-4 border-2 border-black font-bold focus:outline-none focus:ring-0 focus:border-pink-500 transition-colors"
                  />
                  <button
                    type="submit"
                    className="bg-black text-white px-8 py-4 font-black uppercase tracking-widest flex items-center gap-2 hover:bg-pink-600 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Add
                  </button>
                </form>

                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-4 border-b-2 border-gray-100">
                    <h3 className="font-black uppercase text-xs tracking-widest text-gray-400">Current Statements ({questions.length})</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase italic">Minimum 24 required for a full board</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                    {questions.map((q) => (
                      <div key={q.id} className="flex items-center justify-between p-4 bg-gray-50 border-2 border-transparent hover:border-black transition-all group">
                        <span className="font-bold text-sm">{q.text}</span>
                        <button 
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bingo Modal */}
      <AnimatePresence>
        {showWinnerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white border-4 border-black p-10 max-w-md w-full text-center shadow-[16px_16px_0px_0px_rgba(236,72,153,1)]"
            >
              <div className="bg-pink-500 text-white w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <PartyPopper className="w-12 h-12" />
              </div>
              <h2 className="text-6xl font-black tracking-tighter text-black mb-4 uppercase italic">BINGO!</h2>
              <p className="text-lg font-bold text-gray-600 mb-10 leading-tight">
                LEGENDARY WORK, {playerName}! <br/>
                YOU'VE JOINED THE HALL OF FAME.
              </p>
              <button
                onClick={() => setShowWinnerModal(false)}
                className="w-full bg-black text-white font-black uppercase tracking-[0.2em] py-5 hover:bg-pink-600 transition-colors shadow-[8px_8px_0px_0px_rgba(236,72,153,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
              >
                Continue Glory
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Name Entry Modal */}
      <AnimatePresence>
        {isNameModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white border-4 border-black p-10 max-w-md w-full shadow-[16px_16px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="bg-black text-white p-3">
                  <User className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Verification</h3>
              </div>
              
              <p className="text-sm font-bold text-gray-500 mb-8 uppercase tracking-widest leading-relaxed">
                Who matches this square? <br/>
                <span className="text-pink-600 text-lg font-black tracking-tight">
                  "{grid.find(c => c.id === selectedCellId)?.text}"
                </span>
              </p>
              
              <div className="space-y-6">
                <input
                  autoFocus
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmMarkCell()}
                  placeholder="Enter their name..."
                  className="w-full px-6 py-4 border-2 border-black font-black focus:outline-none focus:border-pink-500 transition-colors"
                />
                <div className="flex gap-4">
                  <button
                    onClick={() => setIsNameModalOpen(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black uppercase tracking-widest py-4 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmMarkCell}
                    disabled={!tempName.trim()}
                    className="flex-1 bg-black text-white font-black uppercase tracking-widest py-4 hover:bg-pink-600 disabled:opacity-50 transition-all shadow-[6px_6px_0px_0px_rgba(236,72,153,1)]"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
