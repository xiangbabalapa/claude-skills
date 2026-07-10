/**
 * SPA Course Document Extractor
 * 从一堂(yitang.top)等 Vue SPA 课程平台提取完整文档内容
 *
 * 用法: node extract.mjs <output-path>
 * 依赖: OpenCLI + Tabbit Browser (已连接)
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';

// ─── 配置 ───────────────────────────────────────────────
const PROFILE = process.env.OPENCLI_PROFILE || 'qdawfq6t';
const CDN_BASE = 'https://cdn.yitang.top/localfile/prod/';

// ─── 提取脚本 (在浏览器中执行) ──────────────────────────
// 对抗性审查:
// ✅ DFS 顺序匹配页面视觉顺序
// ✅ 处理所有已知块类型 (2/3/4/12/13/22/24/25/27/31/32/34)
// ✅ 图片 URL 从 blockAttr.cdnUrl 获取 (非 blockAttr.image.cdnUrl)
// ✅ 空文本块已过滤
// ✅ grid(24) 和 table(31) 的嵌套 children 已递归处理
const EXTRACT_FN = `async () => {
  function getBlockContent(b) {
    var lines = [];
    var attr = b.blockAttr;
    var keys = ["page","heading1","heading2","heading3","heading4","heading5",
                "text","ordered","bullet","quote","todo","callout"];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = attr[key];
      if (val && val.elements && val.elements.length) {
        var parts = [];
        for (var j = 0; j < val.elements.length; j++) {
          var el = val.elements[j];
          if (el.text_run && el.text_run.content) parts.push(el.text_run.content);
        }
        var txt = parts.join("");
        if (txt.trim()) {
          var prefix = "";
          if (key === "heading1") prefix = "## ";
          else if (key === "heading2") prefix = "### ";
          else if (key === "heading3") prefix = "#### ";
          else if (key === "heading4") prefix = "##### ";
          else if (key === "heading5") prefix = "###### ";
          else if (key === "bullet") prefix = "- ";
          else if (key === "quote") prefix = "> ";
          else if (key === "todo") prefix = "- [ ] ";
          lines.push(prefix + txt);
        }
      }
    }
    if (attr.cdnUrl) lines.push("![](" + attr.cdnUrl + ")");
    // divider
    if (attr.divider) lines.push("---");
    return lines.join("\\n");
  }
  function flattenDFS(blocks) {
    var result = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var content = getBlockContent(b);
      if (content.trim()) result.push(content);
      if (b.childrens && b.childrens.length) {
        result = result.concat(flattenDFS(b.childrens));
      }
    }
    return result;
  }
  var blocks = document.getElementsByClassName("mainContainer")[0].__vue__["$children"][0]._data.dataJson.childrens;
  return flattenDFS(blocks).join("\\n\\n");
}`;

// ─── 工具函数 ────────────────────────────────────────────
function runOpenCli(evalCode) {
  const b64 = Buffer.from(evalCode).toString('base64');
  const wrapper = `eval(atob("${b64}"))`;
  return execSync(`opencli browser ${PROFILE} eval ${JSON.stringify(wrapper)}`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60000,
    env: { ...process.env, OPENCLI_PROFILE: PROFILE }
  });
}

function downloadImage(url, outPath) {
  try {
    execSync(
      `powershell -NoProfile -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${outPath}' -TimeoutSec 15"`,
      { timeout: 20000 }
    );
    return true;
  } catch { return false; }
}

// ─── 主流程 ──────────────────────────────────────────────
async function main() {
  const outputDir = process.argv[2] || './output';
  const imgDir = join(outputDir, 'images');

  // 0. 检查 Vue 数据是否存在
  console.log('[0/4] Checking Vue data availability...');
  const checkResult = runOpenCli(`(() => {
    var el = document.getElementsByClassName("mainContainer")[0];
    if (!el) return JSON.stringify({error: "no mainContainer element"});
    var vm = el.__vue__;
    if (!vm) return JSON.stringify({error: "no Vue instance"});
    var child = vm["$children"][0];
    if (!child) return JSON.stringify({error: "no child component"});
    var data = child._data.dataJson;
    if (!data || !data.childrens) return JSON.stringify({error: "no dataJson.childrens"});
    return JSON.stringify({ok: true, blocks: data.childrens.length});
  })()`);
  const check = JSON.parse(checkResult.trim());
  if (check.error) {
    console.error(`  ❌ Vue data not available: ${check.error}`);
    console.error('  可能原因：页面未加载完成、页面结构已变更、或未在课程页面上');
    process.exit(1);
  }
  console.log(`  ✅ ${check.blocks} blocks found`);

  // 0.5 提取页面标题 (优先用 document.title，比内容里第一个 heading 更准确)
  console.log('[0.5/4] Extracting page title...');
  const pageTitle = runOpenCli(`document.title`).trim();
  console.log(`  Title: ${pageTitle}`);

  // 从标题生成短前缀用于图片文件名，避免多课程图片互相覆盖
  const titleSlug = (pageTitle || 'untitled')
    .replace(/[?*"<>|\\/：:]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 4);  // 取前4个字符作为前缀
  console.log(`  Image prefix: ${titleSlug}`);

  // 1. 提取内容
  console.log('[1/4] Extracting content from Vue data...');
  const rawContent = runOpenCli(`(${EXTRACT_FN.trim()})()`);
  writeFileSync(join(outputDir, '_raw.md'), rawContent, 'utf8');
  console.log(`  Content: ${rawContent.length} chars`);

  // 2. 提取图片 URL
  console.log('[2/4] Extracting image URLs...');
  const urlRegex = /!\[\]\((https:\/\/[^)]+)\)/g;
  const allUrls = [];
  let m;
  while ((m = urlRegex.exec(rawContent)) !== null) allUrls.push(m[1]);
  const uniqueUrls = [...new Set(allUrls)];
  console.log(`  ${allUrls.length} refs, ${uniqueUrls.length} unique URLs`);

  // 3. 下载图片
  console.log('[3/4] Downloading images...');
  rmSync(imgDir, { recursive: true, force: true });
  mkdirSync(imgDir, { recursive: true });

  const mapping = {};
  let ok = 0, fail = 0;
  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    const ext = url.split('.').pop().split('?')[0];
    const filename = `${titleSlug}-img-${String(i).padStart(3, '0')}.${ext}`;
    mapping[url] = `images/${filename}`;
    if (downloadImage(url, join(imgDir, filename))) {
      ok++;
    } else {
      fail++;
      console.error(`  FAILED: ${filename}`);
    }
    if (ok > 0 && ok % 30 === 0) console.log(`  ${ok}/${uniqueUrls.length} downloaded`);
  }
  console.log(`  Downloaded: ${ok}, Failed: ${fail}`);

  // 4. 生成最终 Markdown
  console.log('[4/4] Building final markdown...');
  let md = rawContent;
  for (const [url, local] of Object.entries(mapping)) {
    md = md.replaceAll(url, local);
  }

  // 使用 document.title 作为课程标题（比内容里第一个 heading 更准确）
  // 清理文件名非法字符（半角 : ? * " < > | 和 / \）
  const title = (pageTitle || 'Untitled').replace(/[?*"<>|\\/]/g, '_').trim();

  const header = `---
title: ${title}
source: ${new URL('https://yitang.top').hostname}
extracted: ${new Date().toISOString()}
images: ${uniqueUrls.length}
---

# ${title}

`;

  const finalMd = header + md;
  const outPath = join(outputDir, `${title}.md`);
  writeFileSync(outPath, finalMd, 'utf8');

  // 验证
  console.log('\n[VERIFY] Checking image references...');
  const files = new Set(readdirSync(imgDir));
  const refRegex = /!\[.*?\]\((images\/[^)]+)\)/g;
  let missing = 0;
  let ref;
  while ((ref = refRegex.exec(finalMd)) !== null) {
    const fname = ref[1].replace('images/', '');
    if (!files.has(fname)) {
      console.error(`  MISSING: ${fname}`);
      missing++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`  Output: ${outPath}`);
  console.log(`  Images: ${imgDir} (${files.size} files)`);
  console.log(`  Missing refs: ${missing}`);
  if (missing > 0) process.exit(1);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
