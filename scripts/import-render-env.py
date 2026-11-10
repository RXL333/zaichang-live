#!/usr/bin/env python3
"""Import only this site's existing runtime configuration from Render."""

import getpass
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API = "https://api.render.com/v1"
SERVICE_NAME = "zaichang-live"
REQUIRED = (
    "DATABASE_URL",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
)
DESTINATION = Path("/data/zaichang-live/secrets.env")


def get_page(path, token, cursor=None):
    params = {"limit": 100}
    if cursor:
        params["cursor"] = cursor
    request = Request(f"{API}{path}?{urlencode(params)}", headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def get_all(path, token):
    result = []
    cursor = None
    while True:
        page = get_page(path, token, cursor)
        if not isinstance(page, list):
            raise ValueError("Render 返回了无法识别的结果")
        result.extend(page)
        if len(page) < 100:
            return result
        next_cursor = page[-1].get("cursor")
        if not next_cursor or next_cursor == cursor:
            raise ValueError("Render 分页结果不完整")
        cursor = next_cursor


def import_values(token, destination=DESTINATION):
    services = [entry.get("service", {}) for entry in get_all("/services", token)]
    matches = [service for service in services if service.get("name") == SERVICE_NAME]
    if len(matches) != 1:
        raise ValueError("无法唯一找到 zaichang-live 服务，请检查 Render 账号")
    service_id = matches[0].get("id", "")
    if not service_id.startswith("srv-"):
        raise ValueError("Render 服务编号无效")
    entries = get_all(f"/services/{service_id}/env-vars", token)
    values = {entry.get("envVar", {}).get("key"): entry.get("envVar", {}).get("value") for entry in entries}
    missing = [name for name in REQUIRED if not isinstance(values.get(name), str) or not values[name]]
    if missing:
        raise ValueError("服务缺少配置项：" + ", ".join(missing))
    if any("\n" in values[name] or "\r" in values[name] for name in REQUIRED):
        raise ValueError("配置值包含换行，无法安全导入")
    if not values["DATABASE_URL"].startswith("jdbc:postgresql:") or not values["LIVEKIT_URL"].startswith("wss://"):
        raise ValueError("数据库或直播服务地址格式不符合正式环境要求")

    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(destination.parent, 0o700)
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as file:
            for name in REQUIRED:
                file.write(f"{name}={values[name]}\n")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def main():
    if not sys.stdin.isatty():
        raise ValueError("请在云电脑的交互式终端中运行此脚本")
    token = getpass.getpass("粘贴 Render API Key 后按回车（不会显示）：").strip()
    if not token:
        raise ValueError("没有输入 Render API Key")
    try:
        import_values(token)
    finally:
        token = None
    print("服务配置已安全导入。请到 Render 撤销刚才创建的临时 API Key。")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as exc:
        print(f"无法读取 Render 配置（HTTP {exc.code}），请检查 API Key 权限。", file=sys.stderr)
        sys.exit(1)
    except URLError:
        print("无法连接 Render，请稍后重试。", file=sys.stderr)
        sys.exit(1)
    except (ValueError, FileExistsError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
