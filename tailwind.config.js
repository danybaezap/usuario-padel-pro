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
        // Azul marino de Padel House (#00173f = fondo del logo)
        ink: { 950: '#000d26', 900: '#00173f', 850: '#04204d', 800: '#0a2a5c', 700: '#153a73', 600: '#244b88', 500: '#3a62a3' },
        catA: { DEFAULT: '#e8a317', soft: '#e8a31726', ring: '#e8a31766' },
        catB: { DEFAULT: '#1fbf86', soft: '#1fbf8626', ring: '#1fbf8666' },
        catC: { DEFAULT: '#d65ee8', soft: '#d65ee826', ring: '#d65ee866' },
        // Acento: azul claro derivado del azul marino de la marca
        accent: '#5cb8ff',
      },
      keyframes: {
        pulseLive: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        flash: { '0%': { backgroundColor: 'rgba(92,184,255,.25)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: { live: 'pulseLive 1.4s ease-in-out infinite', flash: 'flash 1.6s ease-out' },
    },
  },
  plugins: [],
};
