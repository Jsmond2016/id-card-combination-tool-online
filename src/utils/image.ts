import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  MM_PER_INCH,
} from '@/constants/idCard';
import type { CropArea } from '@/types/idCard';

const HEIC_EXTENSIONS = ['heic', 'heif'];

/** 已解码完成的图片缓存，供渲染阶段同步取用 */
const settledImages = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, Promise<HTMLImageElement>>();

export interface FileValidationResult {
  ok: boolean;
  message?: string;
}

export const getFileExtension = (fileName: string): string => {
  const separatorIndex = fileName.lastIndexOf('.');
  return separatorIndex === -1 ? '' : fileName.slice(separatorIndex + 1).toLowerCase();
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const isHeicFile = (file: File): boolean => {
  const extension = getFileExtension(file.name);
  const mime = file.type.toLowerCase();
  return HEIC_EXTENSIONS.includes(extension) || HEIC_EXTENSIONS.some((item) => mime.endsWith(item));
};

export function validateImageFile(file: File): FileValidationResult {
  if (isHeicFile(file)) {
    return { ok: false, message: '暂不支持 HEIC/HEIF 格式，请在手机相册中导出为 JPG 后重新上传。' };
  }
  if (file.size === 0) {
    return { ok: false, message: '文件内容为空，请重新选择。' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `图片不能超过 ${MAX_FILE_SIZE_MB}MB，当前为 ${formatFileSize(file.size)}。`,
    };
  }
  const extensionAccepted = (ACCEPTED_EXTENSIONS as readonly string[]).includes(
    getFileExtension(file.name),
  );
  const mimeAccepted = (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase());
  if (!extensionAccepted && !mimeAccepted) {
    return { ok: false, message: `仅支持 ${ACCEPTED_EXTENSIONS.join(' / ')} 格式的图片。` };
  }
  return { ok: true };
}

export function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  const settled = settledImages.get(objectUrl);
  if (settled) {
    return Promise.resolve(settled);
  }
  const pending = pendingImages.get(objectUrl);
  if (pending) {
    return pending;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      settledImages.set(objectUrl, image);
      pendingImages.delete(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      pendingImages.delete(objectUrl);
      reject(new Error('图片解码失败，请确认文件完整后重试。'));
    };
    image.src = objectUrl;
  });

  pendingImages.set(objectUrl, promise);
  return promise;
}

export const getLoadedImage = (objectUrl: string): HTMLImageElement | null =>
  settledImages.get(objectUrl) ?? null;

/** 释放图片缓存与对象 URL，避免内存泄漏 */
export function releaseImage(objectUrl: string): void {
  settledImages.delete(objectUrl);
  pendingImages.delete(objectUrl);
  URL.revokeObjectURL(objectUrl);
}

export const toTotalRotation = (quarterTurns: number, fineRotation: number): number =>
  quarterTurns * 90 + fineRotation;

export function rotateSize(
  width: number,
  height: number,
  rotationDeg: number,
): { width: number; height: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  return {
    width: Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad)),
    height: Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad)),
  };
}

/** 按目标宽高比计算居中的默认裁剪区域（源图像素坐标） */
export function computeDefaultCrop(
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): CropArea {
  if (imageWidth / imageHeight > aspect) {
    const width = imageHeight * aspect;
    return { x: (imageWidth - width) / 2, y: 0, width, height: imageHeight };
  }
  const height = imageWidth / aspect;
  return { x: 0, y: (imageHeight - height) / 2, width: imageWidth, height };
}

/** 裁剪区域对应的有效打印精度，用于低分辨率告警（R15） */
export const estimateEffectiveDpi = (cropWidthPx: number, targetWidthMm: number): number =>
  targetWidthMm > 0 ? cropWidthPx / (targetWidthMm / MM_PER_INCH) : 0;

/**
 * 判断裁剪区域是否可用。
 * react-easy-crop 在容器尺寸不可用（例如弹窗卸载、容器被隐藏）时会通过
 * onCropComplete 回传 NaN，若原样写入 store 会让成品渲染成纯白，因此必须在入口拦截。
 */
export const isValidCropArea = (area: CropArea | null | undefined): area is CropArea =>
  Boolean(
    area &&
    Number.isFinite(area.x) &&
    Number.isFinite(area.y) &&
    Number.isFinite(area.width) &&
    Number.isFinite(area.height) &&
    area.width > 0 &&
    area.height > 0,
  );

function createContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D，无法处理图片。');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

/**
 * 把裁剪区域映射到目标画布。
 *
 * 这里把「旋转 → 裁剪 → 缩放」合成一次仿射变换直接画到目标尺寸画布上：
 * 目标坐标 = ( 旋转后坐标 - crop起点 ) × 缩放比，与"先渲染整张旋转图再裁剪"两步做法结果完全等价，
 * 但不需要为每帧分配与原图等大的中间画布（手机原图约 12MP，单张可达 50MB）。
 * 旋转后 react-easy-crop 会放开位置限制，裁剪框可能超出图片边界，超出的部分自然保留白底。
 */
function drawCropRegion(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  crop: CropArea,
  rotationDeg: number,
  targetWidth: number,
  targetHeight: number,
): void {
  if (!isValidCropArea(crop)) {
    return;
  }
  const scaleX = targetWidth / crop.width;
  const scaleY = targetHeight / crop.height;
  const box = rotateSize(image.naturalWidth, image.naturalHeight, rotationDeg);

  context.save();
  context.translate(-crop.x * scaleX, -crop.y * scaleY);
  context.scale(scaleX, scaleY);
  context.translate(box.width / 2, box.height / 2);
  context.rotate((rotationDeg * Math.PI) / 180);
  context.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
  context.drawImage(image, 0, 0);
  context.restore();
}

/**
 * 把裁剪区域一次性重采样到目标像素尺寸。
 * 输出像素只由 targetWidthPx/targetHeightPx 决定，与用户的缩放倍率无关，
 * 因此任何编辑状态下输出的物理尺寸都严格等于所选规格（R6）。
 */
export function renderCroppedFace(
  image: HTMLImageElement,
  crop: CropArea,
  rotationDeg: number,
  targetWidthPx: number,
  targetHeightPx: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetWidthPx));
  canvas.height = Math.max(1, Math.round(targetHeightPx));

  const context = createContext(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawCropRegion(context, image, crop, rotationDeg, canvas.width, canvas.height);
  return canvas;
}
