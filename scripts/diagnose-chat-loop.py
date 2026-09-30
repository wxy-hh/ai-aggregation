#!/usr/bin/env python3
"""
/api/chat 诊断验证闭环脚本
"""
import json
import secrets
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3030"

def run_loop():
    # 1. 匿名认证获取 token
    device_id = secrets.token_hex(32)
    auth_req = urllib.request.Request(
        f"{BASE_URL}/api/auth/anonymous",
        data=json.dumps({"deviceId": device_id}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(auth_req, timeout=10) as resp:
        auth_data = json.loads(resp.read().decode())
        token = auth_data["data"]["accessToken"]

    # 2. 调用 /api/chat
    chat_req = urllib.request.Request(
        f"{BASE_URL}/api/chat",
        data=json.dumps({
            "messages": [{"role": "user", "content": "1+1等于几？请简短回答。"}],
            "provider": "xunfei",
            "model": "lite"
        }).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
    )

    events = []
    text_deltas = []
    error_message = None

    try:
        with urllib.request.urlopen(chat_req, timeout=30) as resp:
            for line in resp:
                line_str = line.decode().strip()
                if not line_str or not line_str.startswith("data:"):
                    continue
                payload_str = line_str[5:].strip()
                if payload_str == "[DONE]":
                    events.append({"type": "done"})
                    continue
                try:
                    event = json.loads(payload_str)
                    events.append(event)
                    if event.get("type") == "text-delta":
                        text_deltas.append(event.get("text", ""))
                    elif event.get("type") == "error":
                        error_message = event.get("error")
                except json.JSONDecodeError:
                    pass
    except urllib.error.HTTPError as e:
        print(f"[FAIL] HTTP Error: {e.code} - {e.read().decode()}")
        return False
    except Exception as e:
        print(f"[FAIL] Exception: {type(e).__name__} - {e}")
        return False

    full_text = "".join(text_deltas)
    if error_message:
        print(f"[FAIL] Stream returned error event: {error_message}")
        return False

    if not full_text:
        print("[FAIL] Stream closed without any text-delta content")
        return False

    print(f"[PASS] Stream completed successfully. Text preview: {full_text[:50]}")
    return True

if __name__ == "__main__":
    success = run_loop()
    sys.exit(0 if success else 1)
