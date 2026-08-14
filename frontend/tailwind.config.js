/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        // Trading-desk dark palette: near-black grounds, one accent, and
        // semantic up/down colors used consistently across chart and UI.
        ink: {
          900: '#0a0d14',
          800: '#0f131c',
          700: '#151a26',
          600: '#1d2433',
          500: '#2a3346',
        },
        bullish: '#22c55e',
        bearish: '#ef4444',
        flat: '#64748b',
        accent: '#38bdf8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
