# AI 聚合网站 Monorepo - 项目总览

## 🎯 项目简介

这是一个基于 Monorepo 架构的 AI 聚合平台，整合了多个国内 AI 服务提供商（通义千问、智谱 GLM、DeepSeek），提供对话、语音转写、PPT 生成、图像生成等功能。

## ✨ 核心特性

- 🤖 **多模型聚合**: 支持通义千问、智谱 GLM、DeepSeek
- 💬 **流式对话**: 基于 SSE 的实时对话体验
- 🎤 **语音转写**: 集成讯飞/阿里云语音服务
- 📊 **PPT 生成**: 基于 PptxGenJS 的 PPT 自动生成
- 🎨 **图像生成**: 集成通义万相等图像生成服务
- 📦 **任务队列**: 基于 BullMQ 的可靠异步任务处理
- 🔐 **用户系统**: 完整的鉴权、限流、配额管理
- 📈 **可观测性**: 结构化日志、错误追踪

## 🏗️ 技术架构

### Monorepo 结构

```
ai-aggregation-monorepo/
├── apps/                    # 应用层
│   ├── web/                # Next.js Web 应用
│   └── worker/             # BullMQ Worker 服务
├── packages/               # 共享包
│   ├── shared/            # 类型、常量、schemas
│   ├── providers/         # AI 提供方适配层
│   ├── db/                # Prisma 数据库
│   ├── queue/             # BullMQ 队列定义
│   ├── storage/           # 对象存储封装
│   ├── logger/            # 日志工具
│   └── config-*/          # 共享配置
├── infra/                  # 基础设施
│   └── docker/            # 本地开发环境
├── tooling/               # 工具脚本
│   └── scripts/           # 初始化、清理脚本
└── docs/                  # 文档
```

### 技术栈

**前端**
- Next.js 15 + React 19 + TypeScript 5.6+
- Tailwind CSS + shadcn/ui
- React Query (数据获取)
- React Hook Form + Zod (表单)

**后端**
- Next.js Route Handlers (BFF/API)
- BullMQ + Redis (任务队列)
- PostgreSQL 16 + Prisma 6 (数据库)
- 阿里云 OSS / MinIO (对象存储)

**AI 服务**
- 通义千问 (DashScope)
- 智谱 GLM
- DeepSeek
- 讯飞语音 / 阿里云 NLS
- 通义万相

**工程化**
- pnpm workspace (包管理)
- Turborepo (构建编排)
- ESLint + Prettier (代码规范)
- Playwright (E2E 测试)

## 📦 已创建的文件

### 根目录配置
- ✅ `package.json` - 根包配置
- ✅ `pnpm-workspace.yaml` - workspace 配置
- ✅ `turbo.json` - Turborepo 配置
- ✅ `.gitignore` - Git 忽略规则
- ✅ `.prettierrc` - 代码格式化配置
- ✅ `.node-version` / `.nvmrc` - Node 版本锁定

### 应用层 (apps/)
- ✅ `apps/web/` - Next.js Web 应用（完整骨架）
- ✅ `apps/worker/` - Worker 服务（STT/PPT/Image workers）

### 共享包 (packages/)
- ✅ `packages/shared/` - 类型定义、schemas、常量
- ✅ `packages/providers/` - AI 提供方适配（DashScope/Zhipu/DeepSeek）
- ✅ `packages/db/` - Prisma schema 和数据库客户端
- ✅ `packages/queue/` - BullMQ 队列定义
- ✅ `packages/storage/` - 对象存储抽象
- ✅ `packages/logger/` - 结构化日志
- ✅ `packages/config-typescript/` - TypeScript 配置
- ✅ `packages/config-eslint/` - ESLint 配置

### 基础设施 (infra/)
- ✅ `infra/docker/docker-compose.yml` - PostgreSQL + Redis + MinIO

### 工具脚本 (tooling/)
- ✅ `tooling/scripts/init.sh` - 一键初始化脚本
- ✅ `tooling/scripts/clean.sh` - 清理脚本

### 文档 (docs/)
- ✅ `docs/monorepo-techstack.md` - 技术栈参考文档
- ✅ `docs/architecture.md` - 架构设计文档
- ✅ `docs/development.md` - 开发指南
- ✅ `README.md` - 项目说明
- ✅ `QUICKSTART.md` - 快速启动指南
- ✅ `CONTRIBUTING.md` - 贡献指南

## 🚀 快速开始

### 一键初始化

```bash
bash tooling/scripts/init.sh
```

### 启动开发

```bash
pnpm dev
```

访问 http://localhost:3000

详细步骤请查看 [QUICKSTART.md](QUICKSTART.md)

## 📋 下一步工作

### 必须完成（MVP）

1. **AI Provider 实现**
   - [ ] 实现 DashScope API 调用
   - [ ] 实现 Zhipu API 调用
   - [ ] 实现 DeepSeek API 调用
   - [ ] 实现流式响应

2. **Web 功能**
   - [ ] 对话界面 UI
   - [ ] 任务中心 UI
   - [ ] 文件上传组件
   - [ ] 下载中心
   - [ ] 用户登录/注册

3. **Worker 实现**
   - [ ] STT Worker 完整实现
   - [ ] PPT Worker 完整实现
   - [ ] Image Worker 完整实现

4. **对象存储**
   - [ ] 实现 OSS 上传/下载
   - [ ] 实现签名 URL 生成

5. **鉴权与限流**
   - [ ] NextAuth.js 集成
   - [ ] Redis 限流实现
   - [ ] 用量统计

### 可选优化

- [ ] 缓存策略优化
- [ ] 错误追踪（Sentry）
- [ ] 性能监控
- [ ] E2E 测试
- [ ] CI/CD 配置
- [ ] 部署文档

## 📚 文档导航

- [快速启动](QUICKSTART.md) - 5 分钟上手
- [开发指南](docs/development.md) - 详细开发流程
- [架构设计](docs/architecture.md) - 系统架构说明
- [技术栈参考](docs/monorepo-techstack.md) - 完整技术选型
- [贡献指南](CONTRIBUTING.md) - 如何贡献代码

## 🎯 设计原则

1. **Monorepo 优先**: 统一管理，共享代码
2. **类型安全**: 全面使用 TypeScript
3. **边界清晰**: 通过 packages 共享，禁止跨 apps 引用
4. **渐进增强**: MVP 优先，逐步完善
5. **成本优化**: 国内服务优先，合理限流
6. **可观测性**: 结构化日志，错误追踪

## 📊 项目状态

- ✅ 项目骨架搭建完成
- ✅ 基础设施配置完成
- ✅ 数据库 Schema 设计完成
- ✅ 队列系统配置完成
- ⏳ AI Provider 实现中
- ⏳ Web UI 开发中
- ⏳ Worker 实现中

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 许可证

MIT License

---

**开始开发**: `bash tooling/scripts/init.sh && pnpm dev`
