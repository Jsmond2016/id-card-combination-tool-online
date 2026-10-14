/**
 * 浏览器端 E2E 验证：真实走完「上传正反面 → A4 排版 → 导出 PDF」，
 * 校验预览画布尺寸、PDF 页面尺寸（A4）与内嵌位图精度（300 DPI）。
 * 用法：APP_URL=http://127.0.0.1:5199/ node scripts/verify-e2e.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchChrome, sleep } from './cdp.mjs';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5199/';
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9333);
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH ?? '';

const PAGE_FLOW = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const makeCard = (variant, width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = variant === 'front' ? '#bfdbfe' : '#fecaca';
    ctx.fillRect(width * 0.02, height * 0.04, width * 0.96, height * 0.92);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold ' + Math.round(height * 0.1) + 'px sans-serif';
    ctx.fillText(variant === 'front' ? 'TEST FRONT' : 'TEST BACK', width * 0.08, height * 0.45);
    return canvas;
  };
  const toFile = async (canvas, name) => {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new File([blob], name, { type: 'image/png' });
  };
  const feedNextDragger = (file) => {
    const input = document.querySelector('.ant-upload-drag input[type="file"]');
    if (!input) {
      throw new Error('未找到上传输入框');
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  feedNextDragger(await toFile(makeCard('front', 1600, 1000), 'front.png'));
  await sleep(900);
  feedNextDragger(await toFile(makeCard('back', 1600, 1000), 'back.png'));
  await sleep(1200);

  const canvases = Array.from(document.querySelectorAll('canvas'));
  const paper = canvases.find((canvas) => canvas.width === 520);
  if (!paper) {
    throw new Error('未找到 A4 预览画布，实际画布: ' + JSON.stringify(canvases.map((c) => [c.width, c.height])));
  }
  const pixels = paper.getContext('2d').getImageData(0, 0, paper.width, paper.height).data;
  let colored = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) {
      colored += 1;
    }
  }

  const exportButton = document.querySelector('.ant-btn-primary');
  if (!exportButton) {
    throw new Error('未找到导出按钮');
  }
  exportButton.click();
  await sleep(2500);

  return {
    preview: { width: paper.width, height: paper.height, coloredPixels: colored },
    canvasCount: canvases.length,
    faceLabels: Array.from(document.querySelectorAll('.ant-tag')).map((tag) => tag.textContent),
    title: document.title,
  };
})()`;

const SAMPLE_FLOW = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clickLabel = (text) => {
    const label = Array.from(document.querySelectorAll('label')).find(
      (item) => item.textContent.trim() === text,
    );
    if (!label) {
      throw new Error('未找到选项: ' + text);
    }
    label.click();
  };
  const measure = () => {
    const canvas = document.querySelector('canvas[width="520"]');
    if (!canvas) {
      return 0;
    }
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 240 || data[index + 1] < 240 || data[index + 2] < 240) {
        colored += 1;
      }
    }
    return colored;
  };

  const oneCopyPixels = measure();
  clickLabel('2 份');
  await sleep(900);
  const twoCopyPixels = measure();
  clickLabel('左右排列');
  await sleep(900);
  const horizontalPixels = measure();
  clickLabel('88 × 56 mm');
  await sleep(300);
  clickLabel('PNG（无损图片）');
  await sleep(200);
  document.querySelector('.ant-btn-primary').click();
  await sleep(2600);

  return { oneCopyPixels, twoCopyPixels, horizontalPixels };
})()`;

const GAP_FLOW = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const store = window.__idCardStore;
  if (!store) {
    return { available: false };
  }
  // 按行统计着色像素，识别上下两个内容带。
  // 注意：测试图四周带浅色留白，不能用"带与带之间的空白"量间距，
  // 而要用两条带顶边的距离（= 卡片高度 + 间距），它与图片留白无关。
  const measureBands = () => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find(
      (item) => item.width === 520,
    );
    if (!canvas) {
      return { bands: 0, topDeltaPx: null };
    }
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const coloredRows = [];
    for (let y = 0; y < canvas.height; y += 1) {
      let colored = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        if (data[index] < 240 || data[index + 1] < 240 || data[index + 2] < 240) {
          colored += 1;
        }
      }
      coloredRows.push(colored > 3);
    }
    const bands = [];
    let start = -1;
    for (let y = 0; y < coloredRows.length; y += 1) {
      if (coloredRows[y] && start === -1) {
        start = y;
      }
      const isLast = y === coloredRows.length - 1;
      if (start !== -1 && (!coloredRows[y] || isLast)) {
        bands.push([start, coloredRows[y] ? y : y - 1]);
        start = -1;
      }
    }
    if (bands.length < 2) {
      return { bands: bands.length, topDeltaPx: null };
    }
    return { bands: bands.length, topDeltaPx: bands[1][0] - bands[0][0] };
  };

  const { gapMm: initialGapMm, specId } = store.getState().layout;
  const initial = measureBands();
  store.getState().setLayout({ gapMm: 25 });
  await sleep(700);
  const widened = measureBands();
  store.getState().setLayout({ gapMm: initialGapMm });
  await sleep(500);
  const restored = measureBands();
  return { available: true, specId, initialGapMm, initial, widened, restored };
})()`;

/**
 * 拖拽吸附用到的探针。
 * 纸张画布与参考线叠加画布同为 520px 宽，按 DOM 顺序区分：
 * canvases[0] = 纸张，canvases[1] = 参考线。
 */
