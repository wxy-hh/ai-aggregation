# `QA-WF-02`：真实业务试跑审查发现与门禁摩擦基线统计报告

> **统计日期**：2026-11-25  
> **统计范围**：`.scratch/agent-eval-benchmark-dashboard/`、`.scratch/agent-runtime-resilience/`、`.scratch/agent-runtime-resilience-delivery-closure/`、`.scratch/mcp-integration-governance/` 全部 `review/r*.md`、`evidence/gate-review-*.log`、`scripts/` 与 `retro-evidence.md`  
> **统计方式**：只读脚本聚合实际产物，作为 `qa-workflow` v2.1 Batch 1（`ADR-0065`）改造前后的对照基线；不推翻未统计历史旧格式产物。

---

## 一、四特性审查编号分布与真实价值分类

| 特性目录 | `S-H` | `S-J` | `P-M` | `P-W` | `P-X` | 合计唯一编号 | 可 1 秒静态预检数 | 高价值语义/架构发现 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `agent-eval-benchmark-dashboard` | 0 | 0 | 0 | 0 | 0 | **0** | 0 | 0（违规跳过双轴审查，r4 `r4-spec-axis.md` 出现 40 处 `:1` 引用却 PASS） |
| `agent-runtime-resilience` | 0 | 3 | 2 | 4 | 0 | **9** | 0 | `P-W01`、`P-M01`、`P-M02` 三个真功能/UI 缺口及 `P-W02~04` 弱断言 |
| `agent-runtime-resilience-delivery-closure` | 0 | 0 | 0 | 0 | 0 | **0** | 1（`scripts/` 含 `check(true` 1 处 + 无条件 PASS，未进入 r1/r2 正式编号） | r2 Standards 在 `seal` 后上报伪断言（未入原文） |
| `mcp-integration-governance` | 3 | 2 | 0 | 0 | 0 | **5** | **3**（`S-H1` 24 处色值、`S-H2` 热区 `h-8/h-10`、`S-H3` 英文注释） | 3 个可预检 S-H（另 5 项架构疑点在 r2 前人工切强模型修复） |
| **合计** | **3** | **5** | **2** | **4** | **0** | **14** | **4** | **真功能/弱断言集中在 `P-M`/`P-W`；`S-H` 主要为静态样式与注释规范** |

---

## 二、`evidence/gate-review-*.log` 门禁错误分布与结构性摩擦

跨四份特性全部 `gate-review-*.log` 日志中实际出现的门禁错误条目累计次数如下（一次多行检查按条计入）：

| 错误码 / 类别 | `agent-eval` | `resilience` | `closure` | `mcp` | 累计条目 | 根因归类（v2.1 对应处置） |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `SPEC_REVIEW_SOURCE_INVALID` | 0 | 130 | 2 | 38 | **170** | 旧表缺反引号/`-`（`resilience`）+ `.scratch/<feature>/` 路径前缀未归一化（`mcp` 38 条）→ **`seal` 前置同步阻断 + 路径归一化** |
| `SPEC_PLAN_CHANGE_REVIEW_MISSING` | 0 | 113 | 0 | 0 | **113** | 65 行表格填空漏填/格式误写，封存后再爆发 → **`v2` 预填骨架 + `seal` 前置同步校验** |
| `VERIFICATION_BEFORE_REVIEW` | 7 | 18 | 0 | 0 | **25** | 代码零改动仍强迫审后重跑交付命令；重跑浏览器刷新动态数值 → **`qaArtifactsDigest` 双指纹免重跑** |
| `MISSING_VERIFICATION` / `COMMAND_MISMATCH` | 1 | 0 | 24 | 13 | **38** | 多为中间诊断轮（`r3-diag`）或未规范传参 → **阶段指引与 `qa-run --script`** |
| `STALE_VERIFICATION` | 7 | 9 | 0 | 0 | **16** | `resilience` 审后改动态日志间接失效；正常修改代码后重跑为真实防御 → **双指纹减少无谓重跑** |
| `ASSERTION_BLOCKED` / `FAILED` | 0 | 0 | 18 | 0 | **18** | 真实未通过阻塞（`closure` 6 轮均存在真实未过断言）→ **保留阻断** |
| `SPEC_REVIEW_BINDING_MISMATCH` | 0 | 12 | 1 | 0 | **13** | `resilience` r5→r6 重跑导致实测字符数与毫秒数变化 → **`v2` 取消逐字抄 `actual` + 双指纹解锁** |
| `REVIEW_RAW_UNNUMBERED` | 0 | 0 | 4 | 2 | **6** | 「无新增审查发现」未命中 `hasNoFinding` 窄字面 → **`hasNoFinding` 中文变体兼容 + `seal` 同步阻断** |
| `UNRESOLVED_FINDINGS` | 0 | 0 | 0 | 2 | **2** | `mcp` L292 按钮 `h-10` 漏改真实阻断 → **`qa-preflight` 一次性列出同文件全量行号** |
| 其余（`INVALID_TRIAGE`/`DISPOSITION`/`NOT_REREVIEWED`/`COVERAGE_MISSING`/`EVIDENCE` 等） | 2 | 15 | 0 | 0 | **17** | 早期轮次人工拼装或 `r1-r3` 过程报错 |

---

## 三、防线盲区基线（改前必达标对比锚点）

1. **`:1` 敷衍引用未拦截**：`agent-eval-benchmark-dashboard/review/r4-spec-axis.md` 共出现 **40 处** `:1` 敷衍引用，改前 `citationIsValid` 0 拦截放行 `PASS`。
2. **0 子代理自签未拦截**：`agent-eval-benchmark-dashboard` 全程 0 工作流审查子代理且无 `code-review` Skill 调用，改前仅出 `[NOTE]` 仍判 `PASS`。
3. **伪断言与漏改行号**：`closure` `scripts/` 含 `check(true)` 1 处；`mcp` 漏改 `L292` `h-10` 按钮拖满 r3 上限。

---

## 四、后续比对口径

`qa-workflow` v2.1 Batch 1 上线后，依 `ADR-0054` / `ADR-0065` 双轨 KPI 检验：
- 质量轨：`P-M`/`P-W` 真缺陷检出密度不降，`:1` 放行、0 子代理放行与字面伪断言归零；
- 效率轨：`REVIEW_RAW_UNNUMBERED` 误报、路径前缀误杀 `SPEC_REVIEW_SOURCE_INVALID`、非语义 `SPEC_REVIEW_BINDING_MISMATCH` 与零改动 `VERIFICATION_BEFORE_REVIEW` 归零。
