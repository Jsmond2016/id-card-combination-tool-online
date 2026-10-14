/** 共享的 CDP 客户端：启动本地 Chrome 并建立一个最小的 DevTools 协议通道。 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.events = [];
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
        return;
      }
      if (message.method) {
        this.events.push(message);
      }
    };
  }

  static async connect(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('CDP 连接失败'));
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    this.sequence += 1;
    const id = this.sequence;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 30000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? '页面脚本执行失败');
    }
    return result.result.value;
  }

  /** 用真实输入事件点击坐标，确保 React 与第三方库的事件处理都能收到 */
  async clickAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  async dragFromTo(fromX, fromY, toX, toY, steps = 8) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fromX, y: fromY });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: fromX,
      y: fromY,
      button: 'left',
      clickCount: 1,
    });
    for (let step = 1; step <= steps; step += 1) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: fromX + ((toX - fromX) * step) / steps,
        y: fromY + ((toY - fromY) * step) / steps,
        button: 'left',
      });
      await sleep(30);
    }
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: toX,
      y: toY,
      button: 'left',
      clickCount: 1,
    });
  }
}

const waitForPageTarget = async (port) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      // 调试端口尚未就绪，继续重试
    }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
};

export async function launchChrome({
  port = 9333,
  chromePath = process.env.CHROME_PATH ?? DEFAULT_CHROME_PATH,
  windowSize = '1440,1400',
} = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'idcard-chrome-'));
  const downloadDir = mkdtempSync(join(tmpdir(), 'idcard-download-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${windowSize}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const client = await CdpClient.connect(await waitForPageTarget(port));
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Log.enable');
  await client.send('Network.enable');
  return { chrome, client, downloadDir, userDataDir };
}
