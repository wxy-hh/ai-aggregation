# Docker 基础设施

本地开发环境所需的基础服务。

## 服务列表

- **PostgreSQL 16**: 数据库
- **Redis 7**: 队列和缓存
- **MinIO**: 对象存储（本地替代 OSS/COS）

## 启动服务

```bash
cd infra/docker
docker compose up -d
```

## 停止服务

```bash
docker compose down
```

## 查看日志

```bash
docker compose logs -f
```

## 访问地址

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

## MinIO 初始化

首次启动后，需要创建 bucket：

1. 访问 http://localhost:9001
2. 使用 `minioadmin` / `minioadmin` 登录
3. 创建名为 `ai-aggregation` 的 bucket
