import {
  CARD_PHYSICAL,
  DEFAULT_RECTIFY_INSET_RATIO,
  EDGE_OFFSET_RANGE_PERCENT,
  type SpecPreset,
} from '@/constants/idCard';
import type { CropPoint, Quad } from '@/types/idCard';

/**
 * 透视矫正（R22）：把用户标定的卡片四边形按单应变换拉正为正投影矩形。
 *
 * 相机光轴与卡面不平行时，卡片在画面里是**梯形**，而矩形裁剪框永远是矩形，
 * 两者之间必然露出背景。复印机是「卡片压在玻璃上、光轴垂直卡面」的正投影成像，
 * 因此"逼近复印机效果"在数学上等价于消掉这个透视投影。
 *
 * 本模块把矩阵求解与重采样写成只依赖 TypedArray 的纯函数，可直接在 Node 中断言；
 * 只有 renderRectifiedFace 需要 DOM（降采样、缓存与 putImageData）。
 */

/** 像素数据的最小接口：只依赖 TypedArray，便于在 Node 中断言（不依赖 canvas / ImageData） */
export interface PixelSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** 降采样后的采样源，以及它在原图上的缩放比（用于同步换算四角坐标） */
export interface PreparedSource {
  source: PixelSource;
  scale: number;
}

/** 卡面在规格画布内的绘制位置与尺寸（px） */
export interface CardRect {
  widthPx: number;
  heightPx: number;
  offsetX: number;
  offsetY: number;
  cardWidthMm: number;
  cardHeightMm: number;
}

export interface WarpRequest {
  source: PixelSource;
  /** 源图像素坐标下的四角（左上 / 右上 / 右下 / 左下） */
  quad: Quad;
  targetWidth: number;
  targetHeight: number;
}

export interface RectifyRenderOptions {
  targetWidthPx: number;
  targetHeightPx: number;
  pxPerMm: number;
  preset: SpecPreset;
  edgeOffsetPercent: number;
  /** 缓存键（通常为 objectUrl），用于复用降采样后的像素数据 */
  cacheKey: string;
}

/** 四边形面积占整图面积的下限，低于该值视为退化 */
const MIN_QUAD_AREA_RATIO = 0.01;
/** 采样点允许溢出源图的容差（px）：避免卡边因数值误差出现白缝 */
const SAMPLE_TOLERANCE_PX = 0.5;
/** 高斯消元的主元阈值，低于该值判定为退化（共线 / 自交） */
const GAUSS_EPSILON = 1e-12;
/** 降采样像素缓存的条目上限；导出级数据一次性使用，不常驻 */
const CACHE_MAX_ENTRIES = 4;
/** 单条缓存允许的最大像素数（约 4M ≈ 16MB），超过则不缓存 */
const CACHE_MAX_PIXELS = 4_000_000;

const sourceCache = new Map<string, PixelSource>();

const isFinitePoint = (point: CropPoint): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

const asQuad = (points: readonly CropPoint[]): Quad => [
  { x: points[0].x, y: points[0].y },
  { x: points[1].x, y: points[1].y },
  { x: points[2].x, y: points[2].y },
  { x: points[3].x, y: points[3].y },
];

