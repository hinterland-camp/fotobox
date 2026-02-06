import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{vue,ts,tsx}",
    "./components/**/*.{vue,ts,tsx}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.ts",
    "./nuxt.config.ts",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
