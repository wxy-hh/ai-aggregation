# AI Aggregation - Platform Mapping (平台代码落地)

本规范提供了在前端不同技术栈（原生 HTML/CSS、Tailwind CSS、SwiftUI）下的具体代码实现与落地模板。

---

## 1. 原生 Web / HTML / CSS

### 字体与图标库加载
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- 加载 Space Grotesk 标题字族与 Lucide 图标库 -->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/lucide-static/font/lucide.css">
```

### CSS 变量配置 (:root)
```css
:root {
  /* 基础颜色变量 (亮色模式) */
  --background: #F3F5FA;
  --bg: var(--background);
  --surface1: #FFFFFF;
  --surface2: #F8FAFC;
  --surface3: #F3F5FA;
  --border: #E2E8F0;
  --border-visible: #D5DAEB;
  --text1: #0F172A;
  --text2: #475569;
  --text3: #64748B;
  --text4: #94A3B8;
  --accent: #3B82F6; /* 科技蓝主色 */
  --accent-subtle: #F3F6FF;
  --success: #10B981;
  --success-bg: #F0FDF4;
  --warning: #F59E0B;
  --warning-bg: #FFFBEB;
  --error: #E54350;
  --error-bg: #FFF1F2;

  /* 字体栈变量 */
  --font-display: "Space Grotesk", system-ui, -apple-system, sans-serif;
  --font-body: system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* H1-H6 标题系统字号与行高 */
  --text-display: 60px;
  --text-h1: 60px;
  --text-h2: 30px;
  --text-h3: 24px;
  --text-h4: 18px;
  --text-body: 14px;
  --text-body-sm: 12px;
  --text-label: 10px;

  /* 间距变量 (8px 网格) */
  --space-2xs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* 圆角半径变量 */
  --radius-element: 8px;
  --radius-control: 12px;
  --radius-component: 24px;
  --radius-container: 32px;
  --radius-pill: 999px;

  /* Z-0 到 Z-5 复合三合一物理柔影系统 */
  --shadow-z0: none;
  --shadow-z1-glass: 0 1px 2px rgba(0, 0, 0, 0.03), 0 1px 1px rgba(0, 0, 0, 0.02);
  --shadow-z2-glass: 0 4px 12px -2px rgba(15, 23, 42, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  --shadow-z3-glass: 0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.04);
  --shadow-z4-glass: 0 20px 40px -15px rgba(59, 130, 246, 0.12), 0 8px 20px -10px rgba(0, 0, 0, 0.05);
  --shadow-z5-glass: 0 30px 60px -20px rgba(15, 23, 42, 0.25), 0 10px 30px -15px rgba(59, 130, 246, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);

  /* 缓动与动效时间 */
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --duration-fast: 200ms;
  --duration-normal: 300ms;
}

