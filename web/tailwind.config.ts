import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#264022",
        teal: { DEFAULT: "#264022", dark: "#1A2D17", soft: "#D6EADC" },
        paper: "#EAF5EF",
        line: "#DCE8DF",
        muted: "#5D797B",
        sand: "#FFE6CC",
        coral: { DEFAULT: "#FA7E00", soft: "#FFE9D2" },
        plum: "#55303C",
        edge: "#8FA894",
      },
      fontFamily: {
        display: ["'Hanken Grotesk Variable'", "system-ui", "sans-serif"],
        sans: ["'DM Sans Variable'", "system-ui", "sans-serif"],
        thaana: ["AKRasmee", "NotoThaana", "sans-serif"],
        noto: ["NotoThaana", "sans-serif"],
        sangu: ["SanguSuruhee", "sans-serif"],       // variable weight, used where the weight is being shown off
      },
    },
  },
  plugins: [],
};
export default config;
