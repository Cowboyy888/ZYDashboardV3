import type { Config } from 'tailwindcss';

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
        // Slow ambient drift for the login screen's background glow — opacity +
        // transform only (GPU-composited), never layout-affecting properties.
        'zy-glow': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0.5' },
          '50%': { transform: 'translate3d(4%, -6%, 0) scale(1.15)', opacity: '0.85' },
        },
        // One-shot attention shake for a rejected sign-in.
        'zy-shake': {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        // Drifts the .zy-mesh background by exactly one 40px tile, so the
        // loop wraps seamlessly back to its starting position.
        'zy-mesh-drift': {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '100%': { transform: 'translate3d(-40px, -40px, 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'zy-glow': 'zy-glow 12s ease-in-out infinite',
        'zy-shake': 'zy-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'zy-mesh-drift': 'zy-mesh-drift 25s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
