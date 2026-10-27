/**
 * 网页与微信文章正文提纯与结构化 Markdown 转换器 (ADR-0028)
 *
 * 核心设计契约：
 * 1. 微信文章适配：优先基于 #activity-name 提取真实标题，提纯 #js_content 并归一化 data-src 图片，剔除二维码引导块
 * 2. 通用网页适配：基于 Mozilla Readability 与 jsdom 提取主干，自动剥离侧栏、导航与广告
 * 3. 结构化 Markdown：基于 Turndown 与 GFM 插件输出规范 Markdown
 * 4. 致命错误兜底：若正文过短（< 50 字符）或为空，抛出 DocumentParseError 致命异常避免死循环重试
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
// @ts-expect-error turndown-plugin-gfm 缺少显式声明文件
import { gfm } from 'turndown-plugin-gfm';
import { DocumentParseError } from './parser';

export interface ExtractedHtmlResult {
  title: string;
  markdown: string;
  contentLength: number;
}

/** 最小有效正文字符数 */
const MIN_CONTENT_CHAR_COUNT = 50;

/** 初始化 Turndown 转换器单例 */
function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  service.use(gfm);

  // 忽略无意义与危险标签
  service.remove(['script', 'style', 'noscript', 'iframe', 'canvas']);

  return service;
}

/** 判断是否为微信公众号文章链接 */
export function isWechatArticle(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === 'mp.weixin.qq.com';
  } catch {
    return false;
  }
}

/** 从 HTML 中提取清洗正文并转换为 Markdown */
export function extractContentFromHtml(
  rawHtml: string,
  url: string
): ExtractedHtmlResult {
  if (!rawHtml || !rawHtml.trim()) {
    throw new DocumentParseError('目标网页返回内容为空', true);
  }

  const isWechat = isWechatArticle(url);
  const dom = new JSDOM(rawHtml, { url });
  const document = dom.window.document;

  let title = '';
  let contentHtml = '';

  if (isWechat) {
    // 微信公众号专属提取逻辑
    const titleEl = document.querySelector('#activity-name');
    title = titleEl?.textContent?.trim() || document.title?.trim() || '微信公众号文章';

    const contentEl = document.querySelector('#js_content');
    if (contentEl) {
      // 移除公众号二维码引导块与冗余脚本
      contentEl.querySelectorAll('#js_profile_qrcode, script, style').forEach((el) => el.remove());

      // 归一化微信 data-src 懒加载图片
      contentEl.querySelectorAll('img').forEach((img) => {
        const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original');
        if (dataSrc && !img.getAttribute('src')) {
          img.setAttribute('src', dataSrc);
        }
      });

      contentHtml = contentEl.innerHTML;
    }
  }

  // 若非微信或微信提取失败，走通用 Readability
  if (!contentHtml) {
    // 预清理常见无用元素
    document.querySelectorAll('script, style, noscript').forEach((el) => el.remove());

    const reader = new Readability(document);
    const article = reader.parse();

    if (article) {
      title = title || article.title?.trim() || document.title?.trim() || '未命名网页';
      contentHtml = article.content || '';
    } else {
      // Readability 无法提取时的降级处理
      title = title || document.title?.trim() || '未命名网页';
      const body = document.querySelector('body');
      contentHtml = body?.innerHTML || '';
    }
  }

  title = title.replace(/[\r\n\t]+/g, ' ').trim() || '未命名网页';

  // 转换为结构化 Markdown
  const turndown = createTurndown();
  const markdown = turndown.turndown(contentHtml).trim();

  // 纯文本长度检查（去除空白后统计）
  const cleanTextLength = markdown.replace(/\s+/g, '').length;
  if (cleanTextLength < MIN_CONTENT_CHAR_COUNT) {
    throw new DocumentParseError(
      `网页正文提取失败或内容过短（有效字数：${cleanTextLength}，需 >= ${MIN_CONTENT_CHAR_COUNT} 字），请检查目标页面是否需要登录或受到防爬拦截`,
      true
    );
  }

  return {
    title,
    markdown,
    contentLength: cleanTextLength,
  };
}
