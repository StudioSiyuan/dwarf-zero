"use client";
import { useState, useEffect, useRef } from 'react';

// --- 游戏配置 ---
const MAP_SIZE = 20;
const TICK_RATE = 600; //稍微调快一点，让他反应更灵敏

// --- 样式辅助 ---
const getTileColor = (type) => {
  switch (type) {
    case 'WALL':  return 'text-tile-wall';
    case 'TREE':  return 'text-tile-tree';
    case 'WATER': return 'text-tile-water';
    case 'EMPTY': return 'text-tile-floor';
    default:      return 'text-game-text-dim';
  }
};

export default function DwarfGame() {
  const [mapGrid, setMapGrid] = useState([]);
  const [dwarves, setDwarves] = useState([
    { id: 1, name: "阿土", x: 10, y: 10, job: 'IDLE', target: null }
  ]);
  const [resources, setResources] = useState({ wood: 0, stone: 0 });
  const [logs, setLogs] = useState(["系统启动...", "导航模块加载完毕..."]);

  const stateRef = useRef({ mapGrid, dwarves, resources });

  useEffect(() => {
    stateRef.current = { mapGrid, dwarves, resources };
  }, [mapGrid, dwarves, resources]);

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
    newMap[10][10] = { type: 'EMPTY', content: '·' }; // 确保出生点无障碍
    setMapGrid(newMap);
    addLog("世界重置。寻路系统 V2.0 已上线。");
  }, []);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString().slice(3,8)}] ${msg}`, ...prev].slice(0, 9));
  };

  // --- 🌟 核心升级：BFS 寻路算法 (导航系统) ---
  // 输入：起点、终点、地图
  // 输出：下一步该走的坐标 {x, y} 或者 null (无路可走)
  const findPathNextStep = (start, end, map) => {
    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);

    const directions = [
      { dx: 0, dy: -1 }, // 上
      { dx: 0, dy: 1 },  // 下
      { dx: -1, dy: 0 }, // 左
      { dx: 1, dy: 0 }   // 右
    ];

    while (queue.length > 0) {
      const { x, y, path } = queue.shift();

      // 如果到达目标附近 (距离1格)，返回路径的第一步
      if (Math.abs(x - end.x) + Math.abs(y - end.y) <= 1) {
        return path[0] || null; // 如果就在旁边，path为空，不需要移动
      }

      // 搜索四个方向
      for (let dir of directions) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;

        // 越界检查
        if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue;
        
        // 碰撞检查 (只能走空地，或者目标本身是树)
        const tileType = map[ny][nx].type;
        const isWalkable = tileType === 'EMPTY' || (nx === end.x && ny === end.y);

        if (isWalkable && !visited.has(`${nx},${ny}`)) {
          visited.add(`${nx},${ny}`);
          // 记录路径：如果是第一步，就是它自己；否则保持第一步不变
          const newPath = path.length === 0 ? [{x: nx, y: ny}] : path;
          queue.push({ x: nx, y: ny, path: newPath });
        }
      }
    }
    return null; // 找不到路
  };

  const findNearestBlock = (map, px, py, type) => {
    let nearest = null;
    let minDist = Infinity;
    map.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.type === type) {
        // 使用曼哈顿距离估算
        const dist = Math.abs(px - x) + Math.abs(py - y);
        if (dist < minDist) { minDist = dist; nearest = { x, y }; }
      }
    }));
    return nearest;
  };

  // --- 游戏循环 ---
  useEffect(() => {
    const interval = setInterval(() => {
      const { mapGrid: currentMap, dwarves: currentDwarves } = stateRef.current;
      if (currentMap.length === 0) return;

      const nextMap = currentMap.map(row => [...row]);
      const nextDwarves = currentDwarves.map(d => ({ ...d }));
      let mapChanged = false;

      nextDwarves.forEach(dwarf => {
        // 1. 找工作
        if (!dwarf.target) {
          const tree = findNearestBlock(nextMap, dwarf.x, dwarf.y, 'TREE');
          if (tree) {
            dwarf.target = tree;
            dwarf.job = 'MOVING';
            if (currentDwarves.find(d=>d.id===dwarf.id).job === 'IDLE') {
              addLog(`${dwarf.name} 发现了树木，开启导航。`);
            }
          } else {
             dwarf.job = 'IDLE'; 
          }
        }

        // 2. 执行动作
        if (dwarf.target) {
          const dist = Math.abs(dwarf.target.x - dwarf.x) + Math.abs(dwarf.target.y - dwarf.y);

          // A. 如果就在旁边：砍它！
          if (dist <= 1) {
            const targetTile = nextMap[dwarf.target.y][dwarf.target.x];
            if (targetTile.type === 'TREE') {
              nextMap[dwarf.target.y][dwarf.target.x] = { type: 'EMPTY', content: '·' };
              mapChanged = true;
              setResources(prev => ({ ...prev, wood: prev.wood + 10 }));
              addLog(`${dwarf.name} 砍伐成功 (木材+10)`);
              dwarf.target = null;
              dwarf.job = 'IDLE';
            } else {
              dwarf.target = null; // 树可能被别人砍了
            }
          } 
          // B. 如果距离远：寻路走一步
          else {
            // 使用 BFS 算出下一步怎么走
            const nextStep = findPathNextStep(
              {x: dwarf.x, y: dwarf.y}, 
              dwarf.target, 
              nextMap
            );

            if (nextStep) {
              // 成功找到路，移动
              dwarf.x = nextStep.x;
              dwarf.y = nextStep.y;
            } else {
              // 找不到路 (被墙完全围住了)，放弃任务
              // addLog(`${dwarf.name} 无法到达目标，放弃。`);
              dwarf.target = null;
              dwarf.job = 'IDLE';
            }
          }
        }
      });

      setDwarves(nextDwarves);
      if (mapChanged) setMapGrid(nextMap);

    }, TICK_RATE);

    return () => clearInterval(interval);
  }, []);

  const handleTileClick = (x, y) => {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-game-bg text-game-text-main p-4">
      <div className="w-full max-w-3xl bg-game-panel border border-game-border p-4 mb-4 flex justify-between items-center shadow-lg rounded-sm">
        <div>
           <h1 className="text-xl font-bold text-game-text-highlight tracking-widest">DWARF_ZERO // WEB</h1>
           <div className="text-xs text-game-text-dim mt-1">AI_NAV_SYSTEM: V2.0</div>
        </div>
        <div className="flex gap-6 font-mono text-sm">
          <div className="text-tile-tree font-bold">WOOD: {resources.wood}</div>
          <div className="text-tile-wall font-bold">STONE: {resources.stone}</div>
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-3xl h-[500px]">
        <div className="border border-game-border bg-black p-4 overflow-hidden relative shadow-inner flex items-center justify-center">
          <div>
            {mapGrid.map((row, y) => (
              <div key={y} className="flex leading-none">
                {row.map((tile, x) => {
                  const dwarf = dwarves.find(d => d.x === x && d.y === y);
                  return (
                    <span 
                      key={`${x}-${y}`} 
                      onClick={() => handleTileClick(x, y)}
                      className={`w-6 h-6 flex items-center justify-center font-mono cursor-pointer hover:bg-white/10
                      ${dwarf ? 'text-tile-dwarf font-bold animate-pulse' : getTileColor(tile.type)}`}
                    >
                      {dwarf ? '@' : tile.content}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

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