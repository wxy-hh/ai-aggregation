# 0068. QA reviewUnits 静态导入闭包继承实验（修订补充 ADR-0066 决策 3）

* **状态**：实验已接受（受「只改实现、未改测试」变异盲测零误继承硬门槛约束）
* **日期**：2026-11-28
* **范围**：`tooling/scripts/qa-check/spec-coverage.mjs`、`tooling/scripts/qa-check/script-scan.mjs`、`tooling/scripts/qa-spec-review.mjs`、对应安装模板、工作流正本/模板/指南、`tooling/scripts/README.md` 及自动化回归与变异盲测套件
* **相关与修订**：修订补充 ADR-0066 决策 3，前置依赖步骤 2 只读新鲜度预检（提交 `1f6569f`），保持 `QA Schema: 4` 与 `QA Review Coverage: 2` 向下兼容

## 背景

在 `.scratch/eval-real-execution-honest-scoping/` 真实慢车道复盘中，三轮 `reviewUnits` 均为 `required: 9, sampled: 4, inherited: 0`。根因在于现有 `buildReviewUnits`（`tooling/scripts/qa-check/spec-coverage.mjs`）：

1. `evidenceHash` 绑定了测试日志的文件名和内容哈希；当任一代码改动并用新标签重跑测试套件后，即使某个单元测试的文件与断言完全未变，其 `evidenceHash` 也会改变，导致 `r1→r2` 继承全部归零。
2. 然而 `r1→r2` 不可变快照 Diff 的一手核查同样证实：**绝对不能靠忽略 `evidenceHash` 来放宽继承**。`r1→r2` 中至少 3 个测试文件未改的单元（如 `capability-matrix.test.ts`、`runner.test.ts`）实际静态导入了已改动的实现源码（`capability-matrix.ts`、`runner.ts`、`types.ts`）。若只对比测试文件哈希与断言哈希，就会在「只改实现、未改测试」时错误继承旧审查结论。

因此，必须在证明旧验收已被步骤 2 只读新鲜度预检稳定拦截的前提下，先以静态导入闭包与不可静态排除失效条件收敛继承语义，再以脱敏快照回放和「只改实现、未改测试」变异盲测验证零误继承。

## 决策

1. **前置门禁依赖（步骤 2 只读新鲜度预检）**：
   - `reviewUnits` 继承放宽仅在 `_qa/spec-review-checklist.json` 的 `evidenceTree` 与 `qaPlanDigest` 同当前一致、且存在同树完整 `gate-acceptance-*.log` 时进入审查；旧验收产物在 `collect` 前即被 `PACKAGE_INVALID` 拦截。
2. **双轨受控继承（保持 Schema 4 与 `Coverage: 2` 兼容）**：
   - **轨道 A（既有精确三哈希继承）**：当单元全部为 `PASS`、未发生 `changed`、未标注「不重跑」，且 `sourceHash`、`evidenceHash`、`assertionHash`（以及存在时的 `closureHash`）自上轮已核实后全部一致时，维持既有继承。
   - **轨道 B（低风险 `unit`/`integration` 静态导入闭包放宽继承）**：仅当轨道 A 未命中、且同时满足以下全部条件时，允许在日志文件名或无关全局 `tree` 变化时自动标为 `inherited`：
     - 单元全部断言为 `unit` 或 `integration`、`status === 'PASS'`、`!changed`、无「不重跑」备注，且测试文件名、断言正文与静态闭包内**全部实现文件路径**均未命中安全/权限/隐私/计费红线；
     - 单元关联的当前证据日志均完整、`exit === 0` 且日志 `tree` 与当前 `evidenceTree` 一致（证明当前代码树上真实执行通过）；
     - 零外部依赖静态导入闭包分析函数 `analyzeStaticImportClosure` 成功解析全部静态导入依赖（相对路径、TS `.js`→`.ts`/`.tsx` 映射、`tsconfig.json` `paths` 别名、工作区包与传递/桶文件再导出），无任何不可静态排除失效条件，得出非空 `closureHash`，且与上轮已核实（或已继承）单元的 `sourceHash`、`assertionHash`、`closureHash` 与 `rowIds` 均一致。
3. **永不降级红线**：
   - 安全、权限、隐私、计费（测试文件名或闭包内任一实现路径命中即触发）、`changed`、`browser`/`api` 接缝、非 `PASS` 与标注「不重跑」的单元**永不进入轨道 B 放宽**。
4. **不可静态排除失效条件（Fail-Closed）**：
   - 凡测试文件或其静态导入闭包内任意文件命中以下任一模式，均强制将 `closureHash` 置为 `null` 并写入 `closureInvalidationReasons`，轨道 B 一律回退为 `required`：
     - 环境变量读取（`process.env`、`import.meta.env`、`Deno.env`、`Bun.env`）；
     - 动态 `import(...)`、非字符串字面量 `require(...)`、`createRequire`、`require.resolve`；
     - 运行时动态注入与全局可变态（`vi/jest/mock.(stubEnv|stubGlobal|doMock|mock)`、`globalThis[...]`/`global[...]`、`Object.defineProperty(globalThis/global, ...)`、`Reflect.set(globalThis/global, ...)`、`eval(`、`new Function(`、`vm.runIn*`）；
     - 外部文件读取与子进程执行（导入 `node:fs`/`fs`/`node:child_process`/`child_process` 或调用 `readFile*`/`readdir*`/`spawn*`/`exec*`）；
     - 无法解析的本地相对模块、路径别名或工作区包导入。
5. **变异盲测硬门槛与回退策略**：
   - 必须通过脱敏 r1–r3 快照回放与「只改实现、未改测试」变异盲测（覆盖直接导入、传递/桶再导出、TS 映射/别名/工作区包、高风险闭包与全部不可静态排除失效条件）；
   - **回退触发线**：只要发现**任意一例误继承**，立即回退轨道 B 放宽实现，仅保留步骤 2 只读新鲜度预检。
6. **后续顺序（本 ADR 范围外暂缓项）**：
   - 只有在本方案于后续真实多轮任务对照中持续证明零误继承且有效降低复审重复工作后，才进一步做「删除手填 PASS 表」消融实验；`qa-run` 交付批执行继续保持低优暂缓。

## 已评估代价与限制

- **静态闭包保守代价**：读取环境变量、`fs` 或使用动态加载的测试不会走轨道 B 继承（`closureHash: null`），在换日志名后会退回 `required` 重新核对，以保守换取零误继承确定性。
- **跨文件非导入耦合**：若实现文件修改的是仅在根构建脚本注入而非静态导入的依赖（且未走环境变量/全局可变态/外部文件读取），仍依赖各模块自身显式导入契约；同时引入工作区 `package.json` 到第三方包闭包哈希，包依赖变更将同步触发失效。
