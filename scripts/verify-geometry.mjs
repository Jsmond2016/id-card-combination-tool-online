/**
 * 纯逻辑验证：尺寸换算、版式坐标、裁剪默认值。
 * 用法：pnpm verify:logic
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const bundledArgument = process.argv[2];
if (!bundledArgument) {
  console.error('缺少打包产物路径参数');
  process.exit(1);
}
const bundledPath = resolve(process.cwd(), bundledArgument);

const {
  A4,
  CARD_PHYSICAL,
  DEFAULT_FACE_GAP_MM,
  RULER_MAJOR_TICK_MM,
  RULER_TICK_MM,
  SNAP_THRESHOLD_MM,
  WATERMARK_TEXT_MAX_LENGTH,
  WATERMARK_FONT_SIZE_RANGE_MM,
  WATERMARK_FONT_SIZE_STEP_MM,
  WATERMARK_FONT_SIZE_PRESETS_MM,
  PROJECT_AUTHOR,
  PROJECT_REPO_URL,
  PROJECT_REPO_LABEL,
  DEFAULT_WATERMARK_FONT_SIZE_MM,
  DEFAULT_WATERMARK_SPACING_MM,
  DEFAULT_WATERMARK_ANGLE_DEG,
  normalizeWatermarkText,
  estimateTextWidthMm,
  estimateTextHeightMm,
  computeWatermarkLayout,
  resolveWatermarkDrawParams,
  getSpecPreset,
  mmToPx,
  dpiToPxPerMm,
  buildLayoutPlan,
  clampFacePosition,
  resolveSnap,
  computeDefaultCrop,
  estimateEffectiveDpi,
  buildFileName,
  validateImageFile,
  createDefaultQuad,
  constrainQuadCorner,
  isValidQuad,
  resolveHomography,
  applyHomography,
  warpQuadToPixels,
  applyEdgeOffset,
  quadArea,
  quadAverageWidth,
  resolveCardRect,
} = require(bundledPath);

let passed = 0;
const failures = [];

const check = (name, actual, expected) => {
  const ok =
    typeof expected === 'number' && typeof actual === 'number'
      ? Math.abs(actual - expected) < 1e-6
      : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
};

const COPY_88x56 = getSpecPreset('copy-88x56');
const ORIGINAL = getSpecPreset('original-85.6x54');

// --- R6/R10：尺寸换算 ---
check('A4@300DPI 宽', mmToPx(A4.widthMm, 300), 2480);
check('A4@300DPI 高', mmToPx(A4.heightMm, 300), 3508);
check('A4@150DPI 宽', mmToPx(A4.widthMm, 150), 1240);
check('A4@150DPI 高', mmToPx(A4.heightMm, 150), 1754);
check('88x56@300DPI', [mmToPx(88, 300), mmToPx(56, 300)], [1039, 661]);
check('85.6x54@300DPI', [mmToPx(85.6, 300), mmToPx(54, 300)], [1011, 638]);
check('默认规格为 88x56', [COPY_88x56.widthMm, COPY_88x56.heightMm], [88, 56]);
check(
  '原大规格取自 ID-1',
  [ORIGINAL.widthMm, ORIGINAL.heightMm],
  [CARD_PHYSICAL.widthMm, CARD_PHYSICAL.heightMm],
);
check('pxPerMm@300DPI', dpiToPxPerMm(300), 300 / 25.4);

const base = { copies: 1, offsets: {}, gapMm: DEFAULT_FACE_GAP_MM };

// --- R7：正反面间距默认值与可调性 ---
check('默认正反面间距为 20mm', DEFAULT_FACE_GAP_MM, 20);

// --- R7：上下排列居中 ---
const vertical = buildLayoutPlan({
  ...base,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('上下排列分组尺寸', [vertical.groupSize.widthMm, vertical.groupSize.heightMm], [88, 132]);
check('上下排列坐标', vertical.placed, [
  { kind: 'front', xMm: 61, yMm: 82.5 },
  { kind: 'back', xMm: 61, yMm: 158.5 },
]);
check('上下排列不溢出', vertical.overflow, false);
check(
  '正反面实际间距等于设置值',
  vertical.placed[1].yMm - (vertical.placed[0].yMm + COPY_88x56.heightMm),
  20,
);

// --- R7：间距可调 ---
const wideGap = buildLayoutPlan({
  ...base,
  gapMm: 25,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('间距 25mm 时分组高度', wideGap.groupSize.heightMm, 137);
check('间距 25mm 时坐标随之变化', wideGap.placed, [
  { kind: 'front', xMm: 61, yMm: 80 },
  { kind: 'back', xMm: 61, yMm: 161 },
]);
const zeroGap = buildLayoutPlan({
  ...base,
  gapMm: 0,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('间距 0 时两张卡贴合不重叠', zeroGap.placed[1].yMm, zeroGap.placed[0].yMm + 56);
const nanGap = buildLayoutPlan({
  ...base,
  gapMm: Number.NaN,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('间距为 NaN 时回退默认值', nanGap.groupSize.heightMm, 132);

// --- R7：左右排列居中 ---
const horizontal = buildLayoutPlan({
  ...base,
  mode: 'horizontal',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('左右排列分组尺寸', [horizontal.groupSize.widthMm, horizontal.groupSize.heightMm], [196, 56]);
check('左右排列坐标', horizontal.placed, [
  { kind: 'front', xMm: 7, yMm: 120.5 },
  { kind: 'back', xMm: 115, yMm: 120.5 },
]);

// --- R12/R7：距边对齐 ---
const margin = buildLayoutPlan({
  ...base,
  mode: 'vertical',
  align: 'margin',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('距边对齐起点', [margin.placed[0].xMm, margin.placed[0].yMm], [10, 10]);

// --- R3：仅单面时居中，不留空位 ---
const singleFace = buildLayoutPlan({
  ...base,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front'],
});
check('单面分组高度', singleFace.groupSize.heightMm, 56);
check('单面居中坐标', singleFace.placed, [{ kind: 'front', xMm: 61, yMm: 120.5 }]);

// --- R9：每页 2 份纵向叠放且不重叠 ---
const twoCopies = buildLayoutPlan({
  ...base,
  copies: 2,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('2 份内容高度', twoCopies.contentSize.heightMm, 272);
check('2 份坐标', twoCopies.placed, [
  { kind: 'front', xMm: 61, yMm: 12.5 },
  { kind: 'back', xMm: 61, yMm: 88.5 },
  { kind: 'front', xMm: 61, yMm: 152.5 },
  { kind: 'back', xMm: 61, yMm: 228.5 },
]);
check('2 份不溢出', twoCopies.overflow, false);
const secondFront = twoCopies.placed[2];
const firstBack = twoCopies.placed[1];
check('2 份互不重叠', secondFront.yMm - (firstBack.yMm + COPY_88x56.heightMm) >= 0, true);

// --- 位置微调与钳制（R8） ---
const offsetPlan = buildLayoutPlan({
  ...base,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
  offsets: { front: { xMm: 10, yMm: -20 }, back: { xMm: -100, yMm: 1000 } },
});
check('偏移生效且不改变尺寸', [offsetPlan.placed[0].xMm, offsetPlan.placed[0].yMm], [71, 62.5]);
check('越界钳制到安全区', [offsetPlan.placed[1].xMm, offsetPlan.placed[1].yMm], [5, 236]);
check('clampFacePosition 上界', clampFacePosition(1000, 1000, COPY_88x56), {
  xMm: 117,
  yMm: 236,
});
check('clampFacePosition 下界', clampFacePosition(-50, -50, COPY_88x56), { xMm: 5, yMm: 5 });

// --- R19：预览参考标尺与拖拽吸附 ---
check('标尺刻度间隔为 10mm', [RULER_TICK_MM, RULER_MAJOR_TICK_MM], [10, 50]);
check('吸附阈值为 2.5mm', SNAP_THRESHOLD_MM, 2.5);

const snapInput = { size: COPY_88x56, others: [], otherSize: COPY_88x56 };

const snapToCenter = resolveSnap({ ...snapInput, xMm: 60, yMm: 120.5 });
check('靠近页面中心时吸附到中心', snapToCenter.xMm, 61);
check('同时命中横向与纵向参考线', snapToCenter.guides, [
  { axis: 'x', positionMm: 105 },
  { axis: 'y', positionMm: 148.5 },
]);

const snapToMargin = resolveSnap({ ...snapInput, xMm: 11.5, yMm: 100 });
check('靠近安全边距时吸附到边距线', snapToMargin.xMm, 10);
check('边距吸附的参考线位置', snapToMargin.guides, [{ axis: 'x', positionMm: 10 }]);

const snapToNeighbor = resolveSnap({
  ...snapInput,
  xMm: 14,
  yMm: 100,
  others: [{ kind: 'back', xMm: 12, yMm: 120.5 }],
});
check('靠近另一面位时左对齐', snapToNeighbor.xMm, 12);
check('对齐参考线落在另一面位的左边缘', snapToNeighbor.guides, [{ axis: 'x', positionMm: 12 }]);

const noSnap = resolveSnap({ ...snapInput, xMm: 50, yMm: 100 });
check('超出阈值时不吸附', [noSnap.xMm, noSnap.yMm, noSnap.guides.length], [50, 100, 0]);

// 两个轴各偏 1mm：默认阈值下吸附，阈值设为 0 时完全不吸附
const nearMiss = { ...snapInput, xMm: 60, yMm: 119.5 };
check('默认阈值下两个轴都吸附', resolveSnap(nearMiss).guides.length, 2);
const zeroThreshold = resolveSnap({ ...nearMiss, thresholdMm: 0 });
check('阈值可覆盖为 0（关闭吸附）', [zeroThreshold.xMm, zeroThreshold.guides.length], [60, 0]);

// --- 溢出检测（防御后续规格扩展） ---
const overFlow = buildLayoutPlan({
  ...base,
  mode: 'horizontal',
  align: 'center',
  preset: { id: 'copy-88x56', label: 'x', description: 'x', widthMm: 120, heightMm: 60 },
  kinds: ['front', 'back'],
});
check('超宽时标记溢出', overFlow.overflow, true);

// --- R5/R15：默认裁剪与有效精度 ---
const landscapeCrop = computeDefaultCrop(4032, 3024, 88 / 56);
check('横向照片默认裁剪宽度', landscapeCrop.width, 4032);
check('横向照片默认裁剪高度', Number(landscapeCrop.height.toFixed(1)), 2565.8);
check('横向照片默认裁剪居中', Number(landscapeCrop.y.toFixed(1)), 229.1);
const portraitCrop = computeDefaultCrop(3024, 4032, 88 / 56);
// 竖构图照片受宽度限制：取满宽，高度按比例收窄并垂直居中（与 react-easy-crop 初始状态一致）
check('纵向照片默认裁剪宽度', portraitCrop.width, 3024);
check('纵向照片默认裁剪高度', Number(portraitCrop.height.toFixed(1)), 1924.4);
check('纵向照片默认裁剪水平居中', portraitCrop.x, 0);
check('纵向照片默认裁剪垂直居中', Number(portraitCrop.y.toFixed(1)), 1053.8);
check('高分辨率照片有效精度充足', estimateEffectiveDpi(4032, 88) > 300, true);
check('低分辨率照片触发告警', estimateEffectiveDpi(800, 88) < 300, true);

// --- R18：文件名 ---
check(
  '导出文件名格式',
  buildFileName('pdf', new Date(2026, 9, 14, 9, 5)),
  '身份证复印件_20261014_0905.pdf',
);

// --- R1/R15：上传校验 ---
const fileOf = (name, type, size) => ({ name, type, size });
check('拒绝 txt', validateImageFile(fileOf('a.txt', 'text/plain', 1024)).ok, false);
check('超限被拒', validateImageFile(fileOf('a.jpg', 'image/jpeg', 21 * 1024 * 1024)).ok, false);
check('空文件被拒', validateImageFile(fileOf('a.jpg', 'image/jpeg', 0)).ok, false);
check('接受 jpg', validateImageFile(fileOf('a.jpg', 'image/jpeg', 1024)).ok, true);
check(
  'HEIC 给出专属提示',
  validateImageFile(fileOf('a.heic', 'image/heic', 1024)).message.includes('HEIC'),
  true,
);

// --- R20：水印文字规范化 ---
check('水印文字上限为 32 个字', WATERMARK_TEXT_MAX_LENGTH, 32);
check('水印字号步进为 0.5mm', WATERMARK_FONT_SIZE_STEP_MM, 0.5);
check(
  '水印字号预设都落在可调范围内',
  WATERMARK_FONT_SIZE_PRESETS_MM.every(
    (size) => size >= WATERMARK_FONT_SIZE_RANGE_MM.min && size <= WATERMARK_FONT_SIZE_RANGE_MM.max,
  ),
  true,
);
check('水印字号预设含默认值 8mm', WATERMARK_FONT_SIZE_PRESETS_MM.includes(8), true);
check(
  '预设排序唯一且不含重复项',
  new Set(WATERMARK_FONT_SIZE_PRESETS_MM).size === WATERMARK_FONT_SIZE_PRESETS_MM.length &&
    WATERMARK_FONT_SIZE_PRESETS_MM.every(
      (size, index) => index === 0 || size > WATERMARK_FONT_SIZE_PRESETS_MM[index - 1],
    ),
  true,
);
check('32 个字的水印文字保持完整', Array.from(normalizeWatermarkText('一'.repeat(32))).length, 32);
check('超过 32 个字才截断', Array.from(normalizeWatermarkText('一'.repeat(40))).length, 32);
check('水印默认字号为 8mm', DEFAULT_WATERMARK_FONT_SIZE_MM, 8);
check('水印默认平铺间距为 50mm', DEFAULT_WATERMARK_SPACING_MM, 50);
check('水印默认倾斜角为 -30°', DEFAULT_WATERMARK_ANGLE_DEG, -30);
check('水印默认文案可用', normalizeWatermarkText('仅供办理业务使用'), '仅供办理业务使用');
check(
  '超长文字按码点截断到 32 个字',
  normalizeWatermarkText('仅供办理业务使用'.repeat(5)),
  '仅供办理业务使用'.repeat(4),
);
check(
  '换行与连续空白被折叠',
  normalizeWatermarkText('  仅供\n办理   业务使用 '),
  '仅供 办理 业务使用',
);
check('空文字保持为空', normalizeWatermarkText('   \n '), '');
check(
  '代理对（emoji）按一个字计数',
  Array.from(normalizeWatermarkText('🎫'.repeat(40))).length,
  32,
);

// --- R20：文本包围盒估算 ---
check('全宽字符按 1 倍字号', estimateTextWidthMm('仅供办理业务使用', 10), 80);
check('半角字符按 0.6 倍字号', Number(estimateTextWidthMm('ABCDE', 10).toFixed(2)), 30);
check('混合文本按字符类型分别累加', Number(estimateTextWidthMm('仅供A', 10).toFixed(2)), 26);
check('空文字宽度为 0', estimateTextWidthMm('', 10), 0);
check('行高为字号的 1.2 倍', estimateTextHeightMm(10), 12);

// --- R20：平铺布局（覆盖页面外接圆） ---
const watermarkLayout = computeWatermarkLayout({
  pageWidthMm: A4.widthMm,
  pageHeightMm: A4.heightMm,
  textWidthMm: estimateTextWidthMm('仅供办理业务使用', 8),
  textHeightMm: estimateTextHeightMm(8),
  gapXMm: 50,
  gapYMm: 50,
});
check('瓦片以页面中心为原点', [watermarkLayout.centerXMm, watermarkLayout.centerYMm], [105, 148.5]);
check(
  '列步进 = 文本宽度 + 间距',
  [watermarkLayout.stepXMm, watermarkLayout.stepYMm],
  [64 + 50, 9.6 + 50],
);
check('瓦片数量符合覆盖外接圆的索引上界', watermarkLayout.tiles.length, 7 * 9);
check(
  '瓦片关于中心成对出现（无重复、无遗漏）',
  new Set(watermarkLayout.tiles.map((tile) => `${tile.offsetXMm},${tile.offsetYMm}`)).size,
  watermarkLayout.tiles.length,
);
check(
  '包含页面中心的那一格存在',
  watermarkLayout.tiles.some((tile) => tile.offsetXMm === 0 && tile.offsetYMm === 0),
  true,
);

// 覆盖性判据：四个页角都能找到「左右各不超过半步、上下各不超过半步」的瓦片
const pageCorners = [
  [-A4.widthMm / 2, -A4.heightMm / 2],
  [A4.widthMm / 2, -A4.heightMm / 2],
  [-A4.widthMm / 2, A4.heightMm / 2],
  [A4.widthMm / 2, A4.heightMm / 2],
];
const cornersCovered = (layout) =>
  pageCorners.every(([cornerX, cornerY]) =>
    layout.tiles.some(
      (tile) =>
        Math.abs(tile.offsetXMm - cornerX) <= layout.stepXMm / 2 + 1e-9 &&
        Math.abs(tile.offsetYMm - cornerY) <= layout.stepYMm / 2 + 1e-9,
    ),
  );
check('四个页角都被水印网格覆盖', cornersCovered(watermarkLayout), true);

const denserLayout = computeWatermarkLayout({
  pageWidthMm: A4.widthMm,
  pageHeightMm: A4.heightMm,
  textWidthMm: estimateTextWidthMm('仅供办理业务使用', 8),
  textHeightMm: estimateTextHeightMm(8),
  gapXMm: 20,
  gapYMm: 20,
});
check(
  '间距越小瓦片越多（密度可调）',
  denserLayout.tiles.length > watermarkLayout.tiles.length,
  true,
);
check('间距变小后仍覆盖四个页角', cornersCovered(denserLayout), true);

const noGapLayout = computeWatermarkLayout({
  pageWidthMm: A4.widthMm,
  pageHeightMm: A4.heightMm,
  textWidthMm: Number.NaN,
  textHeightMm: 0,
  gapXMm: Number.NaN,
  gapYMm: -5,
});
check('尺寸与间距均非法时步进收敛到 1mm', [noGapLayout.stepXMm, noGapLayout.stepYMm], [1, 1]);
check('极端输入下瓦片数量依然有限', Number.isFinite(noGapLayout.tiles.length), true);

// --- R20：绘制参数钳制与可绘制性判定 ---
const watermarkBase = {
  pxPerMm: 300 / 25.4,
  pageWidthMm: A4.widthMm,
  pageHeightMm: A4.heightMm,
  text: '仅供办理业务使用',
  fontSizeMm: 8,
  spacingMm: 50,
  angleDeg: -30,
};
const defaultParams = resolveWatermarkDrawParams(watermarkBase);
check('默认参数可绘制', Boolean(defaultParams), true);
check(
  '默认字号换算为像素',
  Number(defaultParams.fontPx.toFixed(2)),
  Number((8 * (300 / 25.4)).toFixed(2)),
);
check('默认角度保持 -30°', defaultParams.angleDeg, -30);
check(
  '角度 0° 不会被当成非法值',
  resolveWatermarkDrawParams({ ...watermarkBase, angleDeg: 0 }).angleDeg,
  0,
);
check(
  '字号越界钳制到上限 24mm',
  resolveWatermarkDrawParams({ ...watermarkBase, fontSizeMm: 999 }).fontSizeMm,
  24,
);
check(
  '字号为 0 时回退默认 8mm',
  resolveWatermarkDrawParams({ ...watermarkBase, fontSizeMm: 0 }).fontSizeMm,
  8,
);
check(
  '间距低于下限时钳制到 20mm',
  resolveWatermarkDrawParams({ ...watermarkBase, spacingMm: 1 }).spacingMm,
  20,
);
check(
  '间距为 NaN 时回退默认 50mm',
  resolveWatermarkDrawParams({ ...watermarkBase, spacingMm: Number.NaN }).spacingMm,
  50,
);
check(
  '角度越界钳制到 -90°',
  resolveWatermarkDrawParams({ ...watermarkBase, angleDeg: -400 }).angleDeg,
  -90,
);
check(
  '角度为 NaN 时回退默认 -30°',
  resolveWatermarkDrawParams({ ...watermarkBase, angleDeg: Number.NaN }).angleDeg,
  -30,
);
check('空白文字不绘制', resolveWatermarkDrawParams({ ...watermarkBase, text: '   ' }), null);
check(
  '画布过小（字号 < 1px）时不绘制',
  resolveWatermarkDrawParams({ ...watermarkBase, pxPerMm: 0.1 }),
  null,
);
check(
  'pxPerMm 非法时不绘制',
  resolveWatermarkDrawParams({ ...watermarkBase, pxPerMm: Number.NaN }),
  null,
);
check(
  '超长文字在绘制前再次截断',
  resolveWatermarkDrawParams({ ...watermarkBase, text: '仅供办理业务使用'.repeat(5) }).text,
  '仅供办理业务使用'.repeat(4),
);
// 最密配置：字号取下限 + 间距取下限 + 32 个半角字符
const densestParams = resolveWatermarkDrawParams({
  ...watermarkBase,
  text: 'iiiiiiiiiiiiiii',
  fontSizeMm: 4,
  spacingMm: 20,
});
check('最密配置下瓦片数量有上界（< 400）', densestParams.layout.tiles.length < 400, true);

// --- R21：页脚署名与项目地址 ---
check('项目作者非空', PROJECT_AUTHOR.trim().length > 0, true);
check(
  '项目地址为 HTTPS 的 GitHub 仓库地址',
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(PROJECT_REPO_URL),
  true,
);
check('展示用短地址与真实地址一致', PROJECT_REPO_LABEL, PROJECT_REPO_URL.replace('https://', ''));

// --- R22：透视矫正（四点拉正） ---
// 合成一张"斜拍照片"来断言矫正效果：背景是桌面色，卡片是一个梯形，
// 卡片四角与"两条对角线的交点"涂上可辨识的标记色。
const CARD_COLOR = [248, 248, 248];
const BACKGROUND_COLOR = [200, 60, 40];
const CORNER_COLORS = [
  [0, 0, 255],
  [0, 160, 0],
  [255, 200, 0],
  [160, 0, 200],
];
const CENTER_COLOR = [0, 0, 0];

const OBLIQUE_QUAD = [
  { x: 60, y: 40 },
  { x: 350, y: 70 },
  { x: 330, y: 260 },
  { x: 80, y: 230 },
];

/** 两条对角线的交点：单应变换把"对角线的交点"映射为"对角线的交点"，是射影不变量 */
const diagonalCenter = (quad) => {
  const [p0, p1, p2, p3] = quad;
  const first = { x: p2.x - p0.x, y: p2.y - p0.y };
  const second = { x: p3.x - p1.x, y: p3.y - p1.y };
  const denominator = first.x * second.y - first.y * second.x;
  const ratio = ((p1.x - p0.x) * second.y - (p1.y - p0.y) * second.x) / denominator;
  return { x: p0.x + first.x * ratio, y: p0.y + first.y * ratio };
};

