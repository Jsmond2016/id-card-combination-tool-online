import {
  DeleteOutlined,
  ReloadOutlined,
  ScissorOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useBoolean } from 'ahooks';
import { Button, Card, Flex, Popconfirm, Space, Tag, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';

import { CropEditor } from '@/components/CropEditor';
import { FaceOutputPreview } from '@/components/FaceOutputPreview';
import { ACCEPTED_EXTENSIONS, getSpecPreset } from '@/constants/idCard';
import { useFaceEditor } from '@/hooks/useFaceEditor';
import { useIdCardStore } from '@/stores/useIdCardStore';
import { FACE_META } from '@/types/idCard';
import type { FaceKind } from '@/types/idCard';

interface FaceCardProps {
  kind: FaceKind;
}

export const FaceCard = ({ kind }: FaceCardProps) => {
  const source = useIdCardStore((state) => state.faces[kind].source);
  const presetLabel = useIdCardStore((state) => getSpecPreset(state.layout.specId).label);
  const editor = useFaceEditor(kind);
  const [cropOpen, cropOpenAction] = useBoolean(false);
  const meta = FACE_META[kind];

  if (!source) {
    return null;
  }

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    void editor.handleSelectFile(file);
    return false;
  };

  return (
    <Card size="small" className="w-full">
      <Flex gap={12}>
        <FaceOutputPreview kind={kind} widthPx={132} className="shrink-0" />
        <Flex vertical gap={6} className="min-w-0 flex-1">
          <Typography.Text strong>{meta.label}</Typography.Text>
          <Typography.Text type="secondary" className="truncate text-xs" title={source.fileName}>
            {source.fileName} · {source.width} × {source.height}
          </Typography.Text>
          <Flex gap={6} wrap>
            <Tag color="blue">{presetLabel}</Tag>
            {editor.lowResolution && (
              <Tag icon={<WarningOutlined />} color="warning">
                分辨率偏低，打印可能不清晰
              </Tag>
            )}
          </Flex>
          <Space size={4} wrap className="mt-1">
            <Button size="small" icon={<ScissorOutlined />} onClick={cropOpenAction.setTrue}>
              调整裁剪
            </Button>
            <Upload
              accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
              multiple={false}
              showUploadList={false}
              beforeUpload={beforeUpload}
            >
              <Button size="small" icon={<ReloadOutlined />}>
                重新上传
              </Button>
            </Upload>
            <Popconfirm
              title="移除这张图片？"
              okText="移除"
              cancelText="取消"
              onConfirm={editor.handleRemove}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                移除
              </Button>
            </Popconfirm>
          </Space>
        </Flex>
      </Flex>
      <CropEditor kind={kind} open={cropOpen} onClose={cropOpenAction.setFalse} />
    </Card>
  );
};
