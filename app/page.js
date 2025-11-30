"use client";
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid'; 

// --- Gnomoria 风格配置 ---
const MAP_SIZE = 24; // 地图稍微大一点
const TICK_RATE = 500; // 游戏节奏
const VIEW_RADIUS = 6;
const LOCAL_SAVE_KEY = "GNOMORIA_ZERO_SAVE_V1"; 
const ID_KEY = "GNOMORIA_USER_ID"; 

// --- 资源与建筑 ---
const BUILD_MENU = {
  DIG:        { wood: 0, stone: 0, label: "⛏️ 挖掘墙壁 (Mine Wall)" },
  FORAGE:     { wood: 0, stone: 0, label: "🍓 采集草莓 (Forage)" },
  FARM_PLOT:  { wood: 0, stone: 0, label: "🌱 开垦农田 (Farm Plot)" }, // 免费，但需要等待生长
  WALL:       { wood: 0, stone: 1, label: "🧱 石墙 (Stone Wall)" },
  PLANK_WALL: { wood: 2, stone: 0, label: "🪵 木墙 (Plank Wall)" },
  BED:        { wood: 5, stone: 0, label: "🛏️ 草床 (Straw Bed)" },
  TORCH:      { wood: 2, stone: 0, label: "🔥 火把 (Torch)" },
};

// --- 颜色映射 ---
const getTileColor = (tile, isVisible, isExplored, timeOfDay) => {
  if (!isExplored) return 'text-transparent';
  
  let color = 'text-gray-600';
  let bg = ''; // 背景色支持

  switch (tile.type) {
    case 'WALL':   color = 'text-gray-500'; break;
    case 'TREE':   color = 'text-emerald-500'; break;
    case 'BUSH':   color = 'text-red-400'; break; // 浆果丛
    case 'WATER':  color = 'text-blue-500'; break;
    case 'EMPTY':  color = 'text-stone-800'; break; // 地面颜色
    case 'FARM':   
      // 农田：根据生长阶段变色 (0:褐色泥土 -> 100:绿色作物)
      color = tile.growth >= 100 ? 'text-green-400' : 'text-amber-800'; 
      break;
    case 'BED':    color = 'text-yellow-200'; break;
    case 'TORCH':  color = 'text-orange-500'; break;
  }

  // 夜晚变暗效果 (简单模拟)
  const isNight = timeOfDay > 18 || timeOfDay < 6;
  let opacity = isVisible ? 'opacity-100' : 'opacity-20';
  
  if (isVisible && isNight && tile.type !== 'TORCH') {
      opacity = 'opacity-60'; // 晚上视野变暗
  }

  return `${color} ${bg} ${opacity}`;
};

