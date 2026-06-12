// tailwind.config.js - 玻璃拟态与柔光阴影系统 TailwindCSS 主题配置扩展段
// 请将本配置合并到项目对应的 tailwind.config.js 的 module.exports.theme.extend 中

module.exports = {
  theme: {
    extend: {
      // 1. 扩展背景模糊等级，定义三级标准的玻璃模糊参数
      backdropBlur: {
        xs: '4px',
        md: '8px',     // G-1 轻量级玻璃材质（模糊度 8px）
        xl: '20px',    // G-2 标准级玻璃材质（模糊度 20px）
        '2xl': '40px',  // G-3 深度级玻璃材质（模糊度 40px）
      },
      // 2. 扩展多层柔光阴影体系 (Z-0 至 Z-5)
      // 遵循 Shadow_Total = Shadow_Directional (主定向投影) + Shadow_Ambient (环境漫反射) + Glow_Inner (内高光) 模型
      boxShadow: {
        // Z-1 层级：平贴微悬。适用于侧边栏二级交互按钮、输入框。
        'sm-glass': '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 1px 0 rgba(0, 0, 0, 0.02)',
        
        // Z-2 层级：正常悬起。适用于常规内容卡片、文件项目等。
        'md-glass': '0 4px 12px -2px rgba(15, 23, 42, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.03)',
        
        // Z-3 层级：中度浮空。适用于推荐指令卡、悬浮小部件、导航栏。
        'lg-glass': '0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.04)',
        
        // Z-4 层级：深度悬浮。适用于大尺寸 Hero 主视觉卡片、下拉选择框面板。
        'xl-glass': '0 20px 40px -15px rgba(59, 130, 246, 0.12), 0 8px 20px -10px rgba(0, 0, 0, 0.05)',
        
        // Z-5 层级：顶级覆盖。适用于模态框弹窗、抽屉式侧边栏、气泡通知。
        // 精密叠加了 Z-5 级指向性阴影、蓝色柔光散射背光和 1px 顶部半透明白色内发光
        '2xl-glass': '0 30px 60px -20px rgba(15, 23, 42, 0.25), 0 10px 30px -15px rgba(59, 130, 246, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
      },
      // 3. 自定义物理渐变与发光过渡曲线，提供高级阻尼手感
      transitionTimingFunction: {
        'smooth-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)', // 交互瞬间快速响应，随后自然减速柔和收尾
      }
    },
  },
  plugins: [],
}
