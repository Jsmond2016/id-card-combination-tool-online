import type { DpiOption, SpecPresetId } from '@/constants/idCard';

export type FaceKind = 'front' | 'back';

/** 身份证正反面在界面上的展示顺序与名称 */
export const FACE_META: Record<FaceKind, { label: string; shortLabel: string; hint: string }> = {
  front: {
    label: '身份证正面（人像面）',
    shortLabel: '正面',
    hint: '包含照片、姓名、身份证号的一面',
  },
  back: {
    label: '身份证反面（国徽面）',
    shortLabel: '反面',
    hint: '包含国徽与签发机关的一面',
  },
};

export const FACE_ORDER: readonly FaceKind[] = ['front', 'back'];

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropPoint {
  x: number;
  y: number;
}

/** 透视矫正的四个角点，顺序固定为「左上 → 右上 → 右下 → 左下」（源图像素坐标） */
export type Quad = [CropPoint, CropPoint, CropPoint, CropPoint];

/** 透视矫正设置（R22）：手动标定卡片四角，按单应变换拉正为正投影矩形 */
export interface RectifySettings {
  enabled: boolean;
  /** 源图像素坐标下的四角；null 表示尚未标定，渲染时回退默认四角 */
  quad: Quad | null;
  /** 边缘微调（%）：正值向内收缩以切掉卡边外的残余背景，负值向外扩张 */
  edgeOffsetPercent: number;
}

export interface SourceImage {
  fileName: string;
  fileSize: number;
  mimeType: string;
  objectUrl: string;
  width: number;
  height: number;
}

export interface FaceOffset {
  xMm: number;
  yMm: number;
}

export interface FaceState {
  source: SourceImage | null;
  crop: CropPoint;
  zoom: number;
  /** 整角旋转次数，每次 90°，取值 0–3 */
  quarterTurns: number;
  /** 细调旋转角度，范围 -45–45 */
  fineRotation: number;
  offset: FaceOffset;
  croppedAreaPixels: CropArea | null;
  /** 透视矫正设置（R22）；enabled 为 false 时完全沿用上面的矩形裁剪链路 */
  rectify: RectifySettings;
}

export type LayoutMode = 'vertical' | 'horizontal';
export type AlignMode = 'center' | 'margin';
export type CopyCount = 1 | 2;

export interface LayoutSettings {
  specId: SpecPresetId;
  mode: LayoutMode;
  align: AlignMode;
  copies: CopyCount;
  /** 正反面之间的间距（mm），默认 10mm，可在排版面板调节 */
  gapMm: number;
  /** 是否在 A4 预览上显示参考标尺（仅屏幕显示，不参与导出） */
  showPreviewRuler: boolean;
  showCalibrationRuler: boolean;
}

/** 页面级水印设置（R20），仅影响观感，不参与尺寸计算 */
export interface WatermarkSettings {
  enabled: boolean;
  /** 水印文字，最长 32 个字，超出由 store 自动截断 */
  text: string;
  /** 单个水印的字号（mm），决定水印大小 */
  fontSizeMm: number;
  /** 平铺间距（mm）：相邻两个水印之间的空隙，数值越小越密 */
  spacingMm: number;
  /** 倾斜角度（度），正值为顺时针 */
  angleDeg: number;
}

export type ExportFormat = 'pdf' | 'png' | 'jpeg';

export interface ExportSettings {
  format: ExportFormat;
  dpi: DpiOption;
}
