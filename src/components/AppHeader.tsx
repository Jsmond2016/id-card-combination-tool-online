import { DeleteOutlined, IdcardOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Flex, Popconfirm, Tag, Typography } from 'antd';

interface AppHeaderProps {
  hasContent: boolean;
  onResetAll: () => void;
}

export const AppHeader = ({ hasContent, onResetAll }: AppHeaderProps) => (
  <Flex align="center" justify="space-between" gap={16} wrap>
    <Flex align="center" gap={12}>
      <IdcardOutlined className="text-2xl text-blue-600" />
      <div>
        <Typography.Title level={4} className="!mb-0">
          身份证复印件在线生成工具
        </Typography.Title>
        <Typography.Text type="secondary" className="text-xs">
          按国家标准尺寸排版到 A4，导出即可打印
        </Typography.Text>
      </div>
    </Flex>
    <Flex align="center" gap={12}>
      <Tag icon={<SafetyCertificateOutlined />} color="green">
        本地处理 · 不上传
      </Tag>
      <Popconfirm
        title="清空全部内容？"
        description="已上传的图片与所有调整都会被清除。"
        okText="清空"
        cancelText="取消"
        disabled={!hasContent}
        onConfirm={onResetAll}
      >
        <Button icon={<DeleteOutlined />} disabled={!hasContent}>
          重新开始
        </Button>
      </Popconfirm>
    </Flex>
  </Flex>
);
