# 豆包（Doubao）八字报告完整提示词

> 模型：`doubao-seed-2-0-lite-260428`
> 端点：`{ARK_BASE_URL}/responses`
> 用途：八字命理解读的分区流式输出

---

## HTTP 请求体

```json
POST {ARK_BASE_URL}/responses
Authorization: Bearer {ARK_API_KEY}
Content-Type: application/json

{
  "model": "doubao-seed-2-0-lite-260428",
  "input": [
    { "role": "system", "content": "<system_prompt>" },
    { "role": "user", "content": "<user_prompt>" }
  ],
  "stream": true,
  "temperature": 0.25,
  "max_output_tokens": 6200,
  "reasoning": { "effort": "low" },
  "text": {
    "format": {
      "type": "json_schema",
      "name": "bazi_interpretation_report",
      "schema": { "<json_schema>" }
    }
  }
}
```

---

## 1. System Prompt

本提示词在服务端由 `buildStreamingSystemPrompt(currentYear)` 函数动态生成（`apps/web/src/app/api/destiny/report/route.ts`）。

```
你是深耕传统子平命理的文化学者，精通《渊海子平》《滴天髓》《穷通宝鉴》等经典，擅长以"以日为主、以月为提纲"的原则进行八字命理分析，熟练运用五行生克、十神格局、调候喜忌等理论。

【合规声明】你提供的内容都是基于中国传统民俗文化的娱乐化解读，不得出现封建迷信表述，不得提及"改运""化解""注定""算命""占卜"等词汇，不得预测具体年份的事件，不制造焦虑，所有分析均为娱乐参考。

你拿到的排盘、五行、十神、节气、起运与流年数据都已经由本地算法确定，你只能做解释，不能修改任何事实值。分析思路必须遵循以下原则顺序：
1. 先看月令调候：elementStats 中 seasonalBonus 最高的即为月令当旺五行，结合日主五行判断是否需要调候
2. 再看十神格局：根据 tenGodStats 中权重最高的十神结合日主关系判断主导格局
3. 综合五行生克与藏干关系，确保解释有理论依据

必须严格输出一个包含以下 9 个属性的完整 JSON 对象，禁止输出任何额外文字、markdown、解释或思考过程：

{
  "coreDestinyTone": {"headline":"string","description":"string"},
  "pillars": [{"label":"string","tooltip":"string"}],
  "elementsAndTenGods": {
    "lifeDimensions":[...],
    "lifeDimensionHighlights":{...},
    "tenGodDomains":[...],
    "balanceInsight":{...},
    "patternHighlights":[...]
  },
  "modulePersonality": {"title":"string","summary":"string","bullets":["string"]},
  "moduleCareer": {"title":"string","summary":"string","bullets":["string"]},
  "moduleLove": {"title":"string","summary":"string","bullets":["string"]},
  "moduleWealth": {"title":"string","summary":"string","bullets":["string"]},
  "moduleHealth": {"title":"string","summary":"string","bullets":["string"]},
  "timeline": [{"title":"string","summary":"string","detail":{"opportunities":["string"],"risks":["string"],"actions":["string"]}}]
}

要求：
1. coreDestinyTone 只写 headline 和 description。headline 8-16 个中文字符，描述命局基调，避免通用句式；description 55-90 个中文字符，2 句内，先概括格局特点再落到现实风格。
2. pillars 必须 4 项，label 依次固定为年柱/月柱/日柱/时柱。tooltip 55-110 个中文字符，固定写成 2 句：第一句解释这根柱子代表什么；第二句结合已给出的该柱干支、藏干、十神或五行重心，明确写"这意味着你……"。四根柱子的解读应体现不同侧重点，避免四句结构雷同。
3. elementsAndTenGods 不要输出任何新的数值事实，只能围绕已给出的数值做解释。lifeDimensions 返回 5 项，key 固定 career/wealth/health/love/wisdom；tenGodDomains 返回 5 项，key 固定 self/expression/wealth/order/resource。
4. lifeDimensionHighlights 的 strength 和 caution 各 1 句，28-60 个中文字符，说人话，不堆术语。
5. balanceInsight 用一句短标题 + 当前更显的五行 + 45-90 个中文字符的解释，重点讲现实做事风格。注意：必须结合月令五行（seasonalBonus 最高的元素）与日主的生克关系来分析，不要只堆数值或套话。
6. patternHighlights 返回 2-4 项，用大白话解释已给出的术语或组合，不要虚构新的命理组合，每项要具体对应命盘特征。
7. 五大模块 summary 各 50-90 字，bullets 2-4 条，每条 18 字以内，直接给建议。每个模块必须结合命盘格局、五行强弱或十神重心给出个性化解读，避免千篇一律的通用建议。
8. timeline 必须返回 3 项，分别对应 {currentYear}、{currentYear+1}、{currentYear+2}，但 JSON 里不要写 year 字段。标题、摘要和 detail 必须围绕给定的流年干支与大运的相互作用来分析，结合命局喜忌给出趋势判断。
9. 语气稳健、具体、克制，不夸大确定性，不要许愿式话术。整体输出要求个性化，每个模块都应体现命盘独特性，避免模板化表述。
```

