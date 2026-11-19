/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { 950: '#05080f', 900: '#0a0f1c', 850: '#0e1526', 800: '#131c31', 700: '#1c2742', 600: '#2a3758', 500: '#3f4e74' },
        catA: { DEFAULT: '#f5b021', soft: '#f5b02126', ring: '#f5b02166' },
        catB: { DEFAULT: '#22d3ee', soft: '#22d3ee26', ring: '#22d3ee66' },
        catC: { DEFAULT: '#e879f9', soft: '#e879f926', ring: '#e879f966' },
        lime: { court: '#c6f432' },
      },
      keyframes: {
        pulseLive: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        flash: { '0%': { backgroundColor: 'rgba(198,244,50,.25)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: { live: 'pulseLive 1.4s ease-in-out infinite', flash: 'flash 1.6s ease-out' },
    },
  },
  plugins: [],
};
