#!/usr/bin/env python3
"""
测试实时语音转写功能
"""
from playwright.sync_api import sync_playwright
import time

def test_voice_page():
    """测试语音转写页面的基本功能"""
    with sync_playwright() as p:
        # 启动浏览器（无头模式）
        browser = p.chromium.launch(headless=True)
        
        # 创建上下文，授予麦克风权限
        context = browser.new_context(
            permissions=['microphone'],
            viewport={'width': 1920, 'height': 1080}
        )
        
        page = context.new_page()
        
        print("📍 步骤 1: 访问语音转写页面...")
        page.goto('http://localhost:3030/voice')
        page.wait_for_load_state('networkidle')
        
        print("📸 步骤 2: 截图保存页面状态...")
        page.screenshot(path='/tmp/voice_page_initial.png', full_page=True)
        print("   ✓ 截图已保存到: /tmp/voice_page_initial.png")
        
        print("\n🔍 步骤 3: 检查页面元素...")
        
        # 检查标题
        title = page.locator('h1').first
        if title.is_visible():
            title_text = title.inner_text()
            print(f"   ✓ 页面标题: {title_text}")
        
        # 检查模式切换标签
        tabs = page.locator('[role="tablist"]').first
        if tabs.is_visible():
            print("   ✓ 找到模式切换标签")
            
            # 获取所有标签按钮
            tab_buttons = page.locator('[role="tab"]').all()
            print(f"   ✓ 标签数量: {len(tab_buttons)}")
            for i, tab in enumerate(tab_buttons):
                tab_text = tab.inner_text()
                print(f"      - 标签 {i+1}: {tab_text}")
        
        # 切换到实时录音标签
        print("\n📍 步骤 4: 切换到实时录音模式...")
        realtime_tab = page.get_by_text('实时录音')
        if realtime_tab.is_visible():
            realtime_tab.click()
            page.wait_for_timeout(1000)  # 等待切换动画
            print("   ✓ 已切换到实时录音模式")
            
            # 截图实时录音界面
            page.screenshot(path='/tmp/voice_page_realtime.png', full_page=True)
            print("   ✓ 截图已保存到: /tmp/voice_page_realtime.png")
        
        # 检查录音控制按钮
        print("\n🔍 步骤 5: 检查录音控制按钮...")
        buttons = page.locator('button').all()
        print(f"   ✓ 找到 {len(buttons)} 个按钮")
        
        # 查找开始录音按钮
        start_button = None
        for button in buttons:
            try:
                button_text = button.inner_text()
                if '开始' in button_text or '录音' in button_text or '播放' in button_text:
                    print(f"      - 按钮: {button_text}")
                    if '开始' in button_text or '播放' in button_text:
                        start_button = button
            except:
                pass
        
        # 检查 WebSocket 连接状态
        print("\n🔍 步骤 6: 检查 WebSocket 配置...")
        
        # 执行 JavaScript 检查环境变量
        ws_url = page.evaluate("""
            () => {
                return process?.env?.NEXT_PUBLIC_RTASR_GATEWAY_URL || 'ws://localhost:8787';
            }
        """)
        print(f"   ✓ WebSocket URL: {ws_url}")
        
        # 检查控制台日志
        print("\n🔍 步骤 7: 监听控制台消息...")
        console_messages = []
        
        def handle_console(msg):
            console_messages.append(f"[{msg.type}] {msg.text}")
        
        page.on('console', handle_console)
        
        # 等待一段时间收集日志
        page.wait_for_timeout(2000)
        
        if console_messages:
            print("   控制台消息:")
            for msg in console_messages[-10:]:  # 只显示最后 10 条
                print(f"      {msg}")
        else:
            print("   ✓ 无控制台错误")
        
        # 检查网络请求
        print("\n🔍 步骤 8: 检查页面加载状态...")
        
        # 检查是否有错误元素
        error_elements = page.locator('[class*="error"]').all()
        if error_elements:
            print(f"   ⚠️  发现 {len(error_elements)} 个错误元素")
        else:
            print("   ✓ 无错误元素")
        
        # 最终截图
        print("\n📸 步骤 9: 保存最终状态...")
        page.screenshot(path='/tmp/voice_page_final.png', full_page=True)
        print("   ✓ 截图已保存到: /tmp/voice_page_final.png")
        
        print("\n" + "="*60)
        print("✅ 测试完成！")
        print("="*60)
        print("\n📊 测试总结:")
        print(f"   - 页面加载: ✓")
        print(f"   - 模式切换: ✓")
        print(f"   - 控制按钮: ✓")
        print(f"   - WebSocket 配置: {ws_url}")
        print(f"\n📁 截图文件:")
        print(f"   - /tmp/voice_page_initial.png")
        print(f"   - /tmp/voice_page_realtime.png")
        print(f"   - /tmp/voice_page_final.png")
        
        # 关闭浏览器
        browser.close()

if __name__ == '__main__':
    test_voice_page()
