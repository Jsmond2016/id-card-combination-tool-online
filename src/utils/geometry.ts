import { clamp } from 'ramda';

import {
  A4,
  CLAMP_MARGIN_MM,
  COPY_GAP_MM,
  DEFAULT_FACE_GAP_MM,
  SAFE_MARGIN_MM,
  type SpecPreset,
} from '@/constants/idCard';
import type { AlignMode, CopyCount, FaceKind, FaceOffset, LayoutMode } from '@/types/idCard';

export interface SizeMm {
  widthMm: number;
  heightMm: number;
}

export interface PlacedFace {
  kind: FaceKind;
  xMm: number;
  yMm: number;
}

export interface LayoutPlan {
  groupSize: SizeMm;
  contentSize: SizeMm;
  placed: PlacedFace[];
  overflow: boolean;
}

export interface LayoutPlanInput {
  mode: LayoutMode;
  align: AlignMode;
  copies: CopyCount;
  preset: SpecPreset;
  /** 正反面之间的间距（mm） */
  gapMm: number;
  /** 实际参与排版的面位，按展示顺序 */
  kinds: readonly FaceKind[];
  offsets: Partial<Record<FaceKind, FaceOffset>>;
}

/** 把坐标钳制在页面安全区内，越界时取边界值（R8） */
const clampAxis = (valueMm: number, sizeMm: number, totalMm: number): number => {
  const upperBound = Math.max(CLAMP_MARGIN_MM, totalMm - sizeMm - CLAMP_MARGIN_MM);
  return clamp(CLAMP_MARGIN_MM, upperBound, valueMm);
};

const buildGroupSize = (
  mode: LayoutMode,
  count: number,
  preset: SpecPreset,
  gapMm: number,
): SizeMm => {
  if (count <= 0) {
    return { widthMm: preset.widthMm, heightMm: preset.heightMm };
  }
  if (mode === 'vertical') {
    return {
      widthMm: preset.widthMm,
      heightMm: count * preset.heightMm + (count - 1) * gapMm,
    };
  }
  return {
    widthMm: count * preset.widthMm + (count - 1) * gapMm,
    heightMm: preset.heightMm,
  };
};

const buildContentSize = (group: SizeMm, copies: CopyCount): SizeMm =>
  copies === 1
    ? group
    : { widthMm: group.widthMm, heightMm: copies * group.heightMm + (copies - 1) * COPY_GAP_MM };

const resolveOrigin = (align: AlignMode, availableMm: number, sizeMm: number): number =>
  align === 'margin' ? SAFE_MARGIN_MM : (availableMm - sizeMm) / 2;

const placeInGroup = (
  mode: LayoutMode,
  index: number,
  originX: number,
  originY: number,
  preset: SpecPreset,
  gapMm: number,
): { xMm: number; yMm: number } => {
  if (mode === 'vertical') {
    return { xMm: originX, yMm: originY + index * (preset.heightMm + gapMm) };
  }
  return { xMm: originX + index * (preset.widthMm + gapMm), yMm: originY };
};

/**
 * 在毫米空间计算整页版式；最终像素换算统一在渲染阶段完成。
 * 同一面位的偏移（offset）会同时作用于该面的所有份，保证多份之间保持对齐。
 */
export function buildLayoutPlan(input: LayoutPlanInput): LayoutPlan {
  const { mode, align, copies, preset, kinds, offsets } = input;
  // 间距异常（NaN / 负数）时回退到默认值，避免整页版式失效
  const gapMm = Number.isFinite(input.gapMm) ? Math.max(0, input.gapMm) : DEFAULT_FACE_GAP_MM;
  const groupSize = buildGroupSize(mode, kinds.length, preset, gapMm);
  const contentSize = buildContentSize(groupSize, copies);
  const originX = resolveOrigin(align, A4.widthMm, groupSize.widthMm);
  const firstGroupY = resolveOrigin(align, A4.heightMm, contentSize.heightMm);

  const placed: PlacedFace[] = [];
  for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
    const groupY = firstGroupY + copyIndex * (groupSize.heightMm + COPY_GAP_MM);
    kinds.forEach((kind, index) => {
      const base = placeInGroup(mode, index, originX, groupY, preset, gapMm);
      const offset = offsets[kind] ?? { xMm: 0, yMm: 0 };
      placed.push({
        kind,
        xMm: clampAxis(base.xMm + offset.xMm, preset.widthMm, A4.widthMm),
        yMm: clampAxis(base.yMm + offset.yMm, preset.heightMm, A4.heightMm),
      });
    });
  }

  const availableWidthMm = A4.widthMm - 2 * SAFE_MARGIN_MM;
  const availableHeightMm = A4.heightMm - 2 * SAFE_MARGIN_MM;

  return {
    groupSize,
    contentSize,
    placed,
    overflow: contentSize.widthMm > availableWidthMm || contentSize.heightMm > availableHeightMm,
  };
}

/** 取该面位的第一份实例坐标，用于拖动基准 */
export const findPlacedFace = (plan: LayoutPlan, kind: FaceKind): PlacedFace | undefined =>
  plan.placed.find((face) => face.kind === kind);

/** 把面位目标坐标钳制到页面安全区，供拖动微调使用（R8） */
export const clampFacePosition = (
  xMm: number,
  yMm: number,
  preset: SpecPreset,
): { xMm: number; yMm: number } => ({
  xMm: clampAxis(xMm, preset.widthMm, A4.widthMm),
  yMm: clampAxis(yMm, preset.heightMm, A4.heightMm),
});
