import { useEffect, useLayoutEffect, useRef } from "react";
import styles from "./shader.module.css";

/** Which space to blend `color` / `color2` (and mesh mixes) in. Default: OKLAB. */
export const COLOR_MIX_SPACE = {
  /** Mix raw sRGB channels (legacy; can look muddy / too dark mid-blend). */
  SRGB: 0,
  /** Hue shortest-arc + S/L linear — vivid, hue-preserving (not perceptually uniform). */
  HSL: 1,
  /** Linear-light sRGB — better than gamma mix, still not hue-stable. */
  LINEAR_RGB: 2,
  /** Oklab (Björn Ottosson) — perceptually even blends for UI gradients. */
  OKLAB: 3,
} as const;

export type ColorMixSpaceId =
  (typeof COLOR_MIX_SPACE)[keyof typeof COLOR_MIX_SPACE];

interface ShaderProps {
  color?: string;
  color2?: string;
  speed?: string;
  /** Overall layer strength (0–1). Lower = more of the page shows through. */
  opacity?: number;
  className?: string;
}

/**
 * Central place to tune the mesh gradient. Edit here — no need to touch GLSL literals.
 * (Values are sent as uniforms once when the WebGL program is created.)
 */
export const SHADER_TUNING = {
  /** Multiplies time from the `speed` prop (higher = faster motion / drift). */
  animationTimeScale: 1,

  /** Domain warp: UV frequency inside simplex (higher = smaller / finer warp cells). */
  warpUvScale: 1.6, // default: 1.1
  /** How strongly UV is pushed by warp noise (mesh “liquidity”). */
  warpStrength: 0.18, // default: 0.24
  /** Time drift on warp noise (x+, y+, x−, y− channels). */
  warpTimeX1: 0.14, // default: 0.14
  warpTimeY1: 0.09, // default: 0.09
  warpTimeX2: 0.11, // default: 0.11
  warpTimeY2: 0.5, // default: 0.13
  /** Second warp pass: scales and offsets time (extra smear / complexity). */
  warpSecondPassTimeScale: 0.1, // default: 0.72
  warpSecondPassPhase: 5, // default: 1.7

  /** Blob anchor orbit speed (higher = faster drifting blobs). */
  blobDriftScale: 0.11, // default: 0.11
  /** Keep blobs away from UV edges [0–0.5]. */
  blobAreaInset: 0.35, // default: 0.12
  /** Orbit radius in UV space [0–1]. */
  blobAreaRadius: 0.1, // default: 0.76
  /** Gaussian tightness `exp(-k * d²)` — higher = smaller, sharper blobs. */
  blobGaussianTightness: 5, // default: 3.8

  /** Mesh color stops: mix factors toward color2 for the two in-between samples. */
  meshMixTowardColor2A: 0.4, // default: 0.32
  meshMixTowardColor2B: 0.6, // default: 0.68
  /** Bright “core” tint: multiply midpoint RGB (highlights). */
  highlightIntensity: 1, // default: 1.14
  /** How much highlight is mixed in near strongest blobs [0–1]. */
  highlightMix: 0.2, // default: 0.12

  /** Organic intermix noise: UV scale (higher = finer grain in the blend). */
  blendNoiseScale: 3, // default: 5.5
  blendNoiseTimeX: 0.18, // default: 0.18
  blendNoiseTimeY: 0.4, // default: 0.14
  /** How much blend noise replaces the weighted mesh [0–1] (“complexity”). */
  blendNoiseMix: 0.25, // default: 0.38 // good: 0.2

  /** Film grain: screen-space frequency. */
  grainScale: 3.1, // default: 3.1
  grainTimeX: 3.7, // default: 3.7
  grainTimeY: 2.9, // default: 2.9
  /** Grain RGB offset strength. */
  grainStrength: 0.025, // default: 0.055

  /**
   * Linear exposure multiplier applied before premultiplying (1 = neutral, >1 = brighter).
   * Useful to restore brightness lost when correcting premultiplied alpha output.
   */
  colorExposure: 2, // default: 1.0
  /**
   * Saturation multiplier in linear-light space (1 = neutral, >1 = more vivid, 0 = greyscale).
   * Restores vibrancy without affecting overall luminance.
   */
  colorSaturation: 1.2, // default: 1.0

  /** Alpha blob: floor + range * peak^power (shape of opaque regions). */
  alphaBlobFloor: 0.3, // default: 0.2
  alphaBlobRange: 0.8, // default: 0.8
  alphaPeakPower: 0.12, // default: 0.52
  /** Fade alpha when far from all blobs (smoothstep edges). */
  alphaTroughFadeStart: 0.2, // default: 0.08
  alphaTroughFadeEnd: 0.9, // default: 0.58

  /**
   * How much RGB luminance drives opacity (0 = off, 1 = strong).
   * Brighter colors read as more opaque; dark mixes stay more transparent.
   */
  colorLuminanceToAlpha: 2.9, // default: 0.22

  /**
   * Vertical linear mask (UV space: 0 = bottom of canvas, 1 = top).
   * Opacity ramps from 0 at `verticalMaskYBottom` to 1 at `verticalMaskYTop`.
   * Default is full-height linear: opaque at top, transparent at bottom.
   */
  verticalMaskYBottom: 0.3,
  verticalMaskYTop: 1,

  /** Blending space for all color mixes — see `COLOR_MIX_SPACE`. */
  colorMixSpace: COLOR_MIX_SPACE.SRGB,
} as const;

