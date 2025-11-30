"use client";
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid'; 

// --- 宏大世界配置 ---
const MAP_SIZE = 64; // 64x64 = 4096 个格子！
const TICK_RATE = 500;
const VIEW_RADIUS = 8; // 视野扩大
const LOCAL_SAVE_KEY = "GNOMORIA_ZERO_SAVE_V3"; // 升级存档版本
const ID_KEY = "GNOMORIA_USER_ID"; 

// --- 资源与建筑 ---
const BUILD_MENU = {
  DIG:        { wood: 0, stone: 0, label: "⛏️ 挖掘 (Mine)" },
  FORAGE:     { wood: 0, stone: 0, label: "🍓 采集 (Forage)" },
  FARM_PLOT:  { wood: 0, stone: 0, label: "🌱 农田 (Farm)" },
  WALL:       { wood: 0, stone: 1, label: "🧱 石墙 (Wall)" },
  PLANK_WALL: { wood: 2, stone: 0, label: "🪵 木墙 (Plank)" },
  BED:        { wood: 5, stone: 0, label: "🛏️ 草床 (Bed)" },
  TORCH:      { wood: 2, stone: 0, label: "🔥 火把 (Torch)" },
};

// --- 颜色映射 ---
const getTileColor = (tile, isVisible, isExplored, timeOfDay) => {
  if (!isExplored) return 'text-transparent';
  
  let color = 'text-gray-600';
  
  switch (tile.type) {
    case 'WALL':   color = 'text-zinc-700'; break;
    case 'TREE':   color = 'text-emerald-600'; break;
    case 'BUSH':   color = 'text-rose-500'; break;
    case 'WATER':  color = 'text-blue-600'; break;
    case 'EMPTY':  color = 'text-stone-900'; break;
    case 'FARM':   
      color = tile.growth >= 100 ? 'text-green-500' : 'text-amber-900'; 
      break;
    case 'BED':    color = 'text-yellow-300'; break;
    case 'TORCH':  color = 'text-orange-500'; break;
  }

  const isNight = timeOfDay > 19 || timeOfDay < 5;
  let opacity = isVisible ? 'opacity-100' : 'opacity-20'; // 迷雾更深，突出当前视野
  if (isVisible && isNight && tile.type !== 'TORCH') {
      opacity = 'opacity-60'; 
  }

  return `${color} ${opacity}`;
};

