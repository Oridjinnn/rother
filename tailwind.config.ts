import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Map a CSS custom property (which holds a full oklch() color) to a Tailwind
// color that supports opacity modifiers. Without an opacity we emit the raw
// var; with an opacity we use oklch() relative-color syntax to apply it, which
// keeps the Bali-inspired perceptual palette intact.
const oklchVar =
  (name: string) =>
  ({ opacityValue }: { opacityValue?: string }): string =>
    opacityValue === undefined
      ? `var(${name})`
      : `oklch(from var(${name}) l c h / ${opacityValue})`;

const colors = {
  background: oklchVar("--background"),
  foreground: oklchVar("--foreground"),
  border: oklchVar("--border"),
  input: oklchVar("--input"),
  ring: oklchVar("--ring"),
  card: oklchVar("--card"),
  "card-foreground": oklchVar("--card-foreground"),
  popover: oklchVar("--popover"),
  "popover-foreground": oklchVar("--popover-foreground"),
  primary: oklchVar("--primary"),
  "primary-foreground": oklchVar("--primary-foreground"),
  secondary: oklchVar("--secondary"),
  "secondary-foreground": oklchVar("--secondary-foreground"),
  muted: oklchVar("--muted"),
  "muted-foreground": oklchVar("--muted-foreground"),
  accent: oklchVar("--accent"),
  "accent-foreground": oklchVar("--accent-foreground"),
  destructive: oklchVar("--destructive"),
  success: oklchVar("--success"),
  "success-foreground": oklchVar("--success-foreground"),
  warning: oklchVar("--warning"),
  "warning-foreground": oklchVar("--warning-foreground"),
  sidebar: oklchVar("--sidebar"),
  "sidebar-foreground": oklchVar("--sidebar-foreground"),
  "sidebar-primary": oklchVar("--sidebar-primary"),
  "sidebar-primary-foreground": oklchVar("--sidebar-primary-foreground"),
  "sidebar-accent": oklchVar("--sidebar-accent"),
  "sidebar-accent-foreground": oklchVar("--sidebar-accent-foreground"),
  "sidebar-border": oklchVar("--sidebar-border"),
  "sidebar-ring": oklchVar("--sidebar-ring"),
  "chart-1": oklchVar("--chart-1"),
  "chart-2": oklchVar("--chart-2"),
  "chart-3": oklchVar("--chart-3"),
  "chart-4": oklchVar("--chart-4"),
  "chart-5": oklchVar("--chart-5"),
};

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: colors as any,
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
