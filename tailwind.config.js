/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5', // Indigo 600
        secondary: '#9333EA', // Purple 600
        danger: '#DC2626', // Red 600
        success: '#16A34A', // Green 600
      }
    },
  },
  plugins: [],
}
