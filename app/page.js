"use client";
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid'; 

// --- 配置 ---
const MAP_SIZE = 64; 
const TICK_RATE = 500;
const LOCAL_SAVE_KEY = "GNOMORIA_ZERO_SAVE_V7"; // 存档升级
const ID_KEY = "GNOMORIA_USER_ID"; 

// --- 建筑菜单 (图标化) ---
const BUILD_MENU = {
  DIG:         { wood: 0, stone: 0, plank: 0, block: 0, label: "⛏️ 挖掘 (Dig)" },
  FORAGE:      { wood: 0, stone: 0, plank: 0, block: 0, label: "🍒 采集 (Forage)" },
  FARM_PLOT:   { wood: 0, stone: 0, plank: 0, block: 0, label: "🌱 耕地 (Farm)" },
  
  // 原材料建筑
  SAWMILL:     { wood: 10, stone: 0, plank: 0, block: 0, label: "⚙️ 锯木厂 (Sawmill)" },
  STONECUTTER: { wood: 5, stone: 5, plank: 0, block: 0, label: "⚒️ 切石机 (Cutter)" },
  TORCH:       { wood: 2, stone: 0, plank: 0, block: 0, label: "🔥 火把 (Torch)" },

  // 高级建筑
  PLANK_WALL:  { wood: 0, stone: 0, plank: 2, block: 0, label: "🪵 木墙 (Plank Wall)" },
  STONE_WALL:  { wood: 0, stone: 0, plank: 0, block: 1, label: "🪨 石墙 (Stone Wall)" },
  BED:         { wood: 0, stone: 0, plank: 5, block: 0, label: "🛏️ 舒适木床 (Bed)" },
  TABLE:       { wood: 0, stone: 0, plank: 4, block: 0, label: "🪑 木桌 (Table)" },
};

// --- 🌟 核心视觉升级：Tile 渲染逻辑 ---
const getTileVisual = (tile, isVisible, isExplored, timeOfDay) => {
  // 默认不可见
  if (!isExplored) return { char: '', className: 'bg-black' };
  
  let char = ' ';
  let className = 'text-gray-500'; // 默认颜色
  let bgClass = ''; // 背景微调

  // --- 1. 环境物体 (Environment) ---
  switch (tile.type) {
    case 'WALL':   char = '⬛'; className = 'text-zinc-700'; break; // 深色实心块
    case 'TREE':   char = '🌲'; className = 'text-emerald-500'; break;
    case 'BUSH':   char = '🍒'; className = 'text-red-500'; break;
    case 'WATER':  char = '🌊'; className = 'text-blue-500'; break;
    case 'EMPTY':  char = '·';  className = 'text-zinc-800'; break; // 地面保持低调
    
    // --- 2. 农田 (Farming) ---
    case 'FARM':   
      // 生长动画：根据生长进度改变图标
      if (tile.growth >= 100) { char = '🌾'; className = 'text-amber-300'; } // 成熟
      else if (tile.growth > 50) { char = '🌱'; className = 'text-green-500'; } // 发芽
      else { char = '🌰'; className = 'text-amber-800'; } // 种子
      break;

    // --- 3. 建筑 (Buildings) ---
    case 'SAWMILL':     char = '⚙️'; className = tile.working ? 'animate-spin' : 'text-amber-500'; break;
    case 'STONECUTTER': char = '⚒️'; className = tile.working ? 'animate-bounce' : 'text-gray-400'; break;
    case 'BED':         char = '🛏️'; className = 'text-blue-300'; break;
    case 'TABLE':       char = '🪑'; className = 'text-orange-400'; break;
    case 'TORCH':       char = '🔥'; className = 'animate-pulse text-orange-500'; break;
    case 'PLANK_WALL':  char = '🪵'; className = 'text-amber-700'; break;
    case 'STONE_WALL':  char = '🪨'; className = 'text-stone-400'; break;
  }

  // --- 4. 光照遮罩 (Lighting Mask) ---
  const isNight = timeOfDay > 19 || timeOfDay < 5;
  
  // 视野内
  if (isVisible) {
      if (isNight && tile.type !== 'TORCH' && tile.type !== 'SAWMILL') {
          // 夜晚视野内变暗，营造氛围
          className += ' opacity-60 grayscale'; 
      } else {
          className += ' opacity-100';
      }
  } 
  // 记忆中 (迷雾)
  else {
      className += ' opacity-20 grayscale'; // 变成极暗的灰色
  }

  return { char, className };
};

