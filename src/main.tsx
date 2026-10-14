import { StyleProvider } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'react-easy-crop/react-easy-crop.css';

import { App } from '@/App';
import '@/index.css';
import { useIdCardStore } from '@/stores/useIdCardStore';

const container = document.getElementById('root');
if (!container) {
  throw new Error('未找到根节点 #root');
}

// 仅开发环境：暴露 store 供端到端脚本断言内部状态；生产构建中该分支会被静态移除
if (import.meta.env.DEV) {
  Object.assign(window, { __idCardStore: useIdCardStore });
}

createRoot(container).render(
  <StrictMode>
    {/* layer 让 antd 样式固定在 antd 层，Tailwind 工具类始终可以覆盖它 */}
    <StyleProvider layer>
      <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1668dc', borderRadius: 8 } }}>
        <AntdApp>
          <App />
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  </StrictMode>,
);
