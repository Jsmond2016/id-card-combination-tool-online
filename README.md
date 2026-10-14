# 身份证复印件在线生成工具

上传身份证正反面照片 → 裁剪校正 → 按国家标准尺寸排版到 A4 → （可选）添加自定义水印 → 导出 PNG / JPG / PDF → 直接打印。

**全程在浏览器本地完成，图片不上传任何服务器。**

## 尺寸标准

| 项目 | 尺寸 |
| ---- | ---- |
| 第二代居民身份证（物理卡体） | 85.6mm × 54mm（ISO/IEC 7810 ID-1） |
| 身份证复印件规格（默认预设） | 88mm × 56mm |
| A4 纸张 | 210mm × 297mm |
| 默认输出精度 | 300 DPI（A4 = 2480 × 3508 px） |

## 功能一览

- 上传正反面（点击 / 拖拽 / 粘贴），锁定规格比例裁剪、旋转、缩放
- 两个标准规格预设（88 × 56mm / 85.6 × 54mm），版式、对齐、份数、正反面间距可调
- 拖拽微调 + mm 参考标尺 + 吸附对齐
- 可选自定义水印：文字最长 15 字，大小（4–24mm）、平铺密度（20–120mm）、倾斜角度（-90°–90°）可调
- 导出 PNG / JPG / PDF（A4 210 × 297mm @ 150 / 300 DPI）

## 技术栈

React 19 + TypeScript（严格模式）、Vite、Ant Design 5、Tailwind CSS 4、ahooks、Ramda、Zustand、react-easy-crop、jsPDF。

## 快速开始

```bash
pnpm install        # 依赖安装走 .npmrc 配置的淘宝镜像
pnpm dev            # 开发服务器
pnpm build          # 类型检查 + 生产构建
pnpm preview        # 预览构建产物
```

## 质量检查

```bash
pnpm typecheck      # tsc 严格模式
pnpm lint           # ESLint
pnpm format         # Prettier
pnpm verify:logic   # 尺寸/版式/校验逻辑断言（无需浏览器）
pnpm verify:e2e     # 无头 Chrome 全流程验证（需先启动 pnpm dev）
pnpm verify:crop    # 裁剪编辑回归：拖动/缩放/旋转/复位后不得丢失画面（需先启动 pnpm dev）
```

## 项目结构

```text
├── specs/id-card-combination-tool-online/   # 需求文档与开发方案文档（真值来源）
├── docs/使用说明.md                          # 面向使用者的操作与打印指引
├── scripts/                                 # 验证脚本
└── src/
    ├── constants/idCard.ts       # 尺寸常量与毫米/像素换算
    ├── types/idCard.ts           # 领域类型
    ├── stores/useIdCardStore.ts  # Zustand 单 store
    ├── hooks/                    # useProject / useFaceEditor / useExport
    ├── utils/                    # geometry / image / renderFace / renderA4 / watermark / export
    ├── components/               # 界面组件
    └── pages/HomePage.tsx        # 主页面
```

## 文档

- 需求文档：`specs/id-card-combination-tool-online/id-card-combination-tool-online-需求文档.md`
- 开发方案文档：`specs/id-card-combination-tool-online/id-card-combination-tool-online-开发方案文档.md`
- 使用说明：`docs/使用说明.md`
- AI 协作规范：`AGENTS.md`

## 明确不做

服务端上传与账号体系、自动边缘检测/透视矫正、OCR 识别、草稿持久化、HEIC 转码、多页批量处理，以及水印内容的合规校验（水印文字完全由用户自定义）。理由见需求文档「非目标」。
