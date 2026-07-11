/**
 * 一堂课程批量提取脚本
 * 自动遍历 course-links.json，逐个提取课程文档+图片到 Obsidian Vault
 *
 * 用法: node batch-extract.mjs --links <course-links.json> --outdir <vault-dir> [--dry-run] [--start <N>]
 * 依赖: OpenCLI + Tabbit Browser (已连接), extract.mjs (同目录)
 *
 * 对抗性审查 (2026-07-10):
 * ✅ daemon 重启后自动 reload 页面（SPA 数据会清空）
 * ✅ 每个文档用独立临时目录（避免并发冲突）
 * ✅ EBUSY 重试（百度同步盘锁文件）
 * ✅ 已存在的 MD 跳过不覆盖
 * ✅ _raw.md 中间文件不复制到 Vault
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, copyFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// ─── 参数解析 ────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const LINKS_FILE = getArg('--links', 'course-links.json');
const OUTDIR = getArg('--outdir', null);
const DRY_RUN = args.includes('--dry-run');
const START = parseInt(getArg('--start', '0'), 10);

if (!OUTDIR) {
  console.error('用法: node batch-extract.mjs --links <course-links.json> --outdir <vault-dir>');
  process.exit(1);
}

// ─── 配置 ────────────────────────────────────────────────
const PROFILE = process.env.OPENCLI_PROFILE;
const EXTRACT = join(import.meta.dirname || new URL('.', import.meta.url).pathname, 'extract.mjs');
const SPA_WAIT = 8;      // 打开页面后等待秒数
const RELOAD_WAIT = 12;   // reload 后等待秒数
const EBUSY_RETRIES = 3;  // EBUSY 重试次数
const EBUSY_DELAY = 2000; // EBUSY 重试间隔 ms

// ─── 工具函数 ────────────────────────────────────────────
function sleep(s) {
  execSync(`powershell -NoProfile -Command "Start-Sleep -Seconds ${s}"`, { stdio: 'pipe' });
}

function safeCopy(src, dst) {
  for (let i = 0; i <= EBUSY_RETRIES; i++) {
    try {
      copyFileSync(src, dst);
      return true;
    } catch (e) {
      if (e.code === 'EBUSY' && i < EBUSY_RETRIES) {
        execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${EBUSY_DELAY}"`, { stdio: 'pipe' });
      } else {
        throw e;
      }
    }
  }
  return false;
}

// ─── 主流程 ──────────────────────────────────────────────
mkdirSync(join(OUTDIR, 'images'), { recursive: true });

const data = JSON.parse(readFileSync(LINKS_FILE, 'utf8'));
const links = data.allLinks;
console.log(`Total: ${links.length} links, starting from ${START}`);

if (DRY_RUN) {
  links.slice(START).forEach((u, i) => console.log(`  [${START + i}] ${u}`));
  console.log('Dry run complete.');
  process.exit(0);
}

let ok = 0, fail = 0;
const errs = [];

for (let i = START; i < links.length; i++) {
  const url = links[i];
  const tmp = join(OUTDIR, `.._batch_tmp_${i}`);
  console.log(`\n[${i + 1}/${links.length}] ${url.substring(0, 70)}`);

  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  let done = false;
  for (let a = 1; a <= 2; a++) {
    try {
      // 1. 打开页面 + reload（daemon 重启后 SPA 数据会清空，必须 reload）
      execSync(`opencli browser ${PROFILE} open "${url}"`, { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
      sleep(SPA_WAIT);
      execSync(`opencli browser ${PROFILE} eval "location.reload()"`, { encoding: 'utf8', timeout: 15000, stdio: 'pipe' });
      sleep(RELOAD_WAIT);
      console.log(`  Loaded [${a}]`);

      // 2. 运行提取脚本
      const result = execSync(`node "${EXTRACT}" "${tmp}"`, {
        encoding: 'utf8', timeout: 600000, maxBuffer: 50 * 1024 * 1024, stdio: 'pipe'
      });
      const lines = result.split('\n');
      const title = lines.find(l => l.includes('Title:'));
      const dl = lines.find(l => l.includes('Downloaded:'));
      if (title) console.log(`  ${title.trim()}`);
      if (dl) console.log(`  ${dl.trim()}`);

      // 3. 复制到 Vault（跳过 _raw.md，EBUSY 重试）
      for (const f of readdirSync(tmp).filter(f => f.endsWith('.md') && f !== '_raw.md')) {
        const dst = join(OUTDIR, f);
        if (existsSync(dst)) { console.log(`  Skip ${f}`); continue; }
        safeCopy(join(tmp, f), dst);
        console.log(`  MD: ${f}`);
      }
      const imgDir = join(tmp, 'images');
      if (existsSync(imgDir)) {
        let n = 0;
        for (const img of readdirSync(imgDir)) {
          const dst = join(OUTDIR, 'images', img);
          if (!existsSync(dst)) {
            try { safeCopy(join(imgDir, img), dst); n++; }
            catch (e) { if (e.code !== 'EBUSY') throw e; }
          }
        }
        if (n > 0) console.log(`  IMG: ${n}`);
      }

      done = true; ok++; break;
    } catch (e) {
      console.error(`  FAIL ${a}: ${e.message.substring(0, 120)}`);
      if (a === 2) { fail++; errs.push(url); }
    }
  }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Done: ok=${ok} fail=${fail}`);
errs.forEach(e => console.log(`  FAIL: ${e}`));
