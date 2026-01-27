import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'sans-serif'],
        heading: ['var(--font-space-grotesk)', 'sans-serif'],
      },
      colors: {
        'dark-bg': '#0A0E27',
        'dark-surface': '#1a1f3a',
        'dark-card': '#252b4a',
        'dark-border': '#2d3454',
      },
    },
  },
  plugins: [],
};

export default config;
