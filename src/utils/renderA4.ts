import { A4, CALIBRATION_RULER_MM, type SpecPreset } from '@/constants/idCard';
import type { FaceKind } from '@/types/idCard';
import type { LayoutPlan } from '@/utils/geometry';

export interface ComposeA4Input {
  /** 每毫米对应多少像素，统一驱动尺寸换算（预览与导出共用同一套代码） */
  pxPerMm: number;
  plan: LayoutPlan;
  preset: SpecPreset;
  faceCanvases: Partial<Record<FaceKind, HTMLCanvasElement>>;
  showCalibrationRuler: boolean;
}

export const createCanvas = (widthPx: number, heightPx: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));
  return canvas;
};

export function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D，无法生成 A4 页面。');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

function drawCalibrationRuler(context: CanvasRenderingContext2D, pxPerMm: number): void {
  const bottomMm = A4.heightMm - 8;
  const startX = (A4.widthMm - CALIBRATION_RULER_MM) / 2;
  const endX = startX + CALIBRATION_RULER_MM;
  const tickMm = 2.5;

  const toPx = (mm: number) => Math.round(mm * pxPerMm);

  context.save();
  context.strokeStyle = '#8c8c8c';
  context.fillStyle = '#8c8c8c';
  context.lineWidth = Math.max(1, Math.round(0.2 * pxPerMm));
  context.beginPath();
  context.moveTo(toPx(startX), toPx(bottomMm));
  context.lineTo(toPx(endX), toPx(bottomMm));
  context.moveTo(toPx(startX), toPx(bottomMm - tickMm));
  context.lineTo(toPx(startX), toPx(bottomMm));
  context.moveTo(toPx(endX), toPx(bottomMm - tickMm));
  context.lineTo(toPx(endX), toPx(bottomMm));
  context.stroke();

  context.font = `${Math.max(8, Math.round(3 * pxPerMm))}px sans-serif`;
  context.textAlign = 'center';
  context.fillText(
    `打印校准尺 ${CALIBRATION_RULER_MM}mm（100% 打印时实测应为 ${CALIBRATION_RULER_MM}mm）`,
    toPx((startX + endX) / 2),
    toPx(bottomMm - tickMm - 1.5),
  );
  context.restore();
}

/** 合成 A4 页面画布：白底 + 按版式绘制各面位 + 可选校准尺 */
export function composeA4Canvas(input: ComposeA4Input): HTMLCanvasElement {
  const { pxPerMm, plan, preset, faceCanvases, showCalibrationRuler } = input;
  const canvas = createCanvas(A4.widthMm * pxPerMm, A4.heightMm * pxPerMm);
  const context = get2dContext(canvas);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const widthPx = Math.round(preset.widthMm * pxPerMm);
  const heightPx = Math.round(preset.heightMm * pxPerMm);

  plan.placed.forEach((placed) => {
    const faceCanvas = faceCanvases[placed.kind];
    if (!faceCanvas) {
      return;
    }
    context.drawImage(
      faceCanvas,
      Math.round(placed.xMm * pxPerMm),
      Math.round(placed.yMm * pxPerMm),
      widthPx,
      heightPx,
    );
  });

  if (showCalibrationRuler) {
    drawCalibrationRuler(context, pxPerMm);
  }

  return canvas;
}
