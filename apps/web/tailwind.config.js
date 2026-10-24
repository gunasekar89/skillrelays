/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#101B35", 800: "#16244A", 700: "#1E2F5C" },
        brand: { DEFAULT: "#2563EB", 600: "#2563EB", 700: "#1D4ED8", 50: "#EFF4FF" },
        teal: { DEFAULT: "#14B8A6", 600: "#0D9488", 50: "#ECFDF9" },
        canvas: "#F5F7FB",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,27,53,0.04), 0 8px 24px rgba(16,27,53,0.06)",
      },
    },
  },
  plugins: [],
};
