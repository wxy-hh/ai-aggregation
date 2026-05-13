# AI Aggregation - Platform Mapping

## 1. Web / HTML / CSS

### 字体加载

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/lucide-static/font/lucide.css">
```

### CSS 变量

```css
:root {
  --background: #F1F5F9;
  --bg: var(--background);
  --surface1: #FFFFFF;
  --surface2: #F8FAFC;
  --surface3: #F1F5F9;
  --border: #E2E8F0;
  --border-visible: #D5DAEB;
  --text1: #0F172A;
  --text2: #475569;
  --text3: #64748B;
  --text4: #94A3B8;
  --accent: #5D7CFA;
  --accent-subtle: #F3F6FF;
  --success: #22C55E;
  --success-bg: #F0FDF4;
  --warning: #F59E0B;
  --warning-bg: #FFFBEB;
  --error: #E54350;
  --error-bg: #FFF1F2;

  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "DM Sans", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --text-display: 60px;
  --text-h1: 42px;
  --text-h2: 28px;
  --text-h3: 20px;
  --text-body: 16px;
  --text-body-sm: 14px;
  --text-caption: 12px;
  --text-label: 11px;

  --space-2xs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
  --space-4xl: 96px;

  --radius-element: 8px;
  --radius-control: 12px;
  --radius-component: 24px;
  --radius-container: 32px;
  --radius-pill: 999px;

  --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-2: 0 8px 20px rgba(76, 95, 154, 0.10);
  --shadow-3: 0 20px 60px -10px rgba(59, 130, 246, 0.10);

  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --duration-fast: 180ms;
  --duration-normal: 240ms;
  --duration-slow: 480ms;
}

[data-theme="dark"] {
  --background: #111218;
  --bg: var(--background);
  --surface1: #1E293B;
  --surface2: #182230;
  --surface3: #334155;
  --border: #334155;
  --border-visible: #475569;
  --text1: #F8FAFC;
  --text2: #CBD5E1;
  --text3: #94A3B8;
  --text4: #64748B;
  --accent: #9BADFF;
  --accent-subtle: #1E2A55;
  --success: #22C55E;
  --success-bg: rgba(34, 197, 94, 0.14);
  --warning: #F59E0B;
  --warning-bg: rgba(245, 158, 11, 0.14);
  --error: #E54350;
  --error-bg: rgba(229, 67, 80, 0.14);
  --shadow-1: 0 2px 10px rgba(0, 0, 0, 0.18);
  --shadow-2: 0 14px 32px rgba(0, 0, 0, 0.28);
  --shadow-3: 0 24px 56px rgba(0, 0, 0, 0.40);
}
```

## 2. Tailwind

```ts
import type { Config } from 'tailwindcss';

export default {
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50: '#F3F6FF',
          100: '#E7EDFF',
          200: '#C9D4FF',
          300: '#A8B8FF',
          400: '#7D91FF',
          500: '#5D7CFA',
          600: '#4969E9',
          700: '#3C58D8',
          800: '#3144B7',
          900: '#23318C',
        },
      },
      borderRadius: {
        element: '8px',
        control: '12px',
        card: '24px',
        shell: '32px',
        hero: '48px',
      },
      boxShadow: {
        glass: '0 8px 20px rgba(76, 95, 154, 0.10)',
        hero: '0 20px 60px -10px rgba(59, 130, 246, 0.10)',
      },
      backdropBlur: {
        glass: '24px',
        hero: '40px',
      },
    },
  },
} satisfies Config;
```

## 3. SwiftUI

```swift
import SwiftUI

extension Color {
    static let aiAggregationBackground = Color(red: 241/255, green: 245/255, blue: 249/255)
    static let aiAggregationSurface = Color.white
    static let aiAggregationBorder = Color(red: 226/255, green: 232/255, blue: 240/255)
    static let aiAggregationAccent = Color(red: 93/255, green: 124/255, blue: 250/255)
    static let aiAggregationTextPrimary = Color(red: 15/255, green: 23/255, blue: 42/255)
}

extension Font {
    static func aiAggregationDisplay(_ size: CGFloat) -> Font {
        .custom("Space Grotesk", size: size).weight(.bold)
    }

    static func aiAggregationBody(_ size: CGFloat) -> Font {
        .custom("DM Sans", size: size)
    }
}
```

SwiftUI 侧同样遵循“先结构，后玻璃”原则。模糊和材质只能做增强层，不能代替边框和分区。

