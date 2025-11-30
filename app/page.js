"use client";
import { useState, useEffect, useRef } from 'react';

// --- 游戏配置 ---
const MAP_SIZE = 20;
const TICK_RATE = 600; 
const VIEW_RADIUS = 5; // 矮人的视野半径

// --- 样式辅助 ---
const getTileColor = (type, isVisible, isExplored) => {
  // 1. 如果完全没探索过 -> 隐藏 (黑色)
  if (!isExplored) return 'text-transparent';

  // 2. 基础颜色
  let color = 'text-game-text-dim';
  switch (type) {
    case 'WALL':  color = 'text-tile-wall'; break;
    case 'TREE':  color = 'text-tile-tree'; break;
    case 'WATER': color = 'text-tile-water'; break;
    case 'EMPTY': color = 'text-tile-floor'; break;
  }

  // 3. 视觉处理：
  // 如果当前可见 -> 保持原色 (高亮)
  // 如果只是“记忆中” -> 降低透明度 (变暗)
  if (isVisible) {
    return color;
  } else {
    return `${color} opacity-20`; // 记忆区域变暗，非常有质感
  }
};

export default function DwarfGame() {
  const [mapGrid, setMapGrid] = useState([]);
  const [dwarves, setDwarves] = useState([
    { id: 1, name: "阿土", x: 10, y: 10, job: 'IDLE', target: null }
  ]);
  const [resources, setResources] = useState({ wood: 0, stone: 0 });
  const [logs, setLogs] = useState(["系统启动...", "战争迷雾系统已加载..."]);
  
  // 新增：探索过的区域 (存储格式 "x,y")
  const [exploredTiles, setExploredTiles] = useState(new Set());

  const stateRef = useRef({ mapGrid, dwarves, resources, exploredTiles });

  useEffect(() => {
    stateRef.current = { mapGrid, dwarves, resources, exploredTiles };
  }, [mapGrid, dwarves, resources, exploredTiles]);

  // --- 初始化地图 ---
  useEffect(() => {
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
    // 出生点保护
    newMap[10][10] = { type: 'EMPTY', content: '·' };
    
    // 初始点亮出生点周围
    const initialExplored = new Set();
    for(let dy=-VIEW_RADIUS; dy<=VIEW_RADIUS; dy++){
        for(let dx=-VIEW_RADIUS; dx<=VIEW_RADIUS; dx++){
            initialExplored.add(`${10+dx},${10+dy}`);
        }
    }
    
    setMapGrid(newMap);
    setExploredTiles(initialExplored);
    addLog("区域扫描完成。进入地下探索模式。");
  }, []);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString().slice(3,8)}] ${msg}`, ...prev].slice(0, 9));
  };

  // --- BFS 寻路算法 ---
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
        
        const isWalkable = map[ny][nx].type === 'EMPTY' || (nx === end.x && ny === end.y);
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

  // --- 核心循环 ---
  useEffect(() => {
    const interval = setInterval(() => {
      const { mapGrid: currentMap, dwarves: currentDwarves, exploredTiles: currentExplored } = stateRef.current;
      if (currentMap.length === 0) return;

      const nextMap = currentMap.map(row => [...row]);
      const nextDwarves = currentDwarves.map(d => ({ ...d }));
      // 复制 Set，用于更新探索区域
      const nextExplored = new Set(currentExplored);
      let mapChanged = false;

      nextDwarves.forEach(dwarf => {
        // --- 1. 更新迷雾 (Fog of War) ---
        // 矮人走到哪里，哪里的迷雾就散开
        for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
            for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
                const tx = dwarf.x + dx;
                const ty = dwarf.y + dy;
                // 简单的圆形视野检查
                if (tx >= 0 && ty >= 0 && tx < MAP_SIZE && ty < MAP_SIZE) {
                    if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) {
                        nextExplored.add(`${tx},${ty}`);
                    }
                }
            }
        }

        // --- 2. AI 逻辑 ---
        if (!dwarf.target) {
          const tree = findNearestBlock(nextMap, dwarf.x, dwarf.y, 'TREE');
          if (tree) {
            dwarf.target = tree;
            dwarf.job = 'MOVING';
            if (currentDwarves.find(d=>d.id===dwarf.id).job === 'IDLE') {
              addLog(`${dwarf.name} 探索到了树木，正在前往。`);
            }
          } else {
             dwarf.job = 'IDLE'; 
          }
        }

        if (dwarf.target) {
          const dist = Math.abs(dwarf.target.x - dwarf.x) + Math.abs(dwarf.target.y - dwarf.y);
          if (dist <= 1) {
            const targetTile = nextMap[dwarf.target.y][dwarf.target.x];
            if (targetTile.type === 'TREE') {
              nextMap[dwarf.target.y][dwarf.target.x] = { type: 'EMPTY', content: '·' };
              mapChanged = true;
              setResources(prev => ({ ...prev, wood: prev.wood + 10 }));
              addLog(`${dwarf.name} 砍倒了树 (木材+10)`);
              dwarf.target = null;
              dwarf.job = 'IDLE';
            } else {
              dwarf.target = null;
            }
          } else {
            const nextStep = findPathNextStep({x: dwarf.x, y: dwarf.y}, dwarf.target, nextMap);
            if (nextStep) {
              dwarf.x = nextStep.x;
              dwarf.y = nextStep.y;
            } else {
              dwarf.target = null;
              dwarf.job = 'IDLE';
            }
          }
        }
      });

      setDwarves(nextDwarves);
      setExploredTiles(nextExplored); // 更新探索区域
      if (mapChanged) setMapGrid(nextMap);

    }, TICK_RATE);

    return () => clearInterval(interval);
  }, []);

  const handleTileClick = (x, y) => {
    // 只有探索过的地方才能交互！
    if (!stateRef.current.exploredTiles.has(`${x},${y}`)) return;

    const newMap = [...mapGrid];
    const tile = newMap[y][x];
    if (tile.type === 'WALL') {
      newMap[y][x] = { type: 'EMPTY', content: '·' };
      setResources(prev => ({ ...prev, stone: prev.stone + 1 }));
    } else if (tile.type === 'EMPTY') {
      newMap[y][x] = { type: 'WALL', content: '#' };
    }
    setMapGrid(newMap);
  };

  // --- 渲染辅助：判断当前视野 ---
  // 每一帧都要重新计算哪些格子是“当前可见”的
  const getVisibleSet = () => {
    const visible = new Set();
    dwarves.forEach(d => {
        for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
            for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
                if (Math.abs(dx) + Math.abs(dy) <= VIEW_RADIUS) {
                    visible.add(`${d.x + dx},${d.y + dy}`);
                }
            }
        }
    });
    return visible;
  };

  const visibleSet = getVisibleSet(); // 渲染时实时计算

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-game-bg text-game-text-main p-4">
      <div className="w-full max-w-3xl bg-game-panel border border-game-border p-4 mb-4 flex justify-between items-center shadow-lg rounded-sm">
        <div>
           <h1 className="text-xl font-bold text-game-text-highlight tracking-widest">DWARF_ZERO // WEB</h1>
           <div className="text-xs text-game-text-dim mt-1">MODULE: FOG_OF_WAR</div>
        </div>
        <div className="flex gap-6 font-mono text-sm">
          <div className="text-tile-tree font-bold">WOOD: {resources.wood}</div>
          <div className="text-tile-wall font-bold">STONE: {resources.stone}</div>
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-3xl h-[500px]">
        {/* 左侧：地图区域 */}
        <div className="border border-game-border bg-black p-4 overflow-hidden relative shadow-inner flex items-center justify-center">
          <div>
            {mapGrid.map((row, y) => (
              <div key={y} className="flex leading-none">
                {row.map((tile, x) => {
                  const key = `${x},${y}`;
                  const dwarf = dwarves.find(d => d.x === x && d.y === y);
                  
                  // 状态判断
                  const isVisible = visibleSet.has(key);
                  const isExplored = exploredTiles.has(key);
                  
                  // 如果完全没探索过，就不显示鼠标手势
                  const cursorClass = isExplored ? 'cursor-pointer hover:bg-white/10' : 'cursor-default';

                  return (
                    <span 
                      key={key} 
                      onClick={() => handleTileClick(x, y)}
                      className={`w-6 h-6 flex items-center justify-center font-mono transition-colors duration-500 ${cursorClass}
                      ${dwarf ? 'text-tile-dwarf font-bold animate-pulse' : getTileColor(tile.type, isVisible, isExplored)}`}
                    >
                      {/* 如果完全没探索过，显示空或者迷雾字符；如果有矮人，优先显示矮人 */}
                      {!isExplored ? ' ' : (dwarf ? '@' : tile.content)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：日志 */}
        <div className="flex-1 bg-game-panel border border-game-border p-4 flex flex-col rounded-sm">
          <h3 className="text-xs text-game-text-dim mb-3 uppercase border-b border-game-border pb-2 tracking-widest">&gt; System Log</h3>
          <div className="flex-1 overflow-hidden relative">
            <ul className="space-y-2 font-mono text-xs absolute bottom-0 w-full">
              {logs.map((log, i) => (
                <li key={i} className={`truncate ${i === 0 ? 'text-game-text-highlight' : 'text-game-text-dim'}`}>
                  {log}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}