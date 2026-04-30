import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {
    colors: {
      verde: { 50:'#f0fdf4', 500:'#22c55e', 600:'#16a34a', 700:'#15803d', 900:'#14532d' },
      biwenger: '#1a472a',
    }
  }},
  plugins: [],
};
export default config;