const buildPhoto = (width, height, quad) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const index = (y * width + x) * 4;
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = 255;
  };
  const insideQuad = (px, py) => {
    let inside = false;
    for (let i = 0, j = quad.length - 1; i < quad.length; j = i, i += 1) {
      const a = quad[i];
      const b = quad[j];
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  };
  const paintDisc = (center, radius, color) => {
    for (let y = Math.floor(center.y - radius); y <= Math.ceil(center.y + radius); y += 1) {
      for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x += 1) {
        if (Math.hypot(x - center.x, y - center.y) <= radius) {
          paint(x, y, color);
        }
      }
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      paint(x, y, insideQuad(x + 0.5, y + 0.5) ? CARD_COLOR : BACKGROUND_COLOR);
    }
  }
  // 标记点半径按源图给足，保证下采样到目标尺寸后仍有纯色区域可供断言
  quad.forEach((point, index) => paintDisc(point, 8, CORNER_COLORS[index]));
  paintDisc(diagonalCenter(quad), 8, CENTER_COLOR);
  return { data, width, height };
};

const readPixel = (data, width, x, y) => [
  data[(y * width + x) * 4],
  data[(y * width + x) * 4 + 1],
  data[(y * width + x) * 4 + 2],
];
const colorNear = (actual, expected, tolerance = 12) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
const countPixels = (data, predicate) => {
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (predicate(data[index], data[index + 1], data[index + 2])) {
      count += 1;
    }
  }
  return count;
};

