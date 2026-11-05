# QQ Agent 0.5 —— 源码留存版 / 部署包

> 本包是 **QQ Agent 0.5** 的完整可运行源码快照。
> **背景**：上游 GitHub 仓库已被作者删除，此份来自本人本机在跑的实例，作为留存与分享用。
> 许可证：MIT（全文见 `LICENSE`，版权人 Kondius；`ui/panels/vendor/` 的 GSAP 文件不在此列，见 LICENSE 例外段）。

---

## 一、与上游原版的差异（共 7 处：4 处修复 + 1 处提示词定制 + 2 处存档合规补充）

| 文件 | 改动 | 为什么 |
|---|---|---|
| `src/kernel/plugin-loader.js`（约第 89-101 行） | 镜像 `plugins/`、`skills/` 的兄弟条目时，**非目录一律跳过**并打一行 warning | 原版对非目录条目也用 `'file'` 型软链接，非提权的 Windows 必然 `EPERM`，而这个位置没有兜底 → **一个散落的 zip/md 文件就会让全部扩展同时装载失败**，报错还是 `symlink EPERM`（极容易被误判成权限问题） |
| `启动本地UI.bat` | 加了 `data\qq-agent.lock` 检测 + 提示去看 `data\boot-diag.log` | 原版双击后如果失败，只会闪一个标题为 `Error` 的框（`start /b` 把输出全丢了），看不出原因 |
| `启动服务器UI.bat` | 加了 Node 检测、`node_modules` 缺失时自动 `npm install`、实例锁检测与退出后的原因提示 | 同上：把"闪退且无提示"改成能看懂的报错 |
| `scripts/shot-ui.mjs` | 修好设置页分区 id 过期导致的必崩（`wake/security/uikit` 分区已不存在），并改为按序探测本机浏览器 | `npm run shot:ui` 是包内公开命令，原版对任何人都会卡 30 秒超时；修法细节见随包《分享包-截图脚本修复说明》 |
| `src/kernel/prompt.js` + `test/14-prompt-test.mjs` | 系统提示词默认路径精简（2770 → 1721 字符，2026-11-05），测试断言同步更新 | **使用者的行为定制，不是修 bug**：缩短系统提示、减少 token 占用。注意这会改变机器人的语气与分条习惯；想要原版行为请还原此文件（上游已删库，本包无原版备份） |

| `LICENSE`（新增文件） | 补入 MIT 许可证全文（版权人 Kondius）+ GSAP vendor 例外声明 | 包内原本只有 `package.json` 的一行 `license` 字段、没有许可证文本；且 GSAP 文件不是 MIT，需要显式划清范围 |
| `README.md`（首屏横幅 + 安装段注） | 文件开头加「存档声明」引用块；「安装与连接」段前加一条存档者注（上游 clone 地址已失效、本仓库根即项目本身，附正确装法），其余正文原样保留 | 公开存档需要一眼看清「这不是原作者的仓库」；上游安装指引会误导下载者 |

除上述 7 处外，`src/`、`bundled/`、`ui/` 其余部分与上游一致。

## 二、刻意没有打包的东西

| 未包含 | 原因 |
|---|---|
| `data/` | 我的实例数据：配置（含 API Key）、聊天记录、记忆库、会话存档、日志。首次启动会自动生成 |
| `node_modules/` | 373MB，用 `npm install` 生成 |
| `data-plugin-runtime/` | 热重载临时快照，每次启动自动重建 |
| `plugins/`、`skills/` 里的内容 | 我自己写的 5 个插件 + 5 个技能，与框架无关 |
| `overrides/` | 我做的一层组合定制（戳一戳不唤醒）。所以你拿到的**是原版行为**：被戳会正常唤醒模型 |
| `website/` | 上游的官网镜像（18MB），跑机器人用不到 |
| `progress.md` / `findings.md` / `task_plan.md` | 上游开发过程中的草稿笔记 |

`plugins/` 和 `skills/` 保留为空目录——这正是上游"出厂空"的设计。

## 三、部署步骤

**前置**：Node.js ≥ 20（`node -v` 确认）

