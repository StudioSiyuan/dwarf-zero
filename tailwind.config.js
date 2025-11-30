/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // 注意这里：如果你没有 src 目录，路径必须写成这样
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 定义等宽字体栈
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        // 深渊配色方案
        game: {
          bg: '#0a0a0a',        // 极深背景
          panel: '#171717',     // UI 面板
          border: '#262626',    // 边框
          text: { 
            main: '#e5e5e5',    // 主文字
            dim: '#737373',     // 暗色文字
            highlight: '#ffffff' // 高亮
          }
        },
        // 地块颜色
        tile: {
          wall: '#404040',      // 墙壁深灰
          floor: '#1f1f1f',     // 地板极暗
          tree: '#4ade80',      // 树木亮绿
          water: '#38bdf8',     // 水流蓝色
          dwarf: '#fbbf24',     // 矮人金色
        }
      },
      spacing: { 'cell': '1.5rem' } // 格子大小
    },
  },
  plugins: [],
};