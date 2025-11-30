"use client";
import { useState, useEffect, useRef } from 'react';

// --- 游戏配置 ---
const MAP_SIZE = 20;    // 地图 20x20
const TICK_RATE = 800;  // 游戏循环速度 (毫秒)

// --- 样式辅助函数 ---
const getTileColor = (type) => {
  switch (type) {
    case 'WALL':  return 'text-tile-wall';
    case 'TREE':  return 'text-tile-tree';
    case 'WATER': return 'text-tile-water';
    case 'EMPTY': return 'text-tile-floor'; // 地板颜色
    default:      return 'text-game-text-dim';
  }
};

export default function DwarfGame() {
  // --- 1. 状态定义 ---
  // 地图网格
  const [mapGrid, setMapGrid] = useState([]);
  // 实体列表 (矮人)
  const [dwarves, setDwarves] = useState([
    { id: 1, name: "阿土", x: 10, y: 10, job: 'IDLE', target: null }
  ]);
  // 资源
  const [resources, setResources] = useState({ wood: 0, stone: 0 });
  // 日志
  const [logs, setLogs] = useState(["系统启动...", "等待指令..."]);

  // --- 2. 引用 (用于在定时器中读取最新状态) ---
  const stateRef = useRef({ mapGrid, dwarves, resources });

  // 保持 Ref 同步
  useEffect(() => {
    stateRef.current = { mapGrid, dwarves, resources };
  }, [mapGrid, dwarves, resources]);

  // --- 3. 初始化世界 (只运行一次) ---
  useEffect(() => {
    const newMap = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      const row = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        const rand = Math.random();
        // 15% 墙壁, 8% 树木, 剩下是空地
        if (rand > 0.85) row.push({ type: 'WALL', content: '#' });
        else if (rand > 0.92) row.push({ type: 'TREE', content: 'T' });
        else row.push({ type: 'EMPTY', content: '·' });
      }
      newMap.push(row);
    }
    setMapGrid(newMap);
    addLog("世界生成完毕 (Seed: 0x9F)");
  }, []);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString().slice(3,8)}] ${msg}`, ...prev].slice(0, 9));
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

  // --- 4. 核心游戏循环 (Game Loop) ---
  useEffect(() => {
    const interval = setInterval(() => {
      // 读取最新状态
      const { mapGrid: currentMap, dwarves: currentDwarves } = stateRef.current;
      if (currentMap.length === 0) return;

      // 创建副本以便修改
      const nextMap = currentMap.map(row => [...row]);
      const nextDwarves = currentDwarves.map(d => ({ ...d }));
      let mapChanged = false;

      nextDwarves.forEach(dwarf => {
        // [AI 阶段 1: 寻找目标]
        if (!dwarf.target) {
          // 找最近的树
          const tree = findNearestBlock(nextMap, dwarf.x, dwarf.y, 'TREE');
          if (tree) {
            dwarf.target = tree;
            dwarf.job = 'MOVING';
            // 防止日志刷屏，只在状态改变时记录
            if (currentDwarves.find(d=>d.id===dwarf.id).job === 'IDLE') {
                addLog(`${dwarf.name} 发现了树木，准备前往。`);
            }
          } else {
             dwarf.job = 'IDLE'; // 没树了，发呆
          }
        }

        // [AI 阶段 2: 执行动作]
        if (dwarf.target) {
          const dx = dwarf.target.x - dwarf.x;
          const dy = dwarf.target.y - dwarf.y;
          const dist = Math.abs(dx) + Math.abs(dy);

          if (dist <= 1) {
            // 到达目标：砍伐
            const targetTile = nextMap[dwarf.target.y][dwarf.target.x];
            if (targetTile.type === 'TREE') {
              // 修改地图：树变地板
              nextMap[dwarf.target.y][dwarf.target.x] = { type: 'EMPTY', content: '·' };
              mapChanged = true;
              
              // 增加资源
              setResources(prev => ({ ...prev, wood: prev.wood + 10 }));
              addLog(`${dwarf.name} 砍倒了树 (木材+10)`);
              
              // 重置任务
              dwarf.target = null;
              dwarf.job = 'IDLE';
            } else {
              // 树如果不翼而飞了
              dwarf.target = null;
            }
          } else {
            // 移动逻辑 (简单的 XY 轴移动)
            let moveX = Math.sign(dx);
            let moveY = Math.sign(dy);
            
            // 简单的防撞墙检测
            if (nextMap[dwarf.y][dwarf.x + moveX]?.type === 'WALL') moveX = 0;
            if (nextMap[dwarf.y + moveY]?.[dwarf.x]?.type === 'WALL') moveY = 0;

            if (moveX !== 0) dwarf.x += moveX;
            else if (moveY !== 0) dwarf.y += moveY;
          }
        }
      });

      // 更新状态
      setDwarves(nextDwarves);
      if (mapChanged) setMapGrid(nextMap);

    }, TICK_RATE);

    return () => clearInterval(interval);
  }, []);

  // --- 5. 渲染界面 ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-game-bg text-game-text-main p-4">
      
      {/* 顶部状态栏 */}
      <div className="w-full max-w-3xl bg-game-panel border border-game-border p-3 mb-4 flex justify-between items-center shadow-lg rounded-sm">
        <div>
           <h1 className="text-xl font-bold text-game-text-highlight tracking-widest">DWARF_ZERO // WEB</h1>
           <div className="text-xs text-game-text-dim mt-1">AUTO_PILOT_MODE: ON</div>
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
                  // 判断此处是否有矮人
                  const dwarf = dwarves.find(d => d.x === x && d.y === y);
                  return (
                    <span key={`${x}-${y}`} className={`w-6 h-6 flex items-center justify-center font-mono transition-colors duration-300
                      ${dwarf ? 'text-tile-dwarf font-bold animate-pulse' : getTileColor(tile.type)}`}>
                      {dwarf ? '@' : tile.content}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：日志区域 */}
        <div className="flex-1 bg-game-panel border border-game-border p-4 flex flex-col rounded-sm">
          <h3 className="text-xs text-game-text-dim mb-3 uppercase border-b border-game-border pb-2 tracking-widest">> System Log</h3>
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