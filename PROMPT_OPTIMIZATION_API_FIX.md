# 提示词优化API修复

## 问题

调用 `createProviderInstance` 时出错：

```
Error at createProviderInstance('xunfei', {...})
```

## 原因

1. `createProviderInstance` 函数不存在，应该使用 `createProvider`
2. `createProvider` 只接受一个参数（provider名称），不需要配置对象
3. 讯飞有自己的专用函数 `xunfeiChat`，不使用通用的 provider

## 解决方案

### 修改前

```typescript
import { createProviderInstance } from '@repo/providers';

const provider = createProviderInstance('xunfei', {
  apiKey: process.env.XUNFEI_API_KEY || '',
  apiSecret: process.env.XUNFEI_API_SECRET || '',
  appId: process.env.XUNFEI_APP_ID || '',
});

const result = await provider.chat({
  messages: [...],
  model: 'lite',
  temperature: 0.7,
  maxTokens: 500,
});
```

### 修改后

```typescript
import { xunfeiChat } from '@repo/providers';

const result = await xunfeiChat({
  messages: [...],
  model: 'lite',
  temperature: 0.7,
  maxTokens: 500,
});
```

## 环境变量

讯飞使用的环境变量是：

```env
XUNFEI_API_PASSWORD=your_api_password
```

**不是：**

- ❌ `XUNFEI_API_KEY`
- ❌ `XUNFEI_API_SECRET`
- ❌ `XUNFEI_APP_ID`

## 如何获取 API 密码

1. 访问 [讯飞开放平台](https://console.xfyun.cn/)
2. 注册/登录账号
3. 创建应用
4. 在应用详情页获取 **API 密码**（API Password）
5. 配置到 `.env.local` 文件

## 测试

配置好环境变量后，重启开发服务器：

```bash
pnpm dev
```

然后测试智能优化功能：

1. 进入视频生成页面
2. 输入简单的描述（如"一只猫"）
3. 点击"智能优化"按钮
4. 应该在1-2秒内看到优化后的提示词

---

**修复日期：** 2026-02-10  
**状态：** ✅ 已修复