---

## 2. User Prompt

本提示词在服务端由 `buildUserPrompt(input, basis)` 函数动态生成（`apps/web/src/app/api/destiny/report/route.ts`）。

```
请只基于以下已经完成的本地排盘真值撰写命理解读，不要重算、不要改写任何干支、五行、十神、节气、起运或流年年份。
用户原始信息（出生日期与出生时间均为农历口径，仅作背景）：
姓名：{input.name}
性别：{男/女}
出生日期：{year-month-day}
出生时间：{hour:minute}
出生地：{location}

deterministicFacts（必须严格沿用）：
{JSON.stringify(deterministicFacts, null, 2)}

litePromptPayload（便于快速把握主轴）：
{JSON.stringify(litePromptPayload, null, 2)}
```

### deterministicFacts 结构

由 `buildBaziPromptPayload(basis)` 从 `packages/shared/src/bazi-chart.ts` 生成，包含本地算法排盘的完整确定性数据：

```typescript
{
  profile: {
    chartSummary: string;    // 排盘概览，如 "乾造：癸酉 辛酉 己卯 甲戌"
    lunarText: string;       // 农历日期文本
    solarText: string;       // 公历日期文本
    genderLabel: string;      // 性别标签，如 "男命" / "女命"
    locationText: string;     // 出生地文本
  },
  solarCorrection: {
    applied: boolean;
    longitude: number;       // 经度
    standardMeridian: number; // 标准子午线（120°E）
    longitudeOffset: number;  // 经度修正（秒）
    equationOfTime: number;   // 均时差修正（秒）
    offsetSeconds: number;    // 总修正（秒）
    offsetMinutes: number;    // 总修正（分钟）
    summary: string;          // 修正说明文本
  },
  dayMaster: {
    stem: string;      // 日干，如 "己"
    element: string;    // 五行，如 "earth"
  },
  pillars: [{
    label: string;           // "年柱" | "月柱" | "日柱" | "时柱"
    name: string;            // 干支，如 "癸酉"
    stemElement: string;     // 天干五行
    branchElement: string;   // 地支五行
    stemTenGod: string;      // 天干十神
    hiddenStems: [{
      stem: string;          // 藏干
      type: "main" | "middle" | "residual";
      element: string;       // 藏干五行
      tenGod: string;        // 藏干十神
    }];
    sound: string;           // 纳音
  }],
  solarTerms: {
    active: { name: string; solarTime: { text: string } };  // 当前节气
    next: { name: string; solarTime: { text: string } };     // 下一个节气
  },
  elementStats: [{
    key: string;        // "metal" | "wood" | "water" | "fire" | "earth"
    label: string;      // "金" | "木" | "水" | "火" | "土"
    value: number;      // 百分比
    weight: number;
    sources: { stems: number; branches: number; hiddenStems: number; seasonalBonus: number };
  }],
  tenGodStats: [{
    label: string;       // 十神名称
    domain: string;      // 领域分类
    weight: number;
    visibleStems: number;
    hiddenStems: number;
  }],
  childLimit: {
    forward: boolean;     // 顺逆
    startAge: number;     // 起运年龄
    duration: number;     // 大运跨度（年）
  },
  decadeFortunes: [{
    name: string;        // 大运干支
    ageRange: string;    // 年龄区间
  }],
  annualCycles: [{
    year: number;         // 年份
    yearCycle: string;    // 流年干支
    annualFortune: string;
    decadeFortune: string;
  }]
}
```

### litePromptPayload 结构

供模型快速把握命盘主轴的简化摘要：

```typescript
{
  chartSummary: string;                    // 排盘概览
  birthContext: string;                    // 一句出生上下文
  solarCorrection: string;                 // 真太阳时修正摘要
  dayMaster: string;                       // 日主，如 "己土"
  pillars: [{
    label: string;
    name: string;
    hiddenStems: string[];                 // 藏干+十神
  }];
  solarTerms: {
    active: string;
    next: string;
  };
  elements: string[];                      // 五行统计，如 ["金38", "木24", ...]
  topTenGods: string[];                    // top6十神，如 ["食神38", "偏财10", ...]
  startFortune: {
    forward: boolean;
    startAge: number;
    duration: number;
  };
  annualCycles: [{
    year: number;
    yearCycle: string;
    annualFortune: string;
    decadeFortune: string;
  }];
}
```

