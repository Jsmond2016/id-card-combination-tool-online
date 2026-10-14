/** 毫米/英寸换算基数，DPI 与毫米之间的推导都基于它。 */
export const MM_PER_INCH = 25.4;

/** A4 纸张物理尺寸（mm） */
export const A4 = { widthMm: 210, heightMm: 297 } as const;

/** 第二代居民身份证物理尺寸（mm），ISO/IEC 7810 ID-1 */
export const CARD_PHYSICAL = { widthMm: 85.6, heightMm: 54 } as const;

export type SpecPresetId = 'copy-88x56' | 'original-85.6x54';

export interface SpecPreset {
  id: SpecPresetId;
  label: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

/**
 * 规格预设。两个预设都取自行业硬值：
 * - 88 × 56mm 是政务/银行沿用的身份证复印件规格；
 * - 85.6 × 54mm 是身份证原大。
 * 裁剪宽高比与输出尺寸均取所选预设自身的比例，不做等比折算，避免输出落到非标尺寸。
 */
export const SPEC_PRESETS: readonly SpecPreset[] = [
  {
    id: 'copy-88x56',
    label: '88 × 56 mm',
    widthMm: 88,
    heightMm: 56,
    description: '身份证复印件标准规格（推荐）',
  },
  {
    id: 'original-85.6x54',
    label: '85.6 × 54 mm',
    widthMm: CARD_PHYSICAL.widthMm,
    heightMm: CARD_PHYSICAL.heightMm,
    description: '身份证原大，与实体卡片等尺寸',
  },
];

export const DEFAULT_SPEC_ID: SpecPresetId = 'copy-88x56';

export const getSpecPreset = (id: SpecPresetId): SpecPreset =>
  SPEC_PRESETS.find((preset) => preset.id === id) ?? SPEC_PRESETS[0];

export const DPI_OPTIONS = [150, 300] as const;
export type DpiOption = (typeof DPI_OPTIONS)[number];
export const DEFAULT_DPI: DpiOption = 300;

/** 低于该有效 DPI 时提示用户重拍或降低输出精度 */
export const MIN_RECOMMENDED_DPI = 300;

/**
 * 正反面之间的默认间距（mm）。
 *
 * 取值依据：GB 11643 / ISO 7810 ID-1 只规定身份证卡体为 85.6 × 54mm，
 * 并未规定复印件上正反面之间的间距；市面同类工具（lettimepassby/idcard-print、
 * Swkings/photo-cut-merge 等）均以 10mm 作为默认值，故沿用 10mm。
 * 用户可在「排版设置」中自行调节。
 */
export const DEFAULT_FACE_GAP_MM = 10;
/** 正反面间距的可调范围（mm），取到上限时版式可能已溢出 A4，由溢出提示兜底 */
export const FACE_GAP_RANGE_MM = { min: 2, max: 30 } as const;
/** 每页多份时，份与份之间的间距（mm） */
export const COPY_GAP_MM = 8;
/** 距边模式下使用的页面边距（mm） */
export const SAFE_MARGIN_MM = 10;
/** 拖动钳制的硬边界（mm） */
export const CLAMP_MARGIN_MM = 5;
/** 预览参考标尺的刻度间隔（mm） */
export const RULER_TICK_MM = 10;
/** 预览参考标尺的主刻度间隔（mm，带数字标注） */
export const RULER_MAJOR_TICK_MM = 50;
/** 拖拽吸附阈值（mm）：面位的边或中心与参考线的距离小于该值即自动吸附 */
export const SNAP_THRESHOLD_MM = 2.5;
/** 可选校准标尺长度（mm） */
export const CALIBRATION_RULER_MM = 50;

/**
 * 水印相关常量（R20）。
 *
 * 水印是页面级效果：平铺覆盖整页 A4 并压在身份证图像之上，因此只影响观感，
 * 不参与任何尺寸计算——身份证尺寸与导出页面尺寸都不受水印影响。
 */
export const DEFAULT_WATERMARK_ENABLED = false;
export const DEFAULT_WATERMARK_TEXT = '仅供办理业务使用';
/** 水印文字最大长度（按码点计数，中文一个字算一个，超出自动截断） */
export const WATERMARK_TEXT_MAX_LENGTH = 15;
/** 水印字号可调范围（mm） */
export const WATERMARK_FONT_SIZE_RANGE_MM = { min: 4, max: 24 } as const;
export const DEFAULT_WATERMARK_FONT_SIZE_MM = 8;
/** 平铺间距可调范围（mm）：相邻两个水印之间的空隙，数值越小越密 */
export const WATERMARK_SPACING_RANGE_MM = { min: 20, max: 120 } as const;
export const DEFAULT_WATERMARK_SPACING_MM = 50;
/** 倾斜角度可调范围（度），正值为顺时针 */
export const WATERMARK_ANGLE_RANGE_DEG = { min: -90, max: 90 } as const;
export const DEFAULT_WATERMARK_ANGLE_DEG = -30;
/** 水印透明度：低于 0.15 打印后偏淡，高于 0.25 会遮挡身份证信息 */
export const WATERMARK_OPACITY = 0.18;
export const WATERMARK_COLOR = '#000000';
/** 单行水印的包围盒高度 = 字号 × 该比例 */
export const WATERMARK_LINE_HEIGHT_RATIO = 1.2;
/** 文本宽度估算：全宽字符（CJK / 全角）按 1 倍字号，半角字符按 0.6 倍字号 */
export const WATERMARK_WIDE_CHAR_RATIO = 1;
export const WATERMARK_NARROW_CHAR_RATIO = 0.6;

/** 上传限制 */
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'] as const;
export const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp'] as const;

/** 预览画布宽度（px），仅用于屏幕显示，不影响导出精度 */
export const PREVIEW_WIDTH_PX = 520;

/** DPI -> 每毫米像素数 */
export const dpiToPxPerMm = (dpi: number): number => dpi / MM_PER_INCH;

/** 毫米 -> 像素（按 DPI） */
export const mmToPx = (mm: number, dpi: number): number => Math.round(mm * dpiToPxPerMm(dpi));
