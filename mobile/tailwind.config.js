/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tous les dossiers qui contiennent des classes Tailwind (src/ : ex. couleurs des packs).
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#0066cc",
        secondary: "#6c757d",
        accent: "#f0f9ff",
      },
    },
  },
  plugins: [],
};
