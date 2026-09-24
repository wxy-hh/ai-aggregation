#!/bin/bash

# Git 同步脚本（只推送到 Gitee，GitHub 由 Gitee 镜像自动同步）
# 用法: ./git-sync.sh "提交信息"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否提供了提交信息
if [ -z "$1" ]; then
    echo -e "${RED}错误: 请提供提交信息${NC}"
    echo "用法: ./git-sync.sh \"你的提交信息\""
    exit 1
fi

COMMIT_MESSAGE="$1"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Git 同步工具（Gitee → GitHub 镜像自动同步）${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# 获取当前分支
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${YELLOW}当前分支:${NC} $BRANCH"
echo ""

# 1. 检查是否有未提交的更改
echo -e "${BLUE}1. 检查工作区状态...${NC}"
if [[ -z $(git status -s) ]]; then
    echo -e "${YELLOW}⚠ 没有需要提交的更改${NC}"
    exit 0
fi

# 显示将要提交的文件
echo -e "${GREEN}将要提交的文件:${NC}"
git status -s
echo ""

# 2. 添加所有更改
echo -e "${BLUE}2. 添加所有更改...${NC}"
git add .
echo -e "${GREEN}✓ 已添加所有更改${NC}"
echo ""

# 3. 提交
echo -e "${BLUE}3. 提交更改...${NC}"
git commit -m "$COMMIT_MESSAGE"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 提交成功${NC}"
else
    echo -e "${RED}✗ 提交失败${NC}"
    exit 1
fi
echo ""

# 4. 推送到 Gitee（GitHub 由 Gitee 镜像自动同步，无需手动推送）
echo -e "${BLUE}4. 推送到 Gitee...${NC}"
git push origin $BRANCH
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Gitee 推送成功${NC}"
else
    echo -e "${RED}✗ Gitee 推送失败${NC}"
fi
echo ""

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}✅ 同步完成!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "Gitee:        https://gitee.com/bit-xiaoyu/ai-aggregation"
echo -e "GitHub(镜像): https://github.com/wxy-hh/ai-aggregation"
echo ""
