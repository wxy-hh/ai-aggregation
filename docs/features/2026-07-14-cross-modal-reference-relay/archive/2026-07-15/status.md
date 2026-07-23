---
dev_flow_status:
  schema_version: "3"
  feature_id: "2026-07-14-cross-modal-reference-relay"
  level: "L"
  profile: "standard"
  risk_labels: []
  risk_evidence: {}
  classification:
    topology: "multi-chain"
    evidence_result: "verified"
    note: "标准L：跨对话/图像/语音/视频/命理5模块的引用接力。新增共享引用协议(RelayBundle/RelayReferenceItem/DerivationMetadata/DestinyMethodCapability)、5个共享组件、命理能力注册表、历史派生元数据与HistoryType.video。需求与设计文档已确认(状态:需求已确认/已确认设计)。无风险标签:纯新增不改既有数据/鉴权/计费/外部API;不得自动产生模型费用属行为不变量,由behavior_verification覆盖。标准L路线强制coverage/plan-review/rollback-units/behavior-verification均full。"
  current_gate: "implementation_approval"
  completed_gates:
    - requirements-coverage
    - plan-review
    - rollback-units
    - requirement_confirmation
    - writing-plans
    - implementation_approval
  next_action: "after implementation_approval"
  auto_continue: false
  human_gates:
    requirement_confirmation:
      required: true
      status: "confirmed"
      evidence: "需求说明书首页标注「状态:需求已确认」、§7 记录「用户已回复下一步授权进入设计落盘与实现计划」；设计文档标注「已确认设计」。用户在 /dev-task 中提供已确认需求书，前置满足 requirement_confirmation"
    implementation_approval:
      required: true
      status: "confirmed"
      evidence: "用户回复「实现吧」批准实现；D4/D5/D6 按推荐执行（对比加派生 hook、draftByTarget 持久化草稿、RTASR 语义维持+注释）"
  risk_gates:
    requirements_coverage: "full"
    plan_review: "light"
    rollback_units: "none"
    security_review: "none"
    behavior_verification: "full"
  assets:
    - {path: "docs/features/2026-07-14-cross-modal-reference-relay/初步实现计划.md", kind: "plan"}
    - {path: "docs/features/2026-07-14-cross-modal-reference-relay/需求说明书.md", kind: "requirement"}
    - {path: "docs/features/2026-07-14-cross-modal-reference-relay/requirements-coverage.md", kind: "review"}
    - {path: "docs/reviews/2026-07-14-cross-modal-reference-relay-plan-review.md", kind: "review"}
    - {path: "docs/features/2026-07-14-cross-modal-reference-relay/rollback-units.md", kind: "plan"}
  validation:
    last_at: "none"
    commands: []
    business_diff_fingerprint: "unknown"
  accepted_risks: []
  gate_evidence:
    requirements_coverage:
      path: "docs/features/2026-07-14-cross-modal-reference-relay/requirements-coverage.md"
      heading: "3. 覆盖结论与遗留决策"
    plan_review:
      path: "docs/reviews/2026-07-14-cross-modal-reference-relay-plan-review.md"
      heading: "0. 审查结论"
    rollback_units:
      path: "docs/features/2026-07-14-cross-modal-reference-relay/rollback-units.md"
      heading: "回撤顺序约束"
    writing_plans:
      path: "docs/features/2026-07-14-cross-modal-reference-relay/初步实现计划.md"
      heading: "1. 总体架构"
---

# Status

Managed by `dev-flow-status`. Do not hand-edit machine fields.
