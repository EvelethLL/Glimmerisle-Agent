import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// 覆盖清单、源码和 UI 资产；不是代码沙箱，外部依赖仍必须可信。
export function pluginFingerprint(dir, { excludeEntry = null, dependenciesOnly = false, identityRoot = null } = {}) {
  const root = fs.realpathSync(dir);
  const records = [];
  let count = 0, bytes = 0, directories = 0;
  function visit(relative, depth = 0) {
    if (depth > 32 || ++directories > 1024) throw new Error('插件目录嵌套或数量超过授权扫描限额');
    const current = path.join(root, relative);
    for (const name of fs.readdirSync(current).sort()) {
      const rel = path.join(relative, name);
      const file = path.join(root, rel);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('授权指纹不接受插件内符号链接');
      if (stat.isDirectory()) visit(rel, depth + 1);
      else if (stat.isFile()) {
        if (++count > 1024 || (bytes += stat.size) > 32 * 1024 * 1024) throw new Error('插件超过授权扫描限额（1024 文件 / 32MB）');
        if (file === excludeEntry || (dependenciesOnly && ['skill.json', 'plugin.json'].includes(rel.split(path.sep).join('/')))) continue;
        // 先摘要内容，再结构化编码路径/长度/摘要。二进制中的分隔符无法伪造下一条记录。
        const content = fs.readFileSync(file);
        records.push([rel.split(path.sep).join('/'), content.length, crypto.createHash('sha256').update(content).digest('hex')]);
      } else throw new Error('插件包含非普通文件');
    }
  }
  visit('');
  return crypto.createHash('sha256').update(JSON.stringify({ version: 2, root: identityRoot ?? root, records })).digest('hex');
}

