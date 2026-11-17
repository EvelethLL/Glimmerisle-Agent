# Glimmerisle Agent 0.5.1 —— 源码收录与改动记录

> **收录日期**：2026-11-17
> **来源**：官方安装版 `QQ-Agent-0.5.1-Setup-x64.exe` 解包后的 `resources/app/`（**未含 `node_modules`**），Electron 45.3.2、`asar: false`（源码明文）
> **许可证**：MIT（版权人 Kondius），GSAP 例外同根目录 `LICENSE`

---

## 一、怎么用

- `v0.5.1/` 就是安装版 `resources/app` 的内容：`src/`（内核）、`ui/`（控制台）、`bundled/`（内置插件与技能）、`docs/`、`scripts/`、`electron/`
- 装依赖：`cd v0.5.1 && npm install`；启动：`npm run desktop`（有桌面）或 `npm run server`（无头，控制台在 `http://127.0.0.1:3210`）
- 需要**外置 OneBot v11 协议端**（SnowLuma / NapCat 之类），本仓库不含协议端
- 数据目录：源码跑用 `appRoot/data`；官方安装版用 `data-v05/`（两边不通用，迁移要拷 `data-v05/plugins` 与 `config.skills`）

## 二、0.5.1 相对 0.5.0 的变化（作者侧）

| 类别 | 内容 |
|---|---|
| 规模 | 内核 53 → 71 个文件（**+18 个新模块**）、**24 个文件实质改动**；内置扩展 9 个新增 + 20 个改写；控制台 **+约 40 个 API** |
| 产品化外壳 | 安装器（强制空目录 + 旧版迁移）、自动更新 + 回滚、托盘 / 关窗到托盘 / 开机自启、多账号（每账号独立 worker）、从 `protocols/` 拉起协议端 |
| 新功能面 | 社区 feed、扩展市场（基于 GitHub Release 的在线更新）、可视化群管理规则（节点图，`src/management/` 17 文件）、MCP 桥、`ctx.registerCommand`、`ctx.storage.protect`（DPAPI）、外观点选编辑 |
| 架构与成本 | **「启用即授权」**（启用即放行清单内全部 scope，`allow/deny/ask` 覆盖被短路）、流式输出（`llm-stream.js`）、记忆与表情拆「稳定前缀 + 新增后缀」（`prompt-context-prefix.js`，保缓存）、`reply-completion.js` |
| 治「静默失败」 | `extension-load-diagnostics.js`（错误码 + 中文解释）、`send-failure.js`（只带 `{category,status}`）、`/api/status` 直接返回 `errorCode` + `diagnosis` |

## 三、本存档对 0.5.1 的改动（存档者侧）

只改了**内核两处 + 显示层文案 + 品牌资源**，没有动业务逻辑：

| 文件 | 改动 | 为什么 |
|---|---|---|
| `v0.5.1/src/kernel/prompt.js` | 每个规则段自己收 `privateChat`（私聊称「对方」、群聊称「群友」），删掉成文 `replaceAll('群友','对方')`；【群聊不是客服队列】【不要当群管家】私聊不加载；首句只声明场景、**不写名字** | 原来是「先按群聊写、再全文替换成对方」，私聊里会漏出「群友」与群聊专属规则；名字写死在首句又会和角色卡打架 |
| `v0.5.1/src/kernel/config.js` | 新增 `export const DEFAULT_BOT_NAME = '这边'`，`prompt.js` 复用 | `botName` 只剩三个用途：设置页显示、`{botName}` 占位符、`isAtMe` 的 @ 兜底。**不能用「我」**——`wake.js` 是子串匹配 `@名字`，「你@我干嘛」会误触唤醒 |
| `v0.5.1/package.json` | `name` → `glimmerisle-agent` | 去 QQ 化的品牌改名（同上：安装目录、exe 名、窗口标题、安装记录文件名） |
| `v0.5.1/ui/shell/*`、`ui/panels/{settings,rules,community}/*`、`electron/main.js` | 约 20 处显示文案改为 Glimmerisle / 微光星屿；品牌行字号 20 → **17px**（`≤900px` 断点 15px） | `GLIMMERISLE` 比 `QQ AGENT` 长，20px 下会被 `nowrap + overflow:hidden` 裁掉 |
| 图标（不在本仓库） | 照 `assets/banner.png` **重画**双星而非裁切（流星尾巴与光晕亮度重叠，分不开）；7 档 16~256px 打进 `glimmerisle.ico`，16/24px 只画一颗星 | 换名后沿用它原来的星形徽记 |

