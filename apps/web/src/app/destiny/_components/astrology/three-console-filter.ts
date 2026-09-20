'use client';

/**
 * three-console-filter.ts —— three.js 控制台过滤（临时补丁，等上游修好即可删）
 *
 * 背景：three@0.185 把 `THREE.Clock` 标记为废弃（r183 起），而 @react-three/fiber@9.7
 * （当前最新版）仍在创建 Canvas 时内部 `new THREE.Clock()`，于是每次挂载「星渊」场景都会
 * 打出一条 `THREE.Clock: This module has been deprecated…` 警告——生产构建同样会打印
 * （three 的 warning 不经 NODE_ENV 判断）。
 *
 * 做法：用 three 官方提供的 setConsoleFunction 接管它自己的控制台输出，
 * **只静默这一条来自依赖的已知弃用提示**，其余 log / warn / error 原样转发（含参数）。
 * r3f 迁移到 `THREE.Timer` 之后，删除本模块与调用点即可。
 */

import { getConsoleFunction, setConsoleFunction } from 'three';

/** 已知需要静默的消息片段（three 的 message 形如「THREE.Clock: This module has been deprecated…」） */
const KNOWN_DEPRECATION = 'Clock: This module has been deprecated';

/** 是否已安装（模块级幂等：多场景共用一份过滤，不叠加包装） */
let installed = false;

/** 安装 three 控制台过滤（幂等；内置日志转发，等价于 three 的默认行为） */
export function installThreeConsoleFilter(): void {
  if (installed) return;
  installed = true;

  const previous = getConsoleFunction();
  setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
    if (type === 'warn' && message.includes(KNOWN_DEPRECATION)) return;
    if (previous) {
      (previous as (t: string, m: string, ...p: unknown[]) => void)(type, message, ...params);
      return;
    }
    if (type === 'error') console.error(message, ...params);
    else if (type === 'warn') console.warn(message, ...params);
    else console.log(message, ...params);
  });
}
