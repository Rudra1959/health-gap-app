import type { Config } from "tailwindcss";
const sharedConfig: Config = {
  content: [
    "./apps/web/src/**/*.{ts,tsx,js,jsx}",
    "./packages/**/src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Keep your custom name
        telegraf: ["PP Telegraf", "sans-serif"],
        // Set it as the default sans-serif font for the whole app
        sans: ["PP Telegraf", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default sharedConfig;
