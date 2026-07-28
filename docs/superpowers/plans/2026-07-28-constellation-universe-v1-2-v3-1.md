# 星座寰宇 V1.2 / V3.1 一致性修订 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 将星座寰宇设计文档与视觉交付收敛为一套可发布的 P0 真相，消除时间精度、表单、范围、隐私和跨端壳层冲突。

**Architecture:** 主设计文档承担流程、数据和边界的唯一语义来源；V3.1 视觉交付附录承担可开发状态与固定文案。桌面端直接复用当前 AI STUDIO 系统导航和命理大师模块侧栏，星座只替换右侧内容区；旧 V3 图稿保留为归档，不再作为开发依据。

**Tech Stack:** Markdown、现有应用壳层、Git、ripgrep。

## Global Constraints

- 所有新文档、图中用户可见文案和代码注释使用中文。
- 不修改无关功能；旧 V3 PNG 不覆盖。任何需要补充的视觉稿只能编辑右侧内容区，不能重新生成系统导航或命理模块侧栏。
- 文档流程、数据、边界优先于视觉稿；视觉稿不得发明功能或字段。
- P0 只有本周行动三角，不含完整今天、7 天、30 天行运。
- 未知时间绝不默认 12:00，且不显示上升、天顶、宫位或其衍生结论。
- 移动端始终只有一个固定底部导航或操作区，必须适配安全区。

---

### Task 1: 将主设计文档修订为 V1.2

