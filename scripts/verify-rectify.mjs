/**
 * 透视矫正（R22）浏览器端验证 + 效果对比图。
 *
 * 做法：用真实针孔相机模型把一张"示例身份证"投影成梯形照片（带木质桌面背景），
 * 上传后先看矩形裁剪（四角必然露出桌面），再把四个角点拖到卡片四角，
 * 断言 A4 预览里的桌面像素归零，并把前后对比图写到 SCREENSHOT_DIR。
 *
 * 用法：先 pnpm dev --host 127.0.0.1 --port 5199，再 pnpm verify:rectify
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchChrome, sleep } from './cdp.mjs';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5199/';
const PORT = Number(process.env.CDP_PORT ?? 9335);
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? 'tmp/rectify-demo';

const PHOTO_FLOW = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const CARD = { w: 85.6, h: 54 };
  const PHOTO = { w: 1600, h: 1200 };
  const CARD_CANVAS = { w: 1200, h: 757 };

  // --- 1. 用真实针孔相机模型把卡片四角投影成梯形 ---
  const yaw = 0.14;
  const tilt = 0.72;
  const roll = 0.05;
  const distance = 320;
  const focal = 3200;
  const project = (x, y) => {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const x1 = x * cosY;
    const y1 = y;
    const z1 = -x * sinY;
    const x2 = x1;
    const y2 = y1 * cosT - z1 * sinT;
    const z2 = y1 * sinT + z1 * cosT;
    const x3 = x2 * cosR - y2 * sinR;
    const y3 = x2 * sinR + y2 * cosR;
    const z3 = z2 - distance;
    return { x: (focal * x3) / -z3, y: (focal * y3) / -z3 };
  };
  const rawQuad = [
    project(-CARD.w / 2, -CARD.h / 2),
    project(CARD.w / 2, -CARD.h / 2),
    project(CARD.w / 2, CARD.h / 2),
    project(-CARD.w / 2, CARD.h / 2),
  ];
  const minX = Math.min(...rawQuad.map((p) => p.x));
  const maxX = Math.max(...rawQuad.map((p) => p.x));
  const minY = Math.min(...rawQuad.map((p) => p.y));
  const maxY = Math.max(...rawQuad.map((p) => p.y));
  const fit = Math.min(940 / (maxX - minX), 520 / (maxY - minY));
  const quad = rawQuad.map((p) => ({
    x: PHOTO.w / 2 + (p.x - (minX + maxX) / 2) * fit,
    y: PHOTO.h / 2 + (p.y - (minY + maxY) / 2) * fit,
  }));

  // --- 2. 卡片内容 ---
  const card = document.createElement('canvas');
  card.width = CARD_CANVAS.w;
  card.height = CARD_CANVAS.h;
  const cc = card.getContext('2d');
  const gradient = cc.createLinearGradient(0, 0, CARD_CANVAS.w, CARD_CANVAS.h);
  gradient.addColorStop(0, '#f7fafd');
  gradient.addColorStop(1, '#e4eefb');
  cc.fillStyle = gradient;
  cc.fillRect(0, 0, CARD_CANVAS.w, CARD_CANVAS.h);
  cc.strokeStyle = '#b9cde4';
  cc.lineWidth = 8;
  cc.strokeRect(14, 14, CARD_CANVAS.w - 28, CARD_CANVAS.h - 28);
  cc.fillStyle = '#33507a';
  cc.font = 'bold 48px sans-serif';
  cc.fillText('示例卡片 · SPECIMEN', 70, 130);
  cc.fillStyle = '#8aa0b6';
  cc.font = '30px sans-serif';
  cc.fillText('本图仅用于工具演示，非真实证件', 70, CARD_CANVAS.h - 70);
  cc.fillStyle = '#c7d6e6';
  [200, 268, 336].forEach((y, index) => {
    cc.fillRect(70, y, index === 2 ? 420 : 620, 26);
  });
  cc.fillStyle = '#dbe6f3';
  cc.fillRect(830, 180, 300, 380);
  cc.strokeStyle = '#b9cde4';
  cc.lineWidth = 4;
  cc.strokeRect(830, 180, 300, 380);
  cc.fillStyle = '#7c93ad';
  cc.font = '32px sans-serif';
  cc.fillText('照片区', 900, 390);

  // --- 3. 桌面背景 ---
  const photo = document.createElement('canvas');
  photo.width = PHOTO.w;
  photo.height = PHOTO.h;
  const pc = photo.getContext('2d');
  const desk = pc.createLinearGradient(0, 0, PHOTO.w, PHOTO.h);
  desk.addColorStop(0, '#6d4c31');
  desk.addColorStop(0.5, '#8a6440');
  desk.addColorStop(1, '#5e4128');
  pc.fillStyle = desk;
  pc.fillRect(0, 0, PHOTO.w, PHOTO.h);
  for (let y = 0; y < PHOTO.h; y += 9) {
    pc.fillStyle = y % 27 === 0 ? 'rgba(46,30,17,0.16)' : 'rgba(196,152,104,0.10)';
    pc.fillRect(0, y, PHOTO.w, 3);
  }
  pc.fillStyle = 'rgba(46,30,17,0.10)';
  for (let index = 0; index < 26; index += 1) {
    const x = (index * 137) % PHOTO.w;
    const y = (index * 233) % PHOTO.h;
    pc.beginPath();
    pc.ellipse(x, y, 60 + (index % 5) * 24, 18 + (index % 3) * 10, index, 0, Math.PI * 2);
    pc.fill();
  }

  // --- 4. 卡片投影到梯形（竖向切条 + 逐条仿射，边界严格落在四角上） ---
  const at = (u, v) => ({
    x:
      (1 - u) * (1 - v) * quad[0].x +
      u * (1 - v) * quad[1].x +
      u * v * quad[2].x +
      (1 - u) * v * quad[3].x,
    y:
      (1 - u) * (1 - v) * quad[0].y +
      u * (1 - v) * quad[1].y +
      u * v * quad[2].y +
      (1 - u) * v * quad[3].y,
  });
  const shadow = document.createElement('canvas');
  shadow.width = PHOTO.w;
  shadow.height = PHOTO.h;
  const sc = shadow.getContext('2d');
  sc.beginPath();
  sc.moveTo(quad[0].x + 16, quad[0].y + 22);
  sc.lineTo(quad[1].x + 16, quad[1].y + 22);
  sc.lineTo(quad[2].x + 16, quad[2].y + 22);
  sc.lineTo(quad[3].x + 16, quad[3].y + 22);
  sc.closePath();
  sc.fillStyle = 'rgba(0,0,0,0.45)';
  sc.filter = 'blur(22px)';
  sc.fill();
  pc.drawImage(shadow, 0, 0);

  // 先按卡片底色铺满四边形，避免切条之间出现发丝缝
  pc.beginPath();
  pc.moveTo(quad[0].x, quad[0].y);
  pc.lineTo(quad[1].x, quad[1].y);
  pc.lineTo(quad[2].x, quad[2].y);
  pc.lineTo(quad[3].x, quad[3].y);
  pc.closePath();
  pc.fillStyle = '#eef4fb';
  pc.fill();

  const steps = 320;
  for (let index = 0; index < steps; index += 1) {
    const u0 = index / steps;
    const u1 = (index + 1) / steps;
    const p0 = at(u0, 0);
    const p1 = at(u0, 1);
    const p3 = at(u1, 0);
    const p2 = at(u1, 1);
    const stripWidth = (u1 - u0) * CARD_CANVAS.w;
    const ex = { x: (p3.x - p0.x) / stripWidth, y: (p3.y - p0.y) / stripWidth };
    const ey = { x: (p1.x - p0.x) / CARD_CANVAS.h, y: (p1.y - p0.y) / CARD_CANVAS.h };
    pc.save();
    pc.beginPath();
    pc.moveTo(p0.x, p0.y);
    pc.lineTo(p1.x, p1.y);
    pc.lineTo(p2.x, p2.y);
    pc.lineTo(p3.x, p3.y);
    pc.closePath();
    pc.clip();
    pc.translate(p0.x, p0.y);
    pc.transform(ex.x, ex.y, ey.x, ey.y, 0, 0);
    pc.translate(-u0 * CARD_CANVAS.w, 0);
    pc.drawImage(card, 0, 0);
    pc.restore();
  }

  // --- 5. 上传 ---
  const blob = await new Promise((resolve) => photo.toBlob(resolve, 'image/png'));
  const input = document.querySelector('.ant-upload-drag input[type="file"]');
  if (!input) {
    throw new Error('未找到上传输入框');
  }
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], 'oblique-card.png', { type: 'image/png' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1500);
  return { quad, photo: PHOTO, card: CARD };
})()`;

/** 统计 A4 预览画布里的"桌面色"像素与"有内容"像素 */
const MEASURE_FLOW = `(() => {
  const canvas = document.querySelector('canvas[width="520"]');
  if (!canvas) {
    return null;
  }
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let desk = 0;
  let colored = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    if (r > 90 && r < 235 && r - b > 25 && g < r && b < g) {
      desk += 1;
    }
    if (r < 240 || g < 240 || b < 240) {
      colored += 1;
    }
  }
  const state = window.__idCardStore ? window.__idCardStore.getState() : null;
  const front = state ? state.faces.front : null;
  return {
    desk,
    colored,
    rectifyEnabled: front ? front.rectify.enabled : null,
    quad:
      front && front.rectify.quad
        ? front.rectify.quad.map((point) => [Math.round(point.x), Math.round(point.y)])
        : null,
  };
})()`;

