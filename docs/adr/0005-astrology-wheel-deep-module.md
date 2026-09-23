# 0005. 星盘渲染收敛为单一深模块 `<AstrologyWheel />`

* **状态**：已接受
* **日期**：2026-09-23
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 星座寰宇模块星盘渲染管线（`apps/web/src/app/destiny/_components/astrology/`）

---

## 背景

在重构前，星座模块的星盘展示由多个浅模块与长层级透传拼装而成：
1. **浅模块碎片化**：
   - `astrology-wheel-scene-switch.tsx`（探测开关）：负责 WebGL 能力嗅探、动态分包加载与交接状态机；
   - `astrology-wheel-3d.tsx`（浑天仪 3D 舞台）：仅包裹四层天球环、投影光晕、悬浮动画与 CSS 指针视差；
   - `wheelSlot` 闭包：在 `astrology-ritual.tsx` 中定义并向下层层透传穿过 `astrology-result-view.tsx` 直达 `astrology-wheel-section.tsx`，仅为了在结果页左侧插槽注入带转场属性的星盘轮。
2. **状态穿透链冗长**：
   - 为了在工作区切到其他模块（八字/紫微/奇门）时停止 WebGL 星渊场景的帧循环（避免后台持续空转 GPU），`isActive` 布尔属性从顶层 `astrology-workspace.tsx` 逐级下传到 `astrology-form.tsx`、`astrology-ritual.tsx`，再传进 `astrology-wheel-scene-switch.tsx`，形成五层穿透链。
3. **视觉口径不一致**：
   - SVG 兜底轮盘在表单预览、仪式揭秘、结果页交接期与入口首页中使用了四套微小差异的 `drop-shadow` 样式，缺乏全局统一权威规范。

这种多层浅包装与插槽穿透带来了严重的接口泄漏：每个消费方都需要理解 WebGL 探测结论、视差互斥条件与激活态透传规则，维护成本高且容易在后续迭代中退化。

---

## 决策

重构将星盘渲染收敛为一个对外接口极简、内部自闭环的高内聚深模块 `<AstrologyWheel />`，并配合独立的共享元素转场外壳 `<AstrologyWheelTransition />`：

### 1. 废除三个浅模块与插槽穿透
- 删除 `astrology-wheel-scene-switch.tsx`；
- 删除 `astrology-wheel-3d.tsx`；
- 彻底删除 `astrology-ritual.tsx` 与 `astrology-result-view.tsx` 中的 `wheelSlot` 闭包与属性透传链；
- 结果页与表单等消费方直接挂载深模块。

### 2. 深模块 `<AstrologyWheel />` 职责内收
深模块对外只暴露星盘事实（`facts`）、交互回调（`selectedBody` / `onSelectBody`）、覆盖配置（`planetOverrides`）与场景模式开关（`scene?: boolean`，默认 `true`）。其内部闭环管理以下机制：
- **能力探测与缓存**：模块级全局缓存 WebGL 探测结果（`webGLCached`），探测仅执行一次，避免多实例重复创建上下文；提供 `preloadWheelScene` 预加载入口；
- **按需分包与加载状态机**：`scene=true` 且探测成功时才异步加载深空 3D 场景；维护 `sceneReady` 与 `scenePainted` 双阶段状态，只有在 3D 场景首帧渲染完毕后才撤下底层的 SVG 兜底轮盘，交接期两套并存无黑屏缝隙；
- **纯矢量展示模式**：`scene=false` 模式（用于入口首页）不触发探测、不拉取 3D chunk，直接渲染纯 SVG 矢量盘面；
- **浑天仪 3D 舞台**：将天球环、呼吸浮动与阻尼指针视差内收；内部根据渲染模式自决视差策略（3D 场景可用时关闭 DOM 视差，交由 WebGL 相机视差接管；兜底或 `scene=false` 时开启 DOM 视差）；
- **激活态内收**：直接在深模块内部调用 `useDestinyWorkspaceStore((s) => s.activeModule === 'astrology')` 订阅当前工作区激活状态，不再需要任何外部组件逐层传递 `isActive`。

### 3. 独立转场外壳 `<AstrologyWheelTransition />`
- 将仪式页到结果页的共享元素转场职责从星盘业务逻辑中抽离；
- 包装在独立组件 `astrology-wheel-transition.tsx` 中，持有 `layoutId="astrology-wheel"` 与 `useReducedMotion` 适配；
- 结果页外层使用 `<AstrologyWheelTransition>` 包裹 `<AstrologyWheel>`，保持转场外壳与仪器测量的正交解耦。

### 4. 兜底阴影归一
- 统一收敛为权威规范类名：
  `relative drop-shadow-[0_18px_42px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.6)]`；
- 无论是在探测期兜底、不支持 WebGL 的降级态，还是表单与结果页，阴影完全一致。

---

## 备选方案及否决理由

1. **方案 A：仅依赖 Canvas 内部的 IntersectionObserver 与 visibilitychange 暂停帧循环，彻底放弃 isActive 语义**：
   - *否决理由*：命运模块（八字、紫微、奇门、星座）采用 `display: none`（常驻 DOM）进行工作区快速切换。虽然 `IntersectionObserver`（threshold 0）在元素切走变为不可见时最终会触发回调，但观察器回调在浏览器微任务/事件循环中有一定延迟，且容器首次挂载到文档时尚未建立稳定视口状态。保留 `isActive` 并将其内收为深模块直接订阅 Zustand store，能实现用户点击切走瞬间“零延迟整帧停摆”，与离屏观察器形成无死角的双保险防御。
2. **方案 B：将转场外壳 `layoutId="astrology-wheel"` 直接烘焙进 `<AstrologyWheel />` 内部**：
   - *否决理由*：星盘深模块不仅服务于结果页，还同时被表单页桌面端预览（`AstrologyForm`）和入口首页展示（`AstrologyEntryHome`）复用。若把 `layoutId` 硬编码在深模块根节点，会导致表单预览大轮与仪式/结果页的星盘发生错误的共享元素动画碰撞。将外壳拆分为 `<AstrologyWheelTransition />`，让转场行为仅按需作用于仪式→结果的过渡阶段，架构职责更加纯粹。

---

## 后果

### 正面收益

- **代码与心智负担显著降低**：彻底删除了 2 个浅包装文件（近 260 行胶水代码）与 1 个穿透 4 层组件的 `wheelSlot` 闭包；
- **接口极简高内聚**：消费方只需声明 `<AstrologyWheel facts={facts} />`，即可开箱即用 3D 舞台、WebGL 探测、平滑交接与后台停帧能力；
- **阴影规范权威统一**：消除了多处微小差异的 `drop-shadow` 偏差，全站星盘视觉语言高度统一；
- **架构完全等价**：DOM 结构、无障碍属性、分包策略、交互行为与单测断言 100% 保持向后兼容。
