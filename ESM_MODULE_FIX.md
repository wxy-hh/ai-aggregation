# ESM 模块导入问题修复总结

## 🐛 问题描述

项目启动时频繁报错：

```
SyntaxError: The requested module '@repo/logger' does not provide an export named 'logger'
```

## 🔍 根本原因

1. **Node 版本不匹配**: 使用 Node v24.12.0，但项目要求 Node 22
2. **ESM 配置不完整**: workspace 包缺少 `"type": "module"` 和 `exports` 字段
3. **模块解析策略问题**: worker 的 tsconfig 使用了 `moduleResolution: "bundler"`，不适合 Node.js 运行时

## ✅ 修复内容

### 1. 更新所有 workspace 包的 package.json

为以下包添加了 ESM 配置：

- `@repo/logger`
- `@repo/storage`
- `@repo/providers`
- `@repo/shared`
- `@repo/queue`
- `@repo/db`

**修改内容**:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

### 2. 修复 worker 的 TypeScript 配置

**文件**: `apps/worker/tsconfig.json`

添加了正确的模块解析配置：

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### 3. 修复 Worker 重复启动问题

**文件**: `apps/worker/src/index.ts`

添加了运行状态检查，防止 `tsx watch` 热重载时重复启动 Worker。

## 📋 验证步骤

1. **切换到正确的 Node 版本**:

   ```bash
   nvm use 22
   ```

2. **重新安装依赖**:

   ```bash
   pnpm install
   ```

3. **启动项目**:

   ```bash
   # 启动 web
   pnpm --filter @repo/web dev

   # 启动 worker
   pnpm --filter @repo/worker dev
   ```

## 🎯 关键要点

1. **Node 版本很重要**: 项目在 `.node-version`、`.nvmrc` 和 `package.json` 中都明确要求 Node 22
2. **ESM 需要完整配置**: 在 monorepo 中，所有 workspace 包都需要正确的 ESM 配置
3. **模块解析策略**: `moduleResolution: "bundler"` 适合打包工具，`"node"` 适合 Node.js 运行时

## 📝 后续建议

1. 在项目 README 中添加 Node 版本要求说明
2. 考虑添加 `.nvmrc` 自动切换脚本到开发文档
3. 在 CI/CD 中强制检查 Node 版本

## ✨ 修复结果

- ✅ 模块导入错误已解决
- ✅ Worker 可以正常启动
- ✅ 所有 workspace 包配置统一
- ✅ 支持 ESM 热重载
