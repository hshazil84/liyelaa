import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10211F",
        teal: { DEFAULT: "#0B6B63", dark: "#095952", soft: "#D7EBE8" },
        paper: "#EEF2F1",
        line: "#D5DDDB",
        muted: "#5A6B68",
        sand: "#FFF1C2",
        coral: { DEFAULT: "#D9482B", soft: "#FBDDD4" },
      },
      fontFamily: {
        display: ["'Bricolage Grotesque Variable'", "system-ui", "sans-serif"],
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
