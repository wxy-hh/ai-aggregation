# 🚀 立即部署到 Vercel

## 第一步：导入项目到 Vercel（2 分钟）

### 1. 访问 Vercel

打开浏览器：https://vercel.com/new

### 2. 登录 Vercel

- 使用 **GitHub** 账号登录（推荐）
- 或使用 **GitLab** / **Bitbucket** / **Email**

### 3. 导入 GitHub 仓库

1. 在 **Import Git Repository** 页面
2. 搜索或选择：`wxy-hh/ai-aggregation`
3. 点击 **Import** 按钮

---

## 第二步：配置项目（3 分钟）

### 1. 基本配置

Vercel 会自动检测配置，确认以下设置：

- ✅ **Framework Preset**: Next.js
- ✅ **Root Directory**: `.` (保持默认)
- ✅ **Build Command**: `pnpm turbo build --filter=@repo/web`
- ✅ **Output Directory**: `apps/web/.next`
- ✅ **Install Command**: `pnpm install`

**Node.js Version**: 选择 **22.x**

### 2. 配置环境变量

点击 **Environment Variables** 展开，然后：

#### 方式 A：批量导入（推荐）

1. 打开项目根目录的 `VERCEL_ENV_VARS.txt` 文件
2. 复制所有内容
3. 在 Vercel 页面点击 **Paste .env** 按钮
4. 粘贴内容
5. Vercel 会自动解析所有变量

#### 方式 B：手动添加

逐个添加以下关键变量：

```bash
# Redis（必需）
UPSTASH_REDIS_REST_URL=https://fleet-pelican-68904.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAQ0oAAIncDIzMWRmNWVlNmZlZmE0MzRmYjM1NjljNTBjNzgzMzllOXAyNjg5MDQ

# 身份认证（必需）
AUTH_SECRET=8jLxSzDvwnDdJBNvBnWWJQPk0v+D7m9CJ1lUV2V/IYg=

# AI API Keys（已有的）
SILICONFLOW_API_KEY=sk-kphdbudlrvuaotsptthedzrdsmdqchoegrsfwmrxjobjtjwh
ARK_API_KEY=3a04b704-6445-4f3e-a127-bcb711461706
XUNFEI_APP_ID=290f4fa9
XUNFEI_API_KEY=9bf315f669cd77f7cc91a023c0a36f8b
XUNFEI_API_SECRET=M2FlNmIzMmRmYzdmYjFjOTU3YzQ4ZjA4

# 应用 URL（暂时使用占位符，部署后更新）
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXTAUTH_URL=https://your-app.vercel.app
```

**注意**：

- 暂时不要添加 `DATABASE_URL`，我们会在下一步创建数据库
- 空值的变量可以跳过，后续再添加

---

## 第三步：开始部署（3 分钟）

1. 确认所有配置正确
2. 点击 **Deploy** 按钮
3. 等待构建完成（约 3-5 分钟）

**构建过程中你会看到**：

- ✅ Installing dependencies
- ✅ Building application
- ✅ Deploying to production

---

## 第四步：创建 Vercel Postgres 数据库（2 分钟）

部署成功后：

### 1. 进入项目 Dashboard

1. 部署完成后，点击 **Continue to Dashboard**
2. 或访问：https://vercel.com/dashboard

### 2. 添加 Postgres 数据库

1. 在项目页面，点击顶部的 **Storage** 标签
2. 点击 **Create Database** 按钮
3. 选择 **Postgres**
4. 填写信息：
   - **Database Name**: `ai-aggregation-db`
   - **Region**: 选择与应用相同的区域（推荐 `Washington, D.C., USA (iad1)`）
5. 点击 **Create** 按钮

### 3. 连接数据库到项目

1. 数据库创建完成后，点击 **Connect Project**
2. 选择你的项目：`ai-aggregation`
3. 选择环境：**Production**, **Preview**, **Development** 全选 ✅
4. 点击 **Connect** 按钮

**Vercel 会自动添加以下环境变量**：

- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- 等等

### 4. 更新环境变量

1. 进入项目 **Settings** → **Environment Variables**
2. 添加或更新：
   ```bash
   DATABASE_URL=${POSTGRES_PRISMA_URL}
   ```
   或者直接使用 Vercel 自动生成的 `POSTGRES_PRISMA_URL`

---

## 第五步：初始化数据库（2 分钟）

### 方式 A：本地执行（推荐）

在本地终端执行：

```bash
# 1. 从 Vercel 获取生产数据库 URL
# 进入 Vercel Dashboard → Settings → Environment Variables
# 复制 POSTGRES_PRISMA_URL 的值

# 2. 设置环境变量
export DATABASE_URL="postgresql://..."

# 3. 运行数据库迁移
pnpm db:migrate

# 4. 填充初始数据（可选）
pnpm db:seed
```

### 方式 B：通过 Vercel CLI

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 链接项目
vercel link

# 4. 运行迁移
vercel env pull .env.production
pnpm db:migrate
```

---

## 第六步：更新应用 URL（1 分钟）

1. 复制 Vercel 分配的域名（如 `https://ai-aggregation-xxx.vercel.app`）
2. 进入 **Settings** → **Environment Variables**
3. 更新以下变量：
   ```bash
   NEXT_PUBLIC_APP_URL=https://ai-aggregation-xxx.vercel.app
   NEXTAUTH_URL=https://ai-aggregation-xxx.vercel.app
   ```
4. 点击 **Save**
5. 进入 **Deployments** 标签
6. 点击最新部署右侧的 **⋯** 菜单
7. 选择 **Redeploy** 重新部署

---

## 第七步：验证部署 ✅

访问你的应用：`https://ai-aggregation-xxx.vercel.app`

### 测试功能

- [ ] 首页加载正常
- [ ] 对话功能可用（豆包、硅基流动）
- [ ] 图像生成可用（硅基流动 Kolors）
- [ ] 语音转写可用（讯飞、硅基流动）
- [ ] 历史记录保存正常

---

## 🎉 部署完成！

你的 AI 聚合平台已成功部署到 Vercel！

### 下一步

1. **添加更多 AI API Keys**：
   - 通义千问 `DASHSCOPE_API_KEY`
   - 智谱 GLM `ZHIPU_API_KEY`
   - DeepSeek `DEEPSEEK_API_KEY`

2. **自定义域名**（可选）：
   - 进入 **Settings** → **Domains**
   - 添加你的域名

3. **启用监控**：
   - **Analytics** - 页面访问统计
   - **Speed Insights** - 性能监控

---

## 🆘 遇到问题？

### 构建失败

1. 检查 Node.js 版本是否为 22.x
2. 查看构建日志：**Deployments** → 点击失败的部署
3. 检查 `vercel.json` 配置

### 运行时错误

1. 检查环境变量是否配置完整
2. 查看运行时日志：
   ```bash
   vercel logs --follow
   ```

### 数据库连接失败

1. 确认 `DATABASE_URL` 使用的是 `POSTGRES_PRISMA_URL`
2. 确认数据库迁移已执行
3. 检查数据库连接池配置

---

## 📚 相关文档

- [完整部署指南](./DEPLOYMENT.md)
- [环境变量配置](./VERCEL_ENV_VARS.txt)
- [项目文档](./AGENTS.md)

---

**预计总时间**：15-20 分钟

**成本**：完全免费（Vercel Hobby + Vercel Postgres Free + Upstash Free）
