"use client";
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid'; 

// --- 游戏配置 ---
const MAP_SIZE = 20;
const TICK_RATE = 600;
const VIEW_RADIUS = 5;
const LOCAL_SAVE_KEY = "DWARF_ZERO_LOCAL_V1"; 
const ID_KEY = "DWARF_ZERO_USER_ID"; 

// --- 建筑耗材 ---
const BUILD_COSTS = {
  DIG:   { wood: 0, stone: 0, label: "挖掘 (Dig)" },
  WALL:  { wood: 0, stone: 1, label: "建造墙壁 (Wall)" },
  TABLE: { wood: 5, stone: 0, label: "木桌 (Table)" },
  BED:   { wood: 8, stone: 0, label: "木床 (Bed)" },
  DOOR:  { wood: 3, stone: 0, label: "木门 (Door)" }
};

// --- 样式辅助 ---
const getTileColor = (type, isVisible, isExplored) => {
  if (!isExplored) return 'text-transparent';
  let color = 'text-gray-500';
  switch (type) {
    case 'WALL':  color = 'text-gray-500'; break;
    case 'TREE':  color = 'text-green-400'; break;
    case 'WATER': color = 'text-blue-400'; break;
    case 'EMPTY': color = 'text-gray-800'; break;
    case 'TABLE': color = 'text-cyan-400'; break;
    case 'BED':   color = 'text-indigo-400'; break;
    case 'DOOR':  color = 'text-yellow-600'; break;
  }
  return isVisible ? color : `${color} opacity-20`;
};

