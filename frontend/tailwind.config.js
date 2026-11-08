/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm organic oatmeal & parchment palette (Rich, glare-free, comforting)
        cream: {
          50: '#FAF7F2',  // elevated parchment card
          100: '#F4EFE6', // card surface
          200: '#ECE5D8', // warm linen background
          250: '#E4DCCF', // canvas backdrop (grounds the eye, no glare)
          300: '#D8CEBF', // structural borders & dividers
          400: '#C7BBA8', // prominent lines & badges
          500: '#AFA18D', // muted borders
        },
        // Deep ink black typography & grounding surfaces
        ink: {
          950: '#121110', // deepest obsidian ink
          900: '#1A1816', // sidebar & rich dark rail
          850: '#24221F', // dark card / headers
          800: '#322F2B', // primary text / headings
          700: '#48443E', // body text
          600: '#645F57', // secondary text
          500: '#827C72', // caption & metadata
          400: '#A49D92',
          300: '#C8C2B7',
        },
        // Signature burnt orange terracotta
        orange: {
          brand: '#C85A17',
          bright: '#DF6726',
          deep: '#9B3C08',
          light: '#F5E4D7',
          warm: '#FCEFE6',
          glow: 'rgba(200, 90, 23, 0.15)',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        serif: ['Newsreader', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        'warm-sm': '0 1px 2px 0 rgba(28, 25, 23, 0.05)',
        'warm': '0 2px 8px -1px rgba(28, 25, 23, 0.08), 0 1px 3px -1px rgba(28, 25, 23, 0.05)',
        'warm-lg': '0 10px 25px -3px rgba(28, 25, 23, 0.1), 0 4px 6px -2px rgba(28, 25, 23, 0.05)',
      }
    },
  },
  plugins: [],
}
