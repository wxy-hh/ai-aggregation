# 讯飞实时语音转写 - 部署检查清单

## ✅ 本地开发验证

- [ ] Worker 网关启动成功（`cd infra/worker-rtasr && pnpm dev`）
- [ ] 健康检查通过（`curl http://localhost:8787/health`）
- [ ] Next.js 启动成功（`pnpm dev`）
- [ ] 访问语音页面（`http://localhost:3000/voice`）
- [ ] 实时录音功能正常
- [ ] 识别结果实时显示
- [ ] 停止并保存功能正常

## 📦 生产部署步骤

### 1. 部署 Cloudflare Worker

```bash
cd infra/worker-rtasr
npx wrangler login
pnpm deploy
```

- [ ] 部署成功
- [ ] 记录 Worker URL: `https://rtasr-gateway.________.workers.dev`

### 2. 配置 Cloudflare 环境变量

在 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Variables

- [ ] 添加 `XUNFEI_APP_ID`
- [ ] 添加 `XUNFEI_API_KEY`
- [ ] 如有需要，添加 `XUNFEI_PD`

### 3. 测试 Worker

```bash
curl https://rtasr-gateway.________.workers.dev/health
```

- [ ] 返回 `{"status":"ok","service":"rtasr-gateway"}`

### 4. 配置 Vercel 环境变量

在 Vercel Dashboard → 你的项目 → Settings → Environment Variables

- [ ] 添加 `NEXT_PUBLIC_RTASR_GATEWAY_URL`
- [ ] 值为: `https://rtasr-gateway.________.workers.dev`

### 5. 部署 Next.js

```bash
vercel deploy --prod
```

- [ ] 部署成功
- [ ] 访问生产环境语音页面
- [ ] 实时录音功能正常

## 🔍 验证测试

### 功能测试

- [ ] 麦克风权限请求正常
- [ ] WebSocket 连接成功
- [ ] 音频流正常发送
- [ ] 识别结果实时返回
- [ ] 中文识别准确
- [ ] 英文识别准确
- [ ] 停止录音功能正常
- [ ] 保存到历史记录功能正常

### 性能测试

- [ ] 延迟 < 1 秒
- [ ] 长时间录音稳定（> 5 分钟）
- [ ] 网络中断后自动重连
- [ ] 多次开始/停止正常

### 兼容性测试

- [ ] Chrome 浏览器
- [ ] Safari 浏览器
- [ ] Firefox 浏览器
- [ ] Edge 浏览器
- [ ] 移动端浏览器

## 🚨 常见问题

### Worker 部署失败

**错误**: `Authentication error`

**解决**: 运行 `npx wrangler login` 重新登录

### WebSocket 连接失败

**错误**: `WebSocket connection failed`

**检查**:

1. Worker URL 是否正确
2. Vercel 环境变量是否配置
3. CORS 是否正确配置

### 识别结果为空

**错误**: 录音正常但无识别结果

**检查**:

1. 讯飞 API 密钥是否正确
2. Worker 日志是否有错误
3. 音频格式是否正确

## 📊 监控指标

### Worker 监控

在 Cloudflare Dashboard 查看：

- [ ] 请求数
- [ ] 错误率
- [ ] 响应时间
- [ ] CPU 使用率

### 应用监控

- [ ] WebSocket 连接成功率
- [ ] 识别准确率
- [ ] 平均延迟
- [ ] 用户使用时长

## 🔐 安全检查

- [ ] API 密钥未暴露给前端
- [ ] 仓库与文档中未出现真实密钥
- [ ] `.dev.vars` 未提交到 Git
- [ ] 生产环境使用 HTTPS/WSS
- [ ] CORS 配置合理
- [ ] 并发限制已设置

## 📝 文档更新

- [ ] README 更新
- [ ] API 文档更新
- [ ] 部署文档更新
- [ ] 故障排查文档更新

## ✨ 完成标志

当所有检查项都完成后，实时语音转写功能即可正式上线！

---

**部署日期**: ****\_\_\_****  
**部署人员**: ****\_\_\_****  
**Worker URL**: ****\_\_\_****  
**Vercel URL**: ****\_\_\_****
