---
dev_flow_status:
  schema_version: "4"
  feature_id: "2026-07-21-bazi-share-card"
  level: "M"
  profile: "risk-minimal"
  risk_labels: ["security"]
  risk_evidence:
    security:
      mode: "inline"
      conclusion: "设计期隐私审查：分享卡片采用字段白名单制——仅渲染昵称、四柱干支、一句话标签、五维相对指数、二维码与品牌文案；黑名单：出生时间(birthText)、出生地点(locationText)、农历日期、经纬度、性别。四柱干支为用户可见命盘核心且需求文档明确要求展示，60甲子循环无法唯一反推出生时间，属需求明确接受的权衡。数据全部来自客户端已有 store，纯前端 DOM→PNG 导出，不新增 API、不上传服务端。"
      verification: "实现后：1) 单测断言卡片组件输入 props 不含 profile.birthText/locationText；2) 导出 PNG 视觉核验无出生时间/地点字符串；3) code-review 复核渲染字段白名单。"
      report: ""
  process:
    mode: "normal"
    started_at: "2026-07-21T01:59:40Z"
    baseline_business_diff_fingerprint: "c9feccbb4bb1fb19f72e9cc7ebf453e859a7dfa3"
    existing_diff: "unrelated"
    reason: "docs/share_bazi/需求设计文档.md 是用户在任务前编写的需求输入材料，非实现代码，不属于本次业务改动"
  classification:
    topology: "local"
    execution: "light"
    evidence_result: "partial"
    note: ""
  current_gate: "finish"
  completed_gates:
    - security-review
    - implementation_approval
    - code-review
    - verification-before-completion
  next_action: "finish feature"
  auto_continue: false
  human_gates:
    requirement_confirmation:
      required: false
      status: "pending"
      evidence: "not required"
    implementation_approval:
      required: true
      status: "confirmed"
      evidence: "继续吧"
  risk_gates:
    requirements_coverage: "none"
    plan_review: "none"
    rollback_units: "none"
    security_review: "light"
    behavior_verification: "light"
  assets:
    - {path: "docs/reviews/2026-07-21-bazi-share-card-code-review.md", kind: "review"}
    - {path: "docs/reviews/2026-07-21-bazi-share-card-verification.md", kind: "verification"}
  validation:
    last_at: "2026-07-21T03:11:35Z"
    commands:
      - "pnpm vitest --run src/app/destiny/ (25 用例全过) + pnpm typecheck + eslint changed + Playwright 浏览器关键路径(恢复/入口/预览/导出PNG/移动端) + pnpm audit 新增依赖无命中"
    business_diff_fingerprint: "4e93b7d49f8dfd45ca69cbc6a072fdea637c82e0"
  accepted_risks: []
  gate_evidence:
    security_review:
      mode: "inline"
      summary: "light 安全审查。适用矩阵：登录/鉴权/SSO/token 矩阵各分支均不触及（纯客户端 UI 功能，无认证路径改动、无新 API）；行为分支为分享卡片渲染内容。分支结论：采用字段白名单制——仅渲染昵称、四柱干支、一句话标签、五维相对指数、二维码、品牌文案；黑名单为出生时间 birthText、出生地点 locationText、农历、经纬度、性别，不进入卡片组件 props。验证结果：设计期静态审查通过（数据全部来自客户端已有 store，DOM→PNG 纯前端导出，不经服务端）；运行时验证留待实现后——单测断言 props 无黑名单字段、导出 PNG 视觉核验无出生时间/地点字符串、code-review 复核白名单。"
    code_review:
      mode: "report"
      path: "docs/reviews/2026-07-21-bazi-share-card-code-review.md"
      heading: "Summary"
---

# Status

Managed by `dev-flow-status`. Do not hand-edit machine fields.
