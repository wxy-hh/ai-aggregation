'use client';

import type { ReactNode } from 'react';

// 判断 react-markdown 解析出的元素是否为块级节点。
// 代码围栏紧跟段落（无空行）时会被解析为 <p> 内元素，需改渲染为 <div>，
// 避免 CodeBlock 的 <pre><div> 工具栏落入 <p> 触发水合错误。
export function isBlockishElement(child: unknown): boolean {
  const node = child as { props?: { node?: { tagName?: string } }; type?: unknown };
  return (
    node?.props?.node?.tagName === 'pre' ||
    typeof node?.type === 'function' ||
    node?.type === 'pre'
  );
}

// 段落渲染器：含块级子元素时退化为 <div>，否则渲染普通 <p>
// children 可选以兼容 react-markdown 渲染器契约（运行时始终有值）
export function SafeParagraph({ children }: { children?: ReactNode }) {
  const childList = Array.isArray(children) ? children : [children];
  if (childList.some((child) => isBlockishElement(child))) {
    return <div>{children}</div>;
  }
  return <p>{children}</p>;
}