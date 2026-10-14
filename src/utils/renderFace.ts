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

/**
 * 把某个面位渲染为目标像素尺寸的画布。
 * 裁剪信息缺失或不可用时回退到「按规格比例的居中默认裁剪」，保证只要上传了图片就一定有画面，
 * 不会因为裁剪数据异常而渲染出空白纸张。
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
  const crop = isValidCropArea(face.croppedAreaPixels)
    ? face.croppedAreaPixels
    : computeDefaultCrop(image.naturalWidth, image.naturalHeight, preset.widthMm / preset.heightMm);
  return renderCroppedFace(
    image,
    crop,
    toTotalRotation(face.quarterTurns, face.fineRotation),
    preset.widthMm * pxPerMm,
    preset.heightMm * pxPerMm,
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
