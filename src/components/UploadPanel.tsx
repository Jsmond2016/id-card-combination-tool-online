import { InboxOutlined } from '@ant-design/icons';
import { Flex, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';

import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_MB } from '@/constants/idCard';
import { useFaceEditor } from '@/hooks/useFaceEditor';
import { FACE_META } from '@/types/idCard';
import type { FaceKind } from '@/types/idCard';

interface UploadPanelProps {
  kind: FaceKind;
}

/** 空状态下的上传入口；上传成功后面位改由 FaceCard 承载 */
export const UploadPanel = ({ kind }: UploadPanelProps) => {
  const editor = useFaceEditor(kind);
  const meta = FACE_META[kind];

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    void editor.handleSelectFile(file);
    // 返回 false 阻止 antd 内置上传行为，确保图片不出浏览器（R13）
    return false;
  };

  return (
    <Upload.Dragger
      accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
      multiple={false}
      showUploadList={false}
      beforeUpload={beforeUpload}
      className="w-full"
    >
      <Flex vertical align="center" gap={4} className="py-2">
        <InboxOutlined className="text-2xl text-blue-500" />
        <Typography.Text strong>{meta.label}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs">
          {meta.hint}
        </Typography.Text>
        <Typography.Text type="secondary" className="text-xs">
          点击选择或拖拽图片到此 · 支持 {ACCEPTED_EXTENSIONS.join(' / ')} · 单张 ≤{' '}
          {MAX_FILE_SIZE_MB}MB
        </Typography.Text>
      </Flex>
    </Upload.Dragger>
  );
};