export default function GnomoriaGame() {
  const [mapGrid, setMapGrid] = useState([]);
  const [gnomes, setGnomes] = useState([]);
  const [resources, setResources] = useState({ wood: 0, stone: 0, food: 20, plank: 0, block: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedTool, setSelectedTool] = useState('DIG');
  const [isLoaded, setIsLoaded] = useState(false);
  const [gameTime, setGameTime] = useState({ day: 1, hour: 6 });
  const [userId, setUserId] = useState(""); 
  const [inputUserId, setInputUserId] = useState(""); 
  const [syncStatus, setSyncStatus] = useState(""); 
  const [exploredTiles, setExploredTiles] = useState(new Set());
  const [highlightGnomeId, setHighlightGnomeId] = useState(null);

  const stateRef = useRef({ mapGrid, gnomes, resources, gameTime });

  useEffect(() => {
    stateRef.current = { mapGrid, gnomes, resources, gameTime };
  }, [mapGrid, gnomes, resources, gameTime]);

  // --- 游戏逻辑 (保持不变，仅更新视觉) ---
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setInterval(() => {
      setGameTime(prev => {
        let newHour = prev.hour + 0.5; 
        let newDay = prev.day;
        if (newHour >= 24) { 
            newHour = 0; newDay += 1; addLog(`🌞 第 ${newDay} 天。`);
            const bedCount = stateRef.current.mapGrid.flat().filter(t => t.type === 'BED').length;
            if (stateRef.current.resources.food > 50 && stateRef.current.gnomes.length < bedCount) {
                const jobs = ["Miner", "Farmer", "Builder"];
                const randomJob = jobs[Math.floor(Math.random() * jobs.length)];
                // 职业对应不同的 Emoji
                let icon = '👷';
                if(randomJob==='Farmer') icon = '🧑‍🌾';
                if(randomJob==='Builder') icon = '👷‍♂️';

                setGnomes(prev => [...prev, { 
                    id: uuidv4(), name: `G.${randomJob}`, symbol: icon, 
                    x: 32, y: 32, hunger: 0, energy: 100, job: 'IDLE', target: null 
                }]);
                addLog(`👋 新移民 ${randomJob} (${icon}) 加入！`);
            }
        }
        return { day: newDay, hour: newHour };
      });
      setMapGrid(prevGrid => prevGrid.map(row => row.map(tile => {
        if (tile.type === 'FARM' && tile.growth < 100) {
            if (stateRef.current.gameTime.hour > 6 && stateRef.current.gameTime.hour < 18) return { ...tile, growth: tile.growth + 5 };
        }
        return tile;
      })));
    }, TICK_RATE);
    return () => clearInterval(timer);
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
      const { mapGrid: currentMap, gnomes: currentGnomes, gameTime } = stateRef.current;
      if (currentMap.length === 0) return;

      const nextMap = currentMap.map(row => row.map(tile => ({...tile, working: false})));
      const nextGnomes = currentGnomes.map(g => ({ ...g }));
      let mapChanged = false;

      nextGnomes.forEach(gnome => {
        gnome.hunger += 0.4; gnome.energy -= 0.2; 

        // AI Logic
        if (gnome.energy < 10 || (gameTime.hour >= 22 && gnome.energy < 80)) {
            gnome.job = 'SLEEPING';
            const tile = nextMap[gnome.y][gnome.x];
            if (tile.type === 'BED') {
                gnome.energy = Math.min(100, gnome.energy + 5); 
                if (gnome.energy >= 100) gnome.job = 'IDLE'; 
            } else {
                const bed = findNearestBlock(nextMap, gnome.x, gnome.y, 'BED');
                if (bed) moveTo(gnome, bed, nextMap);
                else gnome.energy = Math.min(100, gnome.energy + 2);
            }
            return;
        }
        if (gnome.hunger > 80) {
            gnome.job = 'EATING';
            if (stateRef.current.resources.food > 0) {
                setResources(prev => ({ ...prev, food: prev.food - 1 }));
                gnome.hunger = 0; gnome.job = 'IDLE';
            } else {
                const foodSource = findNearestFood(nextMap, gnome.x, gnome.y);
                if (foodSource) {
                    if (isNextTo(gnome, foodSource)) {
                        nextMap[foodSource.y][foodSource.x] = { type: 'EMPTY', content: '·' };
                        mapChanged = true; gnome.hunger = 0;
                    } else moveTo(gnome, foodSource, nextMap);
                }
            }
            return;
        }
        if (!gnome.target) {
            const matureCrop = findMatureCrop(nextMap, gnome.x, gnome.y);
            if (matureCrop) { gnome.target = matureCrop; gnome.job = 'FARMING'; } 
            else if (stateRef.current.resources.wood > 0) {
                const sawmill = findNearestBlock(nextMap, gnome.x, gnome.y, 'SAWMILL');
                if (sawmill) { gnome.target = sawmill; gnome.job = 'CRAFTING'; }
            } else if (stateRef.current.resources.stone > 0) {
                const cutter = findNearestBlock(nextMap, gnome.x, gnome.y, 'STONECUTTER');
                if (cutter) { gnome.target = cutter; gnome.job = 'CRAFTING'; }
            }
            if (!gnome.target) {
                const tree = findNearestBlock(nextMap, gnome.x, gnome.y, 'TREE');
                if (tree) { gnome.target = tree; gnome.job = 'CHOPPING'; }
            }
        }
        if (gnome.target) {
            if (isNextTo(gnome, gnome.target)) {
                const tTile = nextMap[gnome.target.y][gnome.target.x];
                if (tTile.type === 'TREE') {
                    nextMap[gnome.target.y][gnome.target.x] = { type: 'EMPTY', content: '·' };
                    mapChanged = true; setResources(prev => ({ ...prev, wood: prev.wood + 5 })); 
                    if(Math.random()>0.7) setResources(prev => ({ ...prev, food: prev.food + 1 }));
                } else if (tTile.type === 'FARM' && tTile.growth >= 100) {
                     nextMap[gnome.target.y][gnome.target.x] = { type: 'FARM', content: '~', growth: 0 };
                     mapChanged = true; setResources(prev => ({ ...prev, food: prev.food + 5 })); 
                } else if (tTile.type === 'SAWMILL' && stateRef.current.resources.wood > 0) {
                    setResources(prev => ({ ...prev, wood: prev.wood - 1, plank: prev.plank + 1 }));
                    tTile.working = true; mapChanged = true;
                } else if (tTile.type === 'STONECUTTER' && stateRef.current.resources.stone > 0) {
                    setResources(prev => ({ ...prev, stone: prev.stone - 1, block: prev.block + 1 }));
                    tTile.working = true; mapChanged = true;
                }
                gnome.target = null; gnome.job = 'IDLE';
            } else moveTo(gnome, gnome.target, nextMap);
        }
      });
      setGnomes(nextGnomes);
      if (mapChanged) setMapGrid(nextMap);
    }, TICK_RATE);
    return () => clearInterval(interval);
  }, [isLoaded]);

  // --- 辅助算法 ---
  const isNextTo = (g, target) => Math.abs(g.x - target.x) + Math.abs(g.y - target.y) <= 1;
  const moveTo = (gnome, target, map) => {
      const nextStep = findPathNextStep({x: gnome.x, y: gnome.y}, target, map);
      if (nextStep) { gnome.x = nextStep.x; gnome.y = nextStep.y; } else { gnome.target = null; }
  };
  const findNearestBlock = (map, px, py, type) => {
    let nearest = null; let minDist = Infinity; const range = 50; 
    const minX = Math.max(0, px - range), maxX = Math.min(MAP_SIZE, px + range);
    const minY = Math.max(0, py - range), maxY = Math.min(MAP_SIZE, py + range);
    for(let y=minY; y<maxY; y++) for(let x=minX; x<maxX; x++) {
        if (map[y][x].type === type) {
            const dist = Math.abs(px - x) + Math.abs(py - y);
            if (dist < minDist) { minDist = dist; nearest = { x, y }; }
        }
    }
    return nearest;
  };
  const findMatureCrop = (map, px, py) => {
      let nearest = null; let minDist = Infinity; const range = 30;
      const minX = Math.max(0, px - range), maxX = Math.min(MAP_SIZE, px + range);
      const minY = Math.max(0, py - range), maxY = Math.min(MAP_SIZE, py + range);
      for(let y=minY; y<maxY; y++) for(let x=minX; x<maxX; x++) {
        if (map[y][x].type === 'FARM' && map[y][x].growth >= 100) {
          const dist = Math.abs(px - x) + Math.abs(py - y);
          if (dist < minDist) { minDist = dist; nearest = { x, y }; }
        }
      }
      return nearest;
  };
  const findNearestFood = (map, px, py) => {
      let nearest = null; let minDist = Infinity; const range = 40;
      const minX = Math.max(0, px - range), maxX = Math.min(MAP_SIZE, px + range);
      const minY = Math.max(0, py - range), maxY = Math.min(MAP_SIZE, py + range);
      for(let y=minY; y<maxY; y++) for(let x=minX; x<maxX; x++) {
        const tile = map[y][x];
        if (tile.type === 'BUSH' || (tile.type === 'FARM' && tile.growth >= 100)) {
            const dist = Math.abs(px - x) + Math.abs(py - y);
            if (dist < minDist) { minDist = dist; nearest = { x, y }; }
        }
      }
      return nearest;
  };
  const findPathNextStep = (start, end, map) => {
    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = new Set(); visited.add(`${start.x},${start.y}`);
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    while (queue.length > 0) {
      const { x, y, path } = queue.shift();
      if (Math.abs(x - end.x) + Math.abs(y - end.y) <= 1) return path[0] || null;
      if (path.length > 80) continue; 
      for (let dir of directions) {
        const nx = x + dir.dx; const ny = y + dir.dy;
        if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue;
        const tile = map[ny][nx];
        const isWalkable = tile.type === 'EMPTY' || tile.type === 'FARM' || tile.type === 'DOOR' || (nx===end.x && ny===end.y); 
        if (isWalkable && !visited.has(`${nx},${ny}`)) {
          visited.add(`${nx},${ny}`);
          const newPath = path.length === 0 ? [{x: nx, y: ny}] : path;
          queue.push({ x: nx, y: ny, path: newPath });
        }
      }
    }
    return null;
  };

  useEffect(() => {
    let storedId = localStorage.getItem(ID_KEY);
    if (!storedId) { storedId = uuidv4().slice(0, 8).toUpperCase(); localStorage.setItem(ID_KEY, storedId); }
    setUserId(storedId); setInputUserId(storedId);

    const savedData = localStorage.getItem(LOCAL_SAVE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.mapGrid && parsed.mapGrid.length === MAP_SIZE) {
            setMapGrid(parsed.mapGrid);
            setGnomes(parsed.gnomes);
            setResources(parsed.resources);
            setGameTime(parsed.gameTime || { day: 1, hour: 6 });
            setExploredTiles(new Set(parsed.exploredTiles));
            setIsLoaded(true);
            setLogs(["画面升级完毕。", ...parsed.logs]);
            return;
        }
      } catch (e) { console.error(e); }
    }
    generateNewWorld();
  }, []);

  const generateNewWorld = () => {
    const newMap = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      const row = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        const rand = Math.random();
        if (rand > 0.95) row.push({ type: 'TREE', content: 'T' });
        else if (rand > 0.93) row.push({ type: 'BUSH', content: '%' }); 
        else if (rand > 0.82) row.push({ type: 'WALL', content: '#' });
        else row.push({ type: 'EMPTY', content: '·' });
      }
      newMap.push(row);
    }
    const mid = Math.floor(MAP_SIZE / 2);
    for(let y=mid-3; y<mid+3; y++) for(let x=mid-3; x<mid+3; x++) newMap[y][x] = { type: 'EMPTY', content: '·' };

    setMapGrid(newMap);
    setGnomes([
        { id: 1, name: "G.Miner", symbol: "👷", x: mid, y: mid, hunger: 0, energy: 100, job: 'IDLE', target: null },
        { id: 2, name: "G.Farmer", symbol: "🧑‍🌾", x: mid-1, y: mid, hunger: 10, energy: 100, job: 'IDLE', target: null }
    ]);
    setResources({ wood: 20, stone: 0, food: 50, plank: 0, block: 0 });
    const initialExplored = new Set();
    const VIEW_RADIUS = 8;
    for(let dy=-VIEW_RADIUS; dy<=VIEW_RADIUS; dy++) for(let dx=-VIEW_RADIUS; dx<=VIEW_RADIUS; dx++) initialExplored.add(`${mid+dx},${mid+dy}`);
    setExploredTiles(initialExplored);
    setLogs(["视觉大修版已上线。", "提示：现在图标更直观了。"]);
    setIsLoaded(true);
  };

  useEffect(() => {
    if (!isLoaded || mapGrid.length === 0) return;
    const saveData = { mapGrid, gnomes, resources, logs: logs.slice(0, 15), exploredTiles: Array.from(exploredTiles), gameTime };
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saveData));
  }, [mapGrid, gnomes, resources, logs, gameTime, isLoaded]);

  const handleTileClick = (x, y) => {
    const newMap = [...mapGrid];
    const tile = newMap[y][x];
    const cost = BUILD_MENU[selectedTool];
    
    if (resources.wood < cost.wood || resources.stone < cost.stone || resources.plank < (cost.plank||0) || resources.block < (cost.block||0)) {
        addLog(`缺资源!`); return;
    }

    let actionSuccess = false;
    if (selectedTool === 'DIG') {
        if (tile.type === 'WALL') {
            newMap[y][x] = { type: 'EMPTY', content: '·' };
            setResources(prev => ({ ...prev, stone: prev.stone + 1 }));
            actionSuccess = true;
        }
    } else if (selectedTool === 'FORAGE') {
        if (tile.type === 'BUSH') {
            newMap[y][x] = { type: 'EMPTY', content: '·' };
            setResources(prev => ({ ...prev, food: prev.food + 3 })); 
            actionSuccess = true;
        }
    } else {
        if (tile.type === 'EMPTY') {
            let newType = selectedTool;
            let extraData = {};
            if (selectedTool === 'FARM_PLOT') { newType = 'FARM'; extraData = { growth: 0 }; }
            
            newMap[y][x] = { type: newType, content: ' ', ...extraData }; // content 留空，由 getTileVisual 决定
            setResources(prev => ({ 
                wood: prev.wood - cost.wood, 
                stone: prev.stone - cost.stone,
                plank: prev.plank - (cost.plank||0),
                block: prev.block - (cost.block||0)
            }));
            actionSuccess = true;
        }
    }
    if (actionSuccess) setMapGrid(newMap);
  };

  const handleCloudUpload = async () => { /*...*/ };
  const handleCloudDownload = async () => { /*...*/ };
  const addLog = (msg) => setLogs(prev => [`[${Math.floor(stateRef.current.gameTime.hour)}:00] ${msg}`, ...prev].slice(0, 8));
  const handleReset = () => { if(confirm("完全重置世界?")) { localStorage.removeItem(LOCAL_SAVE_KEY); window.location.reload(); }};

  // 渲染时视野
  const visibleSet = new Set();
  gnomes.forEach(g => {
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++)
          if (Math.abs(dx) + Math.abs(dy) <= 8) visibleSet.add(`${g.x + dx},${g.y + dy}`);
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 p-2 font-mono select-none">
      
      <div className="w-full max-w-7xl bg-zinc-900 border border-zinc-800 p-3 mb-2 flex justify-between items-center shadow-2xl rounded">
        <div>
           <h1 className="text-lg font-bold text-amber-500 tracking-widest flex items-center gap-2">
             GNOMORIA // EMOJI v0.17
             <span className="text-xs text-zinc-500">Day {gameTime.day} {Math.floor(gameTime.hour)}:00</span>
           </h1>
           <div className="flex gap-2 mt-1 items-center text-[10px] text-zinc-500">
             ID:<input type="text" value={inputUserId} onChange={e=>setInputUserId(e.target.value)} className="bg-black border border-zinc-700 text-green-500 px-1 w-20 text-center"/>
             <button onClick={handleCloudUpload} className="hover:text-white">[UP]</button>
             <button onClick={handleCloudDownload} className="hover:text-white">[DL]</button>
             <span className="text-yellow-500">{syncStatus}</span>
             <button onClick={handleReset} className="ml-2 text-red-500 hover:text-red-400">[RESET]</button>
           </div>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="text-orange-400 font-bold">🍔:{resources.food}</div>
          <div className="text-emerald-400 font-bold">🪵:{resources.wood}</div>
          <div className="text-stone-400 font-bold">🪨:{resources.stone}</div>
          <div className="text-amber-300 font-bold">⚙️:{resources.plank}</div>
          <div className="text-gray-300 font-bold">🧱:{resources.block}</div>
        </div>
      </div>

      <div className="flex gap-2 w-full max-w-7xl h-[85vh]">
        <div className="flex-1 border border-zinc-800 bg-black p-1 overflow-hidden relative flex items-center justify-center">
          <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${MAP_SIZE}, 1fr)` }}>
            {mapGrid.map((row, y) => row.map((tile, x) => {
               const key = `${x},${y}`;
               const gnomesHere = gnomes.filter(g => g.x === x && g.y === y);
               const count = gnomesHere.length;
               
               const vis = getTileVisual(tile, true, true, gameTime.hour);
               
               let content = vis.char;
               let styleClass = vis.className;

               if (count > 0) {
                   if (count > 1) { content = '👥'; styleClass = 'text-white font-bold animate-pulse'; } 
                   else {
                       const g = gnomesHere[0];
                       content = g.job === 'SLEEPING' ? '💤' : (g.symbol || '👷');
                       styleClass = g.job === 'SLEEPING' ? 'text-blue-300' : 'text-white';
                       if (g.id === highlightGnomeId) styleClass += ' bg-white/20 border border-white rounded';
                   }
               }

               return (
                 <span key={key} onClick={() => handleTileClick(x, y)}
                   className={`w-3.5 h-3.5 flex items-center justify-center cursor-pointer hover:bg-white/10 text-[10px] ${styleClass}`}>
                   {content}
                 </span>
               )
            }))}
          </div>
        </div>

        <div className="flex flex-col gap-2 w-56 h-full">
            <div className="bg-zinc-900 border border-zinc-800 p-2 flex-1 flex flex-col overflow-hidden">
                 <h3 className="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-1">&gt; Industry</h3>
                 <div className="flex flex-col gap-1 overflow-y-auto flex-1">
                    {Object.keys(BUILD_MENU).map(k => (
                        <button key={k} onClick={() => setSelectedTool(k)}
                            className={`text-left px-2 py-1.5 text-[10px] border transition-all flex justify-between
                            ${selectedTool === k ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                            <span>{BUILD_MENU[k].label}</span>
                        </button>
                    ))}
                 </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-2 h-40 flex flex-col">
                <h3 className="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-1">&gt; Squad ({gnomes.length})</h3>
                <div className="flex-1 overflow-y-auto text-[10px] space-y-2">
                    {gnomes.map(g => (
                        <div key={g.id} onClick={() => setHighlightGnomeId(prev => prev === g.id ? null : g.id)}
                            className={`flex justify-between items-center cursor-pointer p-1 rounded hover:bg-zinc-800 ${highlightGnomeId === g.id ? 'bg-zinc-800 border border-zinc-600' : ''}`}>
                            <span className="text-zinc-300">{g.symbol} {g.name}</span>
                            <div className="flex flex-col w-12 gap-0.5">
                                <div className="h-0.5 bg-zinc-700"><div className="h-0.5 bg-orange-500" style={{width:`${g.hunger}%`}}></div></div>
                                <div className="h-0.5 bg-zinc-700"><div className="h-0.5 bg-blue-500" style={{width:`${g.energy}%`}}></div></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-2 h-32 flex flex-col">
                <h3 className="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-1">&gt; Log</h3>
                <ul className="space-y-0.5 text-[10px] overflow-hidden">
                    {logs.map((log, i) => (<li key={i} className={`truncate ${i === 0 ? 'text-amber-500' : 'text-zinc-600'}`}>{log}</li>))}
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
}