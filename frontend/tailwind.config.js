/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        primary: ["Rubik", "sans-serif"],
        secondary: ["Unbounded", "sans-serif"],
      },
      colors: {
        ex: {
          text: "#ffffff",
          "text-sec": "#709293",
          accent: "#ffcc9d",
          positive: "#3bb57a",
          error: "#b93131",
          divider: "rgba(255, 255, 255, 0.08)",
          block: "#256362",
          "block-sm": "#224748",
          widget: "#1b5554",
          form: "#256362",
          popup: "#4c7879",
          hover: "rgba(255, 255, 255, 0.1)",
          selected: "rgba(255, 255, 255, 0.2)",
        },
      },
    },
  },
  plugins: [],
};
