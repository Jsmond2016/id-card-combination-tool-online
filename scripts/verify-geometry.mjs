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

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} 项断言失败：`);
  failures.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}
console.log(`✓ 全部 ${passed} 项断言通过`);
