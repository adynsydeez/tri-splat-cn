/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4f9eff",
        "primary-dark": "#2e7fd9",
        success: "#27ae60",
        error: "#ff6b6b",
        warning: "#f97316",
      },
    },
  },
  plugins: [],
}