export type ShaderTuning = typeof SHADER_TUNING;

const VERTEX_SOURCE = /* glsl */ `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = /* glsl */ `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform float u_opacity;
uniform float u_inputAlpha;

uniform float u_animTimeScale;
uniform float u_warpUvScale;
uniform float u_warpStrength;
uniform vec4 u_warpTime;
uniform float u_warp2TimeScale;
uniform float u_warp2Phase;
uniform float u_blobDrift;
uniform float u_blobInset;
uniform float u_blobRadius;
uniform float u_blobK;
uniform vec2 u_meshMixAB;
uniform float u_hiBoost;
uniform float u_hiMix;
uniform float u_blendNoiseScale;
uniform vec2 u_blendNoiseTime;
uniform float u_blendNoiseMix;
uniform float u_grainScale;
uniform vec2 u_grainTime;
uniform float u_grainStrength;
uniform float u_exposure;
uniform float u_saturation;
uniform vec3 u_alphaShape;
uniform vec2 u_alphaTrough;
uniform float u_lumaToAlpha;
uniform vec2 u_verticalMask;
uniform int u_colorMixSpace;

const int MIX_SRGB = 0;
const int MIX_HSL = 1;
const int MIX_LINEAR = 2;
const int MIX_OKLAB = 3;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c * (1.0 / 12.92);
  vec3 hi = pow((c + 0.055) * (1.0 / 1.055), vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

vec3 linearToOklab(vec3 c) {
  mat3 m1 = mat3(
    0.4122214708, 0.2119034982, 0.0883024619,
    0.5363325363, 0.6806995451, 0.2817188376,
    0.0514459929, 0.1073969566, 0.6299787005
  );
  vec3 lms = m1 * c;
  lms = pow(max(lms, vec3(1e-8)), vec3(0.3333333));
  mat3 m2 = mat3(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660
  );
  return m2 * lms;
}

vec3 oklabToLinear(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894811769 * lab.y - 1.2914855480 * lab.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  mat3 invM = mat3(
    4.0767416621, -1.2684380046, -0.0041960863,
    -3.3077115913, 2.6097574011, -0.7034186147,
    0.2309699292, -0.3413193965, 1.7076147010
  );
  return invM * lms;
}

float hueToRgb(float p, float q, float t) {
  float tt = mod(mod(t, 1.0) + 1.0, 1.0);
  if (tt < 1.0 / 6.0) return p + (q - p) * 6.0 * tt;
  if (tt < 0.5) return q;
  if (tt < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tt) * 6.0;
  return p;
}

vec3 linearToHsl(vec3 c) {
  float maxc = max(c.r, max(c.g, c.b));
  float minc = min(c.r, min(c.g, c.b));
  float L = (maxc + minc) * 0.5;
  float H = 0.0;
  float S = 0.0;
  float d = maxc - minc;
  if (d > 1e-8) {
    S = (L > 0.5) ? (d / (2.0 - maxc - minc)) : (d / (maxc + minc));
    if (maxc == c.r) H = mod((c.g - c.b) / d + 6.0, 6.0) / 6.0;
    else if (maxc == c.g) H = ((c.b - c.r) / d + 2.0) / 6.0;
    else H = ((c.r - c.g) / d + 4.0) / 6.0;
  }
  return vec3(H, S, L);
}

vec3 hslToLinear(vec3 hsl) {
  float s = hsl.y;
  float l = hsl.z;
  if (s < 1e-8) return vec3(l);
  float q = (l < 0.5) ? (l * (1.0 + s)) : (l + s - l * s);
  float p = 2.0 * l - q;
  float h = hsl.x;
  return vec3(
    hueToRgb(p, q, h + 1.0 / 3.0),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1.0 / 3.0)
  );
}

