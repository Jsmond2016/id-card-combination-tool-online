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
check('默认正反面间距为 10mm', DEFAULT_FACE_GAP_MM, 10);

// --- R7：上下排列居中 ---
const vertical = buildLayoutPlan({
  ...base,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('上下排列分组尺寸', [vertical.groupSize.widthMm, vertical.groupSize.heightMm], [88, 122]);
check('上下排列坐标', vertical.placed, [
  { kind: 'front', xMm: 61, yMm: 87.5 },
  { kind: 'back', xMm: 61, yMm: 153.5 },
]);
check('上下排列不溢出', vertical.overflow, false);
check(
  '正反面实际间距等于设置值',
  vertical.placed[1].yMm - (vertical.placed[0].yMm + COPY_88x56.heightMm),
  10,
);

// --- R7：间距可调 ---
const wideGap = buildLayoutPlan({
  ...base,
  gapMm: 20,
  mode: 'vertical',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('间距 20mm 时分组高度', wideGap.groupSize.heightMm, 132);
check('间距 20mm 时坐标随之变化', wideGap.placed, [
  { kind: 'front', xMm: 61, yMm: 82.5 },
  { kind: 'back', xMm: 61, yMm: 158.5 },
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
check('间距为 NaN 时回退默认值', nanGap.groupSize.heightMm, 122);

// --- R7：左右排列居中 ---
const horizontal = buildLayoutPlan({
  ...base,
  mode: 'horizontal',
  align: 'center',
  preset: COPY_88x56,
  kinds: ['front', 'back'],
});
check('左右排列分组尺寸', [horizontal.groupSize.widthMm, horizontal.groupSize.heightMm], [186, 56]);
check('左右排列坐标', horizontal.placed, [
  { kind: 'front', xMm: 12, yMm: 120.5 },
  { kind: 'back', xMm: 110, yMm: 120.5 },
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
check('2 份内容高度', twoCopies.contentSize.heightMm, 252);
check('2 份坐标', twoCopies.placed, [
  { kind: 'front', xMm: 61, yMm: 22.5 },
  { kind: 'back', xMm: 61, yMm: 88.5 },
  { kind: 'front', xMm: 61, yMm: 152.5 },
  { kind: 'back', xMm: 61, yMm: 218.5 },
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
check('偏移生效且不改变尺寸', [offsetPlan.placed[0].xMm, offsetPlan.placed[0].yMm], [71, 67.5]);
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
check('水印文字上限为 15 个字', WATERMARK_TEXT_MAX_LENGTH, 15);
check('水印默认字号为 8mm', DEFAULT_WATERMARK_FONT_SIZE_MM, 8);
check('水印默认平铺间距为 50mm', DEFAULT_WATERMARK_SPACING_MM, 50);
check('水印默认倾斜角为 -30°', DEFAULT_WATERMARK_ANGLE_DEG, -30);
check('水印默认文案可用', normalizeWatermarkText('仅供办理业务使用'), '仅供办理业务使用');
check(
  '超长文字按码点截断到 15 个字',
  normalizeWatermarkText('仅供办理业务使用仅供办理业务使用'),
  '仅供办理业务使用仅供办理业务使',
);
check(
  '换行与连续空白被折叠',
  normalizeWatermarkText('  仅供\n办理   业务使用 '),
  '仅供 办理 业务使用',
);
check('空文字保持为空', normalizeWatermarkText('   \n '), '');
check(
  '代理对（emoji）按一个字计数',
  Array.from(normalizeWatermarkText('🎫'.repeat(20))).length,
  15,
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
  resolveWatermarkDrawParams({ ...watermarkBase, text: '仅供办理业务使用仅供办理业务使用' }).text,
  '仅供办理业务使用仅供办理业务使',
);
// 最密配置：字号取下限 + 间距取下限 + 15 个半角字符
const densestParams = resolveWatermarkDrawParams({
  ...watermarkBase,
  text: 'iiiiiiiiiiiiiii',
  fontSizeMm: 4,
  spacingMm: 20,
});
check('最密配置下瓦片数量有上界（< 400）', densestParams.layout.tiles.length < 400, true);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} 项断言失败：`);
  failures.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}
console.log(`✓ 全部 ${passed} 项断言通过`);