export default function GnomoriaGame() {
  // --- 核心状态 ---
  const [mapGrid, setMapGrid] = useState([]);
  // 地精数据结构升级：增加 hunger, energy
  const [gnomes, setGnomes] = useState([]);
  const [resources, setResources] = useState({ wood: 0, stone: 0, food: 20 }); // 初始带点干粮
  const [logs, setLogs] = useState([]);
  const [exploredTiles, setExploredTiles] = useState(new Set());
  const [selectedTool, setSelectedTool] = useState('DIG');
  const [isLoaded, setIsLoaded] = useState(false);
  
  // 时间系统
  const [gameTime, setGameTime] = useState({ day: 1, hour: 6 }); // 从第1天早上6点开始

  // 云存档
  const [userId, setUserId] = useState(""); 
  const [inputUserId, setInputUserId] = useState(""); 
  const [syncStatus, setSyncStatus] = useState(""); 

  const stateRef = useRef({ mapGrid, gnomes, resources, exploredTiles, gameTime });

  useEffect(() => {
    stateRef.current = { mapGrid, gnomes, resources, exploredTiles, gameTime };
  }, [mapGrid, gnomes, resources, exploredTiles, gameTime]);

  // --- 1. 时间流逝与农作物生长 ---
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setInterval(() => {
      setGameTime(prev => {
        let newHour = prev.hour + 0.5; // 每 tick 0.5 小时
        let newDay = prev.day;
        if (newHour >= 24) { newHour = 0; newDay += 1; addLog(`🌞 第 ${newDay} 天开始了。`); }
        return { day: newDay, hour: newHour };
      });

      // 农作物生长逻辑
      setMapGrid(prevGrid => prevGrid.map(row => row.map(tile => {
        if (tile.type === 'FARM' && tile.growth < 100) {
            // 只有白天生长
            if (stateRef.current.gameTime.hour > 6 && stateRef.current.gameTime.hour < 18) {
                return { ...tile, growth: tile.growth + 5 }; // 生长速度
            }
        }
        return tile;
      })));

    }, TICK_RATE);
    return () => clearInterval(timer);
  }, [isLoaded]);

  // --- 2. 核心 AI 循环 (Gnomoria 风格) ---
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
        // --- 状态消耗 ---
        gnome.hunger += 0.5; // 饥饿随时间增加
        gnome.energy -= 0.3; // 精力随时间减少
        
        // 更新视野
        updateVision(gnome, nextExplored);

        // --- 行为状态机 (Behavior Tree) ---
        
        // 1. 紧急状态：睡觉 (Energy < 10 或 晚上22点后自动想睡)
        if (gnome.energy < 10 || (gameTime.hour >= 22 && gnome.energy < 80)) {
            gnome.job = 'SLEEPING';
            // 如果已经在床上
            const tile = nextMap[gnome.y][gnome.x];
            if (tile.type === 'BED') {
                gnome.energy = Math.min(100, gnome.energy + 5); // 快速回血
                if (gnome.energy >= 100) { gnome.job = 'IDLE'; addLog(`${gnome.name} 睡醒了，精神焕发。`); }
            } else {
                // 找床
                const bed = findNearestBlock(nextMap, gnome.x, gnome.y, 'BED');
                if (bed) {
                    moveTo(gnome, bed, nextMap);
                } else {
                    // 没床，睡地上 (回血慢)
                    gnome.energy = Math.min(100, gnome.energy + 2);
                    if (Math.random() > 0.9) addLog(`${gnome.name} 在地板上睡着了...`);
                }
            }
            return; // 睡觉时不能干别的
        }

        // 2. 紧急状态：吃饭 (Hunger > 80)
        if (gnome.hunger > 80) {
            gnome.job = 'EATING';
            if (stateRef.current.resources.food > 0) {
                // 凭空吃库存里的食物 (简化版，Gnomoria里需要去食堂)
                setResources(prev => ({ ...prev, food: prev.food - 1 }));
                gnome.hunger = 0;
                addLog(`${gnome.name} 吃了一顿大餐。`);
                gnome.job = 'IDLE';
            } else {
                // 没库存了！尝试采集最近的浆果/成熟农田
                const foodSource = findNearestFood(nextMap, gnome.x, gnome.y);
                if (foodSource) {
                    if (isNextTo(gnome, foodSource)) {
                        // 收割
                        nextMap[foodSource.y][foodSource.x] = { type: 'EMPTY', content: '·' };
                        mapChanged = true;
                        gnome.hunger = 0; // 直接吃掉
                        addLog(`${gnome.name} 狼吞虎咽地吃了地里的东西。`);
                    } else {
                        moveTo(gnome, foodSource, nextMap);
                    }
                } else {
                    addLog(`警告: ${gnome.name} 快饿死了！没有食物！`);
                }
            }
            return;
        }

        // 3. 正常工作 (Job)
        // 优先级：砍树/采集 > 建造 > 闲逛
        if (!gnome.target) {
            // A. 自动收割成熟农作物 (Gnomoria特色: 农业自动化)
            const matureCrop = findMatureCrop(nextMap, gnome.x, gnome.y);
            if (matureCrop) {
                gnome.target = matureCrop;
                gnome.job = 'FARMING';
            } 
            // B. 寻找被标记的树/墙 (这里简化为自动找树)
            else {
                const tree = findNearestBlock(nextMap, gnome.x, gnome.y, 'TREE');
                if (tree) {
                    gnome.target = tree;
                    gnome.job = 'CHOPPING';
                }
            }
        }

        // 执行 Target
        if (gnome.target) {
            if (isNextTo(gnome, gnome.target)) {
                const tTile = nextMap[gnome.target.y][gnome.target.x];
                
                // 砍树
                if (tTile.type === 'TREE') {
                    nextMap[gnome.target.y][gnome.target.x] = { type: 'EMPTY', content: '·' };
                    mapChanged = true;
                    setResources(prev => ({ ...prev, wood: prev.wood + 5 })); // 树木产量减少，鼓励种田
                    // 20% 几率掉落苹果 (食物)
                    if(Math.random() > 0.8) setResources(prev => ({ ...prev, food: prev.food + 1 }));
                    addLog(`${gnome.name} 砍树归来。`);
                }
                // 收割农田
                else if (tTile.type === 'FARM' && tTile.growth >= 100) {
                     // 农田收割后变回空地? 或者是初期阶段变回0? 这里简化为变回泥土等待重种
                     nextMap[gnome.target.y][gnome.target.x] = { type: 'FARM', content: '~', growth: 0 };
                     mapChanged = true;
                     setResources(prev => ({ ...prev, food: prev.food + 5, wood: prev.wood + 1 })); // 获得大量食物 + 秸秆(木)
                     addLog(`${gnome.name} 收割了农作物。`);
                }

                gnome.target = null;
                gnome.job = 'IDLE';
            } else {
                moveTo(gnome, gnome.target, nextMap);
            }
        }
      });

      setGnomes(nextGnomes);
      setExploredTiles(nextExplored);
      if (mapChanged) setMapGrid(nextMap);

    }, TICK_RATE);
    return () => clearInterval(interval);
  }, [isLoaded]);

  // --- 辅助函数 ---
  const updateVision = (gnome, exploredSet) => {
      for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
          for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
              if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) {
                  const tx = gnome.x + dx, ty = gnome.y + dy;
                  if (tx >= 0 && ty >= 0 && tx < MAP_SIZE && ty < MAP_SIZE) exploredSet.add(`${tx},${ty}`);
              }
          }
      }
  };

  const isNextTo = (g, target) => Math.abs(g.x - target.x) + Math.abs(g.y - target.y) <= 1;

  const moveTo = (gnome, target, map) => {
      const nextStep = findPathNextStep({x: gnome.x, y: gnome.y}, target, map);
      if (nextStep) { gnome.x = nextStep.x; gnome.y = nextStep.y; }
      else { gnome.target = null; } // 路不通，放弃
  };

  const findNearestBlock = (map, px, py, type) => {
    let nearest = null; let minDist = Infinity;
    map.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.type === type) {
        const dist = Math.abs(px - x) + Math.abs(py - y);
        if (dist < minDist) { minDist = dist; nearest = { x, y }; }
      }
    }));
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
      // 找浆果丛 或者 成熟农田
      let nearest = null; let minDist = Infinity;
      map.forEach((row, y) => row.forEach((tile, x) => {
        if (tile.type === 'BUSH' || (tile.type === 'FARM' && tile.growth >= 100)) {
          const dist = Math.abs(px - x) + Math.abs(py - y);
          if (dist < minDist) { minDist = dist; nearest = { x, y }; }
        }
      }));
      return nearest;
  };

  const findPathNextStep = (start, end, map) => {
    // 简化的 BFS，为了代码长度不溢出
    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = new Set(); visited.add(`${start.x},${start.y}`);
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    while (queue.length > 0) {
      const { x, y, path } = queue.shift();
      if (Math.abs(x - end.x) + Math.abs(y - end.y) <= 1) return path[0] || null;
      if (path.length > 15) continue; // 限制搜索深度，防止卡顿
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
        setMapGrid(parsed.mapGrid);
        setGnomes(parsed.gnomes);
        setResources(parsed.resources);
        setGameTime(parsed.gameTime || { day: 1, hour: 6 });
        setExploredTiles(new Set(parsed.exploredTiles));
        setIsLoaded(true);
        setLogs(["存档加载成功。", ...parsed.logs]);
        return;
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
        // Gnomoria 地形生成
        if (rand > 0.94) row.push({ type: 'TREE', content: 'T' });
        else if (rand > 0.91) row.push({ type: 'BUSH', content: '%' }); // 浆果丛
        else if (rand > 0.82) row.push({ type: 'WALL', content: '#' });
        else row.push({ type: 'EMPTY', content: '·' });
      }
      newMap.push(row);
    }
    // 出生区域清理
    for(let y=8; y<12; y++) for(let x=8; x<12; x++) newMap[y][x] = { type: 'EMPTY', content: '·' };

    setMapGrid(newMap);
    setGnomes([
        { id: 1, name: "Gnome.Miner", x: 10, y: 10, hunger: 0, energy: 100, job: 'IDLE', target: null },
        { id: 2, name: "Gnome.Farmer", x: 9, y: 10, hunger: 10, energy: 100, job: 'IDLE', target: null }
    ]);
    setResources({ wood: 10, stone: 0, food: 30 }); // 初始带干粮
    const initialExplored = new Set();
    for(let dy=-VIEW_RADIUS; dy<=VIEW_RADIUS; dy++) for(let dx=-VIEW_RADIUS; dx<=VIEW_RADIUS; dx++) initialExplored.add(`${10+dx},${10+dy}`);
    setExploredTiles(initialExplored);
    setLogs(["远征队抵达了新的土地。", "提示：记得开垦农田(Farm Plot)以获取持续食物。"]);
    setIsLoaded(true);
  };

  // 本地保存
  useEffect(() => {
    if (!isLoaded || mapGrid.length === 0) return;
    const saveData = { mapGrid, gnomes, resources, logs: logs.slice(0, 15), exploredTiles: Array.from(exploredTiles), gameTime };
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saveData));
  }, [mapGrid, gnomes, resources, exploredTiles, logs, gameTime, isLoaded]);

  // 交互
  const handleTileClick = (x, y) => {
    if (!stateRef.current.exploredTiles.has(`${x},${y}`)) return;
    const newMap = [...mapGrid];
    const tile = newMap[y][x];
    const cost = BUILD_MENU[selectedTool];
    
    if (resources.wood < cost.wood || resources.stone < cost.stone) {
        addLog(`材料不足！需: 木${cost.wood} 石${cost.stone}`); return;
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
            setResources(prev => ({ ...prev, food: prev.food + 3 })); // 采集浆果
            addLog("采集了野生浆果 (+3 食物)");
            actionSuccess = true;
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
            if (selectedTool === 'FARM_PLOT') { 
                newType = 'FARM'; newContent = '~'; extraData = { growth: 0 }; // 初始生长为0
            }

            newMap[y][x] = { type: newType, content: newContent, ...extraData };
            setResources(prev => ({ wood: prev.wood - cost.wood, stone: prev.stone - cost.stone }));
            actionSuccess = true;
        }
    }
    if (actionSuccess) setMapGrid(newMap);
  };

  const handleCloudUpload = async () => { /* ...云存档逻辑保持不变... */ 
      setSyncStatus("上传中...");
      const saveData = { mapGrid, gnomes, resources, logs, exploredTiles: Array.from(exploredTiles), gameTime };
      try {
        const res = await fetch('/api/save', { method: 'POST', body: JSON.stringify({ saveId: userId, data: saveData }) });
        if(res.ok) setSyncStatus("✅ 成功"); else setSyncStatus("❌ 失败");
      } catch(e) { setSyncStatus("❌ 错误"); }
      setTimeout(()=>setSyncStatus(""), 3000);
  };
  const handleCloudDownload = async () => {
      if(!inputUserId) return; setSyncStatus("下载中...");
      try {
          const res = await fetch(`/api/load?id=${inputUserId}`);
          const json = await res.json();
          if(res.ok && json.data) {
              setMapGrid(json.data.mapGrid); setGnomes(json.data.gnomes); setResources(json.data.resources);
              setGameTime(json.data.gameTime); setExploredTiles(new Set(json.data.exploredTiles));
              setSyncStatus("✅ 成功");
          } else setSyncStatus("❌ 失败");
      } catch(e) { setSyncStatus("❌ 错误"); }
      setTimeout(()=>setSyncStatus(""), 3000);
  };
  const addLog = (msg) => setLogs(prev => [`[${Math.floor(stateRef.current.gameTime.hour)}:00] ${msg}`, ...prev].slice(0, 8));
  const handleReset = () => { if(confirm("重建世界?")) { localStorage.removeItem(LOCAL_SAVE_KEY); window.location.reload(); }};

  // 实时视野计算
  const visibleSet = new Set();
  gnomes.forEach(g => {
      for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++)
          if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) visibleSet.add(`${g.x + dx},${g.y + dy}`);
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 p-4 font-mono select-none">
      <div className="w-full max-w-5xl bg-zinc-900 border border-zinc-800 p-4 mb-4 flex justify-between items-center shadow-2xl rounded">
        <div>
           <h1 className="text-xl font-bold text-amber-500 tracking-widest flex items-center gap-2">
             GNOMORIA // ZERO
             <span className="text-xs text-zinc-500">Day {gameTime.day} {Math.floor(gameTime.hour)}:00</span>
           </h1>
           <div className="flex gap-4 mt-2 items-center text-xs text-zinc-500">
             ID: <input type="text" value={inputUserId} onChange={e=>setInputUserId(e.target.value)} className="bg-black border border-zinc-700 text-green-500 px-2 w-24 text-center"/>
             <button onClick={handleCloudUpload} className="hover:text-white">[☁️ UP]</button>
             <button onClick={handleCloudDownload} className="hover:text-white">[☁️ DL]</button>
             <span className="text-yellow-500">{syncStatus}</span>
             <button onClick={handleReset} className="ml-4 text-red-500 hover:text-red-400">[☠ RESET]</button>
           </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="text-orange-400 font-bold">🍔 FOOD: {resources.food}</div>
          <div className="text-emerald-400 font-bold">🪵 WOOD: {resources.wood}</div>
          <div className="text-stone-400 font-bold">🪨 STONE: {resources.stone}</div>
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-5xl h-[600px]">
        {/* 地图 */}
        <div className="border border-zinc-800 bg-black p-4 overflow-hidden relative flex items-center justify-center">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${MAP_SIZE}, 1fr)` }}>
            {mapGrid.map((row, y) => row.map((tile, x) => {
               const key = `${x},${y}`;
               const gnome = gnomes.find(g => g.x === x && g.y === y);
               const isVisible = visibleSet.has(key);
               const isExplored = exploredTiles.has(key);
               return (
                 <span key={key} onClick={() => handleTileClick(x, y)}
                   className={`w-6 h-6 flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors duration-500
                   ${gnome ? (gnome.job==='SLEEPING'?'text-blue-400':'text-red-500 font-bold') : getTileColor(tile, isVisible, isExplored, gameTime.hour)}`}>
                   {!isExplored ? ' ' : (gnome ? (gnome.job==='SLEEPING'?'z':'@') : tile.content)}
                 </span>
               )
            }))}
          </div>
        </div>

        {/* 右侧面板 */}
        <div className="flex-1 flex flex-col gap-4 w-64">
            {/* 建造菜单 */}
            <div className="bg-zinc-900 border border-zinc-800 p-3 flex-1 flex flex-col">
                 <h3 className="text-xs text-zinc-500 mb-3 uppercase tracking-widest border-b border-zinc-800 pb-2">&gt; Designations</h3>
                 <div className="flex flex-col gap-1 overflow-y-auto h-48">
                    {Object.keys(BUILD_MENU).map(k => (
                        <button key={k} onClick={() => setSelectedTool(k)}
                            className={`text-left px-2 py-1.5 text-xs border transition-all flex justify-between
                            ${selectedTool === k ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                            <span>{BUILD_MENU[k].label}</span>
                            <span>{BUILD_MENU[k].wood>0?`W${BUILD_MENU[k].wood} `:''}{BUILD_MENU[k].stone>0?`S${BUILD_MENU[k].stone}`:''}</span>
                        </button>
                    ))}
                 </div>
            </div>

            {/* 地精状态面板 */}
            <div className="bg-zinc-900 border border-zinc-800 p-3 h-40 flex flex-col">
                <h3 className="text-xs text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-2">&gt; Squad Status</h3>
                <div className="flex-1 overflow-y-auto text-xs space-y-2">
                    {gnomes.map(g => (
                        <div key={g.id} className="flex justify-between items-center text-zinc-400">
                            <span className={g.hunger>80?'text-red-500 animate-pulse':''}>{g.name}</span>
                            <div className="flex flex-col w-20">
                                <div className="flex justify-between text-[10px] text-zinc-600"><span>HNG</span><span>{Math.floor(g.hunger)}%</span></div>
                                <div className="h-1 bg-zinc-800 rounded"><div className="h-1 bg-orange-500" style={{width:`${g.hunger}%`}}></div></div>
                                <div className="flex justify-between text-[10px] text-zinc-600 mt-1"><span>ERG</span><span>{Math.floor(g.energy)}%</span></div>
                                <div className="h-1 bg-zinc-800 rounded"><div className="h-1 bg-blue-500" style={{width:`${g.energy}%`}}></div></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 日志 */}
            <div className="bg-zinc-900 border border-zinc-800 p-3 h-32 flex flex-col">
                <h3 className="text-xs text-zinc-500 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-2">&gt; Log</h3>
                <ul className="space-y-1 text-xs overflow-hidden">
                    {logs.map((log, i) => (<li key={i} className={`truncate ${i === 0 ? 'text-amber-500' : 'text-zinc-600'}`}>{log}</li>))}
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
}