export default function DwarfGame() {
  const [mapGrid, setMapGrid] = useState([]);
  const [dwarves, setDwarves] = useState([]);
  const [resources, setResources] = useState({ wood: 0, stone: 0 });
  const [logs, setLogs] = useState([]);
  const [exploredTiles, setExploredTiles] = useState(new Set());
  const [selectedTool, setSelectedTool] = useState('DIG');
  const [isLoaded, setIsLoaded] = useState(false);
  
  // --- 云存档状态 ---
  const [userId, setUserId] = useState(""); 
  const [inputUserId, setInputUserId] = useState(""); 
  const [syncStatus, setSyncStatus] = useState(""); 

  const stateRef = useRef({ mapGrid, dwarves, resources, exploredTiles });

  useEffect(() => {
    stateRef.current = { mapGrid, dwarves, resources, exploredTiles };
  }, [mapGrid, dwarves, resources, exploredTiles]);

  // --- 本地自动保存 ---
  useEffect(() => {
    if (!isLoaded || mapGrid.length === 0) return;
    const saveData = {
      mapGrid, dwarves, resources, logs: logs.slice(0, 20), exploredTiles: Array.from(exploredTiles)
    };
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saveData));
  }, [mapGrid, dwarves, resources, exploredTiles, logs, isLoaded]);

  // --- 初始化 ---
  useEffect(() => {
    let storedId = localStorage.getItem(ID_KEY);
    if (!storedId) {
      storedId = uuidv4().slice(0, 8).toUpperCase(); 
      localStorage.setItem(ID_KEY, storedId);
    }
    setUserId(storedId);
    setInputUserId(storedId);

    const savedData = localStorage.getItem(LOCAL_SAVE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        loadGameData(parsed);
        setLogs(prev => ["本地存档读取成功。", ...prev]);
        return;
      } catch (e) { console.error(e); }
    }
    generateNewWorld();
  }, []);

  const loadGameData = (data) => {
    setMapGrid(data.mapGrid);
    setDwarves(data.dwarves);
    setResources(data.resources);
    setExploredTiles(new Set(data.exploredTiles));
    setIsLoaded(true);
  };

  const generateNewWorld = () => {
    const newMap = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      const row = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        const rand = Math.random();
        if (rand > 0.92) row.push({ type: 'TREE', content: 'T' });
        else if (rand > 0.8) row.push({ type: 'WALL', content: '#' });
        else row.push({ type: 'EMPTY', content: '·' });
      }
      newMap.push(row);
    }
    newMap[10][10] = { type: 'EMPTY', content: '·' };
    const initialExplored = new Set();
    for(let dy=-VIEW_RADIUS; dy<=VIEW_RADIUS; dy++){
        for(let dx=-VIEW_RADIUS; dx<=VIEW_RADIUS; dx++){
            initialExplored.add(`${10+dx},${10+dy}`);
        }
    }
    setMapGrid(newMap);
    setDwarves([{ id: 1, name: "阿土", x: 10, y: 10, job: 'IDLE', target: null }]);
    setResources({ wood: 50, stone: 10 });
    setExploredTiles(initialExplored);
    setLogs(["新世界已生成。"]);
    setIsLoaded(true);
  };

  // --- ☁️ 云端同步逻辑 ---
  const handleCloudUpload = async () => {
    setSyncStatus("上传中...");
    const saveData = {
      mapGrid, dwarves, resources, logs: logs.slice(0, 20), exploredTiles: Array.from(exploredTiles)
    };
    
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveId: userId, data: saveData }),
      });
      if (res.ok) {
        setSyncStatus("✅ 上传成功! ID: " + userId);
        addLog(`云存档已同步至服务器。ID: ${userId}`);
      } else {
        setSyncStatus("❌ 上传失败");
      }
    } catch (e) {
      setSyncStatus("❌ 网络错误");
    }
    setTimeout(() => setSyncStatus(""), 3000);
  };

  const handleCloudDownload = async () => {
    if (!inputUserId) return;
    setSyncStatus("下载中...");
    
    try {
      const res = await fetch(`/api/load?id=${inputUserId}`);
      const json = await res.json();
      
      if (res.ok && json.data) {
        loadGameData(json.data);
        setUserId(inputUserId); 
        localStorage.setItem(ID_KEY, inputUserId); 
        setSyncStatus("✅ 读取成功");
        addLog(`已加载云存档 ID: ${inputUserId}`);
      } else {
        setSyncStatus("❌ 找不到存档");
      }
    } catch (e) {
      setSyncStatus("❌ 网络错误");
    }
    setTimeout(() => setSyncStatus(""), 3000);
  };

  // --- 游戏循环 ---
  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString().slice(3,8)}] ${msg}`, ...prev].slice(0, 9));
  };
  
  const findPathNextStep = (start, end, map) => {
    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

    while (queue.length > 0) {
      const { x, y, path } = queue.shift();
      if (Math.abs(x - end.x) + Math.abs(y - end.y) <= 1) return path[0] || null;

      for (let dir of directions) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue;
        const tile = map[ny][nx];
        const isWalkable = tile.type === 'EMPTY' || tile.type === 'DOOR' || (nx === end.x && ny === end.y);
        if (isWalkable && !visited.has(`${nx},${ny}`)) {
          visited.add(`${nx},${ny}`);
          const newPath = path.length === 0 ? [{x: nx, y: ny}] : path;
          queue.push({ x: nx, y: ny, path: newPath });
        }
      }
    }
    return null;
  };

  const findNearestBlock = (map, px, py, type) => {
    let nearest = null;
    let minDist = Infinity;
    map.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.type === type) {
        const dist = Math.abs(px - x) + Math.abs(py - y);
        if (dist < minDist) { minDist = dist; nearest = { x, y }; }
      }
    }));
    return nearest;
  };

  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
      const { mapGrid: currentMap, dwarves: currentDwarves, exploredTiles: currentExplored } = stateRef.current;
      if (currentMap.length === 0) return;

      const nextMap = currentMap.map(row => [...row]);
      const nextDwarves = currentDwarves.map(d => ({ ...d }));
      const nextExplored = new Set(currentExplored);
      let mapChanged = false;

      nextDwarves.forEach(dwarf => {
        for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
            for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
                if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) {
                    const tx = dwarf.x + dx, ty = dwarf.y + dy;
                    if (tx >= 0 && ty >= 0 && tx < MAP_SIZE && ty < MAP_SIZE) nextExplored.add(`${tx},${ty}`);
                }
            }
        }
        if (!dwarf.target) {
          const tree = findNearestBlock(nextMap, dwarf.x, dwarf.y, 'TREE');
          if (tree) { dwarf.target = tree; dwarf.job = 'MOVING'; }
        }
        if (dwarf.target) {
          const dist = Math.abs(dwarf.target.x - dwarf.x) + Math.abs(dwarf.target.y - dwarf.y);
          if (dist <= 1) {
            const targetTile = nextMap[dwarf.target.y][dwarf.target.x];
            if (targetTile.type === 'TREE') {
              nextMap[dwarf.target.y][dwarf.target.x] = { type: 'EMPTY', content: '·' };
              mapChanged = true;
              setResources(prev => ({ ...prev, wood: prev.wood + 10 }));
              addLog(`${dwarf.name} 采集了木材 (+10)`);
              dwarf.target = null; dwarf.job = 'IDLE';
            } else { dwarf.target = null; }
          } else {
            const nextStep = findPathNextStep({x: dwarf.x, y: dwarf.y}, dwarf.target, nextMap);
            if (nextStep) { dwarf.x = nextStep.x; dwarf.y = nextStep.y; }
            else { dwarf.target = null; }
          }
        }
      });
      setDwarves(nextDwarves); setExploredTiles(nextExplored);
      if (mapChanged) setMapGrid(nextMap);
    }, TICK_RATE);
    return () => clearInterval(interval);
  }, [isLoaded]);

  const handleTileClick = (x, y) => {
    if (!stateRef.current.exploredTiles.has(`${x},${y}`)) return;
    const newMap = [...mapGrid];
    const tile = newMap[y][x];
    const cost = BUILD_COSTS[selectedTool];
    
    if (resources.wood < cost.wood || resources.stone < cost.stone) {
        addLog(`材料不足！需要: 木${cost.wood} 石${cost.stone}`); return;
    }

    let actionSuccess = false;
    if (selectedTool === 'DIG') {
        if (tile.type === 'WALL') {
            newMap[y][x] = { type: 'EMPTY', content: '·' };
            setResources(prev => ({ ...prev, stone: prev.stone + 1 }));
            addLog(`挖掘成功 (石料+1)`); actionSuccess = true;
        }
    } else {
        if (tile.type === 'EMPTY') {
            let newContent = selectedTool === 'WALL' ? '#' : selectedTool === 'TABLE' ? 'Π' : selectedTool === 'BED' ? '=' : selectedTool === 'DOOR' ? '+' : '?';
            newMap[y][x] = { type: selectedTool, content: newContent };
            setResources(prev => ({ wood: prev.wood - cost.wood, stone: prev.stone - cost.stone }));
            addLog(`建造了 ${cost.label}`); actionSuccess = true;
        }
    }
    if (actionSuccess) setMapGrid(newMap);
  };

  const visibleSet = new Set();
  dwarves.forEach(d => {
      for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
          for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
              if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) visibleSet.add(`${d.x + dx},${d.y + dy}`);
          }
      }
  });

  // --- 重置处理 ---
  const handleReset = () => {
    if (confirm("确定要重置世界吗？")) {
        localStorage.removeItem(LOCAL_SAVE_KEY);
        window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-game-bg text-game-text-main p-4 font-mono select-none">
      
      {/* 顶部面板 */}
      <div className="w-full max-w-4xl bg-game-panel border border-game-border p-4 mb-4 flex justify-between items-center shadow-lg rounded-sm">
        <div className="flex flex-col">
           <h1 className="text-xl font-bold text-white tracking-widest">DWARF_ZERO // CLOUD V0.9</h1>
           <div className="flex gap-4 mt-2 items-center text-xs">
             <span className="text-gray-500">ID:</span>
             <input 
               type="text" 
               value={inputUserId} 
               onChange={(e) => setInputUserId(e.target.value)} 
               className="bg-black border border-gray-700 text-green-500 px-2 py-0.5 w-24 text-center focus:outline-none focus:border-green-500"
             />
             <button onClick={handleCloudUpload} className="text-gray-300 hover:text-white border border-gray-600 px-2 py-0.5 hover:bg-gray-800">[⬆ UPLOAD]</button>
             <button onClick={handleCloudDownload} className="text-gray-300 hover:text-white border border-gray-600 px-2 py-0.5 hover:bg-gray-800">[⬇ LOAD]</button>
             <span className="text-yellow-500">{syncStatus}</span>
             <button onClick={handleReset} className="ml-4 text-red-500 hover:underline">[RESET]</button>
           </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="text-green-400 font-bold">WOOD: {resources.wood}</div>
          <div className="text-gray-400 font-bold">STONE: {resources.stone}</div>
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-4xl h-[500px]">
        {/* 地图 */}
        <div className="border border-game-border bg-black p-4 overflow-hidden relative flex items-center justify-center">
          <div>
            {mapGrid.map((row, y) => (
              <div key={y} className="flex leading-none">
                {row.map((tile, x) => {
                  const key = `${x},${y}`;
                  const dwarf = dwarves.find(d => d.x === x && d.y === y);
                  const isVisible = visibleSet.has(key);
                  const isExplored = exploredTiles.has(key);
                  return (
                    <span 
                      key={key} 
                      onClick={() => handleTileClick(x, y)}
                      className={`w-6 h-6 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors duration-300
                      ${dwarf ? 'text-yellow-400 font-bold animate-pulse' : getTileColor(tile.type, isVisible, isExplored)}`}
                    >
                      {!isExplored ? ' ' : (dwarf ? '@' : tile.content)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧 */}
        <div className="flex-1 flex flex-col gap-4">
            <div className="bg-game-panel border border-game-border p-3 flex-1 flex flex-col">
                 <h3 className="text-xs text-gray-500 mb-3 uppercase tracking-widest border-b border-gray-800 pb-2">&gt; Build Menu</h3>
                 <div className="grid grid-cols-1 gap-2 overflow-y-auto">
                    {Object.keys(BUILD_COSTS).map(toolKey => (
                        <button key={toolKey} onClick={() => setSelectedTool(toolKey)}
                            className={`text-left px-3 py-2 text-xs border transition-all flex justify-between group
                            ${selectedTool === toolKey ? 'border-white text-white bg-white/5' : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300'}`}>
                            <span>{BUILD_COSTS[toolKey].label}</span>
                            <span className="text-gray-600 group-hover:text-gray-400">{BUILD_COSTS[toolKey].wood > 0 && `W:${BUILD_COSTS[toolKey].wood} `}{BUILD_COSTS[toolKey].stone > 0 && `S:${BUILD_COSTS[toolKey].stone}`}</span>
                        </button>
                    ))}
                 </div>
            </div>
            <div className="bg-game-panel border border-game-border p-3 h-48 flex flex-col">
                <h3 className="text-xs text-gray-500 mb-2 uppercase tracking-widest border-b border-gray-800 pb-2">&gt; Log</h3>
                <div className="flex-1 overflow-hidden relative">
                    <ul className="space-y-1 text-xs absolute bottom-0 w-full">
                    {logs.map((log, i) => (<li key={i} className={`truncate ${i === 0 ? 'text-white' : 'text-gray-600'}`}>{log}</li>))}
                    </ul>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}