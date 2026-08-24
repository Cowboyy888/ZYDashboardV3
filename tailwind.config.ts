import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Zysteel (中粤铁网) industrial theme.
 * Brand: signal red + charcoal. All colors are exposed as CSS variables in
 * src/app/globals.css so shadcn/ui components pick them up via hsl(var(--token)).
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // Khmer names must render with a Khmer-capable fallback stack.
        khmer: ['var(--font-khmer)', 'Noto Sans Khmer', 'Khmer OS', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // One-shot attention shake for a rejected sign-in.
        'zy-shake': {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        // Steel-mill furnace for the login screen — a warm glow along the
        // bottom edge that breathes like an open furnace, with sparks
        // shooting up out of it. Both GPU-composited (opacity/transform only).
        'zy-furnace-glow': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.08)' },
        },
        // Per-particle duration/delay/drift/color come from CSS custom
        // properties set inline, so one keyframe drives many independently
        // timed sparks — shorter travel and faster duration than a rising
        // ember, closer to an actual shower of sparks off hot metal.
        'zy-spark-rise': {
          '0%': { transform: 'translate3d(0, 0, 0)', opacity: '0' },
          '10%': { opacity: 'var(--spark-opacity, 0.9)' },
          '70%': { opacity: 'var(--spark-opacity, 0.9)' },
          '100%': { transform: 'translate3d(var(--spark-drift, 0), -70vh, 0)', opacity: '0' },
        },
        // One-shot bounce-in for dashboard stat-card icons — pairs with the
        // card's own fade/slide entrance at the same stagger delay.
        'zy-pop-in': {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '70%': { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'zy-shake': 'zy-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'zy-furnace-glow': 'zy-furnace-glow 5s ease-in-out infinite',
        'zy-spark-rise': 'zy-spark-rise 5s linear infinite',
        'zy-pop-in': 'zy-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