const OBLIQUE_TARGET = { width: 240, height: 150 };
const photo = buildPhoto(400, 300, OBLIQUE_QUAD);
const warped = warpQuadToPixels({
  source: photo,
  quad: OBLIQUE_QUAD,
  targetWidth: OBLIQUE_TARGET.width,
  targetHeight: OBLIQUE_TARGET.height,
});
check('斜拍梯形能产出矫正位图', warped !== null, true);
check(
  '矫正结果里不再出现任何背景像素（背景不是被擦除，而是根本没被采样到）',
  countPixels(warped, (r, g, b) => r > 170 && g < 120 && b < 100),
  0,
);
check(
  '矫正后卡面底色占比超过 80%',
  countPixels(warped, (r, g, b) => colorNear([r, g, b], CARD_COLOR, 6)) >
    OBLIQUE_TARGET.width * OBLIQUE_TARGET.height * 0.8,
  true,
);
[
  [3, 3, 0],
  [OBLIQUE_TARGET.width - 4, 3, 1],
  [OBLIQUE_TARGET.width - 4, OBLIQUE_TARGET.height - 4, 2],
  [3, OBLIQUE_TARGET.height - 4, 3],
].forEach(([x, y, index]) => {
  check(
    `矫正后第 ${index + 1} 个角落在卡片角点上`,
    colorNear(readPixel(warped, OBLIQUE_TARGET.width, x, y), CORNER_COLORS[index]),
    true,
  );
});
check(
  '矫正后对角线交点落在画布中心（射影不变量）',
  colorNear(
    readPixel(warped, OBLIQUE_TARGET.width, OBLIQUE_TARGET.width / 2, OBLIQUE_TARGET.height / 2),
    CENTER_COLOR,
  ),
  true,
);

