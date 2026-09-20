// 星座寰宇符号集：十星体 + 十二星座经典西洋占星符号
// 全部以 stroke 几何手绘（viewBox 24，strokeWidth 1.7），currentColor 继承上下文色，
// 避免 Unicode 占星字符在部分系统字体缺字形的问题；供星盘轮、事实卡、分享卡复用。

import type { ComponentType, SVGProps } from 'react';

/** 符号即 SVG：支持嵌套进星盘轮（x/y/width/height）与独立使用（className 着色） */
export type AstrologyGlyphProps = SVGProps<SVGSVGElement>;

type GlyphComponent = ComponentType<AstrologyGlyphProps>;

function createGlyph(paths: string[], filledDots: Array<[number, number, number]> = []): GlyphComponent {
  return function AstrologyGlyph(props: AstrologyGlyphProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
        {filledDots.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
        ))}
      </svg>
    );
  };
}

/* ═══════════════ 十星体 ═══════════════ */

/** 太阳：圆环 + 中心点 */
export const SunGlyph = createGlyph(
  ['M17.2 12 A5.2 5.2 0 1 1 6.8 12 A5.2 5.2 0 1 1 17.2 12 Z'],
  [[12, 12, 1.2]]
);

/** 月亮：新月（外弧左凸、内弧右凹） */
export const MoonGlyph = createGlyph([
  'M15.8 3.6 A9.2 9.2 0 1 0 15.8 20.4 A7.4 7.4 0 1 1 15.8 3.6 Z',
]);

/** 水星：圆 + 顶双角弧 + 底十字 */
export const MercuryGlyph = createGlyph([
  'M7.6 6.4 A4.8 4.8 0 0 1 16.4 6.4',
  'M15.9 10.6 A3.9 3.9 0 1 1 8.1 10.6 A3.9 3.9 0 1 1 15.9 10.6 Z',
  'M12 14.5 V20.6',
  'M8.9 17.6 H15.1',
]);

/** 金星：圆 + 底十字 */
export const VenusGlyph = createGlyph([
  'M16.4 9.6 A4.4 4.4 0 1 1 7.6 9.6 A4.4 4.4 0 1 1 16.4 9.6 Z',
  'M12 14 V20.8',
  'M8.8 17.4 H15.2',
]);

/** 火星：圆 + 右上箭头 */
export const MarsGlyph = createGlyph([
  'M14.8 13.6 A4.4 4.4 0 1 1 6 13.6 A4.4 4.4 0 1 1 14.8 13.6 Z',
  'M13.6 10.4 L19.6 4.4',
  'M19.6 8.6 V4.4 H15.4',
]);

/** 木星：左弧（花体 2 形）+ 右竖 + 中横 */
export const JupiterGlyph = createGlyph([
  'M5.8 16.2 A5.4 5.4 0 0 1 11.2 4.4',
  'M14.6 3.6 V20.4',
  'M10.2 12.4 H19.4',
]);

/** 土星：左竖 + 右上 h 弧 + 顶横 */
export const SaturnGlyph = createGlyph([
  'M8.2 3.6 V20.4',
  'M8.2 11 A4.6 4.6 0 0 1 17.4 15.6 V20.4',
  'M5.2 6.8 H12.2',
]);

/** 天王星：两侧括弧 + 中竖 + 中圆点 */
export const UranusGlyph = createGlyph(
  [
    'M6 4.4 C4.2 9.8 4.2 14.2 6 17.6',
    'M18 4.4 C19.8 9.8 19.8 14.2 18 17.6',
    'M12 3.4 V20.6',
  ],
  [[12, 12, 2.1]]
);

/** 海王星：三叉戟（底弧连左右齿）+ 底十字 */
export const NeptuneGlyph = createGlyph([
  'M6 3.4 V8.2 A6 6 0 0 0 18 8.2 V3.4',
  'M12 3.4 V20.6',
  'M8.8 16.6 H15.2',
]);

/** 冥王星：半圆罩 + 内圆 + 底竖 */
export const PlutoGlyph = createGlyph([
  'M6.2 13.4 A5.8 5.8 0 0 1 17.8 13.4',
  'M14.9 9.4 A2.9 2.9 0 1 1 9.1 9.4 A2.9 2.9 0 1 1 14.9 9.4 Z',
  'M12 12.3 V20.6',
]);

/* ═══════════════ 十二星座 ═══════════════ */

/** 白羊座：双弧羊角，汇于中点 */
export const AriesGlyph = createGlyph([
  'M6.8 19.5 C6.8 10.5 9.6 6.4 12 10.2 C14.4 6.4 17.2 10.5 17.2 19.5',
]);

