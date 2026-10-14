import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Flex, InputNumber, Radio, Slider, Switch, Typography } from 'antd';

import { FieldRow } from '@/components/FieldRow';
import {
  DEFAULT_FACE_GAP_MM,
  FACE_GAP_RANGE_MM,
  SAFE_MARGIN_MM,
  SPEC_PRESETS,
} from '@/constants/idCard';
import type { SpecPresetId } from '@/constants/idCard';
import { useIdCardStore } from '@/stores/useIdCardStore';
import { FACE_META, FACE_ORDER } from '@/types/idCard';
import type { AlignMode, CopyCount, LayoutMode } from '@/types/idCard';

export const LayoutPanel = () => {
  const layout = useIdCardStore((state) => state.layout);
  const setLayout = useIdCardStore((state) => state.setLayout);
  const faces = useIdCardStore((state) => state.faces);
  const patchFace = useIdCardStore((state) => state.patchFace);
  const resetOffsets = useIdCardStore((state) => state.resetOffsets);

  const activeKinds = FACE_ORDER.filter((kind) => Boolean(faces[kind].source));
  const currentPreset = SPEC_PRESETS.find((item) => item.id === layout.specId) ?? SPEC_PRESETS[0];

  return (
    <Card title="第二步：排版设置">
      <Flex vertical gap={16}>
        <FieldRow label="尺寸规格（锁定为标准值，不提供自由尺寸）" hint={currentPreset.description}>
          <Radio.Group
            value={layout.specId}
            optionType="button"
            buttonStyle="solid"
            onChange={(event) => setLayout({ specId: event.target.value as SpecPresetId })}
            options={SPEC_PRESETS.map((preset) => ({
              label: preset.label,
              value: preset.id,
            }))}
          />
        </FieldRow>

        <FieldRow label="正反面排列方式">
          <Radio.Group
            value={layout.mode}
            onChange={(event) => setLayout({ mode: event.target.value as LayoutMode })}
            options={[
              { label: '上下排列', value: 'vertical' },
              { label: '左右排列', value: 'horizontal' },
            ]}
          />
        </FieldRow>

        <FieldRow
          label={`正反面间距（mm，默认 ${DEFAULT_FACE_GAP_MM}）`}
          hint={`国家标准只规定身份证卡体尺寸，未规定复印件上正反面的间距；本工具默认 ${DEFAULT_FACE_GAP_MM}mm，可在 ${FACE_GAP_RANGE_MM.min}–${FACE_GAP_RANGE_MM.max}mm 之间调节。`}
        >
          <Flex align="center" gap={12} className="w-full">
            <Slider
              className="flex-1"
              min={FACE_GAP_RANGE_MM.min}
              max={FACE_GAP_RANGE_MM.max}
              step={1}
              value={layout.gapMm}
              onChange={(value) => setLayout({ gapMm: value })}
            />
            <InputNumber
              size="small"
              className="!w-20"
              min={FACE_GAP_RANGE_MM.min}
              max={FACE_GAP_RANGE_MM.max}
              step={1}
              value={layout.gapMm}
              onChange={(value) => setLayout({ gapMm: value ?? DEFAULT_FACE_GAP_MM })}
            />
            <Typography.Text type="secondary" className="text-xs">
              mm
            </Typography.Text>
          </Flex>
        </FieldRow>

        <FieldRow label="页面位置">
          <Radio.Group
            value={layout.align}
            onChange={(event) => setLayout({ align: event.target.value as AlignMode })}
            options={[
              { label: '居中', value: 'center' },
              { label: `距边 ${SAFE_MARGIN_MM}mm`, value: 'margin' },
            ]}
          />
        </FieldRow>

        <FieldRow label="每页份数（1 份 = 正面 + 反面）">
          <Radio.Group
            value={layout.copies}
            onChange={(event) => setLayout({ copies: event.target.value as CopyCount })}
            options={[
              { label: '1 份', value: 1 },
              { label: '2 份', value: 2 },
            ]}
          />
        </FieldRow>

        {activeKinds.length > 0 ? (
          <FieldRow
            label="位置微调（mm，步进 0.5）"
            hint="同一面位的偏移会同时作用于该面的所有份，保证多份之间保持对齐。"
          >
            <Flex vertical gap={8}>
              {activeKinds.map((kind) => (
                <Flex key={kind} align="center" gap={8}>
                  <Typography.Text className="w-10 shrink-0 text-xs">
                    {FACE_META[kind].shortLabel}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="text-xs">
                    X
                  </Typography.Text>
                  <InputNumber
                    size="small"
                    step={0.5}
                    value={faces[kind].offset.xMm}
                    onChange={(value) =>
                      patchFace(kind, {
                        offset: { ...faces[kind].offset, xMm: value ?? 0 },
                      })
                    }
                  />
                  <Typography.Text type="secondary" className="text-xs">
                    Y
                  </Typography.Text>
                  <InputNumber
                    size="small"
                    step={0.5}
                    value={faces[kind].offset.yMm}
                    onChange={(value) =>
                      patchFace(kind, {
                        offset: { ...faces[kind].offset, yMm: value ?? 0 },
                      })
                    }
                  />
                  <Typography.Text type="secondary" className="text-xs">
                    mm
                  </Typography.Text>
                </Flex>
              ))}
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={resetOffsets}
                className="self-start"
              >
                复位位置
              </Button>
            </Flex>
          </FieldRow>
        ) : null}

        <FieldRow
          inline
          label="预览参考标尺"
          hint="显示 mm 刻度与吸附参考线，仅屏幕显示、不参与导出；拖拽时靠近页面中心、安全边距或另一面位边缘会自动吸附，精确数值仍可用上方 X / Y 输入框设置。"
        >
          <Switch
            checked={layout.showPreviewRuler}
            onChange={(checked) => setLayout({ showPreviewRuler: checked })}
          />
        </FieldRow>

        <FieldRow
          inline
          label="打印校准尺"
          hint="在页面底部绘制 50mm 标尺：打印后用尺子量一量，即可确认打印机有没有把页面缩放过。"
        >
          <Switch
            checked={layout.showCalibrationRuler}
            onChange={(checked) => setLayout({ showCalibrationRuler: checked })}
          />
        </FieldRow>
      </Flex>
    </Card>
  );
};
