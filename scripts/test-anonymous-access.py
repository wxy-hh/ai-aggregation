#!/usr/bin/env python3
"""
匿名登录 + 3000 额度全面测试脚本
运行前请确保 dev:web 已启动在 http://localhost:3030
"""

import json
import random
import secrets
import string
import sys
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3030"

results = []


def request(method, path, body=None, headers=None, cookie_jar=None):
    """发送 HTTP 请求并返回 (status, body, headers)"""
    url = BASE_URL + path
    req_headers = dict(headers or {})
    req_headers.setdefault("Accept", "application/json")
    data = None
    if body is not None:
        if isinstance(body, dict):
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            req_headers.setdefault("Content-Type", "application/json")
        else:
            data = body
    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    # 简单 cookie 支持
    if cookie_jar:
        cookies = "; ".join(f"{k}={v}" for k, v in cookie_jar.items())
        if cookies:
            req.add_header("Cookie", cookies)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            try:
                body_text = raw.decode("utf-8")
            except UnicodeDecodeError:
                body_text = raw.decode("utf-8", errors="ignore")
            # 提取 Set-Cookie
            set_cookies = resp.headers.get_all("Set-Cookie") or []
            for c in set_cookies:
                kv = c.split(";")[0].strip()
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    if cookie_jar is not None:
                        cookie_jar[k] = v
            return resp.status, body_text, dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            body_text = raw.decode("utf-8")
        except UnicodeDecodeError:
            body_text = raw.decode("utf-8", errors="ignore")
        return e.code, body_text, dict(e.headers)


def check(name, expected_status, actual_status, detail=""):
    ok = actual_status == expected_status
    results.append((name, ok, expected_status, actual_status, detail))
    status = "✓" if ok else "✗"
    print(f"{status} {name}: 预期 {expected_status}, 实际 {actual_status}{detail and ' | ' + detail}")
    return ok


def hex64():
    """生成 64 位十六进制设备标识"""
    return secrets.token_hex(32)


