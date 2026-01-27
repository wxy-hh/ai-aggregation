# 工具脚本

## init.sh

初始化项目，包括：
- 检查环境依赖
- 安装 npm 包
- 启动 Docker 服务
- 初始化数据库
- 创建环境变量文件

```bash
bash tooling/scripts/init.sh
```

## clean.sh

清理项目，删除所有 node_modules、构建产物等。

```bash
bash tooling/scripts/clean.sh
```

## 使用前

确保脚本有执行权限：

```bash
chmod +x tooling/scripts/*.sh
```
