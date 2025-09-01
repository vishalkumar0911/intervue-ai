import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],

  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          400: "#22d3ee",
          500: "#06b6d4",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        cyan: { 400: "#22d3ee", 500: "#06b6d4" },
      },

      borderRadius: {
        lg: "calc(var(--radius) - 2px)",
        xl: "var(--radius)",
        "2xl": "calc(var(--radius) + 6px)",
        "xl-fixed": "1rem",
        "2xl-fixed": "1.25rem",
      },

      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.25)",
        elevated: "0 12px 40px rgba(0,0,0,0.18)",
        glow: "0 0 0 3px hsl(var(--ring)/0.25)",
      },

      backgroundImage: {
        grid:
          "linear-gradient(to right, hsl(var(--grid-color)/0.08) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--grid-color)/0.08) 1px, transparent 1px)",
        spotlight:
          "radial-gradient(600px 300px at var(--spot-x,50%) var(--spot-y,15%), hsl(var(--spot-color)/0.20), transparent 60%)",
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(var(--tw-gradient-stops))",
      },

      keyframes: {
        in: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        out: { from: { opacity: "1", transform: "none" }, to: { opacity: "0", transform: "translateY(4px)" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        in: "in .15s ease-out both",
        out: "out .12s ease-in both",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },

  plugins: [animate, forms, typography],
};

export default config;
