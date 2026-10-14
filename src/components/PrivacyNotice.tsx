import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert } from 'antd';

export const PrivacyNotice = () => (
  <Alert
    type="success"
    showIcon
    icon={<SafetyCertificateOutlined />}
    message="图片不会上传到任何服务器"
    description="裁剪、排版与导出全部在你的浏览器内完成，刷新页面即清空，适合处理身份证这类敏感证件。"
  />
);
