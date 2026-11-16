import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#050b16", 900: "#0a1424", 800: "#101d33", 700: "#1a2a45", 600: "#2a3d5e" },
        accent: { DEFAULT: "#38bdf8", soft: "#0ea5e9" },
        gold: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["'Space Grotesk'", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: { panel: "0 10px 40px -10px rgba(0,0,0,.6)" },
    },
  },
  plugins: [],
};
export default config;
