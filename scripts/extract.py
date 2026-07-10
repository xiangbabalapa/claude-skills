"""
小报童专栏文章批量提取脚本
用法: python extract.py <state_path> <paper_slug> <output_dir>
原理: 用 Playwright 打开小报童页面，拦截 API 响应获取文章数据（含 HTML 全文），
      然后将 HTML 转为 Markdown 保存。无需逆向 API 签名机制。
依赖: playwright (pip install playwright)
"""
import asyncio
import json
import os
import re
import sys
from playwright.async_api import async_playwright

CHROME_PATH = os.environ["CHROME_PATH"]  # 从 user_software_location.md 读取


def html_to_markdown(html: str) -> str:
    """将小报童 HTML 正文转为 Markdown"""
    text = html
    # 标题
    text = re.sub(r'<h1[^>]*>(.*?)</h1>', r'# \1', text, flags=re.DOTALL)
    text = re.sub(r'<h2[^>]*>(.*?)</h2>', r'\n## \1\n', text, flags=re.DOTALL)
    text = re.sub(r'<h3[^>]*>(.*?)</h3>', r'\n### \1\n', text, flags=re.DOTALL)
    text = re.sub(r'<h4[^>]*>(.*?)</h4>', r'\n#### \1\n', text, flags=re.DOTALL)
    # 加粗/斜体
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text, flags=re.DOTALL)
    text = re.sub(r'<em>(.*?)</em>', r'*\1*', text, flags=re.DOTALL)
    # 链接
    text = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r'[\2](\1)', text, flags=re.DOTALL)
    # 图片
    text = re.sub(r'<img[^>]*src="([^"]*)"[^>]*/?\s*>', r'![](\1)', text)
    text = re.sub(r'<div class="image-wrapper"[^>]*>(.*?)</div>', r'\1\n', text, flags=re.DOTALL)
    # 引用
    text = re.sub(r'<blockquote>\s*<p[^>]*>(.*?)</p>\s*</blockquote>', r'\n> \1\n', text, flags=re.DOTALL)
    text = re.sub(r'<blockquote>(.*?)</blockquote>', r'\n> \1\n', text, flags=re.DOTALL)
    # 列表
    text = re.sub(r'<[ou]l>(.*?)</[ou]l>', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'<li>\s*<p[^>]*>(.*?)</p>\s*</li>', r'- \1\n', text, flags=re.DOTALL)
    text = re.sub(r'<li>(.*?)</li>', r'- \1\n', text, flags=re.DOTALL)
    # 段落
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\1\n\n', text, flags=re.DOTALL)
    # 代码
    text = re.sub(r'<pre><code>(.*?)</code></pre>', r'\n```\n\1\n```\n', text, flags=re.DOTALL)
    text = re.sub(r'<code>(.*?)</code>', r'`\1`', text, flags=re.DOTALL)
    # 换行
    text = re.sub(r'<br\s*/?\s*>', '\n', text)
    # 清除剩余标签
    text = re.sub(r'<[^>]+>', '', text)
    # HTML 实体
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#39;', "'").replace('&nbsp;', ' ')
    # 清理空行
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def extract(state_path: str, paper_slug: str, output_dir: str, chrome_path: str = CHROME_PATH):
    os.makedirs(output_dir, exist_ok=True)

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True, executable_path=chrome_path)
    context = await browser.new_context(viewport={"width": 1280, "height": 900}, storage_state=state_path)
    page = await context.new_page()

    # 通过拦截 API 响应获取文章数据（绕过 sign 签名机制）
    all_posts = []

    async def capture_response(response):
        url = response.url
        if f'/paper/{paper_slug}/post' in url and 'description' not in url and 'pinned' not in url:
            try:
                data = await response.json()
                posts = data if isinstance(data, list) else data.get("data", data.get("posts", []))
                if posts:
                    all_posts.extend(posts)
            except:
                pass

    page.on("response", capture_response)

    # 加载专栏页面
    url = f"https://xiaobot.net/p/{paper_slug}"
    await page.goto(url, wait_until="networkidle", timeout=60000)
    await page.wait_for_timeout(3000)

    # 点击"内容"标签
    ct = await page.query_selector('text=内容')
    if ct:
        await ct.click()
        await page.wait_for_timeout(2000)

    # 滚动触发所有 API 分页请求
    for i in range(100):
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(400)
        if len(all_posts) >= 143:  # 常见上限，实际会自动停止
            break

    await page.close()

    # 去重
    seen = set()
    unique_posts = []
    for p in all_posts:
        uid = p.get("uuid", p.get("id", ""))
        if uid and uid not in seen:
            seen.add(uid)
            unique_posts.append(p)

    if not unique_posts:
        print(f"EXTRACT_FAIL|未获取到文章，请检查登录态是否有效")
        await browser.close()
        await pw.stop()
        return

    # 检查列表 API 是否已包含正文
    has_content = bool(unique_posts[0].get("content"))

    # 保存文章列表 JSON
    with open(os.path.join(output_dir, "_article_list.json"), "w", encoding="utf-8") as f:
        json.dump(unique_posts, f, ensure_ascii=False, indent=2)

    # 逐篇保存 Markdown
    success = 0
    for i, post in enumerate(unique_posts):
        title = post.get("title", f"article_{i+1}")
        date = post.get("created_at", post.get("published_at", ""))
        post_uuid = post.get("uuid", post.get("id", ""))
        content_html = post.get("content", "")

        if not content_html or len(content_html) < 50:
            continue

        content_md = html_to_markdown(content_html)
        if len(content_md) < 50:
            continue

        safe_title = "".join(c for c in title if c.isalnum() or c in ' _-').strip()[:80]
        if not safe_title:
            safe_title = f"article_{i+1}"
        filename = f"{i+1:03d}_{safe_title}.md"
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"# {title}\n\n")
            f.write(f"**日期**: {date}\n")
            f.write(f"**链接**: https://xiaobot.net/post/{post_uuid}\n\n---\n\n")
            f.write(content_md)

        success += 1

    print(f"EXTRACT_OK|{success}|{len(unique_posts)}|{output_dir}", flush=True)

    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("用法: python extract.py <state_path> <paper_slug> <output_dir>")
        sys.exit(1)
    asyncio.run(extract(sys.argv[1], sys.argv[2], sys.argv[3]))
