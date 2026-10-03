import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindcssTypography from '@tailwindcss/typography';

const config: Config = {
  darkMode: 'class',
  future: {
    // 启用仅在支持悬停的精细指针设备上生效 hover 样式，消除触控设备上的粘滞残留
    hoverOnlyWhenSupported: true,
  },
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
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
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ds: {
          'bg-black': 'var(--ds-bg-black)',
          'bg-soft': 'var(--ds-bg-soft)',
          'text-primary': 'var(--ds-text-primary)',
          'text-inverse': 'var(--ds-text-inverse)',
          'accent-blue': 'var(--ds-accent-blue)',
          'link-blue': 'var(--ds-link-blue)',
          'link-blue-dark': 'var(--ds-link-blue-dark)',
          'glass-white-strong': 'var(--ds-glass-white-strong)',
          'glass-white': 'var(--ds-glass-white)',
          'glass-dark': 'var(--ds-glass-dark)',
        },
        // 夜幕文字色（DESIGN.md 2.6：深空蓝紫表面上的次要文字从表面色相调色，不落中性灰）
        night: {
          muted: '#A6AED2', // 次要文字（深空表面替代 dark:text-slate-400）
          faint: '#828BB0', // 微弱文字/占位符（替代 dark:text-slate-500，深底对比度更高）
        },
        // 白昼文字色（与 night 配对：浅色模式次要文字统一 slate-500 档，白底对比度 ≈4.7:1，过 WCAG AA）
        day: {
          muted: '#64748B', // 浅色模式次要文字/功能图标（替代 text-slate-400）
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        /** AI 头像外层光晕：柔和呼吸 */
        "avatar-glow-breathe": {
          "0%, 100%": { opacity: "0.32", transform: "scale(0.94)" },
          "50%": { opacity: "0.62", transform: "scale(1.06)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "avatar-glow-breathe": "avatar-glow-breathe 3.4s ease-in-out infinite",
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-expo': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.1)',
      },
      transitionDuration: {
        instant: '100ms',
        fast: '160ms',
        normal: '220ms',
        slow: '300ms',
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
};

export default config;
