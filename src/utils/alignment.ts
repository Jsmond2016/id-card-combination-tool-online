import { A4, SAFE_MARGIN_MM, SNAP_THRESHOLD_MM } from '@/constants/idCard';
import type { PlacedFace, SizeMm } from '@/utils/geometry';

export interface SnapGuide {
  axis: 'x' | 'y';
  /** 参考线在 A4 坐标系中的位置（mm） */
  positionMm: number;
}

export interface SnapResult {
  /** 吸附后的位置（mm） */
  xMm: number;
  yMm: number;
  /** 命中的参考线，未吸附的轴向不会出现在数组中 */
  guides: SnapGuide[];
}

export interface SnapInput {
  /** 未吸附的目标位置（mm，调用方需先钳制到安全区） */
  xMm: number;
  yMm: number;
  /** 被拖动面位的尺寸（mm） */
  size: SizeMm;
  /** 其它已落位的面位，用于边缘对齐与中心对齐 */
  others: readonly PlacedFace[];
  /** 其它面位的尺寸（mm，与当前规格一致） */
  otherSize: SizeMm;
  /** 吸附阈值（mm），默认取 SNAP_THRESHOLD_MM */
  thresholdMm?: number;
}

interface AxisSnap {
  valueMm: number;
  guideMm: number | null;
}

/**
 * 单个轴向上寻找最近的参考线。
 * 一个面位在该轴上有三条可对齐的边：起始边、中心、结束边；
 * 取距离最近且在阈值内的组合作为吸附结果。
 */
const snapAxis = (
  valueMm: number,
  sizeMm: number,
  targetsMm: readonly number[],
  thresholdMm: number,
): AxisSnap => {
  const offsetsMm = [0, sizeMm / 2, sizeMm];
  let bestDeltaMm: number | null = null;
  let bestGuideMm: number | null = null;
  for (const targetMm of targetsMm) {
    for (const offsetMm of offsetsMm) {
      const deltaMm = targetMm - (valueMm + offsetMm);
      const absDeltaMm = Math.abs(deltaMm);
      const closer = bestDeltaMm === null || absDeltaMm < Math.abs(bestDeltaMm);
      if (absDeltaMm <= thresholdMm && closer) {
        bestDeltaMm = deltaMm;
        bestGuideMm = targetMm;
      }
    }
  }
  if (bestDeltaMm === null || bestGuideMm === null) {
    return { valueMm, guideMm: null };
  }
  return { valueMm: valueMm + bestDeltaMm, guideMm: bestGuideMm };
};

/** 页面级参考线：安全边距与页面中心 */
const pageTargets = (totalMm: number): number[] => [
  SAFE_MARGIN_MM,
  totalMm / 2,
  totalMm - SAFE_MARGIN_MM,
];

/** 其它面位在指定轴上的三条参考线（起始边 / 中心 / 结束边） */
const occupiedTargets = (
  others: readonly PlacedFace[],
  otherSize: SizeMm,
  axis: 'x' | 'y',
): number[] => {
  const sizeMm = axis === 'x' ? otherSize.widthMm : otherSize.heightMm;
  return others.flatMap((placed) => {
    const startMm = axis === 'x' ? placed.xMm : placed.yMm;
    return [startMm, startMm + sizeMm / 2, startMm + sizeMm];
  });
};

/**
 * 计算拖拽时的吸附位置与需要显示的参考线。
 * 参考线来源：页面安全边距、页面中心，以及其它面位的边缘与中心。
 */
export function resolveSnap(input: SnapInput): SnapResult {
  const { xMm, yMm, size, others, otherSize, thresholdMm = SNAP_THRESHOLD_MM } = input;

  const xTargets = [...pageTargets(A4.widthMm), ...occupiedTargets(others, otherSize, 'x')];
  const yTargets = [...pageTargets(A4.heightMm), ...occupiedTargets(others, otherSize, 'y')];
  const snappedX = snapAxis(xMm, size.widthMm, xTargets, thresholdMm);
  const snappedY = snapAxis(yMm, size.heightMm, yTargets, thresholdMm);

  const guides: SnapGuide[] = [];
  if (snappedX.guideMm !== null) {
    guides.push({ axis: 'x', positionMm: snappedX.guideMm });
  }
  if (snappedY.guideMm !== null) {
    guides.push({ axis: 'y', positionMm: snappedY.guideMm });
  }

  return { xMm: snappedX.valueMm, yMm: snappedY.valueMm, guides };
}