const SNAP_GEOMETRY = `(() => {
  const paper = Array.from(document.querySelectorAll('canvas[width="520"]'))[0];
  if (!paper) {
    return { available: false };
  }
  const rect = paper.getBoundingClientRect();
  const wrapper = paper.parentElement;
  return {
    available: true,
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    // 参考标尺占位：开启时纸张相对预览容器右移 18px，关闭时为 0
    rulerOffset: Math.round(
      wrapper.getBoundingClientRect().left - wrapper.parentElement.getBoundingClientRect().left,
    ),
  };
})()`;

const SNAP_INSPECT = `(() => {
  const store = window.__idCardStore;
  const canvases = Array.from(document.querySelectorAll('canvas[width="520"]'));
  const overlay = canvases[1];
  let guidePixels = 0;
  if (overlay) {
    const data = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) {
        guidePixels += 1;
      }
    }
  }
  return {
    canvasCount: canvases.length,
    guidePixels,
    offset: store.getState().faces.front.offset,
  };
})()`;

const TOGGLE_RULER = (on) => `(() => {
  window.__idCardStore.getState().setLayout({ showPreviewRuler: ${on} });
  return true;
})()`;

const findDownload = (directory) => {
  const files = readdirSync(directory).filter((name) => name.endsWith('.pdf'));
  return files.length > 0 ? join(directory, files[0]) : null;
};