def main():
    anon_cookie_jar = {}
    real_cookie_jar = {}

    print("=" * 60)
    print("匿名登录全面测试")
    print("=" * 60)

    # A-1: 首次匿名认证
    device_id = hex64()
    status, body, _ = request("POST", "/api/auth/anonymous", {"deviceId": device_id}, cookie_jar=anon_cookie_jar)
    anon_data = json.loads(body) if status == 200 else {}
    anon_token = anon_data.get("data", {}).get("accessToken", "")
    check("A-1 首次匿名认证", 200, status, f"token={bool(anon_token)}")

    # A-2: 相同 deviceId 重复认证
    status2, body2, _ = request("POST", "/api/auth/anonymous", {"deviceId": device_id}, cookie_jar=anon_cookie_jar)
    anon_data2 = json.loads(body2) if status2 == 200 else {}
    anon_token2 = anon_data2.get("data", {}).get("accessToken", "")
    check("A-2 相同 deviceId 重复认证", 200, status2, f"相同 token={anon_token == anon_token2}")

    # A-3: 匿名用户获取个人信息
    status, body, _ = request("GET", "/api/auth/me", headers={"Authorization": f"Bearer {anon_token}"})
    me_data = json.loads(body) if status == 200 else {}
    user = me_data.get("data", {}).get("user", {})
    check("A-3 匿名用户 me", 200, status, f"isAnonymous={user.get('isAnonymous')} tokens={user.get('tokens')}")

    # A-4: 未认证访问 /api/auth/me
    status, body, _ = request("GET", "/api/auth/me")
    check("A-4 未认证 me", 401, status)

    # A-5: 匿名用户 refresh token
    status, body, _ = request("POST", "/api/auth/refresh", cookie_jar=anon_cookie_jar)
    check("A-5 匿名 refresh", 401, status)

    # A-6/A-7: 真实用户注册/登录/refresh
    real_user = "realtest" + "".join(random.choices(string.digits, k=12))
    real_pass = "TestPass123!"
    request("POST", "/api/auth/register", {"username": real_user, "password": real_pass, "name": "Test"})
    status, body, _ = request("POST", "/api/auth/login", {"username": real_user, "password": real_pass}, cookie_jar=real_cookie_jar)
    login_data = json.loads(body) if status == 200 else {}
    real_token = login_data.get("data", {}).get("accessToken", "")
    check("A-6 真实用户登录", 200, status, f"token={bool(real_token)}")

    status, body, _ = request("POST", "/api/auth/refresh", cookie_jar=real_cookie_jar)
    refresh_data = json.loads(body) if status == 200 else {}
    check("A-7 真实用户 refresh", 200, status, f"has token={'accessToken' in refresh_data or 'accessToken' in refresh_data.get('data', {})}")

    # Q-2: /api/chat 扣减测试（讯飞预扣 500）
    print("\n--- 额度扣减测试 ---")
    chat_headers = {"Authorization": f"Bearer {anon_token}"}
    last_tokens = 3000
    for i in range(1, 7):
        status, body, _ = request("POST", "/api/chat", {
            "messages": [{"role": "user", "content": "你好"}],
            "provider": "xunfei",
            "model": "generalv3.5"
        }, headers=chat_headers)
        # chat 返回 SSE，这里只关注状态码
        _, me_body, _ = request("GET", "/api/auth/me", headers=chat_headers)
        me_status, me_body, _ = request("GET", "/api/auth/me", headers=chat_headers)
        me_data = json.loads(me_body) if me_status == 200 else {}
        tokens = me_data.get("data", {}).get("user", {}).get("tokens")
        print(f"  第 {i} 次 chat: HTTP={status}, tokens={tokens}")
        last_tokens = tokens if tokens is not None else last_tokens

    check("Q-2 chat 6 次扣减", True, last_tokens == 0, f"最终 tokens={last_tokens}")

    # Q-7: 额度耗尽返回 402
    status, body, _ = request("POST", "/api/chat", {
        "messages": [{"role": "user", "content": "你好"}],
        "provider": "xunfei",
        "model": "generalv3.5"
    }, headers=chat_headers)
    detail = ""
    try:
        detail = json.loads(body).get("code", "")
    except Exception:
        pass
    check("Q-7 额度耗尽返回 402", 402, status, f"code={detail}")

    # Q-8: 额度耗尽后仍可查看历史
    status, body, _ = request("GET", "/api/history", headers=chat_headers)
    check("Q-8 额度耗尽后历史可访问", 200, status)

    # AI 接口鉴权
    print("\n--- AI/业务接口鉴权 ---")
    check("AI-1 chat 未带 token", 401, request("POST", "/api/chat", {"messages": [{"role": "user", "content": "你好"}]})[0])
    check("AI-3 video 未带 token", 401, request("POST", "/api/video", {"prompt": "test", "model": "cogvideox-flash"})[0])

    # AI-4: 免费视频模型
    status, body, _ = request("POST", "/api/video", {"prompt": "a cat", "model": "cogvideox-flash"}, headers=chat_headers)
    check("AI-4 免费视频模型", True, status in (200, 201, 202), f"status={status}")

    # AI-5: optimize-prompt（该接口未强制认证，但前端已用 authFetch）
    status, body, _ = request("POST", "/api/video/optimize-prompt", {"prompt": "一只猫"})
    check("AI-5 optimize-prompt 未带 token", 200, status, "该接口保持公开")

    # B-2/B-3: feedback
    check("B-2 feedback POST 未带 token", 401, request("POST", "/api/feedback", {"type": "BUG", "title": "test", "content": "test content"})[0])
    check("B-3 feedback GET 未带 token", 401, request("GET", "/api/feedback")[0])

    # R-1: profile/usage 匿名用户
    status, body, _ = request("GET", "/api/profile/usage", headers=chat_headers)
    check("R-1 profile/usage 匿名", 200, status, "匿名用户可查看自身用量")

    # R-2: profile/update 匿名用户（禁止修改用户名）
    status, body, _ = request("PATCH", "/api/profile/update", {"name": "Test"}, headers=chat_headers)
    check("R-2 profile/update 匿名", 200, status, "匿名用户可修改 name")

    # R-6: admin/users 非 admin
    status, body, _ = request("GET", "/api/admin/users", headers=chat_headers)
    check("R-6 admin/users 非 admin", 403, status)

    # H-1: history 未带 token
    status, body, _ = request("GET", "/api/history")
    check("H-1 history 未带 token", 401, status)

    # V-1: voice transcriptions 未带 token
    status, body, _ = request("GET", "/api/voice/transcriptions")
    check("V-1 voice/transcriptions 未带 token", 401, status)

    # F-1: files 未带 token
    status, body, _ = request("POST", "/api/files")
    check("F-1 files POST 未带 token", 401, status)

    # 更多业务接口鉴权
    print("\n--- 更多业务接口鉴权 ---")
    check("IMG-1 image/generate 未带 token", 401, request("POST", "/api/image/generate", {"prompt": "test"})[0])
    check("RES-1 resume/polish 未带 token", 401, request("POST", "/api/resume/polish", {"resume": "test"})[0])
    check("RES-2 resume/diagnose 未带 token", 401, request("POST", "/api/resume/diagnose", {"resume": "test"})[0])
    check("DES-1 destiny/copilot 未带 token", 401, request("POST", "/api/destiny/copilot", {"messages": [{"role": "user", "content": "test"}]})[0])
    # 以下接口使用 getOptionalUserId，未登录时不强制 401，非法请求体返回 400
    check("DES-2 destiny/report 未带 token（可选认证）", 400, request("POST", "/api/destiny/report", {"name": "test"})[0], "现有行为：未登录返回参数错误")
    check("DES-3 destiny/ziwei-report 未带 token（可选认证）", 400, request("POST", "/api/destiny/ziwei-report", {"name": "test"})[0], "现有行为：未登录返回参数错误")
    check("DES-4 qimen/analyze/start 未带 token（可选认证）", 400, request("POST", "/api/destiny/qimen/analyze/start", {"question": "test"})[0], "现有行为：未登录返回参数错误")
    # voice/transcribe 需要 multipart，空请求可能 500，此处仅验证带 token 可进入业务校验
    status, body, _ = request("POST", "/api/voice/transcribe", headers=chat_headers)
    check("VOI-1 voice/transcribe 带 token 无文件", 400, status, "带 token 后返回缺少文件")

    # 匿名用户业务行为
    print("\n--- 匿名用户业务行为 ---")
    status, body, _ = request("POST", "/api/feedback", {"type": "BUG", "title": "匿名测试", "content": "这是一条匿名测试反馈"}, headers=chat_headers)
    fb_data = json.loads(body) if status == 201 else {}
    fb_id = fb_data.get("data", {}).get("id", "")
    check("FB-1 匿名创建反馈", 201, status, f"feedback_id={fb_id}")

    status, body, _ = request("GET", "/api/feedback", headers=chat_headers)
    check("FB-2 匿名查看反馈列表", 200, status)

    if fb_id:
        status, body, _ = request("GET", f"/api/feedback/{fb_id}", headers=chat_headers)
        check("FB-3 匿名查看自己的反馈", 200, status)

    # 匿名用户禁止修改用户名
    status, body, _ = request("PATCH", "/api/profile/update", {"username": "newname"}, headers=chat_headers)
    check("R-3 匿名禁止修改用户名", 403, status)

    # 匿名用户禁止自助注销
    status, body, _ = request("DELETE", "/api/profile/delete", {}, headers=chat_headers)
    check("R-4 匿名禁止自助注销", 403, status)

    # 汇总
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, *_ in results if ok)
    total = len(results)
    print(f"测试结果: {passed}/{total} 通过")
    print("=" * 60)
    for name, ok, expected, actual, detail in results:
        if not ok:
            print(f"✗ {name}: 预期 {expected}, 实际 {actual} | {detail}")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
