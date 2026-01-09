/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"  // <--- The magic fix is adding 'ts' and 'tsx' here
  ],
  DARKmODE: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'], // This fixes the Times New Roman font
      },
    },
  },
  plugins: [],
}