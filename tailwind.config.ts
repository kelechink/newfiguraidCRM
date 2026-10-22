import type { Config } from "tailwindcss";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["variant", ["@media (prefers-color-scheme: dark) { &:not(:where([data-theme=light], [data-theme=light] *)) }", "&:where([data-theme=dark], [data-theme=dark] *)"]],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        "surface-3": token("surface-3"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        accent: token("accent"),
        "accent-soft": token("accent-soft"),
        "accent-ink": token("accent-ink"),
        danger: token("danger"),
        warning: token("warning"),
        success: token("success"),
        unit: {
          academy: token("unit-academy"),
          figureweb: token("unit-figureweb"),
          telecom: token("unit-telecom"),
          hq: token("unit-hq"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      borderRadius: { DEFAULT: "8px", lg: "10px", xl: "14px" },
      boxShadow: {
        card: "0 1px 0 0 hsl(var(--shadow) / 0.04), 0 1px 3px 0 hsl(var(--shadow) / 0.06)",
        lift: "0 12px 32px -8px hsl(var(--shadow) / 0.22), 0 2px 6px hsl(var(--shadow) / 0.08)",
        pop: "0 24px 64px -12px hsl(var(--shadow) / 0.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(4px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "slide-in": { from: { transform: "translateX(16px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        "toast-in": { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "pop-in": "pop-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in": "slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "toast-in": "toast-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
