/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        blueprint: {
          blue: "#003366",
          dark: "#001a33",
          line: "#ffffff",
          grid: "rgba(255, 255, 255, 0.15)",
        },
      },
      fontFamily: {
        mono: ["'Roboto Mono'", "monospace"],
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.2s ease-out forwards",
      },
    },
  },
  plugins: [],
}
