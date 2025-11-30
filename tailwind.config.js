/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        game: {
          bg: '#0a0a0a',
          panel: '#171717',
          border: '#262626',
          text: {
            main: '#e5e5e5',
            dim: '#737373',
            highlight: '#ffffff'
          }
        },
        tile: {
          wall: '#404040',
          floor: '#1f1f1f',
          tree: '#4ade80',
          water: '#38bdf8',
          dwarf: '#fbbf24',
        }
      },
      spacing: { 'cell': '1.5rem' }
    },
  },
  plugins: [],
};