// 矩形四角时是纯缩放：逐像素应精确等于原图对应区域
const RECT_QUAD = [
  { x: 40, y: 30 },
  { x: 280, y: 30 },
  { x: 280, y: 180 },
  { x: 40, y: 180 },
];
const rectPhoto = buildPhoto(400, 300, RECT_QUAD);
const rectWarped = warpQuadToPixels({
  source: rectPhoto,
  quad: RECT_QUAD,
  targetWidth: 240,
  targetHeight: 150,
});
check(
  '四边形为矩形时逐像素等价于原图裁剪',
  readPixel(rectWarped, 240, 10, 20),
  readPixel(rectPhoto.data, 400, 50, 50),
);

// 单应矩阵：把目标矩形四角精确映射回卡片四角
const RECT_TARGET = [
  { x: 0, y: 0 },
  { x: OBLIQUE_TARGET.width, y: 0 },
  { x: OBLIQUE_TARGET.width, y: OBLIQUE_TARGET.height },
  { x: 0, y: OBLIQUE_TARGET.height },
];
const homography = resolveHomography(RECT_TARGET, OBLIQUE_QUAD);
const homographyErrors = OBLIQUE_QUAD.map((point, index) => {
  const mapped = applyHomography(homography, RECT_TARGET[index]);
  return Math.hypot(mapped.x - point.x, mapped.y - point.y);
});
check(
  '单应矩阵把目标矩形四角映射到卡片四角（误差 < 1e-6）',
  Math.max(...homographyErrors) < 1e-6,
  true,
);

