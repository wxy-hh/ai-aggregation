# 核心组件玻璃拟态重构代码模板 (components.md)

本参考提供 5 大常用组件在重构为磨砂玻璃拟态与柔光发光质感时的 Before / After 代码对比，以及完整的 React & TailwindCSS 代码实现方案。AI 运行时可直接套用以下样式模板对已有组件进行重构。

---

## 1. Header 导航栏

### 重构前后参数对比

*   **Before**：
    *   背景：`bg-slate-900`（死板的不透明纯色）
    *   边框：`border-b border-slate-800`（生硬的分界线）
    *   动效：无
*   **After (极致科技融合感)**：
    *   物理层级：Z-3 层级。
    *   静态背景（距顶 0）：`bg-transparent`（完全透明，与壁纸和流动背光融为一体）。
    *   滚动激活（Y > 10px）：激活 G-3 级深度模糊 `backdrop-blur-2xl`，背景使用半透明浅色 `bg-white/70` 或深色 `bg-slate-950/75`；叠加 Z-3 级阴影 `shadow-md-glass`；底部边框半透明贴合 `border-white/40` 或 `border-white/5`。
    *   边缘微高光：在最顶部叠加 1px 细微发光线。
    *   导航项状态：Hover 时背景呈 G-1 级轻微磨砂 (`bg-slate-100/50` / `bg-slate-800/30`)；Active 状态时在正下方渲染一条精致的蓝色发光指示条 (`shadow-[0_0_8px_rgba(59,130,246,0.5)]`)。

### React + Tailwind 实现方案

```tsx
import React, { useState, useEffect } from 'react';
import { Sparkles, Menu, X, ArrowRight } from 'lucide-react';

export const Header: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 监听页面滚动，当 Y 轴偏移大于 10px 时激活玻璃材质与模糊滤镜
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 h-[72px] flex items-center justify-between px-6 sm:px-8 border-b transition-all duration-300 ease-smooth-out select-none ${
        isScrolled
          ? 'bg-white/70 dark:bg-slate-955/75 backdrop-blur-2xl border-white/40 dark:border-white/5 shadow-md-glass'
          : 'bg-transparent border-transparent'
      }`}
    >
      {/* 顶部微弱的 1px 细微高光切线 */}
      {isScrolled && (
        <span className="absolute inset-x-0 top-0 h-px bg-white/20 dark:bg-white/5 pointer-events-none"></span>
      )}

      {/* 品牌 Logo 区域 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
          AI<span className="text-blue-500">.Suite</span>
        </span>
      </div>

      {/* 桌面端导航链接与微状态 */}
      <nav className="hidden lg:flex items-center gap-1">
        <a href="#" className="relative px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">
          发现
          {/* 激活指示器：下划线发光横线 */}
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
        </a>
        <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded-lg transition-all duration-200">
          对话
        </a>
        <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded-lg transition-all duration-200">
          语音
        </a>
        <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded-lg transition-all duration-200">
          绘图
        </a>
      </nav>

      {/* 控制操作按钮区 */}
      <div className="hidden lg:flex items-center gap-4">
        <button className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
          登录
        </button>
        <button className="relative overflow-hidden inline-flex items-center gap-1.5 h-10 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-sm shadow-blue-500/10 transition-all duration-200">
          <span>开始创作</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 移动端汉堡折叠按钮 */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden p-2 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all"
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 移动端侧拉玻璃抽屉 (G-3级重度模糊) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-[72px] z-30 lg:hidden w-full h-[calc(100vh-72px)] bg-slate-950/40 backdrop-blur-md transition-all duration-300">
          <div className="absolute right-0 w-[280px] h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border-l border-slate-200/50 dark:border-slate-800/50 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">主菜单</span>
              <a href="#" className="block py-2.5 px-4 text-sm font-semibold text-blue-600 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl">发现</a>
              <a href="#" className="block py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl">对话</a>
              <a href="#" className="block py-2.5 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl">语音</a>
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

---

## 2. Button 按钮

### 重构前后参数对比

*   **Before**：
    *   背景：`bg-blue-600`（死板纯色填充）
    *   阴影：无
    *   动效：无
