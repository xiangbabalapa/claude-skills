"""
小报童微信扫码登录脚本
用法: python login.py <state_output_path>
流程: 打开 Chrome → 访问小报童 → 点击登录 → 等待扫码 → 保存 localStorage
依赖: playwright (pip install playwright)
"""
import asyncio
import json
import sys
from playwright.async_api import async_playwright

# 从 user_software_location.md 读取，此处为默认值
CHROME_PATH = os.environ["CHROME_PATH"]  # 从 user_software_location.md 读取
XIAOBOT_URL = "https://xiaobot.net"


async def login(state_path: str, chrome_path: str = CHROME_PATH, url: str = XIAOBOT_URL):
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=False, executable_path=chrome_path, args=["--start-maximized"])
    context = await browser.new_context(viewport={"width": 1280, "height": 900})
    page = await context.new_page()

    await page.goto(url, wait_until="networkidle", timeout=60000)
    await page.wait_for_timeout(3000)

    # 点击登录按钮触发二维码
    login_btn = await page.query_selector('text=登录')
    if login_btn:
        await login_btn.click()
        await page.wait_for_timeout(2000)

    print("READY_FOR_SCAN")
    print("浏览器已打开，请用微信扫码登录！", flush=True)

    # 轮询检测登录成功（最长 2 分钟）
    logged_in = False
    for i in range(24):
        await asyncio.sleep(5)
        login_visible = await page.query_selector('text=登录')
        if not login_visible:
            logged_in = True
            break

    if logged_in:
        # 保存 storage state（含 localStorage 中的 vuex/token）
        await context.storage_state(path=state_path)
        print(f"LOGIN_OK|{state_path}", flush=True)
    else:
        print("LOGIN_TIMEOUT", flush=True)

    await browser.close()
    await pw.stop()
    return logged_in


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python login.py <state_output_path>")
        sys.exit(1)
    asyncio.run(login(sys.argv[1]))