// 退化保护
const BOWTIE_QUAD = [
  { x: 60, y: 40 },
  { x: 350, y: 70 },
  { x: 80, y: 230 },
  { x: 330, y: 260 },
];
check('自交（蝴蝶形）四边形被拒绝', isValidQuad(BOWTIE_QUAD, 400, 300), false);
check(
  '共线四边形被拒绝',
  isValidQuad(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 300, y: 0 },
    ],
    400,
    300,
  ),
  false,
);
check(
  '面积过小的四边形被拒绝',
  isValidQuad(
    [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 25 },
      { x: 10, y: 25 },
    ],
    400,
    300,
  ),
  false,
);
check(
  '越界四边形被拒绝',
  isValidQuad(
    [
      { x: -40, y: 10 },
      { x: 300, y: 10 },
      { x: 300, y: 200 },
      { x: -40, y: 200 },
    ],
    400,
    300,
  ),
  false,
);
check('缺少标定（null）被拒绝', isValidQuad(null, 400, 300), false);
check(
  '退化四边形不产生任何像素',
  warpQuadToPixels({
    source: photo,
    quad: BOWTIE_QUAD,
    targetWidth: OBLIQUE_TARGET.width,
    targetHeight: OBLIQUE_TARGET.height,
  }),
  null,
);

