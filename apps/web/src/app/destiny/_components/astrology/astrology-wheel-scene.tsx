'use client';

/**
 * astrology-wheel-scene.tsx —— 「星渊」WebGL 深空星盘场景（结果页视觉主角）
 *
 * 把星盘从「一张平面图」升级为「一扇望向深空的窗」：
 * - 七层纵深：深渊底色 → FBM 星云气 → 三层视差星野（独立闪烁相位）→ 压暗窗盘
 *   → 黄道玻璃蚀刻环（四元素扇区）→ 相位能量弧 → 十星自发光宝珠（真实 bloom 溢光）
 * - 动效编排：入场相机推近（影院揭幕）、指针视差、宝珠错峰呼吸、相位流光、
 *   盘心星核涟漪、偶发流星、选中超新星冲击波 + 寻星雷达环
 * - 事实纪律：行星角度/相位几何全部来自 wheel-scene-layout（与 SVG 轮同一口径），
 *   装饰层（星野/星云/流星）永远不参与事实表达
 * - 降级链：WebGL 不可用 / 组件加载中 → 调用方回退 SVG 轮；
 *   prefers-reduced-motion → 静态构图（无漂浮/无视差/无闪烁/无入场）
 * - 容器圆形裁切（rounded-full）：无论主题明暗，星盘始终是圆形深空之窗
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useStore, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { motion, useReducedMotion } from 'framer-motion';
import type { AstrologyChartFacts, PlanetBody, ZodiacSign } from '@/lib/astrology/chart-facts';
import { PLANET_CN, ZODIAC_CN } from '@/lib/astrology/zh-names';
import {
  ASPECT_DIM_COLOR,
  ELEMENT_COLOR,
  ORB_PALETTE,
  SCENE_R,
  buildWheelSceneLayout,
  wr,
  type PlanetNode3D,
  type WheelSceneLayout,
} from '@/lib/astrology/wheel-scene-layout';
import { PLANET_GLYPH, ZODIAC_GLYPH } from './astrology-chart-wheel';
import { cn } from '@/lib/utils';

/* ---------- 确定性伪随机（星野排布必须帧间/端间一致，禁止 Math.random） ---------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 程序化贴图（零外部资源，导出/截图稳定） ---------- */

const textureCache = new Map<string, THREE.CanvasTexture>();