/** 四边形面积（鞋带公式） */
export const quadArea = (quad: readonly CropPoint[]): number => {
  let sum = 0;
  for (let index = 0; index < quad.length; index += 1) {
    const current = quad[index];
    const next = quad[(index + 1) % quad.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
};

const crossProduct = (origin: CropPoint, a: CropPoint, b: CropPoint): number =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

/** 四个顶点是否构成凸四边形（共线即判负） */
const isConvexQuad = (quad: readonly CropPoint[]): boolean => {
  let positive = 0;
  let negative = 0;
  for (let index = 0; index < 4; index += 1) {
    const value = crossProduct(quad[index], quad[(index + 1) % 4], quad[(index + 2) % 4]);
    if (value > 0) {
      positive += 1;
    } else if (value < 0) {
      negative += 1;
    } else {
      return false;
    }
  }
  return positive === 4 || negative === 4;
};

/**
 * 判断四角是否可用：坐标有限、落在图片范围内、构成凸四边形且面积不小于整图的 1%。
 * 这是三层守卫的第二层（第一层是拖动时的象限约束，第三层是渲染层的默认四角回退）。
 */
export function isValidQuad(
  quad: readonly CropPoint[] | null | undefined,
  imageWidth: number,
  imageHeight: number,
): quad is Quad {
  if (!quad || quad.length !== 4) {
    return false;
  }
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
    return false;
  }
  if (imageWidth <= 0 || imageHeight <= 0) {
    return false;
  }
  const inside = quad.every(
    (point) =>
      isFinitePoint(point) &&
      point.x >= -1 &&
      point.y >= -1 &&
      point.x <= imageWidth + 1 &&
      point.y <= imageHeight + 1,
  );
  if (!inside) {
    return false;
  }
  if (quadArea(quad) < MIN_QUAD_AREA_RATIO * imageWidth * imageHeight) {
    return false;
  }
  return isConvexQuad(quad);
}

/** 按规格比例的最大内接矩形居中放置，再向内收缩 DEFAULT_RECTIFY_INSET_RATIO */
export function createDefaultQuad(imageWidth: number, imageHeight: number, aspect: number): Quad {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const containWidth = Math.min(imageWidth, imageHeight * safeAspect);
  const containHeight = containWidth / safeAspect;
  const inset = 1 - DEFAULT_RECTIFY_INSET_RATIO;
  const width = containWidth * inset;
  const height = containHeight * inset;
  const left = (imageWidth - width) / 2;
  const top = (imageHeight - height) / 2;
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

/**
 * 拖角约束：只允许在「保持四边形凸」的范围内移动，因此永远不可能自交。
 *
 * 四个顶点各对应一个叉积判据，其中只有两个涉及被拖动的顶点（它自己与它前一个顶点），
 * 且都关于该顶点**线性**，所以可以沿"原位置 → 目标位置"这条线段解析求出最大可行比例，
 * 既不误挡斜拍产生的合法梯形，也不会让四边形翻转。
 */
export function constrainQuadCorner(
  quad: Quad,
  index: number,
  point: CropPoint,
  imageWidth: number,
  imageHeight: number,
): Quad {
  const origin = quad[index];
  const previous = quad[(index + 3) % 4];
  const next = quad[(index + 1) % 4];
  const before = quad[(index + 2) % 4];
  const target = {
    x: Math.min(Math.max(point.x, 0), imageWidth),
    y: Math.min(Math.max(point.y, 0), imageHeight),
  };
  const atMovedCorner = (candidate: CropPoint): number => crossProduct(previous, candidate, next);
  const atPrevious = (candidate: CropPoint): number => crossProduct(before, previous, candidate);
  const orientation = Math.sign(atMovedCorner(origin)) || 1;
  const epsilon = 1e-5 * imageWidth * imageHeight;
  const feasibleRatio = (evaluate: (candidate: CropPoint) => number): number => {
    const start = evaluate(origin) * orientation;
    const end = evaluate(target) * orientation;
    if (end >= epsilon) {
      return 1;
    }
    const drop = start - end;
    if (drop <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (start - epsilon) / drop));
  };
  const ratio = Math.min(feasibleRatio(atMovedCorner), feasibleRatio(atPrevious));
  return asQuad(
    quad.map((item, itemIndex) =>
      itemIndex === index
        ? {
            x: origin.x + (target.x - origin.x) * ratio,
            y: origin.y + (target.y - origin.y) * ratio,
          }
        : item,
    ),
  );
}

/** 以四边形中心等比缩放：positive 为向内收缩（切掉卡边外的残余背景） */
export function applyEdgeOffset(quad: Quad, percent: number): Quad {
  const { min, max } = EDGE_OFFSET_RANGE_PERCENT;
  const safePercent = Number.isFinite(percent) ? Math.min(max, Math.max(min, percent)) : 0;
  if (safePercent === 0) {
    return quad;
  }
  const center = quad.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x / 4,
      y: accumulator.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  );
  const scale = 1 - safePercent / 100;
  return asQuad(
    quad.map((point) => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    })),
  );
}

const distance = (from: CropPoint, to: CropPoint): number =>
  Math.hypot(to.x - from.x, to.y - from.y);