const CLICK_BUTTON_FLOW = (text) =>
  `(() => {
    const normalize = (value) => value.replace(/\\s+/g, '');
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => normalize(item.textContent) === ${JSON.stringify(text)},
    );
    if (!button) {
      throw new Error('未找到按钮: ' + ${JSON.stringify(text)});
    }
    button.click();
    return true;
  })()`;

const SWITCH_MODE_FLOW = `(() => {
  const normalize = (value) => value.replace(/\\s+/g, '');
  const option = Array.from(document.querySelectorAll('.ant-segmented-item')).find((item) =>
    normalize(item.textContent).includes('透视矫正'),
  );
  if (!option) {
    throw new Error('未找到「透视矫正」分段选项');
  }
  option.click();
  return true;
})()`;

/** 读取四个手柄的屏幕坐标，以及页面里图片的显示矩形（用于把源图坐标换算成屏幕坐标） */
const HANDLES_FLOW = `(() => {
  // 弹窗里还有图标 SVG，按"含 polygon 的覆盖层"精确定位四点视图
  const svg = Array.from(document.querySelectorAll('.ant-modal svg')).find((item) =>
    item.querySelector('polygon'),
  );
  const image = document.querySelector('.ant-modal img');
  if (!svg || !image) {
    return null;
  }
  const imageRect = image.getBoundingClientRect();
  const handles = Array.from(svg.querySelectorAll('g')).map((group) => {
    const rect = group.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  return {
    handles,
    image: {
      x: imageRect.x,
      y: imageRect.y,
      width: imageRect.width,
      height: imageRect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    },
  };
})()`;

