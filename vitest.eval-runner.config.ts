// 评测运行器测试门禁配置：仅收集 tooling/eval/__tests__/ 下的评测运行器测试。
// 该目录不是 pnpm workspace package，turbo test 不会覆盖；此配置复用 workspace 内既有的 vitest 依赖，
// 不新增任何包。用纯对象导出（不 import vitest/config），避免根目录无 vitest 符号链接时配置加载失败。
// 显式 include 是为了不误收 .scratch/<feature>/_qa/prechange/ 下的冻结基线副本。
export default {
  test: {
    include: ['tooling/eval/__tests__/**/*.{test,spec}.ts'],
    environment: 'node',
  },
};
