# 超管账号与用户管理 - 设计文档

日期：2026-05-12

## 一、概述

为 AI 聚合平台添加超级管理员（超管）功能。超管账号 `xkfy` 独享 `/admin/users` 页面访问权限，可管理所有用户的创建、删除、停用/启用、Token 额度调整。

## 二、权限模型

简单双角色模型：

| 角色 | 值 | 说明 |
|------|-----|------|
| 普通用户 | `user` | 默认角色，有 Token 配额限制 |
| 超管 | `admin` | 唯一超管 xkfy，无配额限制，可访问管理页面 |

## 三、数据库变更

User 表新增 3 个字段：

- `role` — String，默认 `"user"`，可选值 `"user"` / `"admin"`
- `status` — String，默认 `"active"`，可选值 `"active"` / `"disabled"`
- `tokens` — Int，默认 `20000`，新用户初始配额

## 四、超管初始化

Seed 脚本使用 upsert 创建：

- 用户名：`xkfy`
- 密码：`woaini2244`（bcrypt 哈希存储）
- 角色：`admin`
- Token：足够大的值（999999），实际调用时跳过扣除

## 五、认证与授权

### 登录增强
- 登录接口检查 `status`，disabled 用户拒绝登录
- `/api/auth/me` 返回增加 `role` 字段

### 中间件增强
- 访问 `/admin/*` 路径时，解析 refresh_token 并查询用户 role
- 非 admin 用户重定向到 `/home`

### API 层保护
- 新增 `requireAdmin()` 函数，在 JWT 验证基础上增加 role 校验
- 所有 `/api/admin/*` 路由使用 `requireAdmin()`

## 六、管理 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表（分页、搜索） |
| POST | `/api/admin/users` | 创建用户（默认 role=user, tokens=20000） |
| PATCH | `/api/admin/users/[id]` | 更新用户（role, tokens, status, name） |
| DELETE | `/api/admin/users/[id]` | 硬删除用户（CASCADE 级联清理关联数据） |

## 七、Token 配额机制

- 新用户初始 20,000 tokens
- 非 admin 用户调用 AI 接口时检查余额并递减
- admin 用户跳过配额检查
- 超管可通过 API 手动加减任何用户的 tokens

## 八、前端改造

### 管理页面
- 现有 [user-management-shell.tsx] 保留 UI，替换假数据为 API 调用
- 搜索和分页改为服务端实现
- 新增创建用户对话框（username + password + name）
- 删除操作增加确认对话框

### Auth Store
- User 接口增加 `role` 字段
- 前端可根据 role 控制管理入口显隐

## 九、安全要点

- 密码 bcrypt 哈希存储，不在 API 响应中返回
- 超管无法删除自己
- 超管无法将自己的 role 改为非 admin（防止误操作锁死）
- 管理 API 双重校验（中间件 + API 层）