**Files:**
- Modify: \`docs/designs/2026-07-26-constellation-universe-design.md:3-10\`
- Modify: \`docs/designs/2026-07-26-constellation-universe-design.md:153-273\`
- Modify: \`docs/designs/2026-07-26-constellation-universe-design.md:295-302\`
- Modify: \`docs/designs/2026-07-26-constellation-universe-design.md:365-396\`
- Modify: \`docs/designs/2026-07-26-constellation-universe-design.md:466-567\`
- Create: \`docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md\`

**Interfaces:**
- Consumes: \`docs/plans/2026-07-28-constellation-universe-v1-2-v3-1-design.md\` 的已批准决策。
- Produces: 可被产品、设计和开发共同引用的 V1.2 语义基线与 V3.1 视觉状态清单。

- [ ] **Step 1: 写入 V1.2 的版本、语义优先级与表单规则**

将主文档版本由 \`V1.1\` 改为 \`V1.2\`。在结论摘要后加入“交付物优先级”表，固定“主设计文档 > 设计系统 > 视觉稿”。将 6.3 的表单规则锁为：第一步为昵称、阳历日期、单选关注主题；第二步为三档时间精度、时间或约时时段、全球城市搜索和时区确认。删除或替换任何会允许多选、三步、AM/PM、当前位置与未知时间默认值的语义。

- [ ] **Step 2: 写入约时、未知时间、时区与分享的可验收边界**

时间精度固定为“准确到分钟 / 大约时段 / 完全未知”三档；出生日期仍为必填，不得出现“只知道日期”第四档。约时保存原始时间区间，经稳定性校验后才显示角点和宫位，不稳定即降级。时区展示固定为“城市 · IANA 时区 · 当地时间”，历史夏令时说明放在盘面依据。未知时间不显示“上升待定”事实卡，分享卡仅分享可计算的大三要素。

- [ ] **Step 3: 收敛 P0/P1、历史生命周期和工程字段**

将 6.6 的“今天 / 未来 7 天 / 未来 30 天”改为“P0 只显示本周行动三角；完整逐日行运见 P1”。把宫位地图、术语百科和完整双向索引标记为 P1 增强。为 \`AstrologyChartFacts\` 补充 \`engineVersion\`、\`orbTableVersion\`、\`calculationRevision\`，为历史记录补充 \`recalculatedAt\` 和旧事实、旧报告不可覆盖的规则。

- [ ] **Step 4: 新建 V3.1 视觉交付附录**

写入共享桌面和移动壳层、P0 必含与禁止清单、加载四段文案、时间精度、时区、脱敏历史与问答安全 Copy Deck，以及每个 V3.1 右侧内容状态的验收描述。

- [ ] **Step 5: 运行文档一致性检查**

Run:

~~~bash
rg -n "默认时间|12:00|可多选|精准度 [0-9]+%|精确度：高|使用当前位置|年度运势|现代占星.*设置|今天 / 未来 7 天 / 未来 30 天" \
  docs/designs/2026-07-26-constellation-universe-design.md \
  docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md
~~~

Expected: 没有与 V1.2 规则冲突的有效规范文本；若命中旧 V3 归档说明，必须明确标为“归档，不作为开发依据”。

- [ ] **Step 6: 提交文档语义修订**

~~~bash
git add docs/designs/2026-07-26-constellation-universe-design.md \
  docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md
git commit -m "docs: align constellation universe v1.2 rules"
~~~

Expected: Git 输出一个只包含 V1.2 文档和 V3.1 视觉交付附录的提交。

### Task 2: 锁定现有壳层并修订右侧内容区状态

**Files:**
- Modify: \`docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md\`

**Interfaces:**
- Consumes: V1.2 主文档的流程、Copy Deck 和 V3.1 视觉交付附录。
- Produces: 以现有应用壳层为前提的右侧内容区状态规范，供开发验收使用。

- [ ] **Step 1: 固定两个共享壳层和图像编辑不变量**

桌面端逐像素复用当前 AI STUDIO 左侧系统导航与“AI 命理大师”模块侧栏，模块固定为“八字、紫微、奇门、星座”，当前项为星座。不得通过图像生成或重绘改变这两个栏位，只能编辑右侧内容区。移动端使用现有页头、同一四段导航和一个全局底栏。所有画面保留蓝紫色、实体长文阅读区、线框星盘和中文文字；不使用第二个品牌名、不同 Logo、第二条底栏、玻璃叠卡或英文用户可见文案。

- [ ] **Step 2: 写入输入与校验状态的右侧内容区规范**

为 \`birth-profile\`、\`birth-time-place\`、\`unknown-time-input\`、\`form-validation\` 写入右侧内容区规范。基本资料必须为步骤 \`1 / 2\`、主题可空单选；出生时空必须为步骤 \`2 / 2\`、三档精度和城市 \`Asia/Shanghai\`；未知时间只保留三档并显示“将生成无宫位本命盘”；校验状态保持两步骨架、字段下中文错误、无 12:00 和 AM/PM。

- [ ] **Step 3: 写入加载、结果与深度状态的右侧内容区规范**

为 \`loading\`、\`loading-error\`、\`result-overview\`、\`unknown-time-result\`、\`chart-tab\`、\`aspects-tab\`、\`palace-map\`、\`transit\`、\`glossary\` 写入右侧内容区规范。加载前 3 步主语为系统或计算服务，第四步为 AI 基于事实整理解读。完整结果使用分类精度和盘面范围，不出现百分比；移动首屏为压缩护照、主轴、大三要素、本周三角，星盘在首屏下方。未知时间结果只有无宫位行星盘和资料范围提示。宫位、术语和行运状态标记“P1 预览”，行运不展示完整今天、7天、30天列表。

- [ ] **Step 4: 写入问答、分享、历史与入口状态的右侧内容区规范**

为 \`entry\`、\`qa\`、\`share-success\`、\`history-delete\` 写入右侧内容区规范。入口最近记录只显示标题、生成日期和低敏摘要。问答为少轮问答、三个引导问题和敏感主题拒答，无未采集的性别字段。分享只显示匿名或昵称、可计算的大三要素、主轴、生成日期，无体系切换、设置、导出。历史删除只在统一历史记录中出现，并说明同时删除对应出生资料、真值和报告。

- [ ] **Step 5: 逐图人工视觉验收**

以现有应用截图和实现为准检查：桌面端左侧系统导航与命理大师模块侧栏没有被改变，星座只作为奇门后的第四项，右侧内容区符合文案和阶段规则；移动端无双底栏、未知时间无默认时刻、结果无百分比、P1 预览有阶段标记。

- [ ] **Step 6: 检查视觉规范没有要求重绘壳层**

Run:

~~~bash
rg -n "逐像素复用|只能替换右侧内容区|不得通过图像生成|当前 AI STUDIO" \
  docs/designs/2026-07-26-constellation-universe-design.md \
  docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md
~~~

Expected: 主设计文档和视觉附录都明确锁定现有桌面壳层，且只允许右侧内容区随状态变化。

- [ ] **Step 7: 提交 V3.1 右侧内容区规范**

~~~bash
git add docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md
git commit -m "docs: align constellation universe v3.1 content states"
~~~

Expected: Git 输出只包含 V3.1 右侧内容区规范的提交。

### Task 3: 切换正式索引并做交付验收

**Files:**
- Modify: \`docs/designs/2026-07-26-constellation-universe-design.md:543-567\`
- Modify: \`docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md\`

**Interfaces:**
- Consumes: 已验证的 V1.2 规则与 V3.1 右侧内容区规范。
- Produces: 明确归档身份的 V3 索引，以及引用 V3.1 状态规范的正式交付基线。

- [ ] **Step 1: 用 V3.1 索引替换主文档的 V3 交付索引**

将第 17 节改名为“视觉交付基线（V3.1）”，清楚写明 V3 为归档参考、当前桌面壳层直接复用、只有右侧内容区可变。为宫位地图、近期星运与术语百科标记“P1 预览，不纳入 P0 验收”。

- [ ] **Step 2: 运行跨文档和文件引用检查**

Run:

~~~bash
rg -n 'V3 图稿为归档|只有右侧内容区可变化|视觉交付附录（V3.1）' \
  docs/designs/2026-07-26-constellation-universe-design.md \
  docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md
git diff --check
~~~

Expected: 主文档不再把 V3 当作当前开发依据，V3.1 只约束右侧内容区，且 \`git diff --check\` 无输出。

- [ ] **Step 3: 执行最终内容验收**

按下列断言检查文档和 V3.1 右侧内容区规范：

1. 表单只有两步、主题单选、时间精度三档。
2. 未知时间无 12:00、无上升、无天顶、无宫位。
3. 精度没有百分比，加载仅最后阶段使用 AI 主语。
4. P0 没有年度运势、统计图、体系切换或完整逐日行运。
5. 入口、历史和分享均保持脱敏，移动端只有一条底部固定区域。

- [ ] **Step 4: 提交正式索引和验收结果**

~~~bash
git add docs/designs/2026-07-26-constellation-universe-design.md \
  docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md
git commit -m "docs: publish constellation universe v3.1 delivery index"
~~~

Expected: Git 输出包含正式 V3.1 索引切换的提交。

## Self-Review

- 规格覆盖：任务 1 覆盖语义、范围、数据与隐私；任务 2 覆盖所有桌面和移动端的右侧内容区状态，不改变既有壳层；任务 3 覆盖正式交付基线和验收。
- 占星约束：未知时间、约时、相位、时区、宫制和真值版本规则均由任务 1 明确，并由任务 2 视觉化。
- 占位符扫描：计划中没有 \`TODO\`、\`TBD\` 或“稍后处理”式步骤。
- 壳层一致性：主文档、视觉附录和实施计划都固定复用现有 AI STUDIO 系统导航与命理大师模块侧栏，星座仅替换右侧内容区。
