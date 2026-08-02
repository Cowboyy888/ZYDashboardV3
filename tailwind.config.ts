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
        // One-shot attention shake for a rejected sign-in.
        'zy-shake': {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        // Flowing gradient wave for the login screen — three large, heavily
        // blurred blobs drifting along slow, independent loops so their
        // overlap keeps shifting, reading as one ambient wave of color
        // rather than distinct shapes. Long durations (22-34s) and
        // ease-in-out keep it calm rather than busy. GPU-composited
        // (transform only — blur/opacity are static, not animated).
        'zy-wave-1': {
          '0%, 100%': { transform: 'translate3d(-8%, -6%, 0) scale(1)' },
          '50%': { transform: 'translate3d(12%, 8%, 0) scale(1.15)' },
        },
        'zy-wave-2': {
          '0%, 100%': { transform: 'translate3d(8%, 10%, 0) scale(1.1)' },
          '50%': { transform: 'translate3d(-12%, -6%, 0) scale(0.95)' },
        },
        'zy-wave-3': {
          '0%, 100%': { transform: 'translate3d(0%, 4%, 0) scale(1)' },
          '50%': { transform: 'translate3d(-10%, -10%, 0) scale(1.2)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'zy-shake': 'zy-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'zy-wave-1': 'zy-wave-1 22s ease-in-out infinite',
        'zy-wave-2': 'zy-wave-2 28s ease-in-out infinite',
        'zy-wave-3': 'zy-wave-3 34s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
