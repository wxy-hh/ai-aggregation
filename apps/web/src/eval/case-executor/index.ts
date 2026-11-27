/**
 * Case Executor 组合入口：web 评测侧唯一对外暴露的工厂。
 * CLI / ablation 只经此入口创建真实执行适配器，不深入导入生产 Agent 内部模块。
 */
export { createRealAgentAdapter } from './real-adapter';
