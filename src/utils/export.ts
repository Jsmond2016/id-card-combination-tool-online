import { A4 } from '@/constants/idCard';
import type { ExportFormat } from '@/types/idCard';

export const FORMAT_MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  pdf: 'pdf',
  png: 'png',
  jpeg: 'jpg',
};

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  pdf: 'PDF（推荐打印）',
  png: 'PNG（无损图片）',
  jpeg: 'JPG（体积小）',
};

export const FORMAT_SHORT_LABEL: Record<ExportFormat, string> = {
  pdf: 'PDF',
  png: 'PNG',
  jpeg: 'JPG',
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** 生成带时间戳的文件名，避免连续导出互相覆盖（R18） */
export function buildFileName(extension: string, now: Date = new Date()): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `身份证复印件_${date}_${time}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('导出失败，请重试或更换浏览器。'));
        }
      },
      type,
      quality,
    );
  });

/**
 * 生成单页 A4 PDF：页面物理尺寸为 210 × 297mm，图片铺满整页，
 * 因此以 100% 比例打印即为真实尺寸（R11）。
 */
export async function createPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.95),
    'JPEG',
    0,
    0,
    A4.widthMm,
    A4.heightMm,
    undefined,
    'FAST',
  );
  return pdf.output('blob');
}
