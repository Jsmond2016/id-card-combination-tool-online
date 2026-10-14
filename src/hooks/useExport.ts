import { useBoolean, useMemoizedFn } from 'ahooks';
import { App } from 'antd';
import { useMemo } from 'react';

import { useIdCardStore } from '@/stores/useIdCardStore';
import type { ExportFormat } from '@/types/idCard';
import {
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  FORMAT_MIME,
  buildFileName,
  canvasToBlob,
  createPdfBlob,
  downloadBlob,
} from '@/utils/export';

export interface ExportModel {
  exporting: boolean;
  /** 供界面展示的示例文件名 */
  sampleFileName: string;
  handleExport: () => Promise<void>;
}

const renderBlob = async (canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> => {
  if (format === 'pdf') {
    return createPdfBlob(canvas);
  }
  if (format === 'png') {
    return canvasToBlob(canvas, FORMAT_MIME.png);
  }
  return canvasToBlob(canvas, FORMAT_MIME.jpeg, 0.95);
};

export function useExport(
  composeAt: (pxPerMm: number) => HTMLCanvasElement,
  exportPxPerMm: number,
  hasContent: boolean,
): ExportModel {
  const { message } = App.useApp();
  const format = useIdCardStore((state) => state.exportSettings.format);
  const [exporting, exportingAction] = useBoolean(false);

  const sampleFileName = useMemo(() => buildFileName(FORMAT_EXTENSION[format]), [format]);

  const handleExport = useMemoizedFn(async () => {
    if (!hasContent) {
      message.warning('请先上传至少一面身份证图片。');
      return;
    }
    exportingAction.setTrue();
    try {
      const canvas = composeAt(exportPxPerMm);
      const blob = await renderBlob(canvas, format);
      downloadBlob(blob, buildFileName(FORMAT_EXTENSION[format]));
      message.success(`已导出${FORMAT_LABEL[format]}，打印时请选择实际大小（100%）。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      exportingAction.setFalse();
    }
  });

  return { exporting, sampleFileName, handleExport };
}
