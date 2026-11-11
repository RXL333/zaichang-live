#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export ZAICHANG_ENV_FILE="${ZAICHANG_ENV_FILE:-/data/zaichang-live/secrets.env}"

if [[ ! -r "$ZAICHANG_ENV_FILE" ]]; then
  printf '缺少服务配置文件：%s\n' "$ZAICHANG_ENV_FILE" >&2
  printf '请先运行 scripts/import-render-env.py，导入现有服务配置。\n' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'Docker 服务不可用，请检查云电脑的 Docker 状态。\n' >&2
  exit 1
fi

cd "$project_dir"
docker compose -f compose.instabox.yaml up -d --build
for attempt in {1..60}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:18080/api/system/status >/dev/null; then
    printf '会议服务已启动。GitHub Pages 可连接这台云电脑。\n'
    exit 0
  fi
  sleep 2
done
printf '服务未在预期时间内就绪，请检查容器日志。\n' >&2
exit 1
