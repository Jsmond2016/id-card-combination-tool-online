import { clamp } from 'ramda';

import {
  DEFAULT_WATERMARK_ANGLE_DEG,
  DEFAULT_WATERMARK_FONT_SIZE_MM,
  DEFAULT_WATERMARK_SPACING_MM,
  WATERMARK_ANGLE_RANGE_DEG,
  WATERMARK_COLOR,
  WATERMARK_FONT_SIZE_RANGE_MM,
  WATERMARK_LINE_HEIGHT_RATIO,
  WATERMARK_NARROW_CHAR_RATIO,
  WATERMARK_OPACITY,
  WATERMARK_SPACING_RANGE_MM,
  WATERMARK_TEXT_MAX_LENGTH,
  WATERMARK_WIDE_CHAR_RATIO,
} from '@/constants/idCard';

/** 字号换算到像素后小于该值就不再绘制：屏幕上只是一层噪点，打印更看不出来 */
const MIN_RENDERABLE_FONT_PX = 1;
/** 字体族与校准尺保持一致，确保中文可正常渲染 */
const WATERMARK_FONT_FAMILY = 'sans-serif';
const WATERMARK_FONT_WEIGHT = 600;

/**
 * 全宽字符码点区间（CJK、假名、韩文、全角符号、emoji 等）。
 * 用区间表而非一长串条件判断，避免 `||` 堆叠推高圈复杂度。
 */
const WIDE_CHAR_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];

const isWideChar = (char: string): boolean => {
  const codePoint = char.codePointAt(0) ?? 0;
  return WIDE_CHAR_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
};

/**
 * 规范化水印文字：折叠连续空白、去掉首尾空白、按**码点**截断到 `WATERMARK_TEXT_MAX_LENGTH` 个字。
 * 按码点而非 UTF-16 单元截断，保证 emoji / 生僻字只算一个字。
 */
export const normalizeWatermarkText = (raw: string): string =>
  Array.from(raw.replace(/\s+/g, ' ').trim()).slice(0, WATERMARK_TEXT_MAX_LENGTH).join('');

/** 估算文本包围盒宽度（mm）：布局用估算值而非 measureText，才能脱离浏览器断言 */
export const estimateTextWidthMm = (text: string, fontSizeMm: number): number =>
  Array.from(text).reduce(
    (widthMm, char) =>
      widthMm +
      fontSizeMm * (isWideChar(char) ? WATERMARK_WIDE_CHAR_RATIO : WATERMARK_NARROW_CHAR_RATIO),
    0,
  );

/** 单行水印的包围盒高度（mm） */
export const estimateTextHeightMm = (fontSizeMm: number): number =>
  fontSizeMm * WATERMARK_LINE_HEIGHT_RATIO;

/** 瓦片偏移（mm），相对页面中心，位于**旋转后**的坐标系 */
export interface WatermarkTile {
  offsetXMm: number;
  offsetYMm: number;
}

export interface WatermarkLayout {
  centerXMm: number;
  centerYMm: number;
  /** 列步进 / 行步进（mm）= 文本包围盒尺寸 + 平铺间距 */
  stepXMm: number;
  stepYMm: number;
  tiles: WatermarkTile[];
}

export interface WatermarkLayoutInput {
  pageWidthMm: number;
  pageHeightMm: number;
  textWidthMm: number;
  textHeightMm: number;
  /** 相邻两个水印之间的空隙（mm），非有限值时按 0 处理 */
  gapXMm: number;
  gapYMm: number;
}

const resolveStep = (sizeMm: number, gapMm: number): number => {
  const safeSizeMm = Number.isFinite(sizeMm) && sizeMm > 0 ? sizeMm : 0;
  const safeGapMm = Number.isFinite(gapMm) && gapMm > 0 ? gapMm : 0;
  // 步进至少 1mm：避免尺寸与间距都为 0 时瓦片数量发散
  return Math.max(1, safeSizeMm + safeGapMm);
};

/**
 * 计算覆盖整页的平铺瓦片。
 *
 * 关键点：瓦片按**页面外接圆**展开（`半径 = hypot(宽, 高) / 2`），因此结果与倾斜角度无关——
 * 任意旋转角下，覆盖外接圆必然覆盖整页矩形，绘制时只需把画布绕中心旋转一次。
 * 索引上界额外补 `step / 2`，保证「包含任一页面点的那一格」一定在集合内（四个页角都被覆盖）。
 */
