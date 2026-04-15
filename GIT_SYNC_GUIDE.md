# Git 双仓库同步指南

## ✅ 已配置完成

你的项目现在已经配置为**自动同步到 Gitee 和 GitHub**!

---

## 🎯 配置方案

### 方案 1: Git Hook (自动推送) ✅

**已启用**: `.git/hooks/post-commit`

**工作原理**:

- 每次执行 `git commit` 后
- 自动推送到 Gitee (origin)
- 自动推送到 GitHub (github)

**使用方式**:

```bash
# 正常提交即可,会自动推送
git add .
git commit -m "你的提交信息"
# 自动推送到 Gitee 和 GitHub ✅
```

---

### 方案 2: 多 URL 推送 ✅

**已配置**: `origin` 远程仓库有两个推送地址

**工作原理**:

- 执行 `git push origin` 时
- 同时推送到 Gitee 和 GitHub

**使用方式**:

```bash
# 提交代码
git add .
git commit -m "你的提交信息"

# 推送到两个仓库
git push origin master
# 或
git push  # 默认推送到 origin
```

---

## 📋 当前远程仓库配置

```bash
# Gitee (主仓库)
origin  https://gitee.com/bit-xiaoyu/ai-aggregation.git (fetch)
origin  https://gitee.com/bit-xiaoyu/ai-aggregation.git (push)
origin  https://github.com/wxy-hh/ai-aggregation.git (push)

# GitHub (备份仓库)
github  https://github.com/wxy-hh/ai-aggregation.git (fetch)
github  https://github.com/wxy-hh/ai-aggregation.git (push)
```

**说明**:

- `origin` 从 Gitee 拉取 (fetch)
- `origin` 推送到 Gitee 和 GitHub (push)
- `github` 可以单独操作 GitHub

---

## 🚀 常用命令

### 1. 正常提交 (推荐)

```bash
# 添加文件
git add .

# 提交
git commit -m "feat: 添加新功能"

# 方案1: Hook 会自动推送 ✅
# 方案2: 手动推送到两个仓库
git push origin master
```

### 2. 只推送到 Gitee

```bash
git push origin master
```

### 3. 只推送到 GitHub

```bash
git push github master
```

### 4. 同时推送到两个仓库 (手动)

```bash
git push origin master && git push github master
```

### 5. 推送所有分支

```bash
# 推送到 Gitee
git push origin --all

# 推送到 GitHub
git push github --all
```

---

## 🔧 便捷脚本

### 快速提交并推送

使用提供的脚本 `git-sync.sh`:

```bash
# 使用方式
./git-sync.sh "你的提交信息"

# 示例
./git-sync.sh "feat: 添加用户登录功能"
```

---

## ⚙️ 配置说明

### Git Hook 配置

**文件位置**: `.git/hooks/post-commit`

**内容**:

```bash
#!/bin/bash
echo "🚀 正在同步到远程仓库..."
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin $BRANCH
git push github $BRANCH
echo "✅ 同步完成!"
```

**特点**:

- ✅ 自动执行,无需手动推送
- ✅ 支持任意分支
- ✅ 显示推送进度

### 多 URL 推送配置

**查看配置**:

```bash
git remote -v
```

**添加推送 URL**:

```bash
git remote set-url --add --push origin <新的URL>
```

**删除推送 URL**:

```bash
git remote set-url --delete --push origin <要删除的URL>
```

---

## 🔍 验证配置

### 测试推送

```bash
# 创建测试提交
echo "test" > test.txt
git add test.txt
git commit -m "test: 测试双仓库同步"

# 方案1: Hook 自动推送
# 方案2: 手动推送
git push origin master

# 检查两个仓库是否都更新了
```

### 查看远程仓库

```bash
# 查看所有远程仓库
git remote -v

# 查看 origin 的详细配置
git remote show origin
```

---

## 🛠️ 故障排查

### 问题 1: Hook 没有执行

**原因**: Hook 文件没有执行权限

**解决**:

```bash
chmod +x .git/hooks/post-commit
```

### 问题 2: 推送失败

**原因**: 认证失败或网络问题

**解决**:

```bash
# 检查 Git 凭据
git config --list | grep credential

# 重新配置凭据
git config --global credential.helper store

# 手动推送测试
git push origin master
git push github master
```

### 问题 3: 推送到 GitHub 很慢

**原因**: 网络问题

**解决**:

```bash
# 方案1: 使用 SSH (推荐)
git remote set-url github git@github.com:wxy-hh/ai-aggregation.git

# 方案2: 配置代理
git config --global http.proxy http://127.0.0.1:7890
```

### 问题 4: 想禁用自动推送

**临时禁用**:

```bash
# 重命名 hook 文件
mv .git/hooks/post-commit .git/hooks/post-commit.disabled
```

**重新启用**:

```bash
mv .git/hooks/post-commit.disabled .git/hooks/post-commit
```

---

## 📊 工作流程对比

### 方案 1: Git Hook (自动)

```
git add .
git commit -m "message"
↓
自动触发 post-commit hook
↓
自动推送到 Gitee
↓
自动推送到 GitHub
↓
完成 ✅
```

**优点**:

- ✅ 完全自动,无需记忆命令
- ✅ 不会忘记推送
- ✅ 提交即同步

**缺点**:

- ⚠️ 每次提交都会推送 (可能不想要)
- ⚠️ 网络问题会影响提交速度

---

### 方案 2: 多 URL 推送 (半自动)

```
git add .
git commit -m "message"
git push origin master
↓
同时推送到 Gitee 和 GitHub
↓
完成 ✅
```

**优点**:

- ✅ 可控,想推送时才推送
- ✅ 一条命令推送到两个仓库
- ✅ 不影响提交速度

**缺点**:

- ⚠️ 需要手动执行 push
- ⚠️ 可能忘记推送

---

## 💡 推荐使用方式

### 日常开发

**使用方案 2 (多 URL 推送)**:

```bash
# 提交代码
git add .
git commit -m "feat: 新功能"

# 推送到两个仓库
git push origin master
```

**原因**:

- 可以多次提交后一次性推送
- 不影响提交速度
- 更灵活

### 重要更新

**使用方案 1 (Git Hook)**:

- 自动推送,确保不会忘记
- 适合重要的代码更新

---

## 🔄 切换方案

### 禁用 Git Hook

```bash
# 重命名 hook 文件
mv .git/hooks/post-commit .git/hooks/post-commit.disabled
```

### 启用 Git Hook

```bash
# 恢复 hook 文件
mv .git/hooks/post-commit.disabled .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

### 移除多 URL 配置

```bash
# 重置 origin 的推送 URL
git remote set-url --delete --push origin https://github.com/wxy-hh/ai-aggregation.git

# 只保留 Gitee
git remote set-url origin https://gitee.com/bit-xiaoyu/ai-aggregation.git
```

---

## 📝 总结

### 当前配置

- ✅ Git Hook 已启用 (自动推送)
- ✅ 多 URL 推送已配置
- ✅ 两种方案可以同时使用

### 推荐工作流

```bash
# 1. 开发代码
# 2. 提交代码
git add .
git commit -m "你的提交信息"

# 3. 推送 (二选一)
# 方案1: Hook 自动推送 (无需操作)
# 方案2: 手动推送
git push origin master
```

### 验证同步

访问两个仓库确认代码已同步:

- Gitee: https://gitee.com/bit-xiaoyu/ai-aggregation
- GitHub: https://github.com/wxy-hh/ai-aggregation

---

**最后更新**: 2026-04-15 15:30 (北京时间)
