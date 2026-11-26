/** @type {import('tailwindcss').Config} */
// MIHWAR CLOUD ERP brand tokens. The whole app uses `slate` (surfaces/text) and `blue` (actions);
// re-pointing those scales to the brand palette re-skins every page consistently.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'Montserrat', 'system-ui', 'sans-serif'],
        brand: ['Montserrat', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: { navy: '#0B1F44', blue: '#007BFF', cyan: '#00C2FF', gray: '#E6E8ED' },
        // Navy-tinted neutrals (Deep Navy #0B1F44 is the card surface).
        slate: {
          50: '#F5F7FB', 100: '#E6E8ED', 200: '#D3D9E6', 300: '#B4BED3', 400: '#8F9DBA', 500: '#6B7A9B',
          600: '#4A5B80', 700: '#26396A', 800: '#15295A', 900: '#0B1F44', 950: '#06122B',
        },
        // Electric Blue #007BFF is the primary action colour.
        blue: {
          50: '#EAF4FF', 100: '#D1E8FF', 200: '#A3D1FF', 300: '#66B3FF', 400: '#33A0FF', 500: '#1A8CFF',
          600: '#007BFF', 700: '#0062CC', 800: '#004C9E', 900: '#0B1F44', 950: '#06122B',
        },
        cyan: { 300: '#66DAFF', 400: '#00C2FF', 500: '#00A8E0' },
      },
      keyframes: { brandbar: { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(320%)' } } },
    },
  },
  plugins: [],
};