vec3 mixHueHsl(vec3 ha, vec3 hb, float t) {
  float a = ha.x * 6.28318530718;
  float b = hb.x * 6.28318530718;
  vec2 va = vec2(cos(a), sin(a));
  vec2 vb = vec2(cos(b), sin(b));
  vec2 vm = mix(va, vb, t);
  float hx = atan(vm.y, vm.x) / 6.28318530718;
  if (hx < 0.0) hx += 1.0;
  return vec3(hx, mix(ha.yz, hb.yz, t));
}

vec3 mixPair(vec3 sCa, vec3 sCb, float t) {
  if (u_colorMixSpace == MIX_SRGB) return mix(sCa, sCb, t);
  if (u_colorMixSpace == MIX_HSL) {
    vec3 ha = linearToHsl(srgbToLinear(sCa));
    vec3 hb = linearToHsl(srgbToLinear(sCb));
    return linearToSrgb(hslToLinear(mixHueHsl(ha, hb, t)));
  }
  if (u_colorMixSpace == MIX_LINEAR) {
    return linearToSrgb(mix(srgbToLinear(sCa), srgbToLinear(sCb), t));
  }
  vec3 oa = linearToOklab(srgbToLinear(sCa));
  vec3 ob = linearToOklab(srgbToLinear(sCb));
  return linearToSrgb(oklabToLinear(mix(oa, ob, t)));
}

