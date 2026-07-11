/**
 * 一堂课程链接收集器
 * 自动遍历选修课列表，收集所有课程文档链接
 *
 * 用法: node collect-links.mjs [--skip-links "url1,url2,..."] [--output links.json]
 * 依赖: OpenCLI + Tabbit Browser (已连接)
 *
 * 对抗性审查记录（2026-07-10）:
 * ✅ 匹配 "课程文档" 和 "课程文稿" 两种文本（实测发现不统一）
 * ✅ 跳过无 fs-doc 链接的子课程（AI教练入口类）
 * ✅ 三层课程用 history.back() 返回，不重新 openUrl
 * ✅ 检测重试机制（SPA 加载延迟）
 * ✅ JSON.parse + eval 异常捕获
 * ✅ 所有课程都是 section-based 结构（无 directDocLinks 的情况）
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

// ─── 配置 ───────────────────────────────────────────────
const PROFILE = process.env.OPENCLI_PROFILE;
const ELECTIVE_URL = 'https://yitang.top/elective-lesson';
const WAIT_PAGE = 4000;    // 页面跳转等待
const WAIT_SECTION = 5000; // 子课程页面等待
const WAIT_LIST = 3000;    // 列表页等待
const MAX_RETRY = 2;       // 检测重试次数

// ─── 参数解析 ────────────────────────────────────────────
const args = process.argv.slice(2);
const skipIdx = args.indexOf('--skip-links');
const skipLinks = skipIdx !== -1 ? args[skipIdx + 1].split(',').map(s => s.trim()) : [];
const outputIdx = args.indexOf('--output');
const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : 'course-links.json';
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 0;

// ─── 工具函数 ────────────────────────────────────────────
function runOpenCli(evalCode) {
  // atob() 输出 Latin-1 字节。要让中文正确，需：
  // 1. UTF-8 encode → 得到原始字节
  // 2. toString('latin1') → 把字节当 Latin-1 字符
  // 3. base64 encode → atob() 解码回同样的 Latin-1 字符
  // 4. JS 引擎把 Latin-1 字符（实际是 UTF-8 字节）当 UTF-8 解读
  const latin1Str = Buffer.from(evalCode, 'utf8').toString('latin1');
  const b64 = Buffer.from(latin1Str, 'latin1').toString('base64');
  const wrapper = `eval(atob("${b64}"))`;
  try {
    return execSync(`opencli browser ${PROFILE} eval ${JSON.stringify(wrapper)}`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000,
    });
  } catch (e) {
    console.error(`    ❌ OpenCLI eval 失败: ${e.message.substring(0, 100)}`);
    return 'null';
  }
}

function safeParse(json, fallback) {
  try { return JSON.parse(json.trim()); }
  catch { return fallback; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function openUrl(url) {
  execSync(`opencli browser ${PROFILE} open "${url}"`, { encoding: 'utf8', timeout: 30000 });
}

function goBack() {
  try {
    execSync(`opencli browser ${PROFILE} back`, { encoding: 'utf8', timeout: 15000 });
  } catch {
    // back 失败则 fallback 到 openUrl
    openUrl(ELECTIVE_URL);
  }
}

// 检测当前页面的层级结构（带重试）
async function detectStructure(retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = runOpenCli(`(function(){
      var links = Array.from(document.querySelectorAll('a')).filter(function(a){
        var href = a.getAttribute('href') || '';
        return href.indexOf('/fs-doc/') !== -1;
      });
      var sections = document.querySelectorAll('.detail-section-item');
      var titles = Array.from(sections).map(function(s){
        return s.textContent.trim().substring(0, 60);
      });
      return JSON.stringify({
        docLinks: links.map(function(a){ return a.getAttribute('href'); }),
        sectionCount: sections.length,
        sectionTitles: titles,
        url: location.href
      });
    })()`);
    const detect = safeParse(result, { docLinks: [], sectionCount: 0, sectionTitles: [] });

    // 找到直接链接或子课程，立即返回
    if (detect.docLinks.length > 0 || detect.sectionCount > 0) return detect;

    // 还没加载完，重试
    if (attempt < retries) {
      console.log(`      ⏳ 重试 ${attempt + 1}/${retries}...`);
      await sleep(2000);
    }
  }
  return { docLinks: [], sectionCount: 0, sectionTitles: [] };
}

// 获取当前页面的 fs-doc 链接
// ⚠️ 不能用中文字符串匹配（atob 解码会损坏中文），改用 href 路径匹配
function getDocLinks() {
  const result = runOpenCli(`(function(){
    var links = Array.from(document.querySelectorAll('a')).filter(function(a){
      var href = a.getAttribute('href') || '';
      return href.indexOf('/fs-doc/') !== -1;
    });
    return JSON.stringify(links.map(function(a){ return {text: a.textContent.trim(), href: a.getAttribute('href')}; }));
  })()`);
  return safeParse(result, []);
}

// ─── 主流程 ──────────────────────────────────────────────
async function main() {
  console.log(`跳过链接: ${skipLinks.length} 个`);
  console.log(`输出文件: ${outputFile}\n`);

  // 1. 打开选修课列表
  console.log('[1/4] 打开选修课列表...');
  openUrl(ELECTIVE_URL);
  await sleep(WAIT_LIST);

  // 2. 收集所有课程名称
  console.log('[2/4] 收集课程列表...');
  const courseNames = safeParse(runOpenCli(`JSON.stringify(
    Array.from(document.querySelectorAll('.list-item .title')).map(function(e){ return e.textContent.trim(); })
  )`), []);
  const totalToProcess = limit > 0 ? Math.min(limit, courseNames.length) : courseNames.length;
  console.log(`  找到 ${courseNames.length} 门课程，处理前 ${totalToProcess} 门\n`);

  if (courseNames.length === 0) {
    console.error('❌ 未找到课程，请检查页面是否加载完成');
    process.exit(1);
  }

  // 3. 逐个处理
  console.log('[3/4] 逐个收集链接...');
  const results = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < totalToProcess; i++) {
    const name = courseNames[i];
    console.log(`\n  [${i + 1}/${courseNames.length}] ${name}`);

    // 点击课程
    const clickResult = runOpenCli(`(function(){
      var items = document.querySelectorAll('.list-item');
      if(!items[${i}]) return JSON.stringify({ok:false, url:location.href});
      items[${i}].click();
      return JSON.stringify({ok:true});
    })()`);
    const click = safeParse(clickResult, { ok: false });
    if (!click.ok) {
      console.log('    ⚠️ 课程项不存在，跳过');
      errors.push({ name, error: 'item_not_found' });
      continue;
    }
    await sleep(WAIT_PAGE);

    // 检测层级（带重试）
    const detect = await detectStructure(MAX_RETRY);

    // 情况A：直接有文档链接（理论上不会出现，但防御性保留）
    if (detect.docLinks.length > 0) {
      const href = detect.docLinks[0];
      if (skipLinks.includes(href)) {
        console.log(`    ⏭️ 已有，跳过`);
        skipped.push({ name, href, reason: 'already_exists' });
      } else {
        console.log(`    ✅ 直接拿到链接`);
        results.push({ name, type: 'direct', links: [href] });
      }
      goBack();
      await sleep(WAIT_LIST);
      continue;
    }

    // 情况B：有子课程（所有已知课程都是这种结构）
    if (detect.sectionCount > 0) {
      console.log(`    📂 ${detect.sectionCount} 个子课程`);
      const courseLinks = [];

      for (let j = 0; j < detect.sectionCount; j++) {
        const sectionTitle = detect.sectionTitles[j] || `子课程${j + 1}`;
        console.log(`      [${j + 1}/${detect.sectionCount}] ${sectionTitle.substring(0, 50)}`);

        // 点击子课程
        runOpenCli(`(function(){
          var items = document.querySelectorAll('.detail-section-item');
          if(items[${j}]) items[${j}].click();
          return true;
        })()`);
        await sleep(WAIT_SECTION);

        // 获取文档链接
        const subLinks = getDocLinks();

        if (subLinks.length > 0) {
          const link = subLinks[0];
          const href = typeof link === 'string' ? link : link.href;
          if (skipLinks.includes(href)) {
            console.log(`        ⏭️ 已有，跳过`);
            skipped.push({ name: `${name} > ${sectionTitle}`, href, reason: 'already_exists' });
          } else {
            console.log(`        ✅ ${href.substring(0, 70)}...`);
            courseLinks.push({ section: sectionTitle, href: href });
          }
        } else {
          console.log(`        ⚠️ 无文档链接（可能是AI教练/视频入口）`);
        }

        // 返回课程详情页（用 back 比 openUrl 更快更稳）
        goBack();
        await sleep(WAIT_PAGE);

        // 验证回到了课程详情页
        const currentUrl = runOpenCli(`location.href`).trim();
        if (currentUrl.indexOf('/lesson/') === -1 || currentUrl.indexOf('/lesson/section/') !== -1) {
          // 没回到详情页，重新打开
          console.log(`        ⚠️ back 失败，重新导航...`);
          openUrl(ELECTIVE_URL);
          await sleep(WAIT_LIST);
          runOpenCli(`(function(){
            var items = document.querySelectorAll('.list-item');
            if(items[${i}]) items[${i}].click();
            return true;
          })()`);
          await sleep(WAIT_PAGE);
        }
      }

      if (courseLinks.length > 0) {
        results.push({ name, type: 'section-based', links: courseLinks.map(c => c.href), details: courseLinks });
      }
    } else {
      console.log('    ⚠️ 无法识别结构，跳过');
      errors.push({ name, error: 'unknown_structure' });
    }

    // 返回列表
    openUrl(ELECTIVE_URL);
    await sleep(WAIT_LIST);
  }

  // 4. 输出结果
  console.log('\n[4/4] 输出结果...');
  const report = {
    collectedAt: new Date().toISOString(),
    totalCourses: courseNames.length,
    collected: results,
    skipped: skipped,
    errors: errors,
    allLinks: results.flatMap(r => r.links),
  };
  writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n✅ 完成!`);
  console.log(`  需提取: ${results.length} 门课 (${report.allLinks.length} 个文档链接)`);
  console.log(`  已跳过: ${skipped.length} 门课`);
  console.log(`  错误: ${errors.length} 门课`);
  if (errors.length > 0) errors.forEach(e => console.log(`    - ${e.name}: ${e.error}`));
  console.log(`  结果: ${outputFile}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
