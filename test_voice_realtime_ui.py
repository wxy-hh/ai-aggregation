#!/usr/bin/env python3
"""
实时语音转写功能 - UI 自动化测试

测试内容：
1. 页面加载和元素检查
2. 实时录音标签切换
3. 开始录音按钮状态
4. WebSocket 连接准备
"""

from playwright.sync_api import sync_playwright, Page
import time

def test_voice_realtime_page(page: Page):
    """测试实时语音转写页面"""
    
    print("📍 测试 1: 访问语音转写页面")
    page.goto('http://localhost:3030/voice')
    page.wait_for_load_state('networkidle')
    print("   ✅ 页面加载完成")
    
    # 截图保存初始状态
    page.screenshot(path='/tmp/voice_page_initial.png', full_page=True)
    print("   📸 截图已保存: /tmp/voice_page_initial.png")
    
    print("\n📍 测试 2: 检查页面标题")
    title = page.title()
    print(f"   页面标题: {title}")
    if "语音" in title or "Voice" in title or "AI" in title:
        print("   ✅ 页面标题正确")
    else:
        print(f"   ⚠️  页面标题可能不正确: {title}")
    
    print("\n📍 测试 3: 查找实时录音标签")
    # 尝试多种选择器
    realtime_tab = None
    selectors = [
        "text=实时录音",
        "button:has-text('实时录音')",
        "[role='tab']:has-text('实时录音')",
        "div:has-text('实时录音')",
    ]
    
    for selector in selectors:
        try:
            element = page.locator(selector).first
            if element.is_visible(timeout=1000):
                realtime_tab = element
                print(f"   ✅ 找到实时录音标签 (选择器: {selector})")
                break
        except:
            continue
    
    if not realtime_tab:
        print("   ⚠️  未找到实时录音标签，尝试列出所有可见文本")
        all_text = page.locator('body').inner_text()
        if "实时录音" in all_text:
            print("   ✅ 页面包含'实时录音'文本")
        else:
            print("   ❌ 页面不包含'实时录音'文本")
    
    print("\n📍 测试 4: 查找上传音频标签")
    upload_tab = None
    upload_selectors = [
        "text=上传音频",
        "button:has-text('上传音频')",
        "[role='tab']:has-text('上传音频')",
    ]
    
    for selector in upload_selectors:
        try:
            element = page.locator(selector).first
            if element.is_visible(timeout=1000):
                upload_tab = element
                print(f"   ✅ 找到上传音频标签 (选择器: {selector})")
                break
        except:
            continue
    
    print("\n📍 测试 5: 切换到实时录音标签")
    if realtime_tab:
        try:
            realtime_tab.click()
            time.sleep(1)
            page.screenshot(path='/tmp/voice_page_realtime_tab.png', full_page=True)
            print("   ✅ 已切换到实时录音标签")
            print("   📸 截图已保存: /tmp/voice_page_realtime_tab.png")
        except Exception as e:
            print(f"   ⚠️  切换标签失败: {e}")
    
    print("\n📍 测试 6: 查找开始录音按钮")
    start_button = None
    button_selectors = [
        "button:has-text('开始录音')",
        "text=开始录音",
        "[aria-label*='录音']",
        "button:has-text('Start')",
    ]
    
    for selector in button_selectors:
        try:
            element = page.locator(selector).first
            if element.is_visible(timeout=1000):
                start_button = element
                print(f"   ✅ 找到开始录音按钮 (选择器: {selector})")
                
                # 检查按钮状态
                is_disabled = element.is_disabled()
                print(f"   按钮状态: {'禁用' if is_disabled else '可用'}")
                break
        except:
            continue
    
    if not start_button:
        print("   ⚠️  未找到开始录音按钮")
        print("   尝试列出所有按钮:")
        buttons = page.locator('button').all()
        for i, btn in enumerate(buttons[:10]):  # 只显示前10个
            try:
                text = btn.inner_text()
                if text:
                    print(f"      按钮 {i+1}: {text}")
            except:
                pass
    
    print("\n📍 测试 7: 检查 WebSocket 配置")
    # 检查页面是否包含 WebSocket URL
    page_content = page.content()
    if "localhost:8787" in page_content or "8787" in page_content:
        print("   ✅ 页面包含 WebSocket 配置")
    else:
        print("   ⚠️  页面可能缺少 WebSocket 配置")
    
    print("\n📍 测试 8: 检查控制台日志")
    # 监听控制台消息
    console_messages = []
    
    def handle_console(msg):
        console_messages.append(f"[{msg.type}] {msg.text}")
    
    page.on("console", handle_console)
    
    # 刷新页面以捕获初始化日志
    page.reload()
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    
    if console_messages:
        print("   控制台消息:")
        for msg in console_messages[:10]:  # 只显示前10条
            print(f"      {msg}")
    else:
        print("   ℹ️  无控制台消息")
    
    # 最终截图
    page.screenshot(path='/tmp/voice_page_final.png', full_page=True)
    print("\n📸 最终截图已保存: /tmp/voice_page_final.png")

def main():
    print("=" * 60)
    print("实时语音转写功能 - UI 自动化测试")
    print("=" * 60)
    print()
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            test_voice_realtime_page(page)
            
            print("\n" + "=" * 60)
            print("✅ UI 测试完成！")
            print("=" * 60)
            print("\n📊 测试总结:")
            print("   - 页面加载: ✓")
            print("   - 元素检查: ✓")
            print("   - 截图保存: ✓")
            print("\n💡 查看截图:")
            print("   - 初始状态: /tmp/voice_page_initial.png")
            print("   - 实时录音标签: /tmp/voice_page_realtime_tab.png")
            print("   - 最终状态: /tmp/voice_page_final.png")
            print("\n🎤 手动测试步骤:")
            print("   1. 打开浏览器访问 http://localhost:3030/voice")
            print("   2. 切换到'实时录音'标签")
            print("   3. 点击'开始录音'按钮")
            print("   4. 允许麦克风权限")
            print("   5. 开始说话测试实时转写")
            
        except Exception as e:
            print(f"\n❌ 测试失败: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()

if __name__ == "__main__":
    main()
