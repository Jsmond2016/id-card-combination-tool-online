/**
 * 裁剪编辑回归验证：拖动 / 缩放 / 旋转 / 复位 / 关闭弹窗后，
 * A4 纸张与面位预览必须始终有画面，且 store 中的裁剪区域始终为有限正数。
 *
 * 该脚本最初用于复现缺陷「调整裁剪后图片丢失」：react-easy-crop 在弹窗卸载、
 * 容器尺寸不可用时会通过 onCropComplete 回传 NaN，被写入 store 后成品渲染成纯白。
 *
 * 用法：先 pnpm dev --host 127.0.0.1 --port 5199，再 pnpm verify:crop
 */
import { launchChrome, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5199/';
const PORT = Number(process.env.CDP_PORT ?? 9334);
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH ?? '';

const IMAGE_WIDTH = Number(process.env.IMAGE_WIDTH ?? 4000);
const IMAGE_HEIGHT = Number(process.env.IMAGE_HEIGHT ?? 3000);

const UPLOAD_FLOW = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const makeCard = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(width * 0.02, height * 0.04, width * 0.96, height * 0.92);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold ' + Math.round(height * 0.1) + 'px sans-serif';
    ctx.fillText('TEST FRONT', width * 0.08, height * 0.45);
    return canvas;
  };
  const blob = await new Promise((resolve) =>
    makeCard(${IMAGE_WIDTH}, ${IMAGE_HEIGHT}).toBlob(resolve, 'image/png'),
  );
  const input = document.querySelector('.ant-upload-drag input[type="file"]');
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], 'front.png', { type: 'image/png' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1200);
  return true;
})()`;

const INSPECT_FLOW = `(() => {
  const countColored = (selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas) {
      return null;
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
  const state = window.__idCardStore ? window.__idCardStore.getState() : null;
  const front = state ? state.faces.front : null;
  const area = front ? front.croppedAreaPixels : null;
  const cropFinite = Boolean(
    area &&
      Number.isFinite(area.x) &&
      Number.isFinite(area.y) &&
      Number.isFinite(area.width) &&
      Number.isFinite(area.height) &&
      area.width > 0 &&
      area.height > 0,
  );
  return {
    a4: countColored('canvas[width="520"]'),
    card: countColored('canvas[width="132"]'),
    modal: countColored('canvas[width="220"]'),
    hasSource: Boolean(front && front.source),
    croppedAreaPixels: front ? front.croppedAreaPixels : null,
    cropFinite,
    zoom: front ? Number(front.zoom.toFixed(3)) : null,
    crop: front ? { x: Math.round(front.crop.x), y: Math.round(front.crop.y) } : null,
    fineRotation: front ? front.fineRotation : null,
  };
})()`;

const clickButtonFlow = (text) =>
  `(() => {
    const normalize = (value) => value.replace(/\\s+/g, '');
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => normalize(item.textContent) === ${JSON.stringify(text)},
    );
    if (!button) {
      const labels = Array.from(document.querySelectorAll('button')).map((item) => item.textContent);
      throw new Error('未找到按钮: ' + ${JSON.stringify(text)} + ' 现有: ' + JSON.stringify(labels));
    }
    button.click();
    return true;
  })()`;

const rectFlow = (selector) =>
  `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) { return null; }
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`;

const sliderRectFlow = (index) =>
  `(() => {
    const element = document.querySelectorAll('.ant-modal .ant-slider')[${index}];
    if (!element) { return null; }
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`;

const main = async () => {
  const { chrome, client } = await launchChrome({ port: PORT });
  const trace = [];

  const snap = async (label) => {
    const data = await client.evaluate(INSPECT_FLOW);
    trace.push({ label, ...data });
    console.log(
      `${label.padEnd(16)} A4=${String(data.a4).padStart(6)} 卡片=${String(data.card).padStart(6)}` +
        ` 弹窗=${String(data.modal).padStart(6)} | source=${data.hasSource ? 'Y' : 'N'}` +
        ` crop有效=${data.cropFinite ? 'Y' : 'N'} cropArea=${JSON.stringify(data.croppedAreaPixels)} zoom=${data.zoom}` +
        ` crop=${JSON.stringify(data.crop)} fine=${data.fineRotation}`,
    );
    return data;
  };

  try {
    await client.send('Page.navigate', { url: APP_URL });
    await sleep(2500);
    await client.evaluate(UPLOAD_FLOW);
    await snap('1 上传完成');

    await client.evaluate(clickButtonFlow('调整裁剪'));
    await sleep(1400);
    await snap('2 打开弹窗');

    const container = await client.evaluate(rectFlow('.reactEasyCrop_Container'));
    if (!container) {
      throw new Error('未找到裁剪容器');
    }
    const centerX = container.x + container.width / 2;
    const centerY = container.y + container.height / 2;
    await client.dragFromTo(centerX, centerY, centerX + 70, centerY - 40);
    await sleep(800);
    await snap('3 拖动图片');

    const zoomSlider = await client.evaluate(sliderRectFlow(0));
    if (zoomSlider) {
      await client.clickAt(
        zoomSlider.x + zoomSlider.width * 0.65,
        zoomSlider.y + zoomSlider.height / 2,
      );
      await sleep(800);
      await snap('4 放大');
    }

    const zoomToMax = await client.evaluate(sliderRectFlow(0));
    if (zoomToMax) {
      await client.clickAt(
        zoomToMax.x + zoomToMax.width * 0.98,
        zoomToMax.y + zoomToMax.height / 2,
      );
      await sleep(800);
      await snap('4b 放到最大');
    }

    const rotationSlider = await client.evaluate(sliderRectFlow(1));
    if (rotationSlider) {
      await client.clickAt(
        rotationSlider.x + rotationSlider.width * 0.62,
        rotationSlider.y + rotationSlider.height / 2,
      );
      await sleep(800);
      await snap('5 旋转微调');
      if (SCREENSHOT_PATH) {
        const shot = await client.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(
          SCREENSHOT_PATH.replace(/\.png$/, '-rotated.png'),
          Buffer.from(shot.data, 'base64'),
        );
      }
    }

    await client.evaluate(clickButtonFlow('右转90°'));
    await sleep(900);
    await snap('6 右转 90°');

    await client.evaluate(clickButtonFlow('复位'));
    await sleep(900);
    await snap('7 点击复位');

    await client.evaluate(clickButtonFlow('完成'));
    await sleep(1000);
    await snap('8 关闭弹窗');

    if (SCREENSHOT_PATH) {
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      writeFileSync(SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
      console.log(`· 截图已保存：${SCREENSHOT_PATH}`);
    }
  } finally {
    chrome.kill('SIGKILL');
  }

  const blank = trace.filter((item) => item.a4 === 0).map((item) => item.label);
  const lostSource = trace.filter((item) => !item.hasSource).map((item) => item.label);
  const badCrop = trace.filter((item) => !item.cropFinite).map((item) => item.label);
  console.log('');
  if (blank.length > 0) {
    console.log(`✗ 复现：A4 纸张为空 → ${blank.join(' / ')}`);
  }
  if (lostSource.length > 0) {
    console.log(`✗ 复现：图片源丢失 → ${lostSource.join(' / ')}`);
  }
  if (badCrop.length > 0) {
    console.log(`✗ 复现：裁剪区域无效（NaN）→ ${badCrop.join(' / ')}`);
  }
  if (blank.length === 0 && lostSource.length === 0 && badCrop.length === 0) {
    console.log('✓ 未复现：A4 始终有画面，图片源与裁剪区域始终有效');
    process.exit(0);
  }
  process.exit(1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