// 拖动约束：只挡"会让四边形翻转"的拖法，不误挡斜拍产生的合法梯形
const dragDefaultQuad = createDefaultQuad(1600, 1200, 88 / 56);
const trapezoidMoved = constrainQuadCorner(dragDefaultQuad, 0, { x: 340, y: 240 }, 1600, 1200);
check(
  '上边整体右移的梯形允许拖到目标位置（不误挡斜拍）',
  Math.hypot(trapezoidMoved[0].x - 340, trapezoidMoved[0].y - 240) < 1e-9,
  true,
);
const clampedQuad = constrainQuadCorner(OBLIQUE_QUAD, 0, { x: 9999, y: 9999 }, 400, 300);
check('越界拖角后四边形依然可用', isValidQuad(clampedQuad, 400, 300), true);
check(
  '拖角被钳制在图片范围内',
  clampedQuad.every((point) => point.x >= 0 && point.y >= 0 && point.x <= 400 && point.y <= 300),
  true,
);
const flipAttempt = constrainQuadCorner(OBLIQUE_QUAD, 0, { x: 395, y: 295 }, 400, 300);
check('试图把角拖到对角位置时被凸性约束挡住', isValidQuad(flipAttempt, 400, 300), true);
check(
  '被挡住时角点停在凸性边界之前（不是原地不动）',
  Math.hypot(flipAttempt[0].x - OBLIQUE_QUAD[0].x, flipAttempt[0].y - OBLIQUE_QUAD[0].y) > 1,
  true,
);

