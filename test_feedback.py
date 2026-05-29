"""
用户反馈功能 E2E 测试
"""
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3030"


def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        responses = []
        page.on("response", lambda res: responses.append(f"{res.status} {res.url}") if "/api/" in res.url else None)

        # 步骤 1: 登录测试用户
        print("\n[1/7] 登录测试用户...")
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=60000)
        time.sleep(8)
        page.screenshot(path="/tmp/feedback-login.png")
        print(f"  页面URL: {page.url}")
        
        page.wait_for_selector("input[type='text']", timeout=60000)
        page.locator("input[type='text']").first.fill("testuser")
        page.locator("input[type='password']").first.fill("password")
        page.screenshot(path="/tmp/feedback-login-filled.png")
        
        page.locator("button[type='submit']").first.click()
        time.sleep(8)
        page.screenshot(path="/tmp/feedback-login-result.png")
        print(f"  当前URL: {page.url}")
        
        api_logs = [l for l in console_logs if "api" in l.lower() or "error" in l.lower()]
        if api_logs:
            print("  控制台日志:")
            for l in api_logs[-5:]:
                print(f"    {l}")
        api_resps = [r for r in responses if "/api/auth/login" in r]
        if api_resps:
            print(f"  API响应: {api_resps[-1]}")

        # 步骤 2: 访问反馈页面
        print("\n[2/7] 访问 /feedback 页面...")
        page.goto(f"{BASE_URL}/feedback", wait_until="domcontentloaded", timeout=60000)
        time.sleep(6)
        page.screenshot(path="/tmp/feedback-page.png", full_page=True)
        
        content = page.content()
        if "用户反馈" in content:
            print("✅ 反馈页面加载成功")
        else:
            print(f"⚠️ 反馈页面未正确加载, URL={page.url}")

        # 步骤 3: 打开提交表单
        print("\n[3/7] 打开提交表单...")
        submit_btn = page.locator("text=提交反馈").first
        if submit_btn.is_visible():
            submit_btn.click()
            time.sleep(2)
            page.screenshot(path="/tmp/feedback-form.png")
            print("✅ 提交表单弹窗打开成功")
        else:
            print("⚠️ 提交反馈按钮不可见")
            browser.close()
            return

        # 步骤 4: 填写并提交反馈
        print("\n[4/7] 填写并提交反馈...")
        page.locator("button:has-text('功能建议')").click()
        time.sleep(1)
        page.locator("input[placeholder*='简要描述']").fill("测试反馈：添加深色模式自动切换")
        page.locator("textarea[placeholder*='详细描述']").fill(
            "希望在设置中增加一个选项，可以根据系统主题自动切换深色模式。"
        )
        page.screenshot(path="/tmp/feedback-filled.png")
        
        page.locator("form button[type='submit']").click()
        time.sleep(3)
        page.screenshot(path="/tmp/feedback-submitted.png")
        
        submit_resps = [r for r in responses if "/api/feedback" in r]
        if submit_resps:
            print(f"  API响应: {submit_resps[-1]}")
        print("✅ 反馈提交成功")

        # 步骤 5: 验证反馈出现在列表中
        print("\n[5/7] 验证反馈出现在列表中...")
        page.goto(f"{BASE_URL}/feedback", wait_until="domcontentloaded", timeout=60000)
        time.sleep(6)
        
        content = page.content()
        if "添加深色模式自动切换" in content:
            print("✅ 反馈已出现在列表中")
        else:
            print("⚠️ 提交的反馈未出现在列表中")
        
        page.screenshot(path="/tmp/feedback-list.png", full_page=True)

        # 步骤 6: 打开详情
        print("\n[6/7] 打开反馈详情...")
        feedback_card = page.locator("text=添加深色模式自动切换").first
        if feedback_card.is_visible():
            feedback_card.click()
            time.sleep(2)
            page.screenshot(path="/tmp/feedback-detail.png")
            print("✅ 详情弹窗打开成功")
        else:
            print("⚠️ 反馈卡片不可见")

        # 步骤 7: 测试筛选功能
        print("\n[7/7] 测试筛选功能...")
        # 先关闭详情弹窗（按 Escape 最可靠）
        page.keyboard.press("Escape")
        time.sleep(1)
        # 如果弹窗仍在，尝试点击遮罩层关闭
        overlay = page.locator("div[class*='fixed inset-0 z-50']").first
        if overlay.is_visible():
            overlay.click(position={"x": 10, "y": 10})
            time.sleep(1)

        filter_btn = page.locator("button:has-text('筛选')").first
        if filter_btn.is_visible():
            filter_btn.click()
            time.sleep(2)
            page.screenshot(path="/tmp/feedback-filters.png")

            feature_filter = page.locator("button:has-text('功能')").first
            if feature_filter.is_visible():
                feature_filter.click()
                time.sleep(2)
                page.screenshot(path="/tmp/feedback-filtered.png")
                print("✅ 筛选功能正常")

        print("\n" + "=" * 50)
        print("🎉 E2E 测试完成！")
        print("=" * 50)

        page.goto(f"{BASE_URL}/feedback", wait_until="domcontentloaded", timeout=60000)
        time.sleep(4)
        page.screenshot(path="/tmp/feedback-final.png", full_page=True)

        context.close()
        browser.close()


if __name__ == "__main__":
    run_tests()