/** 金牛座：圆 + 顶上挑双角弧 */
export const TaurusGlyph = createGlyph([
  'M16.6 14.6 A4.6 4.6 0 1 1 7.4 14.6 A4.6 4.6 0 1 1 16.6 14.6 Z',
  'M6.2 9.4 A6.2 6.2 0 0 1 17.8 9.4',
]);

/** 双子座：罗马 II + 上下弧横 */
export const GeminiGlyph = createGlyph([
  'M6.6 4.6 C9.4 6.2 14.6 6.2 17.4 4.6',
  'M6.6 19.4 C9.4 17.8 14.6 17.8 17.4 19.4',
  'M9.2 5.4 V18.6',
  'M14.8 5.4 V18.6',
]);

/** 巨蟹座：双圆互扣（6/9 形）+ 对弧 */
export const CancerGlyph = createGlyph([
  'M11.7 8.8 A3.1 3.1 0 1 1 5.5 8.8 A3.1 3.1 0 1 1 11.7 8.8 Z',
  'M18.5 15.2 A3.1 3.1 0 1 1 12.3 15.2 A3.1 3.1 0 1 1 18.5 15.2 Z',
  'M18.8 6.6 C15.2 3.4 9.4 3.6 6.2 7.4',
  'M5.2 17.4 C8.8 20.6 14.6 20.4 17.8 16.6',
]);

/** 狮子座：小圆 + S 形大尾 */
export const LeoGlyph = createGlyph([
  'M11.8 8.6 A3 3 0 1 1 5.8 8.6 A3 3 0 1 1 11.8 8.6 Z',
  'M8.8 11.6 C8.8 15.6 5.8 16.6 6.4 20.2',
  'M11.6 6.8 C15.8 6 17.4 10.4 14.4 13.4',
]);

/** 处女座：m 三竖双拱 + 右尾内收 */
export const VirgoGlyph = createGlyph([
  'M5.6 5 V15.5',
  'M5.6 7.8 A2.8 2.8 0 0 1 11.2 7.8 V15.5',
  'M11.2 7.8 A2.8 2.8 0 0 1 16.8 7.8 V15.5',
  'M16.8 10 C18.6 13.4 18.2 17.4 15.6 20.2',
]);

/** 天秤座：经典的圆弧悬于基座横线之上，比例平衡对称 */
export const LibraGlyph = createGlyph([
  'M5 18.5 H19',
  'M5 14 H7.2 A4.8 4.8 0 1 1 16.8 14 H19',
]);

/** 天蝎座：经典占星图腾（m 三竖双拱 + 尾端上扬箭尾） */
export const ScorpioGlyph = createGlyph([
  'M5.2 5 V15.5',
  'M5.2 7.8 A2.8 2.8 0 0 1 10.8 7.8 V15.5',
  'M10.8 7.8 A2.8 2.8 0 0 1 16.4 7.8 V13.4',
  'M16.4 13.4 C16.4 17.2 15.2 19.4 12.6 21.2',
  'M15.8 21 L12.6 21.2 L13.2 18',
]);

/** 射手座：斜箭 + 横杠交叉 */
export const SagittariusGlyph = createGlyph([
  'M5.5 18.5 L18.5 5.5',
  'M18.5 11.4 V5.5 H12.6',
  'M8 9 L15.5 16.5',
]);

/** 摩羯座：经典古占星图腾（海山羊角与卷尾） */
export const CapricornGlyph = createGlyph([
  'M6 5.5 V15.5',
  'M6 9 A3.5 3.5 0 0 1 13 9 V16 C13 19 16 20.5 18 19 C20 17.5 19 14.5 17 14.5 C15 14.5 14 16.5 15.5 18.5',
]);

/** 水瓶座：两行波浪折线 */
export const AquariusGlyph = createGlyph([
  'M4.4 9 C6.2 6.4 7.6 6.4 9.4 9 C11.2 11.6 12.6 11.6 14.4 9 C16.2 6.4 17.6 6.4 19.4 9',
  'M4.4 17.6 C6.2 15 7.6 15 9.4 17.6 C11.2 20.2 12.6 20.2 14.4 17.6 C16.2 15 17.6 15 19.4 17.6',
]);

/** 双鱼座：双弧背对 + 中横 */
export const PiscesGlyph = createGlyph([
  'M7.4 4.6 C4.2 9 4.2 15 7.4 19.4',
  'M16.6 4.6 C19.8 9 19.8 15 16.6 19.4',
  'M5 12 H19',
]);