export default function GnomoriaGame() {
  const [mapGrid, setMapGrid] = useState([]);
  const [gnomes, setGnomes] = useState([]);
  const [resources, setResources] = useState({ wood: 0, stone: 0, food: 20 });
  const [logs, setLogs] = useState([]);
  const [exploredTiles, setExploredTiles] = useState(new Set());
  const [selectedTool, setSelectedTool] = useState('DIG');
  const [isLoaded, setIsLoaded] = useState(false);
  const [gameTime, setGameTime] = useState({ day: 1, hour: 6 });
  const [userId, setUserId] = useState(""); 
  const [inputUserId, setInputUserId] = useState(""); 
  const [syncStatus, setSyncStatus] = useState(""); 

  const stateRef = useRef({ mapGrid, gnomes, resources, exploredTiles, gameTime });

  useEffect(() => {
    stateRef.current = { mapGrid, gnomes, resources, exploredTiles, gameTime };
  }, [mapGrid, gnomes, resources, exploredTiles, gameTime]);

  // --- 游戏循环 ---
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setInterval(() => {
      setGameTime(prev => {
        let newHour = prev.hour + 0.5; 
        let newDay = prev.day;
        if (newHour >= 24) { newHour = 0; newDay += 1; addLog(`🌞 第 ${newDay} 天开始了。`); }
        return { day: newDay, hour: newHour };
      });
      // 农作物生长
      setMapGrid(prevGrid => prevGrid.map(row => row.map(tile => {
        if (tile.type === 'FARM' && tile.growth < 100) {
            if (stateRef.current.gameTime.hour > 6 && stateRef.current.gameTime.hour < 18) {
                return { ...tile, growth: tile.growth + 5 };
            }
        }
        return tile;
      })));
    }, TICK_RATE);
    return () => clearInterval(timer);
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
      const { mapGrid: currentMap, gnomes: currentGnomes, exploredTiles: currentExplored, gameTime } = stateRef.current;
      if (currentMap.length === 0) return;

      const nextMap = currentMap.map(row => [...row]);
      const nextGnomes = currentGnomes.map(g => ({ ...g }));
      const nextExplored = new Set(currentExplored);
      let mapChanged = false;

      nextGnomes.forEach(gnome => {
        gnome.hunger += 0.4; 
        gnome.energy -= 0.2; 
        updateVision(gnome, nextExplored);

        // 1. 睡觉逻辑
        if (gnome.energy < 10 || (gameTime.hour >= 22 && gnome.energy < 80)) {
            gnome.job = 'SLEEPING';
            const tile = nextMap[gnome.y][gnome.x];
            if (tile.type === 'BED') {
                gnome.energy = Math.min(100, gnome.energy + 5); 
                if (gnome.energy >= 100) { gnome.job = 'IDLE'; addLog(`${gnome.name} 睡醒了。`); }
            } else {
                const bed = findNearestBlock(nextMap, gnome.x, gnome.y, 'BED');
                if (bed) moveTo(gnome, bed, nextMap);
                else {
                    gnome.energy = Math.min(100, gnome.energy + 2);
                    if (Math.random() > 0.98) addLog(`${gnome.name} 困倒在地...`);
                }
            }
            return;
        }

        // 2. 吃饭逻辑
        if (gnome.hunger > 80) {
            gnome.job = 'EATING';
            if (stateRef.current.resources.food > 0) {
                setResources(prev => ({ ...prev, food: prev.food - 1 }));
                gnome.hunger = 0; gnome.job = 'IDLE';
                addLog(`${gnome.name} 吃饱了。`);
            } else {
                const foodSource = findNearestFood(nextMap, gnome.x, gnome.y);
                if (foodSource) {
                    if (isNextTo(gnome, foodSource)) {
                        nextMap[foodSource.y][foodSource.x] = { type: 'EMPTY', content: '·' };
                        mapChanged = true; gnome.hunger = 0;
                        addLog(`${gnome.name} 吃了野果。`);
                    } else moveTo(gnome, foodSource, nextMap);
                } else {
                    if (Math.random() > 0.9) addLog(`警告: ${gnome.name} 正在挨饿！`);
                }
            }
            return;
        }

        // 3. 工作逻辑
        if (!gnome.target) {
            const matureCrop = findMatureCrop(nextMap, gnome.x, gnome.y);
            if (matureCrop) { gnome.target = matureCrop; gnome.job = 'FARMING'; } 
            else {
                const tree = findNearestBlock(nextMap, gnome.x, gnome.y, 'TREE');
                if (tree) { gnome.target = tree; gnome.job = 'CHOPPING'; }
            }
        }

        if (gnome.target) {
            if (isNextTo(gnome, gnome.target)) {
                const tTile = nextMap[gnome.target.y][gnome.target.x];
                if (tTile.type === 'TREE') {
                    nextMap[gnome.target.y][gnome.target.x] = { type: 'EMPTY', content: '·' };
                    mapChanged = true;
                    setResources(prev => ({ ...prev, wood: prev.wood + 5 })); 
                    if(Math.random() > 0.7) setResources(prev => ({ ...prev, food: prev.food + 1 }));
                    addLog(`${gnome.name} 砍树 (+5木)`);
                }
                else if (tTile.type === 'FARM' && tTile.growth >= 100) {
                     nextMap[gnome.target.y][gnome.target.x] = { type: 'FARM', content: '~', growth: 0 };
                     mapChanged = true;
                     setResources(prev => ({ ...prev, food: prev.food + 5, wood: prev.wood + 1 })); 
                     addLog(`${gnome.name} 收割 (+5粮)`);
                }
                gnome.target = null; gnome.job = 'IDLE';
            } else moveTo(gnome, gnome.target, nextMap);
        }
      });
      setGnomes(nextGnomes); setExploredTiles(nextExplored);
      if (mapChanged) setMapGrid(nextMap);
    }, TICK_RATE);
    return () => clearInterval(interval);
  }, [isLoaded]);

  // --- 辅助算法 (升级版：支持长距离寻路) ---
  const updateVision = (gnome, exploredSet) => {
      for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) 
          for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) 
              if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) {
                  const tx = gnome.x + dx, ty = gnome.y + dy;
                  if (tx >= 0 && ty >= 0 && tx < MAP_SIZE && ty < MAP_SIZE) exploredSet.add(`${tx},${ty}`);
              }
  };
  const isNextTo = (g, target) => Math.abs(g.x - target.x) + Math.abs(g.y - target.y) <= 1;
  const moveTo = (gnome, target, map) => {
      const nextStep = findPathNextStep({x: gnome.x, y: gnome.y}, target, map);
      if (nextStep) { gnome.x = nextStep.x; gnome.y = nextStep.y; } else { gnome.target = null; }
  };
  const findNearestBlock = (map, px, py, type) => {
    let nearest = null; let minDist = Infinity;
    // 性能优化：不遍历全图，只遍历周围 30 格
    const range = 30;
    const minX = Math.max(0, px - range), maxX = Math.min(MAP_SIZE, px + range);
    const minY = Math.max(0, py - range), maxY = Math.min(MAP_SIZE, py + range);

    for(let y=minY; y<maxY; y++) {
        for(let x=minX; x<maxX; x++) {
            if (map[y][x].type === type) {
                const dist = Math.abs(px - x) + Math.abs(py - y);
                if (dist < minDist) { minDist = dist; nearest = { x, y }; }
            }
        }
    }
    return nearest;
  };
  const findMatureCrop = (map, px, py) => {
      let nearest = null; let minDist = Infinity;
      map.forEach((row, y) => row.forEach((tile, x) => {
        if (tile.type === 'FARM' && tile.growth >= 100) {
          const dist = Math.abs(px - x) + Math.abs(py - y);
          if (dist < minDist) { minDist = dist; nearest = { x, y }; }
        }
      }));
      return nearest;
  };
  const findNearestFood = (map, px, py) => {
      let nearest = null; let minDist = Infinity;
      // 范围搜索优化
      const range = 40;
      const minX = Math.max(0, px - range), maxX = Math.min(MAP_SIZE, px + range);
      const minY = Math.max(0, py - range), maxY = Math.min(MAP_SIZE, py + range);
      for(let y=minY; y<maxY; y++) {
        for(let x=minX; x<maxX; x++) {
            const tile = map[y][x];
            if (tile.type === 'BUSH' || (tile.type === 'FARM' && tile.growth >= 100)) {
                const dist = Math.abs(px - x) + Math.abs(py - y);
                if (dist < minDist) { minDist = dist; nearest = { x, y }; }
            }
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
      if (path.length > 80) continue; // 增加搜索深度以适应大地图
      for (let dir of directions) {
        const nx = x + dir.dx; const ny = y + dir.dy;
        if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue;
        const tile = map[ny][nx];
        const isWalkable = tile.type !== 'WALL' && tile.type !== 'TREE' && tile.type !== 'BUSH'; 
        if (isWalkable && !visited.has(`${nx},${ny}`)) {
          visited.add(`${nx},${ny}`);
          const newPath = path.length === 0 ? [{x: nx, y: ny}] : path;
          queue.push({ x: nx, y: ny, path: newPath });
        }
      }
    }
    return null;
  };

  // --- 初始化逻辑 ---
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
            setLogs(["存档加载成功。", ...parsed.logs]);
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
        // 调整资源密度适应大地图
        if (rand > 0.96) row.push({ type: 'TREE', content: 'T' });
        else if (rand > 0.94) row.push({ type: 'BUSH', content: '%' }); 
        else if (rand > 0.85) row.push({ type: 'WALL', content: '#' });
        else row.push({ type: 'EMPTY', content: '·' });
      }
      newMap.push(row);
    }
    // 出生点居中清理
    const mid = Math.floor(MAP_SIZE / 2);
    for(let y=mid-3; y<mid+3; y++) for(let x=mid-3; x<mid+3; x++) newMap[y][x] = { type: 'EMPTY', content: '·' };

    setMapGrid(newMap);
    setGnomes([
        { id: 1, name: "G.Miner", x: mid, y: mid, hunger: 0, energy: 100, job: 'IDLE', target: null },
        { id: 2, name: "G.Farmer", x: mid-1, y: mid, hunger: 10, energy: 100, job: 'IDLE', target: null }
    ]);
    setResources({ wood: 20, stone: 0, food: 50 });
    const initialExplored = new Set();
    for(let dy=-VIEW_RADIUS; dy<=VIEW_RADIUS; dy++) for(let dx=-VIEW_RADIUS; dx<=VIEW_RADIUS; dx++) initialExplored.add(`${mid+dx},${mid+dy}`);
    setExploredTiles(initialExplored);
    setLogs(["宏大世界 (64x64) 已生成。", "提示：地图变大了，注意食物储备！"]);
    setIsLoaded(true);
  };

  useEffect(() => {
    if (!isLoaded || mapGrid.length === 0) return;
    const saveData = { mapGrid, gnomes, resources, logs: logs.slice(0, 15), exploredTiles: Array.from(exploredTiles), gameTime };
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saveData));
  }, [mapGrid, gnomes, resources, exploredTiles, logs, gameTime, isLoaded]);

  const handleTileClick = (x, y) => {
    if (!stateRef.current.exploredTiles.has(`${x},${y}`)) return;
    const newMap = [...mapGrid];
    const tile = newMap[y][x];
    const cost = BUILD_MENU[selectedTool];
    
    if (resources.wood < cost.wood || resources.stone < cost.stone) {
        addLog(`缺材料: W${cost.wood} S${cost.stone}`); return;
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
            addLog("采集浆果 (+3 食物)"); actionSuccess = true;
        }
    } else {
        if (tile.type === 'EMPTY') {
            let newType = selectedTool;
            let newContent = '?';
            let extraData = {};
            if (selectedTool === 'WALL') newContent = '#';
            if (selectedTool === 'PLANK_WALL') newContent = 'H';
            if (selectedTool === 'BED') newContent = '=';
            if (selectedTool === 'TORCH') newContent = 'i';
            if (selectedTool === 'FARM_PLOT') { newType = 'FARM'; newContent = '~'; extraData = { growth: 0 }; }

            newMap[y][x] = { type: newType, content: newContent, ...extraData };
            setResources(prev => ({ wood: prev.wood - cost.wood, stone: prev.stone - cost.stone }));
            actionSuccess = true;
        }
    }
    if (actionSuccess) setMapGrid(newMap);
  };

  const handleCloudUpload = async () => { /* ...保持不变... */ 
      setSyncStatus("⏳");
      const saveData = { mapGrid, gnomes, resources, logs, exploredTiles: Array.from(exploredTiles), gameTime };
      try {
        const res = await fetch('/api/save', { method: 'POST', body: JSON.stringify({ saveId: userId, data: saveData }) });
        if(res.ok) setSyncStatus("✅"); else setSyncStatus("❌");
      } catch(e) { setSyncStatus("❌"); }
      setTimeout(()=>setSyncStatus(""), 3000);
  };
  const handleCloudDownload = async () => {
      if(!inputUserId) return; setSyncStatus("⏳");
      try {
          const res = await fetch(`/api/load?id=${inputUserId}`);
          const json = await res.json();
          if(res.ok && json.data) {
              setMapGrid(json.data.mapGrid); setGnomes(json.data.gnomes); setResources(json.data.resources);
              setGameTime(json.data.gameTime); setExploredTiles(new Set(json.data.exploredTiles));
              setSyncStatus("✅");
          } else setSyncStatus("❌");
      } catch(e) { setSyncStatus("❌"); }
      setTimeout(()=>setSyncStatus(""), 3000);
  };
  const addLog = (msg) => setLogs(prev => [`[${Math.floor(stateRef.current.gameTime.hour)}:00] ${msg}`, ...prev].slice(0, 8));
  const handleReset = () => { if(confirm("重置到 64x64 新世界?")) { localStorage.removeItem(LOCAL_SAVE_KEY); window.location.reload(); }};

  // 渲染时视野计算
  const visibleSet = new Set();
  gnomes.forEach(g => {
      for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++)
          if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) visibleSet.add(`${g.x + dx},${g.y + dy}`);
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 p-2 font-mono select-none">
      
      {/* 顶部宽屏 Header */}
      <div className="w-full max-w-7xl bg-zinc-900 border border-zinc-800 p-3 mb-2 flex justify-between items-center shadow-2xl rounded">
        <div>
           <h1 className="text-lg font-bold text-amber-500 tracking-widest flex items-center gap-2">
             GNOMORIA // MACRO
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
        <div className="flex gap-4 text-sm">
          <div className="text-orange-400 font-bold">🍔:{resources.food}</div>
          <div className="text-emerald-400 font-bold">🪵:{resources.wood}</div>
          <div className="text-stone-400 font-bold">🪨:{resources.stone}</div>
        </div>
      </div>

      {/* 宽屏游戏区：85vh */}
      <div className="flex gap-2 w-full max-w-7xl h-[85vh]">
        {/* 地图：64x64 */}
        <div className="flex-1 border border-zinc-800 bg-black p-1 overflow-hidden relative flex items-center justify-center">
          <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${MAP_SIZE}, 1fr)` }}>
            {mapGrid.map((row, y) => row.map((tile, x) => {
               const key = `${x},${y}`;
               const gnome = gnomes.find(g => g.x === x && g.y === y);
               const isVisible = visibleSet.has(key);
               const isExplored = exploredTiles.has(key);
               return (
                 <span key={key} onClick={() => handleTileClick(x, y)}
                   className={`w-3.5 h-3.5 flex items-center justify-center cursor-pointer hover:bg-white/10 text-[10px]
                   ${gnome ? (gnome.job==='SLEEPING'?'text-blue-400':'text-red-500 font-bold') : getTileColor(tile, isVisible, isExplored, gameTime.hour)}`}>
                   {!isExplored ? ' ' : (gnome ? (gnome.job==='SLEEPING'?'z':'@') : tile.content)}
                 </span>
               )
            }))}
          </div>
        </div>

        {/* 右侧边栏：紧凑布局 */}
        <div className="flex flex-col gap-2 w-56 h-full">
            <div className="bg-zinc-900 border border-zinc-800 p-2 flex-1 flex flex-col overflow-hidden">
                 <h3 className="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-1">&gt; Build</h3>
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
                <h3 className="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-1">&gt; Squad</h3>
                <div className="flex-1 overflow-y-auto text-[10px] space-y-2">
                    {gnomes.map(g => (
                        <div key={g.id} className="flex justify-between items-center text-zinc-400">
                            <span className={g.hunger>80?'text-red-500':''}>{g.name}</span>
                            <div className="flex flex-col w-16 gap-0.5">
                                <div className="h-0.5 bg-zinc-800"><div className="h-0.5 bg-orange-500" style={{width:`${g.hunger}%`}}></div></div>
                                <div className="h-0.5 bg-zinc-800"><div className="h-0.5 bg-blue-500" style={{width:`${g.energy}%`}}></div></div>
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