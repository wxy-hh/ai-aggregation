'use client';

// ═══════════════════════════════════════════════════════════════
//  星座寰宇「夜幕观星」紫金双调星云
//  - 3 处呼吸光斑（紫微 / 恒星金 / 靛蓝深空），错相位避免同频机械感
//  - 透明度克制（≤0.14）：星云是底色氛围，不能与星点/卡片争视觉
//  - 动画集中在 globals.css 的 .astrology-night-nebula，reduced-motion 下静止
// ═══════════════════════════════════════════════════════════════

/** 夜幕星云：absolute 铺满夜幕容器，仅装饰不参与交互 */
export function AstrologyNightNebula() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* 紫微星云（左上，16s 主呼吸） */}
      <div
        className="astrology-night-nebula absolute -left-32 -top-32 h-96 w-96 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.14) 0%, rgba(99,60,200,0.05) 45%, transparent 70%)',
        }}
      />
      {/* 恒星金星云（右下，20s 延迟反向相位，玄学金调只作余晖） */}
      <div
        className="astrology-night-nebula absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(231,200,115,0.10) 0%, rgba(180,140,60,0.04) 45%, transparent 70%)',
          animationDuration: '20s',
          animationDelay: '5s',
        }}
      />
      {/* 靛蓝深空星云（中部偏右，24s 最慢一档，压纵深） */}
      <div
        className="astrology-night-nebula absolute right-1/4 top-1/3 h-80 w-80 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(76,99,210,0.12) 0%, rgba(50,60,140,0.05) 50%, transparent 75%)',
          animationDuration: '24s',
          animationDelay: '9s',
        }}
      />
    </div>
  );
}
