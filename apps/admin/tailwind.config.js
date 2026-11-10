/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutrals remapped to the "Mercado fresco" surfaces (design/system.md).
        slate: {
          50: "#f4f7f4",
          100: "#eef1ec",
          200: "#e6ebe5",
          300: "#e2e8f0",
        },
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          900: "#064e3b",
        },
        accent: {
          50: "#fff7ed",
          100: "#ffedd5",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
        highlight: {
          100: "#fef9c3",
          400: "#facc15",
          500: "#eab308",
        },
      },
    },
  },
  plugins: [],
};
