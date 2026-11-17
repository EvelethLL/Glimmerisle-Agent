// 视觉验收截图：真实内核 + 真实 Chromium，截外壳与设置页各分区。
// 用法：node scripts/shot-ui.mjs（浏览器自动探测；也可用 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指定）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, '.shots');
fs.mkdirSync(outDir, { recursive: true });

let playwright = null;
for (const name of ['playwright', 'playwright-core']) {
  try { playwright = createRequire(import.meta.url)(name); break; } catch { /* 探测本机模块 */ }
}
if (!playwright) { console.log('! 无 Playwright'); process.exit(1); }

// 依次尝试：环境变量 → ms-playwright 里最新装的 chromium（不写死 revision）→ 本机 Chrome → 本机 Edge → 交给 Playwright 默认解析
function resolveChromium() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv) return { executablePath: fromEnv, label: '环境变量 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH' };
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (fs.existsSync(cache)) {
    const rev = (name) => Number(name.slice(name.lastIndexOf('-') + 1)) || 0;
    const names = fs.readdirSync(cache);
    const candidates = [
      ...names.filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => rev(b) - rev(a))
        .map((n) => path.join(cache, n, 'chrome-win64', 'chrome.exe')),
      ...names.filter((n) => /^chromium_headless_shell-\d+$/.test(n)).sort((a, b) => rev(b) - rev(a))
        .map((n) => path.join(cache, n, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')),
    ];
    const hit = candidates.find((p) => fs.existsSync(p));
    if (hit) return { executablePath: hit, label: 'ms-playwright' };
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const systemBrowser = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => fs.existsSync(p));
  if (systemBrowser) return { executablePath: systemBrowser, label: '本机浏览器' };
  return { executablePath: undefined, label: 'Playwright 默认解析' };
}

const shotDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-shot-'));
const kernel = createKernel({ env: { ...process.env, QQ_AGENT_DATA_DIR: shotDataDir, QQ_AGENT_PORT: '0' }, headless: true });
kernel.config.update({
  server: { port: 0, token: 'shot-token' },
  // 截图只看界面：把 OneBot 指到没人监听的端口，免得碰到正在跑的协议端（会刷「401 令牌不匹配」）
  onebot: { wsUrl: 'ws://127.0.0.1:3999', httpUrl: 'http://127.0.0.1:3998' },
});
const port = await kernel.start();
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  const target = resolveChromium();
  console.log(`  浏览器：${target.label}${target.executablePath ? ` → ${target.executablePath}` : ''}`);
  browser = await playwright.chromium.launch({ headless: true, ...(target.executablePath ? { executablePath: target.executablePath } : {}) });
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 940 }, deviceScaleFactor: 1 })).newPage();
  const shoot = async (name) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); console.log(`  ${name}.png`); };

  await page.goto(`${base}/?token=shot-token`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#nav button').length >= 8, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shoot('01-shell');

  await page.locator('#nav button[data-panel="settings"]').click();
  await page.waitForFunction(() => document.querySelector('#panel-host iframe')?.src.includes('/panels/settings/'), null, { timeout: 15000 });
  await page.waitForTimeout(3500);
  await shoot('02-settings-models');

  const frame = page.frameLocator('#panel-host iframe');
  // 设置分区靠 data-target 定位；分区改名/删掉时只提示跳过，不再干等 30 秒超时
  const pick = async (sid, name) => {
    const link = frame.locator(`#settings-sidebar a[data-target="${sid}"]`);
    if (await link.count() === 0) { console.warn(`  ! 没有「${sid}」分区，跳过 ${name}`); return false; }
    await link.first().evaluate((a) => { a.click(); return true; });
    await page.waitForTimeout(420);
    await shoot(name);
    return true;
  };
  await pick('chat', '03-settings-chat');        // 原 wake/security，现并入「聊天设置」
  await pick('access', '04-settings-access');
  await pick('memory', '05-settings-memory');

  // 筛选态
  await frame.locator('#settings-filter').fill('表情');
  await page.waitForTimeout(420);
  await shoot('06-settings-filter');
  await frame.locator('#settings-filter').fill('');
  await page.waitForTimeout(300);
  await pick('desktop', '07-settings-desktop');  // 原 uikit

  const openPanel = async (id, name) => {
    const button = page.locator(`#nav button[data-panel="${id}"]`);
    if (await button.count() === 0) { console.warn(`  ! 没有「${id}」面板，跳过 ${name}`); return false; }
    await button.first().click();
    await page.waitForTimeout(3000);
    await shoot(name);
    return true;
  };
  await openPanel('skills', '08-skills');
  await openPanel('plugins', '09-plugins');
  await openPanel('usage', '10-usage');
  await openPanel('community', '11-community');

  console.log(`\n✓ 截图输出到 ${outDir}`);
} catch (error) {
  console.error(`\n✗ 截图失败：${String(error?.message ?? error).split('\n')[0]}`);
  if (/Executable doesn't exist|browserType\.launch/i.test(String(error?.message ?? ''))) {
    console.error('  本机没有可用的 Chromium：装一个 `npx playwright install chromium`（约 150MB），或把 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指到现成的 chrome.exe/msedge.exe');
  }
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await kernel.stop().catch(() => {});
  // 临时数据目录是本次 mkdtemp 建的一次性目录，收尾删掉（Windows 可能还占句柄，失败就算了）
  try { fs.rmSync(shotDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
