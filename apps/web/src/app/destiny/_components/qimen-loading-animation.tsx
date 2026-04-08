'use client';

const doorSymbols = ['休', '生', '伤', '杜', '景', '死', '惊', '开'];
const godSymbols = ['值符', '螣蛇', '太阴', '六合', '勾陈', '朱雀', '九地', '九天'];
const starSymbols = ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心', '天禽'];

function RingSymbols({
  symbols,
  radius,
  badgeClass,
  textClass,
}: {
  symbols: string[];
  radius: number;
  badgeClass: string;
  textClass: string;
}) {
  return (
    <>
      {symbols.map((symbol, idx) => {
        const angle = (idx / symbols.length) * 360;
        const scanDelay = `${(idx * 1.37) % 7.2}s`;
        return (
          <span
            key={`${symbol}-${idx}`}
            className={`relative absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-md border ${badgeClass} ${textClass}`}
            style={{
              width: symbol.length >= 2 ? '46px' : '34px',
              height: '28px',
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)`,
            }}
          >
            {symbol}
            <span
              className="pointer-events-none absolute inset-0 opacity-0 animate-[ringScanFlash_7.2s_linear_infinite]"
              style={{ animationDelay: scanDelay }}
            />
          </span>
        );
      })}
    </>
  );
}

export function QimenLoadingAnimation() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden border-0 bg-transparent py-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(250,249,245,0.34)_0%,rgba(250,249,245,0.18)_38%,rgba(232,230,220,0.16)_100%)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white/24 via-white/16 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/22 via-white/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/18 to-transparent" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(106,155,204,0.12),transparent_56%)]" />

      <div className="pointer-events-none absolute inset-[-18%] animate-[mistDriftA_18s_linear_infinite] bg-[radial-gradient(ellipse_at_20%_30%,rgba(106,155,204,0.12),transparent_46%),radial-gradient(ellipse_at_80%_70%,rgba(120,140,93,0.08),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-[-14%] animate-[mistDriftB_24s_linear_infinite] bg-[radial-gradient(ellipse_at_70%_25%,rgba(106,155,204,0.1),transparent_42%),radial-gradient(ellipse_at_30%_80%,rgba(217,119,87,0.07),transparent_48%)]" />

      <div className="relative mx-auto flex w-full max-w-[760px] flex-col items-center justify-center gap-10">
        <div className="relative flex h-[400px] w-full items-center justify-center">
          <div className="absolute h-[452px] w-[452px] rounded-full border [border-color:rgba(255,255,255,0.2)]" />
          <div className="absolute h-[368px] w-[368px] rounded-full border [border-color:rgba(255,255,255,0.15)]" />
          <div className="absolute h-[292px] w-[292px] rounded-full border [border-color:rgba(255,255,255,0.1)]" />

          <div className="absolute h-[452px] w-[452px] animate-[spin_36s_linear_infinite]">
            <RingSymbols
              symbols={godSymbols}
              radius={220}
              badgeClass="border-[#b9c3ef]/90 bg-[#f7f9ff]/76"
              textClass="text-[12px] font-semibold text-[#6a9bcc]"
            />
          </div>

          <div className="absolute h-[368px] w-[368px] animate-[spin_26s_linear_infinite_reverse]">
            <RingSymbols
              symbols={doorSymbols}
              radius={178}
              badgeClass="border-[#b9c9f0]/90 bg-white/62"
              textClass="text-[13px] font-bold text-[#788c5d]"
            />
          </div>

          <div className="absolute h-[292px] w-[292px] animate-[spin_20s_linear_infinite]">
            <RingSymbols
              symbols={starSymbols}
              radius={140}
              badgeClass="border-[#c4b8ef]/90 bg-[#faf8ff]/78"
              textClass="text-[11px] font-semibold text-[#d97757]"
            />
          </div>

          <div className="absolute h-[1px] w-[410px] bg-gradient-to-r from-transparent via-[#9ab0e8]/70 to-transparent" />
          <div className="absolute h-[410px] w-[1px] bg-gradient-to-b from-transparent via-[#9ab0e8]/70 to-transparent" />

          <div className="absolute h-[170px] w-[170px] rounded-full bg-[radial-gradient(circle,rgba(255,241,190,0.45)_0%,rgba(255,231,159,0.22)_40%,transparent_74%)] animate-[pulse_2.8s_ease-in-out_infinite]" />

          <div className="absolute flex animate-[floatY_3.8s_ease-in-out_infinite] flex-col items-center justify-center gap-0 text-center">
            {['奇', '门', '遁', '甲'].map((char, idx) => (
              <span
                key={char}
                className="text-[66px] leading-[0.86] font-semibold tracking-[0.14em] text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#D4AF37_0%,#B8860B_48%,#8B6914_100%)] opacity-0"
                style={{
                  animation:
                    'goldBreath 2.6s ease-in-out infinite, charAppear 4.2s ease-out infinite',
                  animationDelay: `${idx * 0.25}s, ${idx * 0.42}s`,
                }}
              >
                {char}
              </span>
            ))}
          </div>
        </div>

        <div className="relative text-center">
          <p className="text-[16px] font-medium text-[#6a9bcc]">奇门盘局推演中...</p>
          <p className="mt-1 text-[14px] text-[#b0aea5]">
            按八神、八门、九星分环演化，生成可追溯策略建议
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes goldBreath {
          0%,
          100% {
            text-shadow: 0 0 1px rgba(184, 134, 11, 0.2);
            filter: brightness(0.96);
          }
          50% {
            text-shadow: 0 0 1px rgba(184, 134, 11, 0.2);
            filter: brightness(1.05);
          }
        }

        @keyframes floatY {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }

        @keyframes charAppear {
          0%,
          8% {
            opacity: 0;
            transform: translateY(10px) scale(0.92);
            filter: blur(2px);
          }
          16%,
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes ringScanFlash {
          0%,
          92%,
          100% {
            opacity: 0;
            transform: translateX(-115%);
          }
          94% {
            opacity: 0.7;
            background: linear-gradient(
              100deg,
              transparent 0%,
              rgba(255, 255, 255, 0.07) 35%,
              rgba(168, 188, 245, 0.78) 50%,
              rgba(255, 255, 255, 0.07) 65%,
              transparent 100%
            );
            transform: translateX(0%);
          }
          96% {
            opacity: 0;
            transform: translateX(115%);
          }
        }

        @keyframes mistDriftA {
          0% {
            transform: translate3d(-3%, -2%, 0) scale(1);
            opacity: 0.62;
          }
          50% {
            transform: translate3d(2%, 1.5%, 0) scale(1.03);
            opacity: 0.8;
          }
          100% {
            transform: translate3d(-3%, -2%, 0) scale(1);
            opacity: 0.62;
          }
        }

        @keyframes mistDriftB {
          0% {
            transform: translate3d(2%, 2%, 0) scale(1.02);
            opacity: 0.5;
          }
          50% {
            transform: translate3d(-2%, -1.5%, 0) scale(1);
            opacity: 0.7;
          }
          100% {
            transform: translate3d(2%, 2%, 0) scale(1.02);
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