1. 解压到任意目录（路径别带特殊符号）
2. 在该目录执行 `npm install`（会拉 `ws`、`js-yaml`；`electron` 是可选桌面壳，不装也不影响服务器模式）
3. 准备 OneBot v11 协议端（本项目用的是 **SnowLuma**，其他 OneBot v11 实现理论上可换）
   - 默认连 `ws://127.0.0.1:3001`、HTTP `http://127.0.0.1:3000`（可在设置里改）
   - 协议端先登录好 QQ，再启动宿主
4. 双击 **`启动服务器UI.bat`**（等价 `node src/server.js`）
5. 浏览器打开 <http://127.0.0.1:3210>

## 四、首次要配的东西

1. **设置 → 模型 API**：填 Base URL / API Key / 模型 id（任何 OpenAI 兼容渠道都行）
2. **设置 → 人设/角色设定**：粘贴角色卡（出厂有一份 `assets/personas/xiaojingyu.txt` 可参考）
3. **设置 → 活动设置 → 群/私聊白名单**：不填默认不放行
4. 需要桌面窗口时用 `启动本地UI.bat`，但**别和服务器版同时开**（见下）

## 五、几个一定会踩的坑

- **桌面版和服务器版只能开一个**：两者共用 `data/`，而一个数据目录只允许一个宿主实例。同开时桌面版会报"已有实例正在运行"（表现为一个 `Error` 弹窗），原因看 `data\boot-diag.log`。桌面版其实就是内嵌浏览器打开同一个控制台，功能与网页版等价。
- **`data/` 里存着你的 API Key**：`data/config.json` 是明文。分享截图、备份、传群之前记得排除。
- **扩展怎么装**：插件放 `plugins/<id>/`，技能放 `skills/<id>/`，各自需要一个清单（`plugin.json` / `skill.json`）。**目录下只能放目录**——散落的文件虽然本版不会崩，但每次加载会打一条 warning。
- **扩展改代码会让授权失效**：任何扩展代码改动都会改变指纹，需要在控制台重新授权。
- **国外服务要代理**：宿主自带的 `ctx.http.fetch` **不读系统代理**，扩展要自己用 undici ProxyAgent。

## 六、这个包的验证状态（2026-11-06 复跑）

| 项 | 结果 |
|---|---|
| 隐私审计 `node scripts/audit-privacy.mjs` | 扫描 693 文件，**0 findings** |
| M4 桌面/扩展生命周期套件 | **8/8 文件通过** |
| M3 控制台/运行时套件 | 242 项用例 **211 通过 / 31 失败**（需先 `npx playwright install chromium`，否则失败数会涨到 111） |
| headless 冒烟 `npm run smoke` | **12/12 通过**（起服务 / 接口 / 单实例锁 / 清理链） |

**关于那 31 个失败**，抽样核对后绝大多数是**设置页/控制台 UI 的规格与视觉断言**，属于上游未完成的前端规格项，不影响机器人运行：

- `settings: 存在写死色值 #0006（应使用 var(--*)）` —— 硬编码颜色，违反项目自己的设计令牌规范
- `models 至少 4 个字段组（实际 3）`、`settings 里某些控件缺失` —— 设置页字段没补全
- `a real config POST must refresh settings once (实际 2)` —— 重复刷新
- `dark: actual button uses the selected accent` —— 暗色主题强调色没生效
- `卸载使用四次点击确认 (实际 false)` —— 卸载确认流程与规格不符
- 少数用例是计数不符（`actual: 48, expected: 46`），像是工作副本比上游测试常量多 2 项

另有明确属**设计内降级**的一条：`87-kernel-pluginization` 断言 `collect_sticker` 存在，但该工具在协议端不支持 `qq.emoji-favorites` 时会被宿主主动摘除（上游代码注释里写明了这个降级路径）。

> 说明：上游仓库已删除，**无法与"出厂基线"对比**，因此无法 100% 断定这 31 项是否为原版既有。但从代码位置看，它们集中在 `ui/`、设置页与测试常量，与"能否跑起来"无关。

## 七、目录速览

```
src/        内核（kernel / console / transports）
bundled/    出厂扩展（含 transport-onebot、compat-04 兼容垫片）
ui/         控制台前端资源
electron/   桌面壳
docs/       扩展开发文档（做扩展先读 extension-authoring.md）
test/       回归测试
examples/   扩展示例
build/      Windows 安装包脚本（electron-builder）
plugins/    用户插件（空）
skills/     用户技能（空）
```