/** 径向光晕贴图：中心亮核 → 边缘透明（宝珠日冕/星核柔光共用） */
function getGlowTexture(hex: string): THREE.CanvasTexture {
  const key = `glow-${hex}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.38)`);
  grad.addColorStop(0.68, `rgba(${r},${g},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** 深渊底色贴图：盘心可见深蓝 → 边缘近黑（穹顶纵深，非纯黑黑板） */
function getAbyssTexture(): THREE.CanvasTexture {
  const hit = textureCache.get('abyss');
  if (hit) return hit;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.44, 0, size / 2, size / 2, size * 0.62);
  grad.addColorStop(0, '#101B40');
  grad.addColorStop(0.42, '#0C142F');
  grad.addColorStop(0.72, '#070D22');
  grad.addColorStop(1, '#040713');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set('abyss', tex);
  return tex;
}

/** 压暗窗盘贴图：盘内星野柔化（保证相位/刻度可读），边缘完全透明融入环带 */
function getDimDiscTexture(): THREE.CanvasTexture {
  const hit = textureCache.get('dim-disc');
  if (hit) return hit;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(9,14,36,0.62)');
  grad.addColorStop(0.62, 'rgba(8,12,32,0.48)');
  grad.addColorStop(0.85, 'rgba(6,10,26,0.18)');
  grad.addColorStop(1, 'rgba(6,10,26,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set('dim-disc', tex);
  return tex;
}

/** 流星拖尾贴图：头部亮白 → 尾部透明（水平线性渐变） */
function getMeteorTexture(): THREE.CanvasTexture {
  const hit = textureCache.get('meteor');
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(226,232,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set('meteor', tex);
  return tex;
}

/* ---------- 星野着色器（每颗星独立闪烁相位/频率，点精灵软圆） ---------- */

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aFreq;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    // 闪烁：sin 相位错峰，亮度在 0.25~1.0 间呼吸
    float tw = sin(uTime * aFreq + aPhase) * 0.5 + 0.5;
    vAlpha = 0.25 + 0.75 * tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.04, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** 单层星野：BufferGeometry + ShaderMaterial，环形区域均匀散布 */
function StarLayer({
  count,
  size,
  seed,
  zMin,
  zMax,
  radius,
  opacity,
  reduceMotion,
}: {
  count: number;
  size: number;
  seed: number;
  zMin: number;
  zMax: number;
  radius: number;
  opacity: number;
  reduceMotion: boolean;
}) {
  const dpr = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    const rng = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const aSize = new Float32Array(count);
    const aPhase = new Float32Array(count);
    const aFreq = new Float32Array(count);
    const aColor = new Float32Array(count * 3);
    const cWhite = new THREE.Color('#FFFFFF');
    const cIndigo = new THREE.Color('#C7D2FE');
    const cGold = new THREE.Color('#FDE68A');
    for (let i = 0; i < count; i++) {
      const r = radius * Math.sqrt(rng());
      const theta = rng() * Math.PI * 2;
      pos[i * 3] = r * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(theta);
      pos[i * 3 + 2] = zMin + rng() * (zMax - zMin);
      aSize[i] = size * (0.7 + rng() * 0.6);
      aPhase[i] = rng() * Math.PI * 2;
      aFreq[i] = 0.35 + rng() * 1.1;
      // 78% 冷白 / 14% 靛蓝 / 8% 暖金——深空色温层次
      const roll = rng();
      const c = roll < 0.78 ? cWhite : roll < 0.92 ? cIndigo : cGold;
      aColor[i * 3] = c.r;
      aColor[i * 3 + 1] = c.g;
      aColor[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute('aFreq', new THREE.BufferAttribute(aFreq, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    return geo;
  }, [count, size, seed, zMin, zMax, radius]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uOpacity: { value: opacity } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [opacity]
  );

  useEffect(() => {
    material.uniforms.uPixelRatio.value = dpr;
  }, [dpr, material]);

  useFrame(({ clock }) => {
    if (!reduceMotion) material.uniforms.uTime.value = clock.elapsedTime;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return <points geometry={geometry} material={material} />;
}

/** 三层视差星野 + 整体超慢自转（远层小而密、近层大而疏） */
function DeepStarfield({ compact, reduceMotion }: { compact: boolean; reduceMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!reduceMotion && group.current) group.current.rotation.z += delta * 0.004;
  });
  return (
    <group ref={group}>
      <StarLayer count={compact ? 760 : 1500} size={1.7} seed={11} zMin={-3.4} zMax={-2.2} radius={6.9} opacity={0.5} reduceMotion={reduceMotion} />
      <StarLayer count={compact ? 380 : 780} size={2.7} seed={47} zMin={-2.0} zMax={-0.8} radius={6.4} opacity={0.72} reduceMotion={reduceMotion} />
      <StarLayer count={compact ? 110 : 230} size={4.3} seed={83} zMin={-0.6} zMax={1.0} radius={5.9} opacity={0.92} reduceMotion={reduceMotion} />
    </group>
  );
}

/* ---------- 星云气（FBM 噪声，三团色雾缓慢漂移——神秘感的核心） ---------- */

const NEBULA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
  void main() {
    // 极缓漂移，60~90s 一周期的云气流动
    vec2 uv = vUv * 3.0 + vec2(uTime * 0.006, -uTime * 0.004);
    float n1 = fbm(uv);
    float n2 = fbm(uv * 1.4 + 7.3 - uTime * 0.005);
    float n3 = fbm(uv * 1.1 + 3.1 + uTime * 0.003);
    // 三团色雾：左上靛蓝、右下玫瑰金、右中青蓝（位置/强度克制，保持神秘而非艳丽）
    float b1 = smoothstep(0.62, 0.18, distance(vUv, vec2(0.30, 0.72))) * smoothstep(0.35, 0.75, n1);
    float b2 = smoothstep(0.58, 0.16, distance(vUv, vec2(0.74, 0.26))) * smoothstep(0.38, 0.78, n2);
    float b3 = smoothstep(0.46, 0.12, distance(vUv, vec2(0.70, 0.62))) * smoothstep(0.42, 0.8, n3);
    vec3 color = vec3(0.30, 0.36, 0.92) * b1 * 0.34 + vec3(0.92, 0.55, 0.28) * b2 * 0.24 + vec3(0.25, 0.55, 0.95) * b3 * 0.16;
    float alpha = clamp(b1 * 0.34 + b2 * 0.24 + b3 * 0.16, 0.0, 0.5);
    // 径向羽化：边缘透明，星云自然沉入深渊
    float rim = smoothstep(0.98, 0.55, distance(vUv, vec2(0.5)));
    gl_FragColor = vec4(color * rim, alpha * rim);
  }
`;

function NebulaVeil({ reduceMotion }: { reduceMotion: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );
  useFrame(({ clock }) => {
    if (!reduceMotion) material.uniforms.uTime.value = clock.elapsedTime;
  });
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[0, 0, -5.6]} renderOrder={-9}>
      <planeGeometry args={[15, 15]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/* ---------- 深渊底色 + 压暗窗盘（深空之窗的「玻璃」） ---------- */

function AbyssWindow() {
  const abyss = getAbyssTexture();
  const dim = getDimDiscTexture();
  return (
    <>
      <mesh position={[0, 0, -6]} renderOrder={-10}>
        <planeGeometry args={[15.2, 15.2]} />
        <meshBasicMaterial map={abyss} depthWrite={false} />
      </mesh>
      {/* 盘内压暗：星野透出但柔化，保证事实层可读 */}
      <mesh position={[0, 0, -0.2]} renderOrder={-1}>
        <circleGeometry args={[5.0, 64]} />
        <meshBasicMaterial map={dim} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

/* ---------- 工具：圆周采样点（drei Line 用） ---------- */

function circlePoints(r: number, z: number, segments = 96): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return pts;
}

/* ---------- 黄道仪环：玻璃蚀刻环带 + 四元素扇区 + 金刻刻度 + 星座星符 ---------- */

function ZodiacRing({
  layout,
  selectedBody,
  onSelectBody,
}: {
  layout: WheelSceneLayout;
  selectedBody: PlanetBody | null;
  onSelectBody?: (body: PlanetBody | null) => void;
}) {
  /** 各星座扇区内的行星（扇区点选 = 选中该宫行星，与 SVG 轮同交互） */
  const planetBySign = useMemo(() => {
    const m = new Map<ZodiacSign, PlanetBody>();
    for (const p of layout.planets) if (!m.has(p.sign)) m.set(p.sign, p.body);
    return m;
  }, [layout.planets]);
  const selectedSign = selectedBody ? layout.planets.find((p) => p.body === selectedBody)?.sign ?? null : null;

  /** 60 刻度合并为一次绘制（主刻度流金、副刻度冷白，顶点色区分） */
  const tickData = useMemo(() => {
    const pts: [number, number, number][] = [];
    const colors: [number, number, number][] = [];
    const major = new THREE.Color('#F5D486');
    const minor = new THREE.Color('#9AA3C7');
    for (const t of layout.ticks) {
      pts.push(t.line[0], t.line[1]);
      const c = t.major ? major : minor;
      colors.push([c.r, c.g, c.b], [c.r, c.g, c.b]);
    }
    return { pts, colors };
  }, [layout.ticks]);

  const boundaryPts = useMemo(() => layout.signs.flatMap((s) => [s.boundary[0], s.boundary[1]]), [layout.signs]);

  return (
    <group>
      {/* 环带底衬：深空藏蓝，承接扇区微光 */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[wr(SCENE_R.zodiacIn), wr(SCENE_R.zodiacOut), 128]} />
        <meshBasicMaterial color="#0A1128" transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* 十二扇区：四元素低饱和晶体，选中行星所属星座注光点亮 */}
      {layout.signs.map((s) => {
        const active = selectedSign === s.sign;
        const pickable = planetBySign.has(s.sign);
        return (
          <mesh
            key={s.sign}
            position={[0, 0, 0.02]}
            onClick={
              pickable
                ? (e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    const body = planetBySign.get(s.sign)!;
                    onSelectBody?.(selectedBody === body ? null : body);
                  }
                : undefined
            }
            onPointerOver={pickable ? () => { document.body.style.cursor = 'pointer'; } : undefined}
            onPointerOut={pickable ? () => { document.body.style.cursor = ''; } : undefined}
          >
            <ringGeometry args={[wr(SCENE_R.zodiacIn), wr(SCENE_R.zodiacOut), 16, 1, s.phiStart, s.phiLength]} />
            <meshBasicMaterial
              color={ELEMENT_COLOR[s.element]}
              transparent
              opacity={active ? 0.2 : 0.055}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      {/* 环带流金发丝线（内外沿 + 宫位圈） */}
      <Line points={circlePoints(wr(SCENE_R.zodiacOut), 0.08)} color="#F5D486" transparent opacity={0.32} lineWidth={1.1} />
      <Line points={circlePoints(wr(SCENE_R.zodiacIn), 0.08)} color="#F5D486" transparent opacity={0.22} lineWidth={0.9} />
      {layout.withHouses && layout.houses.length === 12 && (
        <Line points={circlePoints(wr(SCENE_R.houseIn), 0.05)} color="#F5D486" transparent opacity={0.2} lineWidth={0.8} />
      )}
      {/* 窗缘环：深空之窗的金色框线 */}
      <Line points={circlePoints(wr(276), 0.1, 128)} color="#F5D486" transparent opacity={0.45} lineWidth={1.4} />
      {/* 宫界线 + 60 刻度 */}
      <Line segments points={boundaryPts} color="#F5D486" transparent opacity={0.4} lineWidth={0.9} />
      <Line segments points={tickData.pts} vertexColors={tickData.colors} transparent opacity={0.6} lineWidth={0.9} />
      {/* 十二星座黄金星符（HTML 浮层保证矢量锐利；选中星座注光） */}
      {layout.signs.map((s) => {
        const Glyph = ZODIAC_GLYPH[s.sign];
        const active = selectedSign === s.sign;
        return (
          <Html key={`glyph-${s.sign}`} position={s.glyphPosition} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div
              aria-hidden
              style={{
                width: 20,
                height: 20,
                color: '#FDE68A',
                opacity: active ? 1 : 0.82,
                filter: active
                  ? 'drop-shadow(0 0 7px rgba(245,158,11,0.9))'
                  : 'drop-shadow(0 1px 3px rgba(0,0,0,0.85))',
                transition: 'opacity 300ms, filter 300ms',
              }}
            >
              <Glyph width={20} height={20} />
            </div>
          </Html>
        );
      })}
    </group>
  );
}

/* ---------- 宫位界与上升/天顶轴线（仅完整盘） ---------- */

function HousesAndAxes({ layout }: { layout: WheelSceneLayout }) {
  if (!layout.withHouses) return null;
  return (
    <group>
      {layout.houses.length === 12 && (
        <>
          <Line segments points={layout.houses.flatMap((h) => [h.boundary[0], h.boundary[1]])} color="#F5D486" transparent opacity={0.22} lineWidth={0.8} />
          {layout.houses.map((h) => (
            <Html key={`house-${h.number}`} position={h.numberPosition} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
              <div
                aria-hidden
                className="text-[10px] font-bold tabular-nums"
                style={{ color: 'rgba(252,211,119,0.75)', textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}
              >
                {h.number}
              </div>
            </Html>
          ))}
        </>
      )}
      {layout.axes.map((a) => (
        <group key={a.kind}>
          <Line points={a.line} color="#FBBF24" transparent opacity={0.85} lineWidth={1.8} />
          <Html position={a.labelPosition} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
            <div
              aria-hidden
              className="whitespace-nowrap text-[11px] font-bold tracking-widest"
              style={{ color: '#FCD34D', textShadow: '0 1px 5px rgba(0,0,0,0.95), 0 0 8px rgba(251,191,36,0.5)' }}
            >
              {a.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/* ---------- 相位能量弧：默认低饱和降噪，选中点亮 + 流光脉冲 ---------- */

/** 沿弧行进的光点（能量脉冲），reduceMotion 时不渲染 */
function FlowDot({ points, color, offset }: { points: [number, number, number][]; color: string; offset: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = (clock.elapsedTime * 0.085 + offset) % 1;
    const fi = t * (points.length - 1);
    const i = Math.min(Math.floor(fi), points.length - 2);
    const f = fi - i;
    const a = points[i];
    const b = points[i + 1];
    m.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f + 0.02);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.04, 10, 10]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function AspectArcs({
  layout,
  selectedBody,
  reduceMotion,
}: {
  layout: WheelSceneLayout;
  selectedBody: PlanetBody | null;
  reduceMotion: boolean;
}) {
  return (
    <group>
      {layout.aspects.map((a, i) => {
        const connected = selectedBody != null && (a.source === selectedBody || a.target === selectedBody);
        const color = connected && selectedBody ? ORB_PALETTE[selectedBody].glow : ASPECT_DIM_COLOR;
        const opacity = selectedBody == null ? 0.5 : connected ? 0.95 : 0.18;
        return (
          <group key={a.key}>
            <Line
              points={a.points}
              color={color}
              transparent
              opacity={opacity}
              lineWidth={connected ? 1.7 : 1}
              dashed={a.type === 'sextile'}
              dashSize={0.1}
              gapSize={0.14}
            />
            {/* 流光：无选中时全场微光穿行，选中时只保留相连相位的同色脉冲 */}
            {!reduceMotion && (selectedBody == null || connected) && (
              <FlowDot points={a.points} color={connected && selectedBody ? ORB_PALETTE[selectedBody].glow : '#FDE68A'} offset={i * 0.17} />
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ---------- 选中标记：克制的「就是这颗」——一圈恒亮细环 + 单次柔波 + 慢速雷达环 ----------
 * 设计纪律：高级感来自克制，不堆砌冲击波/星芒/伴星等刻意元素 */

/** 一次性柔波（选中瞬间向外扩散即隐；key 重挂载即重播） */
function Shockwave({ radius, delay, color }: { radius: number; delay: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    const mt = mat.current;
    if (!m || !mt) return;
    const t = clock.elapsedTime - (m.userData.t0 ??= clock.elapsedTime) - delay;
    if (t < 0) return;
    const p = Math.min(1, t / 0.8);
    const eased = 1 - Math.pow(1 - p, 3);
    const s = 0.26 + eased * (radius - 0.26);
    m.scale.set(s, s, 1);
    mt.opacity = (1 - eased) * 0.5;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.05]} scale={[0.26, 0.26, 1]}>
      <ringGeometry args={[0.92, 1, 48]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SelectionFX({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const radar = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (reduceMotion) return;
    // 雷达环 16s 极慢公转：可感知但不喧哗
    if (radar.current) radar.current.rotation.z = (clock.elapsedTime * Math.PI * 2) / 16;
  });
  return (
    <group>
      {!reduceMotion && <Shockwave radius={0.8} delay={0} color={color} />}
      {/* 恒亮细环（唯一常驻选中标记） */}
      <Line points={circlePoints(0.36, 0.06, 48)} color={color} transparent opacity={0.9} lineWidth={1.4} />
      {/* 寻星雷达：单层虚线环，极慢公转 */}
      <group ref={radar} position={[0, 0, 0.04]}>
        <Line points={circlePoints(0.5, 0, 48)} color={color} transparent opacity={0.5} lineWidth={0.9} dashed dashSize={0.07} gapSize={0.1} />
      </group>
    </group>
  );
}

/* ---------- 十星宝珠：自发光球体 + 日冕光晕 + 错峰呼吸 + 触达热区 ---------- */

function PlanetOrb({
  node,
  index,
  selected,
  dimmed,
  hovered,
  reduceMotion,
  onSelectBody,
  onHover,
}: {
  node: PlanetNode3D;
  index: number;
  selected: boolean;
  dimmed: boolean;
  hovered: boolean;
  reduceMotion: boolean;
  onSelectBody?: (body: PlanetBody | null) => void;
  onHover: (body: PlanetBody | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const palette = ORB_PALETTE[node.body];
  const Glyph = PLANET_GLYPH[node.body];
  const orbR = node.body === 'sun' ? 0.27 : node.body === 'moon' ? 0.24 : 0.21;
  // 选中仅轻微增亮（1.18）：高级感来自克制，不靠爆发式增光
  const glowScale = (node.body === 'sun' ? 2.1 : node.body === 'moon' ? 1.8 : 1.55) * (selected ? 1.18 : 1);

  /** 阻尼追随的布局基位：override 变化（表单太阳滑向真实星座）时平滑滑入而非瞬移；
      稳态时即刻收敛，呼吸偏移不受影响 */
  const base = useRef<[number, number, number]>(node.position);

  /** 呼吸：Z 向悬浮 + XY 微漂移（错峰相位），选中/悬停不停（保持可点） */
  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g || reduceMotion) return;
    const b = base.current;
    b[0] = THREE.MathUtils.damp(b[0], node.position[0], 3.2, delta);
    b[1] = THREE.MathUtils.damp(b[1], node.position[1], 3.2, delta);
    b[2] = THREE.MathUtils.damp(b[2], node.position[2], 3.2, delta);
    const t = clock.elapsedTime;
    g.position.z = b[2] + Math.sin(t * node.breatheSpeed + node.breathePhase) * 0.045;
    g.position.x = b[0] + Math.sin(t * 0.55 + node.breathePhase * 1.3) * 0.014;
    g.position.y = b[1] + Math.cos(t * 0.62 + node.breathePhase) * 0.014;
  });

  const degreeLocal: [number, number, number] = [
    node.degreeLabelPosition[0] - node.position[0],
    node.degreeLabelPosition[1] - node.position[1],
    0.05,
  ];

  return (
    // position 取阻尼基位而非 node.position：布局变化（太阳滑动）时不瞬移，位移由 useFrame 阻尼驱动；
    // 减少动态时不跑 useFrame，直接跟随最新布局位（瞬时到位）
    <group ref={group} position={reduceMotion ? node.position : base.current}>
      {/* 日冕光晕（加色混合柔光精灵，bloom 二次溢光） */}
      <sprite scale={[glowScale, glowScale, 1]} position={[0, 0, -0.02]}>
        <spriteMaterial
          map={getGlowTexture(palette.glow)}
          transparent
          opacity={dimmed ? 0.28 : selected ? 0.95 : 0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {/* 宝珠本体：自发光天体 */}
      <mesh>
        <sphereGeometry args={[orbR, 32, 32]} />
        <meshStandardMaterial
          color={palette.base}
          emissive={palette.emissive}
          emissiveIntensity={selected ? 2.2 : node.body === 'sun' ? 2.1 : 1.55}
          roughness={0.3}
          metalness={0.12}
          transparent
          opacity={dimmed ? 0.55 : 1}
        />
      </mesh>
      {/* 土星光环（倾侧双环，泰坦金环质感） */}
      {node.body === 'saturn' && (
        <group rotation={[1.05, 0.25, 0]}>
          <mesh>
            <torusGeometry args={[orbR + 0.09, 0.014, 8, 48]} />
            <meshBasicMaterial color="#F5D486" transparent opacity={0.85} />
          </mesh>
          <mesh>
            <torusGeometry args={[orbR + 0.13, 0.007, 8, 48]} />
            <meshBasicMaterial color="#FDE68A" transparent opacity={0.4} />
          </mesh>
        </group>
      )}
      {/* 悬停/聚焦提示环（未选中时） */}
      {hovered && !selected && (
        <Line points={circlePoints(orbR + 0.12, 0.06, 40)} color="#A5B4FC" transparent opacity={0.75} lineWidth={1} dashed dashSize={0.05} gapSize={0.07} />
      )}
      {selected && <SelectionFX color={palette.glow} reduceMotion={reduceMotion} />}
      {/* 天体符号印记（深色镌刻于亮珠之上） */}
      <Html position={[0, 0, 0]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
        <div aria-hidden style={{ width: 17, height: 17, color: palette.glyph, opacity: dimmed ? 0.55 : 1, transition: 'opacity 300ms' }}>
          <Glyph width={17} height={17} />
        </div>
      </Html>
      {/* 度数标签（金箔微光；不稳定缺失绝不虚构） */}
      {node.degree !== null && (
        <Html position={degreeLocal} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div
            aria-hidden
            className="text-[10px] font-bold tabular-nums"
            style={{ color: '#FDE68A', opacity: dimmed ? 0.5 : 0.92, textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 5px rgba(251,191,36,0.45)', transition: 'opacity 300ms' }}
          >
            {Math.floor(node.degree)}°
          </div>
        </Html>
      )}
      {/* 触达热区（等效 ≥44px：世界 0.62 ≈ 屏幕 34px+；透明球体承接射线） */}
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelectBody?.(selected ? null : node.body);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(node.body);
          // 仅交互模式（结果页可点选）才显示手型；纯展示预览不误导
          if (onSelectBody) document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          if (onSelectBody) document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[0.62, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* 中文名浮动胶囊（悬停/选中时浮出，复用 SVG 轮视觉） */}
      {(hovered || selected) && (
        <Html position={[0, orbR + 0.34, 0.1]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            aria-hidden
            className="whitespace-nowrap rounded-full border border-amber-300/40 bg-[#0A0E24]/90 px-3.5 py-1 text-xs font-bold text-amber-200 shadow-[0_8px_32px_-6px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
          >
            ✦ {PLANET_CN[node.body]} · {ZODIAC_CN[node.sign]}
            {node.degree !== null ? ` ${Math.floor(node.degree)}°` : ''}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ---------- 盘心星核：常驻涟漪 + 选中时的引力共振波 ---------- */

/** 循环扩散涟漪环 */
function Ripple({ color, period, offset, maxR, reduceMotion }: { color: string; period: number; offset: number; maxR: number; reduceMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    const mt = mat.current;
    if (!m || !mt || reduceMotion) return;
    const p = ((clock.elapsedTime / period + offset) % 1 + 1) % 1;
    const s = 0.32 + p * maxR;
    m.scale.set(s, s, 1);
    mt.opacity = (1 - p) * 0.35;
  });
  if (reduceMotion) return null;
  return (
    <mesh ref={ref} position={[0, 0, 0.1]}>
      <ringGeometry args={[0.94, 1, 64]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CoreStar({ reduceMotion }: { reduceMotion: boolean }) {
  const flare = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!reduceMotion && flare.current) flare.current.rotation.z = (clock.elapsedTime * Math.PI * 2) / 40;
  });
  return (
    <group>
      {/* 恒星亮核 + 金色日冕 */}
      <mesh position={[0, 0, 0.12]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#FFFBEB" />
      </mesh>
      <sprite scale={[1.35, 1.35, 1]} position={[0, 0, 0.08]}>
        <spriteMaterial map={getGlowTexture('#FBBF24')} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {/* 十字衍射星芒（超慢自转） */}
      <group ref={flare} position={[0, 0, 0.11]}>
        {[0, Math.PI / 2].map((rot) => (
          <mesh key={rot} rotation={[0, 0, rot]}>
            <planeGeometry args={[1.5, 0.014]} />
            <meshBasicMaterial color="#FDE68A" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* 常驻双涟漪 */}
      <Ripple color="#F5D486" period={3.6} offset={0} maxR={2.1} reduceMotion={reduceMotion} />
      <Ripple color="#F5D486" period={3.6} offset={0.5} maxR={2.1} reduceMotion={reduceMotion} />
    </group>
  );
}

/* ---------- 偶发流星（13s 周期，划过 1.35s，头亮尾淡） ---------- */

function Meteor({ reduceMotion }: { reduceMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    const mt = mat.current;
    if (!g || !mt) return;
    const t = clock.elapsedTime % 13;
    const active = t < 1.35;
    g.visible = active;
    if (!active) return;
    const p = t / 1.35;
    g.position.set(6.0 - 12.0 * p, 4.3 - 7.6 * p, -2.4);
    mt.opacity = 0.9 * Math.min(1, p / 0.16) * Math.min(1, (1 - p) / 0.28);
  });
  if (reduceMotion) return null;
  return (
    <group ref={group} visible={false} rotation={[0, 0, Math.atan2(-7.6, -12.0)]}>
      <mesh>
        <planeGeometry args={[2.1, 0.05]} />
        <meshBasicMaterial ref={mat} map={getMeteorTexture()} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ---------- 场景导轨：入场推近 + 指针视差 + 悬浮呼吸 ---------- */

function SceneRig({ reduceMotion, children }: { reduceMotion: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const entrance = useRef({ t0: -1, p: reduceMotion ? 1 : 0 });
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const e = entrance.current;
    if (e.p < 1) {
      if (e.t0 < 0) e.t0 = state.clock.elapsedTime;
      e.p = Math.min(1, (state.clock.elapsedTime - e.t0) / 1.35);
    }
    const eased = 1 - Math.pow(1 - e.p, 3);
    // 入场：相机从远推近 + 盘面微缩放落定
    state.camera.position.z = 17.5 - 3.3 * eased;
    const s = 0.93 + 0.07 * eased;
    g.scale.set(s, s, s);
    // 指针钳制到 [-1,1]：R3F 用 offsetY ÷ size.height 计算指针，若 size 被瞬态布局污染成矮值，
    // pointer.y 会爆到 ±20+，盘面直接被转出视锥（即“鼠标移入星盘黑屏”的实证根因）。
    // 钳制保证：即使测量层再出问题，旋转量也永远不可能飞出可视范围。
    const px = THREE.MathUtils.clamp(state.pointer.x, -1, 1);
    const py = THREE.MathUtils.clamp(state.pointer.y, -1, 1);
    // 基础倾角约 3°：保留仪器纵深，又避免大倾角造成的投影重心下移（实测 -0.14 时盘面上方留白明显多于下方）
    const tiltX = -0.055 + (reduceMotion ? 0 : py * -0.05);
    const tiltY = reduceMotion ? 0 : px * 0.055;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, tiltX, 5, delta);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, tiltY, 5, delta);
    // 投影重心补偿（倾角使盘缘下端投影更长，整体上移回正）+ 14s 悬浮呼吸叠加其上
    const floatY = reduceMotion ? 0 : Math.sin(state.clock.elapsedTime * ((Math.PI * 2) / 14)) * 0.05;
    g.position.y = 0.06 + floatY;
    // 开发环境调试探针：验收脚本可直读场景状态（生产零输出）
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as Record<string, unknown>).__orrery = {
        rx: g.rotation.x, ry: g.rotation.y, gy: g.position.y, cz: state.camera.position.z,
        sw: state.size.width, sh: state.size.height, px: state.pointer.x, py: state.pointer.y,
      };
    }
  });
  return <group ref={group}>{children}</group>;
}

/* ---------- 尺寸守卫：R3F 内部测量可能被污染且不会自愈，这里做确定性校正 ----------
 * 机理：R3F 经 react-use-measure 以 getBoundingClientRect 测量容器（受祖先 transform 影响，
 * acw-wheel-float 倾斜姿态下会测得透视压缩的脏值），CanvasImpl 的 layout effect 无依赖数组、
 * 每次重渲染都重放该脏尺寸；已通过 resize.offsetSize:true 从源头免疫（见 Canvas props 注释）。
 * 本守卫是第二道防线：读容器布局盒（clientWidth/Height，不受 transform 影响），
 * canvas CSS / state.size 任一层偏差 >1px 即强制校正；
 * 主防线是 ResizeObserver + resize/orientationchange（常驻，零轮询成本，覆盖容器尺寸净变化）；
 * 心跳只兜「容器尺寸没变但内部 state 被污染」的最后缺口，并且是**有界**的：
 * 连续 3 次无偏差即自行退场（稳定后不再有任何 1s 轮询），期间一旦发生校正就重置计数继续守护。
 * 这不降低确定性自愈能力：尺寸真变时 RO 仍会触发，心跳只在入场瞬态窗口内额外把关。 */
function SizeGuard() {
  const gl = useThree((s) => s.gl);
  const setSize = useThree((s) => s.setSize);
  const invalidate = useThree((s) => s.invalidate);
  const store = useStore();
  useEffect(() => {
    const canvas = gl.domElement;
    const container = canvas.parentElement?.parentElement; // R3F wrapper → 场景容器
    if (!container) return;
    /** 返回本次是否发生校正（心跳据此决定续命还是退场） */
    const check = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 1 || h <= 1) return false;
      const stateSize = store.getState().size;
      const cssDrift = Math.abs(canvas.clientWidth - w) > 1 || Math.abs(canvas.clientHeight - h) > 1;
      const stateDrift = Math.abs(stateSize.width - w) > 1 || Math.abs(stateSize.height - h) > 1;
      if (cssDrift || stateDrift) {
        // setSize 的 top/left 语义来自容器包围盒（指针计算只用 offsetX/Y 与 size，top/left 仅参与视口换算，
        // 但 R3F v9 的 setSize 默认把它们重置为 0，这里按 computeInitialSize 的语义补正）
        const rect = container.getBoundingClientRect();
        setSize(w, h, rect.top, rect.left);
        invalidate();
        return true;
      }
      return false;
    };
    check();
    // 挂载后多次复查，覆盖入场动画 / 字体换载 / 样式热更等瞬态落定时机
    const timers = [150, 400, 900, 1800, 3500].map((ms) => window.setTimeout(check, ms));
    // 主防线：常驻监听容器尺寸（定时器结束后若再发生污染，如布局动画晚到，也能确定性自愈）
    const ro = new ResizeObserver(() => {
      check();
    });
    ro.observe(container);
    // 有界心跳：只兜 RO 覆盖不到的「容器尺寸净变化为零但内部 state 被污染」缺口。
    // 连续 3 次无偏差即 clearInterval 自行退场；发生校正则计数清零继续守护；
    // 页面隐藏期间跳过（不渲染就无所谓污染），容器不可测量（工作区被 display 隐藏）时同样不计数，
    // 以免「隐藏期间空转 3 秒」把尚未完成入场把关的心跳提前送走。
    let cleanBeats = 0;
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (container.clientWidth <= 1 || container.clientHeight <= 1) return;
      if (check()) {
        cleanBeats = 0;
        return;
      }
      cleanBeats += 1;
      if (cleanBeats >= 3) window.clearInterval(heartbeat);
    }, 1000);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      timers.forEach(clearTimeout);
      window.clearInterval(heartbeat);
      ro.disconnect();
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, [gl, setSize, invalidate, store]);
  return null;
}

/* ---------- 帧循环治理：不可见即停帧（离屏工作区 / 页面隐藏 / 模块切走） ----------
 * 为什么不改成 frameloop="demand"：本场景的常驻动画正是设计意图——SceneRig 14s 悬浮呼吸、
 * 雷达环与 flare 自转、流星、星云 uTime 着色器、粒子流、星核涟漪；demand 会让它们在无交互时
 * 全部静止，等于砍掉动效编排。正确做法是保留帧循环，只在「看不见」时整帧停摆。
 * 三个条件必须「与」：页面可见 且 画布在视口内 且 模块处于激活态；任一不满足即停，三项都满足才恢复。
 * 不能写成三个独立开关（单项恢复就开渲染会互相覆盖，隐藏页里依然空转）：
 * 1) 页面隐藏（visibilitychange）——切标签页/最小化时不再空转 GPU；
 * 2) 画布离屏（IntersectionObserver，threshold 0）——命运模块四个工作区靠 display 常驻，
 *    切到八字/紫微时星座场景仍留在文档里照常渲染，这一条是最大的收益点；
 * 3) 模块切走（isActive=false，工作区透传的模块级激活态）——不依赖观察器回调时机，
 *    模块一被切走就立即停帧；桌面端与移动端同一口径，不按断点分别判断。
 *
 * 时钟时间轴：R3F v9 的 setFrameloop 内部会 clock.stop() 并把 clock.elapsedTime 归零，
 * 而本场景不少动画以 elapsedTime 作绝对时间轴（入场推进 t0、星云/粒子流相位、流星 13s 周期、
 * Shockwave 的 userData.t0 标记）——若只做暂停/恢复，恢复后它们会整体跳变或长时间停摆
 * （被 if (t < 0) return 挡住）。因此暂停时记下时钟读数，恢复时把它拨回：
 * 等价于「不可见期间时间轴冻结」，画面从原处继续；阻尼走的是 delta，而 clock.start() 后
 * 首帧 delta 很小，所以既不会瞬时收敛也不会出现 NaN。
 *
 * 另：CanvasImpl 的 layout effect 无依赖数组，每次重渲染都会重放 configure()，
 * 其中带默认 frameloop='always'，会把暂停状态顶掉；这里订阅 store，被外部改回就同步重新暂停；
 * 暂停时还会清空残留的帧预算 frames，避免 R3F 的 loop 在 'never' 下仍跑掉一帧（见 pause 内注释）。 */
function FrameloopGovernor({ isActive }: { isActive: boolean }) {
  const gl = useThree((s) => s.gl);
  const clock = useThree((s) => s.clock);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const store = useStore();

  useEffect(() => {
    let pageVisible = document.visibilityState !== 'hidden';
    // 初始按「不可见」处理：等 IntersectionObserver 首次回调确认可见后才放行，
    // 这样挂载即离屏（隐藏的工作区）时直接进入暂停，不产生任何多余帧
    let inViewport = false;
    /** 模块激活态：isActive 变化会重跑本 effect，重跑时先按「不可见」暂停，
     *  再由观察器首次回调放行（重复暂停只读取已钉住的时钟读数，时间轴不会漂移） */
    const moduleActive = isActive;
    let paused = false;
    /** 暂停瞬间的时钟读数（恢复时拨回，见上方注释） */
    let pausedElapsed = 0;

    const pause = (captureClock: boolean) => {
      if (captureClock) pausedElapsed = clock.elapsedTime;
      paused = true;
      setFrameloop('never');
      // setFrameloop 已把时钟归零，这里把读数钉回暂停瞬间（无论从哪条路径进入暂停）
      clock.elapsedTime = pausedElapsed;
      // 再清掉可能残留的帧预算：R3F 的 loop 对 frames>0 的 root 仍会调用一次 update()，
      // 而 update() 的 'never' 分支会拿 RAF 时间戳覆盖 clock.elapsedTime（时间轴被冲掉、
      // delta 变成毫秒级巨值），清 0 即杜绝「暂停后还会跑一帧」的最后一种情况
      const state = store.getState();
      if (state.internal.frames > 0) store.setState({ internal: { ...state.internal, frames: 0 } });
    };
    const resume = () => {
      paused = false;
      setFrameloop('always'); // 内部 clock.start() 会归零时间轴
      clock.elapsedTime = pausedElapsed; // 拨回暂停前读数：不可见期间时间冻结
      invalidate(); // 帧循环此前已自行退出，立即补一帧（下一帧由帧循环接管）
    };
    const sync = () => {
      if (pageVisible && inViewport && moduleActive) {
        if (paused) resume();
      } else if (!paused) {
        pause(true);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        inViewport = entries[entries.length - 1]?.isIntersecting ?? false;
        sync();
      },
      { threshold: 0 }
    );
    const onVisibilityChange = () => {
      pageVisible = document.visibilityState !== 'hidden';
      sync();
    };
    io.observe(gl.domElement);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // 外部把 frameloop 改回时（configure 重放）同步重新暂停，保证「暂停」是最终生效态
    const unsubscribe = store.subscribe((state) => {
      if (paused && state.frameloop !== 'never') pause(false);
    });
    sync(); // 挂载时若已隐藏 / 离屏 / 模块未激活 → 直接进入暂停
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
    };
    // isActive 进依赖：模块激活态变化即重跑本 effect，按新状态重新同步（暂停/恢复仍走上面同一对函数）
  }, [gl, clock, setFrameloop, invalidate, store, isActive]);

  return null;
}

/* ---------- 根组件：画布 + 键盘可达 + 交互契约（selectedBody/onSelectBody 不变） ---------- */

export function AstrologyWheelScene({
  facts,
  className,
  selectedBody,
  onSelectBody,
  planetOverrides,
  isActive = true,
}: {
  facts: AstrologyChartFacts;
  className?: string;
  selectedBody?: PlanetBody | null;
  onSelectBody?: (body: PlanetBody | null) => void;
  /** 行星黄经覆盖（表单预览太阳滑动用，语义与 SVG 轮一致）：覆盖星体按真实黄经阻尼滑入 */
  planetOverrides?: Partial<Record<PlanetBody, number>>;
  /** 工作区激活态（默认 true）：false 时整个帧循环停摆，模块切走后不在后台空转 GPU */
  isActive?: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const layout = useMemo(() => buildWheelSceneLayout(facts, planetOverrides), [facts, planetOverrides]);
  const [hovered, setHovered] = useState<PlanetBody | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  /** 移动端紧凑档：粒子减半 + dpr 收敛（挂载时判定一次，不随旋转变化） */
  const compact = useMemo(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false), []);

  // 卸载时归还鼠标指针样式
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  const bodies = useMemo(() => layout.planets.map((p) => p.body), [layout.planets]);
  const interactive = Boolean(onSelectBody);

  /** 键盘：←/→ 循环星体（复用 hover 提示环），Enter/空格 选中，Esc 取消 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive || bodies.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (focusIndex + dir + bodies.length) % bodies.length;
      setFocusIndex(next);
      setHovered(bodies[next]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const b = bodies[focusIndex];
      onSelectBody?.(selectedBody === b ? null : b);
    } else if (e.key === 'Escape') {
      onSelectBody?.(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0.01 } : { duration: 0.8, delay: 0.12, ease: 'easeOut' }}
      className={cn(
        'relative aspect-square w-full select-none overflow-hidden rounded-full bg-[#040713]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50',
        className
      )}
      role={interactive ? 'group' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? '本命星盘深空场景，方向键切换星体，回车查看，Escape 取消' : '本命星盘'}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => setHovered(null)}
      onBlur={() => setHovered(null)}
    >
      <Canvas
        dpr={compact ? [1, 1.5] : [1, 1.75]}
        camera={{ position: [0, 0, 17.5], fov: 40, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        // offsetSize:true 是硬性要求：AstrologyWheel3D 祖先层有 acw-wheel-float 3D 倾斜动画，
        // 而 react-use-measure 默认走 getBoundingClientRect（受 transform 透视压缩影响），
        // 一旦在倾斜姿态下测得 402×389 之类的脏值，CanvasImpl 无依赖数组的 layout effect
        // 会在每次重渲染（悬停 setHovered 即触发）时重放脏尺寸 → 整盘瞬缩后由 SizeGuard 拉回，
        // 即「鼠标移入星盘先放大又恢复」的根因。offsetSize 改读 offsetWidth/Height（布局值，
        // 不受 transform 影响），从源头免疫。
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 }, offsetSize: true }}
        onPointerMissed={() => onSelectBody?.(null)}
      >
        {/* 尺寸自愈守卫（见上方注释）：校正被布局瞬态污染且不自愈的内部测量 */}
        <SizeGuard />
        {/* 帧循环治理（见上方注释）：页面隐藏 / 画布离屏 / 模块切走时整帧停摆，三项都可见时拨回时间轴继续 */}
        <FrameloopGovernor isActive={isActive} />
        {/* 光照：环境光托底 + 主光塑形（自发光为主，光照只给球体体积感） */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 8]} intensity={1.1} />
        <SceneRig reduceMotion={reduceMotion}>
          <AbyssWindow />
          <NebulaVeil reduceMotion={reduceMotion} />
          <DeepStarfield compact={compact} reduceMotion={reduceMotion} />
          <ZodiacRing layout={layout} selectedBody={selectedBody ?? null} onSelectBody={onSelectBody} />
          <HousesAndAxes layout={layout} />
          <AspectArcs layout={layout} selectedBody={selectedBody ?? null} reduceMotion={reduceMotion} />
          <CoreStar reduceMotion={reduceMotion} />
          {layout.planets.map((node, i) => (
            <PlanetOrb
              key={node.body}
              node={node}
              index={i}
              selected={selectedBody === node.body}
              dimmed={selectedBody != null && selectedBody !== node.body}
              hovered={hovered === node.body}
              reduceMotion={reduceMotion}
              onSelectBody={onSelectBody}
              onHover={setHovered}
            />
          ))}
          <Meteor reduceMotion={reduceMotion} />
        </SceneRig>
        {/* 电影后处理：泛光让星光真正溢出边缘，暗角收拢视线 */}
        <EffectComposer multisampling={compact ? 0 : 4}>
          <Bloom mipmapBlur luminanceThreshold={0.62} luminanceSmoothing={0.12} intensity={0.85} radius={0.72} />
          <Vignette offset={0.22} darkness={0.52} />
        </EffectComposer>
      </Canvas>
    </motion.div>
  );
}
