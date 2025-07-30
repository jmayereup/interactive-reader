/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./reader-template.html",
    "./interactive-reader.js",
    "./*.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        'sarabun': ['Sarabun', 'sans-serif'],
      },
      colors: {
        'slate': {
          50: '#f8fafc',
        },
      },
      maxHeight: {
        '45vh': '45vh',
        '100vh': '100vh',
      }
    },
  },
  plugins: [],
}