vec3 combine4(vec3 sc0, vec3 sc1, vec3 sc2, vec3 sc3, float w0, float w1, float w2, float w3) {
  if (u_colorMixSpace == MIX_SRGB)
    return sc0 * w0 + sc1 * w1 + sc2 * w2 + sc3 * w3;
  if (u_colorMixSpace == MIX_HSL) {
    vec3 h0 = linearToHsl(srgbToLinear(sc0));
    vec3 h1 = linearToHsl(srgbToLinear(sc1));
    vec3 h2 = linearToHsl(srgbToLinear(sc2));
    vec3 h3 = linearToHsl(srgbToLinear(sc3));
    vec2 hv = vec2(0.0);
    hv += w0 * vec2(cos(h0.x * 6.28318530718), sin(h0.x * 6.28318530718));
    hv += w1 * vec2(cos(h1.x * 6.28318530718), sin(h1.x * 6.28318530718));
    hv += w2 * vec2(cos(h2.x * 6.28318530718), sin(h2.x * 6.28318530718));
    hv += w3 * vec2(cos(h3.x * 6.28318530718), sin(h3.x * 6.28318530718));
    float h = atan(hv.y, hv.x) / 6.28318530718;
    if (h < 0.0) h += 1.0;
    float S = h0.y * w0 + h1.y * w1 + h2.y * w2 + h3.y * w3;
    float L = h0.z * w0 + h1.z * w1 + h2.z * w2 + h3.z * w3;
    return linearToSrgb(hslToLinear(vec3(h, S, L)));
  }
  if (u_colorMixSpace == MIX_LINEAR) {
    return linearToSrgb(
      srgbToLinear(sc0) * w0 +
      srgbToLinear(sc1) * w1 +
      srgbToLinear(sc2) * w2 +
      srgbToLinear(sc3) * w3
    );
  }
  vec3 ok =
    linearToOklab(srgbToLinear(sc0)) * w0 +
    linearToOklab(srgbToLinear(sc1)) * w1 +
    linearToOklab(srgbToLinear(sc2)) * w2 +
    linearToOklab(srgbToLinear(sc3)) * w3;
  return linearToSrgb(oklabToLinear(ok));
}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
   -0.577350269189626,
    0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec2 warpUv(vec2 uv, float t) {
  vec2 q = vec2(
    snoise(uv * u_warpUvScale + vec2(t * u_warpTime.x, t * u_warpTime.y)),
    snoise(uv * u_warpUvScale - vec2(t * u_warpTime.z, t * u_warpTime.w))
  );
  return uv + q * u_warpStrength;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float tFlow = u_time * u_animTimeScale;

  float t2 = tFlow * u_warp2TimeScale + u_warp2Phase;
  vec2 p = warpUv(warpUv(uv, tFlow), t2);

  float slow = tFlow * u_blobDrift;
  vec2 b0 = u_blobInset + u_blobRadius * vec2(0.5 + 0.5 * sin(slow * 1.07), 0.5 + 0.5 * cos(slow * 0.93));
  vec2 b1 = u_blobInset + u_blobRadius * vec2(0.5 + 0.5 * sin(slow * 0.88 + 2.1), 0.5 + 0.5 * cos(slow * 1.15 + 1.4));
  vec2 b2 = u_blobInset + u_blobRadius * vec2(0.5 + 0.5 * sin(slow * 0.96 + 4.3), 0.5 + 0.5 * cos(slow * 0.84 + 3.2));
  vec2 b3 = u_blobInset + u_blobRadius * vec2(0.5 + 0.5 * sin(slow * 1.02 + 5.6), 0.5 + 0.5 * cos(slow * 0.79 + 2.0));

  float d0 = length(p - b0);
  float d1 = length(p - b1);
  float d2 = length(p - b2);
  float d3 = length(p - b3);

  float k = u_blobK;
  float w0 = exp(-k * d0 * d0);
  float w1 = exp(-k * d1 * d1);
  float w2 = exp(-k * d2 * d2);
  float w3 = exp(-k * d3 * d3);
  float ws = w0 + w1 + w2 + w3 + 1e-4;
  w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

  vec3 cMixA = mixPair(u_color1, u_color2, u_meshMixAB.x);
  vec3 cMixB = mixPair(u_color1, u_color2, u_meshMixAB.y);
  vec3 cHiS = mixPair(u_color1, u_color2, 0.5);
  vec3 cHi = linearToSrgb(min(srgbToLinear(cHiS) * u_hiBoost, vec3(1.0)));

  vec3 rgb = combine4(u_color1, u_color2, cMixA, cMixB, w0, w1, w2, w3);
  float nBlend = snoise(p * u_blendNoiseScale + vec2(tFlow * u_blendNoiseTime.x, tFlow * u_blendNoiseTime.y)) * 0.5 + 0.5;
  rgb = mix(rgb, mixPair(u_color1, u_color2, nBlend), u_blendNoiseMix);
  rgb = mix(rgb, cHi, u_hiMix * (w0 + w1));

  float grain = snoise(gl_FragCoord.xy * u_grainScale + vec2(tFlow * u_grainTime.x, tFlow * u_grainTime.y));
  rgb += (grain - 0.5) * u_grainStrength;

  // Exposure and saturation in linear-light space for perceptual accuracy.
  vec3 linRgb = srgbToLinear(clamp(rgb, 0.0, 1.0));
  linRgb *= u_exposure;
  float linLuma = dot(linRgb, vec3(0.2126, 0.7152, 0.0722));
  linRgb = mix(vec3(linLuma), linRgb, u_saturation);
  rgb = linearToSrgb(clamp(linRgb, 0.0, 1.0));

  float peak = max(max(w0, w1), max(w2, w3));
  float trough = min(min(d0, d1), min(d2, d3));
  float aBlob = u_alphaShape.x + u_alphaShape.y * pow(peak, u_alphaShape.z);
  aBlob *= 1.0 - smoothstep(u_alphaTrough.x, u_alphaTrough.y, trough);
  float a = u_opacity * u_inputAlpha * clamp(aBlob, 0.0, 1.0);

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float lumaAlpha = mix(1.0, 0.25 + 0.75 * luma, u_lumaToAlpha);
  a *= clamp(lumaAlpha, 0.0, 1.0);

  // Top = full opacity, bottom = 0 (linear in UV Y; WebGL origin is bottom-left).
  float vertMask = smoothstep(u_verticalMask.x, u_verticalMask.y, uv.y);
  a *= vertMask;

  // Premultiply alpha before output. WebGL's default premultipliedAlpha:true
  // means the browser compositor expects RGB already scaled by alpha — outputting
  // straight alpha causes the saturated edge colors to bleed as a bright fringe.
  gl_FragColor = vec4(rgb * a, a);
}
`;

const PROBE_STYLE =
  "visibility:hidden;position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;pointer-events:none";

/** After the last `resize` event, wait this long before fading the canvas back in. */
const RESIZE_SHOW_DEBOUNCE_MS = 100;

type ParsedColor = { rgb: [number, number, number]; a: number };

const parseBgColor = (raw: string): ParsedColor | null => {
  if (!raw || raw === "transparent" || raw === "rgba(0, 0, 0, 0)") {
    return null;
  }
  const match = raw.match(/[\d.]+/g);
  if (!match || match.length < 3) return null;
  const rgb: [number, number, number] = [
    parseFloat(match[0]) / 255,
    parseFloat(match[1]) / 255,
    parseFloat(match[2]) / 255,
  ];
  const a = match.length >= 4 ? parseFloat(match[3]) : 1;
  return { rgb, a: Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1 };
};

const parseSpeed = (speed: string): number => {
  const match = speed.match(/([\d.]+)\s*(ms|s)?/);
  if (!match) return 60;
  const value = parseFloat(match[1]);
  if (match[2] === "ms") return value / 1000;
  return value;
};

const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("[Shader] compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const applyShaderTuning = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  tuning: ShaderTuning,
) => {
  const loc = (name: string) => gl.getUniformLocation(program, name);

  const set1f = (name: string, v: number) => {
    const u = loc(name);
    if (u) gl.uniform1f(u, v);
  };
  const set2f = (name: string, x: number, y: number) => {
    const u = loc(name);
    if (u) gl.uniform2f(u, x, y);
  };
  const set3f = (name: string, x: number, y: number, z: number) => {
    const u = loc(name);
    if (u) gl.uniform3f(u, x, y, z);
  };
  const set4f = (name: string, x: number, y: number, z: number, w: number) => {
    const u = loc(name);
    if (u) gl.uniform4f(u, x, y, z, w);
  };

  set1f("u_animTimeScale", tuning.animationTimeScale);
  set1f("u_warpUvScale", tuning.warpUvScale);
  set1f("u_warpStrength", tuning.warpStrength);
  set4f(
    "u_warpTime",
    tuning.warpTimeX1,
    tuning.warpTimeY1,
    tuning.warpTimeX2,
    tuning.warpTimeY2,
  );
  set1f("u_warp2TimeScale", tuning.warpSecondPassTimeScale);
  set1f("u_warp2Phase", tuning.warpSecondPassPhase);

  set1f("u_blobDrift", tuning.blobDriftScale);
  set1f("u_blobInset", tuning.blobAreaInset);
  set1f("u_blobRadius", tuning.blobAreaRadius);
  set1f("u_blobK", tuning.blobGaussianTightness);

  set2f(
    "u_meshMixAB",
    tuning.meshMixTowardColor2A,
    tuning.meshMixTowardColor2B,
  );
  set1f("u_hiBoost", tuning.highlightIntensity);
  set1f("u_hiMix", tuning.highlightMix);

  set1f("u_blendNoiseScale", tuning.blendNoiseScale);
  set2f("u_blendNoiseTime", tuning.blendNoiseTimeX, tuning.blendNoiseTimeY);
  set1f("u_blendNoiseMix", tuning.blendNoiseMix);

  set1f("u_grainScale", tuning.grainScale);
  set2f("u_grainTime", tuning.grainTimeX, tuning.grainTimeY);
  set1f("u_grainStrength", tuning.grainStrength);
  set1f("u_exposure", tuning.colorExposure);
  set1f("u_saturation", tuning.colorSaturation);

  set3f(
    "u_alphaShape",
    tuning.alphaBlobFloor,
    tuning.alphaBlobRange,
    tuning.alphaPeakPower,
  );
  set2f(
    "u_alphaTrough",
    tuning.alphaTroughFadeStart,
    tuning.alphaTroughFadeEnd,
  );
  set1f("u_lumaToAlpha", tuning.colorLuminanceToAlpha);
  set2f("u_verticalMask", tuning.verticalMaskYBottom, tuning.verticalMaskYTop);

  const uMix = loc("u_colorMixSpace");
  if (uMix) gl.uniform1i(uMix, tuning.colorMixSpace);
};

const createProgram = (
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null => {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[Shader] link:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
};

export const Shader = ({
  color = "var(--accent)",
  color2 = "var(--accent-1)",
  speed = "35s",
  opacity = 1,
  className,
}: ShaderProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let debounceTimer: number | undefined;

    const onWindowResize = () => {
      canvas.classList.add(styles.resizeHidden);
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        canvas.classList.remove(styles.resizeHidden);
      }, RESIZE_SHOW_DEBOUNCE_MS);
    };

    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      canvas.classList.remove(styles.resizeHidden);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      console.warn("[Shader] WebGL not available");
      return;
    }

    const program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    if (!program) return;

    gl.useProgram(program);
    applyShaderTuning(gl, program, SHADER_TUNING);

    gl.enable(gl.BLEND);
    // Premultiplied alpha blend: source RGB is already scaled by alpha.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uColor1 = gl.getUniformLocation(program, "u_color1");
    const uColor2 = gl.getUniformLocation(program, "u_color2");
    const uOpacity = gl.getUniformLocation(program, "u_opacity");
    const uInputAlpha = gl.getUniformLocation(program, "u_inputAlpha");

    gl.uniform1f(uOpacity, Math.min(1, Math.max(0, opacity)));

    const cycleDuration = parseSpeed(speed);

    const probe1 = document.createElement("div");
    const probe2 = document.createElement("div");
    probe1.style.cssText = PROBE_STYLE;
    probe2.style.cssText = PROBE_STYLE;
    probe1.style.backgroundColor = color;
    probe2.style.backgroundColor = color2;
    document.body.appendChild(probe1);
    document.body.appendChild(probe2);

    let prevRaw1 = "";
    let prevRaw2 = "";

    const syncColors = (): boolean => {
      const raw1 = getComputedStyle(probe1).backgroundColor;
      const raw2 = getComputedStyle(probe2).backgroundColor;

      if (raw1 === prevRaw1 && raw2 === prevRaw2) {
        return prevRaw1 !== "" && prevRaw2 !== "";
      }

      const c1 = parseBgColor(raw1);
      const c2 = parseBgColor(raw2);
      if (!c1 || !c2) {
        prevRaw1 = "";
        prevRaw2 = "";
        return false;
      }

      prevRaw1 = raw1;
      prevRaw2 = raw2;
      gl.uniform3f(uColor1, c1.rgb[0], c1.rgb[1], c1.rgb[2]);
      gl.uniform3f(uColor2, c2.rgb[0], c2.rgb[1], c2.rgb[2]);
      const inputA = Math.sqrt(c1.a * c2.a);
      gl.uniform1f(uInputAlpha, inputA);
      return true;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const startTime = performance.now();

    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (syncColors()) {
        const elapsed = (performance.now() - startTime) / 1000;
        const t = (elapsed / cycleDuration) * Math.PI * 2;
        gl.uniform1f(uTime, t);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      probe1.remove();
      probe2.remove();
      gl.deleteBuffer(posBuffer);
      gl.deleteProgram(program);
    };
  }, [color, color2, speed, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.canvas}${className ? ` ${className}` : ""}`}
    />
  );
};
