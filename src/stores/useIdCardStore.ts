import { create } from 'zustand';

import { DEFAULT_DPI, DEFAULT_FACE_GAP_MM, DEFAULT_SPEC_ID } from '@/constants/idCard';
import type {
  ExportSettings,
  FaceKind,
  FaceState,
  LayoutSettings,
  SourceImage,
} from '@/types/idCard';

export const createEmptyFace = (): FaceState => ({
  source: null,
  crop: { x: 0, y: 0 },
  zoom: 1,
  quarterTurns: 0,
  fineRotation: 0,
  offset: { xMm: 0, yMm: 0 },
  croppedAreaPixels: null,
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

const createInitialExportSettings = (): ExportSettings => ({
  format: 'pdf',
  dpi: DEFAULT_DPI,
});

export interface IdCardState {
  faces: Record<FaceKind, FaceState>;
  layout: LayoutSettings;
  exportSettings: ExportSettings;
  setSource: (kind: FaceKind, source: SourceImage | null) => void;
  patchFace: (kind: FaceKind, patch: Partial<FaceState>) => void;
  setLayout: (patch: Partial<LayoutSettings>) => void;
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
  setExportSettings: (patch) =>
    set((state) => ({ exportSettings: { ...state.exportSettings, ...patch } })),

  /** 仅重置裁剪与旋转，保留已上传的图片 */
  resetFaceEdit: (kind) =>
    set((state) =>
      withFace(state, kind, { ...createEmptyFace(), source: state.faces[kind].source }),
    ),

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
      exportSettings: createInitialExportSettings(),
    })),
}));
