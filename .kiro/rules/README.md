# 规则 (Rules)
## 目录结构

规则按层级进行组织，包括一个**通用 (common)** 层以及多个**特定语言 (language-specific)** 目录：

```
rules/
├── common/          # 语言无关原则（始终安装）
│   ├── coding-style.md
│   ├── git-workflow.md
│   ├── testing.md
│   ├── performance.md
│   ├── patterns.md
│   ├── hooks.md
│   ├── agents.md
│   └── security.md
├── typescript/      # TypeScript/JavaScript 相关
├── python/          # Python 相关
├── golang/          # Go 相关
└── swift/           # Swift 相关
```

- **common/** 包含通用原则 —— 不包含特定语言的代码示例。
- **特定语言目录** 使用特定于框架的模式、工具和代码示例对通用规则进行扩展。每个文件都会引用其对应的通用文件。

## 安装

### 方案 1：安装脚本（推荐）

```bash
# 安装通用规则 + 一个或多个特定语言规则集
./install.sh typescript
./install.sh python
./install.sh golang
./install.sh swift

# 一次安装多种语言
./install.sh typescript python
```

### 方案 2：手动安装

> **重要提示**：请复制整个目录 —— **不要**使用 `/*` 进行打平。
> 通用目录和特定语言目录包含同名文件。将它们打平到同一个目录会导致特定语言文件覆盖通用规则，并破坏特定语言文件中使用的相对路径 `../common/` 引用。

```bash
# 安装通用规则（所有项目都需要）
cp -r rules/common ~/.claude/rules/common

# 根据项目的技术栈安装特定语言规则
cp -r rules/typescript ~/.claude/rules/typescript
cp -r rules/python ~/.claude/rules/python
cp -r rules/golang ~/.claude/rules/golang
cp -r rules/swift ~/.claude/rules/swift

# 注意！！！根据您的实际项目需求进行配置；此处配置仅供参考。
```

## 规则 (Rules) vs 技能 (Skills)

- **规则 (Rules)** 定义了广泛适用的标准、约定和检查清单（例如，“80% 的测试覆盖率”、“严禁硬编码密钥”）。
- **技能 (Skills)**（`skills/` 目录）为特定任务提供深入且可操作的参考资料（例如，`python-patterns`、`golang-testing`）。

特定语言规则文件会在适当的地方引用相关技能。规则告诉你**该做什么**；技能告诉你**如何去做**。

## 添加新语言

要添加对新语言（例如 `rust/`）的支持：

1. 创建 `rules/rust/` 目录
2. 添加扩展通用规则的文件：
   - `coding-style.md` —— 格式化工具、惯用法、错误处理模式
   - `testing.md` —— 测试框架、覆盖率工具、测试组织
   - `patterns.md` —— 特定语言的设计模式
   - `hooks.md` —— 用于格式化程序、代码检查器和类型检查器的 PostToolUse 钩子 (Hooks)
   - `security.md` —— 密钥管理、安全扫描工具
3. 每个文件应以以下内容开头：
   ```
   > 本文件使用 <Language> 特定内容扩展了 [common/xxx.md](../common/xxx.md)。
   ```
4. 如果已有相关技能，请进行引用，或者在 `skills/` 下创建新技能。

## 规则优先级

当特定语言规则与通用规则发生冲突时，**特定语言规则优先**（具体覆盖一般）。这遵循标准的层级配置模式（类似于 CSS 优先级或 `.gitignore` 优先级）。

- `rules/common/` 定义了适用于所有项目的通用默认值。
- `rules/golang/`、`rules/python/`、`rules/typescript/` 等在语言惯用法不同的地方覆盖这些默认值。

### 示例

`common/coding-style.md` 推荐将不可变性 (Immutability) 作为默认原则。特定于语言的 `golang/coding-style.md` 可以覆盖此项：

> Go 的惯用法对结构体修改使用指针接收器 —— 参见 [common/coding-style.md](../common/coding-style.md) 了解一般原则，但此处优先使用符合 Go 惯用法的修改方式。

### 带有覆盖注释的通用规则

`rules/common/` 中可能被特定语言文件覆盖的规则会标记有：

> **语言提示 (Language note)**：对于该模式不符合惯用法的语言，此规则可能会被特定语言规则覆盖。
