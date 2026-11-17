import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const failure = (code, message) => Object.assign(Error(`[${code}] ${message}`), {code});
const clone = value => value === undefined ? undefined : structuredClone(value);

// These are per-generation surrogate methods, NEVER the live client's class.
// Old prototype wrappers run against a message copy and have no send/connection
// handle. Only the image display flag is accepted back by the transport.
export function createLegacyOneBotClient(host) {
  class OneBotClient {
    constructor() { if (!host.transforming) throw failure('COMPAT04_CLIENT_CONSTRUCTION', '旧客户端仅用于兼容消息样式，不能创建另一条 QQ 连接'); }
    sendSegments(_kind, _id, segments) { return segments; }
    sendSticker(kind, id, _image, _options) { return this.sendSegments(kind, id, clone(host.segments)); }
  }
  host.use('src/onebot.js');
  host.clientClass = OneBotClient;
  host.registerClient();
  return OneBotClient;
}

function thinkingProvider(provider) {
  if (!provider || typeof provider.detect !== 'function' || typeof provider.build !== 'function' || typeof provider.strip !== 'function') throw failure('COMPAT04_THINKING_PROVIDER_MISSING', '旧思考接口需要一个已启用的 llm.dialect 提供者');
  return provider;
}
export function resolveThinkingRequest(api = {}, context = {}, provider) {
  let effort = String(api.thinkingEffort ?? '').toLowerCase();
  if (!['off', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) effort = api.thinkingMode === 'off' ? 'off' : api.thinkingMode === 'on' ? 'high' : '';
  if (context.thinkingMode === 'off') effort = 'off';
  const dialect = thinkingProvider(provider).detect(api.baseUrl ?? '', api.model ?? '');
  return {dialect, effort, on: Boolean(effort) && effort !== 'off', budget: Math.max(0, Number(api.thinkingBudget) || 0)};
}
export function buildThinkingParams({effort = '', ...options} = {}, provider) {
  const mode = effort === 'off' ? 'off' : effort ? 'on' : 'default';
  const result = thinkingProvider(provider).build({...options, effort, mode, on: mode === 'on'});
  return {...result, applied: Object.keys(result.params ?? {}).length > 0};
}
export function stripThinkingParams(body, provider) { return thinkingProvider(provider).strip(body); }

// Read old plugin-private state once; existing new state always wins. Do not
// copy config.json, account records or another plugin's directory.
function seedState(source, target) {
  let budget = 64 * 1024 * 1024;
  function copy(from, to) {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw failure('COMPAT04_DATA_LINK', '旧插件资料包含链接或特殊文件，未自动复制');
    if (fs.existsSync(to) && fs.lstatSync(to).isSymbolicLink()) throw failure('COMPAT04_DATA_LINK', '插件资料目标包含链接，未自动复制');
    if (stat.isDirectory()) {
      fs.mkdirSync(to, {recursive: true});
      for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
    } else if (!fs.existsSync(to)) {
      if ((budget -= stat.size) < 0) throw failure('COMPAT04_DATA_BUDGET', '旧插件资料超过自动复制上限，原资料已保留');
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    }
  }
  if (fs.existsSync(source)) copy(source, target);
}

export function createHostModuleAdapter({ctx, manifest, onUse = () => {}, apiLimits = () => ({}), isCurrent = () => true, dialect = () => null, registerTransform}) {
  const helpers = JSON.stringify(import.meta.url);
  let runtime;
  let directoryReady = false;
  function privateDirectory() {
    const accountData = path.resolve(ctx.storage.dir, '../..');
    const dataDir = path.join(ctx.storage.dir, 'legacy-host');
    if (!directoryReady) {
      // Refuse traversal through an existing junction, including namespace parents.
      for (let current = dataDir; ; current = path.dirname(current)) {
        if (fs.existsSync(current) && (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink())) throw failure('COMPAT04_DATA_LINK', '插件资料目录包含链接或不是文件夹');
        if (path.dirname(current) === current) break;
      }
      fs.mkdirSync(dataDir, {recursive: true});
      const marker = path.join(dataDir, '.legacy-seeded-v1');
      if (!fs.existsSync(marker)) {
        const stateNames = new Set([manifest.id, ...(manifest.id === 'life-memory' ? ['life-events'] : [])]);
        for (const name of stateNames) seedState(path.join(accountData, name), path.join(dataDir, name));
        fs.writeFileSync(marker, '1\n', {flag: 'wx'});
      }
      directoryReady = true;
    }
    return dataDir;
  }
  const use = feature => { onUse(feature); return runtime; };
  const requireOwn = id => {
    if (id !== manifest.id) throw failure('COMPAT04_OTHER_CONFIG', '旧插件不能通过配置模块读取或修改其它扩展的设置');
    return ctx.config.all();
  };
  return {
    // Old disk patches must never reach the live UI or Electron boot code via
    // the import generation's convenience junctions.
    detachedRoots: ['ui', 'electron'],
    files: {
      '.compat-04/host.js': 'let value; export function bind(runtime){if(value)throw Error("兼容模块重复绑定");value=runtime;} export function host(){if(!value)throw Error("兼容模块尚未绑定");return value;}',
      'src/config.js': `import {host} from '../.compat-04/host.js';
export const DATA_DIR=host().use('src/config.js').dataDir;
export const ROOT=host().root;
export function getConfig(){return host().getConfig();}
export function updateConfig(){throw Error('[COMPAT04_GLOBAL_WRITE] 旧插件不能直接修改宿主全局配置，请使用 SDK 配置接口');}
export function setRuntimeConfig(){return updateConfig();}
export function loadConfig(){return getConfig();}`,
      'src/skills/config.js': `import {host} from '../../.compat-04/host.js';
host().use('src/skills/config.js');
export function getSkillConfig(id,defaults={}){return {...defaults,...host().ownConfig(id)};}
export function isSkillEnabledInConfig(id){host().ownConfig(id);return host().enabled();}
export function listConfiguredSkillIds(){return [host().id];}
export function setSkillConfig(){throw Error('[COMPAT04_CONFIG_WRITE] 旧插件不能直接写配置，请使用 SDK 配置接口');}
export function setSkillEnabled(){return setSkillConfig();}`,
      'src/onebot.js': `import {host} from '../.compat-04/host.js'; import {createLegacyOneBotClient} from ${helpers}; export const OneBotClient=createLegacyOneBotClient(host());`,
      'src/thinking.js': `import {host} from '../.compat-04/host.js'; import * as implementation from ${helpers};
host().use('src/thinking.js');
export function resolveThinkingRequest(api,context){return implementation.resolveThinkingRequest(api,context,host().dialect());}
export function buildThinkingParams(options){return implementation.buildThinkingParams(options,host().dialect());}
export function stripThinkingParams(body){return implementation.stripThinkingParams(body,host().dialect());}`,
    },
    async bind(mirror) {
      runtime = {id: manifest.id, root: mirror, isCurrent, dialect, get dataDir() { return privateDirectory(); }, use, ownConfig: requireOwn,
        registerClient: () => registerTransform(runtime),
        enabled: () => ctx.config.all().enabled !== false,
        getConfig: () => ({api: clone(apiLimits()), skills: {[manifest.id]: {enabled: runtime.enabled(), settings: clone(requireOwn(manifest.id))}}}),
      };
      const control = await import(pathToFileURL(path.join(mirror, '.compat-04/host.js')).href);
      control.bind(runtime);
    },
    verify(mirror) {
      for (const directory of this.detachedRoots) if (fs.readdirSync(path.join(mirror, directory)).length) {
        throw failure('COMPAT04_HOST_PATCH_UNSUPPORTED', '旧插件尝试直接修改宿主界面或启动代码；当前仅改到了隔离副本，未应用到程序。需要作者改用 SDK 扩展接口');
      }
      for (const [name, source] of Object.entries(this.files)) if (fs.readFileSync(path.join(mirror, name), 'utf8') !== source) {
        throw failure('COMPAT04_HOST_PATCH_UNSUPPORTED', '旧插件尝试改写宿主兼容模块，修改未应用到程序');
      }
    },
  };
}

export function transformLegacySticker(runtime, {kind, id, segments}) {
  const Client = runtime.clientClass;
  if (!Client) return clone(segments);
  runtime.transforming = true; runtime.segments = segments;
  try {
    const result = new Client().sendSticker(kind, id, segments.find(s => s.type === 'image')?.data?.file, {});
    // Async wrappers, new segments, destinations and arbitrary content changes
    // are outside this adapter. Fail clearly instead of sending another payload.
    if (!Array.isArray(result) || result.length !== segments.length) {
      if (result instanceof Promise) result.catch(() => {});
      throw failure('COMPAT04_MESSAGE_PATCH', '旧发送补丁改变了消息结构，不能安全兼容');
    }
    return result.map((segment, index) => {
      const original = segments[index], allowed = clone(original);
      if (original.type === 'image' && segment?.data?.sub_type !== undefined && original.data.sub_type == null) {
        const value = segment.data.sub_type;
        if (!Number.isInteger(value) || value < 0 || value > 1) throw failure('COMPAT04_MESSAGE_PATCH', '旧发送补丁给出了无效的表情类型');
        allowed.data.sub_type = value;
      }
      if (JSON.stringify(allowed) !== JSON.stringify(segment)) throw failure('COMPAT04_MESSAGE_PATCH', '旧发送补丁尝试改变消息内容，已拒绝');
      return allowed;
    });
  } finally { runtime.transforming = false; runtime.segments = null; }
}