// 边缘微调：围绕中心等比缩放，面积按比例平方收缩
check('边缘微调为 0 时四角不变', applyEdgeOffset(OBLIQUE_QUAD, 0), OBLIQUE_QUAD);
check(
  '边缘微调 +2% 时面积收缩到 0.98²',
  Math.abs(quadArea(applyEdgeOffset(OBLIQUE_QUAD, 2)) / quadArea(OBLIQUE_QUAD) - 0.98 * 0.98) <
    1e-6,
  true,
);
check(
  '边缘微调超出范围时按上下限钳制',
  Math.abs(quadArea(applyEdgeOffset(OBLIQUE_QUAD, 999)) / quadArea(OBLIQUE_QUAD) - 0.95 * 0.95) <
    1e-6,
  true,
);

// 默认四角：按规格比例内缩，且落在图片内
const defaultQuad = createDefaultQuad(1600, 1000, 88 / 56);
check('默认四角可用', isValidQuad(defaultQuad, 1600, 1000), true);
check(
  '默认四角保持规格宽高比',
  (defaultQuad[1].x - defaultQuad[0].x) / (defaultQuad[3].y - defaultQuad[0].y),
  88 / 56,
);
check(
  '默认四角是矩形（上下边等长）',
  quadAverageWidth(defaultQuad),
  defaultQuad[1].x - defaultQuad[0].x,
);

