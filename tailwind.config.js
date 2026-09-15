/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F0A1C",      // page background
        panel: "#181128",    // raised surfaces
        raised: "#221839",   // hover / second level
        line: "#33284D",     // borders
        cream: "#F4EFE4",    // main text
        mute: "#B3A8C8",     // secondary text
        violet: { DEFAULT: "#8B5CF6", soft: "#C4B5FD", deep: "#5B3BA8" },
        gold: { DEFAULT: "#F2B544", deep: "#E0A12A" }, // REC gold: primary action and "the goal"
      },
      fontFamily: {
        display: ["Unbounded", "system-ui", "sans-serif"],
        sans: ["Geist Variable", "Geist", "system-ui", "sans-serif"],
      },
      maxWidth: { page: "1200px" },
    },
  },
  plugins: [],
};