const main = async () => {
  const failures = [];
  const record = (name, ok, detail) => {
    if (ok) {
      console.log(`  ✓ ${name}`);
    } else {
      failures.push(`${name} → ${detail}`);
      console.log(`  ✗ ${name} → ${detail}`);
    }
  };

  const { chrome, client, downloadDir } = await launchChrome({ port: DEBUG_PORT });

  try {
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
    await client.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    const result = await client.evaluate(PAGE_FLOW);
    console.log('\n浏览器实测：');

    record('页面标题正确', result.title.includes('身份证复印件'), result.title);
    record('A4 预览画布宽 520px', result.preview.width === 520, String(result.preview.width));
    record(
      'A4 预览比例等于 210:297',
      Math.abs(result.preview.height / result.preview.width - 297 / 210) < 0.005,
      `height=${result.preview.height}`,
    );
    record(
      'A4 预览已绘制正反面内容',
      result.preview.coloredPixels > 5000,
      `着色像素 ${result.preview.coloredPixels}`,
    );
    record('画布数量含 A4 与两个面位预览', result.canvasCount >= 3, String(result.canvasCount));

    // R7：正反面间距默认值与调节链路（默认 10mm，改动后预览随之变化）
    const gap = await client.evaluate(GAP_FLOW);
    record('开发探针可用（间距断言）', gap.available === true, '未找到 window.__idCardStore');
    if (gap.available) {
      // 两条内容带顶边的距离 = 卡片高度 + 间距，因此减去卡片高度即得实测间距
      const CARD_HEIGHT_MM_BY_SPEC = { 'copy-88x56': 56, 'original-85.6x54': 54 };
      const pxPerMm = 520 / 210;
      const cardHeightMm = CARD_HEIGHT_MM_BY_SPEC[gap.specId];
      const measuredGapMm = (band) =>
        band.topDeltaPx === null ? null : band.topDeltaPx / pxPerMm - cardHeightMm;
      const near = (value, expected) => value !== null && Math.abs(value - expected) < 1;
      record('默认正反面间距为 10mm', gap.initialGapMm === 10, String(gap.initialGapMm));
      record(
        '预览实测默认间距约为 10mm',
        near(measuredGapMm(gap.initial), gap.initialGapMm),
        `实测 ${measuredGapMm(gap.initial)?.toFixed(2)}mm`,
      );
      record(
        '间距改为 25mm 后预览随之变化',
        near(measuredGapMm(gap.widened), 25),
        `实测 ${measuredGapMm(gap.widened)?.toFixed(2)}mm`,
      );
      record(
        '复位后间距恢复默认',
        near(measuredGapMm(gap.restored), gap.initialGapMm),
        `实测 ${measuredGapMm(gap.restored)?.toFixed(2)}mm`,
      );
    }

    // R19：参考标尺与拖拽吸附（真实鼠标事件驱动）
    const snapGeometry = await client.evaluate(SNAP_GEOMETRY);
    if (snapGeometry.available) {
      record(
        '参考标尺默认显示',
        snapGeometry.rulerOffset === 18,
        `纸张相对容器偏移 ${snapGeometry.rulerOffset}px`,
      );
      const { rect } = snapGeometry;
      const pxPerMmX = rect.width / 210;
      const pxPerMmY = rect.height / 297;
      // 默认版式（88×56、1 份、上下排列、居中）下正面卡片中心位于 (105, 115.5)mm
      const startX = rect.left + 105 * pxPerMmX;
      const startY = rect.top + 115.5 * pxPerMmY;
      // 拖到「左边缘 11.5mm、上边缘 149.5mm」，两处都落在参考线 10mm / 148.5mm 的吸附范围内
      const endX = rect.left + 55.5 * pxPerMmX;
      const endY = rect.top + 177.5 * pxPerMmY;

      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX, y: startY });
      await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: startX,
        y: startY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      for (let step = 1; step <= 6; step += 1) {
        await client.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: startX + ((endX - startX) * step) / 6,
          y: startY + ((endY - startY) * step) / 6,
          button: 'left',
          buttons: 1,
        });
        await sleep(30);
      }
      const duringDrag = await client.evaluate(SNAP_INSPECT);
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      await sleep(250);
      const afterDrag = await client.evaluate(SNAP_INSPECT);

      record(
        '纸张与参考线各占一个画布',
        duringDrag.canvasCount >= 2,
        `${duringDrag.canvasCount} 个画布`,
      );
      record(
        '拖拽过程中绘制吸附参考线',
        duringDrag.guidePixels > 200,
        `参考线像素 ${duringDrag.guidePixels}`,
      );
      record(
        '松开后参考线清除',
        afterDrag.guidePixels === 0,
        `参考线像素 ${afterDrag.guidePixels}`,
      );
      record(
        '横向吸附到 10mm 安全边距线',
        Math.abs(afterDrag.offset.xMm + 51) < 0.1,
        `offset.xMm = ${afterDrag.offset.xMm}（期望 -51，即左边缘落在 10mm）`,
      );
      record(
        '纵向吸附到 148.5mm 页面中心线',
        Math.abs(afterDrag.offset.yMm - 61) < 0.1,
        `offset.yMm = ${afterDrag.offset.yMm}（期望 61，即上边缘落在 148.5mm）`,
      );

      // 复位偏移，避免影响后续 2 份 / 左右排列的像素统计
      await client.evaluate(
        `(() => { window.__idCardStore.getState().resetOffsets(); return true; })()`,
      );
      await sleep(300);
    } else {
      record('参考标尺与吸附探针可用', false, '未找到纸张画布');
    }

    await client.evaluate(TOGGLE_RULER(false));
    await sleep(300);
    const rulerOff = await client.evaluate(SNAP_GEOMETRY);
    record(
      '关闭开关后参考标尺不再占位',
      rulerOff.available && rulerOff.rulerOffset === 0,
      `纸张相对容器偏移 ${rulerOff.rulerOffset}px`,
    );
    await client.evaluate(TOGGLE_RULER(true));
    await sleep(300);

    let pdfPath = null;
    for (let attempt = 0; attempt < 40 && !pdfPath; attempt += 1) {
      pdfPath = findDownload(downloadDir);
      if (!pdfPath) {
        await sleep(400);
      }
    }
    record('已产生 PDF 下载', Boolean(pdfPath), pdfPath ?? '未生成文件');

    if (pdfPath) {
      const raw = readFileSync(pdfPath, 'latin1');
      const mediaBox = raw.match(/MediaBox\s*\[([^\]]+)\]/);
      const numbers = mediaBox ? mediaBox[1].trim().split(/\s+/).map(Number) : [];
      const widthPt = numbers[2];
      const heightPt = numbers[3];
      record(
        'PDF 页面尺寸为 A4（595.28 × 841.89 pt）',
        Math.abs(widthPt - 595.28) < 1 && Math.abs(heightPt - 841.89) < 1,
        `MediaBox=[${numbers.join(' ')}]`,
      );
      const a4WidthMm = (widthPt / 72) * 25.4;
      const a4HeightMm = (heightPt / 72) * 25.4;
      record(
        'PDF 页面换算为 210 × 297mm',
        Math.abs(a4WidthMm - 210) < 0.3 && Math.abs(a4HeightMm - 297) < 0.3,
        `${a4WidthMm.toFixed(2)} × ${a4HeightMm.toFixed(2)}mm`,
      );
      record(
        'PDF 内嵌位图为 300 DPI A4 像素',
        raw.includes('/Width 2480') && raw.includes('/Height 3508'),
        '未找到 2480×3508',
      );
    }

    const consoleErrors = client.events
      .filter(
        (event) =>
          (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
          event.method === 'Runtime.exceptionThrown' ||
          (event.method === 'Log.entryAdded' && event.params.entry.level === 'error'),
      )
      .map((event) =>
        event.method === 'Log.entryAdded'
          ? event.params.entry.text
          : JSON.stringify(
              event.params.exceptionDetails?.exception?.description ?? event.params.args,
            ),
      );
    record('运行期无控制台错误', consoleErrors.length === 0, consoleErrors.join(' | ') || '无');

    // R13：全流程不得出现跨域请求（图片不离开浏览器）
    const requestUrls = client.events
      .filter((event) => event.method === 'Network.requestWillBeSent')
      .map((event) => event.params.request.url)
      .filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'));
    const foreignRequests = requestUrls.filter(
      (url) => !url.startsWith(APP_URL.replace(/\/$/, '')),
    );
    record(
      '未向任何第三方发起请求',
      foreignRequests.length === 0,
      foreignRequests.slice(0, 3).join(' | ') || '无',
    );
    record('仍完成了同源资源加载', requestUrls.length > 0, `请求数 ${requestUrls.length}`);

    // 追加验证：每页 2 份（R9）与 PNG 导出像素尺寸（R10）
    const sample = await client.evaluate(SAMPLE_FLOW);
    record(
      '每页 2 份后纸张内容约翻倍',
      sample.twoCopyPixels > sample.oneCopyPixels * 1.8,
      `1 份 ${sample.oneCopyPixels} → 2 份 ${sample.twoCopyPixels}`,
    );
    record(
      '切换左右排列后仍正常绘制',
      sample.horizontalPixels > 5000,
      String(sample.horizontalPixels),
    );

    let pngPath = null;
    for (let attempt = 0; attempt < 30 && !pngPath; attempt += 1) {
      const files = readdirSync(downloadDir).filter((name) => name.endsWith('.png'));
      pngPath = files.length > 0 ? join(downloadDir, files[0]) : null;
      if (!pngPath) {
        await sleep(400);
      }
    }
    record('已产生 PNG 下载', Boolean(pngPath), pngPath ?? '未生成文件');
    if (pngPath) {
      const png = readFileSync(pngPath);
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      record(
        'PNG 像素尺寸为 2480 × 3508（300 DPI A4）',
        width === 2480 && height === 3508,
        `${width} × ${height}`,
      );
    }

    if (SCREENSHOT_PATH) {
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      writeFileSync(SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
      console.log(`  · 截图已保存：${SCREENSHOT_PATH}`);
    }
  } finally {
    chrome.kill('SIGKILL');
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} 项验证失败`);
    process.exit(1);
  }
  console.log('\n✓ 浏览器端 E2E 验证全部通过');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
