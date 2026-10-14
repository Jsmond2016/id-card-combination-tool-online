import { useEffect, useRef } from 'react';

import { getSpecPreset } from '@/constants/idCard';
import { useIdCardStore } from '@/stores/useIdCardStore';
import type { FaceKind } from '@/types/idCard';
import { renderFaceCanvas } from '@/utils/renderFace';

interface FaceOutputPreviewProps {
  kind: FaceKind;
  widthPx?: number;
  className?: string;
}

/** 面位的"成品效果"预览：始终按所选规格的毫米尺寸输出，所见即所得 */
export const FaceOutputPreview = ({ kind, widthPx = 240, className }: FaceOutputPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const face = useIdCardStore((state) => state.faces[kind]);
  const preset = useIdCardStore((state) => getSpecPreset(state.layout.specId));
  const pxPerMm = widthPx / preset.widthMm;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = Math.max(1, Math.round(preset.widthMm * pxPerMm));
    canvas.height = Math.max(1, Math.round(preset.heightMm * pxPerMm));
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fafafa';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const rendered = renderFaceCanvas(face, preset, pxPerMm);
    if (rendered) {
      context.drawImage(rendered, 0, 0, canvas.width, canvas.height);
    }
  }, [face, preset, pxPerMm]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded border border-solid border-gray-200 bg-gray-50 ${className ?? ''}`}
      style={{ width: widthPx, height: (widthPx * preset.heightMm) / preset.widthMm }}
    />
  );
};
