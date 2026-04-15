# Git 双仓库同步 - 快速参考

## 🎯 已配置完成

✅ **Git Hook 自动推送** - 每次 commit 后自动推送到两个仓库
✅ **多 URL 推送** - `git push origin` 同时推送到 Gitee 和 GitHub
✅ **便捷脚本** - `git-sync.sh` 一键提交并推送

---

## 🚀 三种使用方式

### 方式 1: 使用便捷脚本 (推荐)

```bash
./git-sync.sh "你的提交信息"
```

**特点**:

- ✅ 最简单,一条命令完成所有操作
- ✅ 显示详细的推送进度
- ✅ 自动检查状态

---

### 方式 2: 正常提交 (自动推送)

```bash
git add .
git commit -m "你的提交信息"
# Hook 自动推送到 Gitee 和 GitHub ✅
```

**特点**:

- ✅ 提交即同步,无需手动推送
- ✅ 适合频繁提交的场景

---

### 方式 3: 手动推送

```bash
git add .
git commit -m "你的提交信息"
git push origin master  # 同时推送到两个仓库
```

**特点**:

- ✅ 可以多次提交后一次性推送
- ✅ 更灵活可控

---

## 📋 常用命令

```bash
# 查看远程仓库配置
git remote -v

# 只推送到 Gitee
git push origin master

# 只推送到 GitHub
git push github master

# 查看提交历史
git log --oneline -5

# 查看当前状态
git status
```

---

## 🔧 管理 Hook

```bash
# 禁用自动推送
mv .git/hooks/post-commit .git/hooks/post-commit.disabled

# 启用自动推送
mv .git/hooks/post-commit.disabled .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

---

## 🌐 仓库地址

- **Gitee**: https://gitee.com/bit-xiaoyu/ai-aggregation
- **GitHub**: https://github.com/wxy-hh/ai-aggregation

---

## 📖 详细文档

查看 `GIT_SYNC_GUIDE.md` 了解更多配置和故障排查信息。
