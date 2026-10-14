import { Typography } from 'antd';

import { PROJECT_AUTHOR, PROJECT_REPO_LABEL, PROJECT_REPO_URL } from '@/constants/project';

export const AppFooter = () => (
  <footer className="border-t border-solid border-gray-200 px-1 pt-4 pb-2">
    <Typography.Text type="secondary" className="block text-center text-xs">
      项目作者：{PROJECT_AUTHOR}
      <span className="mx-2 text-gray-300">|</span>
      项目地址：
      <Typography.Link
        href={PROJECT_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-xs"
      >
        {PROJECT_REPO_LABEL}
      </Typography.Link>
      <span className="mx-2 text-gray-300">|</span>
      全程本地处理，不上传、不收集任何数据
    </Typography.Text>
  </footer>
);