export function computeWatermarkLayout(input: WatermarkLayoutInput): WatermarkLayout {
  const { pageWidthMm, pageHeightMm, textWidthMm, textHeightMm } = input;
  const stepXMm = resolveStep(textWidthMm, input.gapXMm);
  const stepYMm = resolveStep(textHeightMm, input.gapYMm);
  const radiusMm = Math.hypot(pageWidthMm, pageHeightMm) / 2;
  const maxIndexX = Math.ceil((radiusMm + stepXMm / 2) / stepXMm);
  const maxIndexY = Math.ceil((radiusMm + stepYMm / 2) / stepYMm);

  const tiles: WatermarkTile[] = [];
  for (let indexY = -maxIndexY; indexY <= maxIndexY; indexY += 1) {
    for (let indexX = -maxIndexX; indexX <= maxIndexX; indexX += 1) {
      tiles.push({ offsetXMm: indexX * stepXMm, offsetYMm: indexY * stepYMm });
    }
  }

  return { centerXMm: pageWidthMm / 2, centerYMm: pageHeightMm / 2, stepXMm, stepYMm, tiles };
}

export interface WatermarkParamsInput {
  /** 每毫米像素数，预览与导出共用同一套绘制代码 */
  pxPerMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
  text: string;
  fontSizeMm: number;
  spacingMm: number;
  angleDeg: number;
}

export interface WatermarkDrawParams {
  /** 已规范化的文字 */
  text: string;
  fontSizeMm: number;
  /** 换算到目标画布的字号（px） */
  fontPx: number;
  spacingMm: number;
  angleDeg: number;
  layout: WatermarkLayout;
}

/** 非有限值、非正数回退到默认值，再钳制到合法区间（适用于下限为正的尺寸类参数） */
const clampPositiveToRange = (
  value: number,
  fallback: number,
  range: { readonly min: number; readonly max: number },
): number => {
  const safeValue = Number.isFinite(value) && value > 0 ? value : fallback;
  return clamp(range.min, range.max, safeValue);
};

/** 角度允许为 0 与负数，因此只拦截非有限值，再钳制到合法区间 */
const clampAngleToRange = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_WATERMARK_ANGLE_DEG;
  return clamp(WATERMARK_ANGLE_RANGE_DEG.min, WATERMARK_ANGLE_RANGE_DEG.max, safeValue);
};

/**
 * 解析真正参与绘制的参数：越界参数钳制到合法区间，无法绘制时返回 null。
 * 钳制同时给瓦片数量设了上界（最密配置 < 400 个），避免极端参数把浏览器拖死。
 */
export function resolveWatermarkDrawParams(
  input: WatermarkParamsInput,
): WatermarkDrawParams | null {
  const text = normalizeWatermarkText(input.text);
  const fontSizeMm = clampPositiveToRange(
    input.fontSizeMm,
    DEFAULT_WATERMARK_FONT_SIZE_MM,
    WATERMARK_FONT_SIZE_RANGE_MM,
  );
  const pxPerMm = Number.isFinite(input.pxPerMm) && input.pxPerMm > 0 ? input.pxPerMm : 0;
  const fontPx = fontSizeMm * pxPerMm;
  if (!text || fontPx < MIN_RENDERABLE_FONT_PX) {
    return null;
  }
  const spacingMm = clampPositiveToRange(
    input.spacingMm,
    DEFAULT_WATERMARK_SPACING_MM,
    WATERMARK_SPACING_RANGE_MM,
  );
  const angleDeg = clampAngleToRange(input.angleDeg);
  const layout = computeWatermarkLayout({
    pageWidthMm: input.pageWidthMm,
    pageHeightMm: input.pageHeightMm,
    textWidthMm: estimateTextWidthMm(text, fontSizeMm),
    textHeightMm: estimateTextHeightMm(fontSizeMm),
    gapXMm: spacingMm,
    gapYMm: spacingMm,
  });
  return { text, fontSizeMm, fontPx, spacingMm, angleDeg, layout };
}

const paintTiles = (
  context: CanvasRenderingContext2D,
  params: WatermarkDrawParams,
  pxPerMm: number,
): void => {
  const { layout, fontPx, text, angleDeg } = params;
  context.save();
  context.globalAlpha = WATERMARK_OPACITY;
  context.fillStyle = WATERMARK_COLOR;
  context.font = `${WATERMARK_FONT_WEIGHT} ${fontPx}px ${WATERMARK_FONT_FAMILY}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.translate(layout.centerXMm * pxPerMm, layout.centerYMm * pxPerMm);
  context.rotate((angleDeg * Math.PI) / 180);
  layout.tiles.forEach((tile) => {
    context.fillText(text, tile.offsetXMm * pxPerMm, tile.offsetYMm * pxPerMm);
  });
  context.restore();
};

/**
 * 在页面画布上绘制平铺水印（R20）。
 * 调用方需保证绘制次序在身份证图像**之后**、校准尺之前，否则水印会被图像盖住。
 */
export function drawWatermark(
  input: WatermarkParamsInput & { context: CanvasRenderingContext2D },
): void {
  const params = resolveWatermarkDrawParams(input);
  if (!params) {
    return;
  }
  paintTiles(input.context, params, input.pxPerMm);
}
