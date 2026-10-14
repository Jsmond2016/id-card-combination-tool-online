import { ReloadOutlined, RotateLeftOutlined, RotateRightOutlined } from '@ant-design/icons';
import { useMemoizedFn } from 'ahooks';
import { Button, Divider, Flex, Modal, Slider, Space, Typography } from 'antd';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

import { FaceOutputPreview } from '@/components/FaceOutputPreview';
import { getSpecPreset } from '@/constants/idCard';
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

export const CropEditor = ({ kind, open, onClose }: CropEditorProps) => {
  const face = useIdCardStore((state) => state.faces[kind]);
  const preset = useIdCardStore((state) => getSpecPreset(state.layout.specId));
  const patchFace = useIdCardStore((state) => state.patchFace);
  const editor = useFaceEditor(kind);
  const source = face.source;

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
      title={`${FACE_META[kind].label} · 调整裁剪`}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="完成"
      cancelText="取消"
      width={880}
    >
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

      <Flex gap={24} wrap className="mt-4">
        <Flex vertical gap={4} className="min-w-[320px] flex-1">
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
          <Space wrap>
            <Button icon={<RotateLeftOutlined />} onClick={() => rotateQuarter(-1)}>
              左转 90°
            </Button>
            <Button icon={<RotateRightOutlined />} onClick={() => rotateQuarter(1)}>
              右转 90°
            </Button>
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
        拖动图片调整位置，滚轮或双指缩放。裁剪框比例被锁定为 {preset.label}
        ，无论怎么缩放，导出尺寸都不会改变。
      </Typography.Text>
    </Modal>
  );
};