*   **After (微凸起物理触感按钮)**：
    *   顶部高光：绝对定位 1px 半透明白色发光线。
    *   交互动效：悬停时向上微升、尺寸微升 `scale-105`、外发光增强。点击瞬间 `active:scale-98`、外发光收缩，产生真实按键的下压手感。
    *   键盘聚焦：必须配有 `ring-2 ring-blue-500 ring-offset-2`，以防纯模糊滤镜遮盖光标。
    *   次级按钮（次按钮）：采用 G-2 级磨砂玻璃底色 `bg-white/40` 或 `bg-slate-900/40`，搭配 `backdrop-blur-xl`。

### React + Tailwind 实现方案

```tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
  // 定义标准尺寸与内边距
  const sizeClasses = {
    sm: 'h-8 px-4 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'h-11 px-6 py-3 text-sm rounded-xl gap-2',
    lg: 'h-[52px] px-8 py-4 text-base rounded-2xl gap-2.5',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  // 映射设计规范中定义的按钮类型样式与阴影层级
  const variantClasses = {
    primary: 'text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 active:scale-98',
    secondary: 'text-slate-800 dark:text-slate-200 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 hover:bg-white/60 dark:hover:bg-slate-800/60 active:scale-98 shadow-sm-glass',
    ghost: 'text-slate-700 dark:text-slate-300 bg-transparent hover:bg-white/20 dark:hover:bg-slate-800/20 active:scale-98',
    danger: 'text-white bg-gradient-to-r from-rose-500 to-red-600 shadow-md shadow-rose-500/10 hover:shadow-lg hover:shadow-rose-500/20 active:scale-98',
  };

  const baseClasses = 'relative overflow-hidden inline-flex items-center justify-center font-semibold tracking-wide transition-all duration-200 ease-smooth-out select-none outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {/* 在主按钮、次按钮和危险按钮顶部叠加 1px 细发光物理切线 */}
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

---

## 3. Input 输入框

### 重构前后参数对比

*   **Before**：
    *   背景：`bg-slate-800`（死板纯深色背景）
    *   聚焦：`focus:border-blue-500`（生硬改变描边颜色，无发光反馈）
*   **After (向内凹陷呼吸发光输入框)**：
    *   物理隐喻：向内微下凹。
    *   正常态：G-2 级磨砂玻璃 `bg-white/80` 或 `bg-slate-900/80`，辅以超薄透明描边 `border-slate-200/50` / `border-slate-800/50`。
    *   聚焦态：背景透明度下沉，浅色变为 `bg-white/95`，深色变为 `bg-slate-950/90`；四周亮起温和的呼吸背光圈（`bg-blue-500/10` 环绕模糊 6px 扩散圈）；描边平滑转变为 `border-blue-500/50`。

### React + Tailwind 实现方案

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

    // 状态样式管理，包括错误状态 (Error) 与成功状态 (Success) 时的背光参数
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
        {/* 输入框顶部标准标签 */}
        {label && (
          <label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
            {label}
          </label>
        )}

        <div className="relative w-full group">
          {/* 输入框 G-2 级磨砂玻璃容器，内置 transition 缓动 */}
          <div className={`flex items-center w-full h-11 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border rounded-xl shadow-sm transition-all duration-200 ${borderClass} ${focusRingClass} ${disabled ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-955 backdrop-blur-none' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}>
            
            {/* 搜索图标 */}
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

            {/* 密码显隐控制 */}
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

        {/* 底部辅助/错误提示信息 */}
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

---

## 4. FeatureCard 高级卡片

### 重构前后参数对比

*   **Before**：
    *   结构：`div`
    *   背景与阴影：`bg-slate-800 border border-slate-700 rounded-lg`，`shadow-md`（普通卡片）
*   **After (未来流光溢彩卡片)**：
    *   卡片底板：G-3 级大玻璃面板。
    *   流光发光核：卡片后方叠置一个 `blur-3xl` 的微弱紫色/蓝色发光球（`absolute top-0 right-0`），且 Hover 时跟随鼠标产生 Scale 放大。
    *   顶部高光：1px 细微高光分割线，从左至右以半透明白色渐变呈现。
    *   悬停手感：`hover:-translate-y-1 hover:shadow-2xl`，且右上角发光核的透明度和尺寸自动递增，产生卡片随光影跳动的视觉奇观。

### React + Tailwind 实现方案

```tsx
import React from 'react';
import { Sparkles } from 'lucide-react';

interface CardProps {
  title: string;
  description: string;
  onLinkClick?: () => void;
}

export const FeatureCard: React.FC<CardProps> = ({
  title,
  description,
  onLinkClick,
}) => {
  return (
    // 卡片外部大玻璃容器 (G-3级深度玻璃 + Z-4级悬浮漫反射阴影)
    <div className="relative overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-2xl rounded-[32px] p-8 shadow-xl border border-white/60 dark:border-white/10 group transition-all duration-300 hover:shadow-2xl hover:border-white/80 dark:hover:border-white/20 hover:-translate-y-1">
      
      {/* 鼠标悬浮时隐现的右上角背光漫反射发光圈 (Glow) */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-3xl rounded-full translate-x-12 -translate-y-12 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 pointer-events-none"></div>
      
      {/* 顶部精细的 1px 上发光高光切割线 */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50"></div>
      
      {/* 卡片内容区域 */}
      <div className="relative z-10">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300">
          <Sparkles className="w-6 h-6" />
        </div>
        
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
          {description}
        </p>
        
        <button
          onClick={onLinkClick}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 group/btn"
        >
          <span>立即体验</span>
          <svg className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
```

---

## 5. Modal 弹窗

### 重构前后参数对比

*   **Before**：
    *   背景遮罩：`bg-black/50`（平淡黑半透明遮罩）
    *   弹框主体：`bg-slate-900 rounded shadow-lg border border-slate-800`
*   **After (深邃漂浮舱弹窗)**：
    *   物理层级：Z-5 顶级覆盖高度。
    *   背景遮罩：`bg-slate-950/50` 搭配 `backdrop-blur-md`（50%暗度黑底结合 8px 毛玻璃深虚化底色），将用户的视线彻底从底层页面剥离。
    *   弹窗材质：G-3 级深度玻璃 `bg-white/80` 或 `bg-slate-900/85`，配以 `backdrop-blur-2xl` 与 `shadow-2xl-glass`（内含微发光阴影）。
    *   空间呼吸：弹窗底板带有微弱的紫色/蓝色内发光（`inset 0 0 40px rgba(59, 130, 246, 0.05)`），宛如飘浮在页面上空的舱室。

### React + Tailwind 实现方案

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
  // 监听键盘 ESC 按键以关闭弹窗，确保键盘聚焦可访问性
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // 锁定底层滚屏
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
      {/* 1. Backdrop 遮罩层 (暗黑半透明 + 8px 毛玻璃模糊) */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 2. Modal 主体 (G-3级玻璃 + Z-5级顶级柔光阴影与内发光) */}
      <div
        className={`relative w-full overflow-hidden bg-white/80 dark:bg-slate-900/85 backdrop-blur-2xl rounded-[24px] shadow-2xl-glass border border-white/60 dark:border-white/10 flex flex-col ${sizeClasses[size]} animate-in zoom-in-95 duration-200 ease-smooth-out`}
      >
        {/* 顶部微弱的上发光切线 */}
        <span className="absolute inset-x-0 top-0 h-px bg-white/30 dark:bg-white/10 pointer-events-none"></span>

        {/* 3. 头部 Header */}
        <div className="flex items-center justify-between p-6 pb-2 select-none">
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

        {/* 4. 内容主体区域，保证高文本对比度 */}
        <div className="px-6 py-4 overflow-y-auto max-h-[70vh] text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {children}
        </div>

        {/* 5. 底部按钮栏 (浅色模式下内凹微暗色) */}
        <div className="p-6 bg-slate-50/50 dark:bg-slate-955/20 border-t border-slate-100 dark:border-slate-800/40 flex items-center justify-end gap-3 select-none">
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