/** 四边形上下两条边的平均长度，用于反算有效打印精度（R15 在矫正模式下仍有意义） */
export const quadAverageWidth = (quad: Quad): number =>
  (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2;

/** 取到可用四角；store 中缺标定或数据非法时回退默认四角（渲染层的既有约定） */
export const resolveFaceQuad = (
  quad: readonly CropPoint[] | null | undefined,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): Quad =>
  isValidQuad(quad, imageWidth, imageHeight)
    ? quad
    : createDefaultQuad(imageWidth, imageHeight, aspect);

/** 高斯消元（部分主元）解 8 元线性方程组；主元过小视为退化并返回 null */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivotRow][column])) {
        pivotRow = row;
      }
    }
    if (Math.abs(matrix[pivotRow][column]) < GAUSS_EPSILON) {
      return null;
    }
    [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];
    [vector[column], vector[pivotRow]] = [vector[pivotRow], vector[column]];
    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = matrix[row][column] / matrix[column][column];
      if (factor === 0) {
        continue;
      }
      for (let column2 = column; column2 < size; column2 += 1) {
        matrix[row][column2] -= factor * matrix[column][column2];
      }
      vector[row] -= factor * vector[column];
    }
  }
  return vector.map((value, index) => value / matrix[index][index]);
}

/**
 * 求把 from 四点映射到 to 四点的单应矩阵 H（返回 h0..h7，h8 固定为 1）。
 *
 * 求解方向取「目标矩形 → 源四边形」，这样逐像素反演时直接就是源图坐标，无需再求逆矩阵。
 */
export function resolveHomography(from: Quad, to: Quad): number[] | null {
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = from[index];
    const { x: u, y: v } = to[index];
    matrix.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    vector.push(v);
  }
  return solveLinearSystem(matrix, vector);
}

/** 用单应矩阵映射一个点 */
export function applyHomography(matrix: readonly number[], point: CropPoint): CropPoint {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + 1;
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator,
  };
}

const clampIndex = (value: number, size: number): number => Math.min(size - 1, Math.max(0, value));

/** 双线性插值取样；采样点落在源图之外（含容差）时返回 false，由调用方填白 */
function sampleBilinear(
  source: PixelSource,
  sampleX: number,
  sampleY: number,
  output: Uint8ClampedArray,
  outputIndex: number,
): boolean {
  const { data, width, height } = source;
  if (
    sampleX < -SAMPLE_TOLERANCE_PX ||
    sampleY < -SAMPLE_TOLERANCE_PX ||
    sampleX > width - 1 + SAMPLE_TOLERANCE_PX ||
    sampleY > height - 1 + SAMPLE_TOLERANCE_PX
  ) {
    return false;
  }
  const left = clampIndex(Math.floor(sampleX), width);
  const top = clampIndex(Math.floor(sampleY), height);
  const right = clampIndex(left + 1, width);
  const bottom = clampIndex(top + 1, height);
  const fx = sampleX - left;
  const fy = sampleY - top;
  const i00 = (top * width + left) * 4;
  const i10 = (top * width + right) * 4;
  const i01 = (bottom * width + left) * 4;
  const i11 = (bottom * width + right) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  for (let channel = 0; channel < 3; channel += 1) {
    output[outputIndex + channel] = Math.round(
      data[i00 + channel] * w00 +
        data[i10 + channel] * w10 +
        data[i01 + channel] * w01 +
        data[i11 + channel] * w11,
    );
  }
  output[outputIndex + 3] = 255;
  return true;
}

const createRectQuad = (width: number, height: number): Quad => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

/**
 * 把四边形区域重采样到 target 尺寸的正投影矩形。
 *
 * 逐像素**反向映射**：对每个目标像素求出它在源图中的坐标再取样，因此
 * ①复杂度只与输出像素数相关、与源图大小无关；
 * ②采样点落在四边形之外即代表「卡片之外的内容」，**背景不是被擦除，而是根本不会被采样到**。
 */
// 返回类型固定为 Uint8ClampedArray<ArrayBuffer>，才能直接交给 new ImageData(data, w, h)
export function warpQuadToPixels(request: WarpRequest): Uint8ClampedArray<ArrayBuffer> | null {
  const { source, quad, targetWidth, targetHeight } = request;
  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight)) {
    return null;
  }
  if (targetWidth < 1 || targetHeight < 1 || !isValidQuad(quad, source.width, source.height)) {
    return null;
  }
  const width = Math.round(targetWidth);
  const height = Math.round(targetHeight);
  const matrix = resolveHomography(createRectQuad(width, height), quad);
  if (!matrix) {
    return null;
  }
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4;
      const denominator = matrix[6] * x + matrix[7] * y + 1;
      const sampleX = (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator;
      const sampleY = (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator;
      if (!sampleBilinear(source, sampleX, sampleY, output, outputIndex)) {
        output[outputIndex] = 255;
        output[outputIndex + 1] = 255;
        output[outputIndex + 2] = 255;
        output[outputIndex + 3] = 255;
      }
    }
  }
  return output;
}

