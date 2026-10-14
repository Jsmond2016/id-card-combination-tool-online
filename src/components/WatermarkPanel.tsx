import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Flex, Input, InputNumber, Slider, Switch, Typography } from 'antd';

import { FieldRow } from '@/components/FieldRow';
import {
  WATERMARK_ANGLE_RANGE_DEG,
  WATERMARK_FONT_SIZE_RANGE_MM,
  WATERMARK_SPACING_RANGE_MM,
  WATERMARK_TEXT_MAX_LENGTH,
} from '@/constants/idCard';
import { useIdCardStore } from '@/stores/useIdCardStore';

/** 占位文案同时作为 E2E 定位输入框的锚点，修改时需同步 scripts/verify-e2e.mjs */
const TEXT_PLACEHOLDER = '例如：仅供办理业务使用';

interface WatermarkSliderProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

/** 滑块 + 数值输入：两者共用同一份取值，数值框被清空时保留当前值 */
const WatermarkSlider = ({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: WatermarkSliderProps) => (
  <FieldRow label={label} hint={hint}>
    <Flex align="center" gap={12} className="w-full">
      <Slider
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
      />
      <InputNumber
        size="small"
        className="!w-20"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(next) => onChange(next ?? value)}
      />
      <Typography.Text type="secondary" className="text-xs">
        {suffix}
      </Typography.Text>
    </Flex>
  </FieldRow>
);

export const WatermarkPanel = () => {
  const watermark = useIdCardStore((state) => state.watermark);
  const setWatermark = useIdCardStore((state) => state.setWatermark);
  const resetWatermark = useIdCardStore((state) => state.resetWatermark);
  const { enabled, text, fontSizeMm, spacingMm, angleDeg } = watermark;

  return (
    <Card title="水印（可选）">
      <Flex vertical gap={16}>
        <FieldRow
          label="启用水印"
          hint="水印平铺覆盖整页 A4，并压在身份证图像之上，打印后无法通过裁剪图片去掉；只影响观感，不改变身份证尺寸与导出页面尺寸（A4 210 × 297mm）。"
        >
          <Flex align="center" gap={12}>
            <Switch checked={enabled} onChange={(next) => setWatermark({ enabled: next })} />
            <Typography.Text type="secondary" className="text-xs">
              {enabled ? '已开启，右侧 A4 预览即为打印效果' : '默认关闭'}
            </Typography.Text>
          </Flex>
        </FieldRow>

        <FieldRow label={`水印文字（最多 ${WATERMARK_TEXT_MAX_LENGTH} 个字，超出自动截断）`}>
          <Input
            value={text}
            maxLength={WATERMARK_TEXT_MAX_LENGTH}
            showCount
            placeholder={TEXT_PLACEHOLDER}
            onChange={(event) => setWatermark({ text: event.target.value })}
          />
        </FieldRow>

        {enabled && !text ? (
          <Typography.Text type="warning" className="text-xs">
            水印文字为空，当前不会绘制任何水印。
          </Typography.Text>
        ) : null}

        <WatermarkSlider
          label={`水印大小（字号 ${fontSizeMm}mm）`}
          hint="字号即单个水印的高度基准，4–24mm；常规复印件建议 8mm 左右。"
          value={fontSizeMm}
          min={WATERMARK_FONT_SIZE_RANGE_MM.min}
          max={WATERMARK_FONT_SIZE_RANGE_MM.max}
          step={1}
          suffix="mm"
          onChange={(next) => setWatermark({ fontSizeMm: next })}
        />

        <WatermarkSlider
          label={`平铺密度（间距 ${spacingMm}mm）`}
          hint="间距是相邻两行 / 两列水印之间的空隙，数值越小水印越密；20–120mm。"
          value={spacingMm}
          min={WATERMARK_SPACING_RANGE_MM.min}
          max={WATERMARK_SPACING_RANGE_MM.max}
          step={5}
          suffix="mm"
          onChange={(next) => setWatermark({ spacingMm: next })}
        />

        <WatermarkSlider
          label={`倾斜角度（${angleDeg}°）`}
          hint="正值为顺时针；常用 30° 左右的斜向水印，0° 为水平排列。"
          value={angleDeg}
          min={WATERMARK_ANGLE_RANGE_DEG.min}
          max={WATERMARK_ANGLE_RANGE_DEG.max}
          step={5}
          suffix="°"
          onChange={(next) => setWatermark({ angleDeg: next })}
        />

        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={resetWatermark}
          className="self-start"
        >
          恢复水印默认值
        </Button>
      </Flex>
    </Card>
  );
};
