import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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
        magic: {
          purple: '#7C3AED',
          pink: '#FB7185',
          gold: '#F59E0B',
          ink: '#1E1B2E',
          cream: '#FFFBF5',
          sand: '#FFF7ED',
          mint: '#D1FAE5',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
      borderColor: {
        DEFAULT: 'hsl(var(--border))',
      },
      boxShadow: {
        magic: '0 20px 45px -20px rgba(124, 58, 237, 0.45)',
        paper: '0 20px 60px -24px rgba(76, 29, 149, 0.35)',
      },
      backgroundImage: {
        'magic-sky': 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(251,113,133,0.14) 45%, rgba(245,158,11,0.14))',
        'paper-glow': 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,247,237,0.92))',
      },
      animation: {
        'float-soft': 'float-soft 4s ease-in-out infinite',
        'pulse-glow': 'pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