> 想要原版 0.5.1 的行为，把 `prompt.js` / `config.js` 换回安装包里的原始文件即可；其余 UI 文案改动不影响运行。

## 四、未收录

- `data-v05/`（会话、记忆、账本、**配置里有 API Key**）
- `extensions/{plugins,skills}/` 下的自研扩展（个人向，含 QQ 号与角色设定）
- `resources/app/overrides/`（个人覆盖层 `30-no-poke-wake`）
- `node_modules/`、日志、各类 cache

## 五、已知问题（截至 2026-11-17）

1. **仍有指向原作者服务器的外联**：`kondius.cn/qq-agent/` 四处——`model-prices.json`（价格表）、`version.json`（版本检查）、社区面板 `comments/` + `holyshits`、技能/插件市场。改名后请求仍打这个域名；本机当前 **DNS 解析不到该域名**，所以日志里会周期性出现 `getaddrinfo ENOTFOUND kondius.cn`。
2. **遥测默认开启**：`telemetry` 内置扩展 `enabledByDefault: true`，首 90 秒后每 6 小时 POST 一次，载荷 = 安装 ID + 版本 + 调用次数 + token 数 + **工具名→次数表**（**自建扩展的 tool id 也在里面**）；不含消息正文 / URL / 密钥。要关：`config.skills.telemetry.enabled = false`。
3. **安装包未签名**：无 Authenticode，SmartScreen 会报未知发布者；自动更新只信 `kondius.cn` 的 Ed25519 签名清单 + 每包 sha256（单点）。
4. **`asar: false` + 无沙箱**：任何扩展等同本机 Node 权限，`mcp-bridge` 自带 `proc.exec`。
5. **`extension-dev test` 在 0.5.1 有回归**：`setOverride()` 对「启用即授权」的扩展返回 false → 任何声明了权限的扩展跑 `test` 必报「无法设置测试权限」而全部 FAIL。**`check` 仍可信，别据此判定扩展坏了。**
6. **`/api/prompt-preview` 不可信**：对动态 `promptSections` 漏返回，且不接受 `chatKey`（body 被当 config patch，永远渲染群聊版）。验证提示词要看 `sessions/*.json` 里的 `systemPrompt`。
7. **`store.historyCount` 与界面「上下文滑条」脱钩**：滑条只改压缩档位（`contextSliderPos` → `contextTier` / `randomPercent`），直改 `historyCount` 不等于改滑条。

## 六、自研扩展里的三处修复（不在本仓库）

这三处属于 `extensions/` 下的个人扩展，没有随源码收录，记在这里备查：

1. **guardian 备份**：`backupTargets` 默认串是 0.5.0 的 `data/plugins/*/kv.json,data/config.json`，而解析基准是 `<root>` → 0.5.1 数据在 `data-v05/` 时通配符空转、`config.json` 报 ENOENT，**零备份跑了几十小时**。修法：先剥 `data/` 前缀再以 `dataDir` 为基准。
2. **memory-book 日记**：补写只挂「进程启动 +45s」，机器睡眠不算启动 → 跨 23:30 睡过去就永久漏天。补了 30 分钟一次的看门狗，只补昨天那篇。
3. **voice-note 链路顺序**：原顺序「代理 ×2 → 直连」，而本机代理经常整段挂掉（连 example.com 都 reset），白等 10 秒；改成「直连 → 代理 → 直连」。
