# 身份证复印件在线生成工具 — AI 协作规范

## 项目概述

纯浏览器端的在线工具：上传身份证正反面照片 → 裁剪校正 → 按国家标准尺寸排版到 A4 → 导出 PNG/JPG/PDF → 直接打印。

**无后端、无接口、无网络请求**，全部处理在浏览器内完成。

## 关键领域常量（修改前必须确认）

尺寸以**毫米**为唯一真值，像素由 DPI 派生（`px = mm / 25.4 × dpi`）。定义集中在 `src/constants/idCard.ts`，禁止在组件内硬编码数值。

| 项目 | 值 |
| ---- | -- |
| 二代身份证物理尺寸 | 85.6mm × 54mm（ISO/IEC 7810 ID-1） |
| 复印件标准规格 | 88mm × 56mm（默认预设） |
| A4 | 210mm × 297mm |
| 默认输出精度 | 300 DPI（A4 = 2480 × 3508 px） |
| 安全边距 | 10mm（版式）/ 5mm（拖动钳制） |
| 正反面间距（默认 / 可调范围） | 20mm / 2–30mm（用户可调，`DEFAULT_FACE_GAP_MM`） |
| 每页多份时的份与份间距 | 8mm（`COPY_GAP_MM`） |
| 预览参考标尺刻度 / 主刻度 | 10mm / 50mm（`RULER_TICK_MM` / `RULER_MAJOR_TICK_MM`） |
| 拖拽吸附阈值 | 2.5mm（`SNAP_THRESHOLD_MM`） |
| 水印文字长度上限 | 32 个字（`WATERMARK_TEXT_MAX_LENGTH`，按码点计数） |
| 水印字号（大小）默认 / 可调范围 / 步进 | 8mm / 4–24mm / 0.5mm（`DEFAULT_WATERMARK_FONT_SIZE_MM`、`WATERMARK_FONT_SIZE_STEP_MM`） |
| 水印字号快捷预设 | 6 / 8 / 12 / 16mm（`WATERMARK_FONT_SIZE_PRESETS_MM`） |
| 水印卡片折叠 | 默认折叠（`Collapse` 无 `defaultActiveKey`），标题行显示状态摘要且必须 `truncate` |
| 水印平铺间距（密度）默认 / 可调范围 | 50mm / 20–120mm（`DEFAULT_WATERMARK_SPACING_MM`，数值越小越密） |
| 水印倾斜角度默认 / 可调范围 | -30° / -90°–90°（`DEFAULT_WATERMARK_ANGLE_DEG`，正值顺时针） |
| 水印透明度 / 颜色 | 0.18 / `#000000`（固定常量 `WATERMARK_OPACITY` / `WATERMARK_COLOR`，暂不开放为可调项） |
| 透视矫正默认四角内缩比例 | 4%（`DEFAULT_RECTIFY_INSET_RATIO`） |
| 透视矫正边缘微调范围 | -5%–+5%（`EDGE_OFFSET_RANGE_PERCENT`，正值向内收缩） |
| 透视矫正卡面补白 | 规格减去卡体后的余量居中分配（88×56 时左右各 1.2mm、上下各 1.0mm） |

### 透视矫正实现约束（R22）

- 矫正走的是**手动标定四角 + 单应变换**：`resolveHomography` 求「目标矩形 → 源四边形」方向的 8 元方程组，`warpQuadToPixels` 逐像素**反向映射** + 双线性插值。落在四边形之外的采样点直接填白——背景不是被擦除，而是根本不会被采样到。
- 禁止引入任何 CV / WebGL 依赖（自动找角才需要它们，已列为非目标）。
- 采样源必须先降到 `min(源尺寸, 2 × 卡面目标尺寸)` 再取像素（TD22），禁止直接对 12MP 原图 `getImageData`。
- 拖角约束在 `constrainQuadCorner` 里按**凸性判据**实现：只挡会让四边形翻转的拖法，不得改成"象限/外接矩形"之类的规则（会误挡斜拍产生的合法梯形）。
- 三层退化守卫不可删减：拖角时凸性约束 → 写入与绘制前 `isValidQuad` → 渲染层回退矩形裁剪（`renderFaceCanvas`）。
- `rectify.enabled` 默认 `false`；矫正模式下**不读取也不写入** `crop` / `zoom` / `quarterTurns` / `croppedAreaPixels`，切回矩形裁剪时必须保留用户此前的裁剪参数。
- 卡面外的留白必须是**纯白**（模拟复印机在玻璃上复印时卡外的白纸），不得使用任何灰底或纸张纹理。

### 水印实现约束（R20）

- 水印是**页面级**效果：必须在 `composeA4Canvas` 中绘制于**面位之后、校准尺之前**，否则会被身份证图像盖住或干扰打印自检。
- 平铺布局在毫米空间按「覆盖页面外接圆」计算（`utils/watermark.ts`），结果与倾斜角度无关，禁止改成按像素或按角度分类推导。
- 文字宽度用估算函数而非 `measureText`，以保证布局可在 Node 中断言；参数在绘制前钳制到上表区间。
- 水印**不得**参与任何尺寸计算：身份证尺寸与导出页面尺寸（A4 210 × 297mm）不随水印变化。
- 水印面板**默认折叠**（`Collapse` 不传 `defaultActiveKey`）；折叠态标题行只显示状态摘要，摘要必须 `truncate`（窄屏不得撑出横向滚动条）。字号滑块的步进与快捷预设必须取自常量，禁止在组件内写死数值。

