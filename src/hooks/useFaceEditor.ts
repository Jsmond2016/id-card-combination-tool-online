import { useMemoizedFn } from 'ahooks';
import { App } from 'antd';
import { useMemo } from 'react';

import { getSpecPreset, MIN_RECOMMENDED_DPI } from '@/constants/idCard';
import { useIdCardStore } from '@/stores/useIdCardStore';
import { FACE_META } from '@/types/idCard';
import type { FaceKind } from '@/types/idCard';
import {
  computeDefaultCrop,
  estimateEffectiveDpi,
  loadImage,
  releaseImage,
  validateImageFile,
} from '@/utils/image';

export interface FaceEditorModel {
  handleSelectFile: (file: File) => Promise<void>;
  handleRemove: () => void;
  handleResetEdit: () => void;
  effectiveDpi: number | null;
  lowResolution: boolean;
}

export function useFaceEditor(kind: FaceKind): FaceEditorModel {
  const { message } = App.useApp();
  const face = useIdCardStore((state) => state.faces[kind]);
  const setSource = useIdCardStore((state) => state.setSource);
  const patchFace = useIdCardStore((state) => state.patchFace);
  const resetFaceEdit = useIdCardStore((state) => state.resetFaceEdit);
  const preset = useIdCardStore((state) => getSpecPreset(state.layout.specId));

  const handleSelectFile = useMemoizedFn(async (file: File) => {
    const validation = validateImageFile(file);
    if (!validation.ok) {
      message.error(validation.message);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      if (face.source) {
        releaseImage(face.source.objectUrl);
      }
      setSource(kind, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'image/jpeg',
        objectUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      patchFace(kind, {
        crop: { x: 0, y: 0 },
        zoom: 1,
        quarterTurns: 0,
        fineRotation: 0,
        offset: { xMm: 0, yMm: 0 },
        croppedAreaPixels: computeDefaultCrop(
          image.naturalWidth,
          image.naturalHeight,
          preset.widthMm / preset.heightMm,
        ),
      });
      message.success(`${FACE_META[kind].shortLabel}图片已就绪，可继续调整裁剪范围。`);
    } catch (error) {
      releaseImage(objectUrl);
      message.error(error instanceof Error ? error.message : '图片加载失败，请重试。');
    }
  });

  const handleRemove = useMemoizedFn(() => {
    if (face.source) {
      releaseImage(face.source.objectUrl);
    }
    setSource(kind, null);
  });

  const handleResetEdit = useMemoizedFn(() => {
    resetFaceEdit(kind);
    message.success(`${FACE_META[kind].shortLabel}裁剪与旋转已复位。`);
  });

  const effectiveDpi = useMemo(() => {
    const crop = face.croppedAreaPixels;
    if (!crop) {
      return null;
    }
    return estimateEffectiveDpi(crop.width, preset.widthMm);
  }, [face.croppedAreaPixels, preset.widthMm]);

  return {
    handleSelectFile,
    handleRemove,
    handleResetEdit,
    effectiveDpi,
    lowResolution: effectiveDpi !== null && effectiveDpi < MIN_RECOMMENDED_DPI,
  };
}
