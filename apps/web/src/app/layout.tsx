import type { Metadata } from 'next';
import { DM_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';
import '@/styles/scrollbar.css';
import 'highlight.js/styles/github-dark.css';
import { ThemeInitializer } from '@/components/theme/theme-initializer';
import { QueryProvider } from '@/components/providers/query-provider';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI 聚合平台',
  description: '多模型 AI 聚合服务平台',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${dmSans.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // 读取 Zustand 存储的设置
                const storedSettings = localStorage.getItem('ai-app-settings');
                let theme = 'light';
                
                if (storedSettings) {
                  const parsed = JSON.parse(storedSettings);
                  // 优先使用 resolvedTheme，如果是 system 则回退到系统偏好
                  theme = parsed.state?.resolvedTheme || 'light';
                  if (parsed.state?.theme === 'system') {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                } else {
                  // 回退到旧的 key 或系统偏好
                  theme = localStorage.getItem('theme') || 
                    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                }
                
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={dmSans.className}>
        <ThemeInitializer />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
