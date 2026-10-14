import { useMemo } from 'react';

import { A4, PREVIEW_WIDTH_PX, dpiToPxPerMm, getSpecPreset } from '@/constants/idCard';
import type { SpecPreset } from '@/constants/idCard';
import { useIdCardStore } from '@/stores/useIdCardStore';
import { FACE_ORDER } from '@/types/idCard';
import type { FaceKind } from '@/types/idCard';
import { buildLayoutPlan } from '@/utils/geometry';
import type { LayoutPlan } from '@/utils/geometry';
import { composeA4Canvas } from '@/utils/renderA4';
import { buildFaceCanvasMap } from '@/utils/renderFace';

/** 预览画布固定宽度，换算成与导出共用的 pxPerMm，保证预览即所得 */
const PREVIEW_PX_PER_MM = PREVIEW_WIDTH_PX / A4.widthMm;

export interface ProjectModel {
  preset: SpecPreset;
  /** 含用户位置微调的版式 */
  plan: LayoutPlan;
  /** 未应用位置微调的版式，作为拖动基准 */
  basePlan: LayoutPlan;
  activeKinds: FaceKind[];
  previewPxPerMm: number;
  exportPxPerMm: number;
  hasContent: boolean;
  composeAt: (pxPerMm: number) => HTMLCanvasElement;
}

export function useProject(): ProjectModel {
  const faces = useIdCardStore((state) => state.faces);
  const layout = useIdCardStore((state) => state.layout);
  const exportDpi = useIdCardStore((state) => state.exportSettings.dpi);

  const preset = useMemo(() => getSpecPreset(layout.specId), [layout.specId]);

  // 只要上传了图片就参与排版：裁剪数据异常时渲染层会回退到默认裁剪，避免整张图从纸张上消失
  const activeKinds = useMemo(
    () => FACE_ORDER.filter((kind) => Boolean(faces[kind].source)),
    [faces],
  );

  const offsets = useMemo(
    () => ({ front: faces.front.offset, back: faces.back.offset }),
    [faces.front.offset, faces.back.offset],
  );

  const layoutBase = useMemo(
    () => ({
      mode: layout.mode,
      align: layout.align,
      copies: layout.copies,
      gapMm: layout.gapMm,
      preset,
    }),
    [layout.mode, layout.align, layout.copies, layout.gapMm, preset],
  );

  const plan = useMemo(
    () => buildLayoutPlan({ ...layoutBase, kinds: activeKinds, offsets }),
    [layoutBase, activeKinds, offsets],
  );

  const basePlan = useMemo(
    () => buildLayoutPlan({ ...layoutBase, kinds: activeKinds, offsets: {} }),
    [layoutBase, activeKinds],
  );

  const showCalibrationRuler = layout.showCalibrationRuler;

  /** 引用只在内容真正变化时更新，避免预览画布无意义重绘 */
  const composeAt = useMemo(
    () => (pxPerMm: number) =>
      composeA4Canvas({
        pxPerMm,
        plan,
        preset,
        faceCanvases: buildFaceCanvasMap(activeKinds, faces, preset, pxPerMm),
        showCalibrationRuler,
      }),
    [plan, preset, faces, activeKinds, showCalibrationRuler],
  );

  return {
    preset,
    plan,
    basePlan,
    activeKinds,
    previewPxPerMm: PREVIEW_PX_PER_MM,
    exportPxPerMm: dpiToPxPerMm(exportDpi),
    hasContent: activeKinds.length > 0,
    composeAt,
  };
}