---

## 3. JSON Schema（结构化输出约束）

定义于 `apps/web/src/app/api/destiny/_lib/bazi-json-schema.ts`，用于 `text.format.schema` 字段强制模型按指定结构输出：

```json
{
  "type": "object",
  "properties": {
    "coreDestinyTone": {
      "type": "object",
      "properties": {
        "headline": { "type": "string" },
        "description": { "type": "string" }
      },
      "required": ["headline", "description"],
      "additionalProperties": false
    },
    "pillars": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "tooltip": { "type": "string" }
        },
        "required": ["label", "tooltip"],
        "additionalProperties": false
      }
    },
    "elementsAndTenGods": {
      "type": "object",
      "properties": {
        "lifeDimensions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "key": { "type": "string", "enum": ["career", "wealth", "health", "love", "wisdom"] },
              "label": { "type": "string" },
              "value": { "type": "integer" }
            },
            "required": ["key", "label", "value"],
            "additionalProperties": false
          }
        },
        "lifeDimensionHighlights": {
          "type": "object",
          "properties": {
            "strength": { "type": "string" },
            "caution": { "type": "string" }
          },
          "required": ["strength", "caution"],
          "additionalProperties": false
        },
        "tenGodDomains": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "key": { "type": "string", "enum": ["self", "expression", "wealth", "order", "resource"] },
              "label": { "type": "string" },
              "technicalLabel": { "type": "string" },
              "value": { "type": "integer" },
              "description": { "type": "string" }
            },
            "required": ["key", "label", "technicalLabel", "value", "description"],
            "additionalProperties": false
          }
        },
        "balanceInsight": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "value": { "type": "string" },
            "tooltip": { "type": "string" }
          },
          "required": ["title", "value", "tooltip"],
          "additionalProperties": false
        },
        "patternHighlights": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "label": { "type": "string" },
              "tooltip": { "type": "string" }
            },
            "required": ["label", "tooltip"],
            "additionalProperties": false
          }
        }
      },
      "required": ["lifeDimensions", "lifeDimensionHighlights", "tenGodDomains", "balanceInsight", "patternHighlights"],
      "additionalProperties": false
    },
    "modulePersonality": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "summary": { "type": "string" },
        "bullets": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "summary", "bullets"],
      "additionalProperties": false
    },
    "moduleCareer": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "summary": { "type": "string" },
        "bullets": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "summary", "bullets"],
      "additionalProperties": false
    },
    "moduleLove": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "summary": { "type": "string" },
        "bullets": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "summary", "bullets"],
      "additionalProperties": false
    },
    "moduleWealth": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "summary": { "type": "string" },
        "bullets": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "summary", "bullets"],
      "additionalProperties": false
    },
    "moduleHealth": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "summary": { "type": "string" },
        "bullets": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "summary", "bullets"],
      "additionalProperties": false
    },
    "timeline": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "summary": { "type": "string" },
          "detail": {
            "type": "object",
            "properties": {
              "opportunities": { "type": "array", "items": { "type": "string" } },
              "risks": { "type": "array", "items": { "type": "string" } },
              "actions": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["opportunities", "risks", "actions"],
            "additionalProperties": false
          }
        },
        "required": ["title", "summary", "detail"],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "coreDestinyTone",
    "pillars",
    "elementsAndTenGods",
    "modulePersonality",
    "moduleCareer",
    "moduleLove",
    "moduleWealth",
    "moduleHealth",
    "timeline"
  ],
  "additionalProperties": false
}
```

---

## 数据流向

```
用户输入(农历/公历)
      │
      ▼
computeBaziChart()       ← tyme4ts 算法排盘
      │
      ├─ deterministicFacts (完整事实数据)
      └─ litePromptPayload (快速摘要)
      │
      ▼
buildStreamingSystemPrompt(currentYear)   ← 角色设定 + 合规 + 分析框架 + JSON格式要求
buildUserPrompt(input, basis)              ← deterministicFacts + litePromptPayload
      │
      ▼
POST {ARK}/responses
  model: doubao-seed-2-0-lite-260428
  temperature: 0.25
  text.format.type: json_schema
      │
      ▼  SSE stream
parseBaziSectionPayload()    ← 按9个section分区解析
normalizeDestinyReport()     ← Zod校验 + 规范化
      │
      ▼
客户端渐进式渲染 (Zustand store)
```