const rectOf = (selector) =>
  `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const pad = 18;
    return {
      x: rect.x + window.scrollX - pad,
      y: rect.y + window.scrollY - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
  })()`;

/**
 * 把裁剪框收紧到卡片外接矩形（等价于用户在裁剪编辑器里放大 + 拖动贴合卡片）。
 * 这正是用户描述的场景：裁切已经很精准，但卡片是梯形，四角仍会带进桌面背景。
 */
const SET_CROP_FLOW = (area) =>
  `(() => {
    const store = window.__idCardStore;
    if (!store) {
      return false;
    }
    store.getState().patchFace('front', { croppedAreaPixels: ${JSON.stringify(area)} });
    return true;
  })()`;

const capture = async (client, clip, file, scale) => {
  const shot = await client.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...clip, scale },
  });
  writeFileSync(join(SCREENSHOT_DIR, file), Buffer.from(shot.data, 'base64'));
};

const main = async () => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const { chrome, client } = await launchChrome({ port: PORT, windowSize: '1440,1500' });
  const failures = [];
  const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) {
      failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    }
  };

  try {
    await client.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    const photo = await client.evaluate(PHOTO_FLOW);
    console.log(
      `合成斜拍照片：卡片四角 ${JSON.stringify(photo.quad.map((p) => [Math.round(p.x), Math.round(p.y)]))}`,
    );

    const a4Rect = await client.evaluate(rectOf('canvas[width="520"]'));
    await capture(client, a4Rect, '01-crop-before.png', 2);

    const before = await client.evaluate(MEASURE_FLOW);
    console.log(`矩形裁剪阶段：桌面色像素 ${before.desk}，有内容像素 ${before.colored}`);
    check(
      '矩形裁剪确实混入了桌面背景（复现用户反馈的问题）',
      before.desk > 200,
      `实际 ${before.desk}`,
    );

    // 把裁剪框收紧到卡片外接矩形，得到"裁切精准但仍有背景"的典型现场
    const xs = photo.quad.map((point) => point.x);
    const ys = photo.quad.map((point) => point.y);
    const aspect = 88 / 56;
    const boxWidth = Math.max(...xs) - Math.min(...xs);
    const boxHeight = Math.max(...ys) - Math.min(...ys);
    const cropWidth = Math.max(boxWidth, boxHeight * aspect);
    const cropHeight = cropWidth / aspect;
    const tightCrop = {
      x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2 - cropWidth / 2),
      y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2 - cropHeight / 2),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    };
    await client.evaluate(SET_CROP_FLOW(tightCrop));
    await sleep(1200);
    await capture(client, a4Rect, '01b-crop-tight-before.png', 2);
    const tight = await client.evaluate(MEASURE_FLOW);
    console.log(`贴合裁剪后：桌面色像素 ${tight.desk}，有内容像素 ${tight.colored}`);
    check('裁切收得很准，四角仍带进背景', tight.desk > 50, `实际 ${tight.desk}`);

    await client.evaluate(CLICK_BUTTON_FLOW('调整裁剪'));
    await sleep(1200);
    await client.evaluate(SWITCH_MODE_FLOW);
    await sleep(800);

    // 分多轮把四个角点推向卡片四角，避免中途被凸性约束挡住
    for (const fraction of [0.35, 0.7, 0.9, 1]) {
      const view = await client.evaluate(HANDLES_FLOW);
      if (!view) {
        throw new Error('未找到四点定位视图');
      }
      const { image } = view;
      const scale = Math.min(image.width / image.naturalWidth, image.height / image.naturalHeight);
      const originX = image.x + (image.width - image.naturalWidth * scale) / 2;
      const originY = image.y + (image.height - image.naturalHeight * scale) / 2;
      for (let index = 0; index < 4; index += 1) {
        const handle = view.handles[index];
        const target = {
          x: originX + photo.quad[index].x * scale,
          y: originY + photo.quad[index].y * scale,
        };
        await client.dragFromTo(
          handle.x,
          handle.y,
          handle.x + (target.x - handle.x) * fraction,
          handle.y + (target.y - handle.y) * fraction,
          10,
        );
        await sleep(150);
      }
    }

    const editorRect = await client.evaluate(rectOf('.ant-modal-content'));
    await capture(client, editorRect, '02-perspective-editor.png', 1.4);

    const placed = await client.evaluate(MEASURE_FLOW);
    const cornerErrors = placed.quad
      ? placed.quad.map((point, index) =>
          Math.hypot(point[0] - photo.quad[index].x, point[1] - photo.quad[index].y),
        )
      : [Number.POSITIVE_INFINITY];
    const maxError = Math.max(...cornerErrors);
    check('已切到透视矫正模式', placed.rectifyEnabled === true);
    check(
      '四个角点被拖到卡片四角（误差 < 4px）',
      maxError < 4,
      `实际最大误差 ${maxError.toFixed(1)}px`,
    );

    await client.evaluate(CLICK_BUTTON_FLOW('完成'));
    await sleep(1500);
    await capture(client, a4Rect, '03-rectified-after.png', 2);

    const after = await client.evaluate(MEASURE_FLOW);
    console.log(`透视矫正之后：桌面色像素 ${after.desk}，有内容像素 ${after.colored}`);
    check('矫正后 A4 预览里的桌面像素归零', after.desk === 0, `实际 ${after.desk}`);
    check('矫正后卡面内容仍然存在', after.colored > 3000, `实际 ${after.colored}`);

    console.log(`\n对比图已写入 ${SCREENSHOT_DIR}/`);
  } finally {
    chrome.kill();
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} 项断言失败：`);
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }
  console.log('\n✓ 透视矫正浏览器验证通过');
};

await main();