// 卡面补白：88×56 规格内按卡体真实尺寸居中，四周留 1.2mm / 1.0mm 白边
const PX_PER_MM_300 = dpiToPxPerMm(300);
const copyCard = resolveCardRect(COPY_88x56, PX_PER_MM_300, mmToPx(88, 300), mmToPx(56, 300));
check(
  '88×56 规格下卡面按卡体真实尺寸绘制',
  [copyCard.widthPx, copyCard.heightPx],
  [mmToPx(CARD_PHYSICAL.widthMm, 300), mmToPx(CARD_PHYSICAL.heightMm, 300)],
);
check('卡面居中的白边像素宽度', [copyCard.offsetX, copyCard.offsetY], [14, 12]);
check(
  '白边宽度约 1.2mm / 1.0mm',
  Math.abs(copyCard.offsetX / PX_PER_MM_300 - 1.2) < 0.1 &&
    Math.abs(copyCard.offsetY / PX_PER_MM_300 - 1.0) < 0.1,
  true,
);
const originalCard = resolveCardRect(ORIGINAL, PX_PER_MM_300, mmToPx(85.6, 300), mmToPx(54, 300));
check(
  '原大规格下卡面铺满画布',
  [originalCard.widthPx, originalCard.heightPx, originalCard.offsetX, originalCard.offsetY],
  [1011, 638, 0, 0],
);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} 项断言失败：`);
  failures.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}
console.log(`✓ 全部 ${passed} 项断言通过`);
