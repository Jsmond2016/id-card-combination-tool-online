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

export type ExportFormat = 'pdf' | 'png' | 'jpeg';

export interface ExportSettings {
  format: ExportFormat;
  dpi: DpiOption;
}
