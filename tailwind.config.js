/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F8FBF1",
        "canvas-alt": "#F4F7ED",
        surface: "#FFFFFF",
        "surface-card": "#FFFFFF",
        "card-border": "#E2E8D5",
        "recessed": "#F2F5EB",
        "recessed-dark": "#EAEEDC",
        obsidian: "#191D17",
        "obsidian-deep": "#111827",
        "olive-slate": "#434935",
        "cool-gray": "#6B7280",
        chartreuse: "#B8EE30",
        "chartreuse-dim": "#A3D70F",
        coral: "#F43F5E",
        spruce: "#4C6700",
        'brand-lime': "#b8ee30"
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans Variable", "Plus Jakarta Sans", "system-ui", "-apple-system", "sans-serif"],
        headline: ["Plus Jakarta Sans Variable", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        editorial: ["Playfair Display", "Georgia", "serif"]
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '1.75rem',
        'full': '9999px'
      },
      boxShadow: {
        'subtle': '0 4px 16px -2px rgba(25, 29, 23, 0.05)',
        'float': '0 12px 32px -4px rgba(25, 29, 23, 0.08), 0 4px 12px -2px rgba(25, 29, 23, 0.03)',
        'dock': '0 16px 40px -8px rgba(20, 20, 20, 0.12), 0 2px 6px 0 rgba(20, 20, 20, 0.03)',
        'glass-card': '0 8px 32px 0 rgba(25, 29, 23, 0.04), 0 1px 2px 0 rgba(25, 29, 23, 0.02)',
        'soft': '0 4px 20px rgba(0, 0, 0, 0.08)',
        'card': '0 12px 30px -4px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.05)',
        'glass-cta': '0 8px 24px -2px rgba(184, 238, 48, 0.38), 0 2px 6px -1px rgba(184, 238, 48, 0.2)'
      }
    }
  },
  plugins: []
}

