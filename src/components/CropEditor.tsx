import { ReloadOutlined, RotateLeftOutlined, RotateRightOutlined } from '@ant-design/icons';
import { useMemoizedFn } from 'ahooks';
import { Button, Divider, Flex, Modal, Segmented, Slider, Space, Typography } from 'antd';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

import { FaceOutputPreview } from '@/components/FaceOutputPreview';
import { PerspectiveEditor } from '@/components/PerspectiveEditor';
import { EDGE_OFFSET_RANGE_PERCENT, getSpecPreset } from '@/constants/idCard';
import { useFaceEditor } from '@/hooks/useFaceEditor';
import { useIdCardStore } from '@/stores/useIdCardStore';
import { FACE_META } from '@/types/idCard';
import type { FaceKind } from '@/types/idCard';
import { isValidCropArea, toTotalRotation } from '@/utils/image';

interface CropEditorProps {
  kind: FaceKind;
  open: boolean;
  onClose: () => void;
}

type EditorMode = 'crop' | 'perspective';

const MODE_OPTIONS = [
  { label: '矩形裁剪（平拍）', value: 'crop' },
  { label: '透视矫正（斜拍）', value: 'perspective' },
];

export const CropEditor = ({ kind, open, onClose }: CropEditorProps) => {
  const face = useIdCardStore((state) => state.faces[kind]);
  const preset = useIdCardStore((state) => getSpecPreset(state.layout.specId));
  const patchFace = useIdCardStore((state) => state.patchFace);
  const editor = useFaceEditor(kind);
  const source = face.source;

  // 模式直接由 store 派生，避免"弹窗重开后开关与状态不一致"
  const mode: EditorMode = face.rectify.enabled ? 'perspective' : 'crop';

  const handleModeChange = useMemoizedFn((value: string | number) => {
    patchFace(kind, { rectify: { ...face.rectify, enabled: value === 'perspective' } });
  });

  const handleCropChange = useMemoizedFn((location: Point) => {
    patchFace(kind, { crop: location });
  });

  const handleZoomChange = useMemoizedFn((zoom: number) => {
    patchFace(kind, { zoom });
  });

  const handleCropComplete = useMemoizedFn((_area: Area, areaPixels: Area) => {
    const next = {
      x: areaPixels.x,
      y: areaPixels.y,
      width: areaPixels.width,
      height: areaPixels.height,
    };
    // 弹窗关闭、容器尺寸不可用时该库会回传 NaN，写入 store 会让成品变成空白，必须拦截
    if (!isValidCropArea(next)) {
      return;
    }
    patchFace(kind, { croppedAreaPixels: next });
  });

  const rotateQuarter = useMemoizedFn((delta: number) => {
    patchFace(kind, { quarterTurns: (((face.quarterTurns + delta) % 4) + 4) % 4 });
  });

  if (!source) {
    return null;
  }

  return (
    <Modal
      title={`${FACE_META[kind].label} · 调整裁剪与透视`}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="完成"
      cancelText="取消"
      width={880}
    >
      <Segmented
        block
        className="mb-3"
        value={mode}
        options={MODE_OPTIONS}
        onChange={handleModeChange}
      />

      {mode === 'crop' ? (
        <div className="relative h-[340px] w-full overflow-hidden rounded bg-gray-800">
          <Cropper
            image={source.objectUrl}
            crop={face.crop}
            zoom={face.zoom}
            rotation={toTotalRotation(face.quarterTurns, face.fineRotation)}
            aspect={preset.widthMm / preset.heightMm}
            objectFit="contain"
            showGrid
            onCropChange={handleCropChange}
            onZoomChange={handleZoomChange}
            onCropComplete={handleCropComplete}
          />
        </div>
      ) : (
        <PerspectiveEditor kind={kind} />
      )}

      <Flex gap={24} wrap className="mt-4">
        <Flex vertical gap={4} className="min-w-[min(320px,100%)] flex-1">
          {mode === 'crop' ? (
            <>
              <Typography.Text type="secondary" className="text-xs">
                缩放
              </Typography.Text>
              <Slider
                min={1}
                max={4}
                step={0.01}
                value={face.zoom}
                onChange={(value) => patchFace(kind, { zoom: value })}
              />
              <Typography.Text type="secondary" className="text-xs">
                旋转微调（-45° ~ 45°，步进 0.1°）
              </Typography.Text>
              <Slider
                min={-45}
                max={45}
                step={0.1}
                value={face.fineRotation}
                onChange={(value) => patchFace(kind, { fineRotation: value })}
              />
            </>
          ) : (
            <>
              <Typography.Text type="secondary" className="text-xs">
                边缘微调（正值向内收缩、切掉卡边外的残余背景）
              </Typography.Text>
              <Slider
                min={EDGE_OFFSET_RANGE_PERCENT.min}
                max={EDGE_OFFSET_RANGE_PERCENT.max}
                step={0.1}
                value={face.rectify.edgeOffsetPercent}
                onChange={(value) =>
                  patchFace(kind, { rectify: { ...face.rectify, edgeOffsetPercent: value } })
                }
              />
            </>
          )}
          <Space wrap>
            {mode === 'crop' && (
              <>
                <Button icon={<RotateLeftOutlined />} onClick={() => rotateQuarter(-1)}>
                  左转 90°
                </Button>
                <Button icon={<RotateRightOutlined />} onClick={() => rotateQuarter(1)}>
                  右转 90°
                </Button>
              </>
            )}
            <Button icon={<ReloadOutlined />} onClick={editor.handleResetEdit}>
              复位
            </Button>
          </Space>
        </Flex>

        <Flex vertical align="center" gap={8}>
          <FaceOutputPreview kind={kind} widthPx={220} />
          <Typography.Text type="secondary" className="text-xs">
            成品预览 · 严格为 {preset.label}
          </Typography.Text>
        </Flex>
      </Flex>

      <Divider className="!my-3" />
      <Typography.Text type="secondary" className="text-xs">
        {mode === 'crop'
          ? `拖动图片调整位置，滚轮或双指缩放。裁剪框比例被锁定为 ${preset.label}，无论怎么缩放，导出尺寸都不会改变。`
          : `斜拍时卡片在画面里是梯形，矩形裁剪框永远会露出四角背景。把四个角点对齐到卡片四角后，图像会被拉正为正投影矩形，卡外一律填白 —— 这正是复印机「贴玻璃翻拍」的成像方式。当前导出尺寸仍严格为 ${preset.label}。`}
      </Typography.Text>
    </Modal>
  );
};
