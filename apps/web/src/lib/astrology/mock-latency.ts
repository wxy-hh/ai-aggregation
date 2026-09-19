/**
 * mock-latency.ts —— 星座寰宇 · mock 异步接缝的时序模拟（12 工单 · 异步接缝改造）
 *
 * 真值、解读、问答三处接缝已改为异步接口，数据仍由本地 mock 同步产出；
 * 本模块只负责在数据外裹一层随机延迟，让仪式等待室（真值与仪式窗双条件转场）、
 * 结果页分区加载（事实先到、解读后到）、问答等待气泡在假数据下跑通真实时序。
 * 真实星历 / AI 服务接入后，三处接缝实现改为真实请求，本文件随之删除，消费方不改。
 */

/** 随机网络延迟（毫秒）：在 [minMs, maxMs) 内均匀取值，模拟真实往返的不确定性 */
export function mockNetworkDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
