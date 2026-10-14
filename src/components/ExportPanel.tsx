import { DownloadOutlined } from '@ant-design/icons';
import { Button, Card, Flex, Radio, Segmented, Typography } from 'antd';

import { FieldRow } from '@/components/FieldRow';
import { DPI_OPTIONS } from '@/constants/idCard';
import type { DpiOption } from '@/constants/idCard';
import { useExport } from '@/hooks/useExport';
import type { ProjectModel } from '@/hooks/useProject';
import { useIdCardStore } from '@/stores/useIdCardStore';
import type { ExportFormat } from '@/types/idCard';
import { FORMAT_LABEL, FORMAT_SHORT_LABEL } from '@/utils/export';

const FORMAT_ORDER: ExportFormat[] = ['pdf', 'png', 'jpeg'];

interface ExportPanelProps {
  model: ProjectModel;
}

export const ExportPanel = ({ model }: ExportPanelProps) => {
  const exportSettings = useIdCardStore((state) => state.exportSettings);
  const setExportSettings = useIdCardStore((state) => state.setExportSettings);
  const { exporting, sampleFileName, handleExport } = useExport(
    model.composeAt,
    model.exportPxPerMm,
    model.hasContent,
  );

  return (
    <Card title="第三步：导出">
      <Flex vertical gap={16}>
        <FieldRow label="导出格式">
          <Radio.Group
            value={exportSettings.format}
            buttonStyle="solid"
            optionType="button"
            onChange={(event) => setExportSettings({ format: event.target.value as ExportFormat })}
            options={FORMAT_ORDER.map((format) => ({
              label: FORMAT_LABEL[format],
              value: format,
            }))}
          />
        </FieldRow>

        <FieldRow label="输出精度" hint="300 DPI 为推荐打印精度；150 DPI 文件更小，但打印略模糊。">
          <Segmented
            value={exportSettings.dpi}
            onChange={(value) => setExportSettings({ dpi: value as DpiOption })}
            options={DPI_OPTIONS.map((dpi) => ({ label: `${dpi} DPI`, value: dpi }))}
          />
        </FieldRow>

        <Button
          type="primary"
          size="large"
          block
          icon={<DownloadOutlined />}
          loading={exporting}
          onClick={handleExport}
        >
          导出 {FORMAT_SHORT_LABEL[exportSettings.format]} 并下载
        </Button>

        <Typography.Text type="secondary" className="text-xs">
          文件名为 {sampleFileName}。导出后请用「实际大小 / 100%」打印。
        </Typography.Text>
      </Flex>
    </Card>
  );
};
