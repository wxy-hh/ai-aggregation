import { describe, it, expect } from 'vitest';
import { extractContentFromHtml } from './html-extractor';
import { DocumentParseError } from './parser';

describe('HTML 网页与微信文章提纯降噪器 (TC02 & TC03)', () => {
  describe('TC02: 微信公众号文章专用 DOM 提取与图片转换', () => {
    const sampleWechatHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>微信旧标头</title>
        </head>
        <body id="activity-detail">
          <div class="rich_media_header">
            <h1 class="rich_media_title" id="activity-name">深度解析：AI 聚合架构最佳实践</h1>
            <div id="meta_content" class="rich_media_meta_list">
              <span id="js_name" class="rich_media_meta rich_media_meta_text">技术架构团队</span>
            </div>
          </div>
          <div class="rich_media_content" id="js_content">
            <p>在本文中，我们将深入探讨现代企业 RAG 系统的构建与落地方案。</p>
            <p>
              <img data-src="https://mmbiz.qpic.cn/mmbiz_png/abc12345/0?wx_fmt=png" alt="架构流程图" />
            </p>
            <h2>一、核心设计原则</h2>
            <p>采用分层架构设计，确保核心链路高内聚低耦合。</p>
            <div id="js_profile_qrcode">请长按识别二维码关注公众号</div>
          </div>
          <div class="rich_media_area_extra">底部其他广告推荐与版权信息</div>
        </body>
      </html>
    `;

    it('断言 1: 正确提取微信文章标题并剥离二维码关注噪音', () => {
      const result = extractContentFromHtml(sampleWechatHtml, 'https://mp.weixin.qq.com/s/sample_article_123');
      expect(result.title).toBe('深度解析：AI 聚合架构最佳实践');
      expect(result.markdown).toContain('在本文中，我们将深入探讨现代企业 RAG 系统的构建与落地方案。');
      expect(result.markdown).toContain('一、核心设计原则');
      expect(result.markdown).not.toContain('请长按识别二维码关注公众号');
      expect(result.markdown).not.toContain('底部其他广告推荐与版权信息');
    });

    it('断言 2: 将微信 data-src 懒加载图片转换为标准 Markdown 图片', () => {
      const result = extractContentFromHtml(sampleWechatHtml, 'https://mp.weixin.qq.com/s/sample_article_123');
      expect(result.markdown).toMatch(/!\[(.*?)\]\(https:\/\/mmbiz\.qpic\.cn\/mmbiz_png\/abc12345\/0\?wx_fmt=png\)/);
    });
  });

  describe('TC03: 通用网页 Readability 降噪提纯与异常状态兜底', () => {
    const sampleBlogHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>技术周刊 - 云原生与分布式数据库设计精要</title>
        </head>
        <body>
          <header>
            <nav>
              <ul>
                <li><a href="/">首页</a></li>
                <li><a href="/login">登录注册</a></li>
              </ul>
            </nav>
          </header>
          <aside class="sidebar-ads">
            <div>最新特惠云服务器 99 元起！点击购买</div>
          </aside>
          <main>
            <article>
              <h1>云原生与分布式数据库设计精要</h1>
              <p>分布式数据库在海量数据分析场景下有着广泛的应用，其一致性协议与高可用方案至关重要。</p>
              <p>我们将重点分析 Raft 协议在分布式选主与日志同步过程中的网络边界处理。</p>
              <p>通过多副本地理分布容灾，可以确保金融级交易系统在单机房断电情况下平滑切换零丢数据。</p>
            </article>
          </main>
          <footer>
            <p>Copyright 2026 技术周刊团队保留所有权利。ICP备案号：京ICP备12345678号</p>
          </footer>
        </body>
      </html>
    `;

    it('断言 1: 通用技术博客剥离导航、页脚与广告，提纯主体 Markdown', () => {
      const result = extractContentFromHtml(sampleBlogHtml, 'https://example.com/blog/distributed-db');
      expect(result.title).toContain('云原生与分布式数据库');
      expect(result.markdown).toContain('分布式数据库在海量数据分析场景下有着广泛的应用');
      expect(result.markdown).toContain('Raft 协议');
      expect(result.markdown).not.toContain('首页');
      expect(result.markdown).not.toContain('登录注册');
      expect(result.markdown).not.toContain('最新特惠云服务器');
      expect(result.markdown).not.toContain('京ICP备12345678号');
    });

    it('断言 2: 提取文本过短或正文为空时，抛出 DocumentParseError 致命中文异常', () => {
      const emptyHtml = `<html><head><title>空白页</title></head><body><div>404 Not Found</div></body></html>`;
      expect(() => {
        extractContentFromHtml(emptyHtml, 'https://example.com/empty');
      }).toThrowError(DocumentParseError);

      try {
        extractContentFromHtml(emptyHtml, 'https://example.com/empty');
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentParseError);
        expect((err as DocumentParseError).isFatal).toBe(true);
        expect((err as Error).message).toContain('网页正文提取失败或内容过短');
      }
    });
  });
});
