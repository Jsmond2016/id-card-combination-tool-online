import { fromPairs } from 'ramda';

import type { SpecPreset } from '@/constants/idCard';
import type { FaceKind, FaceState } from '@/types/idCard';
import {
  computeDefaultCrop,
  getLoadedImage,
  isValidCropArea,
  renderCroppedFace,
  toTotalRotation,
} from '@/utils/image';
import { renderRectifiedFace, resolveFaceQuad } from '@/utils/rectify';

/**
 * 把某个面位渲染为目标像素尺寸的画布。
 *
 * 透视矫正开启时先走矫正链路（R22）：四角数据不可用时由 resolveFaceQuad 回退默认四角，
 * 矩阵退化时再由下面的矩形裁剪兜底 —— 保证只要上传了图片就一定有画面，不会渲染出空白纸张。
 */
export const renderFaceCanvas = (
  face: FaceState,
  preset: SpecPreset,
  pxPerMm: number,
): HTMLCanvasElement | null => {
  const source = face.source;
  const image = source ? getLoadedImage(source.objectUrl) : null;
  if (!source || !image) {
    return null;
  }
  const targetWidthPx = preset.widthMm * pxPerMm;
  const targetHeightPx = preset.heightMm * pxPerMm;
  if (face.rectify.enabled) {
    const rectified = renderRectifiedFace(
      image,
      resolveFaceQuad(
        face.rectify.quad,
        image.naturalWidth,
        image.naturalHeight,
        preset.widthMm / preset.heightMm,
      ),
      {
        targetWidthPx,
        targetHeightPx,
        pxPerMm,
        preset,
        edgeOffsetPercent: face.rectify.edgeOffsetPercent,
        cacheKey: source.objectUrl,
      },
    );
    if (rectified) {
      return rectified;
    }
  }
  const crop = isValidCropArea(face.croppedAreaPixels)
    ? face.croppedAreaPixels
    : computeDefaultCrop(image.naturalWidth, image.naturalHeight, preset.widthMm / preset.heightMm);
  return renderCroppedFace(
    image,
    crop,
    toTotalRotation(face.quarterTurns, face.fineRotation),
    targetWidthPx,
    targetHeightPx,
  );
};

/** 批量渲染参与排版的面位，返回可直接用于 A4 合成的画布映射 */
export function buildFaceCanvasMap(
  kinds: readonly FaceKind[],
  faces: Record<FaceKind, FaceState>,
  preset: SpecPreset,
  pxPerMm: number,
): Partial<Record<FaceKind, HTMLCanvasElement>> {
  const entries: Array<[FaceKind, HTMLCanvasElement]> = [];
  kinds.forEach((kind) => {
    const canvas = renderFaceCanvas(faces[kind], preset, pxPerMm);
    if (canvas) {
      entries.push([kind, canvas]);
    }
  });
  return fromPairs(entries) as Partial<Record<FaceKind, HTMLCanvasElement>>;
}
