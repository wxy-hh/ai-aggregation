#!/usr/bin/env python3
"""
匿名登录 + 额度扣减验收脚本
运行前请确保 dev:web 已启动（默认 http://localhost:3030；端口漂移时用 BASE_URL 环境变量指定）

额度断言口径（2026-09-29 认证加固后）：
  匿名初始额度已从 3000 提升到 apps/web/src/lib/constants/quota.ts 的 ANONYMOUS_FREE_TOKENS（现值 20000），
  单次 chat 只扣减少量 token。若沿用「跑 N 次把额度打到 0」的旧断言，需要数十次真实模型调用——
  脚本又慢又费钱。因此这里改为不依赖绝对值的断言：
    1) 解析常量文件得到期望初始额度，并断言 /api/auth/me 返回的 tokens 与之一致（防常量与线上实现漂移）；
    2) 只跑固定轮数 chat，断言余额单调不增、且总扣减差值 = 初始 - 最终 > 0（即扣减确实发生）。
  「额度耗尽返回 402」等需要真实耗尽额度的场景在本脚本中显式跳过，由路由单测覆盖。

本脚本会真实调用上游模型接口，仅在本地/内测环境按需运行，不要接入 CI。
"""

import json
import os
import random
import re
import secrets
import string
import sys
import time
import urllib.request
import urllib.error

# dev 端口可能自动漂移，可用 BASE_URL 环境变量指定实际地址
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3030")

# 匿名初始额度常量源文件（相对本脚本定位，避免依赖调用方的当前目录）
QUOTA_CONST_SOURCE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "apps",
    "web",
    "src",
    "lib",
    "constants",
    "quota.ts",
)

# 额度扣减探针轮数：只验证「扣了」，不再把额度跑空
CHAT_PROBE_ROUNDS = 3

results = []
skipped = []


def read_anonymous_free_tokens():
    """从常量文件解析匿名初始额度，避免在脚本里写死数值。"""
    with open(QUOTA_CONST_SOURCE, encoding="utf-8") as handle:
        content = handle.read()
    matched = re.search(r"ANONYMOUS_FREE_TOKENS\s*=\s*(\d+)", content)
    if not matched:
        raise RuntimeError(f"未能从 {QUOTA_CONST_SOURCE} 解析 ANONYMOUS_FREE_TOKENS")
    return int(matched.group(1))


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


def skip(name, reason):
    """标记为跳过：既不计通过也不计失败，避免把「当前环境下不可达」误报成回归。"""
    skipped.append((name, reason))
    print(f"⊘ {name}: 跳过 | {reason}")


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

    # Q-1/Q-2: /api/chat 额度扣减（不依赖绝对值的差值断言，理由见文件头注释）
    print("\n--- 额度扣减测试 ---")
    chat_headers = {"Authorization": f"Bearer {anon_token}"}

    status, body, _ = request("GET", "/api/auth/me", headers=chat_headers)
    me_data = json.loads(body) if status == 200 else {}
    initial_tokens = me_data.get("data", {}).get("user", {}).get("tokens")
    expected_initial = read_anonymous_free_tokens()
    check(
        "Q-1 匿名初始额度与常量一致",
        True,
        initial_tokens == expected_initial,
        f"初始 tokens={initial_tokens}, 常量 ANONYMOUS_FREE_TOKENS={expected_initial}",
    )

    previous_tokens = initial_tokens
    non_increasing = True
    for i in range(1, CHAT_PROBE_ROUNDS + 1):
        status, body, _ = request("POST", "/api/chat", {
            "messages": [{"role": "user", "content": "你好"}],
            "provider": "xunfei",
            "model": "generalv3.5"
        }, headers=chat_headers)
        # chat 返回 SSE，这里只关注状态码与随后的余额快照
        me_status, me_body, _ = request("GET", "/api/auth/me", headers=chat_headers)
        me_data = json.loads(me_body) if me_status == 200 else {}
        tokens = me_data.get("data", {}).get("user", {}).get("tokens")
        print(f"  第 {i} 次 chat: HTTP={status}, tokens={tokens}")
        if tokens is None:
            continue
        if previous_tokens is not None and tokens > previous_tokens:
            non_increasing = False
        previous_tokens = tokens

    final_tokens = previous_tokens
    deducted = None if initial_tokens is None or final_tokens is None else initial_tokens - final_tokens
    check("Q-2 余额单调不增", True, non_increasing, f"每轮余额={initial_tokens} → {final_tokens}")
    check(
        f"Q-2 {CHAT_PROBE_ROUNDS} 次 chat 有扣减（差值断言）",
        True,
        deducted is not None and deducted > 0,
        f"初始={initial_tokens}, 最终={final_tokens}, 扣减差值={deducted}",
    )

    # Q-7: 额度耗尽返回 402 —— 需要先真实耗尽额度，本脚本不再为此跑数十次模型调用
    skip(
        "Q-7 额度耗尽返回 402",
        f"初始额度 {expected_initial}、单次 chat 仅扣减少量 token，跑空需数十次真实模型调用；由路由单测覆盖该分支",
    )

    # Q-8: 额度耗尽后仍可查看历史 —— 依赖 Q-7 的前置状态，同样跳过
    skip("Q-8 额度耗尽后历史可访问", "依赖「额度已耗尽」前置状态；历史接口鉴权由 H-1 与路由单测覆盖")

    # AI 接口鉴权
    print("\n--- AI/业务接口鉴权 ---")
    check("AI-1 chat 未带 token", 401, request("POST", "/api/chat", {"messages": [{"role": "user", "content": "你好"}]})[0])
    check("AI-3 video 未带 token", 401, request("POST", "/api/video", {"prompt": "test", "model": "cogvideox-flash"})[0])

    # AI-4: 免费视频模型
    status, body, _ = request("POST", "/api/video", {"prompt": "a cat", "model": "cogvideox-flash"}, headers=chat_headers)
    check("AI-4 免费视频模型", True, status in (200, 201, 202), f"status={status}")

    # AI-5: optimize-prompt（认证加固后已强制鉴权，未带 token 由 withAuth 直接 401）
    status, body, _ = request("POST", "/api/video/optimize-prompt", {"prompt": "一只猫"})
    check("AI-5 optimize-prompt 未带 token", 401, status, "认证加固后强制鉴权")

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
    # 以下接口在认证加固后统一走 withAuth，未登录一律 401（不再存在「可选认证」路径，也没有请求体校验先行的行为）
    check("DES-2 destiny/report 未带 token", 401, request("POST", "/api/destiny/report", {"name": "test"})[0])
    check("DES-3 destiny/ziwei-report 未带 token", 401, request("POST", "/api/destiny/ziwei-report", {"name": "test"})[0])
    check("DES-4 qimen/analyze/start 未带 token", 401, request("POST", "/api/destiny/qimen/analyze/start", {"question": "test"})[0])
    # 补充：认证加固后被强制鉴权的其余接口
    check("DES-5 image/agnes 未带 token", 401, request("POST", "/api/image/agnes", {"prompt": "test"})[0])
    check("DES-6 voice/translate 未带 token", 401, request("POST", "/api/voice/translate", {"text": "test"})[0])
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
    print(f"测试结果: {passed}/{total} 通过，跳过 {len(skipped)} 项")
    print("=" * 60)
    for name, ok, expected, actual, detail in results:
        if not ok:
            print(f"✗ {name}: 预期 {expected}, 实际 {actual} | {detail}")
    for name, reason in skipped:
        print(f"⊘ {name}: 跳过 | {reason}")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
