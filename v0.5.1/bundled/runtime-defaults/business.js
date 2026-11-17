import fs from 'node:fs';
import path from 'node:path';
import { buildToolAvailabilityContext, canonicalToolParameters } from '../../src/kernel/tools.js';
import {isChatQuiet,resolveQuietCommand} from '../../src/kernel/command-mute-state.js';

export function readPersonaText({ appRoot }) {
  try { return fs.readFileSync(path.join(appRoot, 'assets', 'personas', 'xiaojingyu.txt'), 'utf8').trimEnd(); }
  catch { return ''; }
}

// These policies receive the same live objects as the default kernel. They
// remain independent of startup assembly so an appended implementation can
// replace one policy without reproducing kernel construction or lifecycle.
export function buildToolBundle({ c = {}, cfgFor }, { registry, loader }) {
  const tools = [];
  const excludedTools = [];
  const offered = new Map();
  const ctx = buildToolAvailabilityContext(c, loader);
  for (const def of registry.list()) {
    const availability = registry.availability(def.id, ctx);
    if (!availability.ok) { excludedTools.push({ id: def.id, code: availability.code, reason: availability.reason }); continue; }
    tools.push({
      type: 'function',
      function: { name: def.id, description: def.description ?? '', parameters: canonicalToolParameters(def.modelParams ?? def.params ?? { type: 'object', properties: {} }) },
    });
    offered.set(def.id, def);
  }
  // Registration order still decides conflict winners, guards and execution.
  // Only the model projection is sorted: async registration or reloading one
  // extension must not reshuffle every otherwise unchanged tool in the prefix.
  tools.sort((a, b) => a.function.name < b.function.name ? -1 : a.function.name > b.function.name ? 1 : 0);
  const currentAvailability = name => {
    // Enabling or registering a new tool must not let an old request invoke a
    // schema it was never shown. Replacement definitions need a fresh bundle too.
    if (!offered.has(name)) return { ok: false, reason: '本轮未提供此工具，请重新获取工具列表' };
    if (typeof registry.get === 'function' && registry.get(name) !== offered.get(name)) return { ok: false, reason: '工具已更新或移除，请重新获取工具列表' };
    const latest = typeof cfgFor === 'function' ? cfgFor() : c;
    if (!latest || typeof latest !== 'object') return { ok: false, reason: '当前工具设置不可用' };
    return registry.availability(name, buildToolAvailabilityContext(latest, loader));
  };
  return {
    tools, excludedTools,
    // Replacing finish or the bundle is conservative by default. A custom
    // implementation must explicitly retain this compatibility contract.
    canEndAfterSend() {
      return offered.get('finish')?.allowAfterSendCompletion === true && currentAvailability('finish').ok;
    },
    async invoke(name, args, execCtx) {
      const availability = currentAvailability(name);
      if (!availability.ok) return { ok: false, error: availability.reason };
      // Mark the model boundary explicitly. Direct registry/SDK calls retain
      // literal text semantics; this marker grants no permissions.
      return registry.invoke(name, args, { execCtx:{...execCtx,argumentSource:'model'}, isCurrent: () => currentAvailability(name).ok });
    },
  };
}

export async function forwardLinkedMedia(chatKey, entry, { runtimeState, capability, cfg, send }) {
  const { generation, signal, active } = runtimeState();
  if (!active) return { claimed: false, reason: 'stopped' };
  const quiet=()=>isChatQuiet(cfg().commandMute,chatKey)&&entry?.atMe!==true;
  if(quiet())return {claimed:false,reason:'quiet'};
  const text = String(entry?.text ?? '');
  if (!/https?:\/\/(?:www\.)?(?:bilibili\.com|b23\.tv|douyin\.com|v\.douyin\.com)\//i.test(text)) return { claimed: false };
  const result = await capability.claimAsync('media.download', { chatKey, entry, text, cfg: cfg(), signal });
  const current = runtimeState();
  if (!current.active || generation !== current.generation) return { claimed: Boolean(result), sent: false, reason: 'stopped' };
  if(quiet())return {claimed:Boolean(result),sent:false,reason:'quiet'};
  if (!result) return { claimed: false, reason: 'no-provider' };
  const payload = result.result;
  const segments = Array.isArray(payload) ? payload : payload?.segments;
  if (!Array.isArray(segments) || segments.length === 0) return { claimed: true, sent: false, reason: 'provider-empty' };
  const sent = await send.sendSegments(chatKey, segments, { source: 'media.download', signal });
  return { claimed: true, sent: true, ownerId: result.ownerId, sentCount: sent?.sent?.length ?? 0 };
}

export async function handleProviderEvent({ kind, id, type, event }, { ingest, orchestrator, cfg, config, store, bus, log, capability, selfIdOf, forwardMedia, signal, current = () => true }) {
  const active = () => !signal?.aborted && current();
  if (!active()) return;
  if (type === 'message') {
    const result = await ingest.ingestMessage({ kind, id, event, signal });
    if (result.accepted && active()) {
      const c = cfg();
      const control=resolveQuietCommand({cfg:c,kind,id,event,entry:result.entry,selfId:selfIdOf()});
      if(control){
        // Patch this chat only. Both command messages are archived/read without
        // invoking a model, including when an account is paused or unconfigured.
        config.update({commandMute:{active:{[control.key]:control.until}}});
        store.markEntryRead(result.chatKey,result.entry.id);
        bus?.emit('chat.update',result.chatKey);
        bus?.emit('status',{configUpdated:true,commandMuteUpdated:true,quietChange:{chatKey:result.chatKey,until:control.until}});
        log.info?.(`[kernel] ${result.chatKey} ${control.type==='quiet'?'进入安静状态（仍可被 @ 唤醒）':'结束安静状态'}`);
        return;
      }
      await orchestrator.onIncoming(result.chatKey, result.entry);
      void Promise.resolve().then(() => active() && forwardMedia(result.chatKey, result.entry, { signal, current })).catch((error) => {
        if (active()) log.warn?.(`[media] 链接媒体转发失败：${error?.message ?? error}`);
      });
    }
    return;
  }
  if (type === 'poke') {
    const result = await ingest.ingestPoke(event, { signal });
    if (result.accepted && active()) await orchestrator.onIncoming(result.chatKey, result.entry);
    return;
  }
  if (type === 'recall') {
    const chatKey = `${kind}:${id}`;
    if (event.message_id != null) { store.markRecalled(chatKey, Number(event.message_id)); bus.emit('chat.update', chatKey); }
    return;
  }
  if (type === 'ban' && String(event.user_id) === String(selfIdOf())) {
    const muted = Number(event.duration) > 0;
    const provider = capability.providers('chat.ban-state')[0]?.provider;
    try { provider?.[muted ? 'note-muted' : 'note-unmuted']?.(String(event.group_id), event.duration); } catch { /* 忽略 */ }
    log.info?.(`[kernel] 机器人${muted ? '被禁言' : '被解禁'}（群 ${event.group_id}）`);
  }
}