## 技术栈约束

- React 19 + TypeScript 严格模式，**禁止 class 组件**与 `this`。
- UI 统一使用 Ant Design 5；布局与间距优先 Tailwind CSS 工具类。
- 通用逻辑优先用 ahooks（`useSetState`、`useMemoizedFn`、`useBoolean` 等），避免滥用 `useEffect`。
- 数据变换优先 Ramda 纯函数，仅在确实提升可读性时使用，禁止为用而用。
- 跨组件共享状态集中在 `src/stores/`（Zustand），禁止多层 props 透传。
- **不得引入任何请求库**（axios / react-query / fetch 调用），见"安全边界"。

## 目录约定

```text
src/
├── components/   # 通用组件，命名导出，PascalCase
├── pages/        # 页面组件，默认导出，PascalCase
├── hooks/        # useXxx，文件名 useCamelCase
├── stores/       # useXxxStore，文件名 camelCase
├── utils/        # 纯函数工具，禁止直接操作 store
├── constants/    # 常量与换算函数
└── types/        # TypeScript 类型定义
```

- 导入顺序：React → 第三方库 → 内部组件 → hooks/stores/utils → 类型（`import type`）。
- 列表渲染必须使用稳定唯一 key，禁止用数组下标。
- 单一函数圈复杂度不超过 10，超过则拆分。

## 响应式约束（窄屏必须遵守）

1. 窄屏可见的容器**禁止写死超过容器可用宽度的最小宽度**；需要「宽屏保持 N px、窄屏自适应」时写成 `min-w-[min(Npx,100%)]`。
2. antd 卡片标题默认 `nowrap` + 省略号：窄屏下若 `extra` 文案偏长必须隐藏（`hidden sm:inline`），不要把长文案塞进卡头。
3. 长且无空格的文本（URL、文件名）必须显式允许断行（`break-all`）。
4. 不得用整页 `overflow-x: hidden` 兜底：会把 `body` 变成滚动容器而破坏 `lg:sticky`，且会静默裁掉真实溢出。
5. 开关等窄控件必须用 `FieldRow inline`（标签在左、控件在右）：长标签独占一行、开关孤零零挂在下一行属于缺陷。详细说明写进 `hint`，不要把解释塞进 `label`。
6. 移动端视口回归由 `pnpm verify:e2e` 覆盖：320 / 360 / 390px 下整页与裁剪弹窗都不得出现横向滚动条，卡片标题不得被截断。详见开发方案文档「关键实现细节 §10」。

## 安全边界（最高优先级）

1. **身份证图片是最高敏感级个人信息**：禁止上传、禁止持久化、禁止写入 localStorage/IndexedDB、禁止输出到日志或错误上报。
2. 不新增任何网络请求；`antd Upload` 必须通过 `beforeUpload` 返回 `false` 阻止组件内置上传行为。
3. 不在代码、注释、示例中写入真实身份证号、姓名或地址等个人信息。
4. 替换或移除图片时必须调用 `URL.revokeObjectURL` 释放内存。
5. 页脚的项目链接是全站唯一的站外链接，必须保持为普通 `<a>` 跳转；禁止内嵌 GitHub 徽章图片、外部字体或统计脚本（会引入第三方请求，违反 R13）。

## 文档协作

- 需求与开发方案文档位于 `specs/{需求名}/`，由当前 Git 分支名推导（去掉第一段前缀）。
- 需求变更先改需求文档 → 再改开发方案 → 用户确认后才改代码。
- 任何代码变更（含重构、修复、配置、构建产物）都必须同步更新开发方案文档的"实施记录"。
- 行为或范围变化必须同步更新需求文档并记录到"变更记录"。
- 不得在未运行验证的情况下宣称需求"已验证"；无法验证时需写明原因。

## 常用命令

```bash
pnpm dev          # 开发服务器
pnpm build        # 类型检查 + 生产构建
pnpm typecheck    # 仅类型检查
pnpm lint         # ESLint
pnpm format       # Prettier 格式化
```

## 提交规范

遵循 Angular Commit Convention，使用中文描述：

```text
<type>(<scope>): <中文描述>
```

- `feat` 新功能、`fix` 修复、`docs` 文档、`style` 格式、`refactor` 重构、`perf` 性能、`test` 测试、`chore` 构建与工具。
- 提交前保证 `pnpm lint` 与 `pnpm build` 通过。

## 测试协作

- 本项目为纯前端工具，验证以类型检查、Lint、构建与浏览器实测为主。
- 浏览器实测要求：上传正反面 → 调整 → 导出 PDF，用 PDF 阅读器确认页面尺寸为 210 × 297mm。
- 不得为了通过验证而放宽校验规则或注释掉断言。

## 工具使用限制

- 执行写操作（删除文件、`git push`、发布）前需用户确认。
- 可自主执行：读取文件、代码分析、`pnpm lint`、`pnpm typecheck`、`pnpm build`。
