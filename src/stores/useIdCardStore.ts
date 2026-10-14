import { create } from 'zustand';

import {
  DEFAULT_EDGE_OFFSET_PERCENT,
  DEFAULT_DPI,
  DEFAULT_FACE_GAP_MM,
  DEFAULT_RECTIFY_ENABLED,
  DEFAULT_SPEC_ID,
  DEFAULT_WATERMARK_ANGLE_DEG,
  DEFAULT_WATERMARK_ENABLED,
  DEFAULT_WATERMARK_FONT_SIZE_MM,
  DEFAULT_WATERMARK_SPACING_MM,
  DEFAULT_WATERMARK_TEXT,
} from '@/constants/idCard';
import type {
  ExportSettings,
  FaceKind,
  FaceState,
  LayoutSettings,
  RectifySettings,
  SourceImage,
  WatermarkSettings,
} from '@/types/idCard';
import { normalizeWatermarkText } from '@/utils/watermark';

/** 透视矫正（R22）的初始状态：默认关闭，四角在首次上传时按规格比例生成 */
export const createEmptyRectify = (): RectifySettings => ({
  enabled: DEFAULT_RECTIFY_ENABLED,
  quad: null,
  edgeOffsetPercent: DEFAULT_EDGE_OFFSET_PERCENT,
});

export const createEmptyFace = (): FaceState => ({
  source: null,
  crop: { x: 0, y: 0 },
  zoom: 1,
  quarterTurns: 0,
  fineRotation: 0,
  offset: { xMm: 0, yMm: 0 },
  croppedAreaPixels: null,
  rectify: createEmptyRectify(),
});

const createInitialFaces = (): Record<FaceKind, FaceState> => ({
  front: createEmptyFace(),
  back: createEmptyFace(),
});

const createInitialLayout = (): LayoutSettings => ({
  specId: DEFAULT_SPEC_ID,
  mode: 'vertical',
  align: 'center',
  copies: 1,
  gapMm: DEFAULT_FACE_GAP_MM,
  showPreviewRuler: true,
  showCalibrationRuler: false,
});

export const createInitialWatermark = (): WatermarkSettings => ({
  enabled: DEFAULT_WATERMARK_ENABLED,
  text: DEFAULT_WATERMARK_TEXT,
  fontSizeMm: DEFAULT_WATERMARK_FONT_SIZE_MM,
  spacingMm: DEFAULT_WATERMARK_SPACING_MM,
  angleDeg: DEFAULT_WATERMARK_ANGLE_DEG,
});

const createInitialExportSettings = (): ExportSettings => ({
  format: 'pdf',
  dpi: DEFAULT_DPI,
});

export interface IdCardState {
  faces: Record<FaceKind, FaceState>;
  layout: LayoutSettings;
  watermark: WatermarkSettings;
  exportSettings: ExportSettings;
  setSource: (kind: FaceKind, source: SourceImage | null) => void;
  patchFace: (kind: FaceKind, patch: Partial<FaceState>) => void;
  setLayout: (patch: Partial<LayoutSettings>) => void;
  setWatermark: (patch: Partial<WatermarkSettings>) => void;
  resetWatermark: () => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
  resetFaceEdit: (kind: FaceKind) => void;
  resetOffsets: () => void;
  resetAll: () => void;
}

const withFace = (state: IdCardState, kind: FaceKind, next: FaceState): IdCardState => ({
  ...state,
  faces: { ...state.faces, [kind]: next },
});

export const useIdCardStore = create<IdCardState>()((set) => ({
  faces: createInitialFaces(),
  layout: createInitialLayout(),
  watermark: createInitialWatermark(),
  exportSettings: createInitialExportSettings(),

  /** 设置或清空某个面位的图片；清空时连同裁剪参数一起复位 */
  setSource: (kind, source) =>
    set((state) =>
      withFace(state, kind, source ? { ...state.faces[kind], source } : createEmptyFace()),
    ),

  /**
   * 浅合并面位参数：嵌套对象必须整体传入。
   * 这样可以让类型系统拦截"只传半个 offset/croppedAreaPixels"的写法，
   * 避免旧字段残留造成难以察觉的状态污染。
   */
  patchFace: (kind, patch) =>
    set((state) => withFace(state, kind, { ...state.faces[kind], ...patch })),

  setLayout: (patch) => set((state) => ({ layout: { ...state.layout, ...patch } })),

  /**
   * 浅合并水印设置；文字在这里统一规范化（折叠空白 + 按码点截断到 15 字），
   * 任何入口写入超长或带换行的文字都会在这里被收口（TD19）。
   */
  setWatermark: (patch) =>
    set((state) => {
      const next = { ...state.watermark, ...patch };
      return { watermark: { ...next, text: normalizeWatermarkText(next.text) } };
    }),

  resetWatermark: () => set(() => ({ watermark: createInitialWatermark() })),
  setExportSettings: (patch) =>
    set((state) => ({ exportSettings: { ...state.exportSettings, ...patch } })),

  /** 仅重置裁剪、旋转与四角标定，保留已上传的图片与当前的透视矫正开关 */
  resetFaceEdit: (kind) =>
    set((state) => {
      const current = state.faces[kind];
      const empty = createEmptyFace();
      return withFace(state, kind, {
        ...empty,
        source: current.source,
        rectify: { ...empty.rectify, enabled: current.rectify.enabled },
      });
    }),

  resetOffsets: () =>
    set((state) => ({
      faces: {
        front: { ...state.faces.front, offset: { xMm: 0, yMm: 0 } },
        back: { ...state.faces.back, offset: { xMm: 0, yMm: 0 } },
      },
    })),

  resetAll: () =>
    set(() => ({
      faces: createInitialFaces(),
      layout: createInitialLayout(),
      watermark: createInitialWatermark(),
      exportSettings: createInitialExportSettings(),
    })),
}));
