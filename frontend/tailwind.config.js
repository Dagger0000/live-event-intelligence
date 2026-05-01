/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#e0e9ff",
          500: "#3b5bdb",
          600: "#2f4ac7",
          700: "#2540b0",
          900: "#1a2d7a",
        },
        surface: "#0f1117",
        card:    "#1a1d27",
        border:  "#2a2d3d",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