/**
 * 卡面在规格画布内的绘制矩形：按身份证真实比例（85.6 × 54mm）居中，四周补白。
 * 88 × 56 比卡体每边大 1.2mm / 1.0mm，补出来的白边正好对应真实复印件上卡外的那圈白纸。
 */
export function resolveCardRect(
  preset: SpecPreset,
  pxPerMm: number,
  targetWidthPx: number,
  targetHeightPx: number,
): CardRect {
  const cardWidthMm = Math.min(preset.widthMm, CARD_PHYSICAL.widthMm);
  const cardHeightMm = Math.min(preset.heightMm, CARD_PHYSICAL.heightMm);
  const scale = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 0;
  const widthPx = Math.max(1, Math.min(targetWidthPx, Math.round(cardWidthMm * scale)));
  const heightPx = Math.max(1, Math.min(targetHeightPx, Math.round(cardHeightMm * scale)));
  return {
    widthPx,
    heightPx,
    offsetX: Math.round((targetWidthPx - widthPx) / 2),
    offsetY: Math.round((targetHeightPx - heightPx) / 2),
    cardWidthMm,
    cardHeightMm,
  };
}

const scaleQuad = (quad: Quad, scale: number): Quad =>
  asQuad(quad.map((point) => ({ x: point.x * scale, y: point.y * scale })));

/** 取出（并按需降采样）采样像素；预览级结果进缓存，导出级一次性使用 */
function prepareRectifySource(
  image: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  cacheKey: string,
): PreparedSource | null {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) {
    return null;
  }
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const key = `${cacheKey}|${width}x${height}`;
  const cached = sourceCache.get(key);
  if (cached) {
    sourceCache.delete(key);
    sourceCache.set(key, cached);
    return { source: cached, scale: width / naturalWidth };
  }
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  if (!context) {
    return null;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const source: PixelSource = { data: pixels.data, width, height };
  if (width * height <= CACHE_MAX_PIXELS) {
    sourceCache.set(key, source);
    while (sourceCache.size > CACHE_MAX_ENTRIES) {
      const oldest = sourceCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      sourceCache.delete(oldest);
    }
  }
  return { source, scale: width / naturalWidth };
}

/** 释放某个源图的像素缓存（替换 / 移除图片时调用） */
export function clearRectifySource(objectUrl: string): void {
  const prefix = `${objectUrl}|`;
  Array.from(sourceCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      sourceCache.delete(key);
    }
  });
}

/**
 * 把某个面位的原图按四角拉正后绘制到规格画布：卡面按真实比例居中，四周保持纯白。
 * 返回 null 表示数据不可用（矩阵退化 / 取样失败），由调用方回退矩形裁剪。
 */
export function renderRectifiedFace(
  image: HTMLImageElement,
  quad: Quad,
  options: RectifyRenderOptions,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(options.targetWidthPx));
  canvas.height = Math.max(1, Math.round(options.targetHeightPx));
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const card = resolveCardRect(options.preset, options.pxPerMm, canvas.width, canvas.height);
  // 采样源只需卡面尺寸的 2 倍，足以满足 300 DPI 的取样精度，同时避免 12MP 原图的 ImageData 常驻
  const prepared = prepareRectifySource(
    image,
    card.widthPx * 2,
    card.heightPx * 2,
    options.cacheKey,
  );
  if (!prepared) {
    return null;
  }
  const pixels = warpQuadToPixels({
    source: prepared.source,
    quad: applyEdgeOffset(scaleQuad(quad, prepared.scale), options.edgeOffsetPercent),
    targetWidth: card.widthPx,
    targetHeight: card.heightPx,
  });
  if (!pixels) {
    return null;
  }
  context.putImageData(
    new ImageData(pixels, card.widthPx, card.heightPx),
    card.offsetX,
    card.offsetY,
  );
  return canvas;
}