[data-theme="dark"] {
  /* 基础颜色变量 (深色模式) */
  --background: #020617;
  --bg: var(--background);
  --surface1: #0F172A;
  --surface2: #182230;
  --surface3: #334155;
  --border: #334155;
  --border-visible: #475569;
  --text1: #F8FAFC;
  --text2: #CBD5E1;
  --text3: #94A3B8;
  --text4: #64748B;
  --accent: #60A5FA;
  --accent-subtle: #1E2A55;
  --success-bg: rgba(16, 185, 129, 0.14);
  --warning-bg: rgba(245, 158, 11, 0.14);
  --error-bg: rgba(229, 67, 80, 0.14);

  /* 深色复合物理柔影 */
  --shadow-z1-glass: 0 2px 10px rgba(0, 0, 0, 0.18);
  --shadow-z2-glass: 0 14px 32px rgba(0, 0, 0, 0.28);
  --shadow-z3-glass: 0 20px 45px rgba(0, 0, 0, 0.35);
  --shadow-z4-glass: 0 24px 56px rgba(0, 0, 0, 0.40);
  --shadow-z5-glass: 0 30px 60px -20px rgba(0, 0, 0, 0.50), 0 10px 30px -15px rgba(59, 130, 246, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
}
```

---

## 2. Tailwind CSS

### 配置扩展 (tailwind.config.js)
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          blue: {
            500: '#3B82F6',
            600: '#2563EB',
          },
          violet: {
            500: '#8B5CF6',
            600: '#7C3AED',
          },
          rose: {
            500: '#EC4899',
          },
          indigo: {
            500: '#6366F1',
          }
        },
      },
      // 扩展符合 DESIGN.md 的三级模糊定义
      backdropBlur: {
        xs: '4px',
        md: '8px',     // 对应轻量级玻璃 G-1
        xl: '20px',    // 对应标准级玻璃 G-2
        '2xl': '40px',  // 对应深度级玻璃 G-3
      },
      // 扩展符合 DESIGN.md 的 Z-0 至 Z-5 复合阴影体系
      boxShadow: {
        'sm-glass': '0 1px 2px rgba(0, 0, 0, 0.03), 0 1px 1px rgba(0, 0, 0, 0.02)', // Z-1 微悬浮
        'md-glass': '0 4px 12px -2px rgba(15, 23, 42, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.03)', // Z-2 标准卡片
        'lg-glass': '0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.04)', // Z-3 中度浮空
        'xl-glass': '0 20px 40px -15px rgba(59, 130, 246, 0.12), 0 8px 20px -10px rgba(0, 0, 0, 0.05)', // Z-4 深度悬浮Hero
        '2xl-glass': '0 30px 60px -20px rgba(15, 23, 42, 0.25), 0 10px 30px -15px rgba(59, 130, 246, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)', // Z-5 顶级悬浮模态框
      },
      // 自定义物理阻尼过渡曲线
      transitionTimingFunction: {
        'smooth-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      }
    },
  },
  plugins: [],
}
```

---

## 3. React + Tailwind CSS 核心落地组件

### 按钮组件 (Button.tsx)
```tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  // 定义标准高度和尺寸 (8px 增量网格)
  const sizeClasses = {
    sm: 'h-8 px-4 text-xs rounded-lg gap-1.5',
    md: 'h-11 px-6 text-sm rounded-xl gap-2',
    lg: 'h-[52px] px-8 text-base rounded-2xl gap-2.5',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  // 对应 5 种材质体系及 Z-3/G-2 配置
  const variantClasses = {
    primary: 'text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 active:scale-98',
    secondary: 'text-slate-800 dark:text-slate-200 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 hover:bg-white/60 dark:hover:bg-slate-800/60 active:scale-98 shadow-sm-glass',
    ghost: 'text-slate-700 dark:text-slate-300 bg-transparent hover:bg-white/20 dark:hover:bg-slate-800/20 active:scale-98',
    icon: 'p-0 items-center justify-center text-slate-600 dark:text-slate-400 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 hover:bg-white/50 dark:hover:bg-slate-800/50 active:scale-95',
    danger: 'text-white bg-gradient-to-r from-red-500 to-rose-600 shadow-md shadow-red-500/10 hover:shadow-lg hover:shadow-red-500/20 active:scale-98',
  };

  const baseClasses = 'relative overflow-hidden inline-flex items-center justify-center font-semibold tracking-wide transition-all duration-200 ease-smooth-out select-none outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {/* 顶部 1px 发光切线 (主按钮/次按钮/危险按钮专属) */}
      {(variant === 'primary' || variant === 'secondary' || variant === 'danger') && (
        <span className="absolute inset-x-0 top-0 h-px bg-white/20 dark:bg-white/10 pointer-events-none"></span>
      )}
      
      {isLoading ? (
        <Loader2 className={`animate-spin ${iconSizes[size]}`} />
      ) : null}
      
      {children}
    </button>
  );
};
```

### 输入框组件 (Input.tsx)
```tsx
import React, { useState } from 'react';
import { Search, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: boolean;
  success?: boolean;
  iconType?: 'search' | 'password' | 'none';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error = false, success = false, iconType = 'none', className = '', type = 'text', disabled, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    // 根据校验状态配置描边与聚焦背光参数
    let borderClass = 'border-slate-200/50 dark:border-slate-800/50';
    let focusRingClass = 'focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/10';
    
    if (error) {
      borderClass = 'border-rose-500/60';
      focusRingClass = 'focus-within:border-rose-500/50 focus-within:ring-2 focus-within:ring-rose-500/10';
    } else if (success) {
      borderClass = 'border-emerald-500/60';
      focusRingClass = 'focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/10';
    }

    const inputType = iconType === 'password' && showPassword ? 'text' : type;

    return (
      <div className="w-full flex flex-col items-start select-none">
        {/* 输入框顶部标签 */}
        {label && (
          <label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
            {label}
          </label>
        )}

        <div className="relative w-full group">
          {/* 输入框主玻璃容器 (G-2 标准材质 + 内凹凹陷感 shadow-sm) */}
          <div className={`flex items-center w-full h-11 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border rounded-xl shadow-sm transition-all duration-200 ${borderClass} ${focusRingClass} ${disabled ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-950 backdrop-blur-none' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}>
            
            {/* 前置搜索图标 (Search Input 专属) */}
            {iconType === 'search' && (
              <Search className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
            )}

            <input
              type={inputType}
              disabled={disabled}
              className={`w-full h-full bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none pr-4 ${iconType === 'search' ? 'pl-11' : 'pl-4'} ${disabled ? 'cursor-not-allowed' : ''} ${className}`}
              ref={ref}
              {...props}
            />

            {/* 后置密码开关 (Password Input 专属) */}
            {iconType === 'password' && !disabled && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 mr-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}

            {/* 错误提示小图标 */}
            {error && iconType !== 'password' && (
              <AlertCircle className="w-4 h-4 text-rose-500 mr-4" />
            )}
          </div>
        </div>

        {/* 底部报错/辅助文字 */}
        {helperText && (
          <span className={`text-[11px] mt-1.5 ml-1 ${error ? 'text-rose-500 font-medium' : 'text-slate-400'}`}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
```

### 动态 Header 导航栏 (Header.tsx)
```tsx
import React, { useState, useEffect } from 'react';
import { Sparkles, Menu, X, ArrowRight } from 'lucide-react';

export const Header: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 监听滚动，动态控制透明度与毛玻璃融合 (滚动阀值 10px)
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 h-[72px] flex items-center justify-between px-6 sm:px-8 border-b transition-all duration-300 ease-smooth-out select-none ${
        isScrolled
          ? 'bg-white/70 dark:bg-slate-950/75 backdrop-blur-2xl border-white/40 dark:border-white/5 shadow-md-glass'
          : 'bg-transparent border-transparent'
      }`}
    >
      {/* 顶部微弱的 1px 上高光切线 */}
      {isScrolled && (
        <span className="absolute inset-x-0 top-0 h-px bg-white/20 dark:bg-white/5"></span>
      )}

      {/* Logo 区域 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
          AI<span className="text-blue-500">.Suite</span>
        </span>
      </div>

      {/* 桌面端导航链接 */}
      <nav className="hidden lg:flex items-center gap-1">
        <a href="#" className="relative px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">
          发现
          {/* 激活指示器：下划线发光横杠 */}
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
        </a>
        <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded-lg transition-all">
          对话
        </a>
        <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded-lg transition-all">
          绘图
        </a>
      </nav>

      {/* 右侧控制动作 */}
      <div className="hidden lg:flex items-center gap-4">
        <button className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
          登录
        </button>
        <button className="relative overflow-hidden inline-flex items-center gap-1.5 h-10 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-sm shadow-blue-500/10 transition-all duration-200">
          <span>开始创作</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 移动端汉堡键 */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden p-2 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all"
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 移动端展开侧拉抽屉 (G-3级玻璃抽屉) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-[72px] z-30 lg:hidden w-full h-[calc(100vh-72px)] bg-slate-950/40 backdrop-blur-md transition-all duration-300">
          <div className="absolute right-0 w-[280px] h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border-l border-slate-200/50 dark:border-slate-800/50 p-6 flex flex-col justify-between shadow-2xl-glass">
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">主菜单</span>
              <a href="#" className="block py-2.5 px-4 text-sm font-semibold text-blue-600 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl">发现</a>
              <a href="#" className="block py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl">对话</a>
              <a href="#" className="block py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl">绘图</a>
            </div>
            <div className="flex flex-col gap-3">
              <button className="w-full py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                登录
              </button>
              <button className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl shadow-md">
                开始创作
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
```

### 模态框组件 (Modal.tsx)
```tsx
import React, { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
}) => {
  // 监听 ESC 键以支持键盘焦点可访问性
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // 锁定底部滚动
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-[400px]',
    md: 'max-w-[600px]',
    lg: 'max-w-[800px]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 1. Backdrop 黑色柔和遮罩 (毛玻璃虚化) */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 2. Modal 玻璃材质主体 (G-3 级玻璃 + Z-5 级柔光阴影 + 内发光) */}
      <div
        className={`relative w-full overflow-hidden bg-white/80 dark:bg-slate-900/85 backdrop-blur-2xl rounded-[24px] shadow-2xl-glass border border-white/60 dark:border-white/10 flex flex-col ${sizeClasses[size]} animate-in zoom-in-95 duration-200 ease-smooth-out`}
      >
        {/* 顶部微弱的 1px 高光切线 */}
        <span className="absolute inset-x-0 top-0 h-px bg-white/30 dark:bg-white/10"></span>

        {/* 3. 头部 */}
        <div className="flex items-center justify-between p-6 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4. 内容主体区域 */}
        <div className="px-6 py-4 overflow-y-auto max-h-[70vh] text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {children}
        </div>

        {/* 5. 底部动作栏 (浅色模式下内凹微暗色) */}
        <div className="p-6 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-800/40 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="h-10 px-5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl transition-all"
          >
            取消
          </button>
          <button
            onClick={onClose}
            className="h-10 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-sm transition-all"
          >
            确认提交
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## 4. SwiftUI 支持

```swift
import SwiftUI

// 颜色映射扩展
extension Color {
    static let aiAggregationBg = Color(red: 243/255, green: 245/255, blue: 250/255)
    static let aiAggregationSurface = Color.white
    static let aiAggregationBorder = Color(red: 226/255, green: 232/255, blue: 240/255)
    static let aiAggregationAccent = Color(red: 59/255, green: 130/255, blue: 246/255) // 科技蓝
    static let aiAggregationTextPrimary = Color(red: 15/255, green: 23/255, blue: 42/255)
}

// 字体映射扩展
extension Font {
    static func aiAggregationDisplay(_ size: CGFloat) -> Font {
        .custom("Space Grotesk", size: size).weight(.bold)
    }

    static func aiAggregationBody(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .default)
    }
}
```
