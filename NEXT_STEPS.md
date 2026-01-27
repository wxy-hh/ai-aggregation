# 下一步操作指南

## 🎯 当前状态

✅ 项目初始化完成  
✅ 依赖安装完成（510 个包）  
✅ 文档创建完成  
⏳ **等待配置 Supabase + Upstash**

---

## 📋 立即执行（10 分钟）

### 步骤 1: 注册 Supabase（5 分钟）

1. 打开浏览器访问: https://supabase.com/
2. 点击 "Start your project"
3. 使用 GitHub 账号登录
4. 创建新项目:
   - Name: `ai-aggregation`
   - Password: 设置强密码（记住它！）
   - Region: Southeast Asia (Singapore)
   - Plan: Free
5. 等待项目创建（约 2 分钟）
6. 进入 Settings > Database
7. 复制 Connection string (URI 模式)

**保存连接字符串**，格式类似：

```
postgresql://postgres.xxxxx:[密码]@aws-0-xxx.pooler.supabase.com:6543/postgres
```

### 步骤 2: 注册 Upstash（3 分钟）

1. 打开浏览器访问: https://console.upstash.com/
2. 点击 "Sign Up"
3. 使用 GitHub 或 Google 账号登录
4. 创建 Redis 数据库:
   - Name: `ai-aggregation-redis`
   - Type: Regional
   - Region: 选择离你最近的
5. 记录连接信息:
   - Endpoint: `xxx.upstash.io`
   - Port: `6379`
   - Password: 点击眼睛图标查看

### 步骤 3: 配置环境变量（2 分钟）

在终端运行：

```bash
bash tooling/scripts/setup-env.sh
```

按提示输入：

1. Supabase 连接字符串
2. Upstash Endpoint
3. Upstash Port（直接回车使用默认 6379）
4. Upstash Password

### 步骤 4: 验证配置

```bash
bash tooling/scripts/check-env.sh
```

应该看到全部 ✅

---

## 🚀 初始化数据库（3 分钟）

```bash
# 1. 生成 Prisma Client
pnpm db:generate

# 2. 运行数据库迁移（创建表）
pnpm db:migrate

# 3. 填充测试数据
pnpm db:seed
```

---

## 🎉 启动开发服务

```bash
pnpm dev
```

打开浏览器访问: http://localhost:3000

---

## ✅ 验证安装

### 1. 检查 Web 应用

- 访问 http://localhost:3000
- 应该看到 "AI 聚合平台" 首页

### 2. 检查数据库

```bash
pnpm db:studio
```

- 应该能看到 5 个表
- users 表中有测试用户

### 3. 检查 Supabase

- 打开 Supabase 控制台
- SQL Editor 中运行: `SELECT * FROM users;`
- 应该能看到数据

### 4. 检查 Upstash

- 打开 Upstash 控制台
- CLI 中输入: `PING`
- 应该返回 `PONG`

---

## 📚 完成后阅读

配置完成后，建议阅读：

1. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - 常用命令和快速参考
2. **[docs/development.md](docs/development.md)** - 开发指南
3. **[docs/architecture.md](docs/architecture.md)** - 架构设计
4. **[CURRENT_STATUS.md](CURRENT_STATUS.md)** - 待办事项

---

## 🎯 开始第一个功能

配置完成后，建议从最简单的功能开始：

### 选项 1: 实现基础对话（推荐）

1. 申请 DeepSeek API Key（免费额度）
2. 配置到 `.env.local`
3. 实现 `packages/providers/src/deepseek.ts`
4. 创建对话页面 `apps/web/src/app/chat/page.tsx`
5. 实现对话 API `apps/web/src/app/api/chat/route.ts`

### 选项 2: 开发 UI 界面

1. 创建对话界面组件
2. 创建任务中心页面
3. 使用 Mock 数据测试
4. 后续再集成真实 API

### 选项 3: 实现 Worker

1. 实现 PPT Worker
2. 测试任务队列
3. 集成对象存储

---

## 🆘 遇到问题？

### 问题 1: 无法访问 Supabase

**可能原因**: 网络问题

**解决方案**:

- 尝试使用 VPN
- 或使用国内的数据库服务（阿里云 RDS）

### 问题 2: 数据库迁移失败

**解决方案**:

```bash
# 重置数据库
pnpm --filter @repo/db prisma migrate reset

# 重新迁移
pnpm db:migrate
```

### 问题 3: Redis 连接失败

**检查清单**:

- [ ] `REDIS_PASSWORD` 是否配置
- [ ] `REDIS_HOST` 不包含 `https://`
- [ ] 端口是 `6379`

### 问题 4: 端口被占用

```bash
# 查看占用 3000 端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>
```

---

## 📞 获取帮助

### 文档

- [详细配置指南](docs/SETUP_GUIDE.md)
- [Supabase 配置流程](SETUP_SUPABASE_UPSTASH.md)
- [快速参考](QUICK_REFERENCE.md)

### 检查工具

```bash
# 检查环境配置
bash tooling/scripts/check-env.sh

# 查看项目状态
cat CURRENT_STATUS.md
```

---

## 🎊 完成配置后

恭喜！你已经完成了开发环境的搭建。

现在你可以：

- ✅ 开发前端 UI
- ✅ 实现 AI Provider
- ✅ 开发 Worker 服务
- ✅ 集成第三方服务

**开始你的第一个功能吧！** 🚀

---

## 📊 开发进度追踪

建议使用以下方式追踪进度：

1. **查看待办事项**: [CURRENT_STATUS.md](CURRENT_STATUS.md)
2. **更新进度**: 完成功能后在文档中标记 ✅
3. **记录问题**: 遇到问题记录在项目 Issues 中

---

**准备好了吗？开始配置 Supabase + Upstash！** 🎯

运行: `bash tooling/scripts/setup-env.sh